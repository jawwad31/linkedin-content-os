import {
  generationPlanV2Schema,
  type GenerationPlanV2,
} from "./contracts";

export const INTERNAL_SCAFFOLDING_PATTERNS = [
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
  "generation plan",
] as const;

export type DeterministicCheckCode =
  | "internal_scaffolding"
  | "banned_phrase"
  | "banned_topic"
  | "unsupported_numeric_claim"
  | "unsupported_quote"
  | "excessive_cta"
  | "invalid_taxonomy"
  | "source_mode_drift"
  | "invalid_resource_post";

export type DeterministicCheckIssue = {
  code: DeterministicCheckCode;
  detail: string;
};

function stringsFromUnknown(value: unknown): string[] {
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  if (Array.isArray(value)) return value.flatMap(stringsFromUnknown);
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap(stringsFromUnknown);
  }
  return [];
}

function normalizedTerms(value: unknown): string[] {
  return stringsFromUnknown(value)
    .map((entry) => entry.toLowerCase().trim())
    .filter((entry) => entry.length >= 3);
}

function numericTokens(value: string): Set<string> {
  const withoutListMarkers = value.replace(/^\s*\d+[.)]\s+/gm, "");
  const matches =
    withoutListMarkers.match(
      /(?:[$£€]\s*)?\d[\d,.]*(?:\s?(?:%|x|k|m|b))?/gi,
    ) ?? [];
  return new Set(
    matches.map((token) => token.toLowerCase().replace(/[\s,]/g, "")),
  );
}

function quotedClaims(value: string): string[] {
  return [...value.matchAll(/["“”]([^"“”]{8,})["“”]/g)]
    .map((match) => match[1]?.trim())
    .filter((entry): entry is string => Boolean(entry));
}

function countCtaSignals(cta: string): number {
  if (!cta.trim()) return 0;
  const questionCount = (cta.match(/\?/g) ?? []).length;
  const imperativeCount = (
    cta.match(/\b(comment|follow|subscribe|download|book|dm|message|reply|share|save)\b/gi) ??
    []
  ).length;
  return Math.max(1, questionCount + imperativeCount);
}

export function runDeterministicPostChecks(input: {
  finalPost: string;
  cta: string;
  plan: GenerationPlanV2;
  approvedProof: unknown;
  selectedSource: unknown;
  phrasesToAvoid: unknown;
  bannedTopics: unknown;
  selectedResource?: unknown;
}): DeterministicCheckIssue[] {
  const issues: DeterministicCheckIssue[] = [];
  const lowerPost = input.finalPost.toLowerCase();

  for (const pattern of INTERNAL_SCAFFOLDING_PATTERNS) {
    if (lowerPost.includes(pattern)) {
      issues.push({
        code: "internal_scaffolding",
        detail: `Internal planning label found: ${pattern}`,
      });
    }
  }

  for (const phrase of normalizedTerms(input.phrasesToAvoid)) {
    if (lowerPost.includes(phrase)) {
      issues.push({ code: "banned_phrase", detail: `Avoided phrase found: ${phrase}` });
    }
  }

  for (const topic of normalizedTerms(input.bannedTopics)) {
    if (lowerPost.includes(topic)) {
      issues.push({ code: "banned_topic", detail: `Banned topic found: ${topic}` });
    }
  }

  const evidenceText = stringsFromUnknown({
    approvedProof: input.approvedProof,
    selectedSource: input.selectedSource,
  }).join(" ");
  const allowedNumbers = numericTokens(evidenceText);

  for (const token of numericTokens(input.finalPost)) {
    if (!allowedNumbers.has(token)) {
      issues.push({
        code: "unsupported_numeric_claim",
        detail: `Numeric claim is not present in approved evidence: ${token}`,
      });
    }
  }

  const lowerEvidence = evidenceText.toLowerCase();
  for (const quote of quotedClaims(input.finalPost)) {
    if (!lowerEvidence.includes(quote.toLowerCase())) {
      issues.push({
        code: "unsupported_quote",
        detail: "Quoted language is not present in approved evidence.",
      });
    }
  }

  if (
    countCtaSignals(input.cta) > 1 ||
    (input.plan.execution.ctaType === "none" && input.cta.trim().length > 0)
  ) {
    issues.push({
      code: "excessive_cta",
      detail: "The closing contains multiple asks or conflicts with CTA type none.",
    });
  }

  if (!generationPlanV2Schema.safeParse(input.plan).success) {
    issues.push({
      code: "invalid_taxonomy",
      detail: "The generation plan contains an invalid taxonomy value.",
    });
  }

  if (
    input.plan.sourceMode === "trend_card" &&
    /\b(i(?:'|’)ve|i have|we(?:'|’)ve|we have|i saw|we saw|i noticed|we noticed|in my experience|in our experience)\b/i.test(
      input.finalPost,
    )
  ) {
    issues.push({
      code: "source_mode_drift",
      detail: "TrendCard-only content cannot imply founder lived experience.",
    });
  }

  const selectedResource =
    input.selectedResource &&
    typeof input.selectedResource === "object" &&
    !Array.isArray(input.selectedResource)
      ? (input.selectedResource as Record<string, unknown>)
      : null;
  const resourceId =
    typeof selectedResource?.id === "string" ? selectedResource.id : null;
  const keyword =
    typeof selectedResource?.keyword === "string"
      ? selectedResource.keyword.trim()
      : "";
  const isResourcePost =
    input.plan.execution.contentArchetype === "resource_post";
  const isCommentGate = input.plan.execution.ctaType === "comment_gate";
  const resourcePairingIsValid =
    isResourcePost === isCommentGate &&
    isResourcePost === Boolean(input.plan.execution.resourceId) &&
    (!isResourcePost ||
      (resourceId === input.plan.execution.resourceId &&
        keyword.length > 0 &&
        input.cta.toLowerCase().includes(keyword.toLowerCase())));

  if (!resourcePairingIsValid) {
    issues.push({
      code: "invalid_resource_post",
      detail:
        "Resource-post, comment-gate, selected-resource, and keyword requirements do not match.",
    });
  }

  return issues;
}
