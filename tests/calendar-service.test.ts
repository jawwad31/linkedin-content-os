import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CalendarRecord, CandidateEntry } from "@/features/calendar/queries";

const USER_ID = "00000000-0000-4000-8000-0000000000aa";
const CLIENT_ID = "00000000-0000-4000-8000-0000000000c1";
const MONTH = "2026-11";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

type Write = { table: string; op: "insert" | "update"; payload: Record<string, unknown> };

const state = vi.hoisted(() => ({
  writes: [] as { table: string; op: string; payload: Record<string, unknown> }[],
  rpcCalls: [] as { name: string; args: Record<string, unknown> }[],
  rpcResult: { data: null, error: null } as { data: unknown; error: unknown },
  dbResults: {} as Record<string, { data: unknown; error: unknown }>,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/access/client-access", () => ({
  canAccessClient: vi.fn(),
  canManageIdeas: vi.fn(),
  canManageClientSetup: vi.fn(),
}));

vi.mock("@/lib/supabase/session", () => ({ getServerUser: vi.fn() }));
vi.mock("@/lib/audit/log", () => ({ writeAuditLog: vi.fn(async () => undefined) }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => {
      const builder = (op: "insert" | "update", payload: Record<string, unknown>) => {
        state.writes.push({ table, op, payload });
        const chain: Record<string, unknown> = {};
        const result = () => state.dbResults[table] ?? { data: null, error: null };
        chain.eq = () => chain;
        chain.select = () => chain;
        chain.single = async () => result();
        chain.maybeSingle = async () => result();
        return chain;
      };
      return {
        insert: (payload: Record<string, unknown>) => builder("insert", payload),
        update: (payload: Record<string, unknown>) => builder("update", payload),
      };
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ name, args });
      return state.rpcResult;
    },
  }),
}));

vi.mock("@/features/calendar/queries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/calendar/queries")>();
  return {
    ...actual,
    getCalendarDefaults: vi.fn(),
    getCalendarForMonth: vi.fn(),
    getCalendarSlots: vi.fn(),
    getCandidateInventory: vi.fn(),
    getReplannableUsageIds: vi.fn(),
  };
});

import {
  cancelCalendarSlots,
  commitCalendarPlan,
  previewCalendarPlan,
  resetMonthToDefaults,
  saveAccountDefaults,
  saveMonthSettings,
} from "@/features/calendar/service";
import {
  getCalendarDefaults,
  getCalendarForMonth,
  getCalendarSlots,
  getCandidateInventory,
  getReplannableUsageIds,
} from "@/features/calendar/queries";
import {
  canAccessClient,
  canManageClientSetup,
  canManageIdeas,
} from "@/lib/access/client-access";
import { writeAuditLog } from "@/lib/audit/log";
import { getServerUser } from "@/lib/supabase/session";

const validSettings = {
  timezone: "Asia/Karachi",
  postCount: 30,
  shares: { experience: 40, asset: 10, evergreen: 40, news: 10 },
  newsCapPercent: 20,
};

const calendar: CalendarRecord = {
  id: uuid(900),
  month: MONTH,
  settings: { ...validSettings },
  defaultsVersion: 2,
  settingsRevision: 3,
  planRevision: 0,
  plannedAt: null,
};

const calendarRow = {
  id: uuid(900),
  month: "2026-11-01",
  timezone: "Asia/Karachi",
  post_count: 30,
  share_experience: 40,
  share_asset: 10,
  share_evergreen: 40,
  share_news: 10,
  news_cap_percent: 20,
  defaults_version: 2,
  settings_revision: 4,
  plan_revision: 0,
  planned_at: null,
};

const entry = (id: string, kind: CandidateEntry["sourceType"]): CandidateEntry => ({
  id,
  sourceType: kind,
  title: `Entry ${id.slice(-3)}`,
  summary: null,
  category: kind === "founder_experience" ? "observation" : "lead_magnet",
  allowReuse: false,
  usageCount: 0,
  inPlan: false,
});

const experienceEntries = Array.from({ length: 9 }, (_, i) => entry(uuid(i + 1), "founder_experience"));
const assetEntries = Array.from({ length: 5 }, (_, i) => entry(uuid(i + 101), "content_resource"));

function writesTo(table: string): Write[] {
  return state.writes.filter((write) => write.table === table) as Write[];
}

function mockRoles(roles: { access?: boolean; planner?: boolean; admin?: boolean }) {
  vi.mocked(canAccessClient).mockResolvedValue(roles.access ?? true);
  vi.mocked(canManageIdeas).mockResolvedValue(roles.planner ?? false);
  vi.mocked(canManageClientSetup).mockResolvedValue(roles.admin ?? false);
}

