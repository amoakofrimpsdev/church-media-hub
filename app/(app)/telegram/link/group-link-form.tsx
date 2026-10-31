"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Select } from "@/components/ui/select";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import { confirmTelegramLink } from "./actions";

const MEDIA_CHOICES = [
  { value: "all", label: "Everything", help: "Upload links, reminders and uploads for photos and videos" },
  { value: "photos", label: "Photography", help: "Photo upload links, tagging photographers" },
  { value: "videos", label: "Video", help: "Video upload links, tagging videographers" },
] as const;

/**
 * Linking a Telegram group: for which region (or the church's main group),
 * what the group is for, and whether it gets handoff alerts.
 */
export function GroupLinkForm({
  token,
  regions,
  canLinkMain,
}: {
  token: string;
  regions: { id: string; name: string }[];
  /** Super admins can make it the church's main group. */
  canLinkMain: boolean;
}) {
  const [state, action, pending] = useActionState(confirmTelegramLink, EMPTY_FORM_STATE);
  const [region, setRegion] = useState(regions[0]?.id ?? "");
  const forRegion = region !== "";

  if (state.success) {
    return (
      <p role="status" className="rounded-md bg-success-soft p-3 text-body-sm text-success">
        {state.success}
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      {regions.length > 1 || canLinkMain ? (
        <Select label="For" name="region" value={region} onChange={(event) => setRegion(event.target.value)}>
          {regions.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name}
            </option>
          ))}
          {canLinkMain ? <option value="">The church&apos;s main group (every region without its own)</option> : null}
        </Select>
      ) : (
        <input type="hidden" name="region" value={region} />
      )}

      {forRegion ? (
        <>
          <fieldset className="flex min-w-0 flex-col gap-2">
            <legend className="mb-2 text-body-sm font-bold text-ink">This group is for</legend>
            {MEDIA_CHOICES.map((choice) => (
              <label key={choice.value} className="flex items-start gap-3 rounded-md bg-surface-soft p-3">
                <input
                  type="radio"
                  name="media"
                  value={choice.value}
                  defaultChecked={choice.value === "all"}
                  className="mt-1 h-4 w-4 accent-primary"
                />
                <span className="flex flex-col">
                  <span className="text-body-sm font-bold text-ink">{choice.label}</span>
                  <span className="text-caption text-muted">{choice.help}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <label className="flex items-start gap-3">
            <input type="checkbox" name="handoff_alerts" defaultChecked className="mt-1 h-4 w-4 accent-primary" />
            <span className="flex flex-col">
              <span className="text-body-sm font-bold text-ink">Handoff alerts</span>
              <span className="text-caption text-muted">
                “Ready for Social Media”, “Late”. Turn off for groups that do not need them.
              </span>
            </span>
          </label>
        </>
      ) : null}

      <FormMessage state={state} />
      <Button type="submit" disabled={pending}>
        {pending ? "Linking…" : "Link this group"}
      </Button>
    </form>
  );
}
