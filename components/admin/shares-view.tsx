import { Download, Eye, EyeOff, Link2, Link2Off } from "lucide-react";
import { revokeShareLink } from "@/app/(app)/admin/shares/actions";
import { CopyLinkButton } from "@/components/share/share-button";
import { ActionButton } from "@/components/ui/action-button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { viewSummary, type ShareStatus } from "@/lib/domain/share";
import { AdminHeader } from "./page-header";

export type ShareCard = {
  id: string;
  label: string;
  /** "Baptism from Sunday Service, Oct 12" */
  covers: string;
  url: string;
  status: ShareStatus;
  /** "Expires in 12 days", "Never expires", "Expired", "Turned off" */
  expiry: string;
  allowDownload: boolean;
  /** Visits, counting each visitor once per half hour. */
  viewCount: number;
  /** Different browsers that opened it. */
  visitorCount: number;
  downloadCount: number;
  /** "Wed, Oct 15, 12:15 PM", or null if never opened. */
  lastViewed: string | null;
  createdBy: string | null;
};

export type SharesData = { links: ShareCard[] };

/** Every share link: who it is for, what it opens, and whether it still works. */
export function SharesView({ data }: { data: SharesData }) {
  const active = data.links.filter((link) => link.status === "active");
  const ended = data.links.filter((link) => link.status !== "active");

  return (
    <div className="stagger flex flex-col gap-8">
      <AdminHeader
        title="Shared links"
        description="Links that let someone without an account view an album, a category, a service or the whole gallery. Create one with the Share button on any of those."
      />

      {data.links.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg bg-surface shadow-card p-10 text-center">
          <Link2 aria-hidden size={28} className="text-muted-soft" />
          <p className="max-w-md text-body-sm text-muted">
            No links yet. Open an album, a service or the gallery and tap
            Share to make one for a pastor or church leader.
          </p>
        </div>
      ) : null}

      {active.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-title-lg text-ink">Working ({active.length})</h2>
          <ul className="grid gap-3 tablet:grid-cols-2 tablet:gap-4 desktop:grid-cols-3">
            {active.map((link) => (
              <li key={link.id}>
                <LinkCard link={link} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {ended.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-title-lg text-ink">No longer working ({ended.length})</h2>
          <ul className="grid gap-3 tablet:grid-cols-2 tablet:gap-4 desktop:grid-cols-3">
            {ended.map((link) => (
              <li key={link.id}>
                <LinkCard link={link} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function LinkCard({ link }: { link: ShareCard }) {
  const working = link.status === "active";

  return (
    <div
      className={cn(
        "flex h-full flex-col gap-3 rounded-lg bg-surface shadow-card p-4",
        !working && "opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-md",
            working ? "bg-primary-soft text-primary" : "bg-surface-strong text-muted",
          )}
        >
          {working ? <Link2 aria-hidden size={20} /> : <Link2Off aria-hidden size={20} />}
        </span>
        <Badge tone={working ? "success" : "neutral"}>{link.expiry}</Badge>
      </div>

      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-title text-ink">{link.label}</span>
        <span className="text-caption text-muted">{link.covers}</span>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-muted">
        <span className="flex items-center gap-1">
          <Eye aria-hidden size={13} />
          {viewSummary(link)}
        </span>
        <span className="flex items-center gap-1">
          {link.allowDownload ? (
            <Download aria-hidden size={13} />
          ) : (
            <EyeOff aria-hidden size={13} />
          )}
          {link.allowDownload ? "Can download" : "View only"}
        </span>
      </div>
      {link.lastViewed ? (
        <span className="text-caption text-muted-soft">Last opened {link.lastViewed}</span>
      ) : null}

      {working ? (
        <div className="mt-auto flex flex-wrap items-start gap-2 pt-1">
          <CopyLinkButton url={link.url} />
          <ActionButton
            action={revokeShareLink}
            fields={{ share_id: link.id }}
            label="Turn off"
            pendingLabel="Turning off…"
            variant="danger"
            ariaLabel={`Turn off the link for ${link.label}`}
            confirmMessage={`Turn off the link for ${link.label}? It stops working straight away and cannot be turned back on.`}
          />
        </div>
      ) : null}
    </div>
  );
}

