import { notFound } from "next/navigation";
import { CategoriesView } from "@/components/admin/categories-view";
import { PeopleView } from "@/components/admin/people-view";
import { RegionsView } from "@/components/admin/regions-view";
import { ScheduleView } from "@/components/admin/schedule-view";
import { SeriesForm } from "@/app/(app)/admin/schedule/series-form";
import { SharesView } from "@/components/admin/shares-view";
import { TeamsView } from "@/components/admin/teams-view";
import { LoginView } from "@/components/auth/login-view";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { AlbumView } from "@/components/gallery/album-view";
import { GalleryView } from "@/components/gallery/gallery-view";
import { ServiceListView } from "@/components/services/service-list-view";
import { ServiceView } from "@/components/services/service-view";
import { ShareUnavailable, ShareView } from "@/components/share/share-view";
import { AppShell } from "@/components/shell/app-shell";
import {
  previewRegions,
  previewAlbum,
  previewCategories,
  previewDashboard,
  previewGallery,
  previewPeople,
  previewSchedule,
  previewService,
  previewServiceList,
  previewShare,
  previewShares,
  previewTeams,
  previewEmptyDashboard,
  previewUpload,
  previewUser,
} from "@/lib/preview/fixtures";

/**
 * Design previews: the real screens with sample data, no sign-in and no
 * database. Local development only; on any deployed build this is a 404.
 */
export default async function PreviewPage({
  params,
}: PageProps<"/preview/[screen]">) {
  if (process.env.NODE_ENV === "production") notFound();
  const { screen } = await params;

  switch (screen) {
    case "login":
      return <LoginView />;
    case "login-error":
      return <LoginView errorKey="not_invited" />;
    case "dashboard":
      return (
        <AppShell user={previewUser} upload={previewUpload} currentPath="/dashboard">
          <DashboardView data={previewDashboard} />
        </AppShell>
      );
    case "dashboard-empty":
      return (
        <AppShell user={previewUser} upload={previewUpload} currentPath="/dashboard">
          <DashboardView data={previewEmptyDashboard} />
        </AppShell>
      );
    case "dashboard-member":
      return (
        <AppShell
          user={{ ...previewUser, name: "Grace Mensah", role: "member" }}
          upload={previewUpload}
          currentPath="/dashboard"
        >
          <DashboardView
            data={{ ...previewDashboard, firstName: "Grace", role: "member", canManage: false }}
          />
        </AppShell>
      );
    case "upload":
      return (
        <AppShell
          user={previewUser}
          upload={{ ...previewUpload, initiallyOpen: true }}
          currentPath="/dashboard"
        >
          <DashboardView data={previewDashboard} />
        </AppShell>
      );
    case "dashboard-viewer":
      return (
        <AppShell
          user={{ ...previewUser, name: "Tola Adeyemi", role: "viewer" }}
          upload={null}
          currentPath="/dashboard"
        >
          <DashboardView
            data={{
              ...previewDashboard,
              firstName: "Tola",
              role: "viewer",
              canManage: false,
              canUpload: false,
              myTasks: [],
            }}
          />
        </AppShell>
      );
    case "service":
      return (
        <AppShell user={previewUser} upload={previewUpload} currentPath="/services">
          <ServiceView data={previewService} />
        </AppShell>
      );
    case "services":
      return (
        <AppShell user={previewUser} upload={previewUpload} currentPath="/services">
          <ServiceListView {...previewServiceList} canManage />
        </AppShell>
      );
    case "album":
      return (
        <AppShell user={previewUser} upload={previewUpload} currentPath="/services">
          <AlbumView data={previewAlbum} />
        </AppShell>
      );
    case "gallery":
      return (
        <AppShell user={previewUser} upload={previewUpload} currentPath="/gallery">
          <GalleryView data={previewGallery} />
        </AppShell>
      );
    case "categories":
      return (
        <AppShell user={previewUser} upload={previewUpload} currentPath="/admin/categories">
          <CategoriesView data={previewCategories} />
        </AppShell>
      );
    case "category-open":
      return (
        <AppShell user={previewUser} upload={previewUpload} currentPath="/admin/categories">
          <CategoriesView data={{ ...previewCategories, openCategoryId: "c2" }} />
        </AppShell>
      );
    case "teams":
      return (
        <AppShell user={previewUser} upload={previewUpload} currentPath="/admin/teams">
          <TeamsView data={previewTeams} />
        </AppShell>
      );
    case "people":
      return (
        <AppShell user={previewUser} upload={previewUpload} currentPath="/admin/people">
          <PeopleView data={previewPeople} />
        </AppShell>
      );
    case "series-form":
      return (
        <main className="mx-auto max-w-lg p-6">
          <SeriesForm regions={[{ id: "g1", name: "Metro Heights" }, { id: "g2", name: "OC" }]} />
        </main>
      );
    case "schedule":
      return (
        <AppShell user={previewUser} upload={previewUpload} currentPath="/admin/schedule">
          <ScheduleView data={previewSchedule} />
        </AppShell>
      );
    case "regions":
      return (
        <AppShell user={previewUser} upload={previewUpload} currentPath="/admin/regions">
          <RegionsView data={previewRegions} />
        </AppShell>
      );
    case "shares":
      return (
        <AppShell user={previewUser} upload={previewUpload} currentPath="/admin/shares">
          <SharesView data={previewShares} />
        </AppShell>
      );
    case "share":
      return <ShareView data={previewShare} />;
    case "share-unavailable":
      return <ShareUnavailable />;
    default:
      notFound();
  }
}
