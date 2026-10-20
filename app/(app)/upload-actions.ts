"use server";

import { after } from "next/server";
import type { UploadService } from "@/components/upload/upload-provider";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/domain/permissions";
import { announceUploads } from "@/lib/notifications/telegram";
import { loadUploadService } from "@/lib/upload-targets";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/uploads/api";

/**
 * Looks up one service for the upload sheet. Used when someone taps Upload on
 * a service that is not in the sheet's usual short list, for example one from
 * months ago or one created a moment ago.
 */
export async function fetchUploadService(serviceId: string): Promise<UploadService | null> {
  const profile = await getProfile();
  if (!profile || !isUuid(serviceId)) return null;
  return loadUploadService(profile, serviceId);
}

/**
 * Tells the team's Telegram group who uploaded what, once a batch of uploads
 * has finished. Posting happens after the reply, so the sheet never waits.
 */
export async function uploadsFinished(serviceIds: string[]): Promise<void> {
  const profile = await getProfile();
  if (!profile || !can(profile.role, "upload_media")) return;
  const wanted = [...new Set(serviceIds.filter(isUuid))].slice(0, 5);
  if (wanted.length === 0) return;
  // Only services this person can see (the bot posts with its own account).
  const { data: visible } = await (await createClient())
    .from("services")
    .select("id")
    .in("id", wanted);
  const ids = (visible ?? []).map((service) => service.id);
  if (ids.length > 0) after(() => announceUploads(ids));
}
