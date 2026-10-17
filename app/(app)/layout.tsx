import { AppShell } from "@/components/shell/app-shell";
import { requireProfile } from "@/lib/auth";
import { isManager } from "@/lib/regions";
import { loadUploadTargets } from "@/lib/upload-targets";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const profile = await requireProfile();

  return (
    <AppShell
      user={{
        name: profile.full_name,
        email: profile.email,
        role: profile.role,
        manages: await isManager(),
      }}
      upload={await loadUploadTargets(profile)}
    >
      {children}
    </AppShell>
  );
}
