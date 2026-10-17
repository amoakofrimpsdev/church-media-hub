import "server-only";

import type { DashboardData } from "@/components/dashboard/types";
import { loadAssignments, loadUploadRecords } from "@/lib/assignments";
import {
  analyticsSince,
  fillWeeks,
  pickFocusService,
  relativeDay,
  summarizeHandoffs,
} from "@/lib/domain/analytics";
import { outstandingTasks } from "@/lib/domain/assignments";
import { can } from "@/lib/domain/permissions";
import {
  currentTime,
  formatChurchDate,
  formatChurchLongDate,
  formatChurchTime,
  greeting,
  recentCutoff,
  upcomingCutoff,
} from "@/lib/domain/time";
import { isVideo } from "@/lib/domain/uploads";
import { getGoogleConnectionSummary, getRegionGoogleSummaries } from "@/lib/google/connection";
import { getManagedRegions } from "@/lib/regions";
import { describeHandoffs } from "@/lib/handoffs";
import type { Profile } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

type AnalyticsReply = {
  total_files?: number;
  total_bytes?: number;
  last_30_days?: number;
  previous_30_days?: number;
  photos?: number;
  videos?: number;
  weekly?: { week: string; files: number }[];
  by_category?: { name: string; files: number }[];
  by_person?: { name: string; files: number }[];
};

const thumb = (uploadId: string) => `/api/thumb/${uploadId}?size=400`;
const dateLine = (startsAt: string) =>
  `${formatChurchDate(startsAt)} · ${formatChurchTime(startsAt)}`;

/**
 * Gathers everything the home page shows. Every query runs as the signed-in
 * person, so Row Level Security shapes it: a viewer's numbers and photos only
 * cover the categories their team receives.
 */
/**
 * The worst state among the Google accounts this person looks after: the
 * church's (overall admins) and their regions' own. Shaped like a connection
 * summary so the banner logic stays the same.
 */
async function googleHealth(
  isAdmin: boolean,
  regionIds: string[],
): Promise<{ status: "connected" | "expired" } | null> {
  const [church, regional] = await Promise.all([
    getGoogleConnectionSummary(),
    getRegionGoogleSummaries(),
  ]);
  const own = regionIds.flatMap((id) => regional.get(id) ?? []);
  if (own.some((connection) => connection.status === "expired")) return { status: "expired" };
  // Regions without their own account rely on the church's.
  const usesChurch = isAdmin || regionIds.some((id) => !regional.get(id)?.forNewServices);
  if (!usesChurch) return { status: "connected" };
  return church ? { status: church.status } : null;
}

