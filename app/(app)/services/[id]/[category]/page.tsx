import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AlbumView } from "@/components/gallery/album-view";
import { requireProfile } from "@/lib/auth";
import { getManagedRegions } from "@/lib/regions";
import { can } from "@/lib/domain/permissions";
import { formatChurchDate } from "@/lib/domain/time";
import { GALLERY_COLUMNS, toGalleryItems } from "@/lib/gallery";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/uploads/api";

export const metadata: Metadata = { title: "Album" };

// An album shows everything for one service and category. A single service
// rarely has more than a few hundred files per category.
const ALBUM_LIMIT = 1000;

export default async function AlbumPage({
  params,
}: PageProps<"/services/[id]/[category]">) {
  const profile = await requireProfile();
  const { id, category: slug } = await params;
  if (!isUuid(id) || !/^[a-z0-9-]{1,60}$/.test(slug)) notFound();

  const supabase = await createClient();
  const [service, category] = await Promise.all([
    supabase.from("services").select("id, name, starts_at, region_id").eq("id", id).maybeSingle(),
    supabase.from("categories").select("id, name").eq("slug", slug).maybeSingle(),
  ]);
  if (!service.data || !category.data) notFound();
  const regionId = service.data.region_id;
  const manages = (await getManagedRegions()).some((region) => region.id === regionId);

  // Row Level Security returns no rows for a category this person cannot see.
  const uploads = await supabase
    .from("uploads")
    .select(GALLERY_COLUMNS)
    .eq("service_id", id)
    .eq("category_id", category.data.id)
    .eq("status", "complete")
    .order("completed_at", { ascending: false })
    .limit(ALBUM_LIMIT);
  if (uploads.error) throw new Error(`Could not load the album: ${uploads.error.message}`);

  const items = await toGalleryItems(uploads.data);

  return (
    <AlbumView
      data={{
        serviceId: id,
        serviceName: service.data.name,
        categoryId: category.data.id,
        categoryName: category.data.name,
        dateLine: formatChurchDate(service.data.starts_at),
        items,
        canUpload: can(profile.role, "upload_media"),
        canDelete: manages,
        canShare: manages,
      }}
    />
  );
}
