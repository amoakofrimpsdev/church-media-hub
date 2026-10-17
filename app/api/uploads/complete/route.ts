import { after, NextResponse, type NextRequest } from "next/server";
import {
  driveAccountForService,
  getDriveSession,
  markGoogleConnectionExpired,
} from "@/lib/google/connection";
import { getFile } from "@/lib/google/drive";
import { GoogleConnectionExpiredError } from "@/lib/google/oauth";
import { sendDueNotifications } from "@/lib/notifications/telegram";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  isUuid,
  readJson,
  requireUploader,
  uploadError,
  uploadFailure,
} from "@/lib/uploads/api";

const UNIQUE_VIOLATION = "23505";

/**
 * Step 3 of an upload. The browser says "Google gave me file X". We do not
 * take its word for it: we ask Google whether X exists in the folder this
 * upload was meant for, and only then mark the upload complete.
 */
export async function POST(request: NextRequest) {
  const auth = await requireUploader(request);
  if ("response" in auth) return auth.response;

  const body = await readJson(request);
  const driveFileId = body?.driveFileId;
  if (
    !body ||
    !isUuid(body.uploadId) ||
    typeof driveFileId !== "string" ||
    !/^[A-Za-z0-9_-]{10,200}$/.test(driveFileId)
  ) {
    return uploadError(400, "bad_request", "Invalid upload.");
  }

  const supabase = await createClient();
  const { data: upload } = await supabase
    .from("uploads")
    .select("id, service_id, category_id, uploaded_by, status, drive_file_id")
    .eq("id", body.uploadId)
    .maybeSingle();
  if (!upload || upload.uploaded_by !== auth.profile.id) {
    return uploadError(404, "not_found", "Upload not found.");
  }
  // Already recorded, for example the browser retried after a lost reply.
  if (upload.status === "complete") {
    return upload.drive_file_id === driveFileId
      ? NextResponse.json({ ok: true })
      : uploadError(400, "bad_request", "Invalid upload.");
  }

  const { data: folder } = await supabase
    .from("service_folders")
    .select("drive_folder_id")
    .eq("service_id", upload.service_id)
    .eq("category_id", upload.category_id)
    .maybeSingle();
  if (!folder) {
    return uploadError(409, "folders_not_ready", "This category has no Drive folder.");
  }

  const account = await driveAccountForService(upload.service_id);
  try {
    const { accessToken } = await getDriveSession(account);
    const file = await getFile(accessToken, driveFileId);
    if (
      !file ||
      file.trashed ||
      file.size <= 0 ||
      !file.parents.includes(folder.drive_folder_id)
    ) {
      return uploadError(400, "bad_request", "Google has no such file in this folder.");
    }

    // Signed-in users cannot update uploads, so this uses the secret key.
    const { error } = await createAdminClient()
      .from("uploads")
      .update({
        drive_file_id: file.id,
        size_bytes: file.size,
        status: "complete",
        completed_at: new Date().toISOString(),
      })
      .eq("id", upload.id)
      .eq("status", "uploading");
    if (error) {
      // The same Drive file is already recorded against another upload.
      if (error.code === UNIQUE_VIOLATION) {
        return uploadError(400, "bad_request", "That file is already recorded.");
      }
      throw new Error(error.message);
    }
    // A first upload can make a category ready for its team.
    after(() => sendDueNotifications());
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof GoogleConnectionExpiredError) {
      await markGoogleConnectionExpired("Google rejected the saved sign-in.", account);
    }
    return uploadFailure(error);
  }
}
