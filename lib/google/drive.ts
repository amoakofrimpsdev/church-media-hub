import "server-only";

import { googleApiOrigin } from "@/lib/env";
import { GoogleConnectionExpiredError } from "./oauth";

const filesUrl = () => `${googleApiOrigin()}/drive/v3/files`;
const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

export class DriveError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "DriveError";
  }
}

async function driveFetch(
  accessToken: string,
  url: string,
  init: RequestInit,
): Promise<Response> {
  const response = await fetch(url, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (response.status === 401) throw new GoogleConnectionExpiredError();
  if (!response.ok) {
    const detail = await response.text();
    throw new DriveError(
      `Google Drive returned ${response.status}: ${detail.slice(0, 300)}`,
      response.status,
    );
  }
  return response;
}

/** Creates a folder and returns its Drive file ID. */
export async function createFolder(
  accessToken: string,
  name: string,
  parentId?: string,
): Promise<string> {
  const response = await driveFetch(accessToken, `${filesUrl()}?fields=id`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: FOLDER_MIME_TYPE,
      ...(parentId ? { parents: [parentId] } : {}),
    }),
  });
  const { id } = (await response.json()) as { id: string };
  return id;
}

/** True if the folder still exists, is not in the bin, and we can see it. */
export async function folderExists(
  accessToken: string,
  folderId: string,
): Promise<boolean> {
  try {
    const response = await driveFetch(
      accessToken,
      `${filesUrl()}/${encodeURIComponent(folderId)}?fields=id,trashed`,
      { method: "GET" },
    );
    const { trashed } = (await response.json()) as { trashed?: boolean };
    return !trashed;
  } catch (error) {
    if (error instanceof DriveError && error.status === 404) return false;
    throw error;
  }
}

const uploadUrl = () => `${googleApiOrigin()}/upload/drive/v3/files`;

/**
 * Starts a resumable upload and returns the session link the browser sends the
 * file bytes to. The link itself is the permission: it works without our
 * access token, but only for this one file in this one folder.
 *
 * `origin` must be the browser's origin. Google only answers the browser's
 * cross-origin requests to the session if it was named when the session began.
 */
export async function startResumableUpload(
  accessToken: string,
  file: { name: string; mimeType: string; size: number; parentId: string },
  origin: string,
): Promise<string> {
  const response = await driveFetch(
    accessToken,
    `${uploadUrl()}?uploadType=resumable&fields=id`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": file.mimeType,
        "X-Upload-Content-Length": String(file.size),
        Origin: origin,
      },
      body: JSON.stringify({ name: file.name, parents: [file.parentId] }),
    },
  );
  const sessionUrl = response.headers.get("location");
  if (!sessionUrl) {
    throw new DriveError("Google did not return an upload session", 502);
  }
  return sessionUrl;
}

export type UploadProgress =
  | { state: "in_progress"; received: number }
  | { state: "complete"; fileId: string }
  | { state: "gone" };

/**
 * Asks Google how much of an upload it has. Browsers cannot read the answer
 * themselves (Google does not expose the Range header to them), so the browser
 * asks our server to ask.
 */
export async function getUploadProgress(
  sessionUrl: string,
  totalBytes: number,
): Promise<UploadProgress> {
  const response = await fetch(sessionUrl, {
    method: "PUT",
    headers: { "Content-Range": `bytes */${totalBytes}` },
    cache: "no-store",
  });

  if (response.status === 308) {
    const range = response.headers.get("range");
    const match = range ? /^bytes=0-(\d+)$/.exec(range) : null;
    return { state: "in_progress", received: match ? Number(match[1]) + 1 : 0 };
  }
  if (response.ok) {
    const { id } = (await response.json()) as { id: string };
    return { state: "complete", fileId: id };
  }
  // Sessions expire after about a week, or once cancelled.
  if (response.status === 404 || response.status === 410) return { state: "gone" };
  throw new DriveError(
    `Google Drive returned ${response.status} for an upload session`,
    response.status,
  );
}

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  parents: string[];
  trashed: boolean;
};

