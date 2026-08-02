import type { GenerationPlanV2 } from "./contracts";
import {
  ANGLE_TYPES,
  BODY_FRAMEWORKS,
  CONTENT_ARCHETYPES,
  CTA_TYPES,
  HOOK_TYPES,
  POST_STRUCTURES,
  type AngleType,
  type BodyFramework,
  type ContentArchetype,
  type CtaType,
  type HookType,
  type PostStructure,
  type SourceMode,
} from "./taxonomies";

export type StrategyCompatibility = {
  angleTypes: AngleType[];
  contentArchetypes: ContentArchetype[];
  postStructures: PostStructure[];
  bodyFrameworks: BodyFramework[];
  hookTypes: HookType[];
  ctaTypes: CtaType[];
  resourceIds: string[];
};

export type StrategyCompatibilityInput = {
  sourceMode: SourceMode;
  hasDocumentedBeforeAfter: boolean;
  hasDocumentedResult: boolean;
  hasDocumentedMistake: boolean;
  approvedResourceIds: string[];
  commentGateEligible: boolean;
};

function without<T>(values: readonly T[], blocked: readonly T[]): T[] {
  const blockedSet = new Set(blocked);
  return values.filter((value) => !blockedSet.has(value));
}

export function buildStrategyCompatibility(
  input: StrategyCompatibilityInput,
): StrategyCompatibility {
  let angleTypes = [...ANGLE_TYPES];
  let contentArchetypes = [...CONTENT_ARCHETYPES];
  let postStructures = [...POST_STRUCTURES];
  let bodyFrameworks = [...BODY_FRAMEWORKS];
  let hookTypes = [...HOOK_TYPES];
  let ctaTypes = [...CTA_TYPES];

  if (!input.hasDocumentedBeforeAfter) {
    angleTypes = without(angleTypes, ["before_after"]);
    postStructures = without(postStructures, ["case_study_before_after"]);
    bodyFrameworks = without(bodyFrameworks, ["bab"]);
    hookTypes = without(hookTypes, ["before_after"]);
  }

  if (!input.hasDocumentedResult) {
    hookTypes = without(hookTypes, ["specific_result"]);
  }

  if (!input.hasDocumentedMistake) {
    angleTypes = without(angleTypes, ["mistake_lesson"]);
    bodyFrameworks = without(bodyFrameworks, ["mistake_lesson"]);
  }

  if (input.sourceMode === "trend_card") {
    contentArchetypes = without(contentArchetypes, [
      "narrative_insight",
      "behind_the_build",
    ]);
    angleTypes = without(angleTypes, ["case_example"]);
  }

  const resourceIds =
    input.commentGateEligible && input.approvedResourceIds.length > 0
      ? [...new Set(input.approvedResourceIds)]
      : [];

  if (resourceIds.length === 0) {
    contentArchetypes = without(contentArchetypes, ["resource_post"]);
    ctaTypes = without(ctaTypes, ["comment_gate"]);
  }

  return {
    angleTypes,
    contentArchetypes,
    postStructures,
    bodyFrameworks,
    hookTypes,
    ctaTypes,
    resourceIds,
  };
}

export function validatePlanAgainstCompatibility(
  plan: GenerationPlanV2,
  compatibility: StrategyCompatibility,
): string[] {
  const issues: string[] = [];
  const { strategy, execution } = plan;

  // Readiness is deliberately not checked here. It is a strategy-strength
  // judgement, not a taxonomy-compatibility fact, and it is surfaced to the
  // human reviewer as a warning rather than blocking generation.
  if (!compatibility.angleTypes.includes(strategy.angleType)) {
    issues.push("incompatible_angle_type");
  }
  if (!compatibility.contentArchetypes.includes(execution.contentArchetype)) {
    issues.push("incompatible_content_archetype");
  }
  if (!compatibility.postStructures.includes(execution.postStructure)) {
    issues.push("incompatible_post_structure");
  }
  if (!compatibility.bodyFrameworks.includes(execution.bodyFramework)) {
    issues.push("incompatible_body_framework");
  }
  if (!compatibility.hookTypes.includes(execution.hookType)) {
    issues.push("incompatible_hook_type");
  }
  if (!compatibility.ctaTypes.includes(execution.ctaType)) {
    issues.push("incompatible_cta_type");
  }

  const isResourcePost = execution.contentArchetype === "resource_post";
  const isCommentGate = execution.ctaType === "comment_gate";
  const hasApprovedResource =
    execution.resourceId !== null &&
    compatibility.resourceIds.includes(execution.resourceId);

  if (isResourcePost !== isCommentGate || isResourcePost !== hasApprovedResource) {
    issues.push("invalid_resource_post_pairing");
  }

  return issues;
}

export function compactCompatibilityCatalog(
  compatibility: StrategyCompatibility,
) {
  return {
    angle_types: compatibility.angleTypes,
    content_archetypes: compatibility.contentArchetypes,
    post_structures: compatibility.postStructures,
    body_frameworks: compatibility.bodyFrameworks,
    hook_types: compatibility.hookTypes,
    cta_types: compatibility.ctaTypes,
    approved_resource_ids: compatibility.resourceIds,
  };
}
