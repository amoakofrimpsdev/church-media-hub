import { after, NextResponse, type NextRequest } from "next/server";
import { contentDisposition, DIRECT_DOWNLOAD_MAX_BYTES } from "@/lib/domain/gallery";
import { getDriveSession } from "@/lib/google/connection";
import { downloadFile } from "@/lib/google/drive";
import { driveFileViewUrl } from "@/lib/google/links";
import { ensurePublicFile } from "@/lib/share/drive";
import { findActiveShare, findSharedUpload } from "@/lib/share/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/uploads/api";

const plain = (status: number, message: string) =>
  new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });

/**
 * An original file for someone viewing a share link.
 *
 * Photos and other small files are streamed as a download. Large files
 * (videos) would use up the free hosting allowance, so that one file is made
 * viewable by anyone with its Google Drive link and the visitor is sent there.
 * That is undone when the share link expires or is turned off.
 */
export async function GET(
  _request: NextRequest,
  { params }: RouteContext<"/api/share/[token]/file/[uploadId]">,
) {
  const { token, uploadId } = await params;
  if (!isUuid(uploadId)) return plain(404, "Not found.");

  const share = await findActiveShare(token);
  if (!share) return plain(404, "This link is no longer available.");
  if (!share.allow_download) return plain(403, "Downloads are turned off for this link.");

  const upload = await findSharedUpload(share, uploadId);
  if (!upload) return plain(404, "Not found.");

  // Count it for the admin's "downloads", without holding up the file.
  after(async () => {
    await createAdminClient().rpc("record_share_download", { p_share_id: share.id });
  });

  try {
    if (upload.sizeBytes > DIRECT_DOWNLOAD_MAX_BYTES) {
      await ensurePublicFile(share.id, upload.driveFileId, upload.driveAccount);
      const redirect = NextResponse.redirect(driveFileViewUrl(upload.driveFileId));
      // Keep the share link's address out of what Google is told.
      redirect.headers.set("Referrer-Policy", "no-referrer");
      return redirect;
    }

    const { accessToken } = await getDriveSession(upload.driveAccount);
    const file = await downloadFile(accessToken, upload.driveFileId);
    return new Response(file.body, {
      headers: {
        "Content-Type": upload.mimeType,
        "Content-Length": file.headers.get("content-length") ?? String(upload.sizeBytes),
        "Content-Disposition": contentDisposition(upload.fileName),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Opening a shared file failed", error);
    return plain(502, "Could not open this file right now. Try again in a minute.");
  }
}
