import { ChevronLeft, ChevronRight, ImageOff, LinkIcon } from "lucide-react";
import Link from "next/link";
import { GalleryGrid } from "@/components/gallery/gallery-grid";
import { Logo } from "@/components/ui/logo";
import type { GalleryItem } from "@/components/gallery/types";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export type ShareData = {
  token: string;
  /** "Baptism", "Sunday Service", "RCW Media gallery" */
  title: string;
  /** "Sunday Service · Sun, Oct 12, 2025", or "From every service". */
  subtitle: string;
  totalFiles: number;
  allowDownload: boolean;
  /** Present when the link covers several categories, to filter by one. */
  categories: { slug: string; name: string }[];
  activeCategory: string | null;
  items: GalleryItem[];
  page: number;
  hasNextPage: boolean;
};

const href = (token: string, category: string | null, page: number) => {
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return `/s/${token}${query ? `?${query}` : ""}`;
};

function Brand() {
  return (
    <div className="flex items-center gap-2 text-title text-ink">
      <Logo size={36} />
      RCW Media
    </div>
  );
}

/** What someone sees when they open a share link. No sign-in, no app chrome. */
export function ShareView({ data }: { data: ShareData }) {
  const chip = (active: boolean) =>
    cn(
      "flex h-10 shrink-0 items-center rounded-full border px-4 text-body-sm font-bold transition-colors",
      active
        ? "border-ink bg-ink text-canvas"
        : "border-hairline text-ink-soft hover:border-border-strong hover:text-ink",
    );

  return (
    <main className="relative flex min-h-dvh flex-1 flex-col">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(60%_100%_at_20%_0%,var(--color-primary-soft),transparent_70%)]"
      />
      <div className="relative mx-auto flex w-full max-w-[1200px] flex-1 flex-col gap-6 px-4 py-6 tablet:px-8 tablet:py-10">
        <Brand />

        <header className="stagger flex flex-col gap-2">
          <p className="text-label text-primary uppercase">Shared with you</p>
          <h1 className="text-display text-ink tablet:text-hero">{data.title}</h1>
          <p className="text-body-sm text-muted">
            {data.subtitle} · {data.totalFiles.toLocaleString("en-US")}{" "}
            {data.totalFiles === 1 ? "file" : "files"}
          </p>
        </header>

        {data.categories.length > 1 ? (
          <nav
            aria-label="Category"
            className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 tablet:mx-0 tablet:flex-wrap tablet:px-0"
          >
            <Link
              href={href(data.token, null, 1)}
              aria-current={data.activeCategory === null ? "true" : undefined}
              className={chip(data.activeCategory === null)}
            >
              All
            </Link>
            {data.categories.map((category) => (
              <Link
                key={category.slug}
                href={href(data.token, category.slug, 1)}
                aria-current={data.activeCategory === category.slug ? "true" : undefined}
                className={chip(data.activeCategory === category.slug)}
              >
                {category.name}
              </Link>
            ))}
          </nav>
        ) : null}

        {data.items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg bg-surface shadow-card p-10 text-center">
            <ImageOff aria-hidden size={28} className="text-muted-soft" />
            <p className="text-body-sm text-muted">
              Nothing here yet. Photos appear as soon as the media team uploads
              them.
            </p>
          </div>
        ) : (
          <GalleryGrid items={data.items} shared />
        )}

        {data.page > 1 || data.hasNextPage ? (
          <nav aria-label="Pages" className="flex items-center justify-between gap-3">
            {data.page > 1 ? (
              <Link
                href={href(data.token, data.activeCategory, data.page - 1)}
                className={buttonClasses("secondary", "sm")}
              >
                <ChevronLeft aria-hidden size={16} />
                Newer
              </Link>
            ) : (
              <span />
            )}
            <span className="text-caption text-muted">Page {data.page}</span>
            {data.hasNextPage ? (
              <Link
                href={href(data.token, data.activeCategory, data.page + 1)}
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

        <footer className="mt-auto pt-6 text-caption text-muted-soft">
          {data.allowDownload
            ? "Tap a photo to see it full size and download it."
            : "Tap a photo to see it full size. Downloads are turned off for this link."}{" "}
          This is a private link from the RCW media team. Please do not pass it on.
        </footer>
      </div>
    </main>
  );
}

/** Shown for a link that is wrong, expired or turned off. Says nothing more. */
export function ShareUnavailable() {
  return (
    <main className="flex min-h-dvh flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <Brand />
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-strong text-muted">
        <LinkIcon aria-hidden size={24} />
      </span>
      <div className="flex max-w-sm flex-col gap-2">
        <h1 className="text-title-lg text-ink">This link is not available</h1>
        <p className="text-body-sm text-muted">
          It may have expired or been turned off. Ask the person who sent it to
          you for a new one.
        </p>
      </div>
    </main>
  );
}
