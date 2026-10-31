/**
 * The text of every message the bot sends. Pure functions, so wording and
 * tagging can be tested without Telegram.
 *
 * Messages use Telegram's HTML format. Anything that came from a person (names,
 * service titles) is escaped, so a name containing "<" cannot break a message
 * or inject formatting.
 */

import type { GroupMedia } from "@/lib/domain/telegram-groups";

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttribute(text: string): string {
  return escapeHtml(text).replace(/"/g, "&quot;");
}

export type Recipient = {
  name: string;
  /** Their Telegram user ID, if they have linked their account with /join. */
  telegramUserId: number | null;
};

/**
 * Tags a person. A tg://user link notifies them even if they have no Telegram
 * username. Someone who has not linked Telegram is named in plain text.
 */
export function mention(person: Recipient): string {
  const name = escapeHtml(person.name);
  return person.telegramUserId === null
    ? name
    : `<a href="tg://user?id=${person.telegramUserId}">${name}</a>`;
}

export function link(label: string, url: string): string {
  return `<a href="${escapeAttribute(url)}">${escapeHtml(label)}</a>`;
}

/** "A", "A and B", "A, B and C" */
export function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

type ServiceInfo = { name: string; date: string; url: string };


const MEDIA_WORDING: Record<GroupMedia, { icon: string; noun: string; title: string }> = {
  all: { icon: "📸", noun: "photos and videos", title: "Uploads" },
  photos: { icon: "📸", noun: "photos", title: "Photos" },
  videos: { icon: "🎥", noun: "videos", title: "Videos" },
};

export type CoveringPerson = Recipient & {
  /** Categories they are down to upload today. */
  categories: string[];
};

/**
 * The morning of a service: what is on, the link to upload to, and who is
 * covering it (tagged, so they see it).
 */
export function serviceDayMessage(
  service: ServiceInfo & { time: string },
  covering: CoveringPerson[],
  media: GroupMedia = "all",
): string {
  const wording = MEDIA_WORDING[media];
  const lines = [
    `${wording.icon} <b>Today: ${escapeHtml(service.name)}</b>, ${escapeHtml(service.time)}`,
    `Upload ${wording.noun} here: ${link("open the service", service.url)}`,
  ];
  if (covering.length > 0) {
    lines.push(
      "",
      "Covering today:",
      ...covering.map(
        (person) =>
          `• ${mention(person)}${
            person.categories.length > 0
              ? `: ${escapeHtml(joinList(person.categories))}`
              : ""
          }`,
      ),
    );
  }
  return lines.join("\n");
}

export type ReminderTarget = Recipient & {
  /** Names of the categories this person still owes. */
  categories: string[];
};

/**
 * Chases only the people who still owe something, each with what they owe.
 * Returns null when there is nobody to chase, so nothing is sent.
 */
export function uploadReminderMessage(
  service: ServiceInfo,
  targets: ReminderTarget[],
  media: GroupMedia = "all",
): string | null {
  const owing = targets.filter((target) => target.categories.length > 0);
  if (owing.length === 0) return null;

  const what = media === "all" ? "Still to upload" : `Still to upload ${MEDIA_WORDING[media].noun}`;
  return [
    `⏰ ${what} for <b>${escapeHtml(service.name)}</b>, ${escapeHtml(service.date)}:`,
    ...owing.map(
      (target) =>
        `• ${mention(target)}: ${escapeHtml(joinList(target.categories))}`,
    ),
    `${link("Upload now", service.url)}. Already handed them over another way? Tap “Mark done” on the service page.`,
  ].join("\n");
}

export type UploadSummaryEntry = {
  name: string;
  categoryName: string;
  /** "24 photos and 2 videos" */
  files: string;
};

/**
 * The running list of who uploaded what for a service. The same message is
 * edited as more come in. Names are not tagged: telling someone about their
 * own upload is noise. Null when there is nothing to list.
 */
export function uploadSummaryMessage(
  service: ServiceInfo,
  entries: UploadSummaryEntry[],
  media: GroupMedia = "all",
): string | null {
  if (entries.length === 0) return null;
  const heading = media === "all" ? "📤 Uploads" : `${MEDIA_WORDING[media].icon} ${MEDIA_WORDING[media].title}`;
  return [
    `${heading} for <b>${escapeHtml(service.name)}</b>, ${escapeHtml(service.date)}`,
    ...entries.map(
      (entry) =>
        `✅ ${escapeHtml(entry.name)} uploaded ${escapeHtml(entry.files)} to ${escapeHtml(entry.categoryName)}`,
    ),
    link("Open the service", service.url),
  ].join("\n");
}

type HandoffInfo = {
  categoryName: string;
  teamName: string;
  service: ServiceInfo;
  /** e.g. "Mon, Oct 13, 10:00 AM" */
  due: string;
  albumUrl: string;
  teamMembers: Recipient[];
};

function teamLine(handoff: HandoffInfo): string {
  return handoff.teamMembers.length > 0
    ? joinList(handoff.teamMembers.map(mention))
    : `${escapeHtml(handoff.teamName)} team`;
}

export function handoffReadyMessage(handoff: HandoffInfo): string {
  return [
    `✅ <b>${escapeHtml(handoff.categoryName)}</b> is ready for ${escapeHtml(handoff.teamName)}`,
    `${escapeHtml(handoff.service.name)}, ${escapeHtml(handoff.service.date)}`,
    `${teamLine(handoff)}: ${link("open the album", handoff.albumUrl)} and tap “Mark received” when you have what you need. Due ${escapeHtml(handoff.due)}.`,
  ].join("\n");
}

export function handoffLateMessage(
  handoff: HandoffInfo & { isReady: boolean },
): string {
  return [
    `🔴 <b>Late:</b> ${escapeHtml(handoff.categoryName)} for ${escapeHtml(handoff.teamName)}`,
    `${escapeHtml(handoff.service.name)}, ${escapeHtml(handoff.service.date)}. Was due ${escapeHtml(handoff.due)}.`,
    handoff.isReady
      ? `It is ready. ${teamLine(handoff)}: ${link("open the album", handoff.albumUrl)} and tap “Mark received”.`
      : `It is not marked ready yet. ${link("See what is missing", handoff.service.url)}.`,
  ].join("\n");
}

// ── Bot replies ─────────────────────────────────────────────────────────────

export const HELP_MESSAGE = [
  "I post reminders for the RCW media team.",
  "",
  "/join — connect your Telegram to your RCW Media account, so I can tag you. Send it to me in a private chat.",
  "/linkgroup — (admins) send this in the team group to make it the group I post in.",
].join("\n");

export function joinLinkMessage(url: string, minutes: number): string {
  return [
    `${link("Tap here to connect your Telegram", url)} to your RCW Media account.`,
    `Sign in with the Google account you use for the app. The link works once and expires in ${minutes} minutes.`,
  ].join("\n");
}

export const JOIN_IN_PRIVATE_MESSAGE =
  "Send /join to me in a private chat, not here. Tap my name, then “Send message”.";

export function groupLinkMessage(url: string, minutes: number): string {
  return [
    `An app admin needs to confirm this: ${link("link this group", url)}.`,
    `The link works once and expires in ${minutes} minutes. Only admins can use it.`,
  ].join("\n");
}

export const LINKGROUP_IN_GROUP_MESSAGE =
  "Send /linkgroup in the team group you want me to post in, not here.";
