import { randomBytes } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { encryptSecret } from "../../lib/google/crypto";

/**
 * The main flow, end to end: an admin creates a service, uploads a photo from
 * the service page, and finds it in the album and the gallery.
 *
 * It runs against a throwaway local Supabase (started by CI with
 * `supabase start`) and a fake Google Drive (tests/e2e/fake-google.mjs), never
 * the real project. Without a local Supabase it is skipped.
 */

const supabaseUrl = process.env.E2E_SUPABASE_URL ?? "";
const anonKey = process.env.E2E_SUPABASE_ANON_KEY ?? "";
const serviceKey = process.env.E2E_SUPABASE_SERVICE_KEY ?? "";
const fakeGoogleUrl = process.env.E2E_FAKE_GOOGLE_URL ?? "";
const encryptionKey = process.env.TOKEN_ENCRYPTION_KEY ?? "";

test.skip(!supabaseUrl, "Needs a local Supabase: see README, Testing.");

// A valid 1×1 PNG.
const PHOTO = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

const email = `e2e-admin-${Date.now()}@example.com`;
const password = randomBytes(18).toString("base64url");
let userId = "";

test.beforeAll(async () => {
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Sign-up is invite only, so invite the test admin first.
  const invite = await admin.from("invites").insert({ email, role: "admin" });
  expect(invite.error, "inviting the test admin").toBeNull();

  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: "E2E Admin" },
  });
  expect(created.error, "creating the test admin").toBeNull();
  userId = created.data.user?.id ?? "";

  // "Connect" the church Google account: a root folder in the fake Drive and
  // an encrypted refresh token, as the real connect flow would store.
  const folder = await fetch(`${fakeGoogleUrl}/drive/v3/files`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "RCW Media" }),
  });
  const { id: rootFolderId } = (await folder.json()) as { id: string };

  const connection = await admin.from("google_connection").upsert({
    id: true,
    account_email: "church@example.com",
    refresh_token_encrypted: encryptSecret("fake-refresh-token", encryptionKey),
    root_folder_id: rootFolderId,
    status: "connected",
  });
  expect(connection.error, "connecting the fake Google account").toBeNull();
});

