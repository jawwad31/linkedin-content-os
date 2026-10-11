import { beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "00000000-0000-4000-8000-0000000000aa";
const CLIENT_ID = "00000000-0000-4000-8000-0000000000c1";
const CALENDAR_ID = "00000000-0000-4000-8000-000000000900";
const SOURCE_ID = "00000000-0000-4000-8000-0000000000e1";
const SLOT_ID = "00000000-0000-4000-8000-000000000501";

const state = vi.hoisted(() => ({
  rpcCalls: [] as { name: string; args: Record<string, unknown> }[],
  rpcResult: { data: null, error: null } as { data: unknown; error: unknown },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/access/client-access", () => ({
  canAccessClient: vi.fn(),
  canManageIdeas: vi.fn(),
}));
vi.mock("@/lib/supabase/session", () => ({ getServerUser: vi.fn() }));
vi.mock("@/lib/audit/log", () => ({ writeAuditLog: vi.fn(async () => undefined) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async (name: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ name, args });
      return state.rpcResult;
    },
  }),
}));
vi.mock("@/features/calendar/queries", () => ({
  getCalendarDefaults: vi.fn(async () => ({ settings: { timezone: "UTC" } })),
  getCalendarForMonth: vi.fn(),
  getScheduledCounts: vi.fn(async () => ({ "2026-11-12": 2, "2026-12-03": 1 })),
}));

import { addCalendarEntry, getAddableDateCounts, moveCalendarSlots } from "@/features/calendar/service";
import { canAccessClient, canManageIdeas } from "@/lib/access/client-access";
import { writeAuditLog } from "@/lib/audit/log";
import { getServerUser } from "@/lib/supabase/session";

const entry = (overrides: Record<string, unknown> = {}) => ({
  sourceId: SOURCE_ID,
  sourceType: "founder_experience",
  date: "2026-11-20",
  allowSameDay: false,
  ...overrides,
});

const moveInput = (overrides: Record<string, unknown> = {}) => ({
  calendarId: CALENDAR_ID,
  moves: [{ slotId: SLOT_ID, date: "2026-11-25" }],
  allowSameDay: false,
  expectedPlanRevision: 3,
  ...overrides,
});

beforeEach(() => {
  state.rpcCalls.length = 0;
  state.rpcResult = { data: null, error: null };
  vi.mocked(writeAuditLog).mockClear();
  vi.mocked(getServerUser).mockResolvedValue({ user: { id: USER_ID } } as never);
  vi.mocked(canAccessClient).mockResolvedValue(true);
  vi.mocked(canManageIdeas).mockResolvedValue(true);
});

