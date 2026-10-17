"use client";

import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ImagePlus,
  Plus,
  RotateCcw,
  UploadCloud,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { ProgressRing } from "@/components/ui/progress-ring";
import { cn } from "@/lib/cn";
import { formatBytes } from "@/lib/domain/uploads";
import { fetchUploadService, uploadsFinished } from "@/app/(app)/upload-actions";
import { UploadQueue, type UploadItem } from "@/lib/uploads/queue";

/** A service someone can upload to right now, with its categories. */
export type UploadService = {
  id: string;
  name: string;
  /** "Sun, Oct 12" */
  dateLine: string;
  /** "Today", "3 days ago" */
  relative: string;
  categories: { id: string; name: string }[];
};

type Preselect = { serviceId?: string; categoryId?: string };

type UploadContextValue = {
  /** Opens the upload sheet, optionally already pointed at a service or category. */
  open: (preselect?: Preselect) => void;
};

const UploadContext = createContext<UploadContextValue | null>(null);

/** Null when the person cannot upload (or outside the app shell). */
export function useUpload(): UploadContextValue | null {
  return useContext(UploadContext);
}

const EMPTY: UploadItem[] = [];

/**
 * Uploading, available from every page. One queue lives here for the whole
 * session, so files keep going up while the person moves around the app.
 */