beforeEach(() => {
  state.writes.length = 0;
  state.rpcCalls.length = 0;
  state.rpcResult = { data: { ok: true, plan_revision: 1, slot_count: 30, released: 0 }, error: null };
  state.dbResults = {
    content_calendars: { data: calendarRow, error: null },
    calendar_defaults: { data: { version: 3 }, error: null },
  };

  vi.mocked(getServerUser).mockResolvedValue({ user: { id: USER_ID } } as never);
  vi.mocked(writeAuditLog).mockClear();
  mockRoles({ planner: true, admin: true });

  vi.mocked(getCalendarDefaults).mockResolvedValue({
    version: 2,
    settings: { ...validSettings },
    updatedAt: "2026-10-01T00:00:00Z",
  });
  vi.mocked(getCalendarForMonth).mockResolvedValue(calendar);
  vi.mocked(getCalendarSlots).mockResolvedValue([]);
  vi.mocked(getReplannableUsageIds).mockResolvedValue(new Set());
  vi.mocked(getCandidateInventory).mockResolvedValue({
    experience: experienceEntries,
    asset: assetEntries,
  });
});

describe("two save scopes", () => {
  it("Save for this month writes only the month snapshot, never the account defaults", async () => {
    vi.mocked(getCalendarForMonth).mockResolvedValue(null);

    const result = await saveMonthSettings(CLIENT_ID, MONTH, validSettings, null);

    expect(result.ok).toBe(true);
    expect(writesTo("calendar_defaults")).toHaveLength(0);
    const insert = writesTo("content_calendars")[0];
    expect(insert.op).toBe("insert");
    // A new month remembers which defaults version it started from.
    expect(insert.payload).toMatchObject({
      client_id: CLIENT_ID,
      month: "2026-11-01",
      post_count: 30,
      defaults_version: 2,
      created_by: USER_ID,
    });
  });

  it("Save as default bumps the version and never touches any month snapshot", async () => {
    const result = await saveAccountDefaults(CLIENT_ID, validSettings, 2);

    expect(result).toEqual({ ok: true, data: { version: 3 } });
    expect(writesTo("content_calendars")).toHaveLength(0);
    expect(writesTo("calendar_slots")).toHaveLength(0);
    expect(writesTo("calendar_defaults")).toHaveLength(1);
    expect(writesTo("calendar_defaults")[0].payload).toMatchObject({ version: 3, updated_by: USER_ID });
  });

  it("creates the first defaults record at version 1", async () => {
    vi.mocked(getCalendarDefaults).mockResolvedValue(null);
    state.dbResults.calendar_defaults = { data: { version: 1 }, error: null };

    const result = await saveAccountDefaults(CLIENT_ID, validSettings, null);

    expect(result).toEqual({ ok: true, data: { version: 1 } });
    expect(writesTo("calendar_defaults")[0]).toMatchObject({ op: "insert" });
    expect(writesTo("calendar_defaults")[0].payload).toMatchObject({ version: 1 });
  });

  it("updating an existing month bumps only its revision and leaves defaults alone", async () => {
    const result = await saveMonthSettings(CLIENT_ID, MONTH, validSettings, 3);

    expect(result.ok).toBe(true);
    expect(writesTo("calendar_defaults")).toHaveLength(0);
    expect(writesTo("content_calendars")[0]).toMatchObject({ op: "update" });
    expect(writesTo("content_calendars")[0].payload).toMatchObject({ settings_revision: 4 });
  });

  it("resetting a month copies the current defaults into that month only", async () => {
    const result = await resetMonthToDefaults(CLIENT_ID, MONTH, 3);

    expect(result.ok).toBe(true);
    expect(writesTo("calendar_defaults")).toHaveLength(0);
    expect(writesTo("content_calendars")[0].payload).toMatchObject({
      defaults_version: 2,
      settings_revision: 4,
      post_count: 30,
    });
  });

  it("refuses to reset when no defaults were ever saved", async () => {
    vi.mocked(getCalendarDefaults).mockResolvedValue(null);
    const result = await resetMonthToDefaults(CLIENT_ID, MONTH, 3);
    expect(result).toMatchObject({ ok: false, code: "NO_DEFAULTS" });
    expect(state.writes).toHaveLength(0);
  });

  it("rejects a stale revision instead of overwriting newer settings", async () => {
    const monthResult = await saveMonthSettings(CLIENT_ID, MONTH, validSettings, 2);
    const defaultsResult = await saveAccountDefaults(CLIENT_ID, validSettings, 1);
    const resetResult = await resetMonthToDefaults(CLIENT_ID, MONTH, 1);

    for (const result of [monthResult, defaultsResult, resetResult]) {
      expect(result).toMatchObject({ ok: false, code: "CONFLICT" });
    }
    expect(state.writes).toHaveLength(0);
  });
});

