"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { requireProfile } from "@/lib/auth";
import { managesService, pickRegion, requireManager } from "@/lib/regions";
import { churchLocalToUtc, serviceFolderName } from "@/lib/domain/time";
import { getDriveSession } from "@/lib/google/connection";
import { DriveError, moveToBin, renameFile } from "@/lib/google/drive";
import type { FormState } from "@/lib/form-state";
import {
  sendDueNotifications,
  sendUploadReminder,
} from "@/lib/notifications/telegram";
import { ensureServiceFolders } from "@/lib/services/folders";
import { createClient } from "@/lib/supabase/server";

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export async function createService(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const { profile: admin, regions } = await requireManager();
  const region = pickRegion(regions, text(formData, "region"));
  if (!region) return { error: "Choose which region the service is for." };

  const name = text(formData, "name");
  if (!name) return { error: "Give the service a name." };
  if (name.length > 80) return { error: "Keep the name under 80 characters." };

  const startsAt = churchLocalToUtc(text(formData, "date"), text(formData, "time"));
  if (!startsAt) return { error: "Choose a valid date and time." };

  const supabase = await createClient();
  const { data: service, error } = await supabase
    .from("services")
    .insert({
      name,
      starts_at: startsAt.toISOString(),
      created_by: admin.id,
      region_id: region.id,
    })
    .select("id")
    .single();
  if (error || !service) {
    return { error: "Could not save the service. Check your connection and try again." };
  }

  // The service is saved either way. If Drive fails, the service page shows
  // why and offers a retry, so a Google hiccup never loses the service.
  // The team group hears about it on the morning of the service (scheduled
  // job), not now. A service created for today is announced within minutes.
  await ensureServiceFolders(supabase, service.id);
  after(() => sendDueNotifications());

  // Everything, including the shell: the new service belongs in the upload
  // sheet's list straight away.
  revalidatePath("/", "layout");
  redirect(`/services/${service.id}`);
}

export async function retryServiceFolders(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireManager();

  const serviceId = text(formData, "service_id");
  if (!serviceId) return { error: "Service not found." };
  if (!(await managesService(serviceId))) return { error: NOT_YOURS };

  const supabase = await createClient();
  const result = await ensureServiceFolders(supabase, serviceId);

  revalidatePath(`/services/${serviceId}`);
  revalidatePath("/services");
  if (!result.ok) return { error: result.message };
  after(() => sendDueNotifications());
  return { success: "Drive folders are ready." };
}

const UNIQUE_VIOLATION = "23505";
const NOT_YOURS = "Only an admin of this service's region can do that.";
const GENERIC_ERROR = "Could not save. Check your connection and try again.";

function refreshService(serviceId: string): void {
  revalidatePath(`/services/${serviceId}`);
  revalidatePath("/services");
  revalidatePath("/dashboard");
  revalidatePath("/handoffs");
}

export async function updateService(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireManager();

  const serviceId = text(formData, "service_id");
  const name = text(formData, "name");
  if (!serviceId) return { error: "Service not found." };
  if (!name) return { error: "Give the service a name." };
  if (name.length > 80) return { error: "Keep the name under 80 characters." };

  const startsAt = churchLocalToUtc(text(formData, "date"), text(formData, "time"));
  if (!startsAt) return { error: "Choose a valid date and time." };

  const supabase = await createClient();
  const { data: service, error } = await supabase
    .from("services")
    .update({ name, starts_at: startsAt.toISOString() })
    .eq("id", serviceId)
    .select("drive_folder_id, drive_region_id")
    .maybeSingle();
  if (error || !service) return { error: GENERIC_ERROR };

  // Keep the Drive folder's name in step. If Google is unreachable the service
  // is still updated; only the folder keeps its old name.
  let folderRenamed = true;
  if (service.drive_folder_id) {
    try {
      const { accessToken } = await getDriveSession(service.drive_region_id);
      await renameFile(
        accessToken,
        service.drive_folder_id,
        serviceFolderName(name, startsAt),
      );
    } catch (renameError) {
      console.error("Renaming the Drive folder failed", renameError);
      folderRenamed = false;
    }
  }

  refreshService(serviceId);
  return {
    success: folderRenamed
      ? "Saved."
      : "Saved. The Google Drive folder kept its old name because Drive could not be reached.",
  };
}

