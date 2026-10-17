import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";
import { getProfile, requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/supabase/database.types";

/**
 * Which regions the signed-in person belongs to, and which they run.
 *
 * Overall admins (role "admin") are in, and run, every region. A region admin
 * runs the regions where their membership says so. Row Level Security
 * enforces the same rules; this is for showing the right screens and failing
 * early with a clear message.
 */

export type RegionAccess = {
  id: string;
  name: string;
  isActive: boolean;
  /** They can manage its services, schedule, people, Drive and Telegram. */
  manages: boolean;
};

export const getMyRegions = cache(async (): Promise<RegionAccess[]> => {
  const profile = await getProfile();
  if (!profile) return [];
  const supabase = await createClient();
  const [regions, memberships] = await Promise.all([
    supabase.from("regions").select("id, name, is_active, sort_order").order("sort_order").order("name"),
    supabase
      .from("region_members")
      .select("region_id, is_region_admin")
      .eq("profile_id", profile.id),
  ]);
  const mine = new Map(
    (memberships.data ?? []).map((row) => [row.region_id, row.is_region_admin]),
  );
  const isAdmin = profile.role === "admin";
  return (regions.data ?? [])
    .filter((region) => isAdmin || mine.has(region.id))
    .map((region) => ({
      id: region.id,
      name: region.name,
      isActive: region.is_active,
      manages: isAdmin || (profile.role !== "viewer" && mine.get(region.id) === true),
    }));
});

/** Every region, for overall admins' screens. */
export async function getAllRegions() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("regions")
    .select("id, name, is_active, sort_order")
    .order("sort_order")
    .order("name");
  return data ?? [];
}

/** Active regions this person runs. */
export async function getManagedRegions(): Promise<RegionAccess[]> {
  return (await getMyRegions()).filter((region) => region.manages && region.isActive);
}

/** True if they run at least one region (or are an overall admin). */
export async function isManager(): Promise<boolean> {
  return (await getManagedRegions()).length > 0;
}

/**
 * For pages and actions that region admins and overall admins share. With a
 * region given, they must run that one.
 */
export async function requireManager(
  regionId?: string,
): Promise<{ profile: Profile; regions: RegionAccess[] }> {
  const profile = await requireProfile();
  const regions = await getManagedRegions();
  const allowed = regionId
    ? profile.role === "admin" || regions.some((region) => region.id === regionId)
    : regions.length > 0;
  if (!allowed) redirect("/dashboard");
  return { profile, regions };
}

/**
 * The region a form chose, if this person may use it. With only one region to
 * choose from, that one.
 */
export function pickRegion(
  regions: RegionAccess[],
  chosen: string | null | undefined,
): RegionAccess | null {
  if (chosen) return regions.find((region) => region.id === chosen) ?? null;
  return regions.length === 1 ? regions[0] : null;
}
