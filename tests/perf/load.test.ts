// The load test. Fills a database like a busy church after about two years
// (three regions, two services a week each, ~30,000 photos and videos), then
// times the queries behind the app's busiest pages as the people who use
// them: a member, a viewer and a super admin.
//
// PGlite runs Postgres compiled to WebAssembly, so absolute times are slower
// than Supabase. What matters is which queries stand out, and how they change.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "../db/harness";

let db: TestDatabase;
let member: string;
let viewer: string;
let admin: string;
const results: { query: string; who: string; ms: number }[] = [];

const UPLOADS = 30_000;
let seeded = "";

beforeAll(async () => {
  db = await createTestDatabase();
  const started = Date.now();
  await db.exec(`
    insert into public.regions (name) values ('OC'), ('West Valley');
    insert into public.teams (name) values ('Thumbnails');
    insert into public.category_teams (category_id, team_id)
      select c.id, t.id from public.categories c, public.teams t where c.slug in ('preacher', 'baptism');

    -- 60 people: 20 in each region; the first is a super admin.
    insert into public.invites (email, role, region_ids, team_id)
    select 'person' || n || '@example.com',
           case when n = 1 then 'admin' when n % 10 = 0 then 'viewer' else 'member' end::public.app_role,
           array[(select id from public.regions order by created_at, name offset (n % 3) limit 1)],
           case when n % 10 = 0 then (select id from public.teams limit 1) end
    from generate_series(1, 60) n;
    insert into auth.users (email, raw_user_meta_data)
    select 'person' || n || '@example.com', jsonb_build_object('full_name', 'Person ' || n)
    from generate_series(1, 60) n;

    -- Two services a week in each region for two years.
    insert into public.services (name, starts_at, region_id, drive_folder_status)
    select 'Service ' || w || '-' || s, now() - (w || ' weeks')::interval + (s || ' days')::interval, r.id, 'ready'
    from public.regions r, generate_series(0, 103) w, generate_series(0, 1) s;

    insert into public.service_folders (service_id, category_id, drive_folder_id)
    select s.id, c.id, 'folder-' || s.id || '-' || c.slug from public.services s, public.categories c;

    -- Three people assigned to each service.
    insert into public.assignments (service_id, profile_id, duty_role_id)
    select s.id, m.profile_id, (select id from public.duty_roles order by sort_order limit 1)
    from public.services s
    join lateral (
      select profile_id from public.region_members rm
      join public.profiles p on p.id = rm.profile_id and p.role = 'member'
      where rm.region_id = s.region_id
      order by rm.profile_id limit 3
    ) m on true;
  `);

  // Uploads by people in the service's region, spread over the services.
  await db.exec(`
    with services as (
      select s.id, s.region_id, s.starts_at, row_number() over (order by s.id) - 1 as n,
             count(*) over () as total
      from public.services s
    ),
    uploaders as (
      select rm.region_id, rm.profile_id, row_number() over (partition by rm.region_id order by rm.profile_id) - 1 as n,
             count(*) over (partition by rm.region_id) as total
      from public.region_members rm join public.profiles p on p.id = rm.profile_id and p.role <> 'viewer'
    )
    insert into public.uploads
      (service_id, category_id, uploaded_by, file_name, mime_type, size_bytes, status, drive_file_id, completed_at, created_at)
    select s.id,
           (select id from public.categories order by sort_order offset (i % 4) limit 1),
           u.profile_id,
           'IMG_' || i || '.jpg',
           case when i % 15 = 0 then 'video/mp4' else 'image/jpeg' end,
           5000000,
           'complete',
           'drive-' || i,
           s.starts_at + interval '3 hours',
           s.starts_at + interval '2 hours'
    from generate_series(1, ${UPLOADS}) i
    join services s on s.n = i % s.total
    join uploaders u on u.region_id = s.region_id and u.n = i % u.total;
    analyze;
  `);

  const pick = async (sql: string) => (await db.admin<{ id: string }>(sql))[0].id;
  admin = await pick("select id from public.profiles where role = 'admin' limit 1");
  member = await pick(
    "select p.id from public.profiles p join public.region_members rm on rm.profile_id = p.id where p.role = 'member' limit 1",
  );
  viewer = await pick("select id from public.profiles where role = 'viewer' limit 1");
  const [{ count }] = await db.admin<{ count: number }>("select count(*)::int as count from public.uploads");
  seeded = `Seeded ${count} uploads in ${((Date.now() - started) / 1000).toFixed(1)}s`;
});

afterAll(async () => {
  // Also written to a file: test runners can hide output from passing tests.
  const lines = results.map((row) => `${row.query.padEnd(24)} ${row.who.padEnd(12)} ${Math.round(row.ms)} ms`);
  writeFileSync(join(process.cwd(), "tests/perf/last-run.txt"), `${seeded}\n${lines.join("\n")}\n`);
  await db?.close();
});

/** Median of a few runs, after one warm-up. */
async function time(query: string, who: string, userId: string, sql: string): Promise<number> {
  await db.as(userId, sql);
  const runs: number[] = [];
  for (let i = 0; i < 3; i++) {
    const start = performance.now();
    await db.as(userId, sql);
    runs.push(performance.now() - start);
  }
  const ms = runs.sort((a, b) => a - b)[1];
  results.push({ query, who, ms });
  return ms;
}

const QUERIES: Record<string, string> = {
  // The gallery's first page: newest 61 finished uploads with their service.
  "gallery page": `
    select u.id, u.file_name, u.mime_type, u.size_bytes, u.category_id, u.uploaded_by, s.name, s.starts_at
    from public.uploads u join public.services s on s.id = u.service_id
    where u.status = 'complete' order by u.completed_at desc limit 61`,
  "gallery, one category": `
    select u.id from public.uploads u
    where u.status = 'complete' and u.category_id = (select id from public.categories where slug = 'baptism')
    order by u.completed_at desc limit 61`,
  "home page charts": "select public.upload_analytics(now() - interval '8 weeks')",
  "services list": "select id, name, starts_at from public.services order by starts_at desc limit 200",
  "one service's uploads": `
    select category_id, uploaded_by from public.uploads
    where service_id = (select id from public.services order by starts_at desc limit 1)`,
  "handoffs": "select * from public.handoffs where received_at is null order by due_at limit 100",
  "people": "select id, full_name, email from public.profiles",
};

describe("the busiest pages, with two years of data", () => {
  for (const [query, sql] of Object.entries(QUERIES)) {
    it(query, async () => {
      for (const [who, id] of [
        ["member", member],
        ["viewer", viewer],
        ["super admin", admin],
      ] as const) {
        const ms = await time(query, who, id, sql);
        // Generous: this flags something gone badly wrong, not a slow laptop.
        expect(ms, `${query} as ${who}`).toBeLessThan(5_000);
      }
    });
  }
});
