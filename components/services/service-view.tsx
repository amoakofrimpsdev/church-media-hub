import {
  ArrowLeft,
  BellRing,
  ExternalLink,
  FolderX,
  ImageOff,
  Pencil,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { removeAssignment, sendReminderNow, setTaskDone } from "@/app/(app)/services/actions";
import { AddAssignmentForm } from "@/app/(app)/services/[id]/add-assignment-form";
import { RetryFolders } from "@/app/(app)/services/[id]/retry-folders";
import { HandoffList } from "@/components/handoffs/handoff-list";
import { ActionButton } from "@/components/ui/action-button";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { ShareButton } from "@/components/share/share-button";
import { UploadButton } from "@/components/upload/upload-provider";
import { cn } from "@/lib/cn";
import type { HandoffStage } from "@/lib/domain/deadlines";
import type { Album, AssignedPerson, ServiceData } from "./types";

const STAGE_TONE: Record<HandoffStage, "neutral" | "accent" | "success" | "danger"> = {
  waiting: "neutral",
  ready: "accent",
  delivered: "success",
  late: "danger",
};
const STAGE_WORD: Record<HandoffStage, string> = {
  waiting: "pending",
  ready: "ready",
  delivered: "delivered",
  late: "late",
};

export function ServiceView({ data }: { data: ServiceData }) {
  const hasSide = data.people.length > 0 || data.canManage || data.handoffs.length > 0;

  return (
    <div className="stagger flex flex-col gap-6">
      <header className="flex flex-col gap-4">
        <Link
          href="/services"
          className="flex items-center gap-1 self-start text-body-sm font-bold text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft aria-hidden size={16} />
          Services
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{data.relative}</Badge>
              <span className="text-caption text-muted">
                {data.totalFiles.toLocaleString("en-US")}{" "}
                {data.totalFiles === 1 ? "file" : "files"}
              </span>
            </div>
            <h1 className="text-display text-ink tablet:text-hero">{data.name}</h1>
            <p className="text-body-sm text-muted">{data.dateLine}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {data.canUpload ? <UploadButton serviceId={data.id} /> : null}
            {data.canManage ? (
              <ShareButton
                serviceId={data.id}
                covers={`Everything from ${data.name}, ${data.dateLine.split(" · ")[0]}`}
                wide
              />
            ) : null}
            {data.canManage ? (
              <Link href={`/services/${data.id}/edit`} className={buttonClasses("secondary")}>
                <Pencil aria-hidden size={16} />
                Edit
              </Link>
            ) : null}
            {data.driveUrl ? (
              <a
                href={data.driveUrl}
                target="_blank"
                rel="noreferrer"
                className={buttonClasses("ghost")}
              >
                <ExternalLink aria-hidden size={16} />
                Drive
              </a>
            ) : null}
          </div>
        </div>
      </header>

      {data.folderProblem ? (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-lg bg-danger-soft p-4 tablet:flex-row tablet:items-center tablet:justify-between"
        >
          <div className="flex gap-3">
            <FolderX aria-hidden size={20} className="mt-0.5 shrink-0 text-danger" />
            <div className="flex flex-col gap-1">
              <p className="text-title text-danger">Drive folders are not ready</p>
              <p className="text-body-sm text-ink-soft">
                {data.folderProblem.message} The service itself is saved.
              </p>
            </div>
          </div>
          {data.folderProblem.connection ? (
            <Link href="/admin/google" className={buttonClasses("primary", "sm", "self-start")}>
              {data.folderProblem.connection === "reconnect"
                ? "Reconnect Google"
                : "Connect Google"}
            </Link>
          ) : (
            <RetryFolders serviceId={data.id} label="Create folders" />
          )}
        </div>
      ) : null}

      <div className={cn("grid gap-6", hasSide && "desktop:grid-cols-[1.7fr_1fr]")}>
        <section className="flex flex-col gap-3">
          <h2 className="text-title-lg text-ink">Albums</h2>
          {data.albums.length === 0 ? (
            <p className="rounded-lg bg-surface shadow-card p-6 text-body-sm text-muted">
              {data.isViewer
                ? "Nothing from this service is delivered to your team. If you expected something, ask an admin to check which team you are on."
                : "There are no active categories. Add one under Admin, Categories."}
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 tablet:gap-4">
              {data.albums.map((album) => (
                <li key={album.categoryId}>
                  <AlbumCard album={album} serviceId={data.id} canUpload={data.canUpload} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {hasSide ? (
          <div className="flex flex-col gap-6">
            {data.people.length > 0 || data.canManage ? <TeamCard data={data} /> : null}
            {data.handoffs.length > 0 ? (
              <section className="flex flex-col gap-2 rounded-lg bg-surface shadow-card p-5">
                <h2 className="text-title-lg text-ink">Handoffs</h2>
                <HandoffList
                  handoffs={data.handoffs}
                  showService={false}
                  isAdmin={data.isAdmin}
                />
              </section>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** A category shown as an album: its newest photos, how many, and where it is going. */
function AlbumCard({
  album,
  serviceId,
  canUpload,
}: {
  album: Album;
  serviceId: string;
  canUpload: boolean;
}) {
  const href = `/services/${serviceId}/${album.slug}`;

  return (
    <div className="group flex h-full flex-col gap-3 rounded-lg bg-surface shadow-card p-3 transition-colors hover:bg-surface-soft">
      <Link
        href={href}
        aria-label={`Open ${album.name}`}
        className="relative block aspect-[4/3] overflow-hidden rounded-md bg-surface-strong"
      >
        {album.covers.length === 0 ? (
          <span className="flex h-full flex-col items-center justify-center gap-1 text-muted-soft">
            <ImageOff aria-hidden size={22} />
            <span className="text-caption">
              {album.hasFolder ? "No files yet" : "No folder yet"}
            </span>
          </span>
        ) : (
          <span
            className={cn(
              "grid h-full gap-0.5",
              album.covers.length === 1 && "grid-cols-1",
              album.covers.length === 2 && "grid-cols-2",
              album.covers.length >= 3 && "grid-cols-[2fr_1fr] grid-rows-2",
            )}
          >
            {album.covers.slice(0, 3).map((cover, index) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={cover}
                src={cover}
                alt=""
                loading="lazy"
                className={cn(
                  "h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]",
                  album.covers.length >= 3 && index === 0 && "row-span-2",
                )}
              />
            ))}
          </span>
        )}
      </Link>

      <div className="flex items-start justify-between gap-2">
        <Link href={href} className="flex min-w-0 flex-col">
          <span className="truncate text-title text-ink">{album.name}</span>
          <span className="text-caption text-muted">
            {album.fileCount.toLocaleString("en-US")}{" "}
            {album.fileCount === 1 ? "file" : "files"}
          </span>
        </Link>
        {canUpload && album.hasFolder ? (
          <UploadButton
            serviceId={serviceId}
            categoryId={album.categoryId}
            label={`Add to ${album.name}`}
            iconOnly
          />
        ) : null}
      </div>

      {album.deliveries.length > 0 ? (
        <div className="mt-auto flex flex-wrap gap-1.5">
          {album.deliveries.map((delivery) => (
            <Badge key={delivery.teamName} tone={STAGE_TONE[delivery.stage]}>
              {delivery.teamName}: {STAGE_WORD[delivery.stage]}
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const TASK_BADGE: Record<
  AssignedPerson["tasks"][number]["state"],
  { label: string; tone: "success" | "warning" | "neutral" }
> = {
  done: { label: "Done", tone: "success" },
  uploaded: { label: "Uploaded", tone: "neutral" },
  missing: { label: "Nothing yet", tone: "warning" },
};

function TeamCard({ data }: { data: ServiceData }) {
  return (
    <section className="flex flex-col gap-4 rounded-lg bg-surface shadow-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-title-lg text-ink">Who is covering</h2>
        {data.canManage && data.hasOutstanding ? (
          <ActionButton
            action={sendReminderNow}
            fields={{ service_id: data.id }}
            label="Remind"
            pendingLabel="Sending…"
            variant="ghost"
            ariaLabel="Send a reminder in Telegram now"
          />
        ) : null}
      </div>

      {data.people.length === 0 ? (
        <p className="text-body-sm text-muted">Nobody is assigned yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {data.people.map((person) => (
            <li key={person.assignmentId} className="flex flex-col gap-2 rounded-md bg-surface-soft p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Avatar name={person.name} />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-body-sm font-bold text-ink">
                      {person.name}
                      {person.isMe ? <span className="text-primary"> (you)</span> : null}
                    </span>
                    <span className="text-caption text-muted">{person.roleName}</span>
                  </div>
                </div>
                {data.canManage ? (
                  <ActionButton
                    action={removeAssignment}
                    fields={{ assignment_id: person.assignmentId, service_id: data.id }}
                    label="Remove"
                    variant="ghost"
                    ariaLabel={`Remove ${person.name}`}
                  />
                ) : null}
              </div>
              <ul className="flex flex-col gap-1.5">
                {person.tasks.map((task) => {
                  const badge = TASK_BADGE[task.state];
                  const done = task.state === "done";
                  return (
                    <li
                      key={task.categoryId}
                      className="flex flex-wrap items-center justify-between gap-2"
                    >
                      <span className="flex items-center gap-2">
                        <span className="text-body-sm text-ink-soft">{task.categoryName}</span>
                        <Badge tone={badge.tone}>{badge.label}</Badge>
                      </span>
                      {person.isMe || data.canManage ? (
                        <ActionButton
                          action={setTaskDone}
                          fields={{
                            assignment_id: person.assignmentId,
                            category_id: task.categoryId,
                            service_id: data.id,
                            done: done ? "false" : "true",
                          }}
                          label={done ? "Reopen" : "Mark done"}
                          variant={done ? "ghost" : "secondary"}
                          ariaLabel={`${done ? "Reopen" : "Mark done"}: ${task.categoryName} for ${person.name}`}
                        />
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}

      {data.canManage && data.hasOutstanding ? (
        <p className="flex items-center gap-1.5 text-caption text-muted">
          <BellRing aria-hidden size={13} />
          “Remind” tags only the people with nothing uploaded, in Telegram.
        </p>
      ) : null}

      {data.assignOptions ? (
        <details className="group rounded-md border border-hairline">
          <summary className="flex cursor-pointer list-none items-center gap-2 p-3 text-body-sm font-bold text-ink">
            <UserPlus aria-hidden size={16} className="text-primary" />
            Assign someone
          </summary>
          <div className="border-t border-hairline p-3">
            <AddAssignmentForm
              serviceId={data.id}
              people={data.assignOptions.people}
              dutyRoles={data.assignOptions.dutyRoles}
              categories={data.assignOptions.categories}
            />
          </div>
        </details>
      ) : null}
    </section>
  );
}