export async function loadDashboard(profile: Profile): Promise<DashboardData> {
  const supabase = await createClient();
  const now = currentTime();
  const managed = await getManagedRegions();
  const canManage = managed.length > 0;
  const canUpload = can(profile.role, "upload_media");

  // "Current" services: the last two weeks and everything upcoming.
  const [current, connection, teamCount] = await Promise.all([
    supabase
      .from("services")
      .select("*")
      .gte("starts_at", recentCutoff(now))
      .order("starts_at")
      .limit(40),
    canManage ? googleHealth(profile.role === "admin", managed.map((region) => region.id)) : null,
    profile.role === "viewer"
      ? supabase
          .from("team_members")
          .select("team_id", { count: "exact", head: true })
          .eq("profile_id", profile.id)
      : null,
  ]);
  if (current.error) {
    throw new Error(`Could not load services: ${current.error.message}`);
  }
  const services = current.data;
  const serviceIds = services.map((service) => service.id);
  const serviceById = new Map(services.map((service) => [service.id, service]));

  const since = analyticsSince(now);
  const [assignments, uploadRecords, people, categories, handoffRows, recent, analytics, history] =
    await Promise.all([
      loadAssignments(supabase, serviceIds),
      loadUploadRecords(supabase, serviceIds),
      supabase.from("profiles").select("id, full_name"),
      supabase.from("categories").select("id, name, slug"),
      serviceIds.length > 0
        ? supabase.from("handoffs").select("*").in("service_id", serviceIds)
        : null,
      supabase
        .from("uploads")
        .select("id, file_name, mime_type, service_id, category_id, uploaded_by")
        .eq("status", "complete")
        .order("completed_at", { ascending: false })
        .limit(12),
      supabase.rpc("upload_analytics", { p_since: since }),
      // Handoff history for the on-time figures: needs each service's start.
      supabase
        .from("handoffs")
        .select("due_at, received_at, service_id")
        .gte("due_at", since)
        .limit(1000),
    ]);

  const personName = new Map(
    (people.data ?? []).map((person) => [person.id, person.full_name]),
  );
  const category = new Map((categories.data ?? []).map((row) => [row.id, row]));

  // ── Tasks and coverage ──
  const allTasks = assignments.flatMap((assignment) => assignment.tasks);
  const outstanding = outstandingTasks(allTasks, uploadRecords);
  const outstandingKeys = new Set(
    outstanding.map((task) => `${task.assignmentId}:${task.categoryId}`),
  );
  const assignedByService = new Map<string, string[]>();
  for (const assignment of assignments) {
    const names = assignedByService.get(assignment.serviceId) ?? [];
    const name = personName.get(assignment.profileId) ?? "Someone";
    if (!names.includes(name)) names.push(name);
    assignedByService.set(assignment.serviceId, names);
  }
  const missingByService = new Map<string, number>();
  for (const task of outstanding) {
    missingByService.set(task.serviceId, (missingByService.get(task.serviceId) ?? 0) + 1);
  }

  // ── The service the page leads with ──
  const picked = pickFocusService(
    services.map((service) => ({ id: service.id, startsAt: service.starts_at })),
    now,
  );
  const focusService = picked ? serviceById.get(picked.id) : undefined;
  let focus: DashboardData["focus"] = null;
  if (picked && focusService) {
    const [covers, fileCount] = await Promise.all([
      supabase
        .from("uploads")
        .select("id")
        .eq("service_id", focusService.id)
        .eq("status", "complete")
        .like("mime_type", "image/%")
        .order("completed_at", { ascending: false })
        .limit(4),
      supabase
        .from("uploads")
        .select("id", { count: "exact", head: true })
        .eq("service_id", focusService.id)
        .eq("status", "complete"),
    ]);
    const tasks = allTasks.filter((task) => task.serviceId === focusService.id);
    focus = {
      id: focusService.id,
      name: focusService.name,
      dateLine: dateLine(focusService.starts_at),
      relative: relativeDay(focusService.starts_at, now),
      when: picked.when,
      covers: (covers.data ?? []).map((upload) => thumb(upload.id)),
      fileCount: fileCount.count ?? 0,
      assigned: assignedByService.get(focusService.id) ?? [],
      tasksDone: tasks.filter((task) => task.doneAt !== null).length,
      tasksTotal: tasks.length,
      missing: missingByService.get(focusService.id) ?? 0,
    };
  }

  // ── This person's open tasks ──
  const myTasks = allTasks
    .filter((task) => task.profileId === profile.id && task.doneAt === null)
    .sort((a, b) =>
      (serviceById.get(a.serviceId)?.starts_at ?? "").localeCompare(
        serviceById.get(b.serviceId)?.starts_at ?? "",
      ),
    )
    .map((task) => {
      const service = serviceById.get(task.serviceId);
      return {
        assignmentId: task.assignmentId,
        categoryId: task.categoryId,
        categoryName: category.get(task.categoryId)?.name ?? "a category",
        serviceId: task.serviceId,
        serviceName: service?.name ?? "Service",
        dateLine: service ? formatChurchDate(service.starts_at) : "",
        nothingUploaded: outstandingKeys.has(`${task.assignmentId}:${task.categoryId}`),
      };
    });

  const handoffs = (
    await describeHandoffs(supabase, handoffRows?.data ?? [], profile, now)
  ).filter((handoff) => handoff.stage !== "delivered");

  // ── Coming up ──
  const upcomingFrom = upcomingCutoff(now);
  const upcoming = services
    .filter((service) => service.starts_at >= upcomingFrom && service.id !== focus?.id)
    .slice(0, 6)
    .map((service) => ({
      id: service.id,
      name: service.name,
      dateLine: dateLine(service.starts_at),
      relative: relativeDay(service.starts_at, now),
      assigned: assignedByService.get(service.id) ?? [],
      missing: missingByService.get(service.id) ?? 0,
      foldersFailed: service.drive_folder_status === "failed",
    }));

  // ── Analytics ──
  const reply = (analytics.data ?? null) as AnalyticsReply | null;
  let analyticsData: DashboardData["analytics"] = null;
  if (reply && (reply.total_files ?? 0) > 0) {
    // Service start times for the handoffs in the window.
    const historyRows = history.data ?? [];
    const historyServiceIds = [...new Set(historyRows.map((row) => row.service_id))];
    const starts =
      historyServiceIds.length > 0
        ? await supabase.from("services").select("id, starts_at").in("id", historyServiceIds)
        : null;
    const startById = new Map((starts?.data ?? []).map((row) => [row.id, row.starts_at]));

    analyticsData = {
      totalFiles: reply.total_files ?? 0,
      totalBytes: reply.total_bytes ?? 0,
      last30Days: reply.last_30_days ?? 0,
      previous30Days: reply.previous_30_days ?? 0,
      photos: reply.photos ?? 0,
      videos: reply.videos ?? 0,
      weekly: fillWeeks(reply.weekly ?? [], now),
      byCategory: reply.by_category ?? [],
      byPerson: reply.by_person ?? [],
      handoffs: summarizeHandoffs(
        historyRows.flatMap((row) => {
          const startsAt = startById.get(row.service_id);
          return startsAt
            ? [{ dueAt: row.due_at, receivedAt: row.received_at, serviceStartsAt: startsAt }]
            : [];
        }),
        now,
      ),
    };
  }

  return {
    firstName: profile.full_name.split(" ")[0],
    role: profile.role,
    greeting: greeting(now),
    today: formatChurchLongDate(now),
    googleProblem: !canManage
      ? null
      : !connection
        ? "not_connected"
        : connection.status === "expired"
          ? "expired"
          : null,
    viewerWithoutTeam: profile.role === "viewer" && (teamCount?.count ?? 0) === 0,
    focus,
    myTasks,
    handoffs,
    lateHandoffs: handoffs.filter((handoff) => handoff.stage === "late").length,
    recentUploads: (recent.data ?? []).map((upload) => {
      const uploadCategory = category.get(upload.category_id);
      const uploader = upload.uploaded_by
        ? personName.get(upload.uploaded_by)?.split(" ")[0]
        : undefined;
      return {
        id: upload.id,
        thumbUrl: thumb(upload.id),
        fileName: upload.file_name,
        isVideo: isVideo(upload.mime_type),
        href: uploadCategory
          ? `/services/${upload.service_id}/${uploadCategory.slug}`
          : `/services/${upload.service_id}`,
        caption: [uploadCategory?.name, uploader].filter(Boolean).join(" · "),
      };
    }),
    upcoming,
    analytics: analyticsData,
    canManage,
    canUpload,
  };
}
