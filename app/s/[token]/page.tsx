import type { Metadata } from "next";
import { cookies } from "next/headers";
import type { GalleryItem } from "@/components/gallery/types";
import { ShareUnavailable, ShareView } from "@/components/share/share-view";
import { GALLERY_PAGE_SIZE } from "@/lib/domain/gallery";
import { scopeKind } from "@/lib/domain/share";
import { formatChurchDate } from "@/lib/domain/time";
import { isVideo } from "@/lib/domain/uploads";
import { findActiveShare } from "@/lib/share/server";
import { SHARE_VISITOR_COOKIE } from "@/lib/share/visitor";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/uploads/api";

// Private links must not be indexed, and their address must not be passed to
// other sites (Google Drive, for one) when a visitor follows a link out.
export const metadata: Metadata = {
  title: "Shared with you",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function SharePage({
  params,
  searchParams,
}: PageProps<"/s/[token]">) {
  const { token } = await params;
  const share = await findActiveShare(token);
  if (!share) return <ShareUnavailable />;

  const query = await searchParams;
  const requestedPage = Number.parseInt(
    typeof query.page === "string" ? query.page : "1",
    10,
  );
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 1 ? requestedPage : 1;
  const requestedCategory = typeof query.category === "string" ? query.category : null;

  // No account, so no Row Level Security to lean on: the secret key is used
  // and every query below is narrowed to what this link covers.
  const admin = createAdminClient();
  const scope = { serviceId: share.service_id, categoryId: share.category_id };
  const kind = scopeKind(scope);

  const [service, categories] = await Promise.all([
    share.service_id
      ? admin
          .from("services")
          .select("name, starts_at")
          .eq("id", share.service_id)
          .maybeSingle()
      : null,
    admin.from("categories").select("id, name, slug").order("sort_order"),
  ]);
  const allCategories = categories.data ?? [];
  const scopedCategory = allCategories.find((category) => category.id === share.category_id);
  // A visitor can narrow a multi-category link to one category.
  const filterCategory =
    !share.category_id && requestedCategory
      ? allCategories.find((category) => category.slug === requestedCategory)
      : undefined;

  const narrow = <Q extends { eq: (column: string, value: string) => Q }>(q: Q): Q => {
    let narrowed = q.eq("status", "complete");
    if (share.service_id) narrowed = narrowed.eq("service_id", share.service_id);
    if (share.category_id) narrowed = narrowed.eq("category_id", share.category_id);
    return narrowed;
  };

  const offset = (page - 1) * GALLERY_PAGE_SIZE;
  let itemsQuery = narrow(
    admin
      .from("uploads")
      .select("id, file_name, mime_type, size_bytes, category_id, services!inner(name, starts_at)"),
  )
    .order("completed_at", { ascending: false })
    .range(offset, offset + GALLERY_PAGE_SIZE);
  if (filterCategory) itemsQuery = itemsQuery.eq("category_id", filterCategory.id);

  const [items, total, present] = await Promise.all([
    itemsQuery,
    narrow(admin.from("uploads").select("id", { count: "exact", head: true })),
    // Which categories actually have files, for the filter chips.
    share.category_id
      ? null
      : narrow(admin.from("uploads").select("category_id")).limit(1000),
  ]);
  if (items.error) return <ShareUnavailable />;

  // Count this visit (first page only, so paging does not inflate it).
  if (page === 1 && !filterCategory) {
    const visitor = (await cookies()).get(SHARE_VISITOR_COOKIE)?.value;
    await admin.rpc("record_share_view", {
      p_share_id: share.id,
      p_visitor_id: visitor && isUuid(visitor) ? visitor : null,
    });
  }

  const categoryName = new Map(allCategories.map((category) => [category.id, category.name]));
  const base = `/api/share/${share.token}`;
  const rows = items.data.slice(0, GALLERY_PAGE_SIZE);
  const galleryItems: GalleryItem[] = rows.map((row) => {
    const file = share.allow_download ? `${base}/file/${row.id}` : null;
    return {
      id: row.id,
      fileName: row.file_name,
      isVideo: isVideo(row.mime_type),
      sizeBytes: row.size_bytes,
      caption: [
        categoryName.get(row.category_id),
        row.services.name,
        formatChurchDate(row.services.starts_at),
      ]
        .filter(Boolean)
        .join(" · "),
      uploadedBy: null,
      urls: {
        small: `${base}/thumb/${row.id}?size=400`,
        large: `${base}/thumb/${row.id}?size=1600`,
        download: file,
        // Videos play in Google Drive, which means handing over the file, so
        // that follows the same switch as downloads.
        view: file,
      },
    };
  });

  const serviceLine = service?.data
    ? `${service.data.name} · ${formatChurchDate(service.data.starts_at)}`
    : null;
  const title =
    kind === "album" || kind === "category"
      ? (scopedCategory?.name ?? "Photos")
      : kind === "service"
        ? (service?.data?.name ?? "Photos")
        : "RCW Media gallery";
  const subtitle =
    kind === "album"
      ? (serviceLine ?? "One service")
      : kind === "category"
        ? "From every service"
        : kind === "service"
          ? formatChurchDate(service?.data?.starts_at ?? new Date())
          : "Every service and category";

  const presentIds = new Set((present?.data ?? []).map((row) => row.category_id));

  return (
    <ShareView
      data={{
        token: share.token,
        title,
        subtitle,
        totalFiles: total.count ?? 0,
        allowDownload: share.allow_download,
        categories: allCategories
          .filter((category) => presentIds.has(category.id))
          .map((category) => ({ slug: category.slug, name: category.name })),
        activeCategory: filterCategory?.slug ?? null,
        items: galleryItems,
        page,
        hasNextPage: items.data.length > GALLERY_PAGE_SIZE,
      }}
    />
  );
}
