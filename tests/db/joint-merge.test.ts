// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "./harness";

let db: TestDatabase;
let main: string;
let oc: string;
let west: string;
let admin: string;
let ocMember: string;
let ocAdmin: string;
let westMember: string;
let baptism: string;
let preacher: string;
let photographer: string;

async function signUpIn(email: string, role: string, region: string, runs = false) {
  await db.admin(
    "insert into public.invites (email, role, region_ids, region_admin_ids) values ($1, $2, $3, $4)",
    [email, role, [region], runs ? [region] : []],
  );
  const [user] = await db.admin<{ id: string }>(
    "insert into auth.users (email, raw_user_meta_data) values ($1, '{}') returning id",
    [email],
  );
  return user.id;
}

const merge = (keep: string, extra: string) =>
  db.exec(`set role service_role; select public.merge_service_records('${keep}', '${extra}'); reset role;`);

beforeAll(async () => {
  db = await createTestDatabase();
  admin = await db.signUp("admin@example.com", "admin");
  [{ id: main }] = await db.admin<{ id: string }>("select id from public.regions where name = 'Main'");
  [{ id: oc }] = await db.admin<{ id: string }>("insert into public.regions (name) values ('OC') returning id");
  [{ id: west }] = await db.admin<{ id: string }>(
    "insert into public.regions (name) values ('West Valley') returning id",
  );
  ocMember = await signUpIn("oc@example.com", "member", oc);
  ocAdmin = await signUpIn("oc.admin@example.com", "member", oc, true);
  westMember = await signUpIn("west@example.com", "member", west);
  [{ id: baptism }] = await db.admin<{ id: string }>("select id from public.categories where slug = 'baptism'");
  [{ id: preacher }] = await db.admin<{ id: string }>("select id from public.categories where slug = 'preacher'");
  [{ id: photographer }] = await db.admin<{ id: string }>("select id from public.duty_roles order by sort_order limit 1");
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("joint services", () => {
  let joint: string;

  beforeAll(async () => {
    [{ id: joint }] = await db.admin<{ id: string }>(
      "insert into public.services (name, starts_at, region_id, shared_region_ids) values ('Combined Service', now(), $1, $2) returning id",
      [main, [oc]],
    );
  });

  it("are seen by people in every region they are for", async () => {
    expect(await db.as(ocMember, "select id from public.services where id = $1", [joint])).toHaveLength(1);
    expect(await db.as(westMember, "select id from public.services where id = $1", [joint])).toHaveLength(0);
  });

  it("can be uploaded to from any of those regions", async () => {
    await db.as(
      ocMember,
      "insert into public.uploads (service_id, category_id, uploaded_by, file_name, mime_type, size_bytes) values ($1, $2, $3, 'a.jpg', 'image/jpeg', 10)",
      [joint, baptism, ocMember],
    );
    await expect(
      db.as(
        westMember,
        "insert into public.uploads (service_id, category_id, uploaded_by, file_name, mime_type, size_bytes) values ($1, $2, $3, 'b.jpg', 'image/jpeg', 10)",
        [joint, baptism, westMember],
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("are run by the main region's admins only", async () => {
    const changed = await db.as(
      ocAdmin,
      "update public.services set name = 'Renamed' where id = $1 returning id",
      [joint],
    );
    expect(changed).toHaveLength(0);
  });

  it("never list their own main region, or regions that do not exist, as also for", async () => {
    const [row] = await db.admin<{ shared_region_ids: string[] }>(
      "insert into public.services (name, starts_at, region_id, shared_region_ids) values ('Tidy', now(), $1, $2) returning shared_region_ids",
      [main, [main, oc, oc, "00000000-0000-4000-8000-000000000000"]],
    );
    expect(row.shared_region_ids).toEqual([oc]);
  });
});

describe("merging a duplicate service", () => {
  let keep: string;
  let extra: string;
  let series: string;
  let link: string;

  beforeAll(async () => {
    [{ id: series }] = await db.admin<{ id: string }>(
      "insert into public.service_series (name, weekday, local_time, region_id) values ('Sunday Service', 0, '10:00', $1) returning id",
      [main],
    );
    [{ id: keep }] = await db.admin<{ id: string }>(
      "insert into public.services (name, starts_at, region_id) values ('Sunday Service', now(), $1) returning id",
      [main],
    );
    [{ id: extra }] = await db.admin<{ id: string }>(
      "insert into public.services (name, starts_at, region_id, series_id, series_slot) values ('Sunday Service', now(), $1, $2, '2030-01-06T18:00:00Z') returning id",
      [oc, series],
    );
    // The same person in the same role at both, with different categories.
    const [{ id: keepTask }] = await db.admin<{ id: string }>(
      "insert into public.assignments (service_id, profile_id, duty_role_id) values ($1, $2, $3) returning id",
      [keep, ocMember, photographer],
    );
    await db.admin("insert into public.assignment_categories (assignment_id, category_id) values ($1, $2)", [keepTask, baptism]);
    const [{ id: extraTask }] = await db.admin<{ id: string }>(
      "insert into public.assignments (service_id, profile_id, duty_role_id) values ($1, $2, $3) returning id",
      [extra, ocMember, photographer],
    );
    await db.admin(
      "insert into public.assignment_categories (assignment_id, category_id, done_at) values ($1, $2, now()), ($1, $3, now())",
      [extraTask, baptism, preacher],
    );
    // Someone only at the extra one.
    await db.admin("insert into public.assignments (service_id, profile_id, duty_role_id) values ($1, $2, $3)", [
      extra,
      ocAdmin,
      photographer,
    ]);
    await db.admin(
      `insert into public.uploads (service_id, category_id, uploaded_by, file_name, mime_type, size_bytes, status, drive_file_id, completed_at)
       values ($1, $2, $3, 'x.jpg', 'image/jpeg', 10, 'complete', 'drive-x', now()), ($1, $2, $3, 'y.jpg', 'image/jpeg', 10, 'complete', 'drive-y', now())`,
      [extra, baptism, ocMember],
    );
    [{ id: link }] = await db.admin<{ id: string }>(
      "insert into public.share_links (token, label, service_id, region_id) values ($1, 'Pastor', $2, $3) returning id",
      ["m".repeat(43), extra, oc],
    );
    await merge(keep, extra);
  });

  const rows = <T extends Record<string, unknown>>(sql: string, params: unknown[] = []) => db.admin<T>(sql, params);

  it("moves the files and deletes the extra service", async () => {
    expect(await rows("select 1 from public.uploads where service_id = $1", [keep])).toHaveLength(2);
    expect(await rows("select 1 from public.services where id = $1", [extra])).toHaveLength(0);
  });

  it("joins the same person's tasks, keeping what was done", async () => {
    const tasks = await rows<{ profile_id: string; category_id: string; done: boolean }>(
      `select a.profile_id, ac.category_id, ac.done_at is not null as done
       from public.assignments a join public.assignment_categories ac on ac.assignment_id = a.id
       where a.service_id = $1 and a.profile_id = $2 order by ac.category_id`,
      [keep, ocMember],
    );
    expect(tasks).toHaveLength(2);
    expect(tasks.every((task) => task.done)).toBe(true);
    const assignments = await rows("select 1 from public.assignments where service_id = $1", [keep]);
    expect(assignments).toHaveLength(2);
  });

  it("points share links at the kept service", async () => {
    const [row] = await rows<{ service_id: string }>("select service_id from public.share_links where id = $1", [link]);
    expect(row.service_id).toBe(keep);
  });

  it("makes the kept service also for the extra one's region", async () => {
    const [row] = await rows<{ shared_region_ids: string[] }>(
      "select shared_region_ids from public.services where id = $1",
      [keep],
    );
    expect(row.shared_region_ids).toEqual([oc]);
  });

  it("stops the weekly schedule creating the extra one again", async () => {
    expect(
      await rows("select 1 from public.service_series_skips where series_id = $1", [series]),
    ).toHaveLength(1);
  });

  it("refuses to merge a service into itself", async () => {
    await expect(merge(keep, keep)).rejects.toThrow(/same_service/);
  });

  it("is something only the server can do", async () => {
    await expect(
      db.as(admin, "select public.merge_service_records($1, $2)", [keep, keep]),
    ).rejects.toThrow(/permission denied/);
  });
});