/** Looks up a file, or returns null if it does not exist or we cannot see it. */
export async function getFile(
  accessToken: string,
  fileId: string,
): Promise<DriveFile | null> {
  try {
    const response = await driveFetch(
      accessToken,
      `${filesUrl()}/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,parents,trashed`,
      { method: "GET" },
    );
    const file = (await response.json()) as {
      id: string;
      name: string;
      mimeType: string;
      size?: string;
      parents?: string[];
      trashed?: boolean;
    };
    return {
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      size: Number(file.size ?? 0),
      parents: file.parents ?? [],
      trashed: Boolean(file.trashed),
    };
  } catch (error) {
    if (error instanceof DriveError && error.status === 404) return null;
    throw error;
  }
}

/**
 * A short-lived link to Google's preview image for a file, or null if Google
 * has not made one (yet). `size` is the longest edge in pixels.
 */
export async function getThumbnailLink(
  accessToken: string,
  fileId: string,
): Promise<string | null> {
  try {
    const response = await driveFetch(
      accessToken,
      `${filesUrl()}/${encodeURIComponent(fileId)}?fields=thumbnailLink`,
      { method: "GET" },
    );
    const { thumbnailLink } = (await response.json()) as {
      thumbnailLink?: string;
    };
    return thumbnailLink ?? null;
  } catch (error) {
    if (error instanceof DriveError && error.status === 404) return null;
    throw error;
  }
}

/** Google's thumbnail links end in "=s220"; swapping the number resizes. */
export function sizedThumbnailLink(link: string, size: number): string {
  return /=s\d+$/.test(link)
    ? link.replace(/=s\d+$/, `=s${size}`)
    : `${link}=s${size}`;
}

/** Streams a file's original bytes. The caller forwards the body. */
export async function downloadFile(
  accessToken: string,
  fileId: string,
): Promise<Response> {
  return driveFetch(
    accessToken,
    `${filesUrl()}/${encodeURIComponent(fileId)}?alt=media`,
    { method: "GET" },
  );
}

/**
 * Gives one Google account read access to a file or folder, without Google
 * emailing them about it. Returns the permission ID needed to remove it.
 */
export async function grantReader(
  accessToken: string,
  fileId: string,
  email: string,
): Promise<string> {
  const response = await driveFetch(
    accessToken,
    `${filesUrl()}/${encodeURIComponent(fileId)}/permissions?sendNotificationEmail=false&fields=id`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "user", role: "reader", emailAddress: email }),
    },
  );
  const { id } = (await response.json()) as { id: string };
  return id;
}

/** Removes a permission. Already gone counts as success. */
export async function removePermission(
  accessToken: string,
  fileId: string,
  permissionId: string,
): Promise<void> {
  try {
    await driveFetch(
      accessToken,
      `${filesUrl()}/${encodeURIComponent(fileId)}/permissions/${encodeURIComponent(permissionId)}`,
      { method: "DELETE" },
    );
  } catch (error) {
    if (error instanceof DriveError && error.status === 404) return;
    throw error;
  }
}

/** Renames a file or folder. */
export async function renameFile(
  accessToken: string,
  fileId: string,
  name: string,
): Promise<void> {
  await driveFetch(accessToken, `${filesUrl()}/${encodeURIComponent(fileId)}?fields=id`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

/** Moves a file from one folder to another, in the same Google account. */
export async function moveFile(
  accessToken: string,
  fileId: string,
  fromFolderId: string,
  toFolderId: string,
): Promise<void> {
  const params = new URLSearchParams({ addParents: toFolderId, fields: "id" });
  if (fromFolderId) params.set("removeParents", fromFolderId);
  await driveFetch(accessToken, `${filesUrl()}/${encodeURIComponent(fileId)}?${params}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
}

/** Moves a file or folder to the Drive bin, where it can be restored for 30 days. */
export async function moveToBin(accessToken: string, fileId: string): Promise<void> {
  await driveFetch(accessToken, `${filesUrl()}/${encodeURIComponent(fileId)}?fields=id`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trashed: true }),
  });
}

/**
 * Makes one file viewable by anyone who has its Drive link, without it being
 * findable by search. Returns the permission ID needed to undo it.
 */
export async function grantAnyoneWithLink(
  accessToken: string,
  fileId: string,
): Promise<string> {
  const response = await driveFetch(
    accessToken,
    `${filesUrl()}/${encodeURIComponent(fileId)}/permissions?fields=id`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "anyone", role: "reader", allowFileDiscovery: false }),
    },
  );
  const { id } = (await response.json()) as { id: string };
  return id;
}
