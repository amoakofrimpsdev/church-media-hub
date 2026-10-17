import type { Metadata } from "next";
import { SharesView } from "@/components/admin/shares-view";
import { getAllRegions, requireManager } from "@/lib/regions";
import { describeScope, expiryLabel, shareStatus } from "@/lib/domain/share";
import { currentTime, formatChurchDate, formatChurchDateTime } from "@/lib/domain/time";
import { appUrl } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Shared links" };

/** "Every Baptism album" → "Every Baptism album in OC". */
function inRegion(covers: string, region: string | null): string {
  if (!region) return covers;
  return covers === "The whole gallery" ? `Everything in ${region}` : `${covers} in ${region}`;
}

export default async function SharesPage() {
  await requireManager();
  const supabase = await createClient();
  const now = currentTime();

  const [links, services, categories, people, regions] = await Promise.all([
    supabase
      .from("share_links")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("services").select("id, name, starts_at"),
    supabase.from("categories").select("id, name"),
    supabase.from("profiles").select("id, full_name"),
    getAllRegions(),
  ]);
  const regionName = new Map(regions.map((region) => [region.id, region.name]));
  if (links.error) throw new Error(`Could not load shared links: ${links.error.message}`);

  const service = new Map((services.data ?? []).map((row) => [row.id, row]));
  const category = new Map((categories.data ?? []).map((row) => [row.id, row.name]));
  const person = new Map((people.data ?? []).map((row) => [row.id, row.full_name]));
  const base = appUrl();

  return (
    <SharesView
      data={{
        links: links.data.map((link) => {
          const linkedService = link.service_id ? service.get(link.service_id) : undefined;
          const state = { expiresAt: link.expires_at, revokedAt: link.revoked_at };
          return {
            id: link.id,
            label: link.label,
            covers: inRegion(
              describeScope(
              { serviceId: link.service_id, categoryId: link.category_id },
              {
                category: link.category_id ? category.get(link.category_id) : null,
                service: linkedService
                  ? `${linkedService.name}, ${formatChurchDate(linkedService.starts_at)}`
                  : null,
              },
            ),
              // A service already names its region; anything wider says which.
              !link.service_id && link.region_id ? (regionName.get(link.region_id) ?? null) : null,
            ),
            url: `${base}/s/${link.token}`,
            status: shareStatus(state, now),
            expiry: expiryLabel(state, now),
            allowDownload: link.allow_download,
            viewCount: link.view_count,
            visitorCount: link.visitor_count,
            downloadCount: link.download_count,
            lastViewed: link.last_viewed_at ? formatChurchDateTime(link.last_viewed_at) : null,
            createdBy: link.created_by ? (person.get(link.created_by) ?? null) : null,
          };
        }),
      }}
    />
  );
}
