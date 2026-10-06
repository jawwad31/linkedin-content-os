import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  asUser,
  createMigratedDb,
  seedCalendar,
  seedExperience,
  seedResource,
  seedWorkspace,
  type MigratedDb,
} from "./support/pg-harness";

type PlanResult = {
  ok: boolean;
  code?: string;
  plan_revision?: number;
  slot_count?: number;
  released?: number;
  unavailable?: { source_id: string; reason: string }[];
};

type CancelResult = { ok: boolean; code?: string; cancelled?: number; released?: number; preserved?: number };
type ReserveResult = { ok: boolean; code?: string; usage_id?: string };

let db: MigratedDb;

beforeAll(async () => {
  db = await createMigratedDb();
}, 180_000);

afterAll(async () => {
  await db.close();
});

type SlotInput = {
  bucket: "experience" | "asset" | "evergreen" | "news";
  requested_bucket?: string;
  shortage_reason?: string | null;
  source_id?: string | null;
  source_type?: "founder_experience" | "content_resource" | null;
};

const experienceSlot = (sourceId: string): SlotInput => ({
  bucket: "experience",
  source_id: sourceId,
  source_type: "founder_experience",
});

const evergreenSlot: SlotInput = { bucket: "evergreen" };
const newsSlot: SlotInput = { bucket: "news" };

async function commit(
  clientId: string,
  calendarId: string,
  slots: SlotInput[],
  replace = false,
): Promise<PlanResult> {
  const payload = slots.map((slot) => ({
    requested_bucket: slot.bucket,
    shortage_reason: null,
    source_id: null,
    source_type: null,
    ...slot,
  }));
  const result = await db.query<{ r: PlanResult }>(
    "select public.commit_calendar_plan($1, $2, $3::jsonb, $4) as r",
    [clientId, calendarId, JSON.stringify(payload), replace],
  );
  return result.rows[0].r;
}

async function reserve(clientId: string, sourceId: string): Promise<ReserveResult> {
  const result = await db.query<{ r: ReserveResult }>(
    "select public.reserve_content_bank_source($1, $2, 'founder_experience') as r",
    [clientId, sourceId],
  );
  return result.rows[0].r;
}

async function slotStatuses(calendarId: string): Promise<string[]> {
  const result = await db.query<{ status: string }>(
    "select status from public.calendar_slots where calendar_id = $1 order by slot_index, created_at",
    [calendarId],
  );
  return result.rows.map((row) => row.status);
}

async function usageStatuses(sourceId: string): Promise<string[]> {
  const result = await db.query<{ status: string }>(
    "select status from public.source_usage where source_id = $1 order by created_at",
    [sourceId],
  );
  return result.rows.map((row) => row.status);
}

