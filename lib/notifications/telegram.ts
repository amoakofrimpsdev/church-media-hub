import "server-only";

import { outstandingByPerson, outstandingTasks } from "@/lib/domain/assignments";
import {
  dueReminderStage,
  isServiceDayPostDue,
  reminderDueAt,
  serviceDayPostAt,
} from "@/lib/domain/reminders";
import { countsFor, roleFits, routeService, type GroupMedia } from "@/lib/domain/telegram-groups";
import {
  countFiles,
  summarizeUploads,
  UPLOAD_SUMMARY_QUIET_MS,
} from "@/lib/domain/upload-summary";
import { formatChurchDate, formatChurchDateTime, formatChurchTime } from "@/lib/domain/time";
import { appUrl, telegramBotToken } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { editMessageText, sendMessage } from "@/lib/telegram/client";
import {
  handoffLateMessage,
  handoffReadyMessage,
  serviceDayMessage,
  uploadReminderMessage,
  uploadSummaryMessage,
  type CoveringPerson,
  type Recipient,
  type ReminderTarget,
} from "@/lib/telegram/messages";

/**
 * Everything the app posts to the team's Telegram group. All of it runs on the
 * server with the secret key, because scheduled jobs have no signed-in user.
 *
 * Nothing here throws to its caller for a Telegram problem: a failed message
 * must never break creating a service or finishing an upload.
 */

const UNIQUE_VIOLATION = "23505";
const SWEEP_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * One Telegram group the bot posts to. `label` is the region's name when it
 * shares the church's main group with other regions, so "Sunday Service"
 * says whose. `media` says what the group is for: a photography group, a
 * video group, or everything.
 */
type Group = {
  chatId: number;
  linkedAt: Date;
  label: string | null;
  media: GroupMedia;
  handoffAlerts: boolean;
};

/** A group to post to, and the suffix that keeps its "send once" key apart. */
type Target = { group: Group; suffix: string };

type Groups = {
  /**
   * The groups a service's posts go to: its main region's groups, then those
   * of the other regions a joint service is for (each chat once). "media"
   * posts (upload link, reminders, uploads list) go to every group; "handoffs"
   * only to groups with handoff alerts on. The very first group's key suffix
   * is "", so keys from before groups existed still count.
   */
  forService: (
    service: { region_id: string; shared_region_ids: string[] },
    purpose: "media" | "handoffs",
  ) => Target[];
  /** The earliest time any group was linked. */
  earliestLinkedAt: Date;
};

/**
 * Each region posts to its own groups if it linked any, otherwise to the
 * church's main group. Null when there is nowhere to post at all.
 */
async function loadGroups(): Promise<Groups | null> {
  if (!telegramBotToken()) return null;
  const admin = createAdminClient();
  const [{ data: settings }, { data: regions }, { data: linked }] = await Promise.all([
    admin.from("app_settings").select("telegram_chat_id, telegram_linked_at").maybeSingle(),
    admin.from("regions").select("id, name, is_active"),
    admin
      .from("region_telegram_groups")
      .select("region_id, chat_id, linked_at, media, handoff_alerts")
      .order("linked_at"),
  ]);
  const main =
    settings?.telegram_chat_id && settings.telegram_linked_at
      ? { chatId: settings.telegram_chat_id, linkedAt: new Date(settings.telegram_linked_at) }
      : null;
  const own = new Map<string, Group[]>();
  for (const row of linked ?? []) {
    const list = own.get(row.region_id) ?? [];
    list.push({
      chatId: row.chat_id,
      linkedAt: new Date(row.linked_at),
      label: null,
      media: row.media,
      handoffAlerts: row.handoff_alerts,
    });
    own.set(row.region_id, list);
  }
  if (!main && own.size === 0) return null;

  const all = regions ?? [];
  const names = new Map(all.map((region) => [region.id, region.name]));
  // Regions still posting to the main group. With more than one, say whose.
  const sharing = all.filter((region) => region.is_active && !own.has(region.id)).length;
  const groupsOf = (regionId: string): Group[] =>
    own.get(regionId) ??
    (main
      ? [
          {
            ...main,
            label: sharing > 1 ? (names.get(regionId) ?? null) : null,
            media: "all",
            handoffAlerts: true,
          },
        ]
      : []);
  const linkedTimes = [...[...own.values()].flat(), ...(main ? [main] : [])].map((group) =>
    group.linkedAt.getTime(),
  );

  return {
    forService: (service, purpose) => routeService(groupsOf, service, purpose),
    earliestLinkedAt: new Date(Math.min(...linkedTimes)),
  };
}

