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
 * Sends the browser to Google's preview image for a Drive file. Returns a 404
 * when Google has no preview (yet).
 *
 * The image itself comes straight from Google, not through this server:
 * Google's thumbnail link is pre-signed and short-lived, so passing the bytes
 * through Vercel only spent the hosting allowance (it was most of it).
 *
 * The caller must already have checked that whoever is asking may see the
 * file: this function does no access control.
 */
export async function thumbnailResponse(
  driveFileId: string,
  size: ThumbnailSize,
  account: DriveAccount,
): Promise<Response> {
  try {
    const link = await thumbnailLinkFor(driveFileId, account);
    // Google takes a little while to make previews for new uploads.
    if (!link) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });

    return new Response(null, {
      status: 302,
      headers: {
        Location: sizedThumbnailLink(link, size),
        // "private": who may see an image depends on who is asking. Shorter
        // than Google's link lives, so the browser never follows a dead one.
        "Cache-Control": "private, max-age=600",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (error) {
    console.error("Thumbnail failed", error);
    return new Response(null, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
