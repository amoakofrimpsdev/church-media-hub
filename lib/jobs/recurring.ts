import "server-only";

import { upcomingSlots } from "@/lib/domain/recurrence";
import { ensureServiceFolders } from "@/lib/services/folders";
import { createAdminClient } from "@/lib/supabase/admin";

const UNIQUE_VIOLATION = "23505";

/**
 * Creates the next occurrence of every active recurring service, with its
 * Drive folders. The team is told on the day, not now. Safe to run repeatedly: a unique index on
 * (series, occurrence) means each one is created once.
 */
export async function createRecurringServices(now: Date): Promise<number> {
  const admin = createAdminClient();
  const [{ data: seriesList }, { data: skips }] = await Promise.all([
    admin.from("service_series").select("*").eq("active", true),
    admin.from("service_series_skips").select("series_id, series_slot"),
  ]);
  const skipped = new Set(
    (skips ?? []).map(
      (skip) => `${skip.series_id}:${new Date(skip.series_slot).toISOString()}`,
    ),
  );

  let created = 0;
  for (const series of seriesList ?? []) {
    const slots = upcomingSlots(
      {
        weekday: series.weekday,
        localTime: series.local_time,
        intervalWeeks: series.interval_weeks,
        anchorDate: series.anchor_date,
      },
      now,
    );
    for (const slot of slots) {
      const slotIso = slot.toISOString();
      // An admin deleted this occurrence on purpose.
      if (skipped.has(`${series.id}:${slotIso}`)) continue;

      const { data: service, error } = await admin
        .from("services")
        .insert({
          name: series.name,
          starts_at: slotIso,
          series_id: series.id,
          series_slot: slotIso,
          region_id: series.region_id,
          shared_region_ids: series.shared_region_ids,
        })
        .select("id")
        .single();
      if (error || !service) {
        // Already created on an earlier run: the normal case.
        if (error?.code !== UNIQUE_VIOLATION) {
          console.error("Creating a recurring service failed", error?.message);
        }
        continue;
      }

      created += 1;
      // Announced on the morning of the service, by the notification sweep.
      await ensureServiceFolders(admin, service.id);
    }
  }
  return created;
}

/**
 * Tries again for upcoming services whose Drive folders failed earlier, for
 * example because the Google connection had expired and has since been fixed.
 */
export async function retryFailedFolders(now: Date): Promise<number> {
  const admin = createAdminClient();
  const { data: services } = await admin
    .from("services")
    .select("id")
    .in("drive_folder_status", ["pending", "failed"])
    .gte("starts_at", new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString())
    .limit(20);

  let fixed = 0;
  for (const service of services ?? []) {
    const folders = await ensureServiceFolders(admin, service.id);
    if (folders.ok) fixed += 1;
  }
  return fixed;
}
