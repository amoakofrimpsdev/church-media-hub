import "server-only";

import type { ServiceData, ServiceSummary } from "@/components/services/types";
import { loadAssignments, loadUploadRecords } from "@/lib/assignments";
import { relativeDay } from "@/lib/domain/analytics";
import { outstandingTasks } from "@/lib/domain/assignments";
import { can } from "@/lib/domain/permissions";
import {
  churchDateParts,
  currentTime,
  formatChurchDate,
  formatChurchTime,
  upcomingCutoff,
} from "@/lib/domain/time";
import { getConnectionForRegion } from "@/lib/google/connection";
import { getManagedRegions, getMyRegions } from "@/lib/regions";
import { driveFolderUrl } from "@/lib/google/links";
import { describeHandoffs } from "@/lib/handoffs";
import type { Profile } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

const thumb = (uploadId: string) => `/api/thumb/${uploadId}?size=400`;
const dateLine = (startsAt: string) =>
  `${formatChurchDate(startsAt)} · ${formatChurchTime(startsAt)}`;

/**
 * Gathers everything a service page shows, or null if the service does not
 * exist. Queries run as the signed-in person, so Row Level Security decides
 * which uploads and handoffs they get back.
 */
export async function loadServicePage(
  profile: Profile,
  id: string,
): Promise<ServiceData | null> {
  const supabase = await createClient();
  const now = currentTime();

  const [service, categories, folders, uploads, assignments, dutyRoles, people, handoffRows] =
    await Promise.all([
      supabase.from("services").select("*").eq("id", id).maybeSingle(),
      supabase.from("categories").select("*").order("sort_order"),
      supabase.from("service_folders").select("category_id").eq("service_id", id),
      supabase
        .from("uploads")
        .select("id, category_id, uploaded_by, mime_type")
        .eq("service_id", id)
        .eq("status", "complete")
        .order("completed_at", { ascending: false })
        .limit(1000),
      loadAssignments(supabase, [id]),
      supabase.from("duty_roles").select("*").order("sort_order"),
      supabase.from("profiles").select("id, full_name, role, active").order("full_name"),
      supabase.from("handoffs").select("*").eq("service_id", id),
    ]);
  const failed = service.error ?? categories.error ?? folders.error ?? uploads.error;
  if (failed) throw new Error(`Could not load the service: ${failed.message}`);
  if (!service.data) return null;

  const regionId = service.data.region_id;
  const canManage = (await getManagedRegions()).some((region) => region.id === regionId);
  const canUpload = can(profile.role, "upload_media");
  const isViewer = profile.role === "viewer";

  // Viewers see only categories delivered to one of their teams.
  let visibleCategoryIds: Set<string> | null = null;
  if (isViewer) {
    const { data: myTeams } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("profile_id", profile.id);
    const teamIds = (myTeams ?? []).map((row) => row.team_id);
    const { data: delivered } =
      teamIds.length > 0
        ? await supabase.from("category_teams").select("category_id").in("team_id", teamIds)
        : { data: [] };
    visibleCategoryIds = new Set((delivered ?? []).map((row) => row.category_id));
  }

  const finished = uploads.data ?? [];
  const withFolder = new Set((folders.data ?? []).map((row) => row.category_id));
  const countByCategory = new Map<string, number>();
  const coversByCategory = new Map<string, string[]>();
  for (const upload of finished) {
    countByCategory.set(upload.category_id, (countByCategory.get(upload.category_id) ?? 0) + 1);
    if (upload.mime_type.startsWith("image/")) {
      const covers = coversByCategory.get(upload.category_id) ?? [];
      if (covers.length < 3) covers.push(thumb(upload.id));
      coversByCategory.set(upload.category_id, covers);
    }
  }

  const handoffs = await describeHandoffs(supabase, handoffRows.data ?? [], profile, now);
  const categoryName = new Map((categories.data ?? []).map((row) => [row.id, row.name]));

  // Active categories, plus retired ones this service already has.
  const shown = (categories.data ?? []).filter(
    (category) =>
      (category.is_active || withFolder.has(category.id)) &&
      (visibleCategoryIds === null || visibleCategoryIds.has(category.id)),
  );
  const missingFolders = shown.filter(
    (category) => category.is_active && !withFolder.has(category.id),
  );
  const foldersIncomplete =
    service.data.drive_folder_status !== "ready" || missingFolders.length > 0;

  let folderProblem: ServiceData["folderProblem"] = null;
  if (canManage && foldersIncomplete) {
    // Only admins can fix the Google connection, so only they are told.
    const connection = await getConnectionForRegion(regionId);
    folderProblem = {
      message:
        service.data.drive_error ??
        (missingFolders.length > 0
          ? `Missing: ${missingFolders.map((category) => category.name).join(", ")}.`
          : "The folders have not been created yet."),
      connection: !connection
        ? "connect"
        : connection.status === "expired"
          ? "reconnect"
          : null,
    };
  }

  const { data: regionMembers } = canManage
    ? await supabase.from("region_members").select("profile_id").eq("region_id", regionId)
    : { data: [] };
  const regionPeople = new Set((regionMembers ?? []).map((row) => row.profile_id));

  // Who still owes what: not marked done and nothing uploaded by them.
  const outstanding = new Set(
    outstandingTasks(
      assignments.flatMap((assignment) => assignment.tasks),
      finished.map((upload) => ({
        serviceId: id,
        categoryId: upload.category_id,
        uploadedBy: upload.uploaded_by,
      })),
    ).map((task) => `${task.assignmentId}:${task.categoryId}`),
  );
  const personName = new Map(
    (people.data ?? []).map((person) => [person.id, person.full_name]),
  );
  const roleName = new Map((dutyRoles.data ?? []).map((role) => [role.id, role.name]));

  return {
    id,
    name: service.data.name,
    dateLine: dateLine(service.data.starts_at),
    relative: relativeDay(service.data.starts_at, now),
    totalFiles: finished.length,
    canManage,
    canUpload,
    isAdmin: profile.role === "admin",
    isViewer,
    folderProblem,
    driveUrl:
      canManage && service.data.drive_folder_id
        ? driveFolderUrl(service.data.drive_folder_id)
        : null,
    albums: shown.map((category) => ({
      categoryId: category.id,
      slug: category.slug,
      name: category.name,
      fileCount: countByCategory.get(category.id) ?? 0,
      covers: coversByCategory.get(category.id) ?? [],
      hasFolder: withFolder.has(category.id),
      deliveries: handoffs
        .filter((handoff) => handoff.categorySlug === category.slug)
        .map((handoff) => ({ teamName: handoff.teamName, stage: handoff.stage })),
    })),
    people: assignments.map((assignment) => ({
      assignmentId: assignment.id,
      name: personName.get(assignment.profileId) ?? "Someone",
      roleName: roleName.get(assignment.dutyRoleId) ?? "Role",
      isMe: assignment.profileId === profile.id,
      tasks: assignment.tasks.map((task) => ({
        categoryId: task.categoryId,
        categoryName: categoryName.get(task.categoryId) ?? "Category",
        state:
          task.doneAt !== null
            ? ("done" as const)
            : outstanding.has(`${task.assignmentId}:${task.categoryId}`)
              ? ("missing" as const)
              : ("uploaded" as const),
      })),
    })),
    hasOutstanding: outstanding.size > 0,
    assignOptions: canManage
      ? {
          // People in this service's region (overall admins are in all).
          people: (people.data ?? [])
            .filter((person) => person.active && person.role !== "viewer")
            .filter((person) => person.role === "admin" || regionPeople.has(person.id))
            .map((person) => ({ id: person.id, name: person.full_name })),
          dutyRoles: (dutyRoles.data ?? []).map((role) => ({ id: role.id, name: role.name })),
          categories: shown
            .filter((category) => category.is_active)
            .map((category) => ({ id: category.id, name: category.name })),
        }
      : null,
    handoffs,
  };
}

