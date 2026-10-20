// Read-only checks against a deployed site, as a signed-out stranger.
// Usage: node tests/tools/probe-live.mjs <site-url>
// Reads the Supabase address and public (publishable) key from .env.local:
// the same key every visitor's browser already has. Never sends a secret key.
import { readFileSync } from "node:fs";

const site = (process.argv[2] ?? "").replace(/\/$/, "");
if (!site) throw new Error("Usage: node tests/tools/probe-live.mjs <site-url>");
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((line) => /^[A-Z_]+=/.test(line))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).trim()]),
);
const supabase = env.NEXT_PUBLIC_SUPABASE_URL;
const publicKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const problems = [];
const ok = [];
const check = (pass, label, detail = "") => (pass ? ok : problems).push(`${label}${detail ? `: ${detail}` : ""}`);

// ── The app ──
const get = (path, init = {}) => fetch(site + path, { redirect: "manual", ...init });
for (const path of ["/dashboard", "/gallery", "/admin/people", "/admin/regions", "/services"]) {
  const response = await get(path);
  check([302, 303, 307, 308].includes(response.status) && (response.headers.get("location") ?? "").includes("/login"),
    `${path} sends strangers to sign in`, String(response.status));
}
for (const path of ["/preview/dashboard", "/preview/people"]) {
  const response = await get(path);
  const body = response.status === 200 ? await response.text() : "";
  check(!body.includes("Ama Owusu"), `${path} shows no sample screen`, String(response.status));
}
for (const [method, path] of [
  ["POST", "/api/uploads/session"], ["POST", "/api/uploads/complete"], ["POST", "/api/uploads/status"],
  ["GET", "/api/thumb/986a261f-e7e0-4f77-b376-10f477daa7d0"], ["GET", "/api/files/986a261f-e7e0-4f77-b376-10f477daa7d0"],
  ["POST", "/api/cron/run"], ["GET", "/api/cron/run"], ["POST", "/api/telegram/webhook"],
]) {
  const response = await get(path, { method, headers: { Origin: site, "Content-Type": "application/json" }, body: method === "POST" ? "{}" : undefined });
  check([401, 403, 404].includes(response.status) || ([302, 307].includes(response.status) && (response.headers.get("location") ?? "").includes("/login")),
    `${method} ${path} refuses strangers`, String(response.status));
}
const fakeToken = "a".repeat(43);
for (const path of [`/api/share/${fakeToken}/thumb/986a261f-e7e0-4f77-b376-10f477daa7d0`, `/api/share/${fakeToken}/file/986a261f-e7e0-4f77-b376-10f477daa7d0`]) {
  const response = await get(path);
  check(response.status === 404, `${path.slice(0, 20)}… refuses a made-up share link`, String(response.status));
}
const login = await get("/login");
check(login.headers.get("x-frame-options") === "DENY", "pages cannot be framed by other sites", login.headers.get("x-frame-options") ?? "missing");
check(login.headers.get("x-content-type-options") === "nosniff", "browsers do not guess file types", login.headers.get("x-content-type-options") ?? "missing");
check((login.headers.get("strict-transport-security") ?? "").includes("max-age"), "HTTPS is enforced", login.headers.get("strict-transport-security") ?? "missing");
const redirect = await get("/auth/callback?next=//evil.example.com");
check(!(redirect.headers.get("location") ?? "").includes("evil.example.com"), "sign-in cannot be bounced to another site");

// ── The page source must not carry secrets ──
const html = await login.text();
for (const [name, value] of Object.entries(env)) {
  if (name.startsWith("NEXT_PUBLIC_") || !value || value.length < 12) continue;
  check(!html.includes(value), `the sign-in page does not contain ${name}`);
}

// ── The database, with the public key ──
const tables = ["profiles", "invites", "teams", "team_members", "categories", "services", "service_folders",
  "google_connection", "region_google_connections", "category_teams", "uploads", "drive_grants", "duty_roles",
  "assignments", "assignment_categories", "handoffs", "app_settings", "telegram_link_tokens", "notification_log",
  "service_series", "service_series_skips", "share_links", "share_file_grants", "share_visitors", "regions", "region_members"];
const headers = { apikey: publicKey, Authorization: `Bearer ${publicKey}` };
for (const table of tables) {
  const response = await fetch(`${supabase}/rest/v1/${table}?select=*&limit=1`, { headers });
  const body = await response.text();
  const rows = response.ok ? JSON.parse(body) : [];
  check(!(Array.isArray(rows) && rows.length > 0), `table ${table} gives strangers nothing`, `${response.status}`);
}
for (const [fn, args] of [["upload_analytics", { p_since: "2020-01-01" }], ["record_share_view", { p_share_id: "986a261f-e7e0-4f77-b376-10f477daa7d0" }],
  ["record_share_download", { p_share_id: "986a261f-e7e0-4f77-b376-10f477daa7d0" }], ["set_task_done", {}], ["set_handoff_received", {}]]) {
  const response = await fetch(`${supabase}/rest/v1/rpc/${fn}`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(args) });
  check(!response.ok, `function ${fn} refuses strangers`, String(response.status));
}

console.log(`\n${ok.length} checks passed`);
if (problems.length) {
  console.log(`\n${problems.length} PROBLEMS:`);
  for (const problem of problems) console.log("  ✗ " + problem);
  process.exitCode = 1;
} else console.log("No problems found.");
