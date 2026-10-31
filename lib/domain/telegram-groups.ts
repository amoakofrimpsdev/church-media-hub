/**
 * Which Telegram groups a message goes to, and who is tagged in each. Pure,
 * so the routing can be tested without Telegram.
 */

export type GroupMedia = "all" | "photos" | "videos";

export type RoutedGroup = {
  chatId: number;
  media: GroupMedia;
  handoffAlerts: boolean;
};

/**
 * The groups a service's posts go to: its main region's groups, then those
 * of the other regions a joint service is for, each chat once. "media" posts
 * (upload link, reminders, uploads list) go to every group; "handoffs" only to
 * groups with handoff alerts on. The very first group's key suffix is "", so
 * "send once" keys from before groups existed still count.
 */
export function routeService<G extends RoutedGroup>(
  groupsOf: (regionId: string) => G[],
  service: { region_id: string; shared_region_ids: string[] },
  purpose: "media" | "handoffs",
): { group: G; suffix: string }[] {
  const seen = new Set<number>();
  const targets: { group: G; suffix: string }[] = [];
  for (const regionId of [service.region_id, ...service.shared_region_ids]) {
    for (const group of groupsOf(regionId)) {
      if (seen.has(group.chatId)) continue;
      seen.add(group.chatId);
      if (purpose === "handoffs" && !group.handoffAlerts) continue;
      targets.push({ group, suffix: targets.length === 0 ? "" : `:${group.chatId}` });
    }
  }
  return targets;
}

/**
 * Whether someone in a role belongs in a group: photographers in the
 * photography group, videographers in the video group. Roles with no media
 * (editors) and "everything" groups take everyone.
 */
export function roleFits(roleMedia: string | null, group: { media: GroupMedia }): boolean {
  return group.media === "all" || roleMedia === null || roleMedia === group.media;
}

/** A photography group counts photos only, a video group videos only. */
export function countsFor(media: GroupMedia, photos: number, videos: number) {
  return { photos: media === "videos" ? 0 : photos, videos: media === "photos" ? 0 : videos };
}
