import { type NextRequest } from "next/server";
import { getProfile } from "@/lib/auth";
import { parseThumbnailSize } from "@/lib/domain/gallery";
import { createClient } from "@/lib/supabase/server";
import { thumbnailResponse } from "@/lib/thumbnails";
import { isUuid } from "@/lib/uploads/api";

const notFound = () =>
  new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });

/**
 * Serves a photo or video preview image. Drive files are private, so the
 * browser cannot load them from Google directly; it asks here, and we check
 * the person may see that upload before fetching the image for them.
 */
export async function GET(
  request: NextRequest,
  { params }: RouteContext<"/api/thumb/[uploadId]">,
) {
  const { uploadId } = await params;
  if (!isUuid(uploadId)) return notFound();
  if (!(await getProfile())) return new Response(null, { status: 401 });

  // Queried as the signed-in user: Row Level Security returns nothing for an
  // upload they are not allowed to see, which becomes a 404 here.
  const supabase = await createClient();
  const { data: upload } = await supabase
    .from("uploads")
    .select("drive_file_id, services!inner(drive_region_id)")
    .eq("id", uploadId)
    .eq("status", "complete")
    .maybeSingle();
  if (!upload?.drive_file_id) return notFound();

  return thumbnailResponse(
    upload.drive_file_id,
    parseThumbnailSize(request.nextUrl.searchParams.get("size")),
    upload.services.drive_region_id,
  );
}
