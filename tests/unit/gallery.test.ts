import { describe, expect, it } from "vitest";
import {
  contentDisposition,
  dateRangeBounds,
  galleryHref,
  hasFilters,
  parseGalleryFilters,
  parseThumbnailSize,
  planDownload,
} from "@/lib/domain/gallery";

const CATEGORY = "0b9f6c1e-3a52-4c8e-9d1f-2a6b7c8d9e0f";
const SERVICE = "986a261f-e7e0-4f77-b376-10f477daa7d0";

describe("parseGalleryFilters", () => {
  it("reads valid filters", () => {
    expect(
      parseGalleryFilters({
        category: CATEGORY,
        service: SERVICE,
        from: "2025-05-01",
        to: "2025-05-31",
        page: "3",
      }),
    ).toEqual({
      categoryId: CATEGORY,
      serviceId: SERVICE,
      from: "2025-05-01",
      to: "2025-05-31",
      page: 3,
    });
  });

  it("ignores malformed values instead of failing", () => {
    expect(
      parseGalleryFilters({
        category: "baptism'; drop table uploads;--",
        service: "123",
        from: "May 2025",
        to: "2025-02-31",
        page: "-4",
      }),
    ).toEqual({ categoryId: null, serviceId: null, from: null, to: null, page: 1 });
  });

  it("swaps dates entered the wrong way round", () => {
    const filters = parseGalleryFilters({ from: "2025-05-31", to: "2025-05-01" });
    expect([filters.from, filters.to]).toEqual(["2025-05-01", "2025-05-31"]);
  });

  it("uses the first value when a parameter is repeated", () => {
    expect(parseGalleryFilters({ category: [CATEGORY, "x"] }).categoryId).toBe(CATEGORY);
  });

  it("knows when nothing is filtered", () => {
    expect(hasFilters(parseGalleryFilters({}))).toBe(false);
    expect(hasFilters(parseGalleryFilters({ from: "2025-05-01" }))).toBe(true);
  });
});

describe("dateRangeBounds", () => {
  it("covers whole days in Pacific time", () => {
    // May is PDT (UTC-7).
    expect(dateRangeBounds({ from: "2025-05-01", to: "2025-05-31" })).toEqual({
      startsAtFrom: "2025-05-01T07:00:00.000Z",
      startsAtBefore: "2025-06-01T07:00:00.000Z",
    });
  });

  it("includes an evening service on the last day", () => {
    const { startsAtBefore } = dateRangeBounds({ from: null, to: "2025-05-31" });
    const eveningService = "2025-06-01T02:30:00.000Z"; // 7:30pm on 31 May
    expect(eveningService < (startsAtBefore ?? "")).toBe(true);
  });

  it("handles a range that crosses the end of daylight saving", () => {
    expect(dateRangeBounds({ from: "2025-11-01", to: "2025-11-02" })).toEqual({
      startsAtFrom: "2025-11-01T07:00:00.000Z",
      startsAtBefore: "2025-11-03T08:00:00.000Z",
    });
  });

  it("leaves an open end open", () => {
    expect(dateRangeBounds({ from: null, to: null })).toEqual({
      startsAtFrom: null,
      startsAtBefore: null,
    });
  });
});

describe("galleryHref", () => {
  it("keeps the filters when moving between pages", () => {
    const filters = parseGalleryFilters({ category: CATEGORY, from: "2025-05-01" });
    expect(galleryHref(filters, 2)).toBe(
      `/gallery?category=${CATEGORY}&from=2025-05-01&page=2`,
    );
  });

  it("is the bare path with no filters on page 1", () => {
    expect(galleryHref(parseGalleryFilters({}), 1)).toBe("/gallery");
  });
});

describe("parseThumbnailSize", () => {
  it("only ever returns a size the app serves", () => {
    expect(parseThumbnailSize("1600")).toBe(1600);
    expect(parseThumbnailSize("400")).toBe(400);
    expect(parseThumbnailSize("99999")).toBe(400);
    expect(parseThumbnailSize(null)).toBe(400);
  });
});

describe("contentDisposition", () => {
  it("quotes a simple name", () => {
    expect(contentDisposition("IMG_0001.jpg")).toBe(
      "attachment; filename=\"IMG_0001.jpg\"; filename*=UTF-8''IMG_0001.jpg",
    );
  });

  it("cannot be broken out of with quotes or new lines", () => {
    const header = contentDisposition('a"\r\nSet-Cookie: x=1.jpg');
    expect(header).not.toMatch(/[\r\n]/);
    expect(header.match(/"/g)).toHaveLength(2);
  });

  it("keeps non-English names via the UTF-8 form", () => {
    expect(contentDisposition("Café.jpg")).toContain("filename*=UTF-8''Caf%C3%A9.jpg");
  });
});

describe("downloading a selection", () => {
  const MB = 1024 * 1024;
  const file = (id: string, sizeBytes: number, canDownload = true) => ({ id, sizeBytes, canDownload });

  it("zips photos and leaves out large videos and files that may not be downloaded", () => {
    expect(
      planDownload([file("a", 5 * MB), file("b", 3 * MB), file("video", 400 * MB), file("c", 1 * MB, false)]),
    ).toEqual({ include: ["a", "b"], totalBytes: 8 * MB, tooLarge: 1, notAllowed: 1, overLimit: false });
  });

  it("says when the selection is too big for one zip", () => {
    const many = Array.from({ length: 30 }, (_, index) => file(String(index), 40 * MB));
    expect(planDownload(many).overLimit).toBe(true);
  });
});
