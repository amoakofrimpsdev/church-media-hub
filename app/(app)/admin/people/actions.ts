"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { pickRegion, requireManager } from "@/lib/regions";
import { isRole, normalizeEmail } from "@/lib/domain/roles";
import { revokeDriveGrants } from "@/lib/google/grants";
import type { FormState } from "@/lib/form-state";
import { createClient } from "@/lib/supabase/server";

const UNIQUE_VIOLATION = "23505";
const GENERIC_ERROR = "Could not save. Check your connection and try again.";

export async function invitePerson(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const { profile: admin, regions } = await requireManager();
  const isAdmin = admin.role === "admin";

  const email = normalizeEmail(formData.get("email"));
  if (!email) return { error: "Enter a valid email address." };

  const role = formData.get("role");
  if (!isRole(role)) return { error: "Choose a role." };
  if (role === "admin" && !isAdmin) return { error: "Only an overall admin can invite another admin." };

  const regionValue = formData.get("region");
  const region = pickRegion(regions, typeof regionValue === "string" ? regionValue : null);
  if (!region) return { error: "Choose which region they join." };
  // Only overall admins hand out region admin.
  const regionAdmin = isAdmin && role === "member" && formData.get("region_admin") === "on";

  const teamValue = formData.get("team_id");
  const teamId = typeof teamValue === "string" && teamValue ? teamValue : null;

  if (role === "viewer" && !teamId) {
    return { error: "Choose the team this viewer belongs to. Without one they cannot see anything." };
  }

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (existing) return { error: `${email} already has access.` };

  const { error } = await supabase
    .from("invites")
    .insert({
      email,
      role,
      team_id: teamId,
      invited_by: admin.id,
      region_id: region.id,
      region_admin: regionAdmin,
    });

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { error: `${email} has already been invited.` };
    }
    return { error: GENERIC_ERROR };
  }

  revalidatePath("/admin/people");
  return { success: `Invited. ${email} can now sign in with Google.` };
}

export async function revokeInvite(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireManager();

  const email = normalizeEmail(formData.get("email"));
  if (!email) return { error: "That invite no longer exists." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("invites")
    .delete()
    .eq("email", email)
    .is("accepted_at", null);
  if (error) return { error: GENERIC_ERROR };

  revalidatePath("/admin/people");
  return {};
}

export async function updatePerson(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const admin = await requireAdmin();

  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { error: "Person not found." };
  if (id === admin.id) {
    return { error: "Ask another admin to change your own access." };
  }

  const intent = formData.get("intent");
  const supabase = await createClient();

  let update: { role: "admin" | "member" | "viewer" } | { active: boolean };
  if (intent === "set_role") {
    const role = formData.get("role");
    if (!isRole(role)) return { error: "Choose a role." };
    update = { role };
  } else if (intent === "deactivate" || intent === "reactivate") {
    update = { active: intent === "reactivate" };
  } else {
    return { error: "Unknown action." };
  }

  const { error } = await supabase.from("profiles").update(update).eq("id", id);
  if (error) {
    if (error.message.includes("last_admin")) {
      return { error: "There must be at least one active admin." };
    }
    return { error: GENERIC_ERROR };
  }

  // Their Drive folder access was based on the old role. Remove it; whatever
  // they are still allowed is granted again when they next open a file.
  await revokeDriveGrants(id);

  revalidatePath("/admin/people");
  if ("role" in update) return { success: "Role saved." };
  return { success: update.active ? "Access turned on." : "Access turned off." };
}

/**
 * Which regions someone is in, and (overall admins only) which they run.
 * Only the regions the person making the change runs are touched.
 */
export async function setPersonRegions(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const { profile: admin, regions } = await requireManager();
  const isAdmin = admin.role === "admin";

  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { error: "Person not found." };

  const supabase = await createClient();
  const { data: person } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", id)
    .maybeSingle();
  if (!person) return { error: "Person not found." };

  for (const region of regions) {
    const member = formData.get(`region:${region.id}`) === "on";
    if (!member) {
      const { error } = await supabase
        .from("region_members")
        .delete()
        .eq("region_id", region.id)
        .eq("profile_id", id);
      if (error) return { error: GENERIC_ERROR };
      continue;
    }
    const runs = formData.get(`region_admin:${region.id}`) === "on" && person.role === "member";
    const { error } = isAdmin
      ? await supabase
          .from("region_members")
          .upsert({ region_id: region.id, profile_id: id, is_region_admin: runs })
      : // Region admins add people but leave who runs the region alone.
        await supabase
          .from("region_members")
          .upsert(
            { region_id: region.id, profile_id: id },
            { onConflict: "region_id,profile_id", ignoreDuplicates: true },
          );
    if (error) return { error: GENERIC_ERROR };
  }

  // Drive access followed their old regions; whatever they may still open is
  // granted again the next time they open it.
  await revokeDriveGrants(id);

  revalidatePath("/admin/people");
  return { success: "Regions saved." };
}
