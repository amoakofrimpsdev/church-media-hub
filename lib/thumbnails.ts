import "server-only";

import type { ThumbnailSize } from "@/lib/domain/gallery";
import { getDriveSession, type DriveAccount } from "@/lib/google/connection";
import { getThumbnailLink, sizedThumbnailLink } from "@/lib/google/drive";

// Google's thumbnail links stay valid for a while. Remembering them briefly
// saves a Drive call when the grid image and the full-size view of the same
// photo are requested close together.
const LINK_TTL_MS = 10 * 60 * 1000;
const LINK_CACHE_MAX = 1000;
const linkCache = new Map<string, { link: string; expiresAt: number }>();

async function thumbnailLinkFor(
  driveFileId: string,
  account: DriveAccount,
): Promise<string | null> {
  const cached = linkCache.get(driveFileId);
  if (cached && cached.expiresAt > Date.now()) return cached.link;

  const { accessToken } = await getDriveSession(account);
  const link = await getThumbnailLink(accessToken, driveFileId);
  if (link) {
    if (linkCache.size >= LINK_CACHE_MAX) linkCache.clear();
    linkCache.set(driveFileId, { link, expiresAt: Date.now() + LINK_TTL_MS });
  }
  return link;
}

/**
 * Fetches a preview image for a Drive file and wraps it as a response for the
 * browser. Returns a 404 when Google has no preview (yet).
 *
 * The caller must already have checked that whoever is asking may see the
 * file: this function does no access control.
 */
export async function thumbnailResponse(
  driveFileId: string,
  size: ThumbnailSize,
  account: DriveAccount,
): Promise<Response> {
  const notFound = () =>
    new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });

  try {
    const link = await thumbnailLinkFor(driveFileId, account);
    // Google takes a little while to make previews for new uploads.
    if (!link) return notFound();

    const image = await fetch(sizedThumbnailLink(link, size), { cache: "no-store" });
    if (!image.ok || !image.body) {
      linkCache.delete(driveFileId);
      return notFound();
    }
    return new Response(image.body, {
      headers: {
        "Content-Type": image.headers.get("content-type") ?? "image/jpeg",
        // "private": cache in this person's browser only, never on a shared
        // CDN, because who may see an image depends on who is asking.
        "Cache-Control": "private, max-age=86400, stale-while-revalidate=604800",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (error) {
    console.error("Thumbnail failed", error);
    return new Response(null, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
