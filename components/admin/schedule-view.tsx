import { CalendarPlus, CircleCheck, CircleAlert, Settings2 } from "lucide-react";
import { runJobsNow, updateSeries } from "@/app/(app)/admin/schedule/actions";
import { SeriesForm } from "@/app/(app)/admin/schedule/series-form";
import { ActionButton } from "@/components/ui/action-button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/cn";
import { WEEKDAYS } from "@/lib/domain/recurrence";
import type { JobResult } from "@/lib/jobs/run";
import { ADD_TILE, AdminHeader } from "./page-header";

export type SeriesCard = {
  id: string;
  name: string;
  /** 0 = Sunday. */
  weekday: number;
  /** "10:00 AM" */
  timeLabel: string;
  /** "Every Wednesday", "Every other Wednesday" */
  repeatLabel: string;
  /** For a series that is not weekly: "Starting Oct 15". */
  startLabel: string | null;
  active: boolean;
};

export type ScheduleData = {
  series: SeriesCard[];
  jobs: {
    /** "Mon, Oct 13, 7:15 AM", or null if the jobs have never run. */
    lastRanLabel: string | null;
    /** True when the 15-minute scheduler seems to have stopped. */
    stale: boolean;
    lastResult: JobResult | null;
  };
};

function summarize(result: JobResult): string[] {
  const lines: string[] = [];
  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  if (result.servicesCreated > 0) {
    lines.push(`Created ${count(result.servicesCreated, "service", "services")}.`);
  }
  if (result.foldersFixed > 0) {
    lines.push(
      `Created Drive folders for ${count(result.foldersFixed, "service", "services")} that had failed.`,
    );
  }
  const announced = result.servicesAnnounced ?? 0;
  const messages = announced + result.reminders + result.readyNotices + result.lateNotices;
  if (messages > 0) {
    lines.push(
      `Posted ${count(messages, "Telegram message", "Telegram messages")} (${announced} for today's services, ${result.reminders} reminders, ${result.readyNotices} ready, ${result.lateNotices} late).`,
    );
  }
  if (!result.telegramLinked) {
    lines.push("Telegram is not linked, so nothing was posted.");
  }
  if (result.driveAccessRemoved > 0) {
    lines.push(
      `Finished removing Drive access for ${count(result.driveAccessRemoved, "folder", "folders")}.`,
    );
  }
  if (result.uploadsClosed > 0) {
    lines.push(`Closed ${count(result.uploadsClosed, "abandoned upload", "abandoned uploads")}.`);
  }
  if (lines.length === 0 || (lines.length === 1 && !result.telegramLinked)) {
    lines.push("Nothing was due.");
  }
  return lines;
}

/**
 * Weekly services drawn as calendar tiles, and the health of the automatic
 * jobs that create them.
 */
