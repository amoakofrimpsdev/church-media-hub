import { churchLocalToUtc } from "./time";

/** Files this size or smaller are downloaded through the app; larger ones open in Drive. */
export const DIRECT_DOWNLOAD_MAX_BYTES = 50 * 1024 * 1024;

export const GALLERY_PAGE_SIZE = 60;

/** Thumbnail sizes the app will serve (longest edge, pixels). */
export const THUMBNAIL_SIZES = [400, 1600] as const;
export type ThumbnailSize = (typeof THUMBNAIL_SIZES)[number];

export function parseThumbnailSize(value: string | null): ThumbnailSize {
  return value === "1600" ? 1600 : 400;
}

export type GalleryFilters = {
  categoryId: string | null;
  serviceId: string | null;
  /** First day to include, "YYYY-MM-DD" in the church's time zone. */
  from: string | null;
  /** Last day to include. */
  to: string | null;
  page: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

type RawParams = Record<string, string | string[] | undefined>;

function single(params: RawParams, key: string): string {
  const value = params[key];
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

/** Reads search filters from the URL, ignoring anything malformed. */
export function parseGalleryFilters(params: RawParams): GalleryFilters {
  const category = single(params, "category");
  const service = single(params, "service");
  let from: string | null = single(params, "from");
  let to: string | null = single(params, "to");
  from = ISO_DATE.test(from) && churchLocalToUtc(from, "00:00") ? from : null;
  to = ISO_DATE.test(to) && churchLocalToUtc(to, "00:00") ? to : null;
  // Entered the wrong way round: swap rather than return nothing.
  if (from && to && from > to) [from, to] = [to, from];

  const page = Number.parseInt(single(params, "page"), 10);
  return {
    categoryId: UUID.test(category) ? category : null,
    serviceId: UUID.test(service) ? service : null,
    from,
    to,
    page: Number.isSafeInteger(page) && page > 1 ? page : 1,
  };
}

export function hasFilters(filters: GalleryFilters): boolean {
  return Boolean(
    filters.categoryId || filters.serviceId || filters.from || filters.to,
  );
}

/**
 * The UTC instants a day range covers in the church's time zone: from the
 * start of the first day up to (not including) the start of the day after the
 * last. So "to: 31 May" includes an evening service on 31 May.
 */
export function dateRangeBounds(filters: Pick<GalleryFilters, "from" | "to">): {
  startsAtFrom: string | null;
  startsAtBefore: string | null;
} {
  const start = filters.from ? churchLocalToUtc(filters.from, "00:00") : null;

  let end: Date | null = null;
  if (filters.to) {
    const day = new Date(`${filters.to}T00:00:00Z`);
    day.setUTCDate(day.getUTCDate() + 1);
    end = churchLocalToUtc(day.toISOString().slice(0, 10), "00:00");
  }
  return {
    startsAtFrom: start?.toISOString() ?? null,
    startsAtBefore: end?.toISOString() ?? null,
  };
}

/** Builds a gallery URL that keeps the current filters. */
export function galleryHref(filters: GalleryFilters, page: number): string {
  const params = new URLSearchParams();
  if (filters.categoryId) params.set("category", filters.categoryId);
  if (filters.serviceId) params.set("service", filters.serviceId);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/gallery?${query}` : "/gallery";
}

/** A safe name for the Content-Disposition header of a download. */
export function contentDisposition(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

/**
 * The most one "Download selected" zip may hold. The zip is built in the
 * browser's memory, and phones run out well before computers do.
 */
export const ZIP_MAX_BYTES = 1024 * 1024 * 1024;

export type DownloadPlan = {
  /** IDs of the files that go into the zip. */
  include: string[];
  totalBytes: number;
  /** Large files (videos) that open in Google Drive instead. */
  tooLarge: number;
  /** Files the person may look at but not download. */
  notAllowed: number;
  /** True when the rest is still too big for one zip. */
  overLimit: boolean;
};

/** What a "Download selected" would contain. */
export function planDownload(
  items: { id: string; sizeBytes: number; canDownload: boolean }[],
): DownloadPlan {
  let totalBytes = 0;
  let tooLarge = 0;
  let notAllowed = 0;
  const include: string[] = [];
  for (const item of items) {
    if (!item.canDownload) notAllowed += 1;
    else if (item.sizeBytes > DIRECT_DOWNLOAD_MAX_BYTES) tooLarge += 1;
    else {
      include.push(item.id);
      totalBytes += item.sizeBytes;
    }
  }
  return { include, totalBytes, tooLarge, notAllowed, overLimit: totalBytes > ZIP_MAX_BYTES };
}
