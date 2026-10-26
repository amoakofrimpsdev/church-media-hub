"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Select } from "@/components/ui/select";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import { mergeService } from "../../actions";

export type MergeCandidate = {
  id: string;
  /** "Sunday Service · Sun, Oct 12, 10:00 AM · OC · 23 files" */
  label: string;
  name: string;
};

/** Picks a duplicate service and merges it into this one. */
export function MergeServiceForm({
  serviceId,
  serviceName,
  candidates,
}: {
  serviceId: string;
  serviceName: string;
  candidates: MergeCandidate[];
}) {
  const [state, action, pending] = useActionState(mergeService, EMPTY_FORM_STATE);

  if (candidates.length === 0) {
    return (
      <p className="text-body-sm text-muted">
        No other services in the week either side that you could merge in.
      </p>
    );
  }

  return (
    <form
      action={action}
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        const select = event.currentTarget.elements.namedItem("merge_id") as HTMLSelectElement | null;
        const chosen = candidates.find((candidate) => candidate.id === select?.value);
        if (
          !chosen ||
          !window.confirm(
            `Move everything from “${chosen.name}” into “${serviceName}”, then delete “${chosen.name}”? This cannot be undone.`,
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="service_id" value={serviceId} />
      <Select label="Duplicate to merge in" name="merge_id" defaultValue="" required>
        <option value="" disabled>
          Choose a service…
        </option>
        {candidates.map((candidate) => (
          <option key={candidate.id} value={candidate.id}>
            {candidate.label}
          </option>
        ))}
      </Select>
      <FormMessage state={state} />
      <Button type="submit" variant="secondary" disabled={pending} className="self-start">
        {pending ? "Merging… (moving files in Drive)" : "Merge into this service"}
      </Button>
    </form>
  );
}
