// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "./harness";

let db: TestDatabase;
let main: string;
let oc: string;
let admin: string;
let mainMember: string;
let ocMember: string;
let ocAdmin: string;
let ocViewer: string;
let mainService: string;
let ocService: string;
let preacher: string;

/** Signs someone up straight into a region, as an invite with a region does. */
async function signUpIn(
  email: string,
  role: "admin" | "member" | "viewer",
  regionId: string,
  regionAdmin = false,
  teamId: string | null = null,
): Promise<string> {
  await db.admin(
    "insert into public.invites (email, role, team_id, region_ids, region_admin_ids) values ($1, $2, $3, $4, $5)",
    [email, role, teamId, [regionId], regionAdmin ? [regionId] : []],
  );
  const [user] = await db.admin<{ id: string }>(
    "insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id",
    [email, JSON.stringify({ full_name: email.split("@")[0] })],
  );
  return user.id;
}

const visibleServices = async (who: string) =>
  (await db.as<{ id: string }>(who, "select id from public.services order by name")).map(
    (row) => row.id,
  );

beforeAll(async () => {
  db = await createTestDatabase();
  // Made while there was one region: lands in "Main" by default.
  admin = await db.signUp("admin@example.com", "admin");
  mainMember = await db.signUp("main.member@example.com", "member");
  [{ id: main }] = await db.admin<{ id: string }>("select id from public.regions where name = 'Main'");
  [{ id: oc }] = await db.as<{ id: string }>(
    admin,
    "insert into public.regions (name) values ('OC') returning id",
  );

  const [{ id: thumbnails }] = await db.admin<{ id: string }>(
    "insert into public.teams (name) values ('Thumbnails') returning id",
  );
  [{ id: preacher }] = await db.admin<{ id: string }>(
    "select id from public.categories where slug = 'preacher'",
  );
  await db.admin("insert into public.category_teams (category_id, team_id) values ($1, $2)", [
    preacher,
    thumbnails,
  ]);

  ocMember = await signUpIn("oc.member@example.com", "member", oc);
  ocAdmin = await signUpIn("oc.admin@example.com", "member", oc, true);
  ocViewer = await signUpIn("oc.viewer@example.com", "viewer", oc, false, thumbnails);

  [{ id: mainService }] = await db.admin<{ id: string }>(
    "insert into public.services (name, starts_at, region_id) values ('A Main service', now(), $1) returning id",
    [main],
  );
  [{ id: ocService }] = await db.admin<{ id: string }>(
    "insert into public.services (name, starts_at, region_id) values ('B OC service', now(), $1) returning id",
    [oc],
  );
  for (const [service, by] of [
    [mainService, mainMember],
    [ocService, ocMember],
  ]) {
    await db.admin(
      `insert into public.uploads (service_id, category_id, uploaded_by, file_name, mime_type, size_bytes, status, drive_file_id, completed_at)
       values ($1, $2, $3, 'a.jpg', 'image/jpeg', 10, 'complete', $4, now())`,
      [service, preacher, by, `drive-${service}`],
    );
  }
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("who sees what", () => {
  it("puts everything that existed before regions into Main", async () => {
    const [row] = await db.admin<{ region_id: string }>(
      "select region_id from public.region_members where profile_id = $1",
      [mainMember],
    );
    expect(row.region_id).toBe(main);
  });

  it("shows members only their own region's services", async () => {
    expect(await visibleServices(mainMember)).toEqual([mainService]);
    expect(await visibleServices(ocMember)).toEqual([ocService]);
  });

  it("shows overall admins every region", async () => {
    expect(await visibleServices(admin)).toEqual([mainService, ocService]);
  });

  it("shows members only their own region's uploads", async () => {
    const uploads = await db.as<{ service_id: string }>(ocMember, "select service_id from public.uploads");
    expect(uploads.map((row) => row.service_id)).toEqual([ocService]);
  });

  it("shows a viewer their team's category only in their region", async () => {
    const uploads = await db.as<{ service_id: string }>(ocViewer, "select service_id from public.uploads");
    expect(uploads.map((row) => row.service_id)).toEqual([ocService]);
    const handoffs = await db.as<{ service_id: string }>(ocViewer, "select service_id from public.handoffs");
    expect(handoffs.map((row) => row.service_id)).toEqual([ocService]);
  });

  it("lets someone in two regions see both", async () => {
    await db.as(admin, "insert into public.region_members (region_id, profile_id) values ($1, $2)", [
      oc,
      mainMember,
    ]);
    expect(await visibleServices(mainMember)).toEqual([mainService, ocService]);
    await db.as(admin, "delete from public.region_members where region_id = $1 and profile_id = $2", [
      oc,
      mainMember,
    ]);
  });
});

describe("uploading", () => {
  const start = (service: string, by: string) =>
    db.as(
      by,
      "insert into public.uploads (service_id, category_id, uploaded_by, file_name, mime_type, size_bytes) values ($1, $2, $3, 'b.jpg', 'image/jpeg', 10)",
      [service, preacher, by],
    );

  it("lets a member upload to their own region", async () => {
    await expect(start(ocService, ocMember)).resolves.toBeDefined();
  });

  it("stops a member uploading to another region", async () => {
    await expect(start(mainService, ocMember)).rejects.toThrow(/row-level security/);
  });
});

describe("region admins", () => {
  it("can create and change services in their region", async () => {
    await db.as(ocAdmin, "insert into public.services (name, starts_at, region_id) values ('OC Youth', now(), $1)", [oc]);
    const changed = await db.as(
      ocAdmin,
      "update public.services set name = 'OC Sunday' where id = $1 returning id",
      [ocService],
    );
    expect(changed).toHaveLength(1);
  });

  it("cannot create or change services in another region", async () => {
    await expect(
      db.as(ocAdmin, "insert into public.services (name, starts_at, region_id) values ('Sneaky', now(), $1)", [main]),
    ).rejects.toThrow(/row-level security/);
    const changed = await db.as(
      ocAdmin,
      "update public.services set name = 'Renamed' where id = $1 returning id",
      [mainService],
    );
    expect(changed).toHaveLength(0);
  });

  it("can add people to their region but not make region admins", async () => {
    await db.as(ocAdmin, "insert into public.region_members (region_id, profile_id) values ($1, $2)", [
      oc,
      mainMember,
    ]);
    await expect(
      db.as(ocAdmin, "update public.region_members set is_region_admin = true where region_id = $1 and profile_id = $2", [
        oc,
        mainMember,
      ]),
    ).rejects.toThrow(/row-level security/);
    await db.as(ocAdmin, "delete from public.region_members where region_id = $1 and profile_id = $2", [
      oc,
      mainMember,
    ]);
  });

  it("cannot add people to another region", async () => {
    await expect(
      db.as(ocAdmin, "insert into public.region_members (region_id, profile_id) values ($1, $2)", [main, ocMember]),
    ).rejects.toThrow(/row-level security/);
  });

  it("can invite members to their region, but not admins or region admins", async () => {
    await db.as(ocAdmin, "insert into public.invites (email, role, region_ids) values ('new@example.com', 'member', $1)", [[oc]]);
    await expect(
      db.as(ocAdmin, "insert into public.invites (email, role, region_ids) values ('boss@example.com', 'admin', $1)", [[oc]]),
    ).rejects.toThrow(/row-level security/);
    await expect(
      db.as(
        ocAdmin,
        "insert into public.invites (email, role, region_ids, region_admin_ids) values ('lead@example.com', 'member', $1, $1)",
        [[oc]],
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      db.as(ocAdmin, "insert into public.invites (email, role, region_ids) values ('far@example.com', 'member', $1)", [[main]]),
    ).rejects.toThrow(/row-level security/);
    // Every region on the invite must be one they run.
    await expect(
      db.as(ocAdmin, "insert into public.invites (email, role, region_ids) values ('both@example.com', 'member', $1)", [[oc, main]]),
    ).rejects.toThrow(/row-level security/);
    // And it must say which region.
    await expect(
      db.as(ocAdmin, "insert into public.invites (email, role, region_ids) values ('none@example.com', 'member', '{}')"),
    ).rejects.toThrow(/row-level security/);
  });

  it("can share their own region, but not every region or another one's service", async () => {
    await db.as(
      ocAdmin,
      "insert into public.share_links (token, label, region_id) values ($1, 'Pastor', $2)",
      ["o".repeat(43), oc],
    );
    await expect(
      db.as(ocAdmin, "insert into public.share_links (token, label) values ($1, 'Everything')", ["e".repeat(43)]),
    ).rejects.toThrow(/row-level security/);
    await expect(
      db.as(
        ocAdmin,
        "insert into public.share_links (token, label, region_id, service_id) values ($1, 'Wrong', $2, $3)",
        ["w".repeat(43), oc, mainService],
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("cannot add, rename or read the private parts of regions", async () => {
    await expect(db.as(ocAdmin, "insert into public.regions (name) values ('Rogue')")).rejects.toThrow(
      /row-level security/,
    );
    await expect(db.as(ocAdmin, "select telegram_chat_id from public.regions")).rejects.toThrow(
      /permission denied/,
    );
  });

  it("a plain member cannot manage their region", async () => {
    await expect(
      db.as(ocMember, "insert into public.services (name, starts_at, region_id) values ('Nope', now(), $1)", [oc]),
    ).rejects.toThrow(/row-level security/);
  });
});

describe("inviting into several regions", () => {
  it("puts the new person in every region on the invite, running the ones chosen", async () => {
    await db.as(
      admin,
      "insert into public.invites (email, role, region_ids, region_admin_ids) values ('two@example.com', 'member', $1, $2)",
      [[main, oc], [oc]],
    );
    const [{ id }] = await db.admin<{ id: string }>(
      "insert into auth.users (email, raw_user_meta_data) values ('two@example.com', '{}') returning id",
    );
    const places = await db.admin<{ region_id: string; is_region_admin: boolean }>(
      "select region_id, is_region_admin from public.region_members where profile_id = $1 order by is_region_admin",
      [id],
    );
    expect(places).toEqual([
      { region_id: main, is_region_admin: false },
      { region_id: oc, is_region_admin: true },
    ]);
  });

  it("never makes a viewer a region admin", async () => {
    await db.as(
      admin,
      "insert into public.invites (email, role, region_ids, region_admin_ids) values ('viewer2@example.com', 'viewer', $1, $1)",
      [[oc]],
    );
    const [{ id }] = await db.admin<{ id: string }>(
      "insert into auth.users (email, raw_user_meta_data) values ('viewer2@example.com', '{}') returning id",
    );
    const [place] = await db.admin<{ is_region_admin: boolean }>(
      "select is_region_admin from public.region_members where profile_id = $1",
      [id],
    );
    expect(place.is_region_admin).toBe(false);
  });

  it("still lets someone sign in if a region on their invite no longer exists", async () => {
    await db.admin(
      "insert into public.invites (email, role, region_ids) values ('stale@example.com', 'member', $1)",
      [[oc, "00000000-0000-4000-8000-000000000000"]],
    );
    await expect(
      db.admin("insert into auth.users (email, raw_user_meta_data) values ('stale@example.com', '{}')"),
    ).resolves.toBeDefined();
  });
});

describe("the server's own account", () => {
  it("can fill in the default region (scheduled jobs and the secret key use it)", async () => {
    await expect(
      db.exec(
        "set role service_role; select private.only_region(), private.only_region_list(); reset role;",
      ),
    ).resolves.toBeUndefined();
  });
});

describe("with more than one region", () => {
  it("requires a region for a new service", async () => {
    await expect(
      db.as(admin, "insert into public.services (name, starts_at) values ('Which one?', now())"),
    ).rejects.toThrow(/null value in column "region_id"/);
  });

  it("does not let anyone see another region's Google account", async () => {
    await expect(db.as(admin, "select * from public.region_google_connections")).rejects.toThrow(
      /permission denied/,
    );
  });
});
