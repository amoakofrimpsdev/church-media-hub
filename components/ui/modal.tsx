"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * A button that opens a panel: a sheet rising from the bottom on a phone, a
 * centred dialog on a bigger screen. Used so a card can stay small and show
 * its controls only when asked.
 */
export function Modal({
  title,
  description,
  trigger,
  triggerClassName,
  triggerLabel,
  children,
  initiallyOpen = false,
}: {
  title: string;
  description?: string;
  /** What the button looks like. */
  trigger: ReactNode;
  triggerClassName?: string;
  /** Read by screen readers when the trigger has no clear text of its own. */
  triggerLabel?: string;
  children: ReactNode;
  /** Used by preview pages to show the panel. */
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label={triggerLabel}
        onClick={() => setOpen(true)}
        className={triggerClassName}
      >
        {trigger}
      </button>
      <dialog
        ref={dialog}
        onClose={() => setOpen(false)}
        onClick={(event) => {
          // A click on the backdrop (the dialog element itself) closes it.
          if (event.target === event.currentTarget) setOpen(false);
        }}
        aria-label={title}
        className={cn(
          "m-0 mt-auto max-h-[90dvh] w-full max-w-none overflow-hidden rounded-t-xl border-0 bg-surface p-0 text-ink shadow-float backdrop:bg-scrim/60",
          "tablet:m-auto tablet:max-w-lg tablet:rounded-xl",
          open && "animate-rise",
        )}
      >
        <div className="flex max-h-[90dvh] flex-col">
          <div className="flex items-start justify-between gap-3 border-b border-hairline px-5 py-4">
            <div className="flex min-w-0 flex-col gap-0.5">
              <h2 className="truncate text-title-lg text-ink">{title}</h2>
              {description ? (
                <p className="text-caption text-muted">{description}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-strong transition-colors hover:bg-surface-hover"
            >
              <X aria-hidden size={18} />
            </button>
          </div>
          <div className="flex min-w-0 flex-col gap-5 overflow-x-hidden overflow-y-auto p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            {children}
          </div>
        </div>
      </dialog>
    </>
  );
}