export function ScheduleView({ data }: { data: ScheduleData }) {
  const { jobs } = data;

  return (
    <div className="stagger flex flex-col gap-8">
      <AdminHeader
        title="Schedule"
        description="Services that repeat (every week, every other week…) are created for you a week ahead, with their Drive folders."
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-title-lg text-ink">Repeating services</h2>
        <ul className="grid grid-cols-2 gap-3 tablet:grid-cols-3 tablet:gap-4 desktop:grid-cols-4">
          {data.series.map((series) => (
            <li key={series.id}>
              <Modal
                title={series.name}
                description={`${series.repeatLabel} at ${series.timeLabel}, Pacific time`}
                triggerLabel={`Open ${series.name}, ${series.repeatLabel.toLowerCase()}`}
                triggerClassName={cn(
                  "group flex h-full min-h-40 w-full flex-col gap-3 rounded-lg bg-surface shadow-card p-4 text-left transition-colors hover:bg-surface-soft",
                  !series.active && "opacity-60",
                )}
                trigger={
                  <>
                    <span className="flex items-start justify-between gap-2">
                      {/* A calendar page: the weekday is the headline. */}
                      <span className="flex flex-col overflow-hidden rounded-md bg-surface-strong text-center">
                        <span className="bg-primary px-3 py-0.5 text-label text-on-primary uppercase">
                          {WEEKDAYS[series.weekday]?.slice(0, 3)}
                        </span>
                        <span className="px-3 py-1.5 text-body-sm font-bold text-ink tabular-nums">
                          {series.timeLabel}
                        </span>
                      </span>
                      <Settings2
                        aria-hidden
                        size={16}
                        className="text-muted-soft transition-colors group-hover:text-ink"
                      />
                    </span>
                    <span className="mt-auto flex flex-col gap-1">
                      <span className="truncate text-title text-ink">{series.name}</span>
                      <span className="text-caption text-muted">
                        {series.repeatLabel}
                        {series.startLabel ? ` · ${series.startLabel}` : ""}
                      </span>
                    </span>
                    {series.active ? null : <Badge className="self-start">Paused</Badge>}
                  </>
                }
              >
                <p className="text-body-sm text-ink-soft">
                  {series.active
                    ? "The next one is created a week ahead. Pausing stops new ones being created; existing services are kept."
                    : "Paused. No new services are being created from this."}
                </p>
                <div className="flex flex-wrap gap-2">
                  <ActionButton
                    action={updateSeries}
                    fields={{ series_id: series.id, intent: series.active ? "pause" : "resume" }}
                    label={series.active ? "Pause" : "Resume"}
                    size="md"
                  />
                  <ActionButton
                    action={updateSeries}
                    fields={{ series_id: series.id, intent: "delete" }}
                    label="Delete"
                    variant="danger"
                    size="md"
                    confirmMessage={`Stop creating ${series.name} every week? Services already created are kept.`}
                  />
                </div>
                <p className="text-caption text-muted">
                  Deleting one service that was created this way only skips
                  that week. It does not come back.
                </p>
              </Modal>
            </li>
          ))}
          <li>
            <Modal
              title="New repeating service"
              description="Created a week ahead each time, with its Drive folders."
              triggerClassName={ADD_TILE}
              trigger={
                <>
                  <CalendarPlus aria-hidden size={24} />
                  New repeating service
                </>
              }
            >
              <SeriesForm />
            </Modal>
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-title-lg text-ink">Automatic jobs</h2>
        <div className="flex flex-col gap-4 rounded-lg bg-surface shadow-card p-5 tablet:flex-row tablet:items-start tablet:justify-between">
          <div className="flex gap-3">
            <span
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                jobs.stale ? "bg-danger-soft text-danger" : "bg-success-soft text-success",
              )}
            >
              {jobs.stale ? (
                <CircleAlert aria-hidden size={20} />
              ) : (
                <CircleCheck aria-hidden size={20} />
              )}
            </span>
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-0.5">
                <span className="text-title text-ink">
                  {jobs.stale ? "Not running regularly" : "Running every 15 minutes"}
                </span>
                <span className="text-caption text-muted">
                  {jobs.lastRanLabel
                    ? `Last ran ${jobs.lastRanLabel} Pacific.`
                    : "Has never run."}{" "}
                  Creates weekly services, posts reminders and handoff alerts
                  that are due, and tidies up.
                </span>
              </div>
              {jobs.stale ? (
                <p role="alert" className="text-body-sm text-danger">
                  {jobs.lastRanLabel
                    ? "It has not run in the last two hours. The 15-minute scheduler in Supabase may have stopped. A once-a-day backup still runs, but reminders will be late."
                    : "The scheduler has not been set up yet. Follow docs/SCHEDULER.md, or run the jobs once now."}
                </p>
              ) : null}
              {jobs.lastResult ? (
                <ul className="list-disc space-y-0.5 pl-5 text-body-sm text-ink-soft">
                  {summarize(jobs.lastResult).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                  {jobs.lastResult.failed.length > 0 ? (
                    <li className="text-danger">
                      Failed: {jobs.lastResult.failed.join(", ")}.
                    </li>
                  ) : null}
                </ul>
              ) : null}
            </div>
          </div>
          <ActionButton
            action={runJobsNow}
            fields={{}}
            label="Run now"
            pendingLabel="Running…"
            size="md"
          />
        </div>
      </section>
    </div>
  );
}
