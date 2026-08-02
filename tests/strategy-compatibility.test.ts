import { describe, expect, it } from "vitest";

import {
  buildStrategyCompatibility,
  validatePlanAgainstCompatibility,
} from "@/lib/ai/playbooks/strategy-compatibility";

import { planFixture, resourcesFixture } from "./fixtures/generation-inputs";

function compatibility(
  overrides: Partial<Parameters<typeof buildStrategyCompatibility>[0]> = {},
) {
  return buildStrategyCompatibility({
    sourceMode: "founder_experience",
    hasDocumentedBeforeAfter: false,
    hasDocumentedResult: false,
    hasDocumentedMistake: false,
    approvedResourceIds: [],
    commentGateEligible: false,
    ...overrides,
  });
}

describe("strategy compatibility", () => {
  it("removes evidence-dependent choices when their evidence is absent", () => {
    const catalog = compatibility();

    expect(catalog.angleTypes).not.toContain("before_after");
    expect(catalog.angleTypes).not.toContain("mistake_lesson");
    expect(catalog.postStructures).not.toContain("case_study_before_after");
    expect(catalog.bodyFrameworks).not.toContain("bab");
    expect(catalog.hookTypes).not.toContain("specific_result");
  });

  it("prevents TrendCard-only lived-experience archetypes", () => {
    const catalog = compatibility({
      sourceMode: "trend_card",
      hasDocumentedBeforeAfter: true,
      hasDocumentedResult: true,
      hasDocumentedMistake: true,
    });

    expect(catalog.contentArchetypes).not.toContain("narrative_insight");
    expect(catalog.contentArchetypes).not.toContain("behind_the_build");
    expect(catalog.angleTypes).not.toContain("case_example");
  });

  it("enables resource posts only with an approved resource and cadence capacity", () => {
    const resourceId = resourcesFixture[0]!.id;
    const enabled = compatibility({
      approvedResourceIds: [resourceId],
      commentGateEligible: true,
      hasDocumentedMistake: true,
    });
    const blockedByCadence = compatibility({
      approvedResourceIds: [resourceId],
      commentGateEligible: false,
      hasDocumentedMistake: true,
    });
    const resourcePlan = {
      ...planFixture,
      execution: {
        ...planFixture.execution,
        contentArchetype: "resource_post" as const,
        ctaType: "comment_gate" as const,
        resourceId,
      },
    };

    expect(validatePlanAgainstCompatibility(resourcePlan, enabled)).toEqual([]);
    expect(
      validatePlanAgainstCompatibility(resourcePlan, blockedByCadence),
    ).toContain("incompatible_content_archetype");
  });
});
