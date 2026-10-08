import "server-only";
import { getLlmModel } from "@/lib/llm/config";

import {
  qaResultSchema,
  type GenerationPlanV2,
  type QaResult,
} from "@/lib/ai/playbooks/contracts";
import type { DeterministicCheckIssue } from "@/lib/ai/playbooks/deterministic-checks";
import { loadReviewPlaybook } from "@/lib/ai/playbooks/loader";
import { writeLlmLog } from "@/lib/llm/log";
import {
  getOpenRouterConfig,
  requestStructuredCompletion,
} from "@/lib/openrouter/client";

import type {
  ContentAgentBusinessContext,
  ContentAgentIdeaContext,
  ContentAgentSourceContext,
  GeneratedPostDraft,
} from "./content-agent";

export const REVIEW_AGENT_FEATURE = "content_review_agent";

const QA_JSON_SCHEMA = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["pass", "revised", "blocked"] },
    finalPost: { type: ["string", "null"] },
    finalCta: { type: "string" },
    proofNotes: { type: "string" },
    riskNotes: { type: "string" },
    checks: {
      type: "object",
      properties: {
        sourceFidelity: { type: "string", enum: ["pass", "fail"] },
        credibility: { type: "string", enum: ["pass", "fail"] },
        icpFit: { type: "string", enum: ["pass", "fail"] },
        beliefShiftClarity: { type: "string", enum: ["pass", "fail"] },
        voice: { type: "string", enum: ["pass", "fail"] },
        structure: { type: "string", enum: ["pass", "fail"] },
        ctaFit: { type: "string", enum: ["pass", "fail"] },
        readability: { type: "string", enum: ["pass", "fail"] },
      },
      required: [
        "sourceFidelity",
        "credibility",
        "icpFit",
        "beliefShiftClarity",
        "voice",
        "structure",
        "ctaFit",
        "readability",
      ],
      additionalProperties: false,
    },
    issues: { type: "array", items: { type: "string" } },
    revisionsMade: { type: "array", items: { type: "string" } },
    formatRecommendation: {
      type: ["object", "null"],
      properties: {
        primaryFormat: {
          type: "string",
          enum: ["text", "carousel", "video", "poll", "newsletter"],
        },
        alternativeFormats: {
          type: "array",
          items: {
            type: "string",
            enum: ["text", "carousel", "video", "poll", "newsletter"],
          },
          maxItems: 2,
        },
        rationale: { type: "string" },
        adaptationNotes: { type: "array", items: { type: "string" } },
      },
      required: [
        "primaryFormat",
        "alternativeFormats",
        "rationale",
        "adaptationNotes",
      ],
      additionalProperties: false,
    },
  },
  required: [
    "verdict",
    "finalPost",
    "finalCta",
    "proofNotes",
    "riskNotes",
    "checks",
    "issues",
    "revisionsMade",
    "formatRecommendation",
  ],
  additionalProperties: false,
} as const;

export async function buildReviewPrompt(input: {
  businessContext: ContentAgentBusinessContext;
  idea: ContentAgentIdeaContext;
  sourceContext: ContentAgentSourceContext;
  plan: GenerationPlanV2;
  draft: GeneratedPostDraft;
  deterministicIssues: DeterministicCheckIssue[];
  priorQa?: QaResult;
}): Promise<{ system: string; user: string }> {
  const playbook = await loadReviewPlaybook(input.plan);
  return {
    system: [
      "You are the independent Review and QA Agent for AIXelerate Content OS.",
      "Follow the production playbook below as binding methodology.",
      playbook,
      "A deterministic finding must be resolved or the draft must be blocked.",
      "Do not wrap a paraphrased or rhetorical belief in quotation marks. Quotation marks are reserved for exact evidence quotes; render paraphrased beliefs as plain assertions instead of pretending they are sourced quotations.",
      ...(input.priorQa
        ? [
            "This is a corrective pass. The supplied draft is the version you already reviewed and returned; deterministic_findings apply to this exact draft, not to any earlier version.",
            "Resolve every finding by deleting or narrowing language already present in this draft. Do not reintroduce an issue that prior_qa already fixed.",
          ]
        : []),
      "For pass or revised, finalPost must contain the complete publishable post.",
      "finalCta must contain only the final CTA/closing ask, or an empty string when CTA type is none.",
      "For blocked, finalPost must be null and finalCta must be empty.",
      "For blocked, formatRecommendation must be null. For pass/revised, return one advisory format recommendation.",
      "Return strict JSON only.",
    ].join("\n\n"),
    user: JSON.stringify({
      business_context: input.businessContext,
      content_idea: input.idea,
      generation_plan: input.plan,
      selected_source: input.sourceContext,
      draft: input.draft,
      deterministic_findings: input.deterministicIssues,
      prior_qa: input.priorQa ?? null,
    }),
  };
}

export async function runReviewAgent(input: {
  clientId: string;
  userId: string;
  businessContext: ContentAgentBusinessContext;
  idea: ContentAgentIdeaContext;
  sourceContext: ContentAgentSourceContext;
  plan: GenerationPlanV2;
  draft: GeneratedPostDraft;
  deterministicIssues: DeterministicCheckIssue[];
  priorQa?: QaResult;
}): Promise<
  | { ok: true; qa: QaResult }
  | { ok: false; reason: "not_configured" | "error" }
> {
  const config = getOpenRouterConfig("LLM_REVIEW_MODEL");

  if (!config) {
    await writeLlmLog({
      clientId: input.clientId,
      userId: input.userId,
      provider: "openrouter",
      model: getLlmModel("review"),
      feature: REVIEW_AGENT_FEATURE,
      status: "error",
      errorType: "not_configured",
    });
    return { ok: false, reason: "not_configured" };
  }

  const prompt = await buildReviewPrompt(input);
  const result = await requestStructuredCompletion(
    config,
    [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ],
    qaResultSchema,
    QA_JSON_SCHEMA,
    "content-review-v2",
    { timeoutMs: 90_000, maxTokens: 6_000, temperature: 0.1 },
    input.clientId,
    input.userId,
    REVIEW_AGENT_FEATURE,
  );

  if (!result.ok) return { ok: false, reason: "error" };
  if (
    (result.data.verdict === "blocked" && result.data.finalPost !== null) ||
    (result.data.verdict === "blocked" && result.data.finalCta !== "") ||
    (result.data.verdict === "blocked" &&
      result.data.formatRecommendation !== null) ||
    (result.data.verdict !== "blocked" && !result.data.finalPost) ||
    (result.data.verdict !== "blocked" &&
      result.data.formatRecommendation === null) ||
    (result.data.verdict !== "blocked" &&
      result.data.finalCta.length > 0 &&
      !result.data.finalPost?.includes(result.data.finalCta))
  ) {
    return { ok: false, reason: "error" };
  }

  return { ok: true, qa: result.data };
}
