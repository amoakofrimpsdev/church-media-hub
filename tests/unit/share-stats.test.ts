import { describe, expect, it } from "vitest";
import { viewSummary } from "@/lib/domain/share";

describe("the share link stats line", () => {
  it("says when nobody has opened it", () => {
    expect(viewSummary({ viewCount: 0, visitorCount: 0, downloadCount: 0 })).toBe(
      "Not opened yet",
    );
  });

  it("gives people, visits and downloads", () => {
    expect(viewSummary({ viewCount: 11, visitorCount: 3, downloadCount: 24 })).toBe(
      "3 people · 11 visits · 24 downloads",
    );
    expect(viewSummary({ viewCount: 1, visitorCount: 1, downloadCount: 1 })).toBe(
      "1 person · 1 visit · 1 download",
    );
  });

  it("leaves out people for links opened before visitors were counted", () => {
    expect(viewSummary({ viewCount: 7, visitorCount: 0, downloadCount: 0 })).toBe("7 visits");
  });
});
