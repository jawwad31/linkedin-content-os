import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  provider: vi.fn(),
  collect: vi.fn(),
  fetch: vi.fn(),
  query: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: mocks.rpc,
    from: (table: string) => {
      const q = {
        select: () => q,
        eq: () => q,
        lte: () => q,
        neq: () => q,
        gte: () => q,
        order: () => q,
        limit: () => mocks.query(table),
      };
      return q;
    },
  }),
}));
vi.mock("@/features/research/web-research/provider", () => ({
  researchWeb: mocks.provider,
}));
vi.mock("@/features/research/rss-collector/collect-for-client", () => ({
  collectForClient: mocks.collect,
}));
vi.mock("@/features/research/automation/safe-fetch", () => ({
  fetchSource: mocks.fetch,
}));
import { dispatchResearchSchedules } from "@/features/research/automation/executor";
const client = "ede14f35-e8d9-4f1b-9f24-71115ae232f5";
const actor = "08146362-d1c9-4d76-868e-e68fef62ab41";
const briefing = "7cf382df-55a4-4268-aa58-bb4726e7caaa";
const rss = {
  id: briefing,
  url: "https://example.com/release",
  title: "Release",
  text: "feed summary",
  contentHash: "hash",
  fetchedAt: new Date().toISOString(),
  kind: "rss",
  feedUrl: "https://example.com/feed.xml",
  feedPublishedAt: null,
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("RESEARCH_AUTOMATION_ENABLED", "true");
  mocks.query.mockImplementation(async (table) => ({
    data: table === "research_schedules" ? [{ client_id: client }] : [],
    error: null,
  }));
  mocks.rpc.mockImplementation(async (name) => ({
    data:
      name === "claim_scheduled_research"
        ? {
            ok: true,
            occurrenceId: briefing,
            token: actor,
            briefingId: briefing,
            runId: client,
            actor,
            settings: {
              revision: 1,
              prompt: "Find recent marketing news",
              lookbackDays: 7,
              useProfileContext: false,
            },
            profile: null,
          }
        : name === "load_rss_research_context"
          ? { ok: true, sources: [rss], omitted: 0 }
          : { ok: true },
    error: null,
  }));
  mocks.collect.mockImplementation(async (_client, options) => {
    await options.beforeSource();
    return { errors: [], loadError: false, skippedSources: 0 };
  });
  mocks.provider.mockResolvedValue({
    outcome: "empty",
    coverageGaps: [],
    candidates: [],
    findings: [],
    toolCalls: 1,
    summary: "",
    errorCode: null,
  });
});
afterEach(() => vi.unstubAllEnvs());
describe("scheduled RSS evidence and independent prompt research", () => {
  it("refreshes scoped feeds with renewed leases, snapshots RSS inputs and never crawls blogs", async () => {
    expect(await dispatchResearchSchedules()).toEqual({
      claimed: 1,
      finished: 1,
      errors: 0,
    });
    expect(mocks.collect).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ maxSources: 10 }),
    );
    expect(mocks.rpc.mock.calls.map((c) => c[0])).toContain(
      "renew_scheduled_research",
    );
    expect(mocks.provider).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: client,
        sources: [rss],
        profile: null,
      }),
    );
    expect(mocks.rpc).toHaveBeenCalledWith(
      "finish_scheduled_research",
      expect.objectContaining({ p_sources: [rss] }),
    );
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("still searches with no feeds, and reports feed failure/budget gaps as partial coverage", async () => {
    mocks.collect.mockResolvedValue({
      errors: [{}],
      loadError: false,
      skippedSources: 2,
    });
    await dispatchResearchSchedules();
    const commit = mocks.rpc.mock.calls.find(
      (c) => c[0] === "finish_scheduled_research",
    )![1];
    expect(commit.p_result.outcome).toBe("partial");
    expect(commit.p_result.coverageGaps).toHaveLength(2);
    expect(mocks.provider).toHaveBeenCalledTimes(1);
    mocks.rpc.mockImplementation(async (name) => ({
      data:
        name === "claim_scheduled_research"
          ? {
              ok: true,
              occurrenceId: briefing,
              token: actor,
              briefingId: briefing,
              runId: client,
              actor,
              settings: {
                revision: 1,
                prompt: "Find recent marketing news",
                lookbackDays: 7,
                useProfileContext: false,
              },
              profile: null,
            }
          : name === "load_rss_research_context"
            ? { ok: true, sources: [], omitted: 0 }
            : { ok: true },
      error: null,
    }));
    await dispatchResearchSchedules();
    expect(mocks.provider.mock.calls[1][0].sources).toEqual([]);
  });
  it("stops before search when a lease is revoked while feeds refresh", async () => {
    mocks.rpc.mockImplementation(async (name) => ({
      data:
        name === "claim_scheduled_research"
          ? {
              ok: true,
              occurrenceId: briefing,
              token: actor,
              briefingId: briefing,
              runId: client,
              actor,
              settings: {
                revision: 1,
                prompt: "Find recent marketing news",
                lookbackDays: 7,
                useProfileContext: false,
              },
              profile: null,
            }
          : { ok: false },
      error: null,
    }));
    await dispatchResearchSchedules();
    expect(mocks.provider).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith(
      "finish_scheduled_research",
      expect.objectContaining({
        p_result: expect.objectContaining({ outcome: "failed" }),
      }),
    );
  });
});
