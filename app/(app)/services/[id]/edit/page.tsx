import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { requireManager } from "@/lib/regions";
import { churchClockTime, churchIsoDate } from "@/lib/domain/time";
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
        />
        <p className="text-body-sm text-muted">
          Changing the date moves each team&apos;s delivery deadline with it.
        </p>
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
