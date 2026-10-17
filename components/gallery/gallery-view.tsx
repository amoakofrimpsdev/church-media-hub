import { ChevronLeft, ChevronRight, ImageOff, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { ShareButton } from "@/components/share/share-button";
import { buttonClasses } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/cn";
import { galleryHref, hasFilters, type GalleryFilters } from "@/lib/domain/gallery";
import { GalleryGrid } from "./gallery-grid";
import type { GalleryItem } from "./types";

export type GalleryData = {
  filters: GalleryFilters;
  categories: { id: string; name: string }[];
  services: { id: string; label: string }[];
  items: GalleryItem[];
  hasNextPage: boolean;
  canDelete: boolean;
  /** Admins can make a link to the chosen category, or the whole gallery. */
  canShare: boolean;
};

/** Every photo and video the person may see, newest first, with filters. */
export function GalleryView({ data }: { data: GalleryData }) {
  const { filters } = data;
  const filtered = hasFilters(filters);
  const sharedCategory = data.categories.find(
    (category) => category.id === filters.categoryId,
  )?.name;
  // Service and dates are the less common filters, so they start folded away
  // unless one is in use.
  const moreOpen = Boolean(filters.serviceId || filters.from || filters.to);

  const chip = (active: boolean) =>
    cn(
      "flex h-10 shrink-0 items-center rounded-full border px-4 text-body-sm font-bold transition-colors",
      active
        ? "border-ink bg-ink text-canvas"
        : "border-hairline text-ink-soft hover:border-border-strong hover:text-ink",
    );

  return (
    <div className="stagger flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-display text-ink tablet:text-hero">Gallery</h1>
        {data.canShare ? (
          // The link covers the chosen category in every service, or with
          // "All" chosen, the whole gallery. Service and date filters are for
          // browsing and are not part of the link.
          <ShareButton
            key={filters.categoryId ?? "all"}
            categoryId={filters.categoryId ?? undefined}
            covers={sharedCategory ? `Every ${sharedCategory} album` : "The whole gallery"}
            wide
          />
        ) : null}
      </header>

      <div className="flex flex-col gap-3">
        {/* One tap per category: the filter people use most. */}
        <nav
          aria-label="Category"
          className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 tablet:mx-0 tablet:flex-wrap tablet:px-0"
        >
          <Link
            href={galleryHref({ ...filters, categoryId: null }, 1)}
            aria-current={filters.categoryId === null ? "true" : undefined}
            className={chip(filters.categoryId === null)}
          >
            All
          </Link>
          {data.categories.map((category) => (
            <Link
              key={category.id}
              href={galleryHref({ ...filters, categoryId: category.id }, 1)}
              aria-current={filters.categoryId === category.id ? "true" : undefined}
              className={chip(filters.categoryId === category.id)}
            >
              {category.name}
            </Link>
          ))}
        </nav>

        <details open={moreOpen} className="group rounded-lg bg-surface shadow-card">
          <summary className="flex cursor-pointer list-none items-center gap-2 p-3 text-body-sm font-bold text-ink-soft">
            <SlidersHorizontal aria-hidden size={16} />
            Service and dates
          </summary>
          <form
            action="/gallery"
            className="grid grid-cols-2 items-end gap-3 border-t border-hairline p-3 tablet:grid-cols-4"
          >
            {filters.categoryId ? (
              <input type="hidden" name="category" value={filters.categoryId} />
            ) : null}
            <div className="col-span-2 tablet:col-span-1">
              <Select label="Service" name="service" defaultValue={filters.serviceId ?? ""}>
                <option value="">All services</option>
                {data.services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.label}
                  </option>
                ))}
              </Select>
            </div>
            <Input label="From" name="from" type="date" defaultValue={filters.from ?? ""} />
            <Input label="To" name="to" type="date" defaultValue={filters.to ?? ""} />
            <div className="col-span-2 flex gap-2 tablet:col-span-1">
              <button type="submit" className={buttonClasses("primary", "md", "flex-1")}>
                Apply
              </button>
              {filtered ? (
                <Link href="/gallery" className={buttonClasses("ghost", "md")}>
                  Clear
                </Link>
              ) : null}
            </div>
          </form>
        </details>
      </div>

      {data.items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg bg-surface shadow-card p-10 text-center">
          <ImageOff aria-hidden size={28} className="text-muted-soft" />
          <p className="text-body-sm text-muted">
            {filtered
              ? "Nothing matches those filters. Try a wider date range or another category."
              : "No photos or videos yet. They appear here as soon as they are uploaded."}
          </p>
        </div>
      ) : (
        <GalleryGrid items={data.items} canDelete={data.canDelete} />
      )}

      {filters.page > 1 || data.hasNextPage ? (
        <nav aria-label="Pages" className="flex items-center justify-between gap-3">
          {filters.page > 1 ? (
            <Link
              href={galleryHref(filters, filters.page - 1)}
              className={buttonClasses("secondary", "sm")}
            >
              <ChevronLeft aria-hidden size={16} />
              Newer
            </Link>
          ) : (
            <span />
          )}
          <span className="text-caption text-muted">Page {filters.page}</span>
          {data.hasNextPage ? (
            <Link
              href={galleryHref(filters, filters.page + 1)}
              className={buttonClasses("secondary", "sm")}
            >
              Older
              <ChevronRight aria-hidden size={16} />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}
