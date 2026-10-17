import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/ui/action-button";
import { Card } from "@/components/ui/card";
import { requireProfile } from "@/lib/auth";
import { getManagedRegions } from "@/lib/regions";
import { findLinkToken } from "@/lib/telegram/link-tokens";
import { confirmTelegramLink } from "./actions";

export const metadata: Metadata = { title: "Connect Telegram" };

export default async function TelegramLinkPage({
  searchParams,
}: PageProps<"/telegram/link">) {
  const profile = await requireProfile();
  const { token } = await searchParams;
  const link = typeof token === "string" ? await findLinkToken(token) : null;
  const regions = await getManagedRegions();
  const isAdmin = profile.role === "admin";
  // Choices for a group: the main group (overall admins), then each region
  // they run. With several regions, a group is linked for one of them.
  const groupChoices = [
    ...(isAdmin ? [{ value: "", label: regions.length > 1 ? "Main church group" : "Link this group" }] : []),
    ...(regions.length > 1 || !isAdmin
      ? regions.map((region) => ({ value: region.id, label: `For ${region.name}` }))
      : []),
  ];

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <h1 className="text-display text-ink">Connect Telegram</h1>

      {!link || typeof token !== "string" ? (
        <Card className="flex flex-col gap-2">
          <h2 className="text-title text-ink">This link no longer works</h2>
          <p className="text-body-sm text-muted">
            Links from the bot work once and expire after 15 minutes. Send the
            command to the bot again to get a new one.
          </p>
        </Card>
      ) : link.kind === "group" && groupChoices.length === 0 ? (
        <Card className="flex flex-col gap-2">
          <h2 className="text-title text-ink">An admin needs to do this</h2>
          <p className="text-body-sm text-muted">
            Only an admin, or a region admin, can link a team group. Ask one
            to open the link the bot posted.
          </p>
        </Card>
      ) : (
        <Card className="flex flex-col gap-4">
          {link.kind === "person" ? (
            <p className="text-body text-ink-soft">
              Connect the Telegram account{" "}
              <strong className="text-ink">{link.displayName}</strong> to your
              RCW Media account{" "}
              <strong className="break-all text-ink">{profile.email}</strong>?
              The bot will then be able to tag you in the team group.
            </p>
          ) : (
            <p className="text-body text-ink-soft">
              Make <strong className="text-ink">{link.displayName}</strong> the
              Telegram group where the bot posts services, upload reminders
              and handoffs
              {groupChoices.length > 1 ? "? Choose whose:" : "?"}
            </p>
          )}
          {/* Buttons, not an automatic action: chat apps open links to
              build previews, and that must not use the link up. */}
          {link.kind === "person" ? (
            <ActionButton
              action={confirmTelegramLink}
              fields={{ token }}
              label="Connect"
              pendingLabel="Connecting…"
              variant="primary"
              size="md"
            />
          ) : (
            <div className="flex flex-col gap-2">
              {groupChoices.map((choice, index) => (
                <ActionButton
                  key={choice.value || "main"}
                  action={confirmTelegramLink}
                  fields={{ token, region: choice.value }}
                  label={choice.label}
                  pendingLabel="Linking…"
                  variant={index === 0 ? "primary" : "secondary"}
                  size="md"
                />
              ))}
            </div>
          )}
          <p className="text-body-sm text-muted">
            Not you, or not what you expected?{" "}
            <Link href="/dashboard" className="underline">
              Go back
            </Link>{" "}
            and nothing changes.
          </p>
        </Card>
      )}
    </div>
  );
}
