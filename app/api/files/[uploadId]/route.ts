import { NextResponse, type NextRequest } from "next/server";
import { getProfile } from "@/lib/auth";
import {
  contentDisposition,
  DIRECT_DOWNLOAD_MAX_BYTES,
} from "@/lib/domain/gallery";
import {
  getDriveSession,
  GoogleNotConnectedError,
} from "@/lib/google/connection";
import { downloadFile } from "@/lib/google/drive";
import { ensureFolderGrant } from "@/lib/google/grants";
import { driveFileViewUrl } from "@/lib/google/links";
import { GoogleConnectionExpiredError } from "@/lib/google/oauth";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/uploads/api";

const plain = (status: number, message: string) =>
  new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });

/**
 * Opens an original file.
 *
 * Photos and other small files are streamed through the app as a download.
 * Large files (videos) would use up the free hosting allowance, so for those
 * the person's own Google account is given read access to that category's
 * Drive folder and they are sent to Google Drive to play or download it.
 *
 * ?as=view always opens in Drive (used for playing videos).
 */
export async function GET(
  request: NextRequest,
  { params }: RouteContext<"/api/files/[uploadId]">,
) {
  const { uploadId } = await params;
  if (!isUuid(uploadId)) return plain(404, "File not found.");

  const profile = await getProfile();
  if (!profile) {
    return NextResponse.redirect(new URL("/login", request.nextUrl.origin));
  }

  // Row Level Security decides whether this person may see the upload.
  const supabase = await createClient();
  const { data: upload } = await supabase
    .from("uploads")
    .select(
      "drive_file_id, file_name, mime_type, size_bytes, service_id, category_id, services!inner(drive_region_id)",
    )
    .eq("id", uploadId)
    .eq("status", "complete")
    .maybeSingle();
  if (!upload?.drive_file_id) return plain(404, "File not found.");

  const openInDrive =
    request.nextUrl.searchParams.get("as") === "view" ||
    upload.size_bytes > DIRECT_DOWNLOAD_MAX_BYTES;

  try {
    if (openInDrive) {
      const { data: folder } = await supabase
        .from("service_folders")
        .select("drive_folder_id")
        .eq("service_id", upload.service_id)
        .eq("category_id", upload.category_id)
        .maybeSingle();
      if (!folder) return plain(404, "File not found.");

      await ensureFolderGrant(profile, folder.drive_folder_id, upload.services.drive_region_id);
      return NextResponse.redirect(driveFileViewUrl(upload.drive_file_id));
    }

    const { accessToken } = await getDriveSession(upload.services.drive_region_id);
    const file = await downloadFile(accessToken, upload.drive_file_id);
    return new Response(file.body, {
      headers: {
        "Content-Type": upload.mime_type,
        "Content-Length": file.headers.get("content-length") ?? String(upload.size_bytes),
        "Content-Disposition": contentDisposition(upload.file_name),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (
      error instanceof GoogleNotConnectedError ||
      error instanceof GoogleConnectionExpiredError
    ) {
      return plain(
        503,
        "The Google account for this service needs to be reconnected by an admin before files can be opened.",
      );
    }
    console.error("Opening a file failed", error);
    return plain(502, "Google Drive did not respond. Try again in a minute.");
  }
}
