import type { Metadata } from "next";
import { RegionsView, type RegionCardData } from "@/components/admin/regions-view";
import { currentTime } from "@/lib/domain/time";
import { getRegionGoogleSummaries } from "@/lib/google/connection";
import { getAllRegions, requireManager } from "@/lib/regions";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getMe } from "@/lib/telegram/client";

export const metadata: Metadata = { title: "Regions" };

const NOTICES: Record<string, { tone: "success" | "danger"; text: string }> = {
  connected: { tone: "success", text: "Connected. New services in that region now keep their files in its own Google Drive." },
  cancelled: { tone: "danger", text: "Google sign-in was cancelled. Nothing changed." },
  drive_permission_missing: {
    tone: "danger",
    text: "Google did not give access to Drive. Try again and tick the Drive box on Google's screen.",
  },
  failed: { tone: "danger", text: "Connecting did not finish. Try again." },
  invalid_state: { tone: "danger", text: "That sign-in link expired. Try again." },
};

export default async function RegionsPage({ searchParams }: PageProps<"/admin/regions">) {
  const params = await searchParams;
  const noticeKey =
    params.connected === "1" ? "connected" : typeof params.error === "string" ? params.error : null;
  const { profile, regions: managed } = await requireManager();
  const isAdmin = profile.role === "admin";
  const supabase = await createClient();
  const managedIds = new Set(managed.map((region) => region.id));

  const [all, members, people, upcoming, telegram, google, me] = await Promise.all([
    getAllRegions(),
    supabase.from("region_members").select("region_id, profile_id, is_region_admin"),
    supabase.from("profiles").select("id, full_name, active"),
    supabase
      .from("services")
      .select("region_id")
      .gte("starts_at", currentTime().toISOString()),
    // Which group each region posts to is server-only.
    createAdminClient().from("regions").select("id, telegram_chat_title, telegram_chat_id"),
    getRegionGoogleSummaries(),
    getMe(),
  ]);

  const personName = new Map(
    (people.data ?? []).filter((person) => person.active).map((person) => [person.id, person.full_name]),
  );
  const groups = new Map((telegram.data ?? []).map((row) => [row.id, row]));

  const cards: RegionCardData[] = all
    // Overall admins see every region (retired ones too); region admins see theirs.
    .filter((region) => isAdmin || managedIds.has(region.id))
    .map((region) => {
      const inRegion = (members.data ?? []).filter(
        (row) => row.region_id === region.id && personName.has(row.profile_id),
      );
      const own = google.get(region.id);
      const group = groups.get(region.id);
      return {
        id: region.id,
        name: region.name,
        active: region.is_active,
        people: inRegion.length,
        upcomingServices: (upcoming.data ?? []).filter((row) => row.region_id === region.id).length,
        admins: inRegion
          .filter((row) => row.is_region_admin)
          .map((row) => personName.get(row.profile_id) ?? "Someone"),
        drive:
          own?.forNewServices
            ? { kind: "own", email: own.accountEmail, expired: own.status === "expired" }
            : { kind: "church" },
        oldDriveEmail: own && !own.forNewServices ? own.accountEmail : null,
        telegram: group?.telegram_chat_id
          ? { kind: "own", title: group.telegram_chat_title ?? "its own group" }
          : { kind: "main" },
      };
    });

  return (
    <RegionsView
      data={{
        regions: cards,
        isAdmin,
        botUsername: me.ok ? me.result.username : null,
        notice: noticeKey ? (NOTICES[noticeKey] ?? NOTICES.failed) : null,
      }}
    />
  );
}
