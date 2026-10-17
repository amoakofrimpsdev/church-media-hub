import { type NextRequest } from "next/server";
import { parseThumbnailSize } from "@/lib/domain/gallery";
import { findActiveShare, findSharedUpload } from "@/lib/share/server";
import { thumbnailResponse } from "@/lib/thumbnails";
import { isUuid } from "@/lib/uploads/api";

const notFound = () =>
  new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });

/**
 * A preview image for someone viewing a share link. No sign-in: the token in
 * the address is the permission, and the file must be one the link covers.
 * Anything else is a plain 404, which reveals nothing about what exists.
 */
export async function GET(
  request: NextRequest,
  { params }: RouteContext<"/api/share/[token]/thumb/[uploadId]">,
) {
  const { token, uploadId } = await params;
  if (!isUuid(uploadId)) return notFound();

  const share = await findActiveShare(token);
  if (!share) return notFound();
  const upload = await findSharedUpload(share, uploadId);
  if (!upload) return notFound();

  return thumbnailResponse(
    upload.driveFileId,
    parseThumbnailSize(request.nextUrl.searchParams.get("size")),
    upload.driveAccount,
  );
}
