import "server-only";

import { shareStatus } from "@/lib/domain/share";
import { getDriveSession, type DriveAccount } from "@/lib/google/connection";
import { grantAnyoneWithLink, removePermission } from "@/lib/google/drive";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Large videos are opened in Google Drive. A visitor on a share link has no
 * account to give access to, so that one file is made viewable by anyone with
 * its Drive link. This records each time it happens and undoes it later.
 */
export async function ensurePublicFile(
  shareId: string,
  driveFileId: string,
  account: DriveAccount,
): Promise<void> {
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("share_file_grants")
    .select("drive_file_id")
    .eq("drive_file_id", driveFileId)
    .maybeSingle();
  if (existing) return;

  const { accessToken } = await getDriveSession(account);
  const permissionId = await grantAnyoneWithLink(accessToken, driveFileId);
  await admin.from("share_file_grants").upsert({
    drive_file_id: driveFileId,
    permission_id: permissionId,
    share_link_id: shareId,
    drive_region_id: account,
  });
}

/**
 * Makes files private again for one link, or (with no link given) for every
 * link that has expired or been turned off. Returns how many were made
 * private. A file another working link also needs is opened again the next
 * time someone asks for it through that link.
 */
export async function closePublicFiles(shareId?: string): Promise<number> {
  const admin = createAdminClient();

  let shareIds: string[];
  if (shareId) {
    shareIds = [shareId];
  } else {
    const { data: links } = await admin
      .from("share_links")
      .select("id, expires_at, revoked_at");
    const now = new Date();
    shareIds = (links ?? [])
      .filter(
        (link) =>
          shareStatus({ expiresAt: link.expires_at, revokedAt: link.revoked_at }, now) !==
          "active",
      )
      .map((link) => link.id);
  }
  if (shareIds.length === 0) return 0;

  const { data: grants } = await admin
    .from("share_file_grants")
    .select("drive_file_id, permission_id, drive_region_id")
    .in("share_link_id", shareIds)
    .limit(200);
  if (!grants || grants.length === 0) return 0;

  let closed = 0;
  for (const grant of grants) {
    try {
      const { accessToken } = await getDriveSession(grant.drive_region_id);
      await removePermission(accessToken, grant.drive_file_id, grant.permission_id);
      await admin.from("share_file_grants").delete().eq("drive_file_id", grant.drive_file_id);
      closed += 1;
    } catch (error) {
      // Left in the table, so the scheduled job tries again.
      console.error("Could not make a shared file private again", error);
    }
  }
  return closed;
}
