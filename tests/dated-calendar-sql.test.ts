import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  asUser,
  createMigratedDb,
  seedExperience,
  seedResource,
  seedWorkspace as seedBaseWorkspace,
  type MigratedDb,
} from "./support/pg-harness";

type Result = {
  ok: boolean;
  code?: string;
  reason?: string;
  slot_id?: string;
  usage_id?: string;
  calendar_id?: string;
  plan_revision?: number;
  scheduled_date?: string;
  posts_on_day?: number;
  posts?: { slot_id: string; title: string; status: string }[];
  dates?: { date: string; incoming: number; posts: { title: string }[] }[];
  moved?: number;
  slot_ids?: string[];
  current_plan_revision?: number;
};

let db: MigratedDb;
/** The functions authorise through auth.uid(), so every call runs as a real user. */
const adminOf = new Map<string, string>();
async function seedWorkspace(database: MigratedDb, label: string) {
  const workspace = await seedBaseWorkspace(database, label);
  adminOf.set(workspace.clientId, workspace.adminId);
  return workspace;
}
let today: string;
let tomorrowOrToday: string;
let yesterday: string;
let nextMonth: (day: number) => string;
let monthAfterNext: string;

beforeAll(async () => {
  db = await createMigratedDb();
  const dates = await db.query<{
    today: string;
    yesterday: string;
    next_month_start: string;
    after_next: string;
  }>(
    // UTC explicitly: the functions use the account timezone (UTC when none is saved),
    // and the machine running the tests may already be on the next local day.
    `select (now() at time zone 'UTC')::date::text as today,
            ((now() at time zone 'UTC')::date - 1)::text as yesterday,
            (date_trunc('month', now() at time zone 'UTC') + interval '1 month')::date::text as next_month_start,
            (date_trunc('month', now() at time zone 'UTC') + interval '2 months' + interval '4 days')::date::text as after_next`,
  );
  today = dates.rows[0].today;
  tomorrowOrToday = today;
  yesterday = dates.rows[0].yesterday;
  const start = dates.rows[0].next_month_start;
  nextMonth = (day: number) => `${start.slice(0, 8)}${String(day).padStart(2, "0")}`;
  monthAfterNext = dates.rows[0].after_next;
}, 180_000);

afterAll(async () => {
  await db.close();
});

async function add(
  clientId: string,
  sourceId: string,
  date: string,
  allowSameDay = false,
  sourceType = "founder_experience",
  userId = adminOf.get(clientId)!,
): Promise<Result> {
  return asUser(db, userId, async () => {
    const result = await db.query<{ r: Result }>(
      "select public.add_calendar_entry($1, $2, $3, $4::date, $5) as r",
      [clientId, sourceId, sourceType, date, allowSameDay],
    );
    return result.rows[0].r;
  });
}

async function move(
  clientId: string,
  calendarId: string,
  moves: { slot_id: string; date: string }[],
  revision: number | null,
  allowSameDay = false,
  userId = adminOf.get(clientId)!,
): Promise<Result> {
  return asUser(db, userId, async () => {
    const result = await db.query<{ r: Result }>(
      "select public.move_calendar_slots($1, $2, $3::jsonb, $4, $5::integer) as r",
      [clientId, calendarId, JSON.stringify(moves), allowSameDay, revision],
    );
    return result.rows[0].r;
  });
}

async function activeSlots(calendarId: string) {
  const rows = await db.query<{ status: string; scheduled_date: string | null; source_id: string | null }>(
    `select status, scheduled_date::text, source_id from public.calendar_slots
     where calendar_id = $1 and status <> 'cancelled' order by slot_index`,
    [calendarId],
  );
  return rows.rows;
}

async function usage(sourceId: string) {
  const rows = await db.query<{ status: string; channel: string }>(
    "select status, channel from public.source_usage where source_id = $1 order by created_at",
    [sourceId],
  );
  return rows.rows;
}

