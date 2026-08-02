import type {
  ContentAgentBusinessContext,
  ContentAgentIdeaContext,
  ContentAgentSourceContext,
} from "@/features/posts/agents/content-agent";
import type { GenerationPlanV2 } from "@/lib/ai/playbooks/contracts";
import {
  buildStrategyCompatibility,
  type StrategyCompatibility,
} from "@/lib/ai/playbooks/strategy-compatibility";
import type { PlanningResource } from "@/features/ideas/agents/planning-agent";

export const businessContextFixture: ContentAgentBusinessContext = {
  industry: "B2B SaaS",
  businessDescription: "Helps revenue teams improve pipeline quality.",
  primaryIcp: "VP Sales at a 50-200 person B2B SaaS company",
  mainOffer: "Revenue operations advisory",
  approvedProof: ["A documented client reduced duplicate routing by 12%."],
  bannedTopics: ["crypto"],
  founderVoiceSample: "Direct, calm, and operational.",
  founderVoiceExamples: [
    {
      label: "Direct operator post",
      text: "Fix the handoff before adding more volume.",
      url: null,
    },
  ],
  phrasesToUse: ["operating system"],
  phrasesToAvoid: ["game-changing"],
};

export const planFixture: GenerationPlanV2 = {
  sourceMode: "founder_experience",
  strategy: {
    targetIcp: "VP Sales at a 50-200 person B2B SaaS company",
    currentBelief: "More leads will fix weak pipeline.",
    desiredBelief: "Pipeline quality depends on routing and qualification.",
    coreArgument: "Fix routing and qualification before increasing lead volume.",
    primarySourceAnchor: "The documented routing review found 12% duplicate routing.",
    proofToUse: ["The documented review found 12% duplicate routing."],
    angleType: "mistake_lesson",
    riskNotes: ["Do not generalize one review to all revenue teams."],
    readiness: "ready",
  },
  execution: {
    contentArchetype: "narrative_insight",
    postStructure: "conversational_story",
    bodyFramework: "mistake_lesson",
    hookType: "diagnostic",
    ctaType: "diagnostic_close",
    argumentOutline: [
      "Show why more volume could not repair routing.",
      "Use the documented duplicate-routing finding.",
      "Close with the operating rule.",
    ],
    resourceId: null,
  },
  safety: {
    allowedClaims: ["The team found duplicate routing in the documented review."],
    claimBoundaries: ["Do not claim a revenue result."],
  },
};

export function sourceFixture(
  sourceType: GenerationPlanV2["sourceMode"],
): ContentAgentSourceContext {
  if (sourceType === "founder_experience") {
    return {
      sourceType,
      sourceIds: ["11111111-1111-4111-8111-111111111111"],
      sourceTitle: "Routing review",
      source: {
        title: "Routing review",
        what_happened: "We found 12% duplicate routing.",
        what_was_learned: "Qualification had to be fixed before adding volume.",
      },
      sourceArticles: [],
    };
  }

  if (sourceType === "trend_card") {
    return {
      sourceType,
      sourceIds: ["22222222-2222-4222-8222-222222222222"],
      sourceTitle: "Buying committees are expanding",
      source: {
        title: "Buying committees are expanding",
        shift: "More functions are involved in software decisions.",
      },
      sourceArticles: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          title: "Committee buying",
          summary: "The supplied article describes broader buying committees.",
        },
      ],
    };
  }

  return {
    sourceType,
    sourceIds: [
      "44444444-4444-4444-8444-444444444444",
      "22222222-2222-4222-8222-222222222222",
    ],
    sourceTitle: "Founder reaction to committee buying",
    source: {
      title: "Founder reaction",
      founder_take: "This changes how teams should prepare internal champions.",
    },
    linkedTrendCard: {
      title: "Buying committees are expanding",
      shift: "More functions are involved in software decisions.",
    },
    sourceArticles: [],
  };
}

export function ideaFixture(
  plan: GenerationPlanV2 = planFixture,
): ContentAgentIdeaContext {
  return {
    id: "55555555-5555-4555-8555-555555555555",
    sourceType: plan.sourceMode,
    angle: "The routing mistake that made more volume useless",
    buyerPain: "More leads do not become qualified pipeline.",
    commercialRelevance: "Weak routing wastes acquisition spend.",
    beliefShift: `${plan.strategy.currentBelief} -> ${plan.strategy.desiredBelief}`,
    contentPillar: "pipeline quality",
    angleBoundary: "Stay within the documented routing review.",
    sourceContext: "A real routing review.",
    proofNotes: "Use only the documented 12% duplicate-routing figure.",
    founderDirection: null,
    editNote: null,
    generationPlan: plan,
  };
}

export const resourcesFixture: PlanningResource[] = [
  {
    id: "66666666-6666-4666-8666-666666666666",
    title: "Routing review checklist",
    type: "checklist",
    description: "A checklist for reviewing routing and qualification handoffs.",
    problemSolved: "Duplicate and ambiguous lead routing.",
    targetUseCase: "Revenue leaders reviewing pipeline operations.",
    keyword: "ROUTING",
  },
];

export function compatibilityFixture(
  sourceMode: GenerationPlanV2["sourceMode"] = "founder_experience",
): StrategyCompatibility {
  return buildStrategyCompatibility({
    sourceMode,
    hasDocumentedBeforeAfter: true,
    hasDocumentedResult: true,
    hasDocumentedMistake: true,
    approvedResourceIds: resourcesFixture.map((resource) => resource.id),
    commentGateEligible: true,
  });
}