/** Each role's kind of media (photos, videos), by role ID. */
async function roleMedia(): Promise<Map<string, string | null>> {
  const { data } = await createAdminClient().from("duty_roles").select("id, media");
  return new Map((data ?? []).map((row) => [row.id, row.media]));
}


/**
 * Sends a message at most once per key. The log row is inserted first; the
 * unique key means only one caller wins, however many jobs run at once. If
 * Telegram then refuses the message, the row is removed so it is tried again.
 */
async function sendOnce(
  group: Group,
  kind: string,
  dedupeKey: string,
  serviceId: string | null,
  html: string,
): Promise<boolean> {
  const admin = createAdminClient();
  const claim = await admin
    .from("notification_log")
    .insert({ kind, dedupe_key: dedupeKey, service_id: serviceId });
  if (claim.error) {
    if (claim.error.code !== UNIQUE_VIOLATION) {
      console.error("Could not record notification", claim.error.message);
    }
    return false;
  }

  const sent = await sendMessage(group.chatId, html);
  if (!sent.ok) {
    console.error(`Telegram ${kind} failed: ${sent.description}`);
    await admin.from("notification_log").delete().eq("dedupe_key", dedupeKey);
    return false;
  }
  return true;
}

/** Marks a key as handled without sending, e.g. a reminder with nobody to chase. */
async function markHandled(kind: string, dedupeKey: string, serviceId: string): Promise<void> {
  await createAdminClient()
    .from("notification_log")
    .upsert(
      { kind, dedupe_key: dedupeKey, service_id: serviceId },
      { onConflict: "dedupe_key", ignoreDuplicates: true },
    );
}

function serviceInfo(
  service: { id: string; name: string; starts_at: string },
  group: Group,
) {
  return {
    name: group.label ? `${service.name} (${group.label})` : service.name,
    date: formatChurchDate(service.starts_at),
    url: `${appUrl()}/services/${service.id}`,
  };
}

/**
 * Posts "today's service" with the upload link and who is covering it, on the
 * morning of the service (see isServiceDayPostDue). Once per service.
 */
async function announceServiceDay(
  group: Group,
  service: { id: string; name: string; starts_at: string },
  keySuffix = "",
): Promise<boolean> {
  const admin = createAdminClient();
  const [{ data: allAssignments }, media] = await Promise.all([
    admin.from("assignments").select("id, profile_id, duty_role_id").eq("service_id", service.id),
    roleMedia(),
  ]);
  // A photography group hears about the photographers, and so on.
  const assignments = (allAssignments ?? []).filter((assignment) =>
    roleFits(media.get(assignment.duty_role_id) ?? null, group),
  );

  let covering: CoveringPerson[] = [];
  if (assignments && assignments.length > 0) {
    const [tasks, categories, people] = await Promise.all([
      admin
        .from("assignment_categories")
        .select("assignment_id, category_id")
        .in("assignment_id", assignments.map((assignment) => assignment.id)),
      admin.from("categories").select("id, name"),
      admin
        .from("profiles")
        .select("id, full_name, telegram_user_id, active")
        .in("id", assignments.map((assignment) => assignment.profile_id)),
    ]);
    const categoryName = new Map((categories.data ?? []).map((row) => [row.id, row.name]));
    const byPerson = new Map<string, string[]>();
    for (const assignment of assignments) {
      const names = byPerson.get(assignment.profile_id) ?? [];
      for (const task of tasks.data ?? []) {
        if (task.assignment_id !== assignment.id) continue;
        const name = categoryName.get(task.category_id);
        if (name && !names.includes(name)) names.push(name);
      }
      byPerson.set(assignment.profile_id, names);
    }
    covering = (people.data ?? [])
      .filter((person) => person.active)
      .map((person) => ({
        name: person.full_name,
        telegramUserId: person.telegram_user_id,
        categories: byPerson.get(person.id) ?? [],
      }));
  }

  return sendOnce(
    group,
    "service_day",
    `service_day:${service.id}${keySuffix}`,
    service.id,
    serviceDayMessage(
      { ...serviceInfo(service, group), time: formatChurchTime(service.starts_at) },
      covering,
      group.media,
    ),
  );
}

/**
 * Posts, or brings up to date, the "who uploaded what" message for a service.
 * There is one per service: the first call sends it and later calls edit it,
 * so the group sees a single list that grows rather than a message per batch.
 */