describe("add_calendar_entry", () => {
  it("reserves an entry on a date, creating the month with its slot and reservation", async () => {
    const ws = await seedWorkspace(db, "add-ok");
    const entry = await seedExperience(db, ws.clientId, "Rebuilt onboarding");

    const result = await add(ws.clientId, entry, nextMonth(20));

    expect(result).toMatchObject({ ok: true, plan_revision: 1, scheduled_date: nextMonth(20), posts_on_day: 1 });
    expect(await activeSlots(result.calendar_id!)).toEqual([
      { status: "reserved", scheduled_date: nextMonth(20), source_id: entry },
    ]);
    expect(await usage(entry)).toEqual([{ status: "reserved", channel: "calendar_slot" }]);
  });

  it("uses the account defaults for a new month when they exist, and leaves them untouched", async () => {
    const ws = await seedWorkspace(db, "add-defaults");
    await db.query(
      `insert into public.calendar_defaults
         (client_id, timezone, post_count, share_experience, share_asset, share_evergreen, share_news, news_cap_percent)
       values ($1, 'UTC', 12, 40, 10, 40, 10, 20)`,
      [ws.clientId],
    );
    const entry = await seedExperience(db, ws.clientId, "With defaults");

    const result = await add(ws.clientId, entry, nextMonth(8));
    expect(result.ok).toBe(true);

    const calendar = await db.query<{ post_count: number; defaults_version: number }>(
      "select post_count, defaults_version from public.content_calendars where id = $1",
      [result.calendar_id],
    );
    expect(calendar.rows[0]).toEqual({ post_count: 12, defaults_version: 1 });
    const defaults = await db.query<{ version: number }>(
      "select version from public.calendar_defaults where client_id = $1",
      [ws.clientId],
    );
    expect(defaults.rows[0].version).toBe(1);
  });

  it("works for a Content Resource and reserves it as an asset", async () => {
    const ws = await seedWorkspace(db, "add-resource");
    const resource = await seedResource(db, ws.clientId, "Proposal checklist");

    const result = await add(ws.clientId, resource, nextMonth(9), false, "content_resource");
    expect(result.ok).toBe(true);

    const slot = await db.query<{ bucket: string; source_type: string }>(
      "select bucket, source_type from public.calendar_slots where id = $1",
      [result.slot_id],
    );
    expect(slot.rows[0]).toEqual({ bucket: "asset", source_type: "content_resource" });
  });

  it("allows today, but never a past date or a month beyond next", async () => {
    const ws = await seedWorkspace(db, "add-range");
    const entry = await seedExperience(db, ws.clientId, "Range", { allowReuse: true });

    expect((await add(ws.clientId, entry, yesterday)).code).toBe("DATE_IN_PAST");
    expect((await add(ws.clientId, entry, monthAfterNext)).code).toBe("DATE_OUT_OF_RANGE");
    expect((await add(ws.clientId, entry, tomorrowOrToday)).ok).toBe(true);
  });

  it("asks before adding a second post to a day, then allows any number", async () => {
    const ws = await seedWorkspace(db, "add-same-day");
    const first = await seedExperience(db, ws.clientId, "First on the day");
    const second = await seedExperience(db, ws.clientId, "Second on the day");
    const third = await seedExperience(db, ws.clientId, "Third on the day");
    const date = nextMonth(12);

    const one = await add(ws.clientId, first, date);
    expect(one.ok).toBe(true);

    const asked = await add(ws.clientId, second, date);
    expect(asked).toMatchObject({ ok: false, code: "DATE_HAS_POSTS" });
    expect(asked.posts?.map((post) => post.title)).toEqual(["First on the day"]);
    // Asking changes nothing: no slot and no reservation for the second entry.
    expect(await usage(second)).toEqual([]);

    expect(await add(ws.clientId, second, date, true)).toMatchObject({ ok: true, posts_on_day: 2 });
    expect(await add(ws.clientId, third, date, true)).toMatchObject({ ok: true, posts_on_day: 3 });
    expect((await activeSlots(one.calendar_id!)).map((slot) => slot.scheduled_date)).toEqual([date, date, date]);
  });

  it("refuses an entry already in that month, a held single-use entry, and an unready or foreign entry", async () => {
    const ws = await seedWorkspace(db, "add-unavailable");
    const other = await seedWorkspace(db, "add-unavailable-other");
    const single = await seedExperience(db, ws.clientId, "Single use");
    const draft = await seedExperience(db, ws.clientId, "Still a draft", { readiness: "draft" });
    const foreign = await seedExperience(db, other.clientId, "Someone else's");
    const reusable = await seedExperience(db, ws.clientId, "Reusable", { allowReuse: true });

    expect((await add(ws.clientId, single, nextMonth(3))).ok).toBe(true);
    // Same month: already there. A different month: the single-use entry is held.
    expect(await add(ws.clientId, single, nextMonth(4), true)).toMatchObject({
      code: "SOURCE_UNAVAILABLE", reason: "ALREADY_IN_CALENDAR",
    });
    expect(await add(ws.clientId, single, tomorrowOrToday, true)).toMatchObject({
      code: "SOURCE_UNAVAILABLE", reason: "SINGLE_USE_CONFLICT",
    });
    expect(await add(ws.clientId, draft, nextMonth(5))).toMatchObject({ reason: "NOT_AVAILABLE" });
    expect(await add(ws.clientId, foreign, nextMonth(5))).toMatchObject({ reason: "NOT_AVAILABLE" });

    expect((await add(ws.clientId, reusable, nextMonth(6))).ok).toBe(true);
    expect(await add(ws.clientId, reusable, nextMonth(7))).toMatchObject({ reason: "ALREADY_IN_CALENDAR" });
  });

  it("keeps a reusable entry available for a different month", async () => {
    const ws = await seedWorkspace(db, "add-reuse-month");
    const reusable = await seedExperience(db, ws.clientId, "Reusable twice", { allowReuse: true });

    expect((await add(ws.clientId, reusable, nextMonth(2))).ok).toBe(true);
    expect((await add(ws.clientId, reusable, tomorrowOrToday)).ok).toBe(true);
  });

  it("enforces the ideas_manage capability and account scope", async () => {
    const ws = await seedWorkspace(db, "add-perms");
    const outsider = await seedWorkspace(db, "add-perms-outsider");
    const entry = await seedExperience(db, ws.clientId, "Permissions", { allowReuse: true });

    const as = (userId: string, clientId = ws.clientId) =>
      add(clientId, entry, nextMonth(14), true, "founder_experience", userId);

    expect((await as(ws.drafterId)).code).toBe("FORBIDDEN");
    expect((await as(outsider.adminId)).code).toBe("FORBIDDEN");
    expect((await as(ws.plannerId)).ok).toBe(true);
    // An admin is allowed to ask; the entry is simply already in that month.
    expect((await as(ws.adminId)).code).toBe("SOURCE_UNAVAILABLE");
  });

  it("rejects null or malformed arguments without writing anything", async () => {
    const ws = await seedWorkspace(db, "add-validation");
    const entry = await seedExperience(db, ws.clientId, "Validation");
    const bad = await add(ws.clientId, entry, nextMonth(3), false, "podcast");
    expect(bad.code).toBe("VALIDATION_ERROR");
    const nulled = await asUser(db, ws.adminId, () =>
      db.query<{ r: Result }>(
        "select public.add_calendar_entry($1, $2, 'founder_experience', null, false) as r",
        [ws.clientId, entry],
      ),
    );
    expect(nulled.rows[0].r.code).toBe("VALIDATION_ERROR");
    expect(await usage(entry)).toEqual([]);
  });
});

