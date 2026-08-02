import { describe, expect, it } from "vitest";

import type { GenerationPlanV2 } from "@/lib/ai/playbooks/contracts";
import { runDeterministicPostChecks } from "@/lib/ai/playbooks/deterministic-checks";

import {
  businessContextFixture,
  planFixture,
  sourceFixture,
} from "./fixtures/generation-inputs";

const fixtures: Array<{
  mode: GenerationPlanV2["sourceMode"];
  plan: GenerationPlanV2;
  post: string;
  cta: string;
  expectedBuyerLanguage: string;
}> = [
  {
    mode: "founder_experience",
    plan: planFixture,
    post:
      "More lead volume could not fix this routing problem.\n\nWe found 12% duplicate routing in the documented review.\n\nThe operating rule was simple: fix routing and qualification before adding volume.\n\nCheck routing before rewriting acquisition targets.",
    cta: "Check routing before rewriting acquisition targets.",
    expectedBuyerLanguage: "routing",
  },
  {
    mode: "trend_card",
    plan: {
      ...planFixture,
      sourceMode: "trend_card",
      strategy: {
        ...planFixture.strategy,
        currentBelief: "One champion can carry a software decision.",
        desiredBelief: "Champions need material for a wider buying committee.",
        coreArgument:
          "Prepare the champion for a wider committee before the decision stalls.",
        primarySourceAnchor:
          "The supplied signal describes broader software buying committees.",
        proofToUse: [
          "The supplied signal describes broader buying committees.",
        ],
        angleType: "trend_take",
        riskNotes: ["Do not claim a universal buyer pattern."],
      },
      execution: {
        ...planFixture.execution,
        contentArchetype: "data_backed_observation",
        bodyFramework: "one_thing",
        hookType: "stakes",
        ctaType: "pov_close",
      },
      safety: {
        allowedClaims: ["Buying committees are expanding in the supplied signal."],
        claimBoundaries: ["Do not claim a universal buyer pattern."],
      },
    },
    post:
      "A strong internal champion is no longer the whole buying process.\n\nThe supplied market signal points to more functions joining software decisions.\n\nSales teams should give champions the language and evidence needed for that wider room.\n\nEnable the committee, not only the champion.",
    cta: "Enable the committee, not only the champion.",
    expectedBuyerLanguage: "sales teams",
  },
  {
    mode: "trend_reaction",
    plan: {
      ...planFixture,
      sourceMode: "trend_reaction",
      strategy: {
        ...planFixture.strategy,
        currentBelief: "The market shift only changes sales messaging.",
        desiredBelief: "The shift changes how internal champions are equipped.",
        coreArgument:
          "Equip internal champions for cross-functional decisions.",
        primarySourceAnchor:
          "The recorded founder reaction focuses on supporting internal champions.",
        proofToUse: [
          "The recorded reaction focuses on internal champions.",
        ],
        angleType: "operator_pov",
        riskNotes: ["Do not invent a customer example."],
      },
      execution: {
        ...planFixture.execution,
        contentArchetype: "contrarian_take",
        bodyFramework: "contrarian_reframe",
        hookType: "declarative_pov",
        ctaType: "none",
      },
      safety: {
        allowedClaims: ["The founder believes champions need better internal material."],
        claimBoundaries: ["Do not invent a customer example."],
      },
    },
    post:
      "I think the practical response to wider buying committees is being framed too narrowly.\n\nThis is not only a messaging change.\n\nIt changes what an internal champion needs to explain the decision across functions.\n\nThe champion needs an internal case, not another follow-up sequence.",
    cta: "",
    expectedBuyerLanguage: "internal champion",
  },
];

describe("representative source-mode quality fixtures", () => {
  it.each(fixtures)(
    "meets the proof-safety and content-quality rubric for $mode",
    ({ mode, plan, post, cta, expectedBuyerLanguage }) => {
      const issues = runDeterministicPostChecks({
        finalPost: post,
        cta,
        plan,
        approvedProof: businessContextFixture.approvedProof,
        selectedSource: sourceFixture(mode),
        phrasesToAvoid: businessContextFixture.phrasesToAvoid,
        bannedTopics: businessContextFixture.bannedTopics,
      });

      expect(issues).toEqual([]);
      expect(post.toLowerCase()).toContain(expectedBuyerLanguage);
      expect(post.toLowerCase()).not.toContain("belief shift:");
      expect(post.split(/\n\s*\n/).length).toBeGreaterThanOrEqual(3);
    },
  );
});
