"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { disconnectRegionGoogle } from "@/lib/google/connection";
import type { FormState } from "@/lib/form-state";
import { requireManager } from "@/lib/regions";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/uploads/api";

const UNIQUE_VIOLATION = "23505";
const GENERIC_ERROR = "Could not save. Check your connection and try again.";

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function refresh(): void {
  // Region names appear across the app: the shell, upload sheet, schedule.
  revalidatePath("/", "layout");
}

export async function createRegion(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();
  const name = text(formData, "name");
  if (!name) return { error: "Give the region a name." };
  if (name.length > 60) return { error: "Keep the name under 60 characters." };

  const supabase = await createClient();
  const { error } = await supabase.from("regions").insert({ name });
  if (error) {
    if (error.code === UNIQUE_VIOLATION) return { error: `There is already a region called ${name}.` };
    return { error: GENERIC_ERROR };
  }
  refresh();
  return { success: `${name} added. Open it to invite people or connect its own Drive.` };
}

export async function updateRegion(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();
  const id = text(formData, "region_id");
  if (!isUuid(id)) return { error: "Region not found." };
  const intent = text(formData, "intent");

  const supabase = await createClient();
  if (intent === "rename") {
    const name = text(formData, "name");
    if (!name) return { error: "Give the region a name." };
    if (name.length > 60) return { error: "Keep the name under 60 characters." };
    const { error } = await supabase.from("regions").update({ name }).eq("id", id);
    if (error) {
      if (error.code === UNIQUE_VIOLATION) return { error: `There is already a region called ${name}.` };
      return { error: GENERIC_ERROR };
    }
    refresh();
    return { success: "Renamed." };
  }
  if (intent === "retire" || intent === "restore") {
    const { error } = await supabase
      .from("regions")
      .update({ is_active: intent === "restore" })
      .eq("id", id);
    if (error) return { error: GENERIC_ERROR };
    refresh();
    return {
      success:
        intent === "retire"
          ? "Retired. Its services and photos stay; it no longer appears in choices."
          : "Back in use.",
    };
  }
  return { error: "Unknown action." };
}

/** New services in the region go back to the church Drive. */
export async function switchToChurchDrive(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = text(formData, "region_id");
  if (!isUuid(id)) return { error: "Region not found." };
  await requireManager(id);

  const outcome = await disconnectRegionGoogle(id);
  refresh();
  return {
    success:
      outcome === "in_use"
        ? "New services will use the church Drive. Older services keep their files in the region's own account, which stays connected for them."
        : "Disconnected. New services will use the church Drive.",
  };
}

/**
 * Changes one of a region's Telegram groups: what it is for, whether it gets
 * handoff alerts, or unlinks it. With no groups left, the region's messages
 * go to the church's main group.
 */
export async function updateTelegramGroup(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = text(formData, "group_id");
  if (!isUuid(id)) return { error: "Group not found." };
  // Groups are server-only, so this uses the secret key after checking.
  const server = createAdminClient();
  const { data: group } = await server
    .from("region_telegram_groups")
    .select("region_id")
    .eq("id", id)
    .maybeSingle();
  if (!group) return { error: "That group was already unlinked." };
  await requireManager(group.region_id);

  const intent = text(formData, "intent");
  const media = text(formData, "media");
  const { error } =
    intent === "unlink"
      ? await server.from("region_telegram_groups").delete().eq("id", id)
      : intent === "media" && (media === "all" || media === "photos" || media === "videos")
        ? await server.from("region_telegram_groups").update({ media }).eq("id", id)
        : intent === "handoffs_on" || intent === "handoffs_off"
          ? await server
              .from("region_telegram_groups")
              .update({ handoff_alerts: intent === "handoffs_on" })
              .eq("id", id)
          : { error: { message: "unknown" } };
  if (error) return { error: GENERIC_ERROR };
  refresh();
  return { success: intent === "unlink" ? "Unlinked." : "Saved." };
}
