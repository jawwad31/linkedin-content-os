import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GenerationPlanV2 } from "@/lib/ai/playbooks/contracts";
import type { DeterministicCheckIssue } from "@/lib/ai/playbooks/deterministic-checks";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/access/client-access", () => ({
  canAccessClient: vi.fn(async () => true),
  canDraftPosts: vi.fn(async () => true),
  canUserDeleteBusinessRecords: vi.fn(async () => true),
}));

vi.mock("@/lib/supabase/session", () => ({
  getServerUser: vi.fn(async () => ({ user: { id: USER_ID } })),
}));

vi.mock("@/lib/audit/log", () => ({ writeAuditLog: vi.fn(async () => undefined) }));

vi.mock("@/features/posts/agents/content-agent", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/features/posts/agents/content-agent")
  >();
  return { ...actual, runContentAgent: vi.fn() };
});

vi.mock("@/features/posts/agents/review-agent", () => ({
  runReviewAgent: vi.fn(),
}));

vi.mock("@/features/ideas/agents/plan-lifecycle", () => ({
  decideGenerationPlan: vi.fn(() => ({ action: "reuse", plan: trendPlan })),
}));

vi.mock("@/lib/ai/playbooks/deterministic-checks", () => ({
  runDeterministicPostChecks: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => makeSupabaseClient(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => makeSupabaseClient(),
}));

import { runContentAgent } from "@/features/posts/agents/content-agent";
import { runReviewAgent } from "@/features/posts/agents/review-agent";
import { runDeterministicPostChecks } from "@/lib/ai/playbooks/deterministic-checks";
import { writeAuditLog } from "@/lib/audit/log";
import { generatePostFromIdea, getBusinessContext, loadSourceContext, produceReviewedPost, type ContentIdeaRow } from "@/features/posts/generate/service";
import { createAdminClient } from "@/lib/supabase/admin";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const IDEA_ID = "33333333-3333-4333-8333-333333333333";
const TREND_CARD_ID = "44444444-4444-4444-8444-444444444444";

/**
 * Mirrors the real failing idea: trend_card + framework_post +
 * comprehensive_breakdown + one_thing + belief_crack + utility_close.
 * Chosen so it genuinely passes the real compatibility validator.
 */
const trendPlan: GenerationPlanV2 = {
  sourceMode: "trend_card",
  strategy: {
    targetIcp: "B2B founders running outbound with a small GTM team",
    currentBelief: "Outbound underperforms because of targeting alone.",
    desiredBelief:
      "First-party signals are one useful input for sharpening targeting.",
    coreArgument:
      "Replies, CRM notes, and call transcripts can sharpen ICP and messaging decisions.",
    primarySourceAnchor:
      "The supplied signal describes first-party GTM data becoming a moat.",
    proofToUse: ["The supplied market signal only."],
    angleType: "trend_take",
    riskNotes: ["Do not claim a proven primary cause."],
    readiness: "ready",
  },
  execution: {
    contentArchetype: "framework_post",
    postStructure: "comprehensive_breakdown",
    bodyFramework: "one_thing",
    hookType: "belief_crack",
    ctaType: "utility_close",
    argumentOutline: [
      "Name the assumption about outbound.",
      "Show what first-party signals can inform.",
      "Close with the practical next step.",
    ],
    resourceId: null,
  },
  safety: {
    allowedClaims: ["First-party signals can inform targeting decisions."],
    claimBoundaries: ["Do not claim this is the main cause of underperformance."],
  },
};

const ideaRow = {
  id: IDEA_ID,
  source_type: "trend_card",
  source_ids_json: [TREND_CARD_ID],
  angle: "First-party GTM signals",
  buyer_pain: "Outbound is not converting.",
  commercial_relevance: "Wasted outbound spend.",
  content_pillar: "gtm",
  belief_shift: "targeting alone -> first-party signals help",
  angle_boundary: "Stay inside the supplied signal.",
  source_context: "The supplied TrendCard.",
  proof_notes: "Use only the supplied signal.",
  founder_direction: null,
  generation_plan: trendPlan,
  generation_plan_version: 2,
  generation_plan_input_hash: "stored-hash",
  strategy_overrides: {},
  selected_resource_id: null,
  status: "ready",
};

const clientRow = {
  industry: "B2B SaaS",
  business_description: "Helps GTM teams improve outbound.",
  primary_icp: "B2B founders running outbound",
  main_offer: "GTM advisory",
  approved_proof: [],
  banned_topics: [],
  founder_voice_sample: "Direct and operational.",
  founder_voice_examples: [],
  phrases_to_use: [],
  phrases_to_avoid: [],
};

const trendCardRow = {
  id: TREND_CARD_ID,
  title: "First-party GTM signals become the new moat",
  shift: "Teams are leaning on first-party GTM data.",
  why_it_matters: "Third-party data quality is degrading.",
  relevance_to_icp: "Outbound teams feel this first.",
  content_angle: "What first-party data actually informs.",
  source_item_ids_json: [],
  confidence_score: 8,
  founder_take: null,
  approved_for_ideas: true,
  week_of: null,
};

/** Records every table operation so tests can assert no post was inserted. */
let dbOps: Array<{ table: string; ops: string[] }> = [];
let calendarSlotRow: { id: string } | null = null;

function makeSupabaseClient() {
  return {
    from(table: string) {
      const ops: string[] = [];
      const record = { table, ops };
      dbOps.push(record);

      const resolve = (): { data: unknown; error: unknown } => {
        const isInsert = ops.includes("insert");
        const isUpdate = ops.includes("update");
        const isList = ops.includes("returns");

        if (table === "clients") return { data: clientRow, error: null };
        if (table === "calendar_slots") return { data: calendarSlotRow, error: null };
        if (table === "content_ideas") {
          if (isUpdate) return { data: { id: IDEA_ID }, error: null };
          return { data: ideaRow, error: null };
        }
        if (table === "trend_cards") return { data: trendCardRow, error: null };
        if (table === "market_signal_items") return { data: [], error: null };
        if (table === "content_resources") return { data: [], error: null };
        if (table === "posts") {
          if (isInsert) return { data: { id: "inserted-post" }, error: null };
          if (isList) return { data: [], error: null };
          return { data: null, error: null };
        }
        return { data: null, error: null };
      };

      const proxy: Record<string, unknown> = new Proxy(
        {},
        {
          get(_target, prop: string) {
            if (prop === "then") return undefined;
            return (...args: unknown[]) => {
              ops.push(prop);
              if (prop === "insert" || prop === "update") {
                ops.push(`${prop}:${JSON.stringify(args[0])}`);
              }
              if (prop === "maybeSingle" || prop === "returns" || prop === "single") {
                return Promise.resolve(resolve());
              }
              return proxy;
            };
          },
        },
      );
      return proxy;
    },
    rpc: vi.fn(async () => ({ data: null, error: null })),
  };
}

const passingChecks = {
  sourceFidelity: "pass",
  credibility: "pass",
  icpFit: "pass",
  beliefShiftClarity: "pass",
  voice: "pass",
  structure: "pass",
  ctaFit: "pass",
  readability: "pass",
} as const;

function qa(overrides: Record<string, unknown> = {}) {
  return {
    verdict: "revised",
    finalPost: "Reviewed post body.\n\nSave this for your next pipeline review.",
    finalCta: "Save this for your next pipeline review.",
    proofNotes: "Only the supplied signal.",
    riskNotes: "No causal claim.",
    checks: passingChecks,
    issues: [],
    revisionsMade: [],
    formatRecommendation: {
      primaryFormat: "text",
      alternativeFormats: [],
      rationale: "Voice-led argument.",
      adaptationNotes: [],
    },
    ...overrides,
  };
}

function postWasInserted() {
  return dbOps.some(
    (record) => record.table === "posts" && record.ops.includes("insert"),
  );
}

function ideaWasMarkedUsed() {
  return dbOps.some(
    (record) =>
      record.table === "content_ideas" &&
      record.ops.some((op) => op.startsWith("update:") && op.includes('"used"')),
  );
}

function warningAudits() {
  return vi
    .mocked(writeAuditLog)
    .mock.calls.map((call) => call[0])
    .filter((entry) => entry.action === "post_generated_with_warnings");
}

/** The row the service passed to posts.insert(), parsed back out. */
function insertedPost(): Record<string, unknown> | null {
  for (const record of dbOps) {
    if (record.table !== "posts") continue;
    const op = record.ops.find((entry) => entry.startsWith("insert:"));
    if (op) return JSON.parse(op.slice("insert:".length));
  }
  return null;
}

function storedWarnings(): string[] {
  const post = insertedPost();
  const qaResult = post?.qa_result as Record<string, unknown> | undefined;
  return (qaResult?.warnings as string[]) ?? [];
}

function queueDeterministic(results: DeterministicCheckIssue[][]) {
  const queue = [...results];
  vi.mocked(runDeterministicPostChecks).mockImplementation(
    () => queue.shift() ?? [],
  );
}

const UNSUPPORTED_NUMBER: DeterministicCheckIssue = {
  code: "unsupported_numeric_claim",
  detail: "Numeric claim is not present in approved evidence: 340%",
};

beforeEach(() => {
  dbOps = [];
  calendarSlotRow = null;
  // vi.fn() factory mocks are not auto-restored, so call history and any
  // queued mockResolvedValueOnce values would otherwise leak between tests.
  vi.mocked(writeAuditLog).mockClear();
  vi.mocked(runReviewAgent).mockReset();
  vi.mocked(runDeterministicPostChecks).mockReset();
  vi.mocked(runContentAgent).mockReset();
  vi.mocked(runContentAgent).mockResolvedValue({
    ok: true,
    draft: {
      hook: "Outbound is not only a targeting problem.",
      body: "Original drafted body.",
      cta: "Save this for your next pipeline review.",
      format: "text",
      proofUsed: "Supplied signal.",
      riskNotes: "No causal claim.",
    },
  } as never);
});

async function generate() {
  return generatePostFromIdea(CLIENT_ID, IDEA_ID, {});
}

describe("post generation warning paths", () => {
  it("stores the Content Agent draft when QA declines to finalise it", async () => {
    queueDeterministic([[], []]);
    vi.mocked(runReviewAgent).mockResolvedValueOnce({
      ok: true,
      qa: qa({
        verdict: "blocked",
        finalPost: null,
        finalCta: "",
        formatRecommendation: null,
        checks: { ...passingChecks, credibility: "fail" },
        issues: ["The core argument overstates the source."],
      }),
    } as never);

    const result = await generate();

    expect(result.ok).toBe(true);
    expect(postWasInserted()).toBe(true);
    expect(ideaWasMarkedUsed()).toBe(true);

    const post = insertedPost();
    expect(post?.final_post).toContain("Original drafted body");
    expect(post?.status).toBe("review");
    expect(storedWarnings()).toEqual(
      expect.arrayContaining(["qa_fallback_to_draft", "strategy_exceeds_source"]),
    );
    // A format recommendation is still required by the posts schema.
    expect(
      (post?.format_recommendation as Record<string, unknown>)?.primaryFormat,
    ).toBe("text");
  });

  it("surfaces warnings in the post's risk notes", async () => {
    queueDeterministic([[], [UNSUPPORTED_NUMBER], [UNSUPPORTED_NUMBER]]);
    vi.mocked(runReviewAgent)
      .mockResolvedValueOnce({ ok: true, qa: qa() } as never)
      .mockResolvedValueOnce({ ok: true, qa: qa() } as never);

    await generate();

    const riskNotes = String(insertedPost()?.risk_notes ?? "");
    expect(riskNotes).toContain("No causal claim.");
    expect(riskNotes).toContain("AI review flag:");
    expect(riskNotes).toContain("not present in approved evidence");
  });

  it("gives the corrective retry the reviewed post and the exact findings", async () => {
    const firstReview = qa({ finalPost: "Reviewed body with 340% claim." });
    queueDeterministic([[], [UNSUPPORTED_NUMBER], []]);
    vi.mocked(runReviewAgent)
      .mockResolvedValueOnce({ ok: true, qa: firstReview } as never)
      .mockResolvedValueOnce({ ok: true, qa: qa() } as never);

    const result = await generate();

    expect(result.ok).toBe(true);
    expect(vi.mocked(runReviewAgent)).toHaveBeenCalledTimes(2);

    const corrective = vi.mocked(runReviewAgent).mock.calls[1][0];
    expect(corrective.draft.body).toBe(firstReview.finalPost);
    expect(corrective.draft.cta).toBe(firstReview.finalCta);
    expect(corrective.deterministicIssues).toEqual([UNSUPPORTED_NUMBER]);
    expect(corrective.priorQa).toBe(firstReview);

    const original = vi.mocked(runReviewAgent).mock.calls[0][0];
    expect(corrective.draft.body).not.toBe(original.draft.body);
  });

  it("keeps the first reviewed post when the corrective pass declines to finalise", async () => {
    const firstReview = qa({ finalPost: "First reviewed body." });
    queueDeterministic([[], [UNSUPPORTED_NUMBER]]);
    vi.mocked(runReviewAgent)
      .mockResolvedValueOnce({ ok: true, qa: firstReview } as never)
      .mockResolvedValueOnce({
        ok: true,
        qa: qa({
          verdict: "blocked",
          finalPost: null,
          finalCta: "",
          formatRecommendation: null,
        }),
      } as never);

    const result = await generate();

    expect(result.ok).toBe(true);
    expect(insertedPost()?.final_post).toBe("First reviewed body.");
    expect(storedWarnings()).toContain("unsupported_numeric_claim");
  });

  it("stores the post with warnings when findings survive the retry", async () => {
    queueDeterministic([[], [UNSUPPORTED_NUMBER], [UNSUPPORTED_NUMBER]]);
    vi.mocked(runReviewAgent)
      .mockResolvedValueOnce({ ok: true, qa: qa() } as never)
      .mockResolvedValueOnce({ ok: true, qa: qa() } as never);

    const result = await generate();

    expect(result.ok).toBe(true);
    expect(postWasInserted()).toBe(true);
    expect(ideaWasMarkedUsed()).toBe(true);
    expect(storedWarnings()).toContain("unsupported_numeric_claim");
    expect(warningAudits()[0]?.metadata).toMatchObject({
      idea_id: IDEA_ID,
      source_type: "trend_card",
      warning_codes: ["unsupported_numeric_claim"],
    });
  });

  it("writes no warnings and no warning audit for a clean generation", async () => {
    queueDeterministic([[], []]);
    vi.mocked(runReviewAgent).mockResolvedValueOnce({
      ok: true,
      qa: qa({ verdict: "pass" }),
    } as never);

    const result = await generate();

    expect(result.ok).toBe(true);
    expect(storedWarnings()).toEqual([]);
    expect(warningAudits()).toHaveLength(0);
    const riskNotes = String(insertedPost()?.risk_notes ?? "");
    expect(riskNotes).not.toContain("AI review flag:");
  });

  it("never leaks draft text, findings detail, or source content into the audit", async () => {
    queueDeterministic([[], [UNSUPPORTED_NUMBER], [UNSUPPORTED_NUMBER]]);
    vi.mocked(runReviewAgent)
      .mockResolvedValueOnce({
        ok: true,
        qa: qa({ finalPost: "Reviewed body with 340% claim." }),
      } as never)
      .mockResolvedValueOnce({ ok: true, qa: qa() } as never);

    await generate();

    const auditPayload = JSON.stringify(warningAudits());

    for (const secret of [
      "340%",
      "Reviewed body",
      "Original drafted body",
      trendCardRow.shift,
      clientRow.business_description,
      UNSUPPORTED_NUMBER.detail,
    ]) {
      expect(auditPayload).not.toContain(secret);
    }
  });
});

describe("Calendar writer cancellation gates", () => {
  async function produce(shouldContinue: () => Promise<boolean>) {
    const admin = createAdminClient();
    const businessContext = await getBusinessContext(admin,CLIENT_ID);
    const source = await loadSourceContext(admin,CLIENT_ID,ideaRow as ContentIdeaRow);
    if (!businessContext || !source.ok) throw new Error("Fixture source is unavailable");
    return produceReviewedPost({clientId:CLIENT_ID,userId:USER_ID,businessContext,
      idea:ideaRow as ContentIdeaRow,sourceContext:source.sourceContext,resources:[],commentGateEligible:true,shouldContinue});
  }
  it("does not call the writer when its lease is already lost",async () => {
    expect((await produce(async () => false)).ok).toBe(false);
    expect(runContentAgent).not.toHaveBeenCalled(); expect(runReviewAgent).not.toHaveBeenCalled();
  });
  it("does not call QA after cancellation between provider stages",async () => {
    queueDeterministic([[]]);
    const gate=vi.fn().mockResolvedValueOnce(true).mockResolvedValue(false);
    expect((await produce(gate)).ok).toBe(false);
    expect(runContentAgent).toHaveBeenCalledTimes(1); expect(runReviewAgent).not.toHaveBeenCalled();
  });
  it("routes unfinished calendar backing ideas through the batch before any paid work",async () => {
    calendarSlotRow={id:"slot"};
    const result=await generate();
    expect(!result.ok && result.code).toBe("CALENDAR_ASSIGNMENT");
    expect(runContentAgent).not.toHaveBeenCalled(); expect(postWasInserted()).toBe(false);
  });
});
