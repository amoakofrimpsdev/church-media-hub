import { NextResponse, type NextRequest } from "next/server";
import { checkUpload } from "@/lib/domain/uploads";
import {
  driveAccountForService,
  getDriveSession,
  markGoogleConnectionExpired,
} from "@/lib/google/connection";
import { startResumableUpload } from "@/lib/google/drive";
import { GoogleConnectionExpiredError } from "@/lib/google/oauth";
import { createClient } from "@/lib/supabase/server";
import {
  isUuid,
  readJson,
  requireUploader,
  uploadError,
  uploadFailure,
} from "@/lib/uploads/api";

/**
 * Step 1 of an upload. The server starts the upload with the church account's
 * token and hands the browser a one-file session link. The file's bytes then go
 * straight from the phone to Google, never through this server.
 */
export async function POST(request: NextRequest) {
  const auth = await requireUploader(request);
  if ("response" in auth) return auth.response;

  const body = await readJson(request);
  if (!body || !isUuid(body.serviceId) || !isUuid(body.categoryId)) {
    return uploadError(400, "bad_request", "Missing service or category.");
  }
  const check = checkUpload({
    name: typeof body.fileName === "string" ? body.fileName : "",
    type: typeof body.mimeType === "string" ? body.mimeType : "",
    size: typeof body.size === "number" ? body.size : 0,
  });
  if (!check.ok) return uploadError(400, "bad_request", check.error);
  const size = body.size as number;

  const supabase = await createClient();
  const { data: folder } = await supabase
    .from("service_folders")
    .select("drive_folder_id")
    .eq("service_id", body.serviceId)
    .eq("category_id", body.categoryId)
    .maybeSingle();
  if (!folder) {
    return uploadError(
      409,
      "folders_not_ready",
      "This category has no Drive folder yet. Ask an admin to create the folders on the service page.",
    );
  }

  const account = await driveAccountForService(body.serviceId);
  try {
    const { accessToken } = await getDriveSession(account);
    const sessionUrl = await startResumableUpload(
      accessToken,
      {
        name: check.fileName,
        mimeType: check.mimeType,
        size,
        parentId: folder.drive_folder_id,
      },
      request.nextUrl.origin,
    );

    const { data: upload, error } = await supabase
      .from("uploads")
      .insert({
        service_id: body.serviceId,
        category_id: body.categoryId,
        uploaded_by: auth.profile.id,
        file_name: check.fileName,
        mime_type: check.mimeType,
        size_bytes: size,
      })
      .select("id")
      .single();
    if (error || !upload) throw new Error(error?.message ?? "insert failed");

    return NextResponse.json({ uploadId: upload.id, sessionUrl });
  } catch (error) {
    if (error instanceof GoogleConnectionExpiredError) {
      await markGoogleConnectionExpired("Google rejected the saved sign-in.", account);
    }
    return uploadFailure(error);
  }
}
