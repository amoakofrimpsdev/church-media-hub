import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { getAllRegions, getManagedRegions, requireManager } from "@/lib/regions";
import { MergeServiceForm } from "./merge-service-form";
import { churchClockTime, churchIsoDate, formatChurchDateTime } from "@/lib/domain/time";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/uploads/api";
import { DeleteServiceForm } from "./delete-service-form";
import { EditServiceForm } from "./edit-service-form";

export const metadata: Metadata = { title: "Edit service" };

export default async function EditServicePage({
  params,
}: PageProps<"/services/[id]/edit">) {
  await requireManager();
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const supabase = await createClient();
  const [service, uploads] = await Promise.all([
    supabase.from("services").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("uploads")
      .select("id", { count: "exact", head: true })
      .eq("service_id", id),
  ]);
  if (!service.data) notFound();
  // Only someone who runs this service's region can edit it.
  await requireManager(service.data.region_id);
  const uploadCount = uploads.count ?? 0;
  const regionId = service.data.region_id;
  const allRegions = await getAllRegions();
  const regionName = new Map(allRegions.map((region) => [region.id, region.name]));
  const otherRegions = allRegions
    .filter((region) => region.is_active && region.id !== regionId)
    .map(({ id, name }) => ({ id, name }));

  // Likely duplicates: services in the week either side, in regions this
  // person runs.
  const managedIds = new Set((await getManagedRegions()).map((region) => region.id));
  const startsAt = new Date(service.data.starts_at).getTime();
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const { data: nearby } = await supabase
    .from("services")
    .select("id, name, starts_at, region_id")
    .gte("starts_at", new Date(startsAt - WEEK_MS).toISOString())
    .lte("starts_at", new Date(startsAt + WEEK_MS).toISOString())
    .neq("id", id)
    .order("starts_at");
  const candidateServices = (nearby ?? []).filter((row) => managedIds.has(row.region_id));
  const { data: candidateUploads } =
    candidateServices.length > 0
      ? await supabase
          .from("uploads")
          .select("service_id")
          .in("service_id", candidateServices.map((row) => row.id))
      : { data: [] };
  const fileCount = new Map<string, number>();
  for (const row of candidateUploads ?? []) {
    fileCount.set(row.service_id, (fileCount.get(row.service_id) ?? 0) + 1);
  }
  const candidates = candidateServices.map((row) => {
    const files = fileCount.get(row.id) ?? 0;
    return {
      id: row.id,
      name: row.name,
      label: [
        row.name,
        formatChurchDateTime(row.starts_at),
        allRegions.length > 1 ? regionName.get(row.region_id) : null,
        `${files} ${files === 1 ? "file" : "files"}`,
      ]
        .filter(Boolean)
        .join(" · "),
    };
  });

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href={`/services/${id}`} className="text-body-sm text-muted underline">
          {service.data.name}
        </Link>
        <h1 className="text-display text-ink">Edit service</h1>
      </div>

      <Card className="flex flex-col gap-3">
        <EditServiceForm
          serviceId={id}
          name={service.data.name}
          date={churchIsoDate(service.data.starts_at)}
          time={churchClockTime(service.data.starts_at)}
          otherRegions={otherRegions}
          alsoFor={service.data.shared_region_ids}
        />
        <p className="text-body-sm text-muted">
          Changing the date moves each team&apos;s delivery deadline with it.
        </p>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-title text-ink">Merge a duplicate into this one</h2>
        <p className="text-body-sm text-muted">
          If the same service was created twice, bring the other one in here: its
          photos and videos move into this service&apos;s Drive folders, with its
          assignments and share links, and the duplicate is deleted.
        </p>
        <MergeServiceForm serviceId={id} serviceName={service.data.name} candidates={candidates} />
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-title text-ink">Delete this service</h2>
        <p className="text-body-sm text-muted">
          {uploadCount > 0
            ? `This also deletes its ${uploadCount} ${uploadCount === 1 ? "file" : "files"} and the record of who uploaded them, along with its assignments and handoffs. The Google Drive folder moves to the Drive bin, where it can be restored for 30 days. The records here cannot be restored.`
            : "Removes the service, its assignments and handoffs, and moves its empty Google Drive folder to the Drive bin."}
        </p>
        <DeleteServiceForm
          serviceId={id}
          serviceName={service.data.name}
          uploadCount={uploadCount}
        />
      </Card>
    </div>
  );
}
