import { HardDrive, MapPin, MapPinPlus, Send, Settings2 } from "lucide-react";
import Link from "next/link";
import {
  switchToChurchDrive,
  updateTelegramGroup,
  updateRegion,
} from "@/app/(app)/admin/regions/actions";
import { CreateRegionForm, RenameRegionForm } from "@/app/(app)/admin/regions/region-forms";
import { ActionButton } from "@/components/ui/action-button";
import { AvatarStack } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/cn";
import { ADD_TILE, AdminHeader } from "./page-header";

export type RegionCardData = {
  id: string;
  name: string;
  active: boolean;
  people: number;
  upcomingServices: number;
  /** Names of its region admins. */
  admins: string[];
  drive:
    | { kind: "church" }
    | { kind: "own"; email: string; expired: boolean };
  /** Old services still keep files in an account it no longer uses for new ones. */
  oldDriveEmail: string | null;
  /** The region's own Telegram groups. None: it uses the church's main group. */
  groups: {
    id: string;
    title: string;
    media: "all" | "photos" | "videos";
    handoffAlerts: boolean;
  }[];
};

export type RegionsData = {
  regions: RegionCardData[];
  /** Overall admins add, rename and retire regions. */
  isAdmin: boolean;
  botUsername: string | null;
  /** After coming back from connecting a Google account. */
  notice: { tone: "success" | "danger"; text: string } | null;
};

/** Each region as a card: who is in it, where its files go, where it posts. */
export function RegionsView({ data }: { data: RegionsData }) {
  return (
    <div className="stagger flex flex-col gap-6">
      <AdminHeader
        title={data.isAdmin ? "Regions" : "Your region"}
        description="Each region has its own services, people, Drive folder and Telegram group. Members only see their own region."
      />

      {data.notice ? (
        <p
          role="status"
          className={cn(
            "rounded-lg p-4 text-body-sm",
            data.notice.tone === "success" ? "bg-success-soft text-success" : "bg-danger-soft text-danger",
          )}
        >
          {data.notice.text}
        </p>
      ) : null}

      <ul className="grid grid-cols-1 gap-3 tablet:grid-cols-2 tablet:gap-4 desktop:grid-cols-3">
        {data.regions.map((region) => (
          <li key={region.id}>
            <RegionTile region={region} isAdmin={data.isAdmin} botUsername={data.botUsername} />
          </li>
        ))}
        {data.isAdmin ? (
          <li>
            <Modal
              title="New region"
              description="Its services, people and photos stay separate from the other regions."
              triggerClassName={ADD_TILE}
              trigger={
                <>
                  <MapPinPlus aria-hidden size={24} />
                  New region
                </>
              }
            >
              <CreateRegionForm />
            </Modal>
          </li>
        ) : null}
      </ul>
    </div>
  );
}

const MEDIA_LABELS = { all: "Everything", photos: "Photography", videos: "Video" } as const;

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

