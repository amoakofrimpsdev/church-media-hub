"use client";

import { CheckCircle2, Circle, Download, ListChecks, Play, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { deleteUpload } from "@/app/(app)/services/actions";
import { ActionButton } from "@/components/ui/action-button";
import { Button, buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { DIRECT_DOWNLOAD_MAX_BYTES, planDownload } from "@/lib/domain/gallery";
import { formatBytes } from "@/lib/domain/uploads";
import type { GalleryItem } from "./types";
import { downloadAsZip, zipFileName } from "./zip-download";

const thumbUrl = (item: GalleryItem, size: 400 | 1600) =>
  item.urls
    ? size === 400
      ? item.urls.small
      : item.urls.large
    : `/api/thumb/${item.id}?size=${size}`;
const downloadUrl = (item: GalleryItem) =>
  item.urls ? item.urls.download : `/api/files/${item.id}`;
const viewUrl = (item: GalleryItem) =>
  item.urls ? item.urls.view : `/api/files/${item.id}?as=view`;

/** A photo-album grid. Tap a tile to see it full size, swipe or use arrows to move. */
export function GalleryGrid({
  items,
  canDelete = false,
  shared = false,
  downloadTitle = "Photos",
}: {
  items: GalleryItem[];
  /** Admins get a Delete button in the full-size view. */
  canDelete?: boolean;
  /** True on a share link, where the visitor has no account. */
  shared?: boolean;
  /** Names the zip from "Download selected": "Baptism - Sunday Service". */
  downloadTitle?: string;
}) {
  const [requestedIndex, setOpenIndex] = useState<number | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const canSelect = items.some((item) => downloadUrl(item) !== null);

  const toggle = (id: string) =>
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const stopSelecting = () => {
    setSelecting(false);
    setSelected(new Set());
  };
  // After a delete the list is shorter. If the open position no longer exists
  // (it was the last one), close the viewer.
  const openIndex =
    requestedIndex !== null && requestedIndex < items.length ? requestedIndex : null;

  return (
    <>
      {canSelect && !selecting ? (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => setSelecting(true)}>
            <ListChecks aria-hidden size={16} />
            Select to download
          </Button>
        </div>
      ) : null}
      <ul className="grid grid-cols-3 gap-1.5 tablet:grid-cols-4 tablet:gap-2 desktop:grid-cols-5">
        {items.map((item, index) => (
          <li key={item.id}>
            <Tile
              item={item}
              onOpen={() => (selecting ? toggle(item.id) : setOpenIndex(index))}
              selecting={selecting}
              selected={selected.has(item.id)}
            />
          </li>
        ))}
      </ul>
      {selecting ? (
        <SelectionBar
          items={items}
          selected={selected}
          onSelectAll={() => setSelected(new Set(items.map((item) => item.id)))}
          onClear={() => setSelected(new Set())}
          onDone={stopSelecting}
          zipName={zipFileName(downloadTitle)}
        />
      ) : null}
      {openIndex !== null ? (
        <Lightbox
          items={items}
          index={openIndex}
          onChange={setOpenIndex}
          onClose={() => setOpenIndex(null)}
          canDelete={canDelete}
          shared={shared}
        />
      ) : null}
    </>
  );
}

function Tile({
  item,
  onOpen,
  selecting,
  selected,
}: {
  item: GalleryItem;
  onOpen: () => void;
  selecting: boolean;
  selected: boolean;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={selecting ? `Select ${item.fileName}` : `Open ${item.fileName}`}
      aria-pressed={selecting ? selected : undefined}
      className={cn(
        "group relative block aspect-square w-full overflow-hidden rounded-sm bg-surface-strong tablet:rounded-md",
        selected && "ring-4 ring-primary ring-inset",
      )}
    >
      {selecting ? (
        <span
          className={cn(
            "absolute top-1.5 left-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-full",
            selected ? "bg-primary text-on-primary" : "bg-black/40 text-white",
          )}
        >
          {selected ? (
            <CheckCircle2 aria-hidden size={20} />
          ) : (
            <Circle aria-hidden size={20} />
          )}
        </span>
      ) : null}
      {failed ? (
        <span className="flex h-full items-center justify-center p-2 text-center text-caption break-all text-muted">
          {item.fileName}
        </span>
      ) : (
        // A plain <img>: these come from our own authenticated route, and
        // next/image would spend the free image-optimisation allowance.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbUrl(item, 400)}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      )}
      {item.isVideo ? (
        <span className="absolute right-1.5 bottom-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white">
          <Play aria-hidden size={14} fill="currentColor" />
          <span className="sr-only">Video</span>
        </span>
      ) : null}
    </button>
  );
}

/**
 * The bar at the bottom while choosing photos: how many, select all, and
 * download them as one zip.
 */
function SelectionBar({
  items,
  selected,
  onSelectAll,
  onClear,
  onDone,
  zipName,
}: {
  items: GalleryItem[];
  selected: Set<string>;
  onSelectAll: () => void;
  onClear: () => void;
  onDone: () => void;
  zipName: string;
}) {
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const chosen = items.filter((item) => selected.has(item.id));
  const plan = planDownload(
    chosen.map((item) => ({
      id: item.id,
      sizeBytes: item.sizeBytes,
      canDownload: downloadUrl(item) !== null,
    })),
  );
  const notes = [
    plan.tooLarge > 0
      ? `${plan.tooLarge} large ${plan.tooLarge === 1 ? "video opens" : "videos open"} in Google Drive instead`
      : null,
    plan.notAllowed > 0 ? `${plan.notAllowed} cannot be downloaded` : null,
    plan.overLimit ? `Over ${formatBytes(1024 * 1024 * 1024)}: choose fewer` : null,
  ].filter(Boolean);

  async function download() {
    const files = items
      .filter((item) => plan.include.includes(item.id))
      .map((item) => ({ url: downloadUrl(item) as string, fileName: item.fileName }));
    setMessage(null);
    setProgress({ done: 0, total: files.length });
    const { failed } = await downloadAsZip(files, zipName, (done) =>
      setProgress({ done, total: files.length }),
    );
    setProgress(null);
    if (failed === files.length) setMessage("Could not download them. Check your connection and try again.");
    else if (failed > 0) setMessage(`Saved, but ${failed} could not be downloaded. Try those again.`);
    else onDone();
  }

  const busy = progress !== null;
  return (
    <div
      role="region"
      aria-label="Selected photos"
      className="fixed inset-x-3 bottom-20 z-30 mx-auto flex max-w-2xl animate-rise flex-col gap-2 rounded-xl bg-surface p-3 shadow-float desktop:bottom-6"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-auto text-body-sm font-bold text-ink" aria-live="polite">
          {busy
            ? `Preparing ${progress.done} of ${progress.total}…`
            : `${selected.size} selected${plan.totalBytes > 0 ? ` · ${formatBytes(plan.totalBytes)}` : ""}`}
        </span>
        {!busy ? (
          selected.size === items.length ? (
            <Button variant="ghost" size="sm" onClick={onClear}>
              Clear
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={onSelectAll}>
              Select all
            </Button>
          )
        ) : null}
        <Button
          size="sm"
          onClick={download}
          disabled={busy || plan.include.length === 0 || plan.overLimit}
        >
          <Download aria-hidden size={14} />
          {busy ? "Downloading…" : "Download"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDone}
          disabled={busy}
          aria-label="Stop selecting"
        >
          <X aria-hidden size={16} />
        </Button>
      </div>
      {notes.length > 0 || message ? (
        <p className="text-caption text-muted">{[message, ...notes].filter(Boolean).join(". ")}.</p>
      ) : null}
    </div>
  );
}

function Lightbox({
  items,
  index,
  onChange,
  onClose,
  canDelete,
  shared,
}: {
  items: GalleryItem[];
  index: number;
  onChange: (index: number) => void;
  onClose: () => void;
  canDelete: boolean;
  shared: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const touchStartX = useRef<number | null>(null);
  const item = items[index];
  const hasPrevious = index > 0;
  const hasNext = index < items.length - 1;

  const go = useCallback(
    (step: -1 | 1) => {
      const next = index + step;
      if (next >= 0 && next < items.length) onChange(next);
    },
    [index, items.length, onChange],
  );

  // showModal() gives focus trapping, Escape to close and a backdrop for free.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") go(-1);
      if (event.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  const opensInDrive = item.sizeBytes > DIRECT_DOWNLOAD_MAX_BYTES;
  const download = downloadUrl(item);
  const view = viewUrl(item);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-label={item.fileName}
      className="m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-black p-0 text-white backdrop:bg-black"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-3 p-3">
          <span className="text-body-sm tabular-nums">
            {index + 1} of {items.length}
          </span>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="flex h-11 items-center rounded-full bg-white/15 px-4 text-body-sm font-medium"
          >
            Close
          </button>
        </div>

        <div
          className="relative flex min-h-0 flex-1 items-center justify-center"
          onTouchStart={(event) => {
            touchStartX.current = event.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(event) => {
            const start = touchStartX.current;
            const end = event.changedTouches[0]?.clientX;
            touchStartX.current = null;
            if (start === null || end === undefined) return;
            if (end - start > 60) go(-1);
            if (start - end > 60) go(1);
          }}
        >
          <LightboxImage key={item.id} item={item} />

          {hasPrevious ? (
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Previous"
              className="absolute left-2 hidden h-11 w-11 items-center justify-center rounded-full bg-white/15 text-title-lg tablet:flex"
            >
              ‹
            </button>
          ) : null}
          {hasNext ? (
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Next"
              className="absolute right-2 hidden h-11 w-11 items-center justify-center rounded-full bg-white/15 text-title-lg tablet:flex"
            >
              ›
            </button>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="flex flex-col gap-0.5">
            <span className="truncate text-body-sm font-medium">
              {item.fileName}
            </span>
            <span className="text-caption text-white/70">
              {item.caption}
              {item.uploadedBy ? ` · ${item.uploadedBy}` : ""} ·{" "}
              {formatBytes(item.sizeBytes)}
            </span>
          </div>
          {download || (item.isVideo && view) ? (
            <div className="flex flex-wrap gap-2 tablet:max-w-md">
              {item.isVideo && view ? (
                <a
                  href={view}
                  target="_blank"
                  rel="noreferrer"
                  className={buttonClasses("primary", "md", "flex-1")}
                >
                  Play in Google Drive
                </a>
              ) : null}
              {download ? (
                <a
                  href={download}
                  {...(opensInDrive
                    ? { target: "_blank", rel: "noreferrer" }
                    : { download: item.fileName })}
                  className={
                    item.isVideo && view
                      ? "flex h-12 flex-1 items-center justify-center rounded-full border border-white/40 px-6 text-body-sm font-bold"
                      : buttonClasses("primary", "md", "flex-1")
                  }
                >
                  {opensInDrive ? "Download from Drive" : "Download"}
                </a>
              ) : null}
            </div>
          ) : null}
          {(item.isVideo && view) || (download && opensInDrive) ? (
            <p className="text-caption text-white/70">
              {shared
                ? "Opens in Google Drive."
                : "Opens in Google Drive. Use the same Google account you sign in here with."}
            </p>
          ) : null}
          {canDelete ? (
            // Keyed by file so a message about one file never shows on the next.
            <ActionButton
              key={item.id}
              action={deleteUpload}
              fields={{ upload_id: item.id }}
              label="Delete this file"
              pendingLabel="Deleting…"
              variant="danger"
              className="self-start"
              confirmMessage={`Delete ${item.fileName}? It moves to the Google Drive bin, where it can be restored for 30 days.`}
            />
          ) : null}
        </div>
      </div>
    </dialog>
  );
}

function LightboxImage({ item }: { item: GalleryItem }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <p className="px-6 text-center text-body-sm text-white/70">
        No preview yet. Google is still preparing it, or this file type has
        none. You can still download it.
      </p>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={thumbUrl(item, 1600)}
      alt={item.fileName}
      onError={() => setFailed(true)}
      className="max-h-full max-w-full object-contain"
    />
  );
}
