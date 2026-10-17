// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "./harness";

let db: TestDatabase;
let member: string;
let link: string;

const alice = "11111111-1111-4111-8111-111111111111";
const bob = "22222222-2222-4222-8222-222222222222";

beforeAll(async () => {
  db = await createTestDatabase();
  member = await db.signUp("member@example.com", "member");
  [{ id: link }] = await db.admin<{ id: string }>(
    "insert into public.share_links (token, label) values ($1, 'Pastor James') returning id",
    ["t".repeat(43)],
  );
}, 60_000);

afterAll(async () => {
  await db.close();
});

const counts = async () =>
  (
    await db.admin<{ view_count: number; visitor_count: number; download_count: number }>(
      "select view_count, visitor_count, download_count from public.share_links where id = $1",
      [link],
    )
  )[0];

describe("counting who opened a share link", () => {
  it("counts a new visitor and their visit", async () => {
    await db.admin("select public.record_share_view($1, $2)", [link, alice]);
    expect(await counts()).toMatchObject({ view_count: 1, visitor_count: 1 });
  });

  it("does not count the same visitor refreshing straight away", async () => {
    await db.admin("select public.record_share_view($1, $2)", [link, alice]);
    await db.admin("select public.record_share_view($1, $2)", [link, alice]);
    expect(await counts()).toMatchObject({ view_count: 1, visitor_count: 1 });
  });

  it("counts the same visitor again after half an hour away", async () => {
    await db.admin(
      "update public.share_visitors set last_seen_at = now() - interval '31 minutes' where visitor_id = $1",
      [alice],
    );
    await db.admin("select public.record_share_view($1, $2)", [link, alice]);
    expect(await counts()).toMatchObject({ view_count: 2, visitor_count: 1 });
  });

  it("counts a second person separately", async () => {
    await db.admin("select public.record_share_view($1, $2)", [link, bob]);
    expect(await counts()).toMatchObject({ view_count: 3, visitor_count: 2 });
  });

  it("still counts visits from browsers without a visitor ID", async () => {
    await db.admin("select public.record_share_view($1, null)", [link]);
    expect(await counts()).toMatchObject({ view_count: 4, visitor_count: 2 });
  });

  it("counts downloads", async () => {
    await db.admin("select public.record_share_download($1)", [link]);
    await db.admin("select public.record_share_download($1)", [link]);
    expect((await counts()).download_count).toBe(2);
  });

  it("keeps visitors and the counting functions away from signed-in users", async () => {
    await expect(db.as(member, "select * from public.share_visitors")).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      db.as(member, "select public.record_share_view($1, $2)", [link, alice]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.as(member, "select public.record_share_download($1)", [link]),
    ).rejects.toThrow(/permission denied/);
  });
});