const PAST_LIMIT = 30;

/** Upcoming and past services for the services list, with a cover photo each. */
export async function loadServiceList(): Promise<{
  upcoming: ServiceSummary[];
  past: ServiceSummary[];
}> {
  const supabase = await createClient();
  const now = currentTime();
  const cutoff = upcomingCutoff(now);

  const [upcoming, past] = await Promise.all([
    supabase.from("services").select("*").gte("starts_at", cutoff).order("starts_at"),
    supabase
      .from("services")
      .select("*")
      .lt("starts_at", cutoff)
      .order("starts_at", { ascending: false })
      .limit(PAST_LIMIT),
  ]);
  const failed = upcoming.error ?? past.error;
  if (failed) throw new Error(`Could not load services: ${failed.message}`);

  const services = [...(upcoming.data ?? []), ...(past.data ?? [])];
  const ids = services.map((service) => service.id);
  if (ids.length === 0) return { upcoming: [], past: [] };

  const [assignments, uploadRecords, people, images, regions] = await Promise.all([
    loadAssignments(supabase, ids),
    loadUploadRecords(supabase, ids),
    supabase.from("profiles").select("id, full_name"),
    // Newest photos across these services: the first one seen for each
    // service becomes its cover.
    supabase
      .from("uploads")
      .select("id, service_id")
      .in("service_id", ids)
      .eq("status", "complete")
      .like("mime_type", "image/%")
      .order("completed_at", { ascending: false })
      .limit(600),
    getMyRegions(),
  ]);
  // Say whose service it is only when there is more than one region to see.
  const regionName = new Map(regions.map((region) => [region.id, region.name]));
  const showRegion = regions.length > 1;

  const personName = new Map(
    (people.data ?? []).map((person) => [person.id, person.full_name]),
  );
  const cover = new Map<string, string>();
  for (const image of images.data ?? []) {
    if (!cover.has(image.service_id)) cover.set(image.service_id, thumb(image.id));
  }
  const fileCount = new Map<string, number>();
  for (const record of uploadRecords) {
    fileCount.set(record.serviceId, (fileCount.get(record.serviceId) ?? 0) + 1);
  }
  const assigned = new Map<string, string[]>();
  for (const assignment of assignments) {
    const names = assigned.get(assignment.serviceId) ?? [];
    const name = personName.get(assignment.profileId) ?? "Someone";
    if (!names.includes(name)) names.push(name);
    assigned.set(assignment.serviceId, names);
  }
  const missing = new Map<string, number>();
  for (const task of outstandingTasks(
    assignments.flatMap((assignment) => assignment.tasks),
    uploadRecords,
  )) {
    missing.set(task.serviceId, (missing.get(task.serviceId) ?? 0) + 1);
  }

  const summarize = (service: (typeof services)[number]): ServiceSummary => ({
    id: service.id,
    name: service.name,
    dateLine: dateLine(service.starts_at),
    relative: relativeDay(service.starts_at, now),
    cover: cover.get(service.id) ?? null,
    ...churchDateParts(service.starts_at),
    fileCount: fileCount.get(service.id) ?? 0,
    assigned: assigned.get(service.id) ?? [],
    missing: missing.get(service.id) ?? 0,
    foldersFailed: service.drive_folder_status === "failed",
    regionName: showRegion ? (regionName.get(service.region_id) ?? null) : null,
  });

  return {
    upcoming: (upcoming.data ?? []).map(summarize),
    past: (past.data ?? []).map(summarize),
  };
}