describe("validation", () => {
  it("rejects invalid settings with field-level issues and writes nothing", async () => {
    const result = await saveMonthSettings(
      CLIENT_ID,
      MONTH,
      { ...validSettings, shares: { experience: 40, asset: 10, evergreen: 40, news: 5 } },
      3,
    );

    expect(result).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    if (!result.ok) {
      expect(result.issues?.[0].field).toBe("shares");
    }
    expect(state.writes).toHaveLength(0);
  });

  it("makes the user resolve a news share above the news cap", async () => {
    const result = await saveAccountDefaults(
      CLIENT_ID,
      { ...validSettings, newsCapPercent: 5 },
      2,
    );
    expect(result).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(state.writes).toHaveLength(0);
  });

  it("rejects an invalid month and a malformed client id", async () => {
    expect(await saveMonthSettings(CLIENT_ID, "2026-13", validSettings, null)).toMatchObject({
      ok: false,
      code: "VALIDATION_ERROR",
    });
    expect(await saveMonthSettings("not-a-uuid", MONTH, validSettings, null)).toMatchObject({
      ok: false,
      code: "VALIDATION_ERROR",
    });
  });
});

describe("authorization", () => {
  it("requires sign-in", async () => {
    vi.mocked(getServerUser).mockResolvedValue({ user: null } as never);

    const results = await Promise.all([
      saveMonthSettings(CLIENT_ID, MONTH, validSettings, null),
      saveAccountDefaults(CLIENT_ID, validSettings, null),
      previewCalendarPlan(CLIENT_ID, MONTH, { experienceIds: [], assetIds: [] }),
      commitCalendarPlan(CLIENT_ID, MONTH, { experienceIds: [], assetIds: [] }, false),
      cancelCalendarSlots(CLIENT_ID, MONTH, {}),
    ]);

    for (const result of results) expect(result).toMatchObject({ ok: false, code: "AUTH_REQUIRED" });
    expect(state.writes).toHaveLength(0);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("denies a user from another account everywhere", async () => {
    mockRoles({ access: false, planner: true, admin: true });

    const results = await Promise.all([
      saveMonthSettings(CLIENT_ID, MONTH, validSettings, null),
      saveAccountDefaults(CLIENT_ID, validSettings, null),
      commitCalendarPlan(CLIENT_ID, MONTH, { experienceIds: [], assetIds: [] }, false),
      cancelCalendarSlots(CLIENT_ID, MONTH, {}),
    ]);

    for (const result of results) expect(result).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(state.writes).toHaveLength(0);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("lets an Account User with ideas_manage plan a month but not change account defaults", async () => {
    mockRoles({ planner: true, admin: false });

    expect((await saveMonthSettings(CLIENT_ID, MONTH, validSettings, 3)).ok).toBe(true);
    expect(await saveAccountDefaults(CLIENT_ID, validSettings, 2)).toMatchObject({
      ok: false,
      code: "FORBIDDEN",
    });
    expect(writesTo("calendar_defaults")).toHaveLength(0);
  });

  it("denies a user without ideas_manage every planning action", async () => {
    mockRoles({ planner: false, admin: false });

    const results = await Promise.all([
      saveMonthSettings(CLIENT_ID, MONTH, validSettings, 3),
      resetMonthToDefaults(CLIENT_ID, MONTH, 3),
      previewCalendarPlan(CLIENT_ID, MONTH, { experienceIds: [], assetIds: [] }),
      commitCalendarPlan(CLIENT_ID, MONTH, { experienceIds: [], assetIds: [] }, false),
      cancelCalendarSlots(CLIENT_ID, MONTH, {}),
    ]);

    for (const result of results) expect(result).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(state.writes).toHaveLength(0);
    expect(state.rpcCalls).toHaveLength(0);
    expect(writeAuditLog).not.toHaveBeenCalled();
  });
});

describe("plan preview", () => {
  it("shows requested versus actual counts when fewer entries are selected than needed", async () => {
    const result = await previewCalendarPlan(CLIENT_ID, MONTH, {
      experienceIds: experienceEntries.slice(0, 8).map((e) => e.id),
      assetIds: assetEntries.slice(0, 3).map((e) => e.id),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.plan.requested).toEqual({ experience: 12, asset: 3, evergreen: 12, news: 3 });
    expect(result.data.plan.actual).toEqual({ experience: 8, asset: 3, evergreen: 16, news: 3 });
    expect(result.data.hasExistingPlan).toBe(false);
    expect(state.writes).toHaveLength(0);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("uses the month's saved snapshot, not the current account defaults", async () => {
    vi.mocked(getCalendarDefaults).mockResolvedValue({
      version: 9,
      settings: { ...validSettings, postCount: 5, shares: { experience: 100, asset: 0, evergreen: 0, news: 0 } },
      updatedAt: "2026-10-05T00:00:00Z",
    });

    const result = await previewCalendarPlan(CLIENT_ID, MONTH, { experienceIds: [], assetIds: [] });
    expect(result.ok && result.data.plan.slots).toHaveLength(30);
  });

  it("falls back entirely to evergreen when no entries are eligible", async () => {
    vi.mocked(getCandidateInventory).mockResolvedValue({ experience: [], asset: [] });

    const result = await previewCalendarPlan(CLIENT_ID, MONTH, { experienceIds: [], assetIds: [] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.plan.shortages.map((s) => s.reason)).toEqual([
      "no_eligible_entries",
      "no_eligible_entries",
    ]);
    expect(result.data.plan.actual).toEqual({ experience: 0, asset: 0, evergreen: 27, news: 3 });
  });

  it("requires the month to be saved first", async () => {
    vi.mocked(getCalendarForMonth).mockResolvedValue(null);
    const result = await previewCalendarPlan(CLIENT_ID, MONTH, { experienceIds: [], assetIds: [] });
    expect(result).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  it("preserves slots that already carry a post and plans only the rest", async () => {
    vi.mocked(getCalendarSlots).mockResolvedValue([
      {
        id: uuid(500),
        slotIndex: 1,
        bucket: "experience",
        requestedBucket: "experience",
        shortageReason: null,
        status: "reserved",
        sourceId: uuid(50),
        sourceType: "founder_experience",
        sourceTitle: "Drafted",
        postId: uuid(600),
        postStatus: "approved",
      },
      {
        id: uuid(501),
        slotIndex: 2,
        bucket: "evergreen",
        requestedBucket: "evergreen",
        shortageReason: null,
        status: "planned",
        sourceId: null,
        sourceType: null,
        sourceTitle: null,
        postId: null,
        postStatus: null,
      },
    ]);

    const result = await previewCalendarPlan(CLIENT_ID, MONTH, { experienceIds: [], assetIds: [] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({
      hasExistingPlan: true,
      preservedSlots: 1,
      replannableSlots: 1,
    });
    expect(result.data.plan.slots).toHaveLength(29);
    expect(result.data.plan.actual.experience).toBe(1 + 0);
  });

  it("reports selections that are no longer eligible and cannot be planned", async () => {
    const stale = uuid(777);
    const result = await previewCalendarPlan(CLIENT_ID, MONTH, {
      experienceIds: [experienceEntries[0].id, stale],
      assetIds: [],
    });

    expect(result).toMatchObject({ ok: false, code: "SOURCE_UNAVAILABLE" });
    if (!result.ok) expect(result.unavailable).toEqual([{ sourceId: stale, reason: "NOT_AVAILABLE" }]);
  });

  it("rejects an experience id submitted as an asset", async () => {
    const result = await previewCalendarPlan(CLIENT_ID, MONTH, {
      experienceIds: [],
      assetIds: [experienceEntries[0].id],
    });
    expect(result).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
  });
});

describe("commit", () => {
  const selection = () => ({
    experienceIds: experienceEntries.slice(0, 8).map((e) => e.id),
    assetIds: assetEntries.slice(0, 3).map((e) => e.id),
  });

  it("recomputes the plan on the server and sends only slots derived from it", async () => {
    const result = await commitCalendarPlan(CLIENT_ID, MONTH, selection(), false);

    expect(result.ok).toBe(true);
    expect(state.rpcCalls).toHaveLength(1);
    const call = state.rpcCalls[0];
    expect(call.name).toBe("commit_calendar_plan");
    expect(call.args).toMatchObject({ p_client_id: CLIENT_ID, p_calendar_id: calendar.id, p_replace: false });

    const slots = call.args.p_slots as { bucket: string; requested_bucket: string; source_id: string | null }[];
    expect(slots).toHaveLength(30);
    expect(slots.filter((s) => s.bucket === "experience")).toHaveLength(8);
    const substituted = slots.filter((s) => s.bucket === "evergreen" && s.requested_bucket === "experience");
    expect(substituted).toHaveLength(4);
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "calendar_plan_committed", clientId: CLIENT_ID }),
    );
  });

  it("requires explicit confirmation to replan an existing plan", async () => {
    vi.mocked(getCalendarSlots).mockResolvedValue([
      {
        id: uuid(501),
        slotIndex: 1,
        bucket: "evergreen",
        requestedBucket: "evergreen",
        shortageReason: null,
        status: "planned",
        sourceId: null,
        sourceType: null,
        sourceTitle: null,
        postId: null,
        postStatus: null,
      },
    ]);

    const unconfirmed = await commitCalendarPlan(CLIENT_ID, MONTH, selection(), false);
    expect(unconfirmed).toMatchObject({ ok: false, code: "REPLAN_CONFIRMATION_REQUIRED" });
    expect(state.rpcCalls).toHaveLength(0);

    const confirmed = await commitCalendarPlan(CLIENT_ID, MONTH, selection(), true);
    expect(confirmed.ok).toBe(true);
    expect(state.rpcCalls[0].args).toMatchObject({ p_replace: true });
  });

  it("reports a lost race safely and writes no audit entry", async () => {
    const lost = experienceEntries[0].id;
    state.rpcResult = {
      data: {
        ok: false,
        code: "SOURCE_UNAVAILABLE",
        unavailable: [{ source_id: lost, reason: "SINGLE_USE_CONFLICT" }],
      },
      error: null,
    };

    const result = await commitCalendarPlan(CLIENT_ID, MONTH, selection(), false);

    expect(result).toMatchObject({ ok: false, code: "SOURCE_UNAVAILABLE" });
    if (result.ok) return;
    expect(result.message).toContain("Nothing was reserved");
    expect(result.unavailable).toEqual([{ sourceId: lost, reason: "SINGLE_USE_CONFLICT" }]);
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it("does not call the database when a selected entry is already unavailable", async () => {
    const result = await commitCalendarPlan(
      CLIENT_ID,
      MONTH,
      { experienceIds: [uuid(777)], assetIds: [] },
      false,
    );
    expect(result).toMatchObject({ ok: false, code: "SOURCE_UNAVAILABLE" });
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("never exposes a raw database error", async () => {
    state.rpcResult = {
      data: null,
      error: { code: "XX000", message: 'deadlock detected on relation "source_usage"' },
    };

    const result = await commitCalendarPlan(CLIENT_ID, MONTH, selection(), false);

    expect(result).toMatchObject({ ok: false, code: "UNKNOWN_ERROR" });
    if (!result.ok) expect(result.message).not.toMatch(/deadlock|source_usage|XX000/);
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it("maps a plan-exists race to a safe message", async () => {
    state.rpcResult = { data: { ok: false, code: "PLAN_EXISTS" }, error: null };
    const result = await commitCalendarPlan(CLIENT_ID, MONTH, selection(), false);
    expect(result).toMatchObject({ ok: false, code: "PLAN_EXISTS" });
  });
});

describe("cancellation", () => {
  it("releases reservations through the database and audits counts only", async () => {
    state.rpcResult = {
      data: { ok: true, cancelled: 3, released: 2, preserved: 1 },
      error: null,
    };

    const result = await cancelCalendarSlots(CLIENT_ID, MONTH, { slotIds: [uuid(501)] });

    expect(result).toEqual({ ok: true, data: { cancelled: 3, released: 2, preserved: 1 } });
    expect(state.rpcCalls[0]).toMatchObject({
      name: "cancel_calendar_slots",
      args: { p_client_id: CLIENT_ID, p_calendar_id: calendar.id, p_slot_ids: [uuid(501)] },
    });
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "calendar_slots_cancelled",
        metadata: expect.objectContaining({ cancelled: 3, released: 2, preserved: 1 }),
      }),
    );
  });

  it("cancels every eligible slot when no ids are given", async () => {
    state.rpcResult = { data: { ok: true, cancelled: 5, released: 5, preserved: 0 }, error: null };
    await cancelCalendarSlots(CLIENT_ID, MONTH, {});
    expect(state.rpcCalls[0].args).toMatchObject({ p_slot_ids: null });
  });

  it("rejects malformed slot ids", async () => {
    const result = await cancelCalendarSlots(CLIENT_ID, MONTH, { slotIds: ["not-a-uuid"] });
    expect(result).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(state.rpcCalls).toHaveLength(0);
  });
});
