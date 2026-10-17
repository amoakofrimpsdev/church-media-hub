import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { serviceFolderName } from "@/lib/domain/time";
import {
  driveHomeForRegion,
  getDriveSession,
  GoogleNotConnectedError,
  markGoogleConnectionExpired,
  type DriveAccount,
  type DriveSession,
} from "@/lib/google/connection";
import { createFolder } from "@/lib/google/drive";
import { GoogleConnectionExpiredError } from "@/lib/google/oauth";
import type { Database } from "@/lib/supabase/database.types";

export type FolderProblem = "not_connected" | "expired" | "drive_error";

export type FolderResult =
  | { ok: true }
  | { ok: false; problem: FolderProblem; message: string };

const MESSAGES: Record<FolderProblem, string> = {
  not_connected:
    "The Google account for this region is not connected yet, so no Drive folders were created.",
  expired:
    "The Google account for this region needs to be reconnected before Drive folders can be created.",
  drive_error: "Google Drive did not respond as expected. Try again in a minute.",
};

/**
 * Makes sure a service has its Drive folder and one subfolder per active
 * category. Safe to run again after a failure: each folder ID is saved as soon
 * as it exists, so a retry only creates what is still missing.
 *
 * The caller passes the Supabase client: the signed-in admin's for the UI, or
 * the secret-key client for scheduled jobs.
 */
export async function ensureServiceFolders(
  supabase: SupabaseClient<Database>,
  serviceId: string,
): Promise<FolderResult> {
  const [service, categories, existing] = await Promise.all([
    supabase.from("services").select("*").eq("id", serviceId).single(),
    supabase
      .from("categories")
      .select("id, name")
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("service_folders")
      .select("category_id")
      .eq("service_id", serviceId),
  ]);
  const loadError = service.error ?? categories.error ?? existing.error;
  if (loadError || !service.data) {
    return {
      ok: false,
      problem: "drive_error",
      message: "Could not load the service.",
    };
  }

  // Which Google account the files go in. Fixed once the service has its
  // folder; before that, wherever its region keeps files now.
  let account: DriveAccount = service.data.drive_region_id;
  try {
    let serviceFolderId = service.data.drive_folder_id;
    let session: DriveSession;
    if (serviceFolderId) {
      session = await getDriveSession(account);
    } else {
      const home = await driveHomeForRegion(service.data.region_id);
      account = home.account;
      session = home.session;
      serviceFolderId = await createFolder(
        session.accessToken,
        serviceFolderName(service.data.name, service.data.starts_at),
        session.rootFolderId,
      );
      const saved = await supabase
        .from("services")
        .update({ drive_folder_id: serviceFolderId, drive_region_id: account })
        .eq("id", serviceId);
      if (saved.error) throw new Error(saved.error.message);
    }
    const { accessToken } = session;

    const done = new Set((existing.data ?? []).map((row) => row.category_id));
    const missing = (categories.data ?? []).filter(
      (category) => !done.has(category.id),
    );
    // Created side by side: one folder failing does not undo the others, and
    // each ID is saved as soon as it exists so a retry only makes the rest.
    const results = await Promise.allSettled(
      missing.map(async (category) => {
        const folderId = await createFolder(
          accessToken,
          category.name,
          serviceFolderId,
        );
        const saved = await supabase.from("service_folders").insert({
          service_id: serviceId,
          category_id: category.id,
          drive_folder_id: folderId,
        });
        if (saved.error) throw new Error(saved.error.message);
      }),
    );
    const failure = results.find((result) => result.status === "rejected");
    if (failure) throw failure.reason;

    await supabase
      .from("services")
      .update({ drive_folder_status: "ready", drive_error: null })
      .eq("id", serviceId);
    return { ok: true };
  } catch (error) {
    let problem: FolderProblem = "drive_error";
    if (error instanceof GoogleNotConnectedError) {
      problem = "not_connected";
    } else if (error instanceof GoogleConnectionExpiredError) {
      problem = "expired";
      await markGoogleConnectionExpired("Google rejected the saved sign-in.", account);
    } else {
      console.error("Creating Drive folders failed", error);
    }

    await supabase
      .from("services")
      .update({ drive_folder_status: "failed", drive_error: MESSAGES[problem] })
      .eq("id", serviceId);
    return { ok: false, problem, message: MESSAGES[problem] };
  }
}