test("create a service, upload a photo, and see it in the gallery", async ({
  page,
  context,
  browser,
  baseURL,
}) => {
  // ── Sign in ──
  // The app only offers Google sign-in, which a test cannot click through. So
  // sign in with a password against the local Supabase and hand the browser
  // the same session cookies the app would have set.
  const cookies: { name: string; value: string }[] = [];
  const auth = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll: () => [],
      setAll: (list) => {
        cookies.push(...list.map(({ name, value }) => ({ name, value })));
      },
    },
  });
  const signIn = await auth.auth.signInWithPassword({ email, password });
  expect(signIn.error, "signing in").toBeNull();
  await expect.poll(() => cookies.length, "session cookies").toBeGreaterThan(0);
  await context.addCookies(
    cookies.map((cookie) => ({ ...cookie, url: baseURL ?? "" })),
  );

  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: /, E2E$/ })).toBeVisible();

  // ── Create a service ──
  const serviceName = `E2E Service ${Date.now()}`;
  await page.goto("/services/new");
  await page.getByLabel("Name").fill(serviceName);
  await page.getByRole("button", { name: "Create service" }).click();

  await expect(page.getByRole("heading", { name: serviceName })).toBeVisible({
    timeout: 30_000,
  });
  // Folders were created in (fake) Drive, so every album offers "add".
  await expect(page.getByRole("button", { name: "Add to Preacher" })).toBeVisible();
  await expect(page.getByText("Drive folders are not ready")).toHaveCount(0);

  const serviceId = new URL(page.url()).pathname.split("/").pop() ?? "";
  expect(serviceId).toMatch(/^[0-9a-f-]{36}$/);

  // ── Upload a photo to Preacher ──
  // One tap on the album opens the upload sheet already pointed at it.
  await page.getByRole("button", { name: "Add to Preacher" }).click();
  const sheet = page.getByRole("dialog", { name: "Upload" });
  await expect(sheet.getByText("Going to Preacher")).toBeVisible();
  await sheet.locator('input[type="file"]').setInputFiles({
    name: "preacher-photo.png",
    mimeType: "image/png",
    buffer: PHOTO,
  });
  await expect(page.getByText("Uploaded", { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText("All 1 uploaded.")).toBeVisible();

  // The record says who uploaded it, where, and that Google confirmed it.
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: uploads } = await admin
    .from("uploads")
    .select("id, uploaded_by, status, drive_file_id, size_bytes, file_name")
    .eq("service_id", serviceId);
  expect(uploads).toHaveLength(1);
  expect(uploads?.[0]).toMatchObject({
    uploaded_by: userId,
    status: "complete",
    file_name: "preacher-photo.png",
    size_bytes: PHOTO.length,
  });
  expect(uploads?.[0].drive_file_id).toBeTruthy();

  // ── See it in the album ──
  await page.goto(`/services/${serviceId}/preacher`);
  await expect(page.getByRole("heading", { name: "Preacher" })).toBeVisible();
  await expect(page.getByText("1 file", { exact: false })).toBeVisible();

  const tile = page.getByRole("button", { name: "Open preacher-photo.png" });
  await expect(tile).toBeVisible();
  // The thumbnail really loaded through our authenticated route.
  await expect
    .poll(() =>
      tile.locator("img").evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBeGreaterThan(0);

  // ── Open it full size and download the original ──
  await tile.click();
  const viewer = page.getByRole("dialog", { name: "preacher-photo.png" });
  await expect(viewer).toBeVisible();
  const download = viewer.getByRole("link", { name: "Download" });
  const href = await download.getAttribute("href");
  expect(href).toMatch(/^\/api\/files\/[0-9a-f-]{36}$/);

  const original = await page.request.get(href ?? "");
  expect(original.status()).toBe(200);
  expect(original.headers()["content-disposition"]).toContain("preacher-photo.png");
  expect(Buffer.compare(await original.body(), PHOTO)).toBe(0);

  await viewer.getByRole("button", { name: "Close" }).click();
  await expect(viewer).toBeHidden();

  // ── And in the searchable gallery ──
  await page.goto(`/gallery?service=${serviceId}`);
  await expect(
    page.getByRole("button", { name: "Open preacher-photo.png" }),
  ).toBeVisible();

  // A category nothing was uploaded to stays empty.
  await page.goto(`/services/${serviceId}/baptism`);
  await expect(page.getByText("Nothing here yet")).toBeVisible();

  // ── Share the album with someone who has no account ──
  const uploadId = uploads?.[0].id ?? "";
  await page.goto(`/services/${serviceId}/preacher`);
  await page.getByRole("button", { name: "Share" }).click();
  const shareDialog = page.getByRole("dialog", { name: "Share" });
  await shareDialog.getByLabel("Who is it for?").fill("Pastor James");
  await shareDialog.getByRole("button", { name: "Create link" }).click();
  const shareUrl = await shareDialog.getByLabel("Link", { exact: true }).inputValue();
  expect(shareUrl).toMatch(/\/s\/[A-Za-z0-9_-]{43}$/);
  const token = shareUrl.split("/s/")[1];

  // A fresh browser with no session: this is the pastor opening the link.
  const visitorContext = await browser.newContext();
  const visitor = await visitorContext.newPage();
  await visitor.goto(shareUrl);
  await expect(visitor.getByRole("heading", { name: "Preacher" })).toBeVisible();
  await expect(visitor.getByText("Shared with you")).toBeVisible();
  const sharedTile = visitor.getByRole("button", { name: "Open preacher-photo.png" });
  await expect
    .poll(() =>
      sharedTile.locator("img").evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBeGreaterThan(0);

  // They can download the original through the link…
  const sharedFile = await visitorContext.request.get(
    `${baseURL}/api/share/${token}/file/${uploadId}`,
  );
  expect(sharedFile.status()).toBe(200);
  expect(Buffer.compare(await sharedFile.body(), PHOTO)).toBe(0);

  // …but the link is the only thing that lets them in.
  const wrongToken = await visitorContext.request.get(
    `${baseURL}/api/share/${"x".repeat(43)}/thumb/${uploadId}`,
  );
  expect(wrongToken.status()).toBe(404);
  const appRoute = await visitorContext.request.get(`${baseURL}/api/thumb/${uploadId}`, {
    maxRedirects: 0,
  });
  expect(appRoute.status()).toBe(401);
  await visitor.goto(`${baseURL}/dashboard`);
  await expect(visitor).toHaveURL(/\/login/);

  // The admin turns the link off, and it stops working at once.
  await page.goto("/admin/shares");
  await expect(page.getByText("Pastor James")).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Turn off the link for Pastor James" }).click();
  await expect(page.getByText("No longer working (1)")).toBeVisible({ timeout: 30_000 });

  await visitor.goto(shareUrl);
  await expect(
    visitor.getByRole("heading", { name: "This link is not available" }),
  ).toBeVisible();
  const afterRevoke = await visitorContext.request.get(
    `${baseURL}/api/share/${token}/file/${uploadId}`,
  );
  expect(afterRevoke.status()).toBe(404);
  await visitorContext.close();

  // ── Delete the file from the full-size view ──
  await page.goto(`/services/${serviceId}/preacher`);
  await page.getByRole("button", { name: "Open preacher-photo.png" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete this file" }).click();
  await expect(page.getByText("Nothing here yet")).toBeVisible({ timeout: 30_000 });
  const afterFileDelete = await admin
    .from("uploads")
    .select("id")
    .eq("service_id", serviceId);
  expect(afterFileDelete.data).toHaveLength(0);

  // ── Delete a service that has uploads ──
  await page.goto(`/services/${serviceId}`);
  // The service's own Upload button this time (the first category is chosen).
  await page.getByRole("main").getByRole("button", { name: "Upload", exact: true }).click();
  await page.getByRole("dialog", { name: "Upload" }).locator('input[type="file"]').setInputFiles({
    name: "second-photo.png",
    mimeType: "image/png",
    buffer: PHOTO,
  });
  await expect(page.getByText("Uploaded", { exact: true })).toBeVisible({
    timeout: 30_000,
  });

  await page.goto(`/services/${serviceId}/edit`);
  const deleteButton = page.getByRole("button", {
    name: "Delete service and 1 file",
  });
  // Locked until the service's name is typed.
  await expect(deleteButton).toBeDisabled();
  await page.getByLabel(/to confirm$/).fill(serviceName);
  await deleteButton.click();

  await expect(page).toHaveURL(/\/services$/, { timeout: 30_000 });
  await expect(page.getByText(serviceName)).toHaveCount(0);
  const gone = await admin.from("services").select("id").eq("id", serviceId);
  expect(gone.data).toHaveLength(0);
  const orphans = await admin.from("uploads").select("id").eq("service_id", serviceId);
  expect(orphans.data).toHaveLength(0);

  // ── Remove a person completely ──
  const leavingEmail = `e2e-leaving-${Date.now()}@example.com`;
  expect((await admin.from("invites").insert({ email: leavingEmail, role: "member" })).error).toBeNull();
  const leaving = await admin.auth.admin.createUser({
    email: leavingEmail,
    password: randomBytes(18).toString("base64url"),
    email_confirm: true,
    user_metadata: { full_name: "Leaving Volunteer" },
  });
  expect(leaving.error, "creating the person to remove").toBeNull();
  const leavingId = leaving.data.user?.id ?? "";

  await page.goto("/admin/people");
  await page.getByRole("button", { name: "Open Leaving Volunteer" }).click();
  const panel = page.getByRole("dialog", { name: "Leaving Volunteer" });
  await panel.getByLabel("Type Leaving Volunteer to confirm").fill("Leaving Volunteer");
  await panel.getByRole("button", { name: "Remove for good" }).click();
  // Once they are gone the page refreshes without them: their card and panel go.
  await expect(page.getByRole("button", { name: "Open Leaving Volunteer" })).toHaveCount(0, {
    timeout: 15_000,
  });

  const profile = await admin.from("profiles").select("id").eq("id", leavingId);
  expect(profile.data).toHaveLength(0);
  const account = await admin.auth.admin.getUserById(leavingId);
  expect(account.data.user, "the sign-in account is gone").toBeNull();
  const invite = await admin.from("invites").select("email").eq("email", leavingEmail);
  expect(invite.data, "they cannot sign back in").toHaveLength(0);
});
