import "server-only";

import { looksLikeToken, shareStatus, uploadInScope } from "@/lib/domain/share";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ShareLink } from "@/lib/supabase/database.types";

/**
 * Everything a share link's visitor is served goes through here. Visitors
 * have no account, so these functions use the secret key, which skips Row
 * Level Security. The link's scope is therefore enforced in this file, and
 * nowhere else: `findActiveShare` decides whether the link works, and
 * `findSharedUpload` decides whether one file is covered by it.
 */

/** The link for a token, if it exists and is neither expired nor turned off. */
export async function findActiveShare(token: string): Promise<ShareLink | null> {
  if (!looksLikeToken(token)) return null;
  try {
    const { data } = await createAdminClient()
      .from("share_links")
      .select("*")
      .eq("token", token)
      .maybeSingle();
    if (!data) return null;
    return shareStatus(
      { expiresAt: data.expires_at, revokedAt: data.revoked_at },
      new Date(),
    ) === "active"
      ? data
      : null;
  } catch {
    // An unreachable database must look like "no such link", not an error page
    // that hints at what exists.
    return null;
  }
}

export type SharedUpload = {
  id: string;
  driveFileId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** Which Google account holds it. */
  driveAccount: string | null;
};

/** One finished upload, only if this link covers it. */
export async function findSharedUpload(
  share: ShareLink,
  uploadId: string,
): Promise<SharedUpload | null> {
  const { data } = await createAdminClient()
    .from("uploads")
    .select(
      "id, drive_file_id, file_name, mime_type, size_bytes, service_id, category_id, services!inner(region_id, drive_region_id)",
    )
    .eq("id", uploadId)
    .eq("status", "complete")
    .maybeSingle();
  if (!data?.drive_file_id) return null;

  const covered = uploadInScope(
    { serviceId: data.service_id, categoryId: data.category_id, regionId: data.services.region_id },
    { serviceId: share.service_id, categoryId: share.category_id, regionId: share.region_id },
  );
  if (!covered) return null;

  return {
    id: data.id,
    driveFileId: data.drive_file_id,
    fileName: data.file_name,
    mimeType: data.mime_type,
    sizeBytes: data.size_bytes,
    driveAccount: data.services.drive_region_id,
  };
}
