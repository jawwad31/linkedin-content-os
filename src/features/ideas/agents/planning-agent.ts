import "server-only";

import { z } from "zod";

import {
  GENERATION_PLAN_JSON_SCHEMA,
  generationPlanV2Schema,
  type GenerationPlanV2,
  type StrategyOverrides,
} from "@/lib/ai/playbooks/contracts";
import { loadPlanningPlaybook } from "@/lib/ai/playbooks/loader";
import {
  compactCompatibilityCatalog,
  validatePlanAgainstCompatibility,
  type StrategyCompatibility,
} from "@/lib/ai/playbooks/strategy-compatibility";
import { SOURCE_MODES, type SourceMode } from "@/lib/ai/playbooks/taxonomies";
import { writeLlmLog } from "@/lib/llm/log";
import {
  getOpenRouterConfig,
  requestStructuredCompletion,
} from "@/lib/openrouter/client";

export const PLANNING_AGENT_FEATURE = "planning_agent";
const PLANNING_AGENT_PROVIDER = "openrouter";

export const PLANNING_MODES = SOURCE_MODES;
export type PlanningMode = SourceMode;

export type PlanningBusinessContext = {
  industry: string | null;
  businessDescription: string | null;
  primaryIcp: string | null;
  mainOffer: string | null;
  approvedProof: unknown;
  bannedTopics: unknown;
};

export type PlanningResource = {
  id: string;
  title: string;
  type: string;
  description: string | null;
  problemSolved: string | null;
  targetUseCase: string | null;
  keyword: string;
};

export type PlanningSourceContext = {
  mode: PlanningMode;
  sourceId: string;
  sourceTitle: string;
  linkedTrendCardId?: string;
  linkedTrendCardTitle?: string;
  linkedTrendCard?: Record<string, unknown> | null;
  source: Record<string, unknown>;
  sourceArticles: Array<Record<string, unknown>>;
};

export type GeneratedPlanningIdea = {
  angle: string;
  buyerPain: string;
  commercialRelevance: string;
  beliefShift: string;
  contentPillar: string;
  angleBoundary: string;
  sourceContext: string;
  proofNotes: string;
  generationPlan: GenerationPlanV2;
};

export type ReplanningIdeaInput = {
  angle: string;
  buyerPain: string | null;
  commercialRelevance: string | null;
  beliefShift: string | null;
  contentPillar: string | null;
  angleBoundary: string | null;
  sourceContext: unknown;
  proofNotes: string | null;
  founderDirection: string | null;
};

export type PlanningAgentResult =
  | { ok: true; ideas: GeneratedPlanningIdea[] }
  | { ok: false; reason: "not_configured" | "error" };

export type ReplanningAgentResult =
  | { ok: true; generationPlan: GenerationPlanV2 }
  | { ok: false; reason: "not_configured" | "error" };

const ideaSchema = z.object({
  angle: z.string().trim().min(1).max(240),
  buyer_pain: z.string().trim().min(1).max(700),
  commercial_relevance: z.string().trim().min(1).max(700),
  belief_shift: z.string().trim().min(1).max(700),
  content_pillar: z.string().trim().min(1).max(160),
  angle_boundary: z.string().trim().min(1).max(900),
  source_context: z.string().trim().min(1).max(900),
  proof_notes: z.string().trim().min(1).max(900),
  generation_plan: generationPlanV2Schema,
});

const planningResponseSchema = z.object({
  ideas: z.array(ideaSchema).max(5),
});

const replanResponseSchema = z.object({
  generation_plan: generationPlanV2Schema,
});

const IDEA_JSON_SCHEMA = {
  type: "object",
  properties: {
    angle: { type: "string" },
    buyer_pain: { type: "string" },
    commercial_relevance: { type: "string" },
    belief_shift: { type: "string" },
    content_pillar: { type: "string" },
    angle_boundary: { type: "string" },
    source_context: { type: "string" },
    proof_notes: { type: "string" },
    generation_plan: GENERATION_PLAN_JSON_SCHEMA,
  },
  required: [
    "angle",
    "buyer_pain",
    "commercial_relevance",
    "belief_shift",
    "content_pillar",
    "angle_boundary",
    "source_context",
    "proof_notes",
    "generation_plan",
  ],
  additionalProperties: false,
} as const;