function RegionTile({
  region,
  isAdmin,
  botUsername,
}: {
  region: RegionCardData;
  isAdmin: boolean;
  botUsername: string | null;
}) {
  return (
    <Modal
      title={region.name}
      description={`${plural(region.people, "person", "people")} · ${plural(region.upcomingServices, "upcoming service", "upcoming services")}`}
      triggerLabel={`Open ${region.name}`}
      triggerClassName={cn(
        "group flex h-full min-h-48 w-full flex-col gap-4 rounded-lg bg-surface p-4 text-left shadow-card transition-colors hover:bg-surface-soft",
        !region.active && "opacity-60",
      )}
      trigger={
        <>
          <span className="flex items-start justify-between gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary-soft text-primary">
              <MapPin aria-hidden size={20} />
            </span>
            {region.active ? (
              <Settings2
                aria-hidden
                size={16}
                className="text-muted-soft transition-colors group-hover:text-ink"
              />
            ) : (
              <Badge>Retired</Badge>
            )}
          </span>
          <span className="flex flex-col gap-0.5">
            <span className="truncate text-title text-ink">{region.name}</span>
            <span className="text-caption text-muted">
              {plural(region.people, "person", "people")} ·{" "}
              {plural(region.upcomingServices, "upcoming service", "upcoming services")}
            </span>
          </span>
          {region.admins.length > 0 ? (
            <span className="flex items-center gap-2">
              <AvatarStack names={region.admins} max={3} />
              <span className="text-caption text-muted">
                {region.admins.length === 1 ? "Region admin" : "Region admins"}
              </span>
            </span>
          ) : null}
          <span className="mt-auto flex flex-wrap gap-1.5">
            {region.drive.kind === "own" ? (
              <Badge tone={region.drive.expired ? "danger" : "success"}>
                <HardDrive aria-hidden size={11} className="mr-1" />
                {region.drive.expired ? "Own Drive: reconnect" : "Own Drive"}
              </Badge>
            ) : (
              <Badge>
                <HardDrive aria-hidden size={11} className="mr-1" />
                Church Drive
              </Badge>
            )}
            <Badge tone={region.groups.length > 0 ? "success" : "neutral"}>
              <Send aria-hidden size={11} className="mr-1" />
              {region.groups.length === 0
                ? "Main group"
                : region.groups.length === 1
                  ? "Own group"
                  : `${region.groups.length} groups`}
            </Badge>
          </span>
        </>
      }
    >
      {isAdmin ? <RenameRegionForm regionId={region.id} name={region.name} /> : null}

      <section className="flex flex-col gap-2 border-t border-hairline pt-4">
        <h3 className="text-label text-muted uppercase">Where photos go</h3>
        {region.drive.kind === "own" ? (
          <>
            <p className="text-body-sm text-ink-soft">
              New services go into the region&apos;s own Google account,{" "}
              <strong className="text-ink">{region.drive.email}</strong>.
              {region.drive.expired ? " It needs reconnecting before uploads work." : ""}
            </p>
            <div className="flex flex-wrap gap-2">
              {region.drive.expired ? (
                <a
                  href={`/api/google/connect?region=${region.id}`}
                  className={buttonClasses("primary", "sm")}
                >
                  Reconnect
                </a>
              ) : null}
              <ActionButton
                action={switchToChurchDrive}
                fields={{ region_id: region.id }}
                label="Use the church Drive instead"
                confirmMessage={`New ${region.name} services will go into the church Drive. Files already uploaded stay where they are. Continue?`}
              />
            </div>
          </>
        ) : (
          <>
            <p className="text-body-sm text-ink-soft">
              New services go into a {region.name} folder in the church&apos;s Google
              Drive. If the region has its own Google account with space, connect it
              and new services will go there instead.
            </p>
            <a
              href={`/api/google/connect?region=${region.id}`}
              className={cn(buttonClasses("secondary", "sm"), "self-start")}
            >
              Connect its own Google account
            </a>
          </>
        )}
        {region.oldDriveEmail ? (
          <p className="text-caption text-muted">
            Older services keep their files in {region.oldDriveEmail}.
          </p>
        ) : null}
      </section>

      <section className="flex flex-col gap-2 border-t border-hairline pt-4">
        <h3 className="text-label text-muted uppercase">Telegram</h3>
        {region.groups.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {region.groups.map((group) => (
              <li key={group.id} className="flex flex-col gap-2 rounded-md bg-surface-soft p-3">
                <span className="flex flex-wrap items-center gap-2">
                  <strong className="text-body-sm text-ink">{group.title}</strong>
                  <Badge tone="accent">{MEDIA_LABELS[group.media]}</Badge>
                  {group.handoffAlerts ? <Badge>Handoff alerts</Badge> : null}
                </span>
                <span className="flex flex-wrap gap-2">
                  {(["all", "photos", "videos"] as const)
                    .filter((media) => media !== group.media)
                    .map((media) => (
                      <ActionButton
                        key={media}
                        action={updateTelegramGroup}
                        fields={{ group_id: group.id, intent: "media", media }}
                        label={`Make it ${MEDIA_LABELS[media].toLowerCase()}`}
                        variant="ghost"
                      />
                    ))}
                  <ActionButton
                    action={updateTelegramGroup}
                    fields={{ group_id: group.id, intent: group.handoffAlerts ? "handoffs_off" : "handoffs_on" }}
                    label={group.handoffAlerts ? "Turn off handoff alerts" : "Turn on handoff alerts"}
                    variant="ghost"
                  />
                  <ActionButton
                    action={updateTelegramGroup}
                    fields={{ group_id: group.id, intent: "unlink" }}
                    label="Unlink"
                    variant="ghost"
                    confirmMessage={`Stop posting in ${group.title}?`}
                  />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-body-sm text-ink-soft">
            Messages go to the church&apos;s main group.
          </p>
        )}
        <p className="text-caption text-muted">
          To link a group (for example one for photography and one for video): add{" "}
          {botUsername ? `@${botUsername}` : "the bot"} to it, send{" "}
          <code className="rounded bg-surface-soft px-1">/linkgroup</code> there, open the link it
          replies with, choose {region.name} and what the group is for. Photography groups get photo
          upload links and tag photographers; video groups tag videographers.
        </p>
      </section>

      <section className="flex flex-col gap-2 border-t border-hairline pt-4">
        <h3 className="text-label text-muted uppercase">People</h3>
        <p className="text-body-sm text-ink-soft">
          Add people to {region.name} under{" "}
          <Link href="/admin/people" className="font-bold text-primary underline">
            People
          </Link>
          : invite someone new, or open a person to tick their regions.
        </p>
      </section>

      {isAdmin ? (
        <section className="flex flex-col gap-2 border-t border-hairline pt-4">
          <ActionButton
            action={updateRegion}
            fields={{ region_id: region.id, intent: region.active ? "retire" : "restore" }}
            label={region.active ? "Retire this region" : "Bring back this region"}
            variant={region.active ? "danger" : "secondary"}
            confirmMessage={
              region.active
                ? `Retire ${region.name}? Its services and photos stay, but it stops appearing in choices.`
                : undefined
            }
          />
        </section>
      ) : null}
    </Modal>
  );
}
