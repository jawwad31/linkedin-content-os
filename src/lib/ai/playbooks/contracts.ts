import { z } from "zod";

import {
  ANGLE_TYPES,
  BODY_FRAMEWORKS,
  CONTENT_ARCHETYPES,
  CTA_TYPES,
  HOOK_TYPES,
  POST_STRUCTURES,
  RECOMMENDED_FORMATS,
  SOURCE_MODES,
} from "./taxonomies";

export const GENERATION_PLAN_VERSION = 2 as const;

const boundedString = (max: number) => z.string().trim().min(1).max(max);

export const generationPlanV2Schema = z
  .object({
    sourceMode: z.enum(SOURCE_MODES),
    strategy: z.object({
      targetIcp: boundedString(500),
      currentBelief: boundedString(700),
      desiredBelief: boundedString(700),
      coreArgument: boundedString(900),
      primarySourceAnchor: boundedString(900),
      proofToUse: z.array(boundedString(700)).max(12),
      angleType: z.enum(ANGLE_TYPES),
      riskNotes: z.array(boundedString(700)).max(12),
      readiness: z.enum(["ready", "blocked"]),
    }),
    execution: z.object({
      contentArchetype: z.enum(CONTENT_ARCHETYPES),
      postStructure: z.enum(POST_STRUCTURES),
      bodyFramework: z.enum(BODY_FRAMEWORKS),
      hookType: z.enum(HOOK_TYPES),
      ctaType: z.enum(CTA_TYPES),
      argumentOutline: z.array(boundedString(700)).min(2).max(10),
      resourceId: z.string().uuid().nullable(),
    }),
    safety: z.object({
      allowedClaims: z.array(boundedString(700)).max(12),
      claimBoundaries: z.array(boundedString(700)).max(12),
    }),
  })
  .superRefine((plan, context) => {
    const isResourcePost = plan.execution.contentArchetype === "resource_post";
    const isCommentGate = plan.execution.ctaType === "comment_gate";
    const hasResource = plan.execution.resourceId !== null;

    if (isResourcePost !== isCommentGate || isResourcePost !== hasResource) {
      context.addIssue({
        code: "custom",
        path: ["execution"],
        message:
          "resource_post, comment_gate, and resourceId must be selected together.",
      });
    }
  });

export type GenerationPlanV2 = z.infer<typeof generationPlanV2Schema>;

export const strategyOverridesSchema = z
  .object({
    angleType: z.enum(ANGLE_TYPES).optional(),
    postStructure: z.enum(POST_STRUCTURES).optional(),
    ctaType: z.enum(CTA_TYPES).optional(),
    resourceId: z.string().uuid().optional(),
  })
  .strict();

export type StrategyOverrides = z.infer<typeof strategyOverridesSchema>;

export const qaVerdicts = ["pass", "revised", "blocked"] as const;

export const formatRecommendationSchema = z
  .object({
    primaryFormat: z.enum(RECOMMENDED_FORMATS),
    alternativeFormats: z.array(z.enum(RECOMMENDED_FORMATS)).max(2),
    rationale: boundedString(900),
    adaptationNotes: z.array(boundedString(700)).max(8),
  })
  .superRefine((recommendation, context) => {
    const alternatives = recommendation.alternativeFormats;
    if (new Set(alternatives).size !== alternatives.length) {
      context.addIssue({
        code: "custom",
        path: ["alternativeFormats"],
        message: "Alternative formats must be unique.",
      });
    }
    if (alternatives.includes(recommendation.primaryFormat)) {
      context.addIssue({
        code: "custom",
        path: ["alternativeFormats"],
        message: "Alternative formats must exclude the primary format.",
      });
    }
  });

export type FormatRecommendation = z.infer<typeof formatRecommendationSchema>;

