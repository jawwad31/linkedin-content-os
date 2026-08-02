import { describe, expect, it } from "vitest";

import { decideGenerationPlan } from "@/features/ideas/agents/plan-lifecycle";
import {
  applyStrategyOverrides,
  GENERATION_PLAN_VERSION,
  formatRecommendationSchema,
  generationPlanV2Schema,
} from "@/lib/ai/playbooks/contracts";
import { computeGenerationPlanInputHash } from "@/lib/ai/playbooks/plan-hash";
import {
  ANGLE_TYPES,
  BODY_FRAMEWORKS,
  CONTENT_ARCHETYPES,
  CTA_TYPES,
  HOOK_TYPES,
  POST_STRUCTURES,
  SOURCE_MODES,
} from "@/lib/ai/playbooks/taxonomies";

import { planFixture } from "./fixtures/generation-inputs";

const hashInput = {
  businessContext: { primaryIcp: "VP Sales" },
  selectedSource: { sourceMode: "founder_experience", source: "review" },
  idea: { angle: "Fix routing first" },
  founderDirection: null,
  strategyOverrides: {},
  resourceState: [],
  commentGateEligible: true,
};

describe("GenerationPlanV2", () => {
  it("enforces every fixed taxonomy and the resource-post semantic contract", () => {
    expect(SOURCE_MODES).toHaveLength(3);
    expect(ANGLE_TYPES).toHaveLength(15);
    expect(CONTENT_ARCHETYPES).toHaveLength(6);
    expect(POST_STRUCTURES).toHaveLength(4);
    expect(BODY_FRAMEWORKS).toHaveLength(6);
    expect(HOOK_TYPES).toHaveLength(7);
    expect(CTA_TYPES).toHaveLength(7);
    expect(generationPlanV2Schema.parse(planFixture)).toEqual(planFixture);
    expect(
      generationPlanV2Schema.safeParse({
        ...planFixture,
        execution: {
          ...planFixture.execution,
          contentArchetype: "resource_post",
        },
      }).success,
    ).toBe(false);
  });

  it("applies only safe strategy overrides", () => {
    const result = applyStrategyOverrides(planFixture, {
      angleType: "diagnostic",
      ctaType: "none",
    });
    expect(result.strategy.angleType).toBe("diagnostic");
    expect(result.execution.ctaType).toBe("none");
    expect(result.strategy.coreArgument).toBe(planFixture.strategy.coreArgument);
  });

  it("keeps format recommendations advisory and internally consistent", () => {
    expect(
      formatRecommendationSchema.safeParse({
        primaryFormat: "carousel",
        alternativeFormats: ["video", "newsletter"],
        rationale: "The argument has a clear sequence worth visualizing.",
        adaptationNotes: ["Turn each operating step into one slide."],
      }).success,
    ).toBe(true);
    expect(
      formatRecommendationSchema.safeParse({
        primaryFormat: "carousel",
        alternativeFormats: ["carousel"],
        rationale: "Duplicate format.",
        adaptationNotes: [],
      }).success,
    ).toBe(false);
  });
});

describe("plan hashing and reuse", () => {
  it("is order-stable and changes for every replanning input", () => {
    const base = computeGenerationPlanInputHash(hashInput);
    expect(
      computeGenerationPlanInputHash({
        ...hashInput,
        businessContext: { primaryIcp: "VP Sales" },
      }),
    ).toBe(base);
    expect(
      computeGenerationPlanInputHash({
        ...hashInput,
        founderDirection: "Focus on qualification.",
      }),
    ).not.toBe(base);
    expect(
      computeGenerationPlanInputHash({
        ...hashInput,
        businessContext: { primaryIcp: "CRO" },
      }),
    ).not.toBe(base);
    expect(
      computeGenerationPlanInputHash({
        ...hashInput,
        strategyOverrides: { ctaType: "none" },
      }),
    ).not.toBe(base);
    expect(
      computeGenerationPlanInputHash({
        ...hashInput,
        commentGateEligible: false,
      }),
    ).not.toBe(base);
  });

  it("reuses only current compatible plans", () => {
    const currentHash = computeGenerationPlanInputHash(hashInput);
    expect(
      decideGenerationPlan({
        plan: null,
        version: null,
        storedInputHash: null,
        currentInputHash: currentHash,
        sourceMode: "founder_experience",
      }),
    ).toEqual({ action: "replan", reason: "missing" });
    expect(
      decideGenerationPlan({
        plan: planFixture,
        version: GENERATION_PLAN_VERSION,
        storedInputHash: currentHash,
        currentInputHash: currentHash,
        sourceMode: "founder_experience",
      }).action,
    ).toBe("reuse");
    expect(
      decideGenerationPlan({
        plan: planFixture,
        version: 1,
        storedInputHash: currentHash,
        currentInputHash: currentHash,
        sourceMode: "founder_experience",
      }),
    ).toEqual({ action: "replan", reason: "incompatible" });
    expect(
      decideGenerationPlan({
        plan: planFixture,
        version: GENERATION_PLAN_VERSION,
        storedInputHash: currentHash,
        currentInputHash: "different",
        sourceMode: "founder_experience",
      }),
    ).toEqual({ action: "replan", reason: "outdated" });
    expect(
      decideGenerationPlan({
        plan: planFixture,
        version: GENERATION_PLAN_VERSION,
        storedInputHash: currentHash,
        currentInputHash: currentHash,
        sourceMode: "trend_card",
      }),
    ).toEqual({ action: "replan", reason: "incompatible" });
  });
});
