import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  canRun: true,
  guardArgs: [] as unknown[][],
  collect: vi.fn(),
  classify: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/session", () => ({
  getServerUser: vi.fn(async () => ({ user: { id: "user-1" } })),
}));
vi.mock("@/lib/access/client-access", () => ({
  canAccessClient: vi.fn(async () => true),
  canRunResearchAgent: vi.fn(async () => state.canRun),
}));
vi.mock("@/features/research/rss-collector", () => ({
  collectForClient: (...args: unknown[]) => state.collect(...args),
}));
vi.mock("@/features/research/agents/research-classifier", () => ({
  NOT_CONFIGURED_ERROR: "Classifier is not configured.",
  classifyForClient: (...args: unknown[]) => state.classify(...args),
}));
vi.mock("@/features/research/research-runs/run-guard", () => ({
  RSS_COLLECT_LOCK_KEY: "rss_collect",
  withResearchRunGuard: async (...args: unknown[]) => {
    state.guardArgs.push(args);
    const work = args[3] as () => Promise<unknown>;
    return { ok: true, status: "completed", result: await work() };
  },
}));

import { runResearchAgentManually } from "@/features/research/run-research-agent/service";

const CLIENT = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  state.canRun = true;
  state.guardArgs = [];
  state.collect.mockReset().mockResolvedValue({
    sourcesProcessed: 2,
    totalFetched: 30,
    totalNew: 12,
    skippedDuplicate: 18,
    skippedInvalid: 0,
    skippedStale: 0,
    skippedError: 0,
    errors: [],
  });
  state.classify.mockReset().mockResolvedValue({
    ok: true,
    summary: { classifiedCount: 12, relevantCount: 5, irrelevantCount: 7, errorCount: 0 },
  });
});

describe("Run RSS feeds (the manual RSS run)", () => {
  it("fetches, then marks articles relevant or not, and builds no TrendCards", async () => {
    const result = await runResearchAgentManually(CLIENT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(state.collect).toHaveBeenCalledTimes(1);
    expect(state.classify).toHaveBeenCalledTimes(1);
    expect(result.data.summary).toMatchObject({
      totalNew: 12,
      classifiedCount: 12,
      relevantCount: 5,
      irrelevantCount: 7,
    });
    expect(result.data).not.toHaveProperty("synthesisMessage");
    expect(result.data.summary).not.toHaveProperty("signalsCreated");
    // The run is recorded as finishing at the classify stage.
    expect(state.guardArgs[0][state.guardArgs[0].length - 1]).toBe("classify");
  });

  it("is refused for someone who may not run research", async () => {
    state.canRun = false;
    expect(await runResearchAgentManually(CLIENT)).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(state.collect).not.toHaveBeenCalled();
  });

  it("says so when the classifier is not set up, without failing the fetch", async () => {
    state.classify.mockResolvedValue({ ok: false, reason: "not_configured" });
    const result = await runResearchAgentManually(CLIENT);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.classificationMessage).toBe("Classifier is not configured.");
  });
});
