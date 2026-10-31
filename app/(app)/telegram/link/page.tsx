import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/ui/action-button";
import { Card } from "@/components/ui/card";
import { requireProfile } from "@/lib/auth";
import { getManagedRegions } from "@/lib/regions";
import { findLinkToken } from "@/lib/telegram/link-tokens";
import { confirmTelegramLink } from "./actions";
import { GroupLinkForm } from "./group-link-form";

export const metadata: Metadata = { title: "Connect Telegram" };

export default async function TelegramLinkPage({
  searchParams,
}: PageProps<"/telegram/link">) {
  const profile = await requireProfile();
  const { token } = await searchParams;
  const link = typeof token === "string" ? await findLinkToken(token) : null;
  const regions = await getManagedRegions();
  const isAdmin = profile.role === "admin";
  const canLink = isAdmin || regions.length > 0;
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
      ) : link.kind === "group" && !canLink ? (
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
              and handoffs? Say which region, and what the group is for.
            </p>
          )}
          {/* A button, not an automatic action: chat apps open links to
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
            <GroupLinkForm
              token={token}
              regions={regions.map(({ id, name }) => ({ id, name }))}
              canLinkMain={isAdmin}
            />
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
