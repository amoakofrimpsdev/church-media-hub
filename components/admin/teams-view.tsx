import { Camera, PackageCheck, Settings2, UsersRound } from "lucide-react";
import { CreateTeamForm } from "@/app/(app)/admin/teams/create-team-form";
import { TeamManageForm } from "@/app/(app)/admin/teams/team-manage-form";
import { AvatarStack } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { ADD_TILE, AdminHeader } from "./page-header";

export type TeamCardData = {
  id: string;
  name: string;
  kind: "media" | "receiving";
  members: { id: string; name: string }[];
  /** Active people who are not on this team yet. */
  candidates: { id: string; name: string }[];
  /** Categories delivered to this team. */
  receives: string[];
};

export type TeamsData = { teams: TeamCardData[] };

/** Each team as a card showing who is on it and what it receives. */
export function TeamsView({ data }: { data: TeamsData }) {
  return (
    <div className="stagger flex flex-col gap-6">
      <AdminHeader
        title="Teams"
        description="Receiving teams see only the categories delivered to them. Open a team to change who is on it."
      />

      <ul className="grid grid-cols-1 gap-3 tablet:grid-cols-2 tablet:gap-4 desktop:grid-cols-3">
        {data.teams.map((team) => (
          <li key={team.id}>
            <Modal
              title={team.name}
              description={
                team.kind === "media"
                  ? "Media team: captures and uploads."
                  : "Receiving team: gets content from the media team."
              }
              triggerLabel={`Open ${team.name}`}
              triggerClassName="group flex h-full min-h-44 w-full flex-col gap-4 rounded-lg bg-surface shadow-card p-4 text-left transition-colors hover:bg-surface-soft"
              trigger={
                <>
                  <span className="flex items-start justify-between gap-2">
                    <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary-soft text-primary">
                      {team.kind === "media" ? (
                        <Camera aria-hidden size={20} />
                      ) : (
                        <PackageCheck aria-hidden size={20} />
                      )}
                    </span>
                    <Settings2
                      aria-hidden
                      size={16}
                      className="text-muted-soft transition-colors group-hover:text-ink"
                    />
                  </span>
                  <span className="flex flex-col gap-0.5">
                    <span className="truncate text-title text-ink">{team.name}</span>
                    <span className="text-caption text-muted">
                      {team.kind === "media" ? "Media team" : "Receiving team"}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    {team.members.length > 0 ? (
                      <AvatarStack names={team.members.map((member) => member.name)} />
                    ) : null}
                    <span className="text-caption text-muted">
                      {team.members.length === 0
                        ? "Nobody yet"
                        : team.members.length === 1
                          ? "1 person"
                          : `${team.members.length} people`}
                    </span>
                  </span>
                  {team.kind === "receiving" ? (
                    <span className="mt-auto flex flex-wrap gap-1.5">
                      {team.receives.length === 0 ? (
                        <Badge tone="warning">Receives nothing yet</Badge>
                      ) : (
                        team.receives.map((category) => (
                          <Badge key={category}>{category}</Badge>
                        ))
                      )}
                    </span>
                  ) : null}
                </>
              }
            >
              <TeamManageForm
                teamId={team.id}
                teamName={team.name}
                members={team.members}
                candidates={team.candidates}
              />
              {team.kind === "receiving" ? (
                <p className="text-caption text-muted">
                  What this team receives is set per category, under Admin,
                  Categories.
                </p>
              ) : null}
            </Modal>
          </li>
        ))}
        <li>
          <Modal
            title="New team"
            triggerClassName={ADD_TILE}
            trigger={
              <>
                <UsersRound aria-hidden size={24} />
                New team
              </>
            }
          >
            <CreateTeamForm />
          </Modal>
        </li>
      </ul>
    </div>
  );
}
