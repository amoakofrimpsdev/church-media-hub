"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { RegionSelect, type RegionOption } from "@/components/ui/region-select";
import { Select } from "@/components/ui/select";
import { REPEAT_CHOICES, WEEKDAYS } from "@/lib/domain/recurrence";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import { createSeries } from "./actions";

/** The next date that falls on a weekday, as "YYYY-MM-DD" (today counts). */
function nextDateOn(weekday: number): string {
  const day = new Date();
  day.setDate(day.getDate() + ((weekday - day.getDay() + 7) % 7));
  const month = String(day.getMonth() + 1).padStart(2, "0");
  return `${day.getFullYear()}-${month}-${String(day.getDate()).padStart(2, "0")}`;
}

export function SeriesForm({ regions }: { regions: RegionOption[] }) {
  const [state, action, pending] = useActionState(createSeries, EMPTY_FORM_STATE);
  const [weekday, setWeekday] = useState(0);
  const [interval, setInterval] = useState("1");
  const everyWeek = interval === "1";

  return (
    <form action={action} className="flex flex-col gap-4">
      <RegionSelect regions={regions} />
      <Input label="Name" name="name" placeholder="Sunday Service" maxLength={80} required />
      <div className="grid grid-cols-2 gap-4">
        <Select
          label="Day"
          name="weekday"
          value={String(weekday)}
          onChange={(event) => setWeekday(Number(event.target.value))}
        >
          {WEEKDAYS.map((day, index) => (
            <option key={day} value={index}>
              {day}
            </option>
          ))}
        </Select>
        <Input
          label="Time (Pacific)"
          name="time"
          type="time"
          defaultValue="10:00"
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Select
          label="Repeats"
          name="interval_weeks"
          value={interval}
          onChange={(event) => setInterval(event.target.value)}
        >
          {REPEAT_CHOICES.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </Select>
        {everyWeek ? null : (
          // Keyed by weekday so the suggested date follows a change of day.
          <Input
            key={weekday}
            label={`First ${WEEKDAYS[weekday]}`}
            name="anchor_date"
            type="date"
            defaultValue={nextDateOn(weekday)}
            required
          />
        )}
      </div>
      {everyWeek ? null : (
        <p className="text-caption text-muted">
          The first date sets which weeks it falls on. For two groups that take
          turns, such as women one Wednesday and men the next, add two of
          these, every other week, starting a week apart.
        </p>
      )}
      <FormMessage state={state} />
      <Button type="submit" disabled={pending} className="tablet:self-start">
        {pending ? "Adding…" : "Add"}
      </Button>
    </form>
  );
}
