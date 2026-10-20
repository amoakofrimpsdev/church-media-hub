// @vitest-environment node
//
// Guards against data leaks across the whole database, not table by table.
// These check every table and function that exists, so a table or function
// added later without protection fails here even if nobody wrote a test for it.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSeededDatabase, type TestDatabase } from "./harness";

let db: TestDatabase;
let tables: string[];

/** Tables only the server (secret key) may touch. Signed-in people get nothing. */
const SERVER_ONLY = [
  "app_settings",
  "drive_grants",
  "google_connection",
  "notification_log",
  "region_google_connections",
  "share_file_grants",
  "share_visitors",
  "telegram_link_tokens",
];

beforeAll(async () => {
  db = await createSeededDatabase();
  tables = (
    await db.admin<{ tablename: string }>(
      "select tablename from pg_tables where schemaname = 'public' order by tablename",
    )
  ).map((row) => row.tablename);
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("every table", () => {
  it("has Row Level Security turned on", async () => {
    const unprotected = await db.admin<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    expect(unprotected.map((row) => row.relname)).toEqual([]);
  });

  it("gives signed-out visitors nothing at all", async () => {
    const readable: string[] = [];
    for (const table of tables) {
      try {
        const rows = await db.asAnon(`select * from public.${table} limit 1`);
        if (rows.length > 0) readable.push(table);
      } catch {
        // Permission denied is what we want.
      }
    }
    expect(readable).toEqual([]);
  });

  it("does not let signed-out visitors write anywhere", async () => {
    const writable = await db.admin<{ table_name: string }>(
      `select distinct table_name from information_schema.role_table_grants
       where grantee = 'anon' and table_schema = 'public'
         and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')`,
    );
    expect(writable.map((row) => row.table_name)).toEqual([]);
  });

  it("keeps server-only tables away from every signed-in person", async () => {
    // Admins are the most privileged signed-in people.
    const [{ id: admin }] = await db.admin<{ id: string }>(
      "select id from public.profiles where role = 'admin' and active limit 1",
    );
    const leaked: string[] = [];
    for (const table of SERVER_ONLY) {
      expect(tables, `${table} should exist`).toContain(table);
      try {
        await db.as(admin, `select * from public.${table} limit 1`);
        leaked.push(table);
      } catch {
        // Permission denied.
      }
    }
    expect(leaked).toEqual([]);
  });

  it("keeps the private columns of regions (Drive folder, Telegram group) from signed-in people", async () => {
    const [{ id: admin }] = await db.admin<{ id: string }>(
      "select id from public.profiles where role = 'admin' and active limit 1",
    );
    for (const column of ["church_folder_id", "telegram_chat_id", "telegram_chat_title"]) {
      await expect(db.as(admin, `select ${column} from public.regions`), column).rejects.toThrow(
        /permission denied/,
      );
    }
  });
});

describe("every function", () => {
  it("that runs with raised rights fixes its search path", async () => {
    // Without it, someone could make the function call their own lookalike.
    const unsafe = await db.admin<{ proname: string }>(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('public', 'private') and p.prosecdef
         and not exists (
           select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%'
         )`,
    );
    expect(unsafe.map((row) => row.proname)).toEqual([]);
  });

  it("cannot be called by signed-out visitors", async () => {
    const callable = await db.admin<{ name: string }>(
      `select n.nspname || '.' || p.proname as name
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('public', 'private')
         and has_function_privilege('anon', p.oid, 'execute')`,
    );
    expect(callable.map((row) => row.name)).toEqual([]);
  });

  it("that only the server uses cannot be called by signed-in people", async () => {
    for (const fn of ["record_share_view(uuid, uuid)", "record_share_download(uuid)"]) {
      const [{ allowed }] = await db.admin<{ allowed: boolean }>(
        `select has_function_privilege('authenticated', 'public.${fn}', 'execute') as allowed`,
      );
      expect(allowed, fn).toBe(false);
    }
  });
});

describe("people's details", () => {
  let main: string;
  let oc: string;
  let mainMember: string;
  let ocViewer: string;
  let ocMember: string;
  let ocAdmin: string;

  beforeAll(async () => {
    [{ id: main }] = await db.admin<{ id: string }>("select id from public.regions where name = 'Main'");
    [{ id: oc }] = await db.admin<{ id: string }>(
      "insert into public.regions (name) values ('OC privacy test') returning id",
    );
    const signUp = async (email: string, role: string, region: string, runs = false) => {
      await db.admin(
        "insert into public.invites (email, role, region_ids, region_admin_ids) values ($1, $2, $3, $4)",
        [email, role, [region], runs ? [region] : []],
      );
      const [user] = await db.admin<{ id: string }>(
        "insert into auth.users (email, raw_user_meta_data) values ($1, '{}') returning id",
        [email],
      );
      return user.id;
    };
    mainMember = await signUp("privacy.main@example.com", "member", main);
    ocViewer = await signUp("privacy.viewer@example.com", "viewer", oc);
    ocMember = await signUp("privacy.oc@example.com", "member", oc);
    ocAdmin = await signUp("privacy.ocadmin@example.com", "member", oc, true);
  });

  const emailsSeenBy = async (who: string) =>
    (await db.as<{ email: string }>(who, "select email from public.profiles")).map((row) => row.email);

  it("are hidden from people in other regions", async () => {
    const seen = await emailsSeenBy(ocViewer);
    expect(seen).not.toContain("privacy.main@example.com");
    expect(seen).toContain("privacy.oc@example.com");
    expect(seen).toContain("privacy.viewer@example.com");
  });

  it("include the super admins, who work across every region", async () => {
    const admins = await db.admin<{ email: string }>(
      "select email from public.profiles where role = 'admin'",
    );
    const seen = await emailsSeenBy(ocMember);
    for (const { email } of admins) expect(seen).toContain(email);
  });

  it("are all visible to region admins, so they can add people to their region", async () => {
    expect(await emailsSeenBy(ocAdmin)).toContain("privacy.main@example.com");
  });

  it("do not reveal who is in another region", async () => {
    const rows = await db.as<{ region_id: string }>(
      mainMember,
      "select distinct region_id from public.region_members",
    );
    expect(rows.map((row) => row.region_id)).toEqual([main]);
  });

  it("are hidden from someone whose access was turned off", async () => {
    await db.admin("update public.profiles set active = false where id = $1", [ocMember]);
    expect(await emailsSeenBy(ocMember)).toEqual([]);
    for (const table of ["services", "uploads", "handoffs", "assignments", "region_members", "teams"]) {
      expect(await db.as(ocMember, `select 1 from public.${table} limit 1`), table).toEqual([]);
    }
    await db.admin("update public.profiles set active = true where id = $1", [ocMember]);
  });
});
