import { describe, expect, it } from "vitest";

import { runDeterministicPostChecks } from "@/lib/ai/playbooks/deterministic-checks";

import { planFixture, sourceFixture } from "./fixtures/generation-inputs";

function codes(finalPost: string, overrides: Record<string, unknown> = {}) {
  return runDeterministicPostChecks({
    finalPost,
    cta: "Comment YES and follow me?",
    plan: planFixture,
    approvedProof: ["The review found 12% duplicate routing."],
    selectedSource: sourceFixture("founder_experience"),
    phrasesToAvoid: ["game-changing"],
    bannedTopics: ["crypto"],
    ...overrides,
  }).map((issue) => issue.code);
}

describe("deterministic post checks", () => {
  it("finds scaffolding, banned language, invented numbers, and multiple CTAs", () => {
    const result = codes(
      'Buyer pain: Crypto routing became "perfect overnight" and improved 47%. Game-changing.',
    );
    expect(result).toContain("internal_scaffolding");
    expect(result).toContain("banned_phrase");
    expect(result).toContain("banned_topic");
    expect(result).toContain("unsupported_numeric_claim");
    expect(result).toContain("unsupported_quote");
    expect(result).toContain("excessive_cta");
  });

  it("allows numbers and quotes present in approved evidence", () => {
    const result = runDeterministicPostChecks({
      finalPost: 'The review found 12% duplicate routing and documented "fix routing first".',
      cta: "Check routing first.",
      plan: planFixture,
      approvedProof: ['The review found 12% duplicate routing and said "fix routing first".'],
      selectedSource: sourceFixture("founder_experience"),
      phrasesToAvoid: [],
      bannedTopics: [],
    });
    expect(result.map((issue) => issue.code)).not.toContain(
      "unsupported_numeric_claim",
    );
    expect(result.map((issue) => issue.code)).not.toContain("unsupported_quote");
  });

  it("prevents TrendCard-only lived-experience framing", () => {
    const trendPlan = { ...planFixture, sourceMode: "trend_card" as const };
    const result = runDeterministicPostChecks({
      finalPost: "I've noticed every buying committee is expanding.",
      cta: "",
      plan: trendPlan,
      approvedProof: [],
      selectedSource: sourceFixture("trend_card"),
      phrasesToAvoid: [],
      bannedTopics: [],
    });
    expect(result.map((issue) => issue.code)).toContain("source_mode_drift");
  });

  it("does not treat ordered-list markers as numeric claims", () => {
    const result = runDeterministicPostChecks({
      finalPost: "1. Fix routing.\n2. Check qualification.",
      cta: "",
      plan: {
        ...planFixture,
        execution: { ...planFixture.execution, ctaType: "none" },
      },
      approvedProof: [],
      selectedSource: sourceFixture("founder_experience"),
      phrasesToAvoid: [],
      bannedTopics: [],
    });
    expect(result.map((issue) => issue.code)).not.toContain(
      "unsupported_numeric_claim",
    );
    expect(result.map((issue) => issue.code)).not.toContain("excessive_cta");
  });

  it("allows an ICP descriptor number from the saved primary ICP", () => {
    const result = runDeterministicPostChecks({
      finalPost: "If you run a $500k-$10M ARR team, routing matters.",
      cta: "",
      plan: planFixture,
      approvedProof: [],
      selectedSource: sourceFixture("founder_experience"),
      phrasesToAvoid: [],
      bannedTopics: [],
      primaryIcp: "VP Sales at a $500k-$10M ARR B2B SaaS company",
    }).map((issue) => issue.code);
    expect(result).not.toContain("unsupported_numeric_claim");
  });

  it("still flags an unsupported performance number even with an ICP range saved", () => {
    const result = runDeterministicPostChecks({
      finalPost: "We improved close rates by 47% this quarter.",
      cta: "",
      plan: planFixture,
      approvedProof: [],
      selectedSource: sourceFixture("founder_experience"),
      phrasesToAvoid: [],
      bannedTopics: [],
      primaryIcp: "VP Sales at a $500k-$10M ARR B2B SaaS company",
    }).map((issue) => issue.code);
    expect(result).toContain("unsupported_numeric_claim");
  });

  it("never lets the plan's own targetIcp authorize a number the user did not save", () => {
    const selfAuthorizingPlan = {
      ...planFixture,
      strategy: {
        ...planFixture.strategy,
        targetIcp: "teams that grew revenue 340% last year",
      },
    };
    const result = runDeterministicPostChecks({
      finalPost: "Our clients grew revenue 340% last year.",
      cta: "",
      plan: selfAuthorizingPlan,
      approvedProof: [],
      selectedSource: sourceFixture("founder_experience"),
      phrasesToAvoid: [],
      bannedTopics: [],
      primaryIcp: "VP Sales at a 50-200 person B2B SaaS company",
    }).map((issue) => issue.code);
    expect(result).toContain("unsupported_numeric_claim");
  });

  it("allows non-experiential 'we have' phrasing on a TrendCard but blocks lived-experience framing", () => {
    const trendPlan = { ...planFixture, sourceMode: "trend_card" as const };
    function drift(finalPost: string) {
      return runDeterministicPostChecks({
        finalPost,
        cta: "",
        plan: trendPlan,
        approvedProof: [],
        selectedSource: sourceFixture("trend_card"),
        phrasesToAvoid: [],
        bannedTopics: [],
      }).map((issue) => issue.code);
    }

    for (const allowed of [
      "We have entered a new era of buying committees.",
      "We have more options now than a year ago.",
    ]) {
      expect(drift(allowed)).not.toContain("source_mode_drift");
    }

    for (const blocked of [
      "I've seen this pattern firsthand with every buying committee.",
      "I have seen this pattern before.",
      "I have personally seen this pattern before.",
      "We have repeatedly noticed this pattern.",
      "I have worked with dozens of teams on this.",
    ]) {
      expect(drift(blocked)).toContain("source_mode_drift");
    }
  });

  it("does not double-count a repeated imperative for a single ask, but still flags distinct stacked asks", () => {
    const singleAsk = runDeterministicPostChecks({
      finalPost: "Save this checklist for later.",
      cta: "Save this — really, just save it.",
      plan: planFixture,
      approvedProof: [],
      selectedSource: sourceFixture("founder_experience"),
      phrasesToAvoid: [],
      bannedTopics: [],
    }).map((issue) => issue.code);
    expect(singleAsk).not.toContain("excessive_cta");

    const stackedAsk = runDeterministicPostChecks({
      finalPost: "Save this checklist and share it with your team.",
      cta: "Save this checklist and share it with your team.",
      plan: planFixture,
      approvedProof: [],
      selectedSource: sourceFixture("founder_experience"),
      phrasesToAvoid: [],
      bannedTopics: [],
    }).map((issue) => issue.code);
    expect(stackedAsk).toContain("excessive_cta");
  });

  it("requires an approved resource, exact pairing, and the saved keyword", () => {
    const resourceId = "66666666-6666-4666-8666-666666666666";
    const resourcePlan = {
      ...planFixture,
      execution: {
        ...planFixture.execution,
        contentArchetype: "resource_post" as const,
        ctaType: "comment_gate" as const,
        resourceId,
      },
    };
    const base = {
      finalPost: "Use this checklist to inspect routing. Comment ROUTING.",
      cta: "Comment ROUTING.",
      plan: resourcePlan,
      approvedProof: [],
      selectedSource: sourceFixture("founder_experience"),
      phrasesToAvoid: [],
      bannedTopics: [],
    };

    expect(
      runDeterministicPostChecks({
        ...base,
        selectedResource: { id: resourceId, keyword: "ROUTING" },
      }).map((issue) => issue.code),
    ).not.toContain("invalid_resource_post");
    expect(
      runDeterministicPostChecks({
        ...base,
        selectedResource: { id: resourceId, keyword: "CHECKLIST" },
      }).map((issue) => issue.code),
    ).toContain("invalid_resource_post");
  });
});
