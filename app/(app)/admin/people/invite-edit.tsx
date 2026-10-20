"use client";

import { Check, Share2 } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Select } from "@/components/ui/select";
import type { Role } from "@/lib/domain/permissions";
import { isRole, ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/domain/roles";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import type { Team } from "@/lib/supabase/database.types";
import { updateInvite } from "./actions";
import { RegionChoices } from "./invite-form";

/** Inside a waiting invite's panel: change its role, team and regions. */
export function EditInviteForm({
  email,
  role: initialRole,
  teamId,
  regionIds,
  regionAdminIds,
  teams,
  regions,
  isAdmin,
}: {
  email: string;
  role: Role;
  teamId: string | null;
  regionIds: string[];
  regionAdminIds: string[];
  teams: Team[];
  regions: { id: string; name: string }[];
  isAdmin: boolean;
}) {
  const [state, action, pending] = useActionState(updateInvite, EMPTY_FORM_STATE);
  const [role, setRole] = useState<Role>(initialRole);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="email" value={email} />
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
          label={role === "viewer" ? "Team" : "Team (optional)"}
          name="team_id"
          defaultValue={teamId ?? ""}
          required={role === "viewer"}
        >
          <option value="">{role === "viewer" ? "Choose a team…" : "No team"}</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </Select>
      </div>
      <RegionChoices
        regions={regions}
        isAdmin={isAdmin}
        role={role}
        joined={regionIds}
        runs={regionAdminIds}
      />
      <FormMessage state={state} />
      <Button type="submit" variant="secondary" disabled={pending} className="self-start">
        {pending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}

/** The message to send someone so they can get in. */
export function inviteMessage(email: string, appUrl: string, botUsername: string | null): string {
  return [
    "Hi! You've been invited to RCW Media, where the media team uploads and finds photos and videos from every service.",
    "",
    `1. Open ${appUrl} and tap "Continue with Google". Use ${email}: it only works with that account.`,
    "2. On your phone, add it to your home screen so it opens like an app.",
    botUsername
      ? `3. So the bot can tag you: open a private chat with @${botUsername}, send /join and tap the link it replies with.`
      : null,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

/**
 * Opens the phone's share sheet (WhatsApp, Telegram, Messages, email…) with
 * the invite message filled in. On a computer, copies it instead.
 */
export function ShareInviteButton({
  email,
  appUrl,
  botUsername,
}: {
  email: string;
  appUrl: string;
  botUsername: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const text = inviteMessage(email, appUrl, botUsername);

  async function share() {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "RCW Media invite", text });
        return;
      } catch (error) {
        // Closing the share sheet is not a failure.
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard refused: the message is shown below to copy by hand.
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={share} className="self-start">
        {copied ? <Check aria-hidden size={16} /> : <Share2 aria-hidden size={16} />}
        {copied ? "Message copied" : "Share invite"}
      </Button>
      <p className="whitespace-pre-line rounded-md bg-surface-soft p-3 text-caption text-ink-soft">{text}</p>
    </div>
  );
}