async function postUploadSummary(
  groups: Groups,
  serviceId: string,
): Promise<"sent" | "updated" | "unchanged"> {
  const admin = createAdminClient();
  const [{ data: service }, { data: uploads }] = await Promise.all([
    admin
      .from("services")
      .select("id, name, starts_at, region_id, shared_region_ids")
      .eq("id", serviceId)
      .maybeSingle(),
    admin
      .from("uploads")
      .select("uploaded_by, category_id, mime_type, completed_at")
      .eq("service_id", serviceId)
      .eq("status", "complete"),
  ]);
  if (!service) return "unchanged";
  const targets = groups.forService(service, "media");
  if (targets.length === 0) return "unchanged";

  const lines = summarizeUploads(
    (uploads ?? []).map((upload) => ({
      uploadedBy: upload.uploaded_by,
      categoryId: upload.category_id,
      mimeType: upload.mime_type,
      completedAt: upload.completed_at ?? "",
    })),
  );
  const profileIds = [...new Set(lines.flatMap((line) => line.uploadedBy ?? []))];
  const [categories, people] = await Promise.all([
    admin.from("categories").select("id, name"),
    profileIds.length > 0
      ? admin.from("profiles").select("id, full_name").in("id", profileIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
  ]);
  const categoryName = new Map((categories.data ?? []).map((row) => [row.id, row.name]));
  const personName = new Map((people.data ?? []).map((row) => [row.id, row.full_name]));

  // A photography group lists photos, a video group videos.
  const entriesFor = (media: GroupMedia) =>
    lines.flatMap((line) => {
      const { photos, videos } = countsFor(media, line.photos, line.videos);
      if (photos + videos === 0) return [];
      return [
        {
          name: (line.uploadedBy && personName.get(line.uploadedBy)) || "Someone",
          categoryName: categoryName.get(line.categoryId) ?? "a category",
          files: countFiles(photos, videos),
        },
      ];
    });

  // A joint service has the list in each region's groups.
  let outcome: "sent" | "updated" | "unchanged" = "unchanged";
  for (const { group, suffix } of targets) {
    const html = uploadSummaryMessage(serviceInfo(service, group), entriesFor(group.media), group.media);
    // Nothing of this kind (or everything was deleted): leave the last post as it was.
    if (!html) continue;
    const result = await postSummaryTo(group, `upload_summary:${serviceId}${suffix}`, serviceId, html);
    if (result !== "unchanged") outcome = result;
  }
  return outcome;
}

/** Sends the "who uploaded what" message to one group, or edits it there. */
async function postSummaryTo(
  group: Group,
  key: string,
  serviceId: string,
  html: string,
): Promise<"sent" | "updated" | "unchanged"> {
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("notification_log")
    .select("telegram_chat_id, telegram_message_id, body")
    .eq("dedupe_key", key)
    .maybeSingle();

  const sendNew = async (): Promise<boolean> => {
    const sent = await sendMessage(group.chatId, html);
    if (!sent.ok) {
      console.error(`Telegram upload summary failed: ${sent.description}`);
      return false;
    }
    await admin
      .from("notification_log")
      .update({
        telegram_chat_id: group.chatId,
        telegram_message_id: sent.result.message_id,
        body: html,
      })
      .eq("dedupe_key", key);
    return true;
  };

  if (!existing) {
    // Whoever inserts the row sends the message; anyone racing them stops here.
    const claim = await admin
      .from("notification_log")
      .insert({ kind: "upload_summary", dedupe_key: key, service_id: serviceId, body: html });
    if (claim.error) return "unchanged";
    if (await sendNew()) return "sent";
    await admin.from("notification_log").delete().eq("dedupe_key", key);
    return "unchanged";
  }

  // Still being sent by someone else, or nothing new to show.
  if (!existing.telegram_message_id || existing.body === html) return "unchanged";

  // Claim this change, so two callers do not both edit with the same news.
  const { data: claimed } = await admin
    .from("notification_log")
    .update({ body: html })
    .eq("dedupe_key", key)
    .eq("body", existing.body ?? "")
    .select("id");
  if (!claimed || claimed.length === 0) return "unchanged";

  // The group was relinked to another chat: start a fresh message there.
  if (existing.telegram_chat_id !== group.chatId) {
    return (await sendNew()) ? "sent" : "unchanged";
  }
  const edited = await editMessageText(group.chatId, existing.telegram_message_id, html);
  if (edited.ok || edited.description.includes("message is not modified")) return "updated";
  // Someone deleted the message in Telegram: post it again.
  if (edited.description.includes("message to edit not found")) {
    return (await sendNew()) ? "sent" : "unchanged";
  }
  console.error(`Telegram upload summary edit failed: ${edited.description}`);
  // Let the next sweep try again.
  await admin.from("notification_log").update({ body: null }).eq("dedupe_key", key);
  return "unchanged";
}

/**
 * Called when someone's batch of uploads finishes, so the group hears about
 * it straight away. The scheduled sweep catches batches that never told us,
 * for example when the app was closed as the last file finished.
 */
export async function announceUploads(serviceIds: string[]): Promise<void> {
  try {
    const groups = await loadGroups();
    if (!groups) return;
    for (const serviceId of serviceIds) await postUploadSummary(groups, serviceId);
  } catch (error) {
    console.error("Posting the upload summary failed", error);
  }
}

/** Who still owes what for a service, ready to be tagged. */
async function reminderTargets(serviceId: string, group: Group): Promise<ReminderTarget[]> {
  const admin = createAdminClient();
  const [{ data: allAssignments }, media] = await Promise.all([
    admin.from("assignments").select("id, profile_id, duty_role_id").eq("service_id", serviceId),
    roleMedia(),
  ]);
  // Photographers are chased in the photography group, and so on.
  const assignments = (allAssignments ?? []).filter((assignment) =>
    roleFits(media.get(assignment.duty_role_id) ?? null, group),
  );
  if (assignments.length === 0) return [];

  const [tasks, uploads, categories, people] = await Promise.all([
    admin
      .from("assignment_categories")
      .select("assignment_id, category_id, done_at")
      .in("assignment_id", assignments.map((assignment) => assignment.id)),
    admin
      .from("uploads")
      .select("category_id, uploaded_by")
      .eq("service_id", serviceId)
      .eq("status", "complete"),
    admin.from("categories").select("id, name"),
    admin
      .from("profiles")
      .select("id, full_name, telegram_user_id, active")
      .in("id", assignments.map((assignment) => assignment.profile_id)),
  ]);

  const profileByAssignment = new Map(
    assignments.map((assignment) => [assignment.id, assignment.profile_id]),
  );
  const categoryName = new Map((categories.data ?? []).map((row) => [row.id, row.name]));
  const person = new Map((people.data ?? []).map((row) => [row.id, row]));

  const outstanding = outstandingTasks(
    (tasks.data ?? []).map((task) => ({
      assignmentId: task.assignment_id,
      serviceId,
      profileId: profileByAssignment.get(task.assignment_id) ?? "",
      categoryId: task.category_id,
      doneAt: task.done_at,
    })),
    (uploads.data ?? []).map((upload) => ({
      serviceId,
      categoryId: upload.category_id,
      uploadedBy: upload.uploaded_by,
    })),
  );

  return outstandingByPerson(outstanding).flatMap((entry) => {
    const profile = person.get(entry.profileId);
    // Do not chase someone whose access has been turned off.
    if (!profile?.active) return [];
    return [
      {
        name: profile.full_name,
        telegramUserId: profile.telegram_user_id,
        categories: entry.categoryIds.map((id) => categoryName.get(id) ?? "a category"),
      },
    ];
  });
}

export type ReminderOutcome =
  | "sent"
  | "nothing_outstanding"
  | "not_linked"
  | "already_sent"
  | "failed";

/**
 * Sends the upload reminder for a service to each of its groups, chasing in
 * each only the people whose role fits it. `key` decides how often:
 * scheduled reminders use one key per stage, the "send now" button a fresh
 * one. `dueAt` (scheduled reminders) skips groups linked after it fell due.
 */
export async function sendUploadReminder(
  serviceId: string,
  key: string,
  dueAt?: Date,
): Promise<ReminderOutcome> {
  try {
    const groups = await loadGroups();
    if (!groups) return "not_linked";

    const { data: service } = await createAdminClient()
      .from("services")
      .select("id, name, starts_at, region_id, shared_region_ids")
      .eq("id", serviceId)
      .maybeSingle();
    if (!service) return "failed";
    const targets = groups.forService(service, "media");
    if (targets.length === 0) return "not_linked";

    const outcomes: ReminderOutcome[] = [];
    for (const { group, suffix } of targets) {
      if (dueAt && dueAt < group.linkedAt) continue;
      const message = uploadReminderMessage(
        serviceInfo(service, group),
        await reminderTargets(serviceId, group),
        group.media,
      );
      if (!message) {
        await markHandled("upload_reminder", key + suffix, serviceId);
        outcomes.push("nothing_outstanding");
        continue;
      }
      outcomes.push(
        (await sendOnce(group, "upload_reminder", key + suffix, serviceId, message))
          ? "sent"
          : "already_sent",
      );
    }
    if (outcomes.includes("sent")) return "sent";
    if (outcomes.includes("already_sent")) return "already_sent";
    return "nothing_outstanding";
  } catch (error) {
    console.error("Sending an upload reminder failed", error);
    return "failed";
  }
}

export type SweepResult = {
  linked: boolean;
  /** "Today's service" posts. */
  servicesAnnounced: number;
  /** "Who uploaded what" posts sent or brought up to date. */
  uploadSummaries: number;
  reminders: number;
  ready: number;
  late: number;
};

/**
 * Sends everything that has fallen due: upload reminders, "ready for your
 * team" notices and late-handoff flags. Safe to run as often as you like.
 *
 * Nothing that fell due before the group was linked is sent, so linking the
 * group does not unleash a backlog of old alerts.
 */
export async function sendDueNotifications(now: Date = new Date()): Promise<SweepResult> {
  const result: SweepResult = {
    linked: false,
    servicesAnnounced: 0,
    uploadSummaries: 0,
    reminders: 0,
    ready: 0,
    late: 0,
  };
  try {
    const groups = await loadGroups();
    if (!groups) return result;
    result.linked = true;

    const admin = createAdminClient();
    const since = new Date(now.getTime() - SWEEP_WINDOW_MS).toISOString();
    const { data: services } = await admin
      .from("services")
      .select("id, name, starts_at, region_id, shared_region_ids")
      .gte("starts_at", since)
      .lte("starts_at", now.toISOString());
    const recent = services ?? [];

    // ── Today's services ──
    // Services happening today (church time). A day's window is at most 25
    // hours either side of now, so this catches every one of them.
    const { data: todays } = await admin
      .from("services")
      .select("id, name, starts_at, region_id, shared_region_ids, drive_folder_status")
      .gte("starts_at", new Date(now.getTime() - 25 * 60 * 60 * 1000).toISOString())
      .lte("starts_at", new Date(now.getTime() + 25 * 60 * 60 * 1000).toISOString());
    for (const service of todays ?? []) {
      const startsAt = new Date(service.starts_at);
      if (!isServiceDayPostDue(startsAt, now)) continue;
      // No upload link to give until its Drive folders exist.
      if (service.drive_folder_status !== "ready") continue;
      // A joint service is announced in each region's group.
      for (const { group, suffix } of groups.forService(service, "media")) {
        // Not for days that came before the group was linked.
        if (serviceDayPostAt(startsAt) < group.linkedAt && startsAt < group.linkedAt) continue;
        if (await announceServiceDay(group, service, suffix)) result.servicesAnnounced += 1;
      }
    }

    // ── Who uploaded what ──
    // Services with uploads in the last day whose latest batch has gone quiet.
    // A batch still going up is left alone, so it is not edited once per file.
    const uploadsSince = new Date(
      Math.max(now.getTime() - 24 * 60 * 60 * 1000, groups.earliestLinkedAt.getTime()),
    );
    const { data: finished } = await admin
      .from("uploads")
      .select("service_id, completed_at")
      .eq("status", "complete")
      .gte("completed_at", uploadsSince.toISOString());
    const latestByService = new Map<string, number>();
    for (const upload of finished ?? []) {
      const at = new Date(upload.completed_at ?? 0).getTime();
      latestByService.set(upload.service_id, Math.max(at, latestByService.get(upload.service_id) ?? 0));
    }
    for (const [serviceId, latest] of latestByService) {
      if (now.getTime() - latest < UPLOAD_SUMMARY_QUIET_MS) continue;
      if ((await postUploadSummary(groups, serviceId)) !== "unchanged") result.uploadSummaries += 1;
    }

    // ── Upload reminders ──
    for (const service of recent) {
      const startsAt = new Date(service.starts_at);
      const stage = dueReminderStage(startsAt, now);
      if (stage === 0) continue;

      // Each group is chased once per stage; groups linked after it fell due are skipped.
      const outcome = await sendUploadReminder(
        service.id,
        `upload_reminder:${service.id}:${stage}`,
        reminderDueAt(startsAt, stage),
      );
      if (outcome === "sent") result.reminders += 1;
      // If stage 2 is due, stage 1 is moot: never send it late.
      for (let earlier = 1; earlier < stage; earlier++) {
        await markHandled("upload_reminder", `upload_reminder:${service.id}:${earlier}`, service.id);
      }
    }

    // ── Handoffs ──
    // Upcoming services can have ready handoffs too, so look at all open ones
    // for services in the window or still to come.
    const { data: handoffs } = await admin
      .from("handoffs")
      .select("*")
      .is("received_at", null)
      .gte("due_at", since);
    const open = handoffs ?? [];
    if (open.length === 0) return result;

    const unique = (values: string[]) => [...new Set(values)];
    const [handoffServices, categories, teams, members] = await Promise.all([
      admin
        .from("services")
        .select("id, name, starts_at, region_id, shared_region_ids")
        .in("id", unique(open.map((handoff) => handoff.service_id))),
      admin.from("categories").select("id, name, slug"),
      admin.from("teams").select("id, name"),
      admin
        .from("team_members")
        .select("team_id, profile_id")
        .in("team_id", unique(open.map((handoff) => handoff.team_id))),
    ]);
    const memberIds = unique((members.data ?? []).map((member) => member.profile_id));
    const [{ data: memberProfiles }, { data: memberRegions }] =
      memberIds.length > 0
        ? await Promise.all([
            admin
              .from("profiles")
              .select("id, full_name, telegram_user_id, active, role")
              .in("id", memberIds),
            admin.from("region_members").select("region_id, profile_id").in("profile_id", memberIds),
          ])
        : [{ data: [] }, { data: [] }];
    const inRegion = new Set(
      (memberRegions ?? []).map((row) => `${row.region_id}:${row.profile_id}`),
    );

    const serviceById = new Map((handoffServices.data ?? []).map((row) => [row.id, row]));
    const categoryById = new Map((categories.data ?? []).map((row) => [row.id, row]));
    const teamById = new Map((teams.data ?? []).map((row) => [row.id, row]));
    const profileById = new Map((memberProfiles ?? []).map((row) => [row.id, row]));
    // Teams are shared by every region; tag only the members in this one.
    const teamMembers = (teamId: string, regionIds: string[]): Recipient[] =>
      (members.data ?? [])
        .filter((member) => member.team_id === teamId)
        .flatMap((member) => {
          const profile = profileById.get(member.profile_id);
          const here =
            profile?.role === "admin" ||
            regionIds.some((regionId) => inRegion.has(`${regionId}:${member.profile_id}`));
          return profile?.active && here
            ? [{ name: profile.full_name, telegramUserId: profile.telegram_user_id }]
            : [];
        });

    for (const handoff of open) {
      const service = serviceById.get(handoff.service_id);
      const category = categoryById.get(handoff.category_id);
      const team = teamById.get(handoff.team_id);
      if (!service || !category || !team) continue;
      const dueAt = new Date(handoff.due_at);
      const readyAt = handoff.ready_at ? new Date(handoff.ready_at) : null;

      // Groups with handoff alerts on, in every region the service is for.
      for (const { group, suffix } of groups.forService(service, "handoffs")) {
        const info = {
          categoryName: category.name,
          teamName: team.name,
          service: serviceInfo(service, group),
          due: formatChurchDateTime(handoff.due_at),
          albumUrl: `${appUrl()}/services/${service.id}/${category.slug}`,
          teamMembers: teamMembers(team.id, [service.region_id, ...service.shared_region_ids]),
        };
        if (dueAt < now && dueAt >= group.linkedAt) {
          const sent = await sendOnce(
            group,
            "handoff_late",
            `handoff_late:${handoff.id}${suffix}`,
            service.id,
            handoffLateMessage({ ...info, isReady: readyAt !== null }),
          );
          if (sent) result.late += 1;
        } else if (readyAt && readyAt >= group.linkedAt && dueAt >= now) {
          // Keyed by when it became ready, so reopening a task and finishing it
          // again tells the team again.
          const sent = await sendOnce(
            group,
            "handoff_ready",
            `handoff_ready:${handoff.id}:${handoff.ready_at}${suffix}`,
            service.id,
            handoffReadyMessage(info),
          );
          if (sent) result.ready += 1;
        }
      }
    }
  } catch (error) {
    console.error("Sending due notifications failed", error);
  }
  return result;
}