export async function deleteService(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireManager();

  const serviceId = text(formData, "service_id");
  if (!serviceId) return { error: "Service not found." };
  // Before Drive: being able to see a service is not enough to bin its folder.
  if (!(await managesService(serviceId))) return { error: NOT_YOURS };

  const supabase = await createClient();
  const [{ data: service }, { count }] = await Promise.all([
    supabase
      .from("services")
      .select("name, drive_folder_id, drive_region_id, series_id, series_slot")
      .eq("id", serviceId)
      .maybeSingle(),
    supabase
      .from("uploads")
      .select("id", { count: "exact", head: true })
      .eq("service_id", serviceId),
  ]);
  if (!service) return { error: "Service not found." };
  const uploadCount = count ?? 0;

  // Deleting uploads is serious, so the admin must type the service's name.
  if (uploadCount > 0 && text(formData, "confirm_name") !== service.name) {
    return {
      error: `Type the service name exactly (${service.name}) to confirm.`,
    };
  }

  // Drive first. The folder, with everything in it, goes to the Drive bin,
  // where it can be restored for 30 days. If that fails while there are files,
  // stop: otherwise the records would be gone but the files left behind with
  // nothing pointing at them.
  if (service.drive_folder_id) {
    try {
      const { accessToken } = await getDriveSession(service.drive_region_id);
      await moveToBin(accessToken, service.drive_folder_id);
    } catch (binError) {
      if (!(binError instanceof DriveError && binError.status === 404)) {
        console.error("Moving the Drive folder to the bin failed", binError);
        if (uploadCount > 0) {
          return {
            error:
              "Could not reach Google Drive, so nothing was deleted. Check the Google connection under Admin and try again.",
          };
        }
      }
    }
  }

  // If the weekly schedule created this service, remember that this
  // occurrence was removed on purpose, or the next run would recreate it.
  if (service.series_id && service.series_slot) {
    const skip = await supabase.from("service_series_skips").upsert({
      series_id: service.series_id,
      series_slot: service.series_slot,
    });
    if (skip.error) return { error: GENERIC_ERROR };
  }

  if (uploadCount > 0) {
    const removed = await supabase.from("uploads").delete().eq("service_id", serviceId);
    if (removed.error) return { error: GENERIC_ERROR };
  }
  const { error } = await supabase.from("services").delete().eq("id", serviceId);
  if (error) return { error: GENERIC_ERROR };

  revalidatePath("/", "layout");
  redirect("/services");
}

/** An admin removes one photo or video. */
export async function deleteUpload(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireManager();

  const uploadId = text(formData, "upload_id");
  if (!uploadId) return { error: "File not found." };

  const supabase = await createClient();
  const { data: upload } = await supabase
    .from("uploads")
    .select("id, service_id, drive_file_id, services!inner(drive_region_id)")
    .eq("id", uploadId)
    .maybeSingle();
  if (!upload) return { error: "That file has already been deleted." };
  // Before Drive: being able to see a file is not enough to bin it.
  if (!(await managesService(upload.service_id))) return { error: NOT_YOURS };

  // To the Drive bin first (restorable for 30 days), then the record. If
  // Drive cannot be reached, leave both alone.
  if (upload.drive_file_id) {
    try {
      const { accessToken } = await getDriveSession(upload.services.drive_region_id);
      await moveToBin(accessToken, upload.drive_file_id);
    } catch (binError) {
      // Already gone from Drive is fine: carry on and remove the record.
      if (!(binError instanceof DriveError && binError.status === 404)) {
        console.error("Moving a file to the Drive bin failed", binError);
        return {
          error: "Could not reach Google Drive, so the file was not deleted. Try again.",
        };
      }
    }
  }

  const { error } = await supabase.from("uploads").delete().eq("id", upload.id);
  if (error) return { error: GENERIC_ERROR };

  // Albums, the gallery, counts and handoffs can all change.
  revalidatePath("/", "layout");
  return {};
}