describe("P05 migration chain", () => {
  it("applies every migration in order, including the calendar tables", async () => {
    const result = await db.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'public'
         and table_name in ('calendar_defaults', 'content_calendars', 'calendar_slots', 'source_usage')`,
    );
    expect(result.rows.map((row) => row.table_name).sort()).toEqual([
      "calendar_defaults",
      "calendar_slots",
      "content_calendars",
      "source_usage",
    ]);
  });
});

describe("calendar table constraints", () => {
  it("rejects shares that do not add up to 100", async () => {
    const ws = await seedWorkspace(db, "shares-sum");
    await expect(
      db.query(
        `insert into public.content_calendars
           (client_id, month, timezone, post_count, share_experience, share_asset,
            share_evergreen, share_news, news_cap_percent)
         values ($1, '2026-11-01', 'UTC', 10, 40, 10, 40, 5, 20)`,
        [ws.clientId],
      ),
    ).rejects.toThrow(/content_calendars_shares_sum_check/);
  });

  it("rejects a news share above the news cap", async () => {
    const ws = await seedWorkspace(db, "news-cap");
    await expect(
      db.query(
        `insert into public.content_calendars
           (client_id, month, timezone, post_count, share_experience, share_asset,
            share_evergreen, share_news, news_cap_percent)
         values ($1, '2026-11-01', 'UTC', 10, 40, 10, 30, 20, 10)`,
        [ws.clientId],
      ),
    ).rejects.toThrow(/content_calendars_news_cap_check/);
  });

  it("rejects negative counts, zero posts, and a mid-month date", async () => {
    const ws = await seedWorkspace(db, "bad-values");
    const insert = (month: string, postCount: number, experience: number, asset: number) =>
      db.query(
        `insert into public.content_calendars
           (client_id, month, timezone, post_count, share_experience, share_asset,
            share_evergreen, share_news, news_cap_percent)
         values ($1, $2, 'UTC', $3, $4, $5, 100 - $4 - $5, 0, 0)`,
        [ws.clientId, month, postCount, experience, asset],
      );

    await expect(insert("2026-11-01", 0, 50, 50)).rejects.toThrow(/post_count/);
    await expect(insert("2026-11-01", 10, -10, 50)).rejects.toThrow(/share_experience/);
    await expect(insert("2026-11-15", 10, 50, 50)).rejects.toThrow(/month_first_day/);
  });

  it("allows only one calendar per account and month", async () => {
    const ws = await seedWorkspace(db, "one-per-month");
    await seedCalendar(db, ws.clientId, "2026-11-01");
    await expect(seedCalendar(db, ws.clientId, "2026-11-01")).rejects.toThrow(
      /content_calendars_client_month_key/,
    );
  });
});

describe("commit_calendar_plan", () => {
  it("writes slots and reservations together and marks placeholders", async () => {
    const ws = await seedWorkspace(db, "commit-ok");
    const calendarId = await seedCalendar(db, ws.clientId, "2026-11-01", 4);
    const experienceId = await seedExperience(db, ws.clientId, "Migrated CRM");

    const result = await commit(ws.clientId, calendarId, [
      experienceSlot(experienceId),
      evergreenSlot,
      evergreenSlot,
      newsSlot,
    ]);

    expect(result).toMatchObject({ ok: true, plan_revision: 1, slot_count: 4 });
    expect(await slotStatuses(calendarId)).toEqual([
      "reserved",
      "planned",
      "planned",
      "placeholder",
    ]);
    expect(await usageStatuses(experienceId)).toEqual(["reserved"]);

    const usage = await db.query<{ channel: string }>(
      "select channel from public.source_usage where source_id = $1",
      [experienceId],
    );
    expect(usage.rows[0].channel).toBe("calendar_slot");
  });

  it("lets only one planner win a single-use entry and writes nothing for the loser", async () => {
    const ws = await seedWorkspace(db, "contention");
    const novemberId = await seedCalendar(db, ws.clientId, "2026-11-01", 3);
    const decemberId = await seedCalendar(db, ws.clientId, "2026-12-01", 3);
    const contested = await seedExperience(db, ws.clientId, "Contested story");
    const free = await seedExperience(db, ws.clientId, "Free story");

    const first = await commit(ws.clientId, novemberId, [experienceSlot(contested)]);
    expect(first.ok).toBe(true);

    const second = await commit(ws.clientId, decemberId, [
      experienceSlot(free),
      experienceSlot(contested),
      evergreenSlot,
    ]);

    expect(second.ok).toBe(false);
    expect(second.code).toBe("SOURCE_UNAVAILABLE");
    expect(second.unavailable).toEqual([
      { source_id: contested, reason: "SINGLE_USE_CONFLICT" },
    ]);

    // Atomic: the available entry in the losing request was not reserved either.
    expect(await slotStatuses(decemberId)).toEqual([]);
    expect(await usageStatuses(free)).toEqual([]);
    expect(await usageStatuses(contested)).toEqual(["reserved"]);
  });

  it("takes a transaction-scoped advisory lock on every selected entry", async () => {
    const ws = await seedWorkspace(db, "advisory-lock");
    const calendarId = await seedCalendar(db, ws.clientId, "2026-11-01", 3);
    const a = await seedExperience(db, ws.clientId, "Lock A");
    const b = await seedExperience(db, ws.clientId, "Lock B");

    const locksHeldInside = await db.transaction(async (tx) => {
      await tx.query("select public.commit_calendar_plan($1, $2, $3::jsonb, false)", [
        ws.clientId,
        calendarId,
        JSON.stringify([
          { bucket: "experience", requested_bucket: "experience", source_id: a, source_type: "founder_experience" },
          { bucket: "experience", requested_bucket: "experience", source_id: b, source_type: "founder_experience" },
        ]),
      ]);
      const locks = await tx.query<{ n: number }>(
        "select count(*)::int as n from pg_locks where locktype = 'advisory'",
      );
      return locks.rows[0].n;
    });

    const locksAfter = await db.query<{ n: number }>(
      "select count(*)::int as n from pg_locks where locktype = 'advisory'",
    );
    expect(locksHeldInside).toBeGreaterThanOrEqual(2);
    expect(locksAfter.rows[0].n).toBe(0);
  });

  it("blocks standalone reservation of an entry the calendar holds, and the reverse", async () => {
    const ws = await seedWorkspace(db, "calendar-vs-standalone");
    const calendarId = await seedCalendar(db, ws.clientId, "2026-11-01", 2);
    const heldByCalendar = await seedExperience(db, ws.clientId, "Held by calendar");
    const heldByStandalone = await seedExperience(db, ws.clientId, "Held by standalone");

    await commit(ws.clientId, calendarId, [experienceSlot(heldByCalendar)]);
    expect(await reserve(ws.clientId, heldByCalendar)).toMatchObject({
      ok: false,
      code: "SINGLE_USE_CONFLICT",
    });

    expect((await reserve(ws.clientId, heldByStandalone)).ok).toBe(true);
    const otherCalendar = await seedCalendar(db, ws.clientId, "2026-12-01", 2);
    const clash = await commit(ws.clientId, otherCalendar, [experienceSlot(heldByStandalone)]);
    expect(clash.code).toBe("SOURCE_UNAVAILABLE");
    expect(clash.unavailable?.[0].reason).toBe("SINGLE_USE_CONFLICT");
  });

  it("allows a reusable entry in a second calendar but never twice in one calendar", async () => {
    const ws = await seedWorkspace(db, "reuse");
    const novemberId = await seedCalendar(db, ws.clientId, "2026-11-01", 3);
    const decemberId = await seedCalendar(db, ws.clientId, "2026-12-01", 3);
    const reusable = await seedExperience(db, ws.clientId, "Reusable", { allowReuse: true });

    expect((await commit(ws.clientId, novemberId, [experienceSlot(reusable)])).ok).toBe(true);
    expect((await commit(ws.clientId, decemberId, [experienceSlot(reusable)])).ok).toBe(true);

    const duplicate = await commit(ws.clientId, decemberId, [
      experienceSlot(reusable),
      experienceSlot(reusable),
    ], true);
    expect(duplicate.code).toBe("DUPLICATE_SOURCE");
  });

  it("rejects archived, draft, missing, and other-account entries without partial writes", async () => {
    const ws = await seedWorkspace(db, "unavailable");
    const other = await seedWorkspace(db, "unavailable-other");
    const calendarId = await seedCalendar(db, ws.clientId, "2026-11-01", 5);

    const archived = await seedExperience(db, ws.clientId, "Archived", { readiness: "archived" });
    const draft = await seedExperience(db, ws.clientId, "Draft", { readiness: "draft" });
    const foreign = await seedExperience(db, other.clientId, "Other account");
    const missing = "00000000-0000-4000-8000-000000000000";
    const good = await seedExperience(db, ws.clientId, "Good");

    const result = await commit(ws.clientId, calendarId, [
      experienceSlot(good),
      experienceSlot(archived),
      experienceSlot(draft),
      experienceSlot(foreign),
      experienceSlot(missing),
    ]);

    expect(result.code).toBe("SOURCE_UNAVAILABLE");
    expect(result.unavailable?.map((entry) => entry.source_id).sort()).toEqual(
      [archived, draft, foreign, missing].sort(),
    );
    expect(await slotStatuses(calendarId)).toEqual([]);
    expect(await usageStatuses(good)).toEqual([]);
  });

  it("rejects mismatched bucket/source pairs and oversized plans", async () => {
    const ws = await seedWorkspace(db, "validation");
    const calendarId = await seedCalendar(db, ws.clientId, "2026-11-01", 2);
    const experienceId = await seedExperience(db, ws.clientId, "Story");

    const wrongPair = await commit(ws.clientId, calendarId, [
      { bucket: "asset", source_id: experienceId, source_type: "founder_experience" },
    ]);
    expect(wrongPair.code).toBe("VALIDATION_ERROR");

    const sourceOnEvergreen = await commit(ws.clientId, calendarId, [
      { bucket: "evergreen", source_id: experienceId, source_type: "founder_experience" },
    ]);
    expect(sourceOnEvergreen.code).toBe("VALIDATION_ERROR");

    const tooMany = await commit(ws.clientId, calendarId, [evergreenSlot, evergreenSlot, evergreenSlot]);
    expect(tooMany.code).toBe("TOO_MANY_SLOTS");
  });

  it("refuses to overwrite an existing plan unless replace is requested", async () => {
    const ws = await seedWorkspace(db, "plan-exists");
    const calendarId = await seedCalendar(db, ws.clientId, "2026-11-01", 2);

    expect((await commit(ws.clientId, calendarId, [evergreenSlot, evergreenSlot])).ok).toBe(true);
    const repeat = await commit(ws.clientId, calendarId, [evergreenSlot, evergreenSlot]);
    expect(repeat.code).toBe("PLAN_EXISTS");
    expect(await slotStatuses(calendarId)).toEqual(["planned", "planned"]);
  });

  it("replans eligible slots, re-allows the same entry, and preserves slots with posts", async () => {
    const ws = await seedWorkspace(db, "replan");
    const calendarId = await seedCalendar(db, ws.clientId, "2026-11-01", 3);
    const kept = await seedExperience(db, ws.clientId, "Already drafted");
    const replanned = await seedExperience(db, ws.clientId, "Will be replanned");

    await commit(ws.clientId, calendarId, [
      experienceSlot(kept),
      experienceSlot(replanned),
      evergreenSlot,
    ]);

    // Slot 1 now carries a post (as P06/assignment will do); it must be preserved.
    const postId = (
      await db.query<{ id: string }>(
        "insert into public.posts (client_id, final_post, status) values ($1, 'Draft body', 'approved') returning id",
        [ws.clientId],
      )
    ).rows[0].id;
    await db.query(
      "update public.calendar_slots set post_id = $1 where calendar_id = $2 and source_id = $3",
      [postId, calendarId, kept],
    );

    // Replan the two eligible slots; the replanned entry can be selected again.
    const result = await commit(
      ws.clientId,
      calendarId,
      [experienceSlot(replanned), newsSlot],
      true,
    );
    expect(result).toMatchObject({ ok: true, plan_revision: 2, slot_count: 2, released: 2 });

    const slots = await db.query<{ slot_index: number; status: string; post_id: string | null; source_id: string | null }>(
      "select slot_index, status, post_id, source_id from public.calendar_slots where calendar_id = $1 and status <> 'cancelled' order by slot_index",
      [calendarId],
    );
    expect(slots.rows).toEqual([
      { slot_index: 1, status: "reserved", post_id: postId, source_id: kept },
      { slot_index: 2, status: "reserved", post_id: null, source_id: replanned },
      { slot_index: 3, status: "placeholder", post_id: null, source_id: null },
    ]);

    // The preserved slot's entry cannot be planned again in this calendar.
    const clash = await commit(ws.clientId, calendarId, [experienceSlot(kept)], true);
    expect(clash.unavailable?.[0].reason).toBe("ALREADY_IN_CALENDAR");

    // History is retained: the first plan's reservation was cancelled, not erased.
    expect(await usageStatuses(replanned)).toEqual(["cancelled", "reserved"]);
    expect(await usageStatuses(kept)).toEqual(["reserved"]);
  });
});

describe("cancel_calendar_slots", () => {
  it("releases reservations so the entry becomes available again", async () => {
    const ws = await seedWorkspace(db, "cancel");
    const calendarId = await seedCalendar(db, ws.clientId, "2026-11-01", 2);
    const experienceId = await seedExperience(db, ws.clientId, "Cancel me");

    await commit(ws.clientId, calendarId, [experienceSlot(experienceId), newsSlot]);
    expect((await reserve(ws.clientId, experienceId)).code).toBe("SINGLE_USE_CONFLICT");

    const result = (
      await db.query<{ r: CancelResult }>("select public.cancel_calendar_slots($1, $2) as r", [
        ws.clientId,
        calendarId,
      ])
    ).rows[0].r;

    expect(result).toEqual({ ok: true, cancelled: 2, released: 1, preserved: 0 });
    expect(await slotStatuses(calendarId)).toEqual(["cancelled", "cancelled"]);
    expect(await usageStatuses(experienceId)).toEqual(["cancelled"]);
    expect((await reserve(ws.clientId, experienceId)).ok).toBe(true);
  });

  it("cancels only the requested slots and never touches slots with posts", async () => {
    const ws = await seedWorkspace(db, "cancel-partial");
    const calendarId = await seedCalendar(db, ws.clientId, "2026-11-01", 3);
    const drafted = await seedExperience(db, ws.clientId, "Drafted");
    const planned = await seedExperience(db, ws.clientId, "Planned only");

    await commit(ws.clientId, calendarId, [experienceSlot(drafted), experienceSlot(planned), evergreenSlot]);
    const postId = (
      await db.query<{ id: string }>(
        "insert into public.posts (client_id, final_post) values ($1, 'Body') returning id",
        [ws.clientId],
      )
    ).rows[0].id;
    await db.query("update public.calendar_slots set post_id = $1 where calendar_id = $2 and source_id = $3", [
      postId,
      calendarId,
      drafted,
    ]);

    const ids = (
      await db.query<{ id: string }>(
        "select id from public.calendar_slots where calendar_id = $1 and source_id in ($2, $3)",
        [calendarId, drafted, planned],
      )
    ).rows.map((row) => row.id);

    const result = (
      await db.query<{ r: CancelResult }>(
        "select public.cancel_calendar_slots($1, $2, $3::uuid[]) as r",
        [ws.clientId, calendarId, ids],
      )
    ).rows[0].r;

    expect(result).toEqual({ ok: true, cancelled: 1, released: 1, preserved: 1 });
    expect(await usageStatuses(drafted)).toEqual(["reserved"]);
    expect(await usageStatuses(planned)).toEqual(["cancelled"]);
  });

  it("cannot reach a calendar belonging to another account", async () => {
    const ws = await seedWorkspace(db, "cancel-scope-a");
    const other = await seedWorkspace(db, "cancel-scope-b");
    const calendarId = await seedCalendar(db, other.clientId, "2026-11-01", 2);

    const result = (
      await db.query<{ r: CancelResult }>("select public.cancel_calendar_slots($1, $2) as r", [
        ws.clientId,
        calendarId,
      ])
    ).rows[0].r;
    expect(result).toEqual({ ok: false, code: "NOT_FOUND" });
  });
});

describe("row level security", () => {
  it("lets ideas_manage and admin plan, but not a drafter or another account", async () => {
    const ws = await seedWorkspace(db, "rls-plan");
    const outsider = await seedWorkspace(db, "rls-outsider");
    const calendarId = await seedCalendar(db, ws.clientId, "2026-11-01", 2);

    const planAs = (userId: string, clientId = ws.clientId) =>
      asUser(db, userId, () => commit(clientId, calendarId, [evergreenSlot, evergreenSlot]));

    expect((await planAs(ws.drafterId)).code).toBe("NOT_FOUND");
    expect((await planAs(outsider.adminId)).code).toBe("NOT_FOUND");
    expect(await slotStatuses(calendarId)).toEqual([]);

    expect((await planAs(ws.plannerId)).ok).toBe(true);
  });

  it("lets admins write defaults but not Account Users", async () => {
    const ws = await seedWorkspace(db, "rls-defaults");
    const insertDefaults = () =>
      db.query(
        `insert into public.calendar_defaults
           (client_id, timezone, post_count, share_experience, share_asset,
            share_evergreen, share_news, news_cap_percent)
         values ($1, 'UTC', 12, 40, 10, 40, 10, 20)`,
        [ws.clientId],
      );

    await expect(asUser(db, ws.plannerId, insertDefaults)).rejects.toThrow(/row-level security/);
    await expect(asUser(db, ws.drafterId, insertDefaults)).rejects.toThrow(/row-level security/);
    await asUser(db, ws.adminId, insertDefaults);

    const visible = await asUser(db, ws.plannerId, () =>
      db.query("select version from public.calendar_defaults where client_id = $1", [ws.clientId]),
    );
    expect(visible.rows).toEqual([{ version: 1 }]);
  });

  it("hides another account's calendars and slots", async () => {
    const ws = await seedWorkspace(db, "rls-read-a");
    const other = await seedWorkspace(db, "rls-read-b");
    const calendarId = await seedCalendar(db, ws.clientId, "2026-11-01", 2);
    await commit(ws.clientId, calendarId, [evergreenSlot]);

    const seen = await asUser(db, other.adminId, async () => ({
      calendars: (await db.query("select id from public.content_calendars where id = $1", [calendarId])).rows,
      slots: (await db.query("select id from public.calendar_slots where calendar_id = $1", [calendarId])).rows,
    }));
    expect(seen).toEqual({ calendars: [], slots: [] });
  });

  it("blocks deleting a post that a calendar slot references", async () => {
    const ws = await seedWorkspace(db, "post-dependency");
    const calendarId = await seedCalendar(db, ws.clientId, "2026-11-01", 1);
    await commit(ws.clientId, calendarId, [evergreenSlot]);
    const postId = (
      await db.query<{ id: string }>(
        "insert into public.posts (client_id, final_post) values ($1, 'Body') returning id",
        [ws.clientId],
      )
    ).rows[0].id;
    await db.query("update public.calendar_slots set post_id = $1 where calendar_id = $2", [postId, calendarId]);

    await expect(db.query("delete from public.posts where id = $1", [postId])).rejects.toMatchObject({
      code: "23503",
    });
  });
});

describe("reserve_content_bank_source", () => {
  it("returns the same safe codes as the previous application check", async () => {
    const ws = await seedWorkspace(db, "reserve-codes");
    const archived = await seedExperience(db, ws.clientId, "Archived", { readiness: "archived" });
    const reusable = await seedExperience(db, ws.clientId, "Reusable", { allowReuse: true });
    const resource = await seedResource(db, ws.clientId, "Checklist");

    expect(await reserve(ws.clientId, "00000000-0000-4000-8000-000000000000")).toMatchObject({
      code: "NOT_FOUND",
    });
    expect(await reserve(ws.clientId, archived)).toMatchObject({ code: "ARCHIVED_ENTRY" });

    expect((await reserve(ws.clientId, reusable)).ok).toBe(true);
    expect((await reserve(ws.clientId, reusable)).ok).toBe(true);

    const asResource = (
      await db.query<{ r: ReserveResult }>(
        "select public.reserve_content_bank_source($1, $2, 'content_resource') as r",
        [ws.clientId, resource],
      )
    ).rows[0].r;
    expect(asResource.ok).toBe(true);

    const second = (
      await db.query<{ r: ReserveResult }>(
        "select public.reserve_content_bank_source($1, $2, 'content_resource') as r",
        [ws.clientId, resource],
      )
    ).rows[0].r;
    expect(second.code).toBe("SINGLE_USE_CONFLICT");
  });
});
