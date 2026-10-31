import { describe, expect, it } from "vitest";
import { countsFor, roleFits, routeService, type RoutedGroup } from "@/lib/domain/telegram-groups";

const photos: RoutedGroup = { chatId: 1, media: "photos", handoffAlerts: false };
const videos: RoutedGroup = { chatId: 2, media: "videos", handoffAlerts: false };
const insta: RoutedGroup = { chatId: 3, media: "all", handoffAlerts: true };
const ocGroup: RoutedGroup = { chatId: 4, media: "all", handoffAlerts: true };

const groupsOf = (regionId: string) =>
  regionId === "congregational" ? [photos, videos, insta] : regionId === "oc" ? [ocGroup] : [];

describe("which groups get a message", () => {
  const service = { region_id: "congregational", shared_region_ids: [] };

  it("sends upload links, reminders and lists to every group of the region", () => {
    expect(routeService(groupsOf, service, "media").map((target) => target.group.chatId)).toEqual([1, 2, 3]);
  });

  it("sends handoff alerts only where they are switched on", () => {
    expect(routeService(groupsOf, service, "handoffs").map((target) => target.group.chatId)).toEqual([3]);
  });

  it("keeps the first group's key as it always was, and the others apart", () => {
    expect(routeService(groupsOf, service, "media").map((target) => target.suffix)).toEqual(["", ":2", ":3"]);
  });

  it("adds the groups of the other regions a joint service is for, each once", () => {
    const joint = { region_id: "congregational", shared_region_ids: ["oc", "congregational"] };
    expect(routeService(groupsOf, joint, "media").map((target) => target.group.chatId)).toEqual([1, 2, 3, 4]);
  });

  it("sends nothing for a region with nowhere to post", () => {
    expect(routeService(groupsOf, { region_id: "west", shared_region_ids: [] }, "media")).toEqual([]);
  });
});

describe("who is tagged in which group", () => {
  it("puts photographers in the photography group and videographers in the video group", () => {
    expect(roleFits("photos", photos)).toBe(true);
    expect(roleFits("videos", photos)).toBe(false);
    expect(roleFits("videos", videos)).toBe(true);
    expect(roleFits("photos", videos)).toBe(false);
  });

  it("puts roles without a kind (editors) and everyone in an everything group", () => {
    expect(roleFits(null, photos)).toBe(true);
    expect(roleFits(null, videos)).toBe(true);
    expect(roleFits("photos", insta)).toBe(true);
  });

  it("counts only photos for a photography group and only videos for a video group", () => {
    expect(countsFor("photos", 24, 3)).toEqual({ photos: 24, videos: 0 });
    expect(countsFor("videos", 24, 3)).toEqual({ photos: 0, videos: 3 });
    expect(countsFor("all", 24, 3)).toEqual({ photos: 24, videos: 3 });
  });
});
