"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { AlsoForRegions } from "@/components/ui/also-for";
import { Input } from "@/components/ui/input";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import { updateService } from "../../actions";

export function EditServiceForm({
  serviceId,
  name,
  date,
  time,
  otherRegions,
  alsoFor,
}: {
  serviceId: string;
  name: string;
  date: string;
  time: string;
  /** Regions other than the service's own, for "Also for". */
  otherRegions: { id: string; name: string }[];
  alsoFor: string[];
}) {
  const [state, action, pending] = useActionState(updateService, EMPTY_FORM_STATE);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="service_id" value={serviceId} />
      <Input label="Name" name="name" defaultValue={name} maxLength={80} required />
      <div className="grid grid-cols-2 gap-4">
        <Input label="Date" name="date" type="date" defaultValue={date} required />
        <Input label="Time (Pacific)" name="time" type="time" defaultValue={time} required />
      </div>
      <AlsoForRegions regions={otherRegions} checked={alsoFor} />
      <FormMessage state={state} />
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
