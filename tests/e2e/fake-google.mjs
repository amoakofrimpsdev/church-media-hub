// A stand-in for Google Drive, used only by the end-to-end test. It implements
// just the calls the app makes: token refresh, creating folders, resumable
// uploads, file metadata, thumbnails and downloads. Files live in memory.

import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.FAKE_GOOGLE_PORT ?? 3200);
const ORIGIN = `http://localhost:${PORT}`;

/** @type {Map<string, {id: string, name: string, mimeType: string, parents: string[], trashed: boolean, bytes: Buffer | null}>} */
const files = new Map();
/** @type {Map<string, {fileId: string, total: number, received: Buffer}>} */
const sessions = new Map();

function readBody(request) {
  return new Promise((resolve) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

function json(response, status, body, headers = {}) {
  response.writeHead(status, { "Content-Type": "application/json", ...headers });
  response.end(JSON.stringify(body));
}

function metadata(file) {
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    parents: file.parents,
    trashed: file.trashed,
    size: file.bytes ? String(file.bytes.length) : undefined,
    thumbnailLink: file.bytes ? `${ORIGIN}/thumb/${file.id}=s220` : undefined,
  };
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", ORIGIN);
  const origin = request.headers.origin;
  // The browser sends file bytes here from the app's origin, as it does to
  // the real Google.
  const cors = origin
    ? {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "PUT, POST, OPTIONS",
        "Access-Control-Allow-Headers": "content-range, content-type",
      }
    : {};

  try {
    if (url.pathname === "/health") return json(response, 200, { ok: true });

    if (request.method === "OPTIONS") {
      response.writeHead(204, cors);
      return response.end();
    }

    if (url.pathname === "/token" && request.method === "POST") {
      return json(response, 200, { access_token: "fake-access-token", expires_in: 3600 });
    }

    // ── Resumable uploads ──
    if (url.pathname === "/upload/drive/v3/files") {
      const uploadId = url.searchParams.get("upload_id");

      if (request.method === "POST" && !uploadId) {
        const body = JSON.parse((await readBody(request)).toString() || "{}");
        const id = `file-${randomUUID()}`;
        files.set(id, {
          id,
          name: body.name ?? "untitled",
          mimeType: request.headers["x-upload-content-type"] ?? "application/octet-stream",
          parents: body.parents ?? [],
          trashed: false,
          bytes: null,
        });
        const session = randomUUID();
        sessions.set(session, {
          fileId: id,
          total: Number(request.headers["x-upload-content-length"] ?? 0),
          received: Buffer.alloc(0),
        });
        response.writeHead(200, {
          ...cors,
          Location: `${ORIGIN}/upload/drive/v3/files?uploadType=resumable&upload_id=${session}`,
        });
        return response.end();
      }

      const session = uploadId ? sessions.get(uploadId) : undefined;
      if (request.method === "PUT" && session) {
        const range = String(request.headers["content-range"] ?? "");
        const chunk = await readBody(request);
        // "bytes */N" asks how much has arrived, without sending anything.
        if (!range.startsWith("bytes */")) {
          session.received = Buffer.concat([session.received, chunk]);
        }
        if (session.received.length >= session.total && session.total > 0) {
          const file = files.get(session.fileId);
          file.bytes = session.received;
          return json(response, 200, { id: file.id }, cors);
        }
        response.writeHead(308, {
          ...cors,
          ...(session.received.length > 0
            ? { Range: `bytes=0-${session.received.length - 1}` }
            : {}),
        });
        return response.end();
      }
      return json(response, 404, { error: "unknown upload session" }, cors);
    }

    // ── Thumbnails: the uploaded image itself, whatever size is asked for ──
    const thumb = /^\/thumb\/([^=]+)=s\d+$/.exec(url.pathname);
    if (thumb) {
      const file = files.get(thumb[1]);
      if (!file?.bytes) return json(response, 404, { error: "no thumbnail" });
      response.writeHead(200, { "Content-Type": "image/png" });
      return response.end(file.bytes);
    }

    // ── Files and folders ──
    if (url.pathname === "/drive/v3/files" && request.method === "POST") {
      const body = JSON.parse((await readBody(request)).toString() || "{}");
      const id = `folder-${randomUUID()}`;
      files.set(id, {
        id,
        name: body.name ?? "untitled",
        mimeType: body.mimeType ?? "application/vnd.google-apps.folder",
        parents: body.parents ?? [],
        trashed: false,
        bytes: null,
      });
      return json(response, 200, { id });
    }

    const permission = /^\/drive\/v3\/files\/([^/]+)\/permissions(?:\/[^/]+)?$/.exec(url.pathname);
    if (permission) {
      if (request.method === "POST") return json(response, 200, { id: `perm-${randomUUID()}` });
      response.writeHead(204);
      return response.end();
    }

    const single = /^\/drive\/v3\/files\/([^/]+)$/.exec(url.pathname);
    if (single) {
      const file = files.get(decodeURIComponent(single[1]));
      if (!file) return json(response, 404, { error: { message: "File not found" } });

      if (request.method === "GET" && url.searchParams.get("alt") === "media") {
        response.writeHead(200, { "Content-Type": file.mimeType });
        return response.end(file.bytes ?? Buffer.alloc(0));
      }
      if (request.method === "GET") return json(response, 200, metadata(file));
      if (request.method === "PATCH") {
        const body = JSON.parse((await readBody(request)).toString() || "{}");
        if (typeof body.name === "string") file.name = body.name;
        if (typeof body.trashed === "boolean") file.trashed = body.trashed;
        const add = url.searchParams.get("addParents");
        const remove = url.searchParams.get("removeParents");
        if (remove) file.parents = file.parents.filter((parent) => !remove.split(",").includes(parent));
        if (add) file.parents.push(...add.split(","));
        return json(response, 200, { id: file.id });
      }
    }

    return json(response, 404, { error: { message: `Fake Google has no ${request.method} ${url.pathname}` } });
  } catch (error) {
    return json(response, 500, { error: { message: String(error) } });
  }
});

server.listen(PORT, () => console.log(`Fake Google Drive listening on ${ORIGIN}`));
