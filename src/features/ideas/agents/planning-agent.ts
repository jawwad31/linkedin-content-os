import "server-only";

import { z } from "zod";

import { writeLlmLog } from "@/lib/llm/log";
import {
  getOpenRouterConfig,
  requestOpenRouterCompletion,
} from "@/lib/openrouter/client";

export const PLANNING_AGENT_FEATURE = "planning_agent";
const PLANNING_AGENT_PROVIDER = "openrouter";

export const PLANNING_MODES = [
  "founder_experience",
  "trend_card",
  "trend_reaction",
] as const;

export type PlanningMode = (typeof PLANNING_MODES)[number];

export type PlanningBusinessContext = {
  industry: string | null;
  businessDescription: string | null;
  primaryIcp: string | null;
  mainOffer: string | null;
  corePov: string | null;
  contentPillars: unknown;
  approvedProof: unknown;
  bannedTopics: unknown;
  founderVoiceSample: string | null;
  referenceMaterial: unknown;
  publishingPreferences: unknown;
};

export type PlanningSourceContext = {
  mode: PlanningMode;
  sourceId: string;
  sourceTitle: string;
  linkedTrendCardId?: string;
  linkedTrendCardTitle?: string;
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
};

export type PlanningAgentResult =
  | { ok: true; ideas: GeneratedPlanningIdea[] }
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
});

const planningResponseSchema = z.object({
  ideas: z.array(ideaSchema).max(5),
});

function buildPrompt(input: {
  businessContext: PlanningBusinessContext;
  sourceContext: PlanningSourceContext;
  recentAngles: string[];
}): { system: string; user: string } {
  const system = [
    "You are the Planning Agent for AIXelerate Content OS, an ICP-first B2B LinkedIn content system.",
    "Generate Content Ideas only from the selected source and the always-on business context.",
    "Allowed source modes are exactly: founder_experience, trend_card, trend_reaction.",
    "There is no business_context_only mode. Never use unsupported modes.",
    "Each idea must be built around one clear buyer belief shift for the client's ICP.",
    "Do not invent proof, metrics, customer results, quotes, founder stories, or lived experience.",
    "Do not use banned topics. Do not write for competitors or generic creators.",
    "For founder_experience mode, use only the provided real founder/operator experience as lived proof.",
    "For trend_card mode, use the TrendCard as market timing/context and do not claim founder lived experience.",
    "For trend_reaction mode, the founder reaction is the primary POV and the linked TrendCard is timing/context.",
    "Avoid angles already covered in recent_content_ideas.",
    "Generate 3 to 5 ideas only when source quality supports it. Return fewer or zero rather than filler.",
    "Respond with strict JSON only, matching exactly this shape:",
    '{"ideas":[{"angle":"specific content idea angle","buyer_pain":"pain this addresses for the ICP","commercial_relevance":"why this matters commercially","belief_shift":"what the buyer currently believes -> what they should believe after reading","content_pillar":"matching pillar or closest pillar","angle_boundary":"what the post should cover and what it must avoid","source_context":"what source material this came from","proof_notes":"what can and cannot be claimed"}]}',
  ].join(" ");

  const user = JSON.stringify({
    business_context: {
      industry: input.businessContext.industry,
      business_description: input.businessContext.businessDescription,
      primary_icp: input.businessContext.primaryIcp,
      main_offer: input.businessContext.mainOffer,
      core_pov: input.businessContext.corePov,
      content_pillars: input.businessContext.contentPillars,
      approved_proof: input.businessContext.approvedProof,
      banned_topics: input.businessContext.bannedTopics,
      founder_voice_sample: input.businessContext.founderVoiceSample,
      reference_material: input.businessContext.referenceMaterial,
      publishing_preferences: input.businessContext.publishingPreferences,
    },
    selected_source: input.sourceContext,
    recent_content_ideas: input.recentAngles,
  });

  return { system, user };
}

async function logPlanningFailure(input: {
  clientId: string;
  userId: string;
  model: string;
  errorType: string;
  tokenInputCount?: number | null;
  tokenOutputCount?: number | null;
}) {
  await writeLlmLog({
    clientId: input.clientId,
    userId: input.userId,
    provider: PLANNING_AGENT_PROVIDER,
    model: input.model,
    feature: PLANNING_AGENT_FEATURE,
    status: "error",
    tokenInputCount: input.tokenInputCount,
    tokenOutputCount: input.tokenOutputCount,
    errorType: input.errorType,
  });
}

export async function runPlanningAgent(input: {
  clientId: string;
  userId: string;
  businessContext: PlanningBusinessContext;
  sourceContext: PlanningSourceContext;
  recentAngles: string[];
}): Promise<PlanningAgentResult> {
  const config = getOpenRouterConfig();

  if (!config) {
    await logPlanningFailure({
      clientId: input.clientId,
      userId: input.userId,
      model: process.env.OPENROUTER_MODEL ?? "unconfigured",
      errorType: "not_configured",
    });
    return { ok: false, reason: "not_configured" };
  }

  const { system, user } = buildPrompt(input);
  const completion = await requestOpenRouterCompletion(config, [
    { role: "system", content: system },
    { role: "user", content: user },
  ]);

  if (!completion.ok) {
    await logPlanningFailure({
      clientId: input.clientId,
      userId: input.userId,
      model: config.model,
      errorType: completion.errorType,
    });
    return { ok: false, reason: "error" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(completion.content);
  } catch {
    await logPlanningFailure({
      clientId: input.clientId,
      userId: input.userId,
      model: config.model,
      errorType: "invalid_json",
      tokenInputCount: completion.inputTokens,
      tokenOutputCount: completion.outputTokens,
    });
    return { ok: false, reason: "error" };
  }

  const validation = planningResponseSchema.safeParse(parsed);
  if (!validation.success) {
    await logPlanningFailure({
      clientId: input.clientId,
      userId: input.userId,
      model: config.model,
      errorType: "invalid_schema",
      tokenInputCount: completion.inputTokens,
      tokenOutputCount: completion.outputTokens,
    });
    return { ok: false, reason: "error" };
  }

  await writeLlmLog({
    clientId: input.clientId,
    userId: input.userId,
    provider: PLANNING_AGENT_PROVIDER,
    model: config.model,
    feature: PLANNING_AGENT_FEATURE,
    status: "success",
    tokenInputCount: completion.inputTokens,
    tokenOutputCount: completion.outputTokens,
  });

  return {
    ok: true,
    ideas: validation.data.ideas.map((idea) => ({
      angle: idea.angle,
      buyerPain: idea.buyer_pain,
      commercialRelevance: idea.commercial_relevance,
      beliefShift: idea.belief_shift,
      contentPillar: idea.content_pillar,
      angleBoundary: idea.angle_boundary,
      sourceContext: idea.source_context,
      proofNotes: idea.proof_notes,
    })),
  };
}
