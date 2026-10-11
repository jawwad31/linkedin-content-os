import { beforeEach, describe, expect, it, vi } from "vitest";

const CLIENT_ID = "00000000-0000-4000-8000-0000000000c1";
const EXPERIENCE_ID = "00000000-0000-4000-8000-0000000000e1";

type Result = { data?: unknown; count?: number | null; error: { code?: string } | null };

const state = vi.hoisted(() => ({
  results: {} as Record<string, Result>,
  deleted: 0,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/audit/log", () => ({ writeAuditLog: vi.fn(async () => undefined) }));
vi.mock("@/lib/supabase/session", () => ({
  getServerUser: vi.fn(async () => ({ user: { id: "user-1" } })),
}));
vi.mock("@/lib/access/client-access", () => ({
  canUserDeleteBusinessRecords: vi.fn(async () => true),
}));

/** A chainable query where every method returns the chain and awaiting resolves the table's result. */
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => {
      let isDelete = false;
      const chain: Record<string, unknown> = {};
      const resolve = () => {
        if (isDelete) {
          state.deleted += 1;
          return { data: { id: EXPERIENCE_ID }, error: null };
        }
        return state.results[table] ?? { data: [], count: 0, error: null };
      };
      for (const method of ["select", "eq", "neq", "is", "contains", "limit"]) {
        chain[method] = () => chain;
      }
      chain.delete = () => {
        isDelete = true;
        return chain;
      };
      chain.maybeSingle = async () => resolve();
      chain.then = (onFulfilled: (value: unknown) => unknown) => Promise.resolve(resolve()).then(onFulfilled);
      return chain;
    },
  }),
}));

import { deleteContentBankExperience } from "@/features/content-bank/service";
import { canUserDeleteBusinessRecords } from "@/lib/access/client-access";

beforeEach(() => {
  vi.mocked(canUserDeleteBusinessRecords).mockResolvedValue(true);
  state.deleted = 0;
  state.results = {
    founder_experiences: { data: { id: EXPERIENCE_ID, entry_type: "win" }, error: null },
    content_ideas: { count: 0, error: null },
    calendar_slots: { data: [], error: null },
  };
});

describe("deleteContentBankExperience calendar dependency", () => {
  it("blocks deletion while an active calendar slot plans the entry", async () => {
    state.results.calendar_slots = { data: [{ id: "slot-1" }], error: null };

    const result = await deleteContentBankExperience(CLIENT_ID, EXPERIENCE_ID);

    expect(result).toMatchObject({ ok: false, code: "DEPENDENCY_CONFLICT" });
    if (!result.ok) expect(result.message).toContain("content calendar");
    expect(state.deleted).toBe(0);
  });

  it("deletes normally when no slot references the entry", async () => {
    const result = await deleteContentBankExperience(CLIENT_ID, EXPERIENCE_ID);
    expect(result.ok).toBe(true);
    expect(state.deleted).toBe(1);
  });

  it("does not block deletion before the calendar migration exists", async () => {
    state.results.calendar_slots = { data: null, error: { code: "PGRST205" } };

    const result = await deleteContentBankExperience(CLIENT_ID, EXPERIENCE_ID);

    expect(result.ok).toBe(true);
    expect(state.deleted).toBe(1);
  });

  it("refuses to delete when the dependency check fails for any other reason", async () => {
    state.results.calendar_slots = { data: null, error: { code: "57014" } };

    const result = await deleteContentBankExperience(CLIENT_ID, EXPERIENCE_ID);

    expect(result).toMatchObject({ ok: false, code: "UNKNOWN_ERROR" });
    expect(state.deleted).toBe(0);
  });
});

describe("deleteContentBankExperience safeguards", () => {
  it("refuses a user who may not delete business records, without touching data", async () => {
    vi.mocked(canUserDeleteBusinessRecords).mockResolvedValue(false);

    const result = await deleteContentBankExperience(CLIENT_ID, EXPERIENCE_ID);

    expect(result).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(state.deleted).toBe(0);
  });

  it("blocks deletion while a Content Idea cites the entry", async () => {
    state.results.content_ideas = { count: 1, error: null };

    const result = await deleteContentBankExperience(CLIENT_ID, EXPERIENCE_ID);

    expect(result).toMatchObject({ ok: false, code: "DEPENDENCY_CONFLICT" });
    expect(state.deleted).toBe(0);
  });

  it("rejects malformed identifiers", async () => {
    const result = await deleteContentBankExperience("not-a-uuid", EXPERIENCE_ID);
    expect(result).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(state.deleted).toBe(0);
  });

  it("reports an unknown entry as not found", async () => {
    state.results.founder_experiences = { data: null, error: null };

    const result = await deleteContentBankExperience(CLIENT_ID, EXPERIENCE_ID);

    expect(result).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(state.deleted).toBe(0);
  });
});
