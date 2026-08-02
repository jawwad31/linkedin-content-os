import type { QaResult } from "./contracts";
import type { DeterministicCheckIssue } from "./deterministic-checks";

/**
 * QA is advisory. Nothing here prevents a draft from being created — these
 * codes are attached to the stored post so the human reviewer can see what the
 * AI was uneasy about before approving it.
 *
 * Only these closed enum values ever leave the server. The deterministic
 * `detail` strings and the model's free-text `issues` quote fragments of the
 * draft and must stay internal.
 */
export const QA_WARNING_CODES = [
  "strategy_exceeds_source",
  "unsupported_claim",
  "unsupported_numeric_claim",
  "unsupported_quote",
  "source_mode_drift",
  "excessive_cta",
  "internal_scaffolding",
  "banned_phrase",
  "banned_topic",
  "invalid_taxonomy",
  "resource_mismatch",
  "audience_mismatch",
  "unclear_argument",
  "voice_mismatch",
  "structure_issue",
  "cta_issue",
  "readability_issue",
  "qa_fallback_to_draft",
] as const;

export type QaWarningCode = (typeof QA_WARNING_CODES)[number];

export const QA_WARNING_LABELS: Record<QaWarningCode, string> = {
  strategy_exceeds_source:
    "The argument may reach beyond what the selected source supports.",
  unsupported_claim:
    "A claim could not be traced back to the source or approved evidence.",
  unsupported_numeric_claim:
    "A number is not present in approved evidence, the source, or your saved ICP.",
  unsupported_quote: "A quotation is not present in approved evidence.",
  source_mode_drift:
    "The draft implies first-hand experience this source cannot support.",
  excessive_cta: "The closing asks for more than one action.",
  internal_scaffolding: "Internal planning language may have leaked into the post.",
  banned_phrase: "A phrase from your avoid list appears in the post.",
  banned_topic: "A banned topic appears in the post.",
  invalid_taxonomy: "The generation plan used an invalid strategy value.",
  resource_mismatch: "The resource, CTA, and keyword do not line up.",
  audience_mismatch: "The post may not stay focused on the target buyer.",
  unclear_argument: "The belief shift may not be clearly earned.",
  voice_mismatch: "The voice or tone may drift from the founder's style.",
  structure_issue: "The post may not follow the planned structure.",
  readability_issue: "The post may be difficult to read as written.",
  cta_issue: "The closing may not match the planned CTA type.",
  qa_fallback_to_draft:
    "The AI reviewer declined to finalise this draft, so the original draft was kept.",
};

const DETERMINISTIC_TO_WARNING: Record<
  DeterministicCheckIssue["code"],
  QaWarningCode
> = {
  internal_scaffolding: "internal_scaffolding",
  banned_phrase: "banned_phrase",
  banned_topic: "banned_topic",
  unsupported_numeric_claim: "unsupported_numeric_claim",
  unsupported_quote: "unsupported_quote",
  excessive_cta: "excessive_cta",
  invalid_taxonomy: "invalid_taxonomy",
  source_mode_drift: "source_mode_drift",
  invalid_resource_post: "resource_mismatch",
};

const FAILED_CHECK_TO_WARNING: Record<keyof QaResult["checks"], QaWarningCode> = {
  sourceFidelity: "unsupported_claim",
  credibility: "strategy_exceeds_source",
  icpFit: "audience_mismatch",
  beliefShiftClarity: "unclear_argument",
  voice: "voice_mismatch",
  structure: "structure_issue",
  ctaFit: "cta_issue",
  readability: "readability_issue",
};

export function warningsFromDeterministicIssues(
  issues: DeterministicCheckIssue[],
): QaWarningCode[] {
  return issues.map((issue) => DETERMINISTIC_TO_WARNING[issue.code]);
}

export function warningsFromFailedChecks(
  checks: QaResult["checks"],
): QaWarningCode[] {
  return (
    Object.entries(checks) as Array<[keyof QaResult["checks"], "pass" | "fail"]>
  )
    .filter(([, value]) => value === "fail")
    .map(([key]) => FAILED_CHECK_TO_WARNING[key]);
}

export function dedupeWarnings(codes: QaWarningCode[]): QaWarningCode[] {
  return [...new Set(codes)];
}

/** Reads warning codes back off a stored qa_result, ignoring anything unknown. */
export function parseQaWarningCodes(value: unknown): QaWarningCode[] {
  if (!Array.isArray(value)) return [];
  return value.filter((code): code is QaWarningCode =>
    typeof code === "string" && code in QA_WARNING_LABELS,
  );
}

/**
 * Appends the safe warning labels to the reviewer's own risk notes so they
 * surface in the existing Risk Notes panel, one per line.
 */
export function composeRiskNotes(
  riskNotes: string,
  codes: QaWarningCode[],
): string {
  if (codes.length === 0) return riskNotes;

  return [
    riskNotes.trim(),
    ...dedupeWarnings(codes).map(
      (code) => `AI review flag: ${QA_WARNING_LABELS[code]}`,
    ),
  ]
    .filter(Boolean)
    .join("\n");
}
