import "server-only";

import { driveAccountForService, getDriveSession } from "@/lib/google/connection";
import { DriveError, moveFile, moveToBin } from "@/lib/google/drive";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureServiceFolders } from "./folders";

export type MergeResult = { ok: true; moved: number } | { ok: false; error: string };

/**
 * Merges a duplicate service into another: its photos and videos move into
 * the kept service's Drive folders, then its assignments, share links and
 * regions join the kept one (merge_service_records) and it is deleted.
 *
 * The caller must already have checked that the person runs both services'
 * regions. Each file's record is moved as soon as the file itself has moved,
 * so if Drive stops halfway, records and files still agree and the merge can
 * simply be run again.
 */
export async function mergeServices(keepId: string, mergeId: string): Promise<MergeResult> {
  if (keepId === mergeId) return { ok: false, error: "Choose a different service to merge in." };
  const admin = createAdminClient();

  const [{ data: keep }, { data: extra }] = await Promise.all([
    admin.from("services").select("id, drive_folder_id").eq("id", keepId).maybeSingle(),
    admin.from("services").select("id, drive_folder_id").eq("id", mergeId).maybeSingle(),
  ]);
  if (!keep || !extra) return { ok: false, error: "One of the services no longer exists." };

  const { data: files } = await admin
    .from("uploads")
    .select("id, category_id, drive_file_id")
    .eq("service_id", mergeId)
    .not("drive_file_id", "is", null);
  let moved = 0;

  if ((files ?? []).length > 0) {
    // The kept service needs its folders before anything can move into them.
    const folders = await ensureServiceFolders(admin, keepId);
    if (!folders.ok) return { ok: false, error: folders.message };

    const [keepAccount, extraAccount] = await Promise.all([
      driveAccountForService(keepId),
      driveAccountForService(mergeId),
    ]);
    if (keepAccount !== extraAccount) {
      return {
        ok: false,
        error:
          "These two services keep their files in different Google accounts, and Drive cannot move files between accounts.",
      };
    }

    const { data: folderRows } = await admin
      .from("service_folders")
      .select("service_id, category_id, drive_folder_id")
      .in("service_id", [keepId, mergeId]);
    const folderFor = (serviceId: string, categoryId: string) =>
      (folderRows ?? []).find((row) => row.service_id === serviceId && row.category_id === categoryId)
        ?.drive_folder_id;

    const { accessToken } = await getDriveSession(keepAccount);
    for (const file of files ?? []) {
      const target = folderFor(keepId, file.category_id);
      if (!target || !file.drive_file_id) continue;
      try {
        await moveFile(accessToken, file.drive_file_id, folderFor(mergeId, file.category_id) ?? "", target);
      } catch (error) {
        // Already deleted in Drive: the record still moves.
        if (!(error instanceof DriveError && error.status === 404)) {
          console.error("Moving a file while merging failed", error);
          return {
            ok: false,
            error: `Google Drive stopped after ${moved} ${moved === 1 ? "file" : "files"}. Nothing is lost: run the merge again to finish.`,
          };
        }
      }
      await admin.from("uploads").update({ service_id: keepId }).eq("id", file.id);
      moved += 1;
    }
  }

  const { error } = await admin.rpc("merge_service_records", { p_keep: keepId, p_merge: mergeId });
  if (error) {
    console.error("Merging service records failed", error.message);
    return { ok: false, error: "Could not finish the merge. Try again." };
  }

  // The duplicate's folder is empty now; to the Drive bin with it.
  if (extra.drive_folder_id) {
    try {
      const { accessToken } = await getDriveSession(await driveAccountForService(keepId));
      await moveToBin(accessToken, extra.drive_folder_id);
    } catch (error) {
      console.error("Binning the merged service's folder failed", error);
    }
  }
  return { ok: true, moved };
}
