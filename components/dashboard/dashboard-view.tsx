import {
  ArrowRight,
  CalendarPlus,
  CheckCircle2,
  Clock3,
  HardDrive,
  ImageUp,
  Play,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { setTaskDone } from "@/app/(app)/services/actions";
import { BarList } from "@/components/charts/bar-list";
import { ColumnChart } from "@/components/charts/column-chart";
import { CountUp } from "@/components/charts/count-up";
import { HandoffList } from "@/components/handoffs/handoff-list";
import { ActionButton } from "@/components/ui/action-button";
import { Avatar, AvatarStack } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { ProgressRing } from "@/components/ui/progress-ring";
import { UploadButton } from "@/components/upload/upload-provider";
import { cn } from "@/lib/cn";
import { compareToPrevious } from "@/lib/domain/analytics";
import { formatBytes } from "@/lib/domain/uploads";
import type {
  Analytics,
  DashboardData,
  FocusService,
  UpcomingService,
} from "./types";

export function DashboardView({ data }: { data: DashboardData }) {
  return (
    <div className="stagger flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <p className="text-label text-muted uppercase">{data.today}</p>
        <h1 className="text-display text-ink tablet:text-hero">
          {data.greeting}, {data.firstName}
        </h1>
      </header>

      <Alerts data={data} />

      {data.focus ? (
        <FocusCard focus={data.focus} canUpload={data.canUpload} />
      ) : (
        <EmptyFocus canManage={data.canManage} />
      )}

      {data.myTasks.length > 0 || data.handoffs.length > 0 ? (
        <div className="grid gap-6 desktop:grid-cols-2">
          {data.myTasks.length > 0 ? <MyTasks data={data} /> : null}
          {data.handoffs.length > 0 ? <Handoffs data={data} /> : null}
        </div>
      ) : null}

      {data.recentUploads.length > 0 ? (
        <section className="flex flex-col gap-3">
          <SectionHeading
            title="Fresh uploads"
            href="/gallery"
            linkLabel="Open gallery"
          />
          <ul className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 tablet:-mx-8 tablet:px-8 desktop:mx-0 desktop:px-0">
            {data.recentUploads.map((upload) => (
              <li
                key={upload.id}
                className="w-36 shrink-0 snap-start tablet:w-44"
              >
                <Link href={upload.href} className="group flex flex-col gap-2">
                  <span className="relative block aspect-square overflow-hidden rounded-md bg-surface-strong">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={upload.thumbUrl}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    {upload.isVideo ? (
                      <span className="absolute right-2 bottom-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white">
                        <Play aria-hidden size={14} fill="currentColor" />
                      </span>
                    ) : null}
                  </span>
                  <span className="truncate text-caption text-muted group-hover:text-ink">
                    {upload.caption}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.analytics ? <AnalyticsSection analytics={data.analytics} /> : null}

      {/* With no services at all, the card above already says what to do. */}
      {data.focus || data.upcoming.length > 0 ? (
        <section className="flex flex-col gap-3">
          <SectionHeading
            title="Coming up"
            href="/services"
            linkLabel="All services"
          />
          {data.upcoming.length === 0 ? (
            <div className="flex flex-col items-start gap-3 rounded-lg bg-surface shadow-card p-6">
              <p className="text-body-sm text-muted">
                {data.canManage
                  ? "Nothing scheduled. Create the next service to set up its folders."
                  : "Nothing scheduled yet."}
              </p>
              {data.canManage ? (
                <Link
                  href="/services/new"
                  className={buttonClasses("secondary", "sm")}
                >
                  <CalendarPlus aria-hidden size={16} />
                  New service
                </Link>
              ) : null}
            </div>
          ) : (
            <ul className="grid gap-3 tablet:grid-cols-2 desktop:grid-cols-3">
              {data.upcoming.map((service) => (
                <li key={service.id}>
                  <UpcomingCard service={service} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}

function SectionHeading({
  title,
  href,
  linkLabel,
}: {
  title: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <h2 className="text-title-lg text-ink">{title}</h2>
      {href && linkLabel ? (
        <Link
          href={href}
          className="group flex items-center gap-1 text-body-sm font-bold text-muted transition-colors hover:text-ink"
        >
          {linkLabel}
          <ArrowRight
            aria-hidden
            size={14}
            className="transition-transform group-hover:translate-x-0.5"
          />
        </Link>
      ) : null}
    </div>
  );
}

function Alerts({ data }: { data: DashboardData }) {
  if (!data.googleProblem && !data.viewerWithoutTeam) return null;
  return (
    <div className="flex flex-col gap-3">
      {data.viewerWithoutTeam ? (
        <div
          role="status"
          className="flex flex-col gap-1 rounded-lg bg-warning-soft p-4"
        >
          <p className="text-title text-warning">You are not on a team yet</p>
          <p className="text-body-sm text-ink-soft">
            You will see photos, videos and handoffs once an admin adds you to
            your team. Ask a media team admin to do that.
          </p>
        </div>
      ) : null}
      {data.googleProblem ? (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-lg bg-danger-soft p-4 tablet:flex-row tablet:items-center tablet:justify-between"
        >
          <div className="flex flex-col gap-1">
            <p className="text-title text-danger">
              {data.googleProblem === "expired"
                ? "The church Google account needs reconnecting"
                : "Connect the church Google account"}
            </p>
            <p className="text-body-sm text-ink-soft">
              {data.googleProblem === "expired"
                ? "Google stopped accepting the saved sign-in. New folders and uploads will fail until it is reconnected."
                : "Services cannot get Drive folders until the church account is connected."}
            </p>
          </div>
          <Link
            href="/admin/google"
            className={buttonClasses("primary", "sm", "self-start")}
          >
            {data.googleProblem === "expired"
              ? "Reconnect Google"
              : "Connect Google"}
          </Link>
        </div>
      ) : null}
    </div>
  );
}

const WHEN_LABEL: Record<FocusService["when"], string> = {
  now: "Happening now",
  upcoming: "Up next",
  recent: "Most recent",
};

/** The service people are most likely here for, with the main action one tap away. */
function FocusCard({
  focus,
  canUpload,
}: {
  focus: FocusService;
  canUpload: boolean;
}) {
  return (
    <section className="theme-brand relative overflow-hidden rounded-xl shadow-float">
      <div className="relative grid gap-6 p-5 tablet:grid-cols-[1fr_auto] tablet:items-center tablet:p-8">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1.5 text-label text-primary uppercase">
                {focus.when === "now" ? (
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                  </span>
                ) : null}
                {WHEN_LABEL[focus.when]}
              </span>
              <Badge>{focus.relative}</Badge>
            </div>
            <h2 className="text-display text-ink">{focus.name}</h2>
            <p className="text-body-sm text-muted">{focus.dateLine}</p>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            {focus.tasksTotal > 0 ? (
              <div className="flex items-center gap-3">
                <ProgressRing
                  done={focus.tasksDone}
                  total={focus.tasksTotal}
                  label="Tasks done"
                />
                <div className="flex flex-col">
                  <span className="text-body-sm font-bold text-ink">
                    {focus.tasksDone} of {focus.tasksTotal} tasks done
                  </span>
                  <span className="text-caption text-muted">
                    {focus.missing > 0
                      ? `${focus.missing} with nothing uploaded yet`
                      : "Everyone has uploaded"}
                  </span>
                </div>
              </div>
            ) : null}
            {focus.assigned.length > 0 ? (
              <div className="flex items-center gap-3">
                <AvatarStack names={focus.assigned} />
                <span className="text-caption text-muted">
                  {focus.assigned.length === 1
                    ? "1 person covering"
                    : `${focus.assigned.length} people covering`}
                </span>
              </div>
            ) : (
              <span className="text-caption text-muted">
                Nobody assigned yet
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {canUpload ? <UploadButton serviceId={focus.id} /> : null}
            <Link
              href={`/services/${focus.id}`}
              className={buttonClasses("secondary")}
            >
              Open service
            </Link>
          </div>
        </div>

        <CoverMosaic covers={focus.covers} fileCount={focus.fileCount} />
      </div>
    </section>
  );
}

/** Up to four photos from the service, or a quiet placeholder before any exist. */
function CoverMosaic({
  covers,
  fileCount,
}: {
  covers: string[];
  fileCount: number;
}) {
  if (covers.length === 0) {
    return (
      <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-hairline bg-canvas/40 text-muted tablet:w-72">
        <ImageUp aria-hidden size={28} />
        <span className="text-caption">No photos yet</span>
      </div>
    );
  }
  return (
    <div className="relative w-full tablet:w-72">
      <div
        className={cn(
          "grid aspect-[4/3] gap-1 overflow-hidden rounded-lg",
          covers.length === 1 ? "grid-cols-1" : "grid-cols-2",
          covers.length > 2 && "grid-rows-2",
        )}
      >
        {covers.slice(0, 4).map((cover, index) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={cover}
            src={cover}
            alt=""
            className={cn(
              "h-full w-full object-cover",
              covers.length === 3 && index === 0 && "row-span-2",
            )}
          />
        ))}
      </div>
      <span className="absolute right-2 bottom-2 rounded-full bg-black/70 px-2.5 py-1 text-caption font-bold text-white">
        {fileCount.toLocaleString("en-US")} {fileCount === 1 ? "file" : "files"}
      </span>
    </div>
  );
}

function EmptyFocus({ canManage }: { canManage: boolean }) {
  return (
    <section className="flex flex-col items-start gap-4 rounded-xl bg-surface shadow-card p-6 tablet:p-8">
      <div className="flex flex-col gap-1">
        <h2 className="text-title-lg text-ink">No services yet</h2>
        <p className="text-body-sm text-muted">
          {canManage
            ? "Create your first service. It gets a Google Drive folder with a subfolder for each category."
            : "Services appear here as soon as an admin creates one."}
        </p>
      </div>
      {canManage ? (
        <Link href="/services/new" className={buttonClasses("primary")}>
          <CalendarPlus aria-hidden size={18} />
          New service
        </Link>
      ) : null}
    </section>
  );
}

function MyTasks({ data }: { data: DashboardData }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg bg-surface shadow-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-title-lg text-ink">Your tasks</h2>
        <Badge tone="accent">{data.myTasks.length} open</Badge>
      </div>
      <ul className="flex flex-col gap-2">
        {data.myTasks.map((task) => (
          <li
            key={`${task.assignmentId}:${task.categoryId}`}
            className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-surface-soft p-3"
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-body-sm font-bold text-ink">
                Upload {task.categoryName}
              </span>
              <span className="truncate text-caption text-muted">
                {task.serviceName} · {task.dateLine}
              </span>
              {task.nothingUploaded ? null : (
                <span className="flex items-center gap-1 text-caption text-success">
                  <CheckCircle2 aria-hidden size={13} />
                  Uploaded. Mark done when finished
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <UploadButton
                serviceId={task.serviceId}
                categoryId={task.categoryId}
                variant="ghost"
                size="sm"
              />
              <ActionButton
                action={setTaskDone}
                fields={{
                  assignment_id: task.assignmentId,
                  category_id: task.categoryId,
                  service_id: task.serviceId,
                  done: "true",
                }}
                label="Done"
                ariaLabel={`Mark done: ${task.categoryName} for ${task.serviceName}`}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Handoffs({ data }: { data: DashboardData }) {
  const shown = data.handoffs.slice(0, 5);
  return (
    <section className="flex flex-col gap-3 rounded-lg bg-surface shadow-card p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-title-lg text-ink">
            {data.role === "viewer" ? "For your team" : "Handoffs"}
          </h2>
          {data.lateHandoffs > 0 ? (
            <Badge tone="danger">{data.lateHandoffs} late</Badge>
          ) : null}
        </div>
        <Link
          href="/handoffs"
          className="text-body-sm font-bold text-muted hover:text-ink"
        >
          See all
        </Link>
      </div>
      <HandoffList handoffs={shown} isAdmin={data.role === "admin"} />
      {data.handoffs.length > shown.length ? (
        <p className="text-caption text-muted">
          And {data.handoffs.length - shown.length} more.
        </p>
      ) : null}
    </section>
  );
}

function UpcomingCard({ service }: { service: UpcomingService }) {
  return (
    <Link
      href={`/services/${service.id}`}
      className="group flex h-full flex-col gap-3 rounded-lg bg-surface shadow-card p-4 transition-colors hover:bg-surface-soft"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-title text-ink">{service.name}</span>
          <span className="text-caption text-muted">{service.dateLine}</span>
        </div>
        <Badge>{service.relative}</Badge>
      </div>
      <div className="mt-auto flex items-center justify-between gap-3">
        {service.assigned.length > 0 ? (
          <AvatarStack names={service.assigned} />
        ) : (
          <span className="text-caption text-muted">Nobody assigned yet</span>
        )}
        <span className="flex flex-wrap justify-end gap-1.5">
          {service.missing > 0 ? (
            <Badge tone="warning">{service.missing} to upload</Badge>
          ) : null}
          {service.foldersFailed ? (
            <Badge tone="danger">Folders not created</Badge>
          ) : null}
        </span>
      </div>
    </Link>
  );
}

// ── Analytics ───────────────────────────────────────────────────────────────

function AnalyticsSection({ analytics }: { analytics: Analytics }) {
  const change = compareToPrevious(
    analytics.last30Days,
    analytics.previous30Days,
  );
  const rate = analytics.handoffs.onTimeRate;
  const ratePercent = rate === null ? null : Math.round(rate * 100);

  return (
    <section className="flex flex-col gap-3">
      <SectionHeading title="How we are doing" />

      <div className="grid grid-cols-2 gap-3 desktop:grid-cols-4">
        <StatTile
          icon={<ImageUp aria-hidden size={16} />}
          label="Uploads, last 30 days"
          value={<CountUp value={analytics.last30Days} compact />}
          footnote={
            change.percent === null ? (
              "No earlier month to compare"
            ) : (
              <span className="flex items-center gap-1">
                {change.direction === "down" ? (
                  <TrendingDown
                    aria-hidden
                    size={14}
                    className="text-warning"
                  />
                ) : (
                  <TrendingUp aria-hidden size={14} className="text-success" />
                )}
                {change.direction === "flat"
                  ? "Same as the 30 days before"
                  : `${change.percent}% ${change.direction} on the 30 days before`}
              </span>
            )
          }
        />
        <StatTile
          icon={<CheckCircle2 aria-hidden size={16} />}
          label="Handoffs on time"
          value={
            ratePercent === null ? (
              "–"
            ) : (
              <CountUp value={ratePercent} suffix="%" />
            )
          }
          footnote={
            analytics.handoffs.settled === 0
              ? "None due yet"
              : `${analytics.handoffs.onTime} of ${analytics.handoffs.settled} delivered by their deadline`
          }
          meter={ratePercent}
        />
        <StatTile
          icon={<Clock3 aria-hidden size={16} />}
          label="Typical time to deliver"
          value={
            analytics.handoffs.medianHoursToDeliver === null ? (
              "–"
            ) : (
              <CountUp
                value={analytics.handoffs.medianHoursToDeliver}
                suffix="h"
              />
            )
          }
          footnote="From service start to the team confirming"
        />
        <StatTile
          icon={<HardDrive aria-hidden size={16} />}
          label="In the library"
          value={<CountUp value={analytics.totalFiles} compact />}
          footnote={`Files, using ${formatBytes(analytics.totalBytes)} of Google Drive`}
        />
      </div>

      <div className="grid gap-3 desktop:grid-cols-3">
        <div className="flex flex-col gap-4 rounded-lg bg-surface shadow-card p-5 desktop:col-span-2">
          <div className="flex flex-col gap-0.5">
            <h3 className="text-title text-ink">Uploads per week</h3>
            <p className="text-caption text-muted">
              Files uploaded each week, Sunday to Saturday. The brightest column
              is this week.
            </p>
          </div>
          <ColumnChart
            unit="files"
            caption="Files uploaded per week"
            columns={analytics.weekly.map((week) => ({
              label: week.label,
              value: week.files,
              detail: `Week of ${week.label}`,
            }))}
          />
        </div>

        <div className="flex flex-col gap-4 rounded-lg bg-surface shadow-card p-5">
          <div className="flex flex-col gap-0.5">
            <h3 className="text-title text-ink">By category</h3>
            <p className="text-caption text-muted">Files in the last 8 weeks</p>
          </div>
          <BarList
            unit="files"
            emptyText="Nothing uploaded in the last 8 weeks."
            rows={analytics.byCategory.map((category) => ({
              label: category.name,
              value: category.files,
            }))}
          />
        </div>
      </div>

      <div className="grid gap-3 desktop:grid-cols-2">
        <div className="flex flex-col gap-4 rounded-lg bg-surface shadow-card p-5">
          <div className="flex flex-col gap-0.5">
            <h3 className="text-title text-ink">Who has been uploading</h3>
            <p className="text-caption text-muted">Files in the last 8 weeks</p>
          </div>
          <BarList
            unit="files"
            emptyText="Nobody has uploaded in the last 8 weeks."
            rows={analytics.byPerson.map((person) => ({
              label: person.name,
              value: person.files,
              lead: <Avatar name={person.name} size="sm" />,
            }))}
          />
        </div>

        <div className="flex flex-col gap-4 rounded-lg bg-surface shadow-card p-5">
          <div className="flex flex-col gap-0.5">
            <h3 className="text-title text-ink">Handoff record</h3>
            <p className="text-caption text-muted">
              Deliveries to receiving teams in the last 8 weeks
            </p>
          </div>
          <HandoffRecord
            onTime={analytics.handoffs.onTime}
            late={analytics.handoffs.late}
          />
          <div className="flex flex-col gap-2 border-t border-hairline pt-4">
            <span className="text-caption text-muted">What was uploaded</span>
            <div className="flex flex-wrap gap-2">
              <Badge>{analytics.photos.toLocaleString("en-US")} photos</Badge>
              <Badge>{analytics.videos.toLocaleString("en-US")} videos</Badge>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * On time against late, as one bar split in two. Status colours are used
 * because this is a status; each part is also named and counted in words.
 */
function HandoffRecord({ onTime, late }: { onTime: number; late: number }) {
  const total = onTime + late;
  if (total === 0) {
    return (
      <p className="text-body-sm text-muted">
        No handoffs have reached their deadline yet.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {/* The gap between the two parts is the page showing through. */}
      <div aria-hidden className="flex h-3 gap-0.5">
        {onTime > 0 ? (
          <div
            style={{ flexGrow: onTime }}
            className="origin-left animate-grow-x rounded-l-full bg-success last:rounded-r-full"
          />
        ) : null}
        {late > 0 ? (
          <div
            style={{ flexGrow: late }}
            className="origin-left animate-grow-x rounded-r-full bg-danger first:rounded-l-full"
          />
        ) : null}
      </div>
      <dl className="flex flex-wrap gap-x-8 gap-y-2">
        <div className="flex items-center gap-2">
          <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-success" />
          <dt className="text-body-sm text-ink-soft">On time</dt>
          <dd className="text-body-sm font-bold text-ink tabular-nums">
            {onTime}
          </dd>
        </div>
        <div className="flex items-center gap-2">
          <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-danger" />
          <dt className="text-body-sm text-ink-soft">Late</dt>
          <dd className="text-body-sm font-bold text-ink tabular-nums">
            {late}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
  footnote,
  meter,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  footnote: React.ReactNode;
  /** 0 to 100. Draws a meter under the value. */
  meter?: number | null;
}) {
  // The meter's colour says how good the number is; its track is the same hue.
  const tone =
    meter === undefined || meter === null
      ? null
      : meter >= 90
        ? { fill: "bg-success", track: "bg-success/20" }
        : meter >= 70
          ? { fill: "bg-warning", track: "bg-warning/20" }
          : { fill: "bg-danger", track: "bg-danger/20" };

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-surface shadow-card p-4 transition-colors hover:bg-surface-soft tablet:p-5">
      <span className="flex items-center gap-2 text-caption text-muted">
        {icon}
        {label}
      </span>
      <span className="text-display text-ink">{value}</span>
      {tone ? (
        <div
          aria-hidden
          className={cn("h-1.5 overflow-hidden rounded-full", tone.track)}
        >
          <div
            style={{ width: `${meter}%` }}
            className={cn(
              "h-full origin-left animate-grow-x rounded-full",
              tone.fill,
            )}
          />
        </div>
      ) : null}
      <span className="text-caption text-muted">{footnote}</span>
    </div>
  );
}