describe("move_calendar_slots", () => {
  async function month(label: string, count = 3) {
    const ws = await seedWorkspace(db, label);
    const entries: string[] = [];
    let calendarId = "";
    const slotIds: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const id = await seedExperience(db, ws.clientId, `Entry ${i + 1}`);
      entries.push(id);
      const added = await add(ws.clientId, id, nextMonth(10 + i));
      calendarId = added.calendar_id!;
      slotIds.push(added.slot_id!);
    }
    const revision = (
      await db.query<{ plan_revision: number }>(
        "select plan_revision from public.content_calendars where id = $1",
        [calendarId],
      )
    ).rows[0].plan_revision;
    return { ws, entries, calendarId, slotIds, revision };
  }

  it("moves several reserved entries at once and advances the revision once", async () => {
    const m = await month("move-ok");
    const result = await move(
      m.ws.clientId, m.calendarId,
      [{ slot_id: m.slotIds[0], date: nextMonth(21) }, { slot_id: m.slotIds[1], date: nextMonth(22) }],
      m.revision,
    );

    expect(result).toMatchObject({ ok: true, moved: 2, plan_revision: m.revision + 1 });
    expect((await activeSlots(m.calendarId)).map((s) => s.scheduled_date)).toEqual([
      nextMonth(21), nextMonth(22), nextMonth(12),
    ]);
    // Moving changes dates only: reservations are untouched.
    expect(await usage(m.entries[0])).toEqual([{ status: "reserved", channel: "calendar_slot" }]);
  });

  it("changes nothing for a stale or missing revision", async () => {
    const m = await month("move-stale", 2);
    const moves = [{ slot_id: m.slotIds[0], date: nextMonth(25) }];

    expect(await move(m.ws.clientId, m.calendarId, moves, m.revision - 1)).toMatchObject({
      ok: false, code: "PLAN_REVISION_CONFLICT", current_plan_revision: m.revision,
    });
    expect(await move(m.ws.clientId, m.calendarId, moves, null)).toEqual({ ok: false, code: "PLAN_REVISION_REQUIRED" });
    expect((await activeSlots(m.calendarId))[0].scheduled_date).toBe(nextMonth(10));
  });

  it("asks before landing on a day that has posts, or two on one new day", async () => {
    const m = await month("move-same-day");

    const onto = await move(m.ws.clientId, m.calendarId, [{ slot_id: m.slotIds[0], date: nextMonth(11) }], m.revision);
    expect(onto).toMatchObject({ ok: false, code: "DATE_HAS_POSTS" });
    expect(onto.dates?.[0].posts.map((post) => post.title)).toEqual(["Entry 2"]);

    const together = await move(
      m.ws.clientId, m.calendarId,
      [{ slot_id: m.slotIds[0], date: nextMonth(28) }, { slot_id: m.slotIds[1], date: nextMonth(28) }],
      m.revision,
    );
    expect(together).toMatchObject({ ok: false, code: "DATE_HAS_POSTS" });
    expect(together.dates?.[0].incoming).toBe(2);

    expect(
      await move(m.ws.clientId, m.calendarId, [{ slot_id: m.slotIds[0], date: nextMonth(11) }], m.revision, true),
    ).toMatchObject({ ok: true, moved: 1 });
  });

  it("does not ask when a moved entry leaves its own day and another takes it", async () => {
    const m = await month("move-swap", 2);
    const swapped = await move(
      m.ws.clientId, m.calendarId,
      [{ slot_id: m.slotIds[0], date: nextMonth(11) }, { slot_id: m.slotIds[1], date: nextMonth(10) }],
      m.revision,
    );
    expect(swapped).toMatchObject({ ok: true, moved: 2 });
  });

  it("reports nothing moved, and no new revision, when dates are unchanged", async () => {
    const m = await month("move-noop", 1);
    const same = await move(m.ws.clientId, m.calendarId, [{ slot_id: m.slotIds[0], date: nextMonth(10) }], m.revision);
    expect(same).toMatchObject({ ok: true, moved: 0, plan_revision: m.revision });
  });

  it("refuses past dates, another month, drafted or backed slots, and other accounts", async () => {
    const m = await month("move-refuse", 2);
    const other = await seedWorkspace(db, "move-refuse-other");

    expect((await move(m.ws.clientId, m.calendarId, [{ slot_id: m.slotIds[0], date: yesterday }], m.revision)).code)
      .toBe("DATE_IN_PAST");
    expect((await move(m.ws.clientId, m.calendarId, [{ slot_id: m.slotIds[0], date: monthAfterNext }], m.revision)).code)
      .toBe("DATE_OUT_OF_RANGE");

    const postId = (
      await db.query<{ id: string }>(
        "insert into public.posts (client_id, final_post, status) values ($1, 'Body', 'approved') returning id",
        [m.ws.clientId],
      )
    ).rows[0].id;
    await db.query("update public.calendar_slots set post_id = $1, status = 'drafted' where id = $2", [
      postId, m.slotIds[1],
    ]);
    expect(
      await move(m.ws.clientId, m.calendarId, [{ slot_id: m.slotIds[1], date: nextMonth(26) }], m.revision),
    ).toMatchObject({ ok: false, code: "SLOT_NOT_MOVABLE", slot_ids: [m.slotIds[1]] });

    expect((await move(other.clientId, m.calendarId, [{ slot_id: m.slotIds[0], date: nextMonth(26) }], m.revision)).code)
      .toBe("NOT_FOUND");
    expect((await activeSlots(m.calendarId))[0].scheduled_date).toBe(nextMonth(10));
  });

  it("enforces the ideas_manage capability", async () => {
    const m = await month("move-perms", 1);
    const moves = [{ slot_id: m.slotIds[0], date: nextMonth(27) }];

    const asDrafter = await move(m.ws.clientId, m.calendarId, moves, m.revision, false, m.ws.drafterId);
    expect(asDrafter.code).toBe("FORBIDDEN");
    const asPlanner = await move(m.ws.clientId, m.calendarId, moves, m.revision, false, m.ws.plannerId);
    expect(asPlanner.ok).toBe(true);
  });
});

describe("grants", () => {
  it("exposes the new functions to signed-in users only", async () => {
    const rows = await db.query<{ fn: string; role: string; allowed: boolean }>(
      `select p.proname as fn, r.rolname as role,
              has_function_privilege(r.rolname, p.oid, 'execute') as allowed
       from pg_proc p
       cross join (select rolname from pg_roles where rolname in ('anon','authenticated')) r
       where p.pronamespace = 'public'::regnamespace
         and p.proname in ('add_calendar_entry', 'move_calendar_slots')
       order by 1, 2`,
    );
    expect(rows.rows).toEqual([
      { fn: "add_calendar_entry", role: "anon", allowed: false },
      { fn: "add_calendar_entry", role: "authenticated", allowed: true },
      { fn: "move_calendar_slots", role: "anon", allowed: false },
      { fn: "move_calendar_slots", role: "authenticated", allowed: true },
    ]);
  });
});
