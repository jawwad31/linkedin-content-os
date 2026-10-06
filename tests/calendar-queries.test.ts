import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  result: { error: null } as { error: { code: string } | null },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({ eq: () => ({ limit: async () => state.result }) }),
    }),
  }),
}));

import { isCalendarAvailable } from "@/features/calendar/queries";

beforeEach(() => {
  state.result = { error: null };
});

describe("isCalendarAvailable", () => {
  it("is true when the calendar tables exist", async () => {
    expect(await isCalendarAvailable("client-1")).toBe(true);
  });

  it.each(["PGRST205", "42P01"])(
    "is false when the migration has not been applied (%s)",
    async (code) => {
      state.result = { error: { code } };
      expect(await isCalendarAvailable("client-1")).toBe(false);
    },
  );

  it("stays available on unrelated errors so real failures are not mistaken for a missing migration", async () => {
    state.result = { error: { code: "57014" } };
    expect(await isCalendarAvailable("client-1")).toBe(true);
  });
});
