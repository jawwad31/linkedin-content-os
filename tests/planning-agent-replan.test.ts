import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/openrouter/client", () => ({
  getOpenRouterConfig: vi.fn(() => ({ apiKey: "test-key", model: "test-model" })),
  requestStructuredCompletion: vi.fn(),
}));

vi.mock("@/lib/llm/log", () => ({
  writeLlmLog: vi.fn(async () => undefined),
}));

import { requestStructuredCompletion } from "@/lib/openrouter/client";
import {
  replanContentIdea,
  type PlanningBusinessContext,
  type PlanningSourceContext,
  type ReplanningIdeaInput,
} from "@/features/ideas/agents/planning-agent";

import { compatibilityFixture, planFixture, resourcesFixture } from "./fixtures/generation-inputs";

const businessContext: PlanningBusinessContext = {
  industry: "B2B SaaS",
  businessDescription: "Helps revenue teams improve pipeline quality.",
  primaryIcp: "VP Sales at a 50-200 person B2B SaaS company",
  mainOffer: "Revenue operations advisory",
  approvedProof: [],
  bannedTopics: [],
};

const sourceContext: PlanningSourceContext = {
  mode: "trend_card",
  sourceId: "22222222-2222-4222-8222-222222222222",
  sourceTitle: "Buying committees are expanding",
  source: { title: "Buying committees are expanding" },
  sourceArticles: [],
};

const ideaInput: ReplanningIdeaInput = {
  angle: "Buying committees are expanding",
  buyerPain: "Champions cannot carry the decision alone.",
  commercialRelevance: "Deals stall without cross-functional buy-in.",
  beliefShift: "One champion can win a deal -> Champions need a wider case.",
  contentPillar: "buying committees",
  angleBoundary: "Stay within the supplied market signal.",
  sourceContext: "The supplied TrendCard.",
  proofNotes: "Use only the supplied market signal.",
  founderDirection: null,
};

function callReplan() {
  return replanContentIdea({
    clientId: "11111111-1111-4111-8111-111111111111",
    userId: "22222222-2222-4222-8222-222222222222",
    businessContext,
    sourceContext,
    idea: ideaInput,
    strategyOverrides: {},
    compatibility: compatibilityFixture("trend_card"),
    resources: resourcesFixture,
  });
}

describe("replanContentIdea overreach guardrail", () => {
  it("returns a blocked reason instead of a generic error when the model marks the strategy blocked", async () => {
    vi.mocked(requestStructuredCompletion).mockResolvedValueOnce({
      ok: true,
      data: {
        generation_plan: {
          ...planFixture,
          sourceMode: "trend_card",
          strategy: { ...planFixture.strategy, readiness: "blocked" },
        },
      },
    } as never);

    const result = await callReplan();
    expect(result).toEqual({ ok: false, reason: "blocked" });
  });

  it("returns the plan when readiness is ready and the plan is compatible", async () => {
    vi.mocked(requestStructuredCompletion).mockResolvedValueOnce({
      ok: true,
      data: {
        generation_plan: {
          ...planFixture,
          sourceMode: "trend_card",
          execution: { ...planFixture.execution, contentArchetype: "framework_post" },
        },
      },
    } as never);

    const result = await callReplan();
    expect(result.ok).toBe(true);
  });

  it("still returns a generic error for an incompatible but 'ready' plan", async () => {
    vi.mocked(requestStructuredCompletion).mockResolvedValueOnce({
      ok: true,
      data: {
        generation_plan: {
          ...planFixture,
          sourceMode: "trend_card",
        },
      },
    } as never);

    const result = await callReplan();
    expect(result).toEqual({ ok: false, reason: "error" });
  });
});
