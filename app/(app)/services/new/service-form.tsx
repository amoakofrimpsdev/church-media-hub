"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { AlsoForRegions } from "@/components/ui/also-for";
import { Input } from "@/components/ui/input";
import { RegionSelect, type RegionOption } from "@/components/ui/region-select";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import { createService } from "../actions";

export function ServiceForm({
  defaultDate,
  regions,
  defaultRegion,
  allRegions,
}: {
  defaultDate: string;
  regions: RegionOption[];
  defaultRegion?: string;
  /** Every active region, for "Also for". */
  allRegions: RegionOption[];
}) {
  const [state, action, pending] = useActionState(
    createService,
    EMPTY_FORM_STATE,
  );

  return (
    <form action={action} className="flex flex-col gap-4">
      <RegionSelect regions={regions} defaultValue={defaultRegion} />
      <Input
        label="Name"
        name="name"
        defaultValue="Sunday Service"
        maxLength={80}
        required
      />
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Date"
          name="date"
          type="date"
          defaultValue={defaultDate}
          required
        />
        <Input
          label="Time (Pacific)"
          name="time"
          type="time"
          defaultValue="10:00"
          required
        />
      </div>
      {allRegions.length > 1 ? <AlsoForRegions regions={allRegions} /> : null}
      <FormMessage state={state} />
      <Button type="submit" disabled={pending}>
        {pending ? "Creating service and folders…" : "Create service"}
      </Button>
    </form>
  );
}