export function UploadProvider({
  services,
  defaultServiceId,
  canCreateService,
  children,
  initiallyOpen = false,
}: {
  services: UploadService[];
  defaultServiceId: string | null;
  canCreateService: boolean;
  children: ReactNode;
  /** Used by preview pages to show the sheet. */
  initiallyOpen?: boolean;
}) {
  const router = useRouter();
  const [queue] = useState(() => new UploadQueue());
  const items = useSyncExternalStore(queue.subscribe, queue.getSnapshot, () => EMPTY);

  const [isOpen, setIsOpen] = useState(initiallyOpen);
  const [serviceId, setServiceId] = useState(defaultServiceId ?? services[0]?.id ?? "");
  const [categoryId, setCategoryId] = useState("");
  // Services opened from their own page that are not in the usual short list.
  const [extraServices, setExtraServices] = useState<UploadService[]>([]);
  const [lookup, setLookup] = useState<"idle" | "loading" | "unavailable">("idle");

  const allServices = useMemo(
    () => [
      ...extraServices.filter((extra) => !services.some((known) => known.id === extra.id)),
      ...services,
    ],
    [extraServices, services],
  );
  const service = allServices.find((entry) => entry.id === serviceId) ?? allServices[0];
  // Fall back to the service's first category if the chosen one is not in it.
  const category =
    service?.categories.find((entry) => entry.id === categoryId) ??
    service?.categories[0];

  const knownIds = useRef(new Set<string>());
  useEffect(() => {
    knownIds.current = new Set(allServices.map((entry) => entry.id));
  }, [allServices]);

  const open = useCallback((preselect?: Preselect) => {
    setIsOpen(true);
    setLookup("idle");
    if (preselect?.categoryId) setCategoryId(preselect.categoryId);

    const wanted = preselect?.serviceId;
    if (!wanted) return;
    if (knownIds.current.has(wanted)) {
      setServiceId(wanted);
      return;
    }
    // Asked for a service the sheet does not know about. Fetch it instead of
    // quietly falling back to another one, which would send files to the
    // wrong service.
    setLookup("loading");
    void fetchUploadService(wanted)
      .then((found) => {
        if (!found) {
          setLookup("unavailable");
          return;
        }
        setExtraServices((previous) => [
          found,
          ...previous.filter((entry) => entry.id !== found.id),
        ]);
        setServiceId(found.id);
        setLookup("idle");
      })
      .catch(() => setLookup("unavailable"));
  }, []);
  const value = useMemo(() => ({ open }), [open]);

  const active = items.filter(
    (item) => item.status === "queued" || item.status === "uploading",
  ).length;
  const busy = active > 0;

  // Warn before closing the tab while files are still going up.
  useEffect(() => {
    if (!busy) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  // When a batch finishes, refresh the page underneath (counts, covers,
  // albums) and let the team's Telegram group know who uploaded what.
  const wasBusy = useRef(false);
  const reported = useRef(new Set<string>());
  useEffect(() => {
    if (wasBusy.current && !busy) {
      router.refresh();
      const finished = items.filter(
        (item) => item.status === "done" && !reported.current.has(item.id),
      );
      for (const item of finished) reported.current.add(item.id);
      const serviceIds = [...new Set(finished.map((item) => item.serviceId))];
      if (serviceIds.length > 0) void uploadsFinished(serviceIds).catch(() => {});
    }
    wasBusy.current = busy;
  }, [busy, items, router]);

  function addFiles(files: File[]) {
    if (!service || !category || files.length === 0) return;
    queue.add(files, {
      serviceId: service.id,
      serviceName: service.name,
      categoryId: category.id,
      categoryName: category.name,
    });
  }

  return (
    <UploadContext.Provider value={value}>
      {children}
      {isOpen ? (
        <UploadSheet
          services={allServices}
          lookup={lookup}
          service={lookup === "idle" ? service : undefined}
          category={category}
          onServiceChange={setServiceId}
          onCategoryChange={setCategoryId}
          onFiles={addFiles}
          items={items}
          busy={busy}
          queue={queue}
          canCreateService={canCreateService}
          onClose={() => setIsOpen(false)}
        />
      ) : (
        <UploadPill items={items} onOpen={() => setIsOpen(true)} />
      )}
    </UploadContext.Provider>
  );
}

function UploadSheet({
  services,
  lookup,
  service,
  category,
  onServiceChange,
  onCategoryChange,
  onFiles,
  items,
  busy,
  queue,
  canCreateService,
  onClose,
}: {
  services: UploadService[];
  lookup: "idle" | "loading" | "unavailable";
  service: UploadService | undefined;
  category: { id: string; name: string } | undefined;
  onServiceChange: (id: string) => void;
  onCategoryChange: (id: string) => void;
  onFiles: (files: File[]) => void;
  items: UploadItem[];
  busy: boolean;
  queue: UploadQueue;
  canCreateService: boolean;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const inputId = useId();
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  function onChosen(event: ChangeEvent<HTMLInputElement>) {
    onFiles(Array.from(event.target.files ?? []));
    // Reset so choosing the same file again still fires a change.
    event.target.value = "";
  }

  const done = items.filter((item) => item.status === "done").length;
  const failed = items.filter((item) => item.status === "error");
  const retryable = failed.filter((item) => item.canRetry).length;

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(event) => {
        // A click on the backdrop (the dialog element itself) closes it.
        if (event.target === event.currentTarget) dialog.current?.close();
      }}
      aria-label="Upload"
      className="m-0 mt-auto max-h-[92dvh] w-full max-w-none animate-rise overflow-hidden rounded-t-xl border-0 bg-surface p-0 text-ink shadow-float backdrop:bg-scrim/60 tablet:m-auto tablet:max-w-xl tablet:rounded-xl"
    >
      <div className="flex max-h-[92dvh] flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-4">
          <h2 className="text-title-lg text-ink">Upload</h2>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            aria-label="Close"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-strong transition-colors hover:bg-surface-hover"
          >
            <X aria-hidden size={18} />
          </button>
        </div>

        <div className="flex min-w-0 flex-col gap-5 overflow-x-hidden overflow-y-auto p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {lookup === "loading" ? (
            <p role="status" className="rounded-lg bg-surface-soft p-4 text-body-sm text-muted">
              Opening that service…
            </p>
          ) : !service ? (
            <div className="flex flex-col items-start gap-3 rounded-lg bg-surface-soft p-4">
              <p className="text-body-sm text-ink-soft">
                {lookup === "unavailable"
                  ? "That service cannot take uploads yet. It needs its Google Drive folders first: an admin can create them on the service page."
                  : "There is no service ready for uploads. A service needs its Google Drive folders before files can go in."}
              </p>
              {canCreateService ? (
                <Link
                  href="/services/new"
                  onClick={() => dialog.current?.close()}
                  className={buttonClasses("primary", "sm")}
                >
                  New service
                </Link>
              ) : null}
            </div>
          ) : (
            <>
              <fieldset className="flex min-w-0 flex-col gap-2">
                <legend className="mb-2 text-label text-muted uppercase">Service</legend>
                <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 tablet:mx-0 tablet:grid tablet:grid-cols-2 tablet:overflow-visible tablet:px-0">
                  {services.map((entry) => {
                    const selected = entry.id === service.id;
                    return (
                      <label
                        key={entry.id}
                        className={cn(
                          "flex min-w-40 shrink-0 cursor-pointer flex-col gap-0.5 rounded-md border p-3 tablet:min-w-0 transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary",
                          selected
                            ? "border-primary bg-primary-soft"
                            : "border-hairline bg-surface-soft hover:border-border-strong",
                        )}
                      >
                        <input
                          type="radio"
                          name={`${inputId}-service`}
                          checked={selected}
                          onChange={() => onServiceChange(entry.id)}
                          className="sr-only"
                        />
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-body-sm font-bold text-ink">
                            {entry.name}
                          </span>
                          {selected ? (
                            <Check aria-hidden size={16} className="shrink-0 text-primary" />
                          ) : null}
                        </span>
                        <span className="text-caption text-muted">
                          {entry.dateLine} · {entry.relative}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <fieldset className="flex min-w-0 flex-col gap-2">
                <legend className="mb-2 text-label text-muted uppercase">Upload to</legend>
                <div className="flex flex-wrap gap-2">
                  {service.categories.map((entry) => {
                    const selected = entry.id === category?.id;
                    return (
                      <label
                        key={entry.id}
                        className={cn(
                          "flex h-11 cursor-pointer items-center rounded-full border px-4 text-body-sm font-bold transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary",
                          selected
                            ? "border-ink bg-ink text-canvas"
                            : "border-hairline text-ink-soft hover:border-border-strong",
                        )}
                      >
                        <input
                          type="radio"
                          name={`${inputId}-category`}
                          checked={selected}
                          onChange={() => onCategoryChange(entry.id)}
                          className="sr-only"
                        />
                        {entry.name}
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <div>
                <input
                  id={inputId}
                  type="file"
                  multiple
                  accept="image/*,video/*,.heic,.heif,.dng,.cr2,.cr3,.nef,.arw,.raf"
                  onChange={onChosen}
                  className="sr-only"
                />
                {/* Tap to choose on a phone; drop files on it on a computer. */}
                <label
                  htmlFor={inputId}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragging(false);
                    onFiles(Array.from(event.dataTransfer.files));
                  }}
                  className={cn(
                    "flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors has-focus-visible:outline-2",
                    dragging
                      ? "border-primary bg-primary-soft"
                      : "border-hairline hover:border-primary hover:bg-surface-soft",
                  )}
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-on-primary">
                    <ImagePlus aria-hidden size={22} />
                  </span>
                  <span className="text-body-sm font-bold text-ink">
                    Choose photos and videos
                  </span>
                  <span className="text-caption text-muted">
                    Going to {category?.name ?? "a category"} · {service.name}
                  </span>
                </label>
              </div>
            </>
          )}

          {items.length > 0 ? (
            <div className="flex flex-col gap-3">
              <div role="status" className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-body-sm text-ink-soft">
                  {busy
                    ? `Uploading. ${done} of ${items.length} done. You can close this and keep using the app.`
                    : failed.length > 0
                      ? `${done} uploaded, ${failed.length} did not upload.`
                      : `All ${done} uploaded.`}
                </p>
                <div className="flex gap-2">
                  {retryable > 0 ? (
                    <Button variant="secondary" size="sm" onClick={() => queue.retryAll()}>
                      Retry failed ({retryable})
                    </Button>
                  ) : null}
                  {!busy ? (
                    <Button variant="ghost" size="sm" onClick={() => queue.clearFinished()}>
                      Clear list
                    </Button>
                  ) : null}
                </div>
              </div>
              <ul className="flex flex-col gap-2">
                {items.map((item) => (
                  <UploadRow key={item.id} item={item} onRetry={() => queue.retry(item.id)} />
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </dialog>
  );
}

function UploadRow({ item, onRetry }: { item: UploadItem; onRetry: () => void }) {
  const percent = item.size > 0 ? Math.floor((item.sentBytes / item.size) * 100) : 0;

  return (
    <li className="flex flex-col gap-2 rounded-md bg-surface-soft p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-body-sm font-bold text-ink">{item.fileName}</span>
          <span className="truncate text-caption text-muted">
            {item.categoryName} · {item.serviceName} · {formatBytes(item.size)}
          </span>
        </div>
        {item.status === "done" ? <Badge tone="success">Uploaded</Badge> : null}
        {item.status === "queued" ? <Badge>Waiting</Badge> : null}
        {item.status === "uploading" ? (
          <span className="text-caption font-bold text-ink tabular-nums">{percent}%</span>
        ) : null}
        {item.status === "error" ? <Badge tone="danger">Failed</Badge> : null}
      </div>

      {item.status === "uploading" ? (
        <div
          role="progressbar"
          aria-label={`Uploading ${item.fileName}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="h-1.5 overflow-hidden rounded-full bg-surface-strong"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width]"
            style={{ width: `${percent}%` }}
          />
        </div>
      ) : null}

      {item.status === "error" ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p role="alert" className="text-body-sm text-danger">
            {item.error}
          </p>
          {item.canRetry ? (
            <Button variant="secondary" size="sm" onClick={onRetry}>
              <RotateCcw aria-hidden size={14} />
              Retry
            </Button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/**
 * A small floating summary while the sheet is closed, so progress is visible
 * from any page. Tapping it reopens the sheet.
 */
function UploadPill({ items, onOpen }: { items: UploadItem[]; onOpen: () => void }) {
  if (items.length === 0) return null;

  const done = items.filter((item) => item.status === "done").length;
  const failed = items.filter((item) => item.status === "error").length;
  const busy = items.some(
    (item) => item.status === "queued" || item.status === "uploading",
  );
  const totalBytes = items.reduce((sum, item) => sum + item.size, 0);
  const sentBytes = items.reduce(
    (sum, item) => sum + (item.status === "done" ? item.size : item.sentBytes),
    0,
  );
  const percent = totalBytes > 0 ? Math.floor((sentBytes / totalBytes) * 100) : 0;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="fixed right-4 bottom-20 z-30 flex animate-rise items-center gap-3 rounded-full bg-surface-strong py-2 pr-5 pl-2 text-left shadow-float transition-colors hover:bg-surface-hover desktop:bottom-6"
    >
      {busy ? (
        <ProgressRing done={percent} total={100} size={36} label="Upload progress" />
      ) : failed > 0 ? (
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-danger-soft text-danger">
          <AlertTriangle aria-hidden size={18} />
        </span>
      ) : (
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-success-soft text-success">
          <CheckCircle2 aria-hidden size={18} />
        </span>
      )}
      <span className="flex flex-col">
        <span className="text-body-sm font-bold text-ink">
          {busy
            ? `Uploading ${done} of ${items.length}`
            : failed > 0
              ? `${failed} did not upload`
              : `${done} uploaded`}
        </span>
        <span className="text-caption text-muted">
          {busy ? `${percent}% · tap for details` : "Tap for details"}
        </span>
      </span>
    </button>
  );
}

/**
 * An "Upload" button for any screen. Opens the sheet already pointed at a
 * service or category when given one. Renders nothing for people who cannot
 * upload.
 */
export function UploadButton({
  serviceId,
  categoryId,
  label = "Upload",
  variant = "primary",
  size = "md",
  iconOnly = false,
  className,
}: {
  serviceId?: string;
  categoryId?: string;
  label?: string;
  variant?: "primary" | "secondary" | "ghost";
  size?: "md" | "sm";
  /** A round "+" button; the label is still read out by screen readers. */
  iconOnly?: boolean;
  className?: string;
}) {
  const upload = useUpload();
  if (!upload) return null;

  if (iconOnly) {
    return (
      <button
        type="button"
        aria-label={label}
        title={label}
        onClick={() => upload.open({ serviceId, categoryId })}
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border-strong text-ink transition-[background-color,border-color,transform] hover:border-primary hover:bg-primary hover:text-on-primary active:scale-95",
          className,
        )}
      >
        <Plus aria-hidden size={18} strokeWidth={2.5} />
      </button>
    );
  }

  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      onClick={() => upload.open({ serviceId, categoryId })}
    >
      <UploadCloud aria-hidden size={size === "sm" ? 16 : 18} />
      {label}
    </Button>
  );
}