describe("addCalendarEntry", () => {
  it("sends exactly the validated entry to the database and audits ids only", async () => {
    state.rpcResult = {
      data: { ok: true, slot_id: SLOT_ID, calendar_id: CALENDAR_ID, plan_revision: 4, scheduled_date: "2026-11-20", posts_on_day: 1 },
      error: null,
    };

    const result = await addCalendarEntry(CLIENT_ID, entry());

    expect(result).toEqual({
      ok: true,
      data: { slotId: SLOT_ID, calendarId: CALENDAR_ID, date: "2026-11-20", postsOnDay: 1, planRevision: 4 },
    });
    expect(state.rpcCalls).toEqual([{
      name: "add_calendar_entry",
      args: {
        p_client_id: CLIENT_ID,
        p_source_id: SOURCE_ID,
        p_source_type: "founder_experience",
        p_date: "2026-11-20",
        p_allow_same_day: false,
      },
    }]);
    const audit = vi.mocked(writeAuditLog).mock.calls[0][0];
    expect(audit).toMatchObject({ action: "calendar_entry_added", entityId: SLOT_ID });
    expect(JSON.stringify(audit.metadata)).not.toMatch(/title|text|content/i);
  });

  it("returns the posts already on the day so the user can answer", async () => {
    state.rpcResult = {
      data: { ok: false, code: "DATE_HAS_POSTS", posts: [{ slot_id: "s1", title: "Pricing", status: "reserved" }] },
      error: null,
    };

    const result = await addCalendarEntry(CLIENT_ID, entry());

    expect(result).toMatchObject({ ok: false, code: "DATE_HAS_POSTS" });
    if (!result.ok) expect(result.sameDayPosts).toEqual([{ slotId: "s1", title: "Pricing", status: "reserved" }]);
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it.each([
    ["NOT_AVAILABLE", /no longer ready/],
    ["ALREADY_IN_CALENDAR", /already on the calendar/],
    ["SINGLE_USE_CONFLICT", /single-use/],
  ])("explains an unavailable entry (%s)", async (reason, message) => {
    state.rpcResult = { data: { ok: false, code: "SOURCE_UNAVAILABLE", reason }, error: null };
    const result = await addCalendarEntry(CLIENT_ID, entry());
    expect(result).toMatchObject({ ok: false, code: "SOURCE_UNAVAILABLE" });
    if (!result.ok) expect(result.message).toMatch(message);
  });

  it.each(["DATE_IN_PAST", "DATE_OUT_OF_RANGE"])("explains %s without exposing database detail", async (code) => {
    state.rpcResult = { data: { ok: false, code }, error: null };
    const result = await addCalendarEntry(CLIENT_ID, entry());
    expect(result).toMatchObject({ ok: false, code });
  });

  it("never calls the database for invalid input", async () => {
    for (const bad of [
      entry({ date: "2026-02-30" }),
      entry({ sourceType: "post" }),
      entry({ sourceId: "nope" }),
      entry({ allowSameDay: undefined }),
      { ...entry(), extra: true },
    ]) {
      expect(await addCalendarEntry(CLIENT_ID, bad)).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    }
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("requires sign-in, account access and the Manage ideas capability", async () => {
    vi.mocked(getServerUser).mockResolvedValueOnce({ user: null } as never);
    expect(await addCalendarEntry(CLIENT_ID, entry())).toMatchObject({ code: "AUTH_REQUIRED" });

    vi.mocked(canAccessClient).mockResolvedValueOnce(false);
    expect(await addCalendarEntry(CLIENT_ID, entry())).toMatchObject({ code: "FORBIDDEN" });

    vi.mocked(canManageIdeas).mockResolvedValueOnce(false);
    const denied = await addCalendarEntry(CLIENT_ID, entry());
    expect(denied).toMatchObject({ ok: false, code: "FORBIDDEN" });
    if (!denied.ok) expect(denied.message).toMatch(/Manage ideas/);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("never exposes a raw database error", async () => {
    state.rpcResult = { data: null, error: { code: "XX000", message: 'deadlock on relation "source_usage"' } };
    const result = await addCalendarEntry(CLIENT_ID, entry());
    expect(result).toMatchObject({ ok: false, code: "UNKNOWN_ERROR" });
    if (!result.ok) expect(result.message).not.toMatch(/deadlock|source_usage|XX000/);
    expect(writeAuditLog).not.toHaveBeenCalled();
  });
});

describe("moveCalendarSlots", () => {
  it("forwards the revision the user loaded and the confirmation flag", async () => {
    state.rpcResult = { data: { ok: true, moved: 1, plan_revision: 4 }, error: null };

    const result = await moveCalendarSlots(CLIENT_ID, moveInput({ allowSameDay: true }));

    expect(result).toEqual({ ok: true, data: { moved: 1, planRevision: 4 } });
    expect(state.rpcCalls[0]).toEqual({
      name: "move_calendar_slots",
      args: {
        p_client_id: CLIENT_ID,
        p_calendar_id: CALENDAR_ID,
        p_moves: [{ slot_id: SLOT_ID, date: "2026-11-25" }],
        p_allow_same_day: true,
        p_expected_plan_revision: 3,
      },
    });
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "calendar_slots_moved" }));
  });

  it("refuses a missing or invalid revision before calling the database", async () => {
    for (const bad of [moveInput({ expectedPlanRevision: undefined }), moveInput({ expectedPlanRevision: -1 }), moveInput({ expectedPlanRevision: 1.5 }), moveInput({ moves: [] })]) {
      expect(await moveCalendarSlots(CLIENT_ID, bad)).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    }
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("reports a stale month as a safe conflict and audits nothing", async () => {
    state.rpcResult = { data: { ok: false, code: "PLAN_REVISION_CONFLICT", current_plan_revision: 9 }, error: null };

    const result = await moveCalendarSlots(CLIENT_ID, moveInput());

    expect(result).toMatchObject({ ok: false, code: "PLAN_REVISION_CONFLICT" });
    if (!result.ok) {
      expect(result.message).toMatch(/Nothing was moved/);
      expect(result.message).not.toMatch(/9|current_plan_revision/);
    }
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it("returns the days that would hold several posts", async () => {
    state.rpcResult = {
      data: {
        ok: false,
        code: "DATE_HAS_POSTS",
        dates: [{ date: "2026-11-25", incoming: 2, posts: [{ slot_id: "s1", title: "Pricing", status: "reserved" }] }],
      },
      error: null,
    };

    const result = await moveCalendarSlots(CLIENT_ID, moveInput());

    expect(result).toMatchObject({ ok: false, code: "DATE_HAS_POSTS" });
    if (!result.ok) {
      expect(result.sameDayDates).toEqual([
        { date: "2026-11-25", incoming: 2, posts: [{ slotId: "s1", title: "Pricing", status: "reserved" }] },
      ]);
    }
  });

  it.each(["SLOT_NOT_MOVABLE", "SLOT_NOT_FOUND", "DATE_IN_PAST", "DATE_OUT_OF_RANGE"])("explains %s", async (code) => {
    state.rpcResult = { data: { ok: false, code }, error: null };
    expect(await moveCalendarSlots(CLIENT_ID, moveInput())).toMatchObject({ ok: false, code });
  });

  it("needs the Manage ideas capability", async () => {
    vi.mocked(canManageIdeas).mockResolvedValueOnce(false);
    expect(await moveCalendarSlots(CLIENT_ID, moveInput())).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(state.rpcCalls).toHaveLength(0);
  });
});

describe("getAddableDateCounts", () => {
  it("returns this month and next with per-day counts, for any member who can read", async () => {
    vi.mocked(canManageIdeas).mockResolvedValue(false);
    const result = await getAddableDateCounts(CLIENT_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.months).toHaveLength(2);
    expect(result.data.months[0].monthKey < result.data.months[1].monthKey).toBe(true);
    expect(result.data.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("denies a user outside the account", async () => {
    vi.mocked(canAccessClient).mockResolvedValueOnce(false);
    expect(await getAddableDateCounts(CLIENT_ID)).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });
});
