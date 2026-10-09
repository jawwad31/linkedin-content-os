import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  access: vi.fn(),
  manage: vi.fn(),
  ideas: vi.fn(),
  draft: vi.fn(),
  rpc: vi.fn(),
  prior: vi.fn(),
  adminRpc: vi.fn(),
  provider: vi.fn(),
  guard: vi.fn(),
  previous: vi.fn(),
  generate: vi.fn(),
  audit: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/session", () => ({ getServerUser: mocks.user }));
vi.mock("@/lib/access/client-access", () => ({
  canAccessClient: mocks.access,
  canRunResearchAgent: mocks.manage,
  canManageIdeas: mocks.ideas,
  canDraftPosts: mocks.draft,
}));
vi.mock("@/lib/audit/log", () => ({ writeAuditLog: mocks.audit }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: mocks.rpc,
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: mocks.prior,
      };
      return query;
    },
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: mocks.adminRpc }),
}));
vi.mock("@/features/posts/generate/service", () => ({
  generatePostFromIdea: mocks.generate,
}));
vi.mock("@/features/research/research-runs/run-guard", () => ({
  RSS_COLLECT_LOCK_KEY: "rss_collect",
  withResearchRunGuard: mocks.guard,
}));
vi.mock("@/features/research/web-research/queries", () => ({
  getPreviousFindings: mocks.previous,
}));
vi.mock("@/features/research/web-research/provider", () => ({
  researchWeb: mocks.provider,
}));
import {
  createResearchPosts,
  runWebResearch,
  saveWebResearchSettings,
} from "@/features/research/web-research/service";
import { INITIAL_RESEARCH_PROMPT } from "@/features/research/web-research/contracts";

