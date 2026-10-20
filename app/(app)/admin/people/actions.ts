"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { requireManager } from "@/lib/regions";
import { BATCH_INVITE_MAX, isRole, normalizeEmail, parseEmailList } from "@/lib/domain/roles";
import { revokeDriveGrants } from "@/lib/google/grants";
import type { FormState } from "@/lib/form-state";
import { createClient } from "@/lib/supabase/server";

const UNIQUE_VIOLATION = "23505";
const GENERIC_ERROR = "Could not save. Check your connection and try again.";

/**
 * Invites one person or a whole list at once. Everyone in the list gets the
 * same role, team and regions. Anyone who already has access, or already has
 * an invite waiting, is skipped and named in the reply.
 */
/**
 * The regions ticked on an invite form: those they join (or the only one
 * there is) and, for super admins inviting members, those they run.
 */
function readRegionChoices(
  formData: FormData,
  regions: { id: string }[],
  isAdmin: boolean,
  role: "admin" | "member" | "viewer",
) {
  const ticked = regions.filter((region) => formData.get(`region:${region.id}`) === "on");
  const joining = ticked.length > 0 ? ticked : regions.length === 1 ? regions : [];
  const running =
    isAdmin && role === "member"
      ? joining.filter((region) => formData.get(`region_admin:${region.id}`) === "on")
      : [];
  return { joining, running };
}

export async function invitePeople(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const { profile: admin, regions } = await requireManager();
  const isAdmin = admin.role === "admin";

  const { emails, invalid } = parseEmailList(formData.get("emails"));
  if (emails.length === 0) {
    return { error: invalid.length > 0 ? `“${invalid[0]}” is not an email address.` : "Enter at least one email address." };
  }
  if (emails.length > BATCH_INVITE_MAX) {
    return { error: `That is ${emails.length} addresses. Invite up to ${BATCH_INVITE_MAX} at a time.` };
  }

  const role = formData.get("role");
  if (!isRole(role)) return { error: "Choose a role." };
  if (role === "admin" && !isAdmin) return { error: "Only a super admin can invite another admin." };

  const { joining, running } = readRegionChoices(formData, regions, isAdmin, role);
  if (joining.length === 0 && role !== "admin") return { error: "Tick at least one region they join." };

  const teamValue = formData.get("team_id");
  const teamId = typeof teamValue === "string" && teamValue ? teamValue : null;
  if (role === "viewer" && !teamId) {
    return { error: "Choose the team viewers belong to. Without one they cannot see anything." };
  }

  const supabase = await createClient();
  const [people, pending] = await Promise.all([
    supabase.from("profiles").select("email").in("email", emails),
    supabase.from("invites").select("email").in("email", emails),
  ]);
  const hasAccess = new Set((people.data ?? []).map((row) => row.email));
  const invitedAlready = new Set((pending.data ?? []).map((row) => row.email));
  const toInvite = emails.filter((email) => !hasAccess.has(email) && !invitedAlready.has(email));

  if (toInvite.length > 0) {
    const { error } = await supabase.from("invites").insert(
      toInvite.map((email) => ({
        email,
        role,
        team_id: teamId,
        invited_by: admin.id,
        region_ids: joining.map((region) => region.id),
        region_admin_ids: running.map((region) => region.id),
      })),
    );
    if (error) {
      if (error.code === UNIQUE_VIOLATION) {
        return { error: "Someone in the list was invited a moment ago. Try again." };
      }
      return { error: GENERIC_ERROR };
    }
  }

  const skipped = [
    ...[...hasAccess].map((email) => `${email} already has access`),
    ...[...invitedAlready].map((email) => `${email} was already invited`),
    ...invalid.map((piece) => `“${piece}” is not an email address`),
  ];
  revalidatePath("/admin/people");
  if (toInvite.length === 0) return { error: `Nobody new to invite. ${skipped.join("; ")}.` };
  const invited =
    toInvite.length === 1
      ? `Invited. ${toInvite[0]} can now sign in with Google.`
      : `Invited ${toInvite.length} people. They can now sign in with Google.`;
  return { success: skipped.length > 0 ? `${invited} Skipped: ${skipped.join("; ")}.` : invited };
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

/** Changes an invite that has not been used yet: role, team and regions. */
export async function updateInvite(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const { profile: admin, regions } = await requireManager();
  const isAdmin = admin.role === "admin";

  const email = normalizeEmail(formData.get("email"));
  if (!email) return { error: "That invite no longer exists." };
  const role = formData.get("role");
  if (!isRole(role)) return { error: "Choose a role." };
  if (role === "admin" && !isAdmin) return { error: "Only a super admin can make someone an admin." };

  const teamValue = formData.get("team_id");
  const teamId = typeof teamValue === "string" && teamValue ? teamValue : null;
  if (role === "viewer" && !teamId) {
    return { error: "Choose the team this viewer belongs to. Without one they cannot see anything." };
  }

  const supabase = await createClient();
  const { data: invite } = await supabase
    .from("invites")
    .select("region_ids, region_admin_ids")
    .eq("email", email)
    .is("accepted_at", null)
    .maybeSingle();
  if (!invite) return { error: "That invite was used or cancelled. Refresh the page." };

  const { joining, running } = readRegionChoices(formData, regions, isAdmin, role);
  if (joining.length === 0 && role !== "admin") return { error: "Tick at least one region they join." };
  // Regions this person does not run are not on their form: leave those as
  // they were. Region admins cannot change who runs a region.
  const mine = new Set(regions.map((region) => region.id));
  const regionIds = [
    ...invite.region_ids.filter((id) => !mine.has(id)),
    ...joining.map((region) => region.id),
  ];
  const regionAdminIds = isAdmin
    ? running.map((region) => region.id).concat(invite.region_admin_ids.filter((id) => !mine.has(id)))
    : invite.region_admin_ids;

  const { data: saved, error } = await supabase
    .from("invites")
    .update({ role, team_id: teamId, region_ids: regionIds, region_admin_ids: regionAdminIds })
    .eq("email", email)
    .is("accepted_at", null)
    .select("email");
  if (error || !saved || saved.length === 0) return { error: GENERIC_ERROR };

  revalidatePath("/admin/people");
  return { success: "Invite updated." };
}