export const qaResultSchema = z.object({
  verdict: z.enum(qaVerdicts),
  finalPost: z.string().trim().min(1).max(12_000).nullable(),
  finalCta: z.string().trim().max(700),
  proofNotes: boundedString(1800),
  riskNotes: boundedString(1800),
  checks: z.object({
    sourceFidelity: z.enum(["pass", "fail"]),
    credibility: z.enum(["pass", "fail"]),
    icpFit: z.enum(["pass", "fail"]),
    beliefShiftClarity: z.enum(["pass", "fail"]),
    voice: z.enum(["pass", "fail"]),
    structure: z.enum(["pass", "fail"]),
    ctaFit: z.enum(["pass", "fail"]),
    readability: z.enum(["pass", "fail"]),
  }),
  issues: z.array(boundedString(700)).max(20),
  revisionsMade: z.array(boundedString(700)).max(20),
  formatRecommendation: formatRecommendationSchema.nullable(),
});

export type QaResult = z.infer<typeof qaResultSchema>;

export function applyStrategyOverrides(
  plan: GenerationPlanV2,
  overrides: StrategyOverrides,
): GenerationPlanV2 {
  const execution = { ...plan.execution };
  if (overrides.postStructure) execution.postStructure = overrides.postStructure;
  if (overrides.ctaType) {
    execution.ctaType = overrides.ctaType;
    if (overrides.ctaType !== "comment_gate") execution.resourceId = null;
  }
  if (overrides.resourceId) execution.resourceId = overrides.resourceId;

  if (execution.ctaType === "comment_gate" || execution.resourceId) {
    execution.contentArchetype = "resource_post";
    execution.ctaType = "comment_gate";
  } else if (execution.contentArchetype === "resource_post") {
    throw new Error("Resource posts require a selected resource and comment gate.");
  }

  return generationPlanV2Schema.parse({
    ...plan,
    strategy: {
      ...plan.strategy,
      angleType: overrides.angleType ?? plan.strategy.angleType,
    },
    execution,
  });
}

export function isCompatibleGenerationPlan(
  value: unknown,
  sourceMode: string,
  version: number | null,
): value is GenerationPlanV2 {
  const parsed = generationPlanV2Schema.safeParse(value);
  return (
    version === GENERATION_PLAN_VERSION &&
    parsed.success &&
    parsed.data.sourceMode === sourceMode
  );
}

export const GENERATION_PLAN_JSON_SCHEMA = {
  type: "object",
  properties: {
    sourceMode: { type: "string", enum: [...SOURCE_MODES] },
    strategy: {
      type: "object",
      properties: {
        targetIcp: { type: "string" },
        currentBelief: { type: "string" },
        desiredBelief: { type: "string" },
        coreArgument: { type: "string" },
        primarySourceAnchor: { type: "string" },
        proofToUse: { type: "array", items: { type: "string" } },
        angleType: { type: "string", enum: [...ANGLE_TYPES] },
        riskNotes: { type: "array", items: { type: "string" } },
        readiness: { type: "string", enum: ["ready", "blocked"] },
      },
      required: [
        "targetIcp",
        "currentBelief",
        "desiredBelief",
        "coreArgument",
        "primarySourceAnchor",
        "proofToUse",
        "angleType",
        "riskNotes",
        "readiness",
      ],
      additionalProperties: false,
    },
    execution: {
      type: "object",
      properties: {
        contentArchetype: { type: "string", enum: [...CONTENT_ARCHETYPES] },
        postStructure: { type: "string", enum: [...POST_STRUCTURES] },
        bodyFramework: { type: "string", enum: [...BODY_FRAMEWORKS] },
        hookType: { type: "string", enum: [...HOOK_TYPES] },
        ctaType: { type: "string", enum: [...CTA_TYPES] },
        argumentOutline: { type: "array", items: { type: "string" } },
        resourceId: { type: ["string", "null"] },
      },
      required: [
        "contentArchetype",
        "postStructure",
        "bodyFramework",
        "hookType",
        "ctaType",
        "argumentOutline",
        "resourceId",
      ],
      additionalProperties: false,
    },
    safety: {
      type: "object",
      properties: {
        allowedClaims: { type: "array", items: { type: "string" } },
        claimBoundaries: { type: "array", items: { type: "string" } },
      },
      required: ["allowedClaims", "claimBoundaries"],
      additionalProperties: false,
    },
  },
  required: ["sourceMode", "strategy", "execution", "safety"],
  additionalProperties: false,
} as const;
