"use client";

import { Check, Copy, Link2 } from "lucide-react";
import { useActionState, useState } from "react";
import { createShareLink } from "@/app/(app)/admin/shares/actions";
import { Button, buttonClasses } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { EXPIRY_CHOICES } from "@/lib/domain/share";
import { EMPTY_FORM_STATE } from "@/lib/form-state";

/** Copies a link, and says so for a moment. */
export function CopyLinkButton({ url, label = "Copy link" }: { url: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Clipboard access can be refused; the link is shown to copy by hand.
        }
      }}
    >
      {copied ? <Check aria-hidden size={14} /> : <Copy aria-hidden size={14} />}
      {copied ? "Copied" : label}
    </Button>
  );
}

/**
 * "Share": makes a link someone without an account can open. What the link
 * covers is fixed by where the button is (an album, a service, a category or
 * the whole gallery) and spelled out before it is created.
 */
export function ShareButton({
  serviceId,
  categoryId,
  covers,
  wide = false,
  initiallyOpen = false,
  regions = [],
  allowAllRegions = true,
}: {
  serviceId?: string;
  categoryId?: string;
  /** What the link will cover, in words: "Baptism from Sunday Service, Oct 12". */
  covers: string;
  /** True when the link covers a lot, to add a word of caution. */
  wide?: boolean;
  initiallyOpen?: boolean;
  /**
   * For a link not tied to one service: the regions it can cover. Region
   * admins choose one of theirs; overall admins can also share every region.
   */
  regions?: { id: string; name: string }[];
  allowAllRegions?: boolean;
}) {
  const askRegion = !serviceId && (regions.length > 1 || (!allowAllRegions && regions.length > 0));
  const [state, action, pending] = useActionState(createShareLink, EMPTY_FORM_STATE);

  return (
    <Modal
      title="Share"
      description={covers}
      initiallyOpen={initiallyOpen}
      triggerClassName={buttonClasses("secondary")}
      trigger={
        <>
          <Link2 aria-hidden size={16} />
          Share
        </>
      }
    >
      {state.url ? (
        <div className="flex flex-col gap-3">
          <p role="status" className="text-body-sm text-success">
            Link created. Anyone with it can open it without an account.
          </p>
          <Input label="Link" value={state.url} readOnly onFocus={(event) => event.target.select()} />
          <div className="flex flex-wrap gap-2">
            <CopyLinkButton url={state.url} />
            <a
              href={state.url}
              target="_blank"
              rel="noreferrer"
              className={buttonClasses("ghost", "sm")}
            >
              Open it
            </a>
          </div>
          <p className="text-caption text-muted">
            You can find this link again, or turn it off, under Admin, Shared
            links.
          </p>
        </div>
      ) : (
        <form action={action} className="flex flex-col gap-4">
          {serviceId ? <input type="hidden" name="service_id" value={serviceId} /> : null}
          {categoryId ? <input type="hidden" name="category_id" value={categoryId} /> : null}

          <p className="rounded-md bg-surface-soft p-3 text-body-sm text-ink-soft">
            Anyone with the link can see <strong className="text-ink">{covers}</strong>,
            and nothing else in the app.
            {wide
              ? " That includes everything added to it later, so share it with care."
              : ""}
          </p>

          {askRegion ? (
            <Select label="Which region" name="region" defaultValue={allowAllRegions ? "" : regions[0]?.id}>
              {allowAllRegions ? <option value="">Every region</option> : null}
              {regions.map((region) => (
                <option key={region.id} value={region.id}>
                  {region.name}
                </option>
              ))}
            </Select>
          ) : null}

          <Input
            label="Who is it for?"
            name="label"
            placeholder="Pastor James"
            maxLength={80}
            required
          />
          <Select label="Expires" name="expires" defaultValue="30">
            {EXPIRY_CHOICES.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </Select>
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              name="allow_download"
              defaultChecked
              className="mt-1 h-4 w-4 accent-[var(--color-primary)]"
            />
            <span className="flex flex-col">
              <span className="text-body-sm font-bold text-ink">Allow downloads</span>
              <span className="text-caption text-muted">
                Without this they can look, but not save the originals.
              </span>
            </span>
          </label>

          <FormMessage state={state} />
          <Button type="submit" disabled={pending}>
            {pending ? "Creating…" : "Create link"}
          </Button>
        </form>
      )}
    </Modal>
  );
}
