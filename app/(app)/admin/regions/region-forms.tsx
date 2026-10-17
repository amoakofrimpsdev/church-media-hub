"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import { createRegion, updateRegion } from "./actions";

export function CreateRegionForm() {
  const [state, action, pending] = useActionState(createRegion, EMPTY_FORM_STATE);
  return (
    <form action={action} className="flex flex-col gap-4">
      <Input label="Region name" name="name" placeholder="West Valley" maxLength={60} required />
      <FormMessage state={state} />
      <Button type="submit" disabled={pending} className="tablet:self-start">
        {pending ? "Adding…" : "Add region"}
      </Button>
    </form>
  );
}

export function RenameRegionForm({ regionId, name }: { regionId: string; name: string }) {
  const [state, action, pending] = useActionState(updateRegion, EMPTY_FORM_STATE);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="region_id" value={regionId} />
      <input type="hidden" name="intent" value="rename" />
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Input label="Name" name="name" defaultValue={name} maxLength={60} required />
        </div>
        <Button type="submit" variant="secondary" disabled={pending}>
          Save
        </Button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