const PLANNING_JSON_SCHEMA = {
  type: "object",
  properties: {
    ideas: { type: "array", items: IDEA_JSON_SCHEMA },
  },
  required: ["ideas"],
  additionalProperties: false,
} as const;

const REPLAN_JSON_SCHEMA = {
  type: "object",
  properties: {
    generation_plan: GENERATION_PLAN_JSON_SCHEMA,
  },
  required: ["generation_plan"],
  additionalProperties: false,
} as const;

function businessContextPayload(context: PlanningBusinessContext) {
  return {
    industry: context.industry,
    business_description: context.businessDescription,
    primary_icp: context.primaryIcp,
    main_offer: context.mainOffer,
    approved_evidence: context.approvedProof,
    banned_topics: context.bannedTopics,
  };
}

export async function buildPlanningPrompt(input: {
  businessContext: PlanningBusinessContext;
  sourceContext: PlanningSourceContext;
  recentAngles: string[];
  compatibility: StrategyCompatibility;
  resources: PlanningResource[];
}): Promise<{ system: string; user: string }> {
  const playbook = await loadPlanningPlaybook();
  const system = [
    "You are the Planning Agent for AIXelerate Content OS.",
    "Follow the production playbook below as binding methodology.",
    playbook,
    "Generate 3 to 5 distinct ideas only when source quality supports them. Fewer or zero is better than filler.",
    "Every idea must include a complete GenerationPlanV2 using exact taxonomy IDs.",
    "The generation plan sourceMode must exactly equal the selected source mode.",
    "Use only choices in the supplied compatibility catalog.",
    "Return only plans whose strategy.readiness is ready.",
    "Ideas must differ in both core argument and angle type. At most one idea may use resource_post/comment_gate.",
    "Keep legacy idea fields semantically consistent with the plan.",
    "Return strict JSON only.",
  ].join("\n\n");

  return {
    system,
    user: JSON.stringify({
      business_context: businessContextPayload(input.businessContext),
      selected_source: input.sourceContext,
      recent_content_ideas: input.recentAngles,
      compatible_strategy_catalog: compactCompatibilityCatalog(input.compatibility),
      approved_content_resources: input.resources,
    }),
  };
}

export async function buildReplanningPrompt(input: {
  businessContext: PlanningBusinessContext;
  sourceContext: PlanningSourceContext;
  idea: ReplanningIdeaInput;
  strategyOverrides: StrategyOverrides;
  compatibility: StrategyCompatibility;
  resources: PlanningResource[];
}): Promise<{ system: string; user: string }> {
  const playbook = await loadPlanningPlaybook();
  const system = [
    "You are replanning one already-selected Content Idea for AIXelerate Content OS.",
    "Follow the production playbook below as binding methodology.",
    playbook,
    "Return one complete GenerationPlanV2. Preserve the selected idea's core topic.",
    "Apply Founder Direction and safe strategy overrides, but never weaken source or proof boundaries.",
    "A non-comment-gate CTA override requires resourceId null and a non-resource archetype. A resource override requires resource_post plus comment_gate.",
    "Use only choices in the supplied compatibility catalog. Return strategy.readiness ready.",
    "The generation plan sourceMode must exactly equal the selected source mode.",
    "Return strict JSON only.",
  ].join("\n\n");

  return {
    system,
    user: JSON.stringify({
      business_context: businessContextPayload(input.businessContext),
      selected_source: input.sourceContext,
      selected_idea: input.idea,
      strategy_overrides: input.strategyOverrides,
      compatible_strategy_catalog: compactCompatibilityCatalog(input.compatibility),
      approved_content_resources: input.resources,
    }),
  };
}

async function logNotConfigured(input: {
  clientId: string;
  userId: string;
  model: string;
}) {
  await writeLlmLog({
    clientId: input.clientId,
    userId: input.userId,
    provider: PLANNING_AGENT_PROVIDER,
    model: input.model,
    feature: PLANNING_AGENT_FEATURE,
    status: "error",
    errorType: "not_configured",
  });
}

