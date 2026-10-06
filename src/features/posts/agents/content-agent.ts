import "server-only";

import { z } from "zod";

import type { GenerationPlanV2 } from "@/lib/ai/playbooks/contracts";
import type { SourceMode } from "@/lib/ai/playbooks/taxonomies";
import { loadContentPlaybook } from "@/lib/ai/playbooks/loader";
import { writeLlmLog } from "@/lib/llm/log";
import {
  getOpenRouterConfig,
  requestStructuredCompletion,
} from "@/lib/openrouter/client";

export const CONTENT_AGENT_FEATURE = "content_agent";
const CONTENT_AGENT_PROVIDER = "openrouter";

export type ContentAgentBusinessContext = {
  industry: string | null;
  businessDescription: string | null;
  primaryIcp: string | null;
  audienceUnderstanding?: string | null;
  painPoints?: string | null;
  mainOffer: string | null;
  commercialDetails?: string | null;
  deliveryApproach?: string | null;
  businessPositioning?: string | null;
  questionsAndDoubts?: string | null;
  approvedProof: unknown;
  bannedTopics: unknown;

  // Personal brand profile
  founderName?: string | null;
  roleAndWork?: string | null;
  personalPositioning?: string | null;
  personalReaders?: string | null;
  contentPillars?: unknown;
  principles?: string | null;
  voiceGuide?: string | null;
  founderVoiceSample: string | null;
  founderVoiceExamples: unknown;
  phrasesToUse: unknown;
  phrasesToAvoid: unknown;
  boundaries?: string | null;
  businessMentions?: string | null;
  profileRevision?: number;
};

export type ContentAgentIdeaContext = {
  id: string;
  sourceType: SourceMode;
  angle: string;
  buyerPain: string | null;
  commercialRelevance: string | null;
  founderDirection: string | null;
  editNote: string | null;
  generationPlan: GenerationPlanV2;
};

export type ContentAgentSourceContext = {
  sourceType: ContentAgentIdeaContext["sourceType"];
  sourceIds: string[];
  sourceTitle: string | null;
  source: Record<string, unknown>;
  linkedTrendCard?: Record<string, unknown> | null;
  sourceArticles: Array<Record<string, unknown>>;
  selectedResource?: Record<string, unknown> | null;
};

export type GeneratedPostDraft = {
  hook: string;
  body: string;
  cta: string;
  format: "text";
  proofUsed: string;
  riskNotes: string;
};

export type ContentAgentResult =
  | { ok: true; draft: GeneratedPostDraft }
  | { ok: false; reason: "not_configured" | "error" };

const contentAgentResponseSchema = z.object({
  hook: z.string().trim().min(1).max(600),
  body: z.string().trim().min(1).max(8_000),
  cta: z.string().trim().max(700),
  format: z.literal("text"),
  proof_used: z.string().trim().min(1).max(1_400),
  risk_notes: z.string().trim().min(1).max(1_400),
});

const CONTENT_JSON_SCHEMA = {
  type: "object",
  properties: {
    hook: { type: "string" },
    body: { type: "string" },
    cta: { type: "string" },
    format: { type: "string", enum: ["text"] },
    proof_used: { type: "string" },
    risk_notes: { type: "string" },
  },
  required: ["hook", "body", "cta", "format", "proof_used", "risk_notes"],
  additionalProperties: false,
} as const;

export function buildFinalPost(draft: {
  hook: string;
  body: string;
  cta: string;
}): string {
  return [draft.hook, draft.body, draft.cta]
    .map((part) => part.trim())
    .filter(Boolean)
    .join("\n\n");
}

