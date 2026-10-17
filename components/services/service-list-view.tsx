import { CalendarPlus } from "lucide-react";
import Link from "next/link";
import { AvatarStack } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import type { ServiceSummary } from "./types";

export function ServiceListView({
  upcoming,
  past,
  canManage,
}: {
  upcoming: ServiceSummary[];
  past: ServiceSummary[];
  canManage: boolean;
}) {
  return (
    <div className="stagger flex flex-col gap-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-display text-ink tablet:text-hero">Services</h1>
        {canManage ? (
          <Link href="/services/new" className={buttonClasses("primary")}>
            <CalendarPlus aria-hidden size={18} />
            New service
          </Link>
        ) : null}
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-title-lg text-ink">Upcoming</h2>
        {upcoming.length === 0 ? (
          <p className="rounded-lg bg-surface shadow-card p-6 text-body-sm text-muted">
            {canManage
              ? "Nothing scheduled. Create the next service, or set up a weekly one under Admin, Schedule."
              : "Nothing scheduled yet."}
          </p>
        ) : (
          <ServiceGrid services={upcoming} />
        )}
      </section>

      {past.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-title-lg text-ink">Past</h2>
          <ServiceGrid services={past} />
        </section>
      ) : null}
    </div>
  );
}

function ServiceGrid({ services }: { services: ServiceSummary[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 tablet:grid-cols-3 tablet:gap-4 desktop:grid-cols-4">
      {services.map((service) => (
        <li key={service.id}>
          <Link
            href={`/services/${service.id}`}
            className="group flex h-full flex-col gap-3 rounded-lg bg-surface shadow-card p-3 transition-colors hover:bg-surface-soft"
          >
            <span className="relative block aspect-square overflow-hidden rounded-md bg-surface-strong">
              {service.cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={service.cover}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              ) : (
                // No photo yet: the date stands in as the cover.
                <span className="flex h-full flex-col items-center justify-center bg-[radial-gradient(120%_120%_at_0%_0%,var(--color-primary-soft),transparent_60%)]">
                  <span className="text-label text-primary uppercase">{service.weekday}</span>
                  <span className="text-[3.5rem] leading-none font-extrabold text-ink">
                    {service.day}
                  </span>
                  <span className="text-label text-muted uppercase">{service.month}</span>
                </span>
              )}
              <span className="absolute top-2 left-2">
                <Badge className="bg-black/70 text-white">{service.relative}</Badge>
              </span>
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="truncate text-title text-ink">{service.name}</span>
              <span className="text-caption text-muted">{service.dateLine}</span>
            </span>
            <span className="mt-auto flex items-center justify-between gap-2">
              {service.assigned.length > 0 ? (
                <AvatarStack names={service.assigned} max={3} />
              ) : (
                <span className="text-caption text-muted-soft">Nobody assigned</span>
              )}
              <span className="text-caption text-muted tabular-nums">
                {service.fileCount.toLocaleString("en-US")}{" "}
                {service.fileCount === 1 ? "file" : "files"}
              </span>
            </span>
            {service.missing > 0 || service.foldersFailed ? (
              <span className="flex flex-wrap gap-1.5">
                {service.missing > 0 ? (
                  <Badge tone="warning">{service.missing} to upload</Badge>
                ) : null}
                {service.foldersFailed ? (
                  <Badge tone="danger">Folders not created</Badge>
                ) : null}
              </span>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}