export async function addAssignment(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireManager();

  const serviceId = text(formData, "service_id");
  const profileId = text(formData, "profile_id");
  const dutyRoleId = text(formData, "duty_role_id");
  const categoryIds = formData
    .getAll("category_ids")
    .filter((value): value is string => typeof value === "string" && value !== "");
  if (!serviceId) return { error: "Service not found." };
  if (!profileId) return { error: "Choose a person." };
  if (!dutyRoleId) return { error: "Choose what they are doing." };
  if (categoryIds.length === 0) {
    return { error: "Tick at least one category they should upload." };
  }
  if (!(await managesService(serviceId))) return { error: NOT_YOURS };

  const supabase = await createClient();
  const { data: assignment, error } = await supabase
    .from("assignments")
    .insert({ service_id: serviceId, profile_id: profileId, duty_role_id: dutyRoleId })
    .select("id")
    .single();
  if (error || !assignment) {
    if (error?.code === UNIQUE_VIOLATION) {
      return { error: "They already have that role at this service. Remove it first to change it." };
    }
    return { error: GENERIC_ERROR };
  }

  const { error: categoriesError } = await supabase
    .from("assignment_categories")
    .insert(
      categoryIds.map((categoryId) => ({
        assignment_id: assignment.id,
        category_id: categoryId,
      })),
    );
  if (categoriesError) {
    // Do not leave an assignment with no categories behind.
    await supabase.from("assignments").delete().eq("id", assignment.id);
    return { error: GENERIC_ERROR };
  }

  refreshService(serviceId);
  return { success: "Assigned." };
}

export async function removeAssignment(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireManager();

  const assignmentId = text(formData, "assignment_id");
  const serviceId = text(formData, "service_id");
  if (!assignmentId) return { error: "Assignment not found." };

  const supabase = await createClient();
  const { error } = await supabase.from("assignments").delete().eq("id", assignmentId);
  if (error) return { error: GENERIC_ERROR };

  if (serviceId) refreshService(serviceId);
  return {};
}

export async function setTaskDone(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireProfile();

  const assignmentId = text(formData, "assignment_id");
  const categoryId = text(formData, "category_id");
  const serviceId = text(formData, "service_id");
  if (!assignmentId || !categoryId) return { error: "Task not found." };

  // The database function checks the caller owns the task (or is an admin).
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_task_done", {
    p_assignment_id: assignmentId,
    p_category_id: categoryId,
    p_done: text(formData, "done") === "true",
  });
  if (error) {
    return {
      error: error.message.includes("not_allowed")
        ? "Only the person assigned, or an admin, can change this task."
        : GENERIC_ERROR,
    };
  }

  // Marking a task done can make a category ready for its team.
  after(() => sendDueNotifications());

  if (serviceId) refreshService(serviceId);
  return {};
}

const REMINDER_OUTCOMES: Record<string, FormState> = {
  sent: { success: "Reminder posted in the Telegram group." },
  nothing_outstanding: { success: "Nobody has anything outstanding, so nothing was sent." },
  not_linked: {
    error: "Telegram is not set up yet. Finish the steps under Admin → Telegram.",
  },
  already_sent: { error: "Telegram did not accept the message. Try again in a minute." },
  failed: { error: "Could not send the reminder. Try again." },
};

/** An admin presses "Send reminder now" on a service page. */
export async function sendReminderNow(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireManager();
  const serviceId = text(formData, "service_id");
  if (!serviceId) return { error: "Service not found." };
  // The bot posts with its own account, so check here, not in the database.
  if (!(await managesService(serviceId))) return { error: NOT_YOURS };

  // A fresh key each minute: pressing twice by accident sends once.
  const minute = new Date().toISOString().slice(0, 16);
  const outcome = await sendUploadReminder(
    serviceId,
    `upload_reminder:${serviceId}:manual:${minute}`,
  );
  return REMINDER_OUTCOMES[outcome] ?? REMINDER_OUTCOMES.failed;
}

export async function setHandoffReceived(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireProfile();

  const handoffId = text(formData, "handoff_id");
  const serviceId = text(formData, "service_id");
  if (!handoffId) return { error: "Handoff not found." };

  // The database function checks the caller is on the receiving team (or an admin).
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_handoff_received", {
    p_handoff_id: handoffId,
    p_received: text(formData, "received") === "true",
  });
  if (error) {
    return {
      error: error.message.includes("not_allowed")
        ? "Only someone on the receiving team, or an admin, can do this."
        : GENERIC_ERROR,
    };
  }

  if (serviceId) refreshService(serviceId);
  else revalidatePath("/handoffs");
  return {};
}
