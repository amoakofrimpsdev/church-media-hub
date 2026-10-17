import "server-only";

import { tokenEncryptionKey } from "@/lib/env";
import type { GoogleConnectionStatus } from "@/lib/supabase/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, encryptSecret } from "./crypto";
import { createFolder, folderExists } from "./drive";
import {
  GoogleConnectionExpiredError,
  refreshAccessToken,
  type AccessToken,
  type ConnectedAccount,
} from "./oauth";

const ROOT_FOLDER_NAME = "RCW Media";

/**
 * Which Google account holds a service's files: null for the church account,
 * or the ID of a region that connected its own. Stored on each service as
 * drive_region_id when its folders are made.
 */
export type DriveAccount = string | null;

/** The account is not connected yet. An admin has to connect it. */
export class GoogleNotConnectedError extends Error {
  constructor() {
    super("The Google account has not been connected yet.");
    this.name = "GoogleNotConnectedError";
  }
}

/** What is safe to show an admin. Never includes the token. */
export type GoogleConnectionSummary = {
  accountEmail: string;
  status: GoogleConnectionStatus;
  rootFolderId: string;
  connectedAt: string;
};

export async function getGoogleConnectionSummary(): Promise<GoogleConnectionSummary | null> {
  const { data, error } = await createAdminClient()
    .from("google_connection")
    .select("account_email, status, root_folder_id, connected_at")
    .maybeSingle();
  if (error) throw new Error(`Could not read Google connection: ${error.message}`);
  if (!data) return null;
  return {
    accountEmail: data.account_email,
    status: data.status,
    rootFolderId: data.root_folder_id,
    connectedAt: data.connected_at,
  };
}

/**
 * The connection a region's new services would use: its own account if it
 * connected one, otherwise the church's.
 */
export async function getConnectionForRegion(
  regionId: string,
): Promise<GoogleConnectionSummary | null> {
  return (await getRegionGoogleSummaries()).get(regionId) ?? (await getGoogleConnectionSummary());
}

/** Each region's own Google account, for those that connected one. */
export async function getRegionGoogleSummaries(): Promise<
  Map<string, GoogleConnectionSummary>
> {
  const { data, error } = await createAdminClient()
    .from("region_google_connections")
    .select("region_id, account_email, status, root_folder_id, connected_at");
  if (error) throw new Error(`Could not read Google connections: ${error.message}`);
  return new Map(
    (data ?? []).map((row) => [
      row.region_id,
      {
        accountEmail: row.account_email,
        status: row.status,
        rootFolderId: row.root_folder_id,
        connectedAt: row.connected_at,
      },
    ]),
  );
}

/**
 * Saves a newly connected account: the church's, or a region's own when
 * `regionId` is given. Reconnecting the same account keeps the existing
 * "RCW Media" folder; a different account gets a new one.
 */
export async function saveGoogleConnection(
  account: ConnectedAccount,
  connectedBy: string,
  regionId: string | null = null,
): Promise<void> {
  const admin = createAdminClient();
  const { data: existing } = regionId
    ? await admin
        .from("region_google_connections")
        .select("account_email, root_folder_id")
        .eq("region_id", regionId)
        .maybeSingle()
    : await admin.from("google_connection").select("account_email, root_folder_id").maybeSingle();

  let rootFolderId: string | null = null;
  if (
    existing &&
    existing.account_email.toLowerCase() === account.email.toLowerCase() &&
    (await folderExists(account.accessToken, existing.root_folder_id))
  ) {
    rootFolderId = existing.root_folder_id;
  }
  rootFolderId ??= await createFolder(account.accessToken, ROOT_FOLDER_NAME);

  const row = {
    account_email: account.email,
    refresh_token_encrypted: encryptSecret(account.refreshToken, tokenEncryptionKey()),
    root_folder_id: rootFolderId,
    status: "connected" as const,
    last_error: null,
    connected_by: connectedBy,
    connected_at: new Date().toISOString(),
  };
  const { error } = regionId
    ? await admin.from("region_google_connections").upsert({ region_id: regionId, ...row })
    : await admin.from("google_connection").upsert({ id: true, ...row });
  if (error) throw new Error(`Could not save Google connection: ${error.message}`);
  cachedTokens.delete(cacheKey(regionId));
}

/**
 * A region goes back to using the church Drive for new services. Services it
 * already has stay in its own account, so the connection row is kept only if
 * something still needs it; otherwise it is removed.
 */
