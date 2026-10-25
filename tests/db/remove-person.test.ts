// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "./harness";

let db: TestDatabase;
let admin: string;
let leaving: string;
let service: string;
let upload: string;

beforeAll(async () => {
  db = await createTestDatabase();
  admin = await db.signUp("admin@example.com", "admin");
  const [{ id: team }] = await db.admin<{ id: string }>(
    "insert into public.teams (name, kind) values ('Media', 'media') returning id",
  );
  leaving = await db.signUp("leaving@example.com", "member", team);
  await db.admin("update public.profiles set telegram_user_id = 4242 where id = $1", [leaving]);

  [{ id: service }] = await db.admin<{ id: string }>(
    "insert into public.services (name, starts_at) values ('Sunday Service', now()) returning id",
  );
  const [{ id: category }] = await db.admin<{ id: string }>(
    "select id from public.categories where slug = 'baptism'",
  );
  const [{ id: role }] = await db.admin<{ id: string }>("select id from public.duty_roles limit 1");
  const [{ id: assignment }] = await db.admin<{ id: string }>(
    "insert into public.assignments (service_id, profile_id, duty_role_id) values ($1, $2, $3) returning id",
    [service, leaving, role],
  );
  await db.admin(
    "insert into public.assignment_categories (assignment_id, category_id) values ($1, $2)",
    [assignment, category],
  );
  [{ id: upload }] = await db.admin<{ id: string }>(
    `insert into public.uploads (service_id, category_id, uploaded_by, file_name, mime_type, size_bytes, status, drive_file_id, completed_at)
     values ($1, $2, $3, 'a.jpg', 'image/jpeg', 10, 'complete', 'drive-a', now()) returning id`,
    [service, category, leaving],
  );
  await db.admin(
    "insert into public.drive_grants (profile_id, drive_folder_id, permission_id) values ($1, 'folder', 'perm')",
    [leaving],
  );
}, 60_000);

afterAll(async () => {
  await db.close();
});

const count = async (sql: string, params: unknown[] = []) =>
  (await db.admin<{ n: number }>(`select count(*)::int as n from (${sql}) rows`, params))[0].n;

describe("removing someone completely", () => {
  it("deletes their account and everything that was only theirs, keeping their uploads", async () => {
    await db.admin("delete from auth.users where id = $1", [leaving]);

    expect(await count("select 1 from public.profiles where id = $1", [leaving])).toBe(0);
    expect(await count("select 1 from public.region_members where profile_id = $1", [leaving])).toBe(0);
    expect(await count("select 1 from public.team_members where profile_id = $1", [leaving])).toBe(0);
    expect(await count("select 1 from public.assignments where profile_id = $1", [leaving])).toBe(0);
    expect(await count("select 1 from public.drive_grants where profile_id = $1", [leaving])).toBe(0);
    expect(await count("select 1 from public.profiles where telegram_user_id = 4242")).toBe(0);

    // The photo stays, without a name on it.
    const [kept] = await db.admin<{ uploaded_by: string | null }>(
      "select uploaded_by from public.uploads where id = $1",
      [upload],
    );
    expect(kept.uploaded_by).toBeNull();
    // And the service it belongs to is untouched.
    expect(await count("select 1 from public.services where id = $1", [service])).toBe(1);
  });

  it("cannot sign back in once their invite is gone", async () => {
    await db.admin("delete from public.invites where email = 'leaving@example.com'");
    await expect(
      db.admin("insert into auth.users (email, raw_user_meta_data) values ('leaving@example.com', '{}')"),
    ).rejects.toThrow(/not_invited/);
  });

  it("never removes the last active admin", async () => {
    await expect(db.admin("delete from auth.users where id = $1", [admin])).rejects.toThrow(/last_admin/);
  });

  it("is not something a signed-in person can do to a profile directly", async () => {
    await expect(
      db.as(admin, "delete from public.profiles where id = $1", [admin]),
    ).rejects.toThrow(/permission denied/);
  });
});
