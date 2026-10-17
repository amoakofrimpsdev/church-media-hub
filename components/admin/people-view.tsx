import { MailPlus, MapPin, Settings2, TriangleAlert, UserPlus } from "lucide-react";
import Link from "next/link";
import { InviteForm } from "@/app/(app)/admin/people/invite-form";
import {
  CancelInviteButton,
  PersonManageForm,
  PersonRegionsForm,
  type PersonRegion,
} from "@/app/(app)/admin/people/person-manage-form";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/cn";
import type { Role } from "@/lib/domain/permissions";
import { ROLE_LABELS } from "@/lib/domain/roles";
import type { Team } from "@/lib/supabase/database.types";
import { AdminHeader } from "./page-header";

export type PersonCard = {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  isSelf: boolean;
  teams: string[];
  telegramLinked: boolean;
  /** Region names shown on the card (when there is more than one region). */
  regionNames: string[];
  /** The regions the viewer of this page runs, with this person's place in each. */
  regions: PersonRegion[];
};

export type PeopleData = {
  people: PersonCard[];
  invites: { email: string; role: Role; teamName: string | null; regionName: string | null }[];
  /** For the invite form's team picker. */
  teams: Team[];
  /** Regions the person on this page runs. */
  regions: { id: string; name: string }[];
  /** Overall admins change roles and access; region admins only regions. */
  isAdmin: boolean;
};

const ROLE_TONE: Record<Role, "accent" | "neutral" | "success"> = {
  admin: "accent",
  member: "success",
  viewer: "neutral",
};

/** Everyone with access as a card, plus who has been invited but not joined. */
export function PeopleView({ data }: { data: PeopleData }) {
  return (
    <div className="stagger flex flex-col gap-6">
      <AdminHeader
        title="People"
        description="Only people you invite here can sign in. Open someone to change their role or access."
        action={
          <Modal
            title="Invite someone"
            description="They sign in with Google using this email address."
            triggerClassName={buttonClasses("primary")}
            trigger={
              <>
                <UserPlus aria-hidden size={18} />
                Invite
              </>
            }
          >
            <InviteForm teams={data.teams} regions={data.regions} isAdmin={data.isAdmin} />
          </Modal>
        }
      />

      {data.invites.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-title-lg text-ink">
            Waiting to sign in ({data.invites.length})
          </h2>
          <ul className="grid gap-3 tablet:grid-cols-2 desktop:grid-cols-3">
            {data.invites.map((invite) => (
              <li
                key={invite.email}
                className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-hairline p-3"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-strong text-muted">
                    <MailPlus aria-hidden size={16} />
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-body-sm font-bold text-ink">
                      {invite.email}
                    </span>
                    <span className="truncate text-caption text-muted">
                      {ROLE_LABELS[invite.role]}
                      {invite.teamName ? ` · ${invite.teamName}` : ""}
                      {invite.regionName ? ` · ${invite.regionName}` : ""}
                    </span>
                  </span>
                </span>
                <CancelInviteButton email={invite.email} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-title-lg text-ink">Has access ({data.people.length})</h2>
        <ul className="grid gap-3 tablet:grid-cols-2 tablet:gap-4 desktop:grid-cols-3">
          {data.people.map((person) => (
            <li key={person.id}>
              <PersonTile person={person} isAdmin={data.isAdmin} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function PersonTile({ person, isAdmin }: { person: PersonCard; isAdmin: boolean }) {
  const viewerWithoutTeam =
    person.role === "viewer" && person.active && person.teams.length === 0;

  const body = (
    <>
      <span className="flex items-start justify-between gap-2">
        <Avatar name={person.name} size="lg" className={person.active ? "" : "opacity-50"} />
        {person.isSelf ? (
          <Badge>You</Badge>
        ) : (
          <Settings2
            aria-hidden
            size={16}
            className="text-muted-soft transition-colors group-hover:text-ink"
          />
        )}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className={cn("truncate text-title", person.active ? "text-ink" : "text-muted")}>
          {person.name}
        </span>
        <span className="truncate text-caption text-muted">{person.email}</span>
      </span>
      <span className="mt-auto flex flex-wrap gap-1.5">
        {person.active ? (
          <Badge tone={ROLE_TONE[person.role]}>{ROLE_LABELS[person.role]}</Badge>
        ) : (
          <Badge tone="danger">Access off</Badge>
        )}
        {person.regionNames.map((region) => (
          <Badge key={`region-${region}`}>
            <MapPin aria-hidden size={11} className="mr-1" />
            {region}
          </Badge>
        ))}
        {person.teams.map((team) => (
          <Badge key={team}>{team}</Badge>
        ))}
        {viewerWithoutTeam ? (
          <Badge tone="warning">
            <TriangleAlert aria-hidden size={11} className="mr-1" />
            No team
          </Badge>
        ) : null}
      </span>
    </>
  );
  const tile =
    "group flex h-full min-h-40 w-full flex-col gap-3 rounded-lg bg-surface shadow-card p-4 text-left";

  // Your own access is changed by another admin, so your card does not open.
  if (person.isSelf) return <div className={tile}>{body}</div>;

  return (
    <Modal
      title={person.name}
      description={person.email}
      triggerLabel={`Open ${person.name}`}
      triggerClassName={cn(tile, "transition-colors hover:bg-surface-soft")}
      trigger={body}
    >
      {viewerWithoutTeam ? (
        <p className="rounded-md bg-warning-soft p-3 text-body-sm text-warning">
          Not on a team, so they cannot see any photos or handoffs.{" "}
          <Link href="/admin/teams" className="font-bold underline">
            Add them to a team
          </Link>
        </p>
      ) : null}
      {person.regions.length > 0 && person.role !== "admin" ? (
        <PersonRegionsForm
          personId={person.id}
          regions={person.regions}
          canSetRegionAdmin={isAdmin && person.role === "member"}
        />
      ) : null}
      {isAdmin ? (
        <PersonManageForm
          personId={person.id}
          personName={person.name}
          role={person.role}
          active={person.active}
        />
      ) : null}
      <p className="text-caption text-muted">
        {person.telegramLinked
          ? "Telegram is connected, so the bot can tag them."
          : "Telegram is not connected yet. They can send /join to the bot."}
      </p>
    </Modal>
  );
}