const client = "ede14f35-e8d9-4f1b-9f24-71115ae232f5";
const user = "08146362-d1c9-4d76-868e-e68fef62ab41";
const briefing = "7cf382df-55a4-4268-aa58-bb4726e7caaa";
const key = "d6b143bf-7db3-4e46-8fba-6869efb1d735";
const request = { expectedRevision: 1, requestKey: key };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue({ user: { id: user } });
  for (const fn of [mocks.access, mocks.manage, mocks.ideas, mocks.draft])
    fn.mockResolvedValue(true);
  mocks.prior.mockResolvedValue({ data: null, error: null });
  mocks.previous.mockResolvedValue([]);
  mocks.rpc.mockResolvedValue({
    data: {
      ok: true,
      id: briefing,
      prompt: INITIAL_RESEARCH_PROMPT,
      lookbackDays: 7,
      useProfileContext: false,
      profile: null,
    },
    error: null,
  });
  mocks.adminRpc.mockResolvedValue({ data: { ok: true }, error: null });
  mocks.provider.mockResolvedValue({
    outcome: "empty",
    summary: "",
    coverageGaps: [],
    candidates: [],
    findings: [],
    errorCode: null,
    toolCalls: 1,
  });
  mocks.guard.mockImplementation(async (_client, _lock, _trigger, fn) => {
    try {
      return { ok: true, status: "completed", result: await fn("run-id") };
    } catch {
      return { ok: false };
    }
  });
});
describe("P07 authorized manual research service", () => {
  it("uses the same protected RSS snapshot for a manual saved-prompt run", async () => {
    vi.stubEnv("RESEARCH_AUTOMATION_ENABLED", "true");
    const source = {
      id: briefing,
      url: "https://example.com/release",
      title: "Release",
      text: "Feed summary",
      contentHash: "hash",
      fetchedAt: new Date().toISOString(),
      kind: "rss",
      feedUrl: "https://example.com/feed.xml",
      feedPublishedAt: null,
    };
    mocks.adminRpc.mockImplementation(async (name) => ({
      data:
        name === "load_rss_research_context"
          ? { ok: true, sources: [source], omitted: 2 }
          : { ok: true },
      error: null,
    }));
    try {
      expect(await runWebResearch(client, request)).toMatchObject({
        ok: true,
        data: { outcome: "partial" },
      });
      expect(mocks.adminRpc).toHaveBeenCalledWith("load_rss_research_context", {
        p_client_id: client,
        p_actor: user,
        p_briefing_id: briefing,
      });
      expect(mocks.provider).toHaveBeenCalledWith(
        expect.objectContaining({ sources: [source] }),
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it("denies gated users and unauthorized workspaces before RPCs or paid calls", async () => {
    mocks.user.mockResolvedValue({ user: null });
    expect((await runWebResearch(client, request)).ok).toBe(false);
    mocks.user.mockResolvedValue({ user: { id: user } });
    mocks.access.mockResolvedValue(false);
    expect((await runWebResearch(client, request)).ok).toBe(false);
    expect(mocks.guard).not.toHaveBeenCalled();
    expect(mocks.provider).not.toHaveBeenCalled();
  });
  it("uses the saved snapshot and existing RSS lock without creating ideas or posts", async () => {
    const result = await runWebResearch(client, request);
    expect(result).toMatchObject({
      ok: true,
      data: { id: briefing, outcome: "empty" },
    });
    expect(mocks.guard.mock.calls[0].slice(0, 3)).toEqual([
      client,
      "rss_collect",
      "manual",
    ]);
    expect(mocks.provider.mock.calls[0][0]).toMatchObject({
      settings: {
        prompt: INITIAL_RESEARCH_PROMPT,
        revision: 1,
        useProfileContext: false,
      },
      profile: null,
    });
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.rpc.mock.calls.map((c) => c[0])).toEqual([
      "prepare_web_research",
    ]);
    expect(
      mocks.audit.mock.calls.some((c) =>
        JSON.stringify(c).includes(INITIAL_RESEARCH_PROMPT),
      ),
    ).toBe(false);
  });
  it("deduplicates transport retries and never runs while the shared lock is held", async () => {
    mocks.prior.mockResolvedValueOnce({
      data: { id: briefing, outcome: "success", created_by: user, revision: 1 },
      error: null,
    });
    expect((await runWebResearch(client, request)).ok).toBe(true);
    expect(mocks.guard).not.toHaveBeenCalled();
    mocks.guard.mockResolvedValueOnce({ ok: true, status: "locked" });
    expect(await runWebResearch(client, request)).toMatchObject({
      ok: false,
      code: "RUN_IN_PROGRESS",
    });
    expect(mocks.provider).not.toHaveBeenCalled();
  });
  it("rejects stale saved revisions before a provider call", async () => {
    mocks.rpc.mockResolvedValue({
      data: { ok: false, code: "REVISION_CHANGED" },
      error: null,
    });
    expect(await runWebResearch(client, request)).toMatchObject({
      ok: false,
      code: "REVISION_CHANGED",
    });
    expect(mocks.provider).not.toHaveBeenCalled();
  });
  it("marks missing configuration and provider failures as failed run outcomes", async () => {
    mocks.provider.mockResolvedValue({
      outcome: "not_configured",
      summary: "",
      coverageGaps: ["Setup needed"],
      candidates: [],
      findings: [],
      errorCode: "NOT_CONFIGURED",
      toolCalls: 0,
    });
    expect(await runWebResearch(client, request)).toMatchObject({
      ok: true,
      data: { outcome: "not_configured" },
    });
    const failurePredicate = mocks.guard.mock.calls[0][7];
    expect(failurePredicate({ outcome: "not_configured" })).toBe(true);
    expect(failurePredicate({ outcome: "failed" })).toBe(true);
    expect(failurePredicate({ outcome: "empty" })).toBe(false);
    expect(failurePredicate({ outcome: "partial" })).toBe(false);
  });
  it("rechecks access after research and never commits for a revoked actor", async () => {
    mocks.access.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect(await runWebResearch(client, request)).toMatchObject({
      ok: false,
      code: "FORBIDDEN",
    });
    expect(mocks.adminRpc).not.toHaveBeenCalled();
  });
  it("refuses to commit after the authenticated identity changes", async () => {
    mocks.user
      .mockResolvedValueOnce({ user: { id: user } })
      .mockResolvedValueOnce({ user: { id: key } });
    expect(await runWebResearch(client, request)).toMatchObject({
      ok: false,
      code: "FORBIDDEN",
    });
    expect(mocks.adminRpc).not.toHaveBeenCalled();
  });
  it("requires both idea and draft capabilities for selection", async () => {
    mocks.ideas.mockResolvedValue(false);
    expect(
      (await createResearchPosts(client, { findingIds: [briefing] })).ok,
    ).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("creates separate posts only on explicit selection and retains failures for retry", async () => {
    const items = [
      { findingId: briefing, ideaId: key },
      { findingId: user, ideaId: client },
    ];
    mocks.rpc.mockResolvedValue({ data: { ok: true, items }, error: null });
    mocks.generate
      .mockResolvedValueOnce({ ok: true, data: { postId: user } })
      .mockResolvedValueOnce({
        ok: false,
        message: "Writing provider unavailable",
      });
    const result = await createResearchPosts(client, {
      findingIds: [briefing, user],
    });
    expect(result.ok && result.data.items).toEqual([
      { ...items[0], postId: user, error: null },
      { ...items[1], postId: null, error: "Writing provider unavailable" },
    ]);
    expect(mocks.generate.mock.calls).toEqual([
      [client, key, {}],
      [client, client, {}],
    ]);
  });
  it("saves exact prompt text with revision checking and logs only metadata", async () => {
    const prompt = "Research astronomy.\nKeep this exact formatting.";
    mocks.rpc.mockResolvedValue({
      data: { ok: true, revision: 2 },
      error: null,
    });
    expect(
      (
        await saveWebResearchSettings(client, {
          prompt,
          lookbackDays: 2,
          useProfileContext: false,
          expectedRevision: 1,
        })
      ).ok,
    ).toBe(true);
    expect(mocks.rpc.mock.calls[0][1].p_prompt).toBe(prompt);
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain(prompt);
  });
});
