import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getDriveSession, type DriveAccount } from "./connection";
import { grantReader, removePermission } from "./drive";

/**
 * Makes sure a person's own Google account can read one category folder in
 * Drive, so they can play or download its large files there.
 *
 * Call this only after checking the person is allowed to see that category.
 */
export async function ensureFolderGrant(
  profile: { id: string; email: string },
  driveFolderId: string,
  account: DriveAccount,
): Promise<void> {
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("drive_grants")
    .select("revoke_requested_at")
    .eq("profile_id", profile.id)
    .eq("drive_folder_id", driveFolderId)
    .maybeSingle();

  if (existing && !existing.revoke_requested_at) return;

  const { accessToken } = await getDriveSession(account);
  // Granting again for the same account is harmless: Google returns the
  // existing permission.
  const permissionId = await grantReader(accessToken, driveFolderId, profile.email);

  const { error } = await admin.from("drive_grants").upsert({
    profile_id: profile.id,
    drive_folder_id: driveFolderId,
    permission_id: permissionId,
    revoke_requested_at: null,
    drive_region_id: account,
  });
  if (error) throw new Error(`Could not record Drive access: ${error.message}`);
}

/**
 * Takes away every Drive folder a person was given. Called whenever their
 * role, team or access changes; anything they are still entitled to is granted
 * again the next time they open it.
 *
 * Each grant is first marked for removal, then removed. If Google cannot be
 * reached the mark stays, so the scheduled job can finish the removal later.
 */
export async function revokeDriveGrants(profileId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: grants } = await admin
    .from("drive_grants")
    .update({ revoke_requested_at: new Date().toISOString() })
    .eq("profile_id", profileId)
    .select("drive_folder_id, permission_id, drive_region_id");
  if (!grants || grants.length === 0) return;

  try {
    await Promise.all(
      grants.map(async (grant) => {
        const { accessToken } = await getDriveSession(grant.drive_region_id);
        await removePermission(accessToken, grant.drive_folder_id, grant.permission_id);
        await admin
          .from("drive_grants")
          .delete()
          .eq("profile_id", profileId)
          .eq("drive_folder_id", grant.drive_folder_id);
      }),
    );
  } catch (error) {
    console.error(`Removing Drive access for ${profileId} did not finish`, error);
  }
}

/**
 * Finishes any Drive access removals that could not be completed earlier
 * (Google was unreachable at the time). Returns how many were removed.
 */
export async function retryPendingRevocations(): Promise<number> {
  const admin = createAdminClient();
  const { data: pending } = await admin
    .from("drive_grants")
    .select("profile_id, drive_folder_id, permission_id, drive_region_id")
    .not("revoke_requested_at", "is", null)
    .limit(100);
  if (!pending || pending.length === 0) return 0;

  let removed = 0;
  for (const grant of pending) {
    try {
      const { accessToken } = await getDriveSession(grant.drive_region_id);
      await removePermission(accessToken, grant.drive_folder_id, grant.permission_id);
      await admin
        .from("drive_grants")
        .delete()
        .eq("profile_id", grant.profile_id)
        .eq("drive_folder_id", grant.drive_folder_id);
      removed += 1;
    } catch (error) {
      console.error("Removing Drive access still failing", error);
    }
  }
  return removed;
}
