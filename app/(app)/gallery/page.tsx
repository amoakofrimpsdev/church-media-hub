import type { Metadata } from "next";
import { GalleryView } from "@/components/gallery/gallery-view";
import { requireProfile } from "@/lib/auth";
import { getManagedRegions } from "@/lib/regions";
import {
  dateRangeBounds,
  GALLERY_PAGE_SIZE,
  parseGalleryFilters,
} from "@/lib/domain/gallery";
import { formatChurchDate } from "@/lib/domain/time";
import { GALLERY_COLUMNS, toGalleryItems } from "@/lib/gallery";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Gallery" };

export default async function GalleryPage({
  searchParams,
}: PageProps<"/gallery">) {
  const profile = await requireProfile();
  const managed = await getManagedRegions();
  const filters = parseGalleryFilters(await searchParams);
  const supabase = await createClient();

  // Ask for one more than a page to know whether there is a next page.
  const offset = (filters.page - 1) * GALLERY_PAGE_SIZE;
  let query = supabase
    .from("uploads")
    .select(GALLERY_COLUMNS)
    .eq("status", "complete")
    .order("completed_at", { ascending: false })
    .range(offset, offset + GALLERY_PAGE_SIZE);
  if (filters.categoryId) query = query.eq("category_id", filters.categoryId);
  if (filters.serviceId) query = query.eq("service_id", filters.serviceId);
  const { startsAtFrom, startsAtBefore } = dateRangeBounds(filters);
  if (startsAtFrom) query = query.gte("services.starts_at", startsAtFrom);
  if (startsAtBefore) query = query.lt("services.starts_at", startsAtBefore);

  const [uploads, categories, services] = await Promise.all([
    query,
    supabase.from("categories").select("id, name").order("sort_order"),
    supabase
      .from("services")
      .select("id, name, starts_at")
      .order("starts_at", { ascending: false })
      .limit(100),
  ]);
  if (uploads.error) throw new Error(`Could not load the gallery: ${uploads.error.message}`);

  const hasNextPage = uploads.data.length > GALLERY_PAGE_SIZE;
  const items = await toGalleryItems(uploads.data.slice(0, GALLERY_PAGE_SIZE));

  return (
    <GalleryView
      data={{
        filters,
        categories: categories.data ?? [],
        services: (services.data ?? []).map((service) => ({
          id: service.id,
          label: `${formatChurchDate(service.starts_at)} · ${service.name}`,
        })),
        items,
        hasNextPage,
        canDelete: managed.length > 0,
        canShare: managed.length > 0,
        shareRegions: managed.map(({ id, name }) => ({ id, name })),
        shareAllRegions: profile.role === "admin",
      }}
    />
  );
}