export async function disconnectRegionGoogle(regionId: string): Promise<"removed" | "in_use"> {
  const admin = createAdminClient();
  const { count } = await admin
    .from("services")
    .select("id", { count: "exact", head: true })
    .eq("drive_region_id", regionId);
  if ((count ?? 0) > 0) return "in_use";
  await admin.from("region_google_connections").delete().eq("region_id", regionId);
  cachedTokens.delete(cacheKey(regionId));
  return "removed";
}

// Access tokens last about an hour. Reusing one within a server instance
// avoids a round trip to Google on every Drive call. One per account.
const cachedTokens = new Map<string, AccessToken>();
const EXPIRY_MARGIN_MS = 60_000;
const cacheKey = (account: DriveAccount) => account ?? "church";

export type DriveSession = { accessToken: string; rootFolderId: string };

async function readConnection(account: DriveAccount) {
  const admin = createAdminClient();
  const { data, error } = account
    ? await admin
        .from("region_google_connections")
        .select("refresh_token_encrypted, root_folder_id, status")
        .eq("region_id", account)
        .maybeSingle()
    : await admin
        .from("google_connection")
        .select("refresh_token_encrypted, root_folder_id, status")
        .maybeSingle();
  if (error) throw new Error(`Could not read Google connection: ${error.message}`);
  return data;
}

/**
 * An access token for an account plus the root folder to work in. The church
 * account unless a region's own is asked for. Throws GoogleNotConnectedError
 * or GoogleConnectionExpiredError, which the UI turns into a "connect" or
 * "reconnect" prompt.
 */
export async function getDriveSession(account: DriveAccount): Promise<DriveSession> {
  const connection = await readConnection(account);
  if (!connection) throw new GoogleNotConnectedError();

  const key = cacheKey(account);
  const cached = cachedTokens.get(key);
  if (cached && cached.expiresAt - EXPIRY_MARGIN_MS > Date.now()) {
    return { accessToken: cached.token, rootFolderId: connection.root_folder_id };
  }

  try {
    const fresh = await refreshAccessToken(
      decryptSecret(connection.refresh_token_encrypted, tokenEncryptionKey()),
    );
    cachedTokens.set(key, fresh);
    return { accessToken: fresh.token, rootFolderId: connection.root_folder_id };
  } catch (refreshError) {
    if (refreshError instanceof GoogleConnectionExpiredError) {
      await markGoogleConnectionExpired("Google rejected the saved sign-in.", account);
    }
    throw refreshError;
  }
}

/** Records that a connection stopped working so the admins see it. */
export async function markGoogleConnectionExpired(
  reason: string,
  account: DriveAccount,
): Promise<void> {
  cachedTokens.delete(cacheKey(account));
  const admin = createAdminClient();
  if (account) {
    await admin
      .from("region_google_connections")
      .update({ status: "expired", last_error: reason })
      .eq("region_id", account);
  } else {
    await admin
      .from("google_connection")
      .update({ status: "expired", last_error: reason })
      .eq("id", true);
  }
}

/** The account a service's files are in. */
export async function driveAccountForService(serviceId: string): Promise<DriveAccount> {
  const { data } = await createAdminClient()
    .from("services")
    .select("drive_region_id")
    .eq("id", serviceId)
    .maybeSingle();
  return data?.drive_region_id ?? null;
}

/**
 * Where a new service in a region should keep its files: the region's own
 * account if it connected one, otherwise its folder in the church Drive
 * (made the first time it is needed).
 */
export async function driveHomeForRegion(
  regionId: string,
): Promise<{ account: DriveAccount; session: DriveSession }> {
  const admin = createAdminClient();
  const { data: own } = await admin
    .from("region_google_connections")
    .select("region_id")
    .eq("region_id", regionId)
    .maybeSingle();
  if (own) return { account: regionId, session: await getDriveSession(regionId) };

  const church = await getDriveSession(null);
  const { data: region, error } = await admin
    .from("regions")
    .select("name, church_folder_id")
    .eq("id", regionId)
    .single();
  if (error) throw new Error(`Could not read region: ${error.message}`);

  let folderId = region.church_folder_id;
  if (folderId && !(await folderExists(church.accessToken, folderId))) folderId = null;
  if (!folderId) {
    folderId = await createFolder(church.accessToken, region.name, church.rootFolderId);
    await admin.from("regions").update({ church_folder_id: folderId }).eq("id", regionId);
  }
  return { account: null, session: { ...church, rootFolderId: folderId } };
}