export async function runPlanningAgent(input: {
  clientId: string;
  userId: string;
  businessContext: PlanningBusinessContext;
  sourceContext: PlanningSourceContext;
  recentAngles: string[];
  compatibility: StrategyCompatibility;
  resources: PlanningResource[];
}): Promise<PlanningAgentResult> {
  const config = getOpenRouterConfig("OPENROUTER_PLANNING_MODEL");

  if (!config) {
    await logNotConfigured({
      clientId: input.clientId,
      userId: input.userId,
      model:
        process.env.OPENROUTER_PLANNING_MODEL ??
        process.env.OPENROUTER_MODEL ??
        "unconfigured",
    });
    return { ok: false, reason: "not_configured" };
  }

  const prompt = await buildPlanningPrompt(input);
  const result = await requestStructuredCompletion(
    config,
    [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ],
    planningResponseSchema,
    PLANNING_JSON_SCHEMA,
    "content-idea-planning-v2",
    { timeoutMs: 90_000, maxTokens: 8_000, temperature: 0.25 },
    input.clientId,
    input.userId,
    PLANNING_AGENT_FEATURE,
  );

  if (!result.ok) return { ok: false, reason: "error" };

  const seenArguments = new Set<string>();
  const seenAngles = new Set<string>();
  let resourcePostSeen = false;
  const compatibleIdeas = result.data.ideas.filter((idea) => {
    const plan = idea.generation_plan;
    if (
      plan.sourceMode !== input.sourceContext.mode ||
      validatePlanAgainstCompatibility(plan, input.compatibility).length > 0
    ) {
      return false;
    }

    const coreArgument = plan.strategy.coreArgument.trim().toLowerCase();
    if (seenArguments.has(coreArgument) || seenAngles.has(plan.strategy.angleType)) {
      return false;
    }

    const isResourcePost = plan.execution.contentArchetype === "resource_post";
    if (isResourcePost && resourcePostSeen) return false;

    seenArguments.add(coreArgument);
    seenAngles.add(plan.strategy.angleType);
    resourcePostSeen ||= isResourcePost;
    return true;
  });

  return {
    ok: true,
    ideas: compatibleIdeas.map((idea) => ({
      angle: idea.angle,
      buyerPain: idea.buyer_pain,
      commercialRelevance: idea.commercial_relevance,
      beliefShift: idea.belief_shift,
      contentPillar: idea.content_pillar,
      angleBoundary: idea.angle_boundary,
      sourceContext: idea.source_context,
      proofNotes: idea.proof_notes,
      generationPlan: idea.generation_plan,
    })),
  };
}

export async function replanContentIdea(input: {
  clientId: string;
  userId: string;
  businessContext: PlanningBusinessContext;
  sourceContext: PlanningSourceContext;
  idea: ReplanningIdeaInput;
  strategyOverrides: StrategyOverrides;
  compatibility: StrategyCompatibility;
  resources: PlanningResource[];
}): Promise<ReplanningAgentResult> {
  const config = getOpenRouterConfig("OPENROUTER_PLANNING_MODEL");
  if (!config) {
    await logNotConfigured({
      clientId: input.clientId,
      userId: input.userId,
      model:
        process.env.OPENROUTER_PLANNING_MODEL ??
        process.env.OPENROUTER_MODEL ??
        "unconfigured",
    });
    return { ok: false, reason: "not_configured" };
  }

  const prompt = await buildReplanningPrompt(input);
  const result = await requestStructuredCompletion(
    config,
    [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ],
    replanResponseSchema,
    REPLAN_JSON_SCHEMA,
    "content-idea-replanning-v2",
    { timeoutMs: 90_000, maxTokens: 4_000, temperature: 0.15 },
    input.clientId,
    input.userId,
    PLANNING_AGENT_FEATURE,
  );

  if (
    !result.ok ||
    result.data.generation_plan.sourceMode !== input.sourceContext.mode ||
    validatePlanAgainstCompatibility(
      result.data.generation_plan,
      input.compatibility,
    ).length > 0
  ) {
    return { ok: false, reason: "error" };
  }

  return { ok: true, generationPlan: result.data.generation_plan };
}
