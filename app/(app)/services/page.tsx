import type { Metadata } from "next";
import { ServiceListView } from "@/components/services/service-list-view";
import { requireProfile } from "@/lib/auth";
import { isManager } from "@/lib/regions";
import { loadServiceList } from "@/lib/service-page";

export const metadata: Metadata = { title: "Services" };

export default async function ServicesPage() {
  await requireProfile();
  const { upcoming, past } = await loadServiceList();
  return (
    <ServiceListView
      upcoming={upcoming}
      past={past}
      canManage={await isManager()}
    />
  );
}
