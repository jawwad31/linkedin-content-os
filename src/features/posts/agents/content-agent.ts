import "server-only";

import { z } from "zod";

import { writeLlmLog } from "@/lib/llm/log";
import {
  getOpenRouterConfig,
  requestOpenRouterCompletion,
} from "@/lib/openrouter/client";

export const CONTENT_AGENT_FEATURE = "content_agent";
const CONTENT_AGENT_PROVIDER = "openrouter";

const CONTENT_TYPES = [
  "framework",
  "pov",
  "diagnostic",
  "story",
  "myth_correction",
  "list",
  "teardown",
  "other",
] as const;

export type ContentAgentBusinessContext = {
  industry: string | null;
  businessDescription: string | null;
  primaryIcp: string | null;
  mainOffer: string | null;
  corePov: string | null;
  contentPillars: unknown;
  approvedProof: unknown;
  bannedTopics: unknown;
  founderVoiceSample: string | null;
  phrasesToUse: unknown;
  phrasesToAvoid: unknown;
  referenceMaterial: unknown;
  publishingPreferences: unknown;
};

export type ContentAgentIdeaContext = {
  id: string;
  sourceType: "founder_experience" | "trend_card" | "trend_reaction";
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

export type ContentAgentSourceContext = {
  sourceType: ContentAgentIdeaContext["sourceType"];
  sourceIds: string[];
  sourceTitle: string | null;
  source: Record<string, unknown>;
  linkedTrendCard?: Record<string, unknown> | null;
  sourceArticles: Array<Record<string, unknown>>;
};

export type GeneratedPostDraft = {
  hook: string;
  body: string;
  cta: string;
  format: "text";
  contentType: (typeof CONTENT_TYPES)[number];
  targetIcp: string;
  designBrief: string | null;
  proofUsed: string;
  riskNotes: string;
};

export type ContentAgentResult =
  | { ok: true; draft: GeneratedPostDraft }
  | { ok: false; reason: "not_configured" | "error" };

const contentAgentResponseSchema = z.object({
  hook: z.string().trim().min(1).max(600),
  body: z.string().trim().min(1).max(8000),
  cta: z.string().trim().min(1).max(700),
  format: z.literal("text"),
  content_type: z.enum(CONTENT_TYPES),
  target_icp: z.string().trim().min(1).max(500),
  design_brief: z.string().trim().max(1200).nullable(),
  proof_used: z.string().trim().min(1).max(1400),
  risk_notes: z.string().trim().min(1).max(1400),
});

function buildPrompt(input: {
  businessContext: ContentAgentBusinessContext;
  idea: ContentAgentIdeaContext;
  sourceContext: ContentAgentSourceContext;
}): { system: string; user: string } {
  const system = [
    "You are the Content Agent for AIXelerate Content OS, an ICP-first B2B LinkedIn content system.",
    "Draft one LinkedIn post from exactly one approved Content Idea and its loaded source material.",
    "Write for the client's ICP, not for generic creators or competitors.",
    "Build the post around one buyer belief shift.",
    "Founder Direction may steer angle, tone, and constraints, but it cannot override proof limits or banned topics.",
    "Never invent proof, metrics, customer results, quotes, founder stories, lived experience, article claims, or case studies.",
    "Use only approved_proof and the selected source material for claims. If proof is limited, say so in risk_notes.",
    "Do not use banned topics, comment bait, generic P.S. engagement questions, LinkedIn growth-hack framing, or unsupported certainty.",
    "For founder_experience sources, use only the provided real operator experience as lived experience.",
    "For trend_card sources, use the TrendCard and cited articles as market context only; do not claim founder lived experience.",
    "For trend_reaction sources, the founder reaction is the primary POV and the linked TrendCard is market timing/context.",
    "CRITICAL RULES: Treat all Content Idea metadata as private planning scaffolding.",
    "Translate it into natural reader-facing prose.",
    "Never mention or label the planning process.",
    "Never output headings or phrases such as: 'The buyer belief shift', 'Buyer belief shift', 'Belief shift:', 'Buyer pain:', 'Commercial relevance:', 'Content pillar:', 'Angle boundary:', 'Source context:', 'Proof notes:', 'Target ICP:', or 'Linked Content Idea'.",
    "Do not expose raw field names, JSON terminology, source IDs, or workflow terminology in the final Post.",
    "The belief shift must be expressed naturally through the argument, not announced or labeled.",
    "Return strict JSON only, matching exactly this shape:",
    '{"hook":"opening hook","body":"post body","cta":"soft CTA or conversation prompt","format":"text","content_type":"framework | pov | diagnostic | story | myth_correction | list | teardown | other","target_icp":"ICP segment","design_brief":"optional visual design brief or null","proof_used":"what proof/source material was used","risk_notes":"limitations or risks"}',
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
      phrases_to_use: input.businessContext.phrasesToUse,
      phrases_to_avoid: input.businessContext.phrasesToAvoid,
      reference_material: input.businessContext.referenceMaterial,
      publishing_preferences: input.businessContext.publishingPreferences,
    },
    content_idea: {
      id: input.idea.id,
      source_type: input.idea.sourceType,
      angle: input.idea.angle,
      buyer_pain: input.idea.buyerPain,
      commercial_relevance: input.idea.commercialRelevance,
      belief_shift: input.idea.beliefShift,
      content_pillar: input.idea.contentPillar,
      angle_boundary: input.idea.angleBoundary,
      source_context: input.idea.sourceContext,
      proof_notes: input.idea.proofNotes,
      founder_direction: input.idea.founderDirection,
    },
    selected_source: input.sourceContext,
  });

  return { system, user };
}