export async function buildContentPrompt(input: {
  businessContext: ContentAgentBusinessContext;
  idea: ContentAgentIdeaContext;
  sourceContext: ContentAgentSourceContext;
}): Promise<{ system: string; user: string }> {
  const playbook = await loadContentPlaybook(input.idea.generationPlan);
  return {
    system: [
      "You are the Content Agent for AIXelerate Content OS.",
      "Follow the production playbook below as binding methodology.",
      playbook,
      "Validate proof, write the body, then write a hook the body can deliver, then write the CTA.",
      "Do not wrap a paraphrased or rhetorical belief in quotation marks. Quotation marks are reserved for exact evidence quotes; write paraphrased beliefs as plain assertions instead.",
      "Draft exactly one public-facing LinkedIn text post from the stored GenerationPlanV2.",
      "Treat the plan and idea metadata as private scaffolding. Never expose field labels or workflow terms.",
      "The draft will be checked deterministically and reviewed by a separate QA agent.",
      `Post Funnel Stage: ${input.idea.generationPlan.editorial?.funnelStage ?? "Depth"}. Follow the writing guidelines for this stage.`,
      `Post Type: ${input.idea.generationPlan.editorial?.postType ?? "framework"}.`,
      input.idea.generationPlan.editorial?.intendedReader
        ? `Target Intended Reader: "${input.idea.generationPlan.editorial.intendedReader}". Calibrate tone, vocabulary, and tension specifically for this reader rather than assuming the buyer ICP is the sole audience.`
        : "Write for the intended readership. When personal_readers is provided in the personal brand profile, calibrate the post for that readership rather than always assuming the buyer ICP is the sole reader.",
      input.idea.generationPlan.editorial?.primaryTakeaway
        ? `Primary Takeaway: "${input.idea.generationPlan.editorial.primaryTakeaway}". Ensure the post delivers this exact takeaway.`
        : "",
      input.sourceContext.sourceType === "profile_led"
        ? "STRICT PROOF SAFETY (PROFILE-LED): Strictly educational. Do NOT invent founder experiences, personal anecdotes, client results, or fabricated metrics. Teach from principles and frameworks only."
        : "",
      "Return strict JSON only.",
    ].filter(Boolean).join("\n\n"),
    user: JSON.stringify({
      business_context: {
        industry: input.businessContext.industry,
        business_description: input.businessContext.businessDescription,
        primary_icp: input.businessContext.primaryIcp,
        audience_understanding: input.businessContext.audienceUnderstanding ?? null,
        pain_points: input.businessContext.painPoints ?? null,
        main_offer: input.businessContext.mainOffer,
        commercial_details: input.businessContext.commercialDetails ?? null,
        delivery_approach: input.businessContext.deliveryApproach ?? null,
        business_positioning: input.businessContext.businessPositioning ?? null,
        questions_and_doubts: input.businessContext.questionsAndDoubts ?? null,
        approved_evidence: input.businessContext.approvedProof,
        banned_topics: input.businessContext.bannedTopics,
        founder_voice_sample: input.businessContext.founderVoiceSample,
        founder_voice_examples: input.businessContext.founderVoiceExamples,
        phrases_to_use: input.businessContext.phrasesToUse,
        phrases_to_avoid: input.businessContext.phrasesToAvoid,
      },
      personal_brand_profile: {
        founder_name: input.businessContext.founderName ?? null,
        role_and_work: input.businessContext.roleAndWork ?? null,
        personal_positioning: input.businessContext.personalPositioning ?? null,
        personal_readers: input.businessContext.personalReaders ?? null,
        content_pillars: input.businessContext.contentPillars ?? [],
        principles: input.businessContext.principles ?? null,
        voice_guide: input.businessContext.voiceGuide ?? null,
        boundaries: input.businessContext.boundaries ?? null,
        business_mentions: input.businessContext.businessMentions ?? null,
      },
      profile_revision: input.businessContext.profileRevision ?? 1,
      content_idea: {
        id: input.idea.id,
        angle: input.idea.angle,
        buyer_pain: input.idea.buyerPain,
        commercial_relevance: input.idea.commercialRelevance,
        founder_direction: input.idea.founderDirection,
        edit_note: input.idea.editNote,
      },
      generation_plan: input.idea.generationPlan,
      selected_source: input.sourceContext,
    }),
  };
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
    await writeLlmLog({
      clientId: input.clientId,
      userId: input.userId,
      provider: CONTENT_AGENT_PROVIDER,
      model:
        process.env.OPENROUTER_CONTENT_MODEL ??
        process.env.OPENROUTER_MODEL ??
        "unconfigured",
      feature: CONTENT_AGENT_FEATURE,
      status: "error",
      errorType: "not_configured",
    });
    return { ok: false, reason: "not_configured" };
  }

  const prompt = await buildContentPrompt(input);
  const result = await requestStructuredCompletion(
    config,
    [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ],
    contentAgentResponseSchema,
    CONTENT_JSON_SCHEMA,
    "content-draft-v2",
    { timeoutMs: 90_000, maxTokens: 5_000, temperature: 0.35 },
    input.clientId,
    input.userId,
    CONTENT_AGENT_FEATURE,
  );

  if (!result.ok) return { ok: false, reason: "error" };

  return {
    ok: true,
    draft: {
      hook: result.data.hook,
      body: result.data.body,
      cta: result.data.cta,
      format: result.data.format,
      proofUsed: result.data.proof_used,
      riskNotes: result.data.risk_notes,
    },
  };
}
