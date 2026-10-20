"use client";

import { useActionState, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Select } from "@/components/ui/select";
import type { Role } from "@/lib/domain/permissions";
import { isRole, parseEmailList, ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/domain/roles";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import type { Team } from "@/lib/supabase/database.types";
import { invitePeople } from "./actions";

/**
 * Invite one person or paste a whole list. Everyone gets the same role, team
 * and regions.
 */
export function InviteForm({
  teams,
  regions,
  isAdmin,
}: {
  teams: Team[];
  /** Regions the inviter runs. */
  regions: { id: string; name: string }[];
  /** Super admins can invite admins and make region admins. */
  isAdmin: boolean;
}) {
  const [state, action, pending] = useActionState(invitePeople, EMPTY_FORM_STATE);
  const [role, setRole] = useState<Role>("member");
  const [emailText, setEmailText] = useState("");
  const [joining, setJoining] = useState<Set<string>>(
    () => new Set(regions.length === 1 ? [regions[0].id] : []),
  );
  const isViewer = role === "viewer";
  const emailsId = useId();
  const count = parseEmailList(emailText).emails.length;

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor={emailsId} className="text-body-sm font-bold text-ink">
          Google email addresses
        </label>
        <textarea
          id={emailsId}
          name="emails"
          rows={4}
          required
          value={emailText}
          onChange={(event) => setEmailText(event.target.value)}
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          placeholder={"name@gmail.com\nanother@gmail.com"}
          className="rounded-md border border-hairline bg-surface-soft px-4 py-3 text-body text-ink transition-colors placeholder:text-muted-soft hover:border-muted focus:border-primary"
        />
        <p className="text-caption text-muted">
          One, or a whole list: one per line or separated by commas.
          {count > 1 ? ` ${count} addresses.` : ""}
        </p>
      </div>

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

      {regions.length > 1 && role !== "admin" ? (
        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className="mb-2 text-body-sm font-bold text-ink">Regions they join</legend>
          <ul className="flex flex-col gap-2">
            {regions.map((region) => {
              const ticked = joining.has(region.id);
              return (
                <li
                  key={region.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-soft px-3 py-2"
                >
                  <label className="flex items-center gap-3 text-body-sm font-bold text-ink">
                    <input
                      type="checkbox"
                      name={`region:${region.id}`}
                      checked={ticked}
                      onChange={(event) =>
                        setJoining((previous) => {
                          const next = new Set(previous);
                          if (event.target.checked) next.add(region.id);
                          else next.delete(region.id);
                          return next;
                        })
                      }
                      className="h-4 w-4 accent-primary"
                    />
                    {region.name}
                  </label>
                  {isAdmin && role === "member" && ticked ? (
                    <label className="flex items-center gap-2 text-caption text-muted">
                      <input
                        type="checkbox"
                        name={`region_admin:${region.id}`}
                        className="h-4 w-4 accent-primary"
                      />
                      Region admin
                    </label>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </fieldset>
      ) : regions.length === 1 && isAdmin && role === "member" ? (
        <label className="flex items-start gap-3 rounded-md bg-surface-soft p-3 text-body-sm text-ink">
          <input
            type="checkbox"
            name={`region_admin:${regions[0].id}`}
            className="mt-1 h-4 w-4 accent-primary"
          />
          <span className="flex flex-col">
            <span className="font-bold">Region admin of {regions[0].name}</span>
            <span className="text-caption text-muted">
              Runs the region: its services, schedule, people, Drive and Telegram group.
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
        {pending ? "Inviting…" : count > 1 ? `Invite ${count} people` : "Invite"}
      </Button>
    </form>
  );
}
