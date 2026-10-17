"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { RegionSelect, type RegionOption } from "@/components/ui/region-select";
import { Select } from "@/components/ui/select";
import type { Role } from "@/lib/domain/permissions";
import { isRole, ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/domain/roles";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import type { Team } from "@/lib/supabase/database.types";
import { invitePerson } from "./actions";

export function InviteForm({
  teams,
  regions,
  isAdmin,
}: {
  teams: Team[];
  /** Regions the inviter runs. */
  regions: RegionOption[];
  /** Overall admins can invite admins and make region admins. */
  isAdmin: boolean;
}) {
  const [state, action, pending] = useActionState(
    invitePerson,
    EMPTY_FORM_STATE,
  );

  const [role, setRole] = useState<Role>("member");
  const isViewer = role === "viewer";

  return (
    <form action={action} className="flex flex-col gap-4">
      <Input
        label="Google email address"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="off"
        autoCapitalize="none"
        placeholder="name@gmail.com"
        required
      />
      <div className="grid gap-4 tablet:grid-cols-2">
        <Select
          label="Role"
          name="role"
          value={role}
          onChange={(event) => {
            if (isRole(event.target.value)) setRole(event.target.value);
          }}
        >
          {ROLES.filter((option) => isAdmin || option !== "admin").map((option) => (
            <option key={option} value={option}>
              {ROLE_LABELS[option]}: {ROLE_DESCRIPTIONS[option]}
            </option>
          ))}
        </Select>
        <Select
          label={isViewer ? "Team" : "Team (optional)"}
          name="team_id"
          defaultValue=""
          required={isViewer}
        >
          <option value="">{isViewer ? "Choose a team…" : "No team"}</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </Select>
      </div>
      <RegionSelect regions={regions} label="Region they join" />
      {isAdmin && role === "member" && regions.length > 0 ? (
        <label className="flex items-start gap-3 rounded-md bg-surface-soft p-3 text-body-sm text-ink">
          <input type="checkbox" name="region_admin" className="mt-1 h-4 w-4 accent-primary" />
          <span className="flex flex-col">
            <span className="font-bold">Region admin</span>
            <span className="text-caption text-muted">
              Runs this region: its services, schedule, people, Drive and Telegram group.
            </span>
          </span>
        </label>
      ) : null}
      {isViewer ? (
        <p className="text-body-sm text-muted">
          A viewer sees only the categories delivered to their team, so they
          need one.
          {teams.length === 0 ? " There are no teams yet: create one under Admin → Teams first." : ""}
        </p>
      ) : null}
      <FormMessage state={state} />
      <Button type="submit" disabled={pending} className="tablet:self-start">
        {pending ? "Inviting…" : "Invite"}
      </Button>
    </form>
  );
}