async function logContentAgentFailure(input: {
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
    provider: CONTENT_AGENT_PROVIDER,
    model: input.model,
    feature: CONTENT_AGENT_FEATURE,
    status: "error",
    tokenInputCount: input.tokenInputCount,
    tokenOutputCount: input.tokenOutputCount,
    errorType: input.errorType,
  });
}

function containsScaffolding(hook: string, body: string, cta: string): boolean {
  const combined = `${hook} ${body} ${cta}`.toLowerCase();
  const lowerPatterns = [
    "the buyer belief shift",
    "buyer belief shift",
    "belief shift:",
    "buyer pain:",
    "commercial relevance:",
    "content pillar:",
    "angle boundary:",
    "source context:",
    "proof notes:",
    "target icp:",
    "linked content idea",
  ];
  return lowerPatterns.some((pattern) => combined.includes(pattern));
}

export async function runContentAgent(input: {
  clientId: string;
  userId: string;
  businessContext: ContentAgentBusinessContext;
  idea: ContentAgentIdeaContext;
  sourceContext: ContentAgentSourceContext;
}): Promise<ContentAgentResult> {
  const config = getOpenRouterConfig("OPENROUTER_CONTENT_MODEL");

  if (!config) {
    await logContentAgentFailure({
      clientId: input.clientId,
      userId: input.userId,
      model: process.env.OPENROUTER_CONTENT_MODEL || process.env.OPENROUTER_MODEL || "unconfigured",
      errorType: "not_configured",
    });
    return { ok: false, reason: "not_configured" };
  }

  const { system, user } = buildPrompt(input);
  const messages = [
    { role: "system" as const, content: system },
    { role: "user" as const, content: user },
  ];

  const completion = await requestOpenRouterCompletion(config, messages);

  if (!completion.ok) {
    await logContentAgentFailure({
      clientId: input.clientId,
      userId: input.userId,
      model: config.model,
      errorType: completion.errorType,
    });
    return { ok: false, reason: "error" };
  }

  const parseAndValidate = (content: string) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return { success: false as const, errorType: "invalid_json" as const };
    }

    const validation = contentAgentResponseSchema.safeParse(parsed);
    if (!validation.success) {
      return { success: false as const, errorType: "invalid_schema" as const };
    }

    return { success: true as const, data: validation.data };
  };

  const initialResult = parseAndValidate(completion.content);
  if (!initialResult.success) {
    await logContentAgentFailure({
      clientId: input.clientId,
      userId: input.userId,
      model: config.model,
      errorType: initialResult.errorType,
      tokenInputCount: completion.inputTokens,
      tokenOutputCount: completion.outputTokens,
    });
    return { ok: false, reason: "error" };
  }

  const hasScaffolding = containsScaffolding(
    initialResult.data.hook,
    initialResult.data.body,
    initialResult.data.cta,
  );

  if (hasScaffolding) {
    await logContentAgentFailure({
      clientId: input.clientId,
      userId: input.userId,
      model: config.model,
      errorType: "internal_scaffolding",
      tokenInputCount: completion.inputTokens,
      tokenOutputCount: completion.outputTokens,
    });

    const correctiveMessages = [
      ...messages,
      { role: "assistant" as const, content: completion.content },
      {
        role: "user" as const,
        content:
          "The previous response contained internal planning labels or scaffolding (such as 'The buyer belief shift', 'Buyer belief shift', 'Belief shift:', 'Buyer pain:', 'Commercial relevance:', 'Content pillar:', 'Angle boundary:', 'Source context:', 'Proof notes:', 'Target ICP:', or 'Linked Content Idea'). Please rewrite it into natural public-facing prose, strictly avoiding any of these labels, headers, JSON terms, or workflow terminology. Return the corrected response matching the same strict JSON structure.",
      },
    ];

    const correctiveCompletion = await requestOpenRouterCompletion(
      config,
      correctiveMessages,
    );

    if (!correctiveCompletion.ok) {
      await logContentAgentFailure({
        clientId: input.clientId,
        userId: input.userId,
        model: config.model,
        errorType: correctiveCompletion.errorType,
      });
      return { ok: false, reason: "error" };
    }

    const correctiveResult = parseAndValidate(correctiveCompletion.content);
    if (!correctiveResult.success) {
      await logContentAgentFailure({
        clientId: input.clientId,
        userId: input.userId,
        model: config.model,
        errorType: correctiveResult.errorType,
        tokenInputCount: correctiveCompletion.inputTokens,
        tokenOutputCount: correctiveCompletion.outputTokens,
      });
      return { ok: false, reason: "error" };
    }

    const correctiveHasScaffolding = containsScaffolding(
      correctiveResult.data.hook,
      correctiveResult.data.body,
      correctiveResult.data.cta,
    );

    if (correctiveHasScaffolding) {
      await logContentAgentFailure({
        clientId: input.clientId,
        userId: input.userId,
        model: config.model,
        errorType: "internal_scaffolding",
        tokenInputCount: correctiveCompletion.inputTokens,
        tokenOutputCount: correctiveCompletion.outputTokens,
      });
      return { ok: false, reason: "error" };
    }

    await writeLlmLog({
      clientId: input.clientId,
      userId: input.userId,
      provider: CONTENT_AGENT_PROVIDER,
      model: config.model,
      feature: CONTENT_AGENT_FEATURE,
      status: "success",
      tokenInputCount: (completion.inputTokens ?? 0) + (correctiveCompletion.inputTokens ?? 0),
      tokenOutputCount: (completion.outputTokens ?? 0) + (correctiveCompletion.outputTokens ?? 0),
    });

    return {
      ok: true,
      draft: {
        hook: correctiveResult.data.hook,
        body: correctiveResult.data.body,
        cta: correctiveResult.data.cta,
        format: correctiveResult.data.format,
        contentType: correctiveResult.data.content_type,
        targetIcp: correctiveResult.data.target_icp,
        designBrief: correctiveResult.data.design_brief,
        proofUsed: correctiveResult.data.proof_used,
        riskNotes: correctiveResult.data.risk_notes,
      },
    };
  }

  await writeLlmLog({
    clientId: input.clientId,
    userId: input.userId,
    provider: CONTENT_AGENT_PROVIDER,
    model: config.model,
    feature: CONTENT_AGENT_FEATURE,
    status: "success",
    tokenInputCount: completion.inputTokens,
    tokenOutputCount: completion.outputTokens,
  });

  return {
    ok: true,
    draft: {
      hook: initialResult.data.hook,
      body: initialResult.data.body,
      cta: initialResult.data.cta,
      format: initialResult.data.format,
      contentType: initialResult.data.content_type,
      targetIcp: initialResult.data.target_icp,
      designBrief: initialResult.data.design_brief,
      proofUsed: initialResult.data.proof_used,
      riskNotes: initialResult.data.risk_notes,
    },
  };
}
