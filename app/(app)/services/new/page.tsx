import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { requireManager } from "@/lib/regions";
import { churchIsoDate } from "@/lib/domain/time";
import { ServiceForm } from "./service-form";

export const metadata: Metadata = { title: "New service" };

/** The coming Sunday in the church's time zone (today, if today is Sunday). */
function nextSunday(): string {
  const today = churchIsoDate(new Date());
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + ((7 - date.getUTCDay()) % 7));
  return date.toISOString().slice(0, 10);
}

export default async function NewServicePage({
  searchParams,
}: PageProps<"/services/new">) {
  const { regions } = await requireManager();
  const { region } = await searchParams;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href="/services" className="text-body-sm text-muted underline">
          Services
        </Link>
        <h1 className="text-display text-ink">New service</h1>
        <p className="text-body text-ink-soft">
          Creating a service also creates its Google Drive folder, with one
          subfolder per category.
        </p>
      </div>
      <Card>
        <ServiceForm
          defaultDate={nextSunday()}
          regions={regions.map(({ id, name }) => ({ id, name }))}
          defaultRegion={typeof region === "string" ? region : undefined}
        />
      </Card>
    </div>
  );
}
