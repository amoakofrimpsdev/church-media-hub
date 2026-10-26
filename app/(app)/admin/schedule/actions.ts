"use server";

import { revalidatePath } from "next/cache";
import { readAlsoFor } from "@/components/ui/also-for";
import { getAllRegions, pickRegion, requireManager } from "@/lib/regions";
import { WEEKDAYS } from "@/lib/domain/recurrence";
import type { FormState } from "@/lib/form-state";
import { runScheduledJobs } from "@/lib/jobs/run";
import { createClient } from "@/lib/supabase/server";

const GENERIC_ERROR = "Could not save. Check your connection and try again.";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export async function createSeries(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const { profile: admin, regions } = await requireManager();
  const region = pickRegion(regions, field(formData, "region"));
  if (!region) return { error: "Choose which region it is for." };

  const name = field(formData, "name");
  if (!name) return { error: "Give the service a name." };
  if (name.length > 80) return { error: "Keep the name under 80 characters." };

  const weekday = Number(field(formData, "weekday"));
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    return { error: "Choose a day of the week." };
  }
  const time = field(formData, "time");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    return { error: "Choose a valid time." };
  }

  const intervalWeeks = Number(field(formData, "interval_weeks") || "1");
  if (![1, 2, 3, 4].includes(intervalWeeks)) return { error: "Choose how often it repeats." };

  // Not every week: the first date fixes which weeks it falls on.
  let anchorDate: string | null = null;
  if (intervalWeeks > 1) {
    anchorDate = field(formData, "anchor_date");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(anchorDate) || Number.isNaN(Date.parse(anchorDate))) {
      return { error: "Choose the date of the first one." };
    }
    const anchorWeekday = new Date(`${anchorDate}T12:00:00Z`).getUTCDay();
    if (anchorWeekday !== weekday) {
      return {
        error: `That date is a ${WEEKDAYS[anchorWeekday]}. Pick a ${WEEKDAYS[weekday]}.`,
      };
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.from("service_series").insert({
    name,
    weekday,
    local_time: time,
    interval_weeks: intervalWeeks,
    anchor_date: anchorDate,
    created_by: admin.id,
    region_id: region.id,
    shared_region_ids: readAlsoFor(
      formData,
      (await getAllRegions()).map((entry) => entry.id),
      region.id,
    ),
  });
  if (error) return { error: GENERIC_ERROR };

  revalidatePath("/admin/schedule");
  return {
    success: `Added. The next ${name} will be created within 15 minutes, or tap “Run now”.`,
  };
}

export async function updateSeries(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireManager();

  const id = field(formData, "series_id");
  const intent = field(formData, "intent");
  if (!id) return { error: "Recurring service not found." };

  const supabase = await createClient();
  const { error } =
    intent === "delete"
      ? await supabase.from("service_series").delete().eq("id", id)
      : await supabase
          .from("service_series")
          .update({ active: intent === "resume" })
          .eq("id", id);
  if (error) return { error: GENERIC_ERROR };

  revalidatePath("/admin/schedule");
  return {};
}

/** Runs the scheduled jobs immediately, for testing or after fixing a problem. */
export async function runJobsNow(
  _previous: FormState,
  _formData: FormData,
): Promise<FormState> {
  void _previous;
  void _formData;
  await requireManager();

  const result = await runScheduledJobs();
  revalidatePath("/admin/schedule");
  revalidatePath("/services");
  revalidatePath("/dashboard");

  if (result.failed.length > 0) {
    return { error: `Ran, but these steps failed: ${result.failed.join(", ")}.` };
  }
  return { success: "Ran. Details are below." };
}
