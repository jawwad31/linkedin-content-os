import type { QaResult } from "./contracts";
import type { DeterministicCheckIssue } from "./deterministic-checks";

export const QA_BLOCK_STAGES = [
  "initial_review",
  "corrective_review",
  "final_validation",
] as const;
export type QaBlockStage = (typeof QA_BLOCK_STAGES)[number];

export const QA_REASON_CODES = [
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
] as const;
export type QaReasonCode = (typeof QA_REASON_CODES)[number];

export const QA_RECOMMENDED_ACTIONS = [
  "edit_founder_direction",
  "add_approved_proof",
  "change_strategy",
  "change_cta",
  "retry",
] as const;
export type QaRecommendedAction = (typeof QA_RECOMMENDED_ACTIONS)[number];

export type QaBlockDetails = {
  blockedStage: QaBlockStage;
  reasonCodes: QaReasonCode[];
  recommendedActions: QaRecommendedAction[];
};

const DETERMINISTIC_TO_REASON: Record<
  DeterministicCheckIssue["code"],
  QaReasonCode
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

const FAILED_CHECK_TO_REASON: Record<keyof QaResult["checks"], QaReasonCode> = {
  sourceFidelity: "unsupported_claim",
  credibility: "strategy_exceeds_source",
  icpFit: "audience_mismatch",
  beliefShiftClarity: "unclear_argument",
  voice: "voice_mismatch",
  structure: "structure_issue",
  ctaFit: "cta_issue",
  readability: "readability_issue",
};

const REASON_TO_ACTION: Record<QaReasonCode, QaRecommendedAction> = {
  strategy_exceeds_source: "change_strategy",
  unsupported_claim: "add_approved_proof",
  unsupported_numeric_claim: "add_approved_proof",
  unsupported_quote: "add_approved_proof",
  source_mode_drift: "edit_founder_direction",
  excessive_cta: "change_cta",
  cta_issue: "change_cta",
  audience_mismatch: "change_strategy",
  unclear_argument: "change_strategy",
  banned_topic: "change_strategy",
  internal_scaffolding: "retry",
  banned_phrase: "retry",
  invalid_taxonomy: "retry",
  resource_mismatch: "retry",
  voice_mismatch: "retry",
  structure_issue: "retry",
  readability_issue: "retry",
};

function reasonCodesFromDeterministicIssues(
  issues: DeterministicCheckIssue[],
): QaReasonCode[] {
  return issues.map((issue) => DETERMINISTIC_TO_REASON[issue.code]);
}

function reasonCodesFromFailedChecks(checks: QaResult["checks"]): QaReasonCode[] {
  return (
    Object.entries(checks) as Array<[keyof QaResult["checks"], "pass" | "fail"]>
  )
    .filter(([, value]) => value === "fail")
    .map(([key]) => FAILED_CHECK_TO_REASON[key]);
}

function recommendedActionsForReasonCodes(
  codes: QaReasonCode[],
): QaRecommendedAction[] {
  return [...new Set(codes.map((code) => REASON_TO_ACTION[code]))];
}

export function buildQaBlockDetails(input: {
  stage: QaBlockStage;
  deterministicIssues?: DeterministicCheckIssue[];
  qaChecks?: QaResult["checks"];
}): QaBlockDetails {
  const rawCodes = [
    ...reasonCodesFromDeterministicIssues(input.deterministicIssues ?? []),
    ...(input.qaChecks ? reasonCodesFromFailedChecks(input.qaChecks) : []),
  ];
  const reasonCodes =
    rawCodes.length > 0
      ? [...new Set(rawCodes)]
      : (["strategy_exceeds_source"] as QaReasonCode[]);

  return {
    blockedStage: input.stage,
    reasonCodes,
    recommendedActions: recommendedActionsForReasonCodes(reasonCodes),
  };
}

export const QA_REASON_CODE_LABELS: Record<QaReasonCode, string> = {
  strategy_exceeds_source: "The argument reached beyond what the source supports.",
  unsupported_claim: "A claim could not be traced back to the source or evidence.",
  unsupported_numeric_claim: "A number was not present in approved evidence or the source.",
  unsupported_quote: "A quotation was not present in approved evidence.",
  source_mode_drift: "The draft implied first-hand experience the source does not support.",
  excessive_cta: "The closing asked for more than one action.",
  internal_scaffolding: "Internal planning language leaked into the post.",
  banned_phrase: "A phrase on the avoid list appeared in the post.",
  banned_topic: "A banned topic appeared in the post.",
  invalid_taxonomy: "The generation plan used an invalid strategy value.",
  resource_mismatch: "The resource, CTA, and keyword did not line up.",
  audience_mismatch: "The post did not stay focused on the target buyer.",
  unclear_argument: "The belief shift was not clearly earned.",
  voice_mismatch: "The voice or tone drifted from the founder's style.",
  structure_issue: "The post did not follow the planned structure.",
  cta_issue: "The closing did not match the planned CTA type.",
  readability_issue: "The post was difficult to read as written.",
};

export const QA_RECOMMENDED_ACTION_LABELS: Record<QaRecommendedAction, string> = {
  edit_founder_direction: "Edit Founder Direction",
  add_approved_proof: "Add genuine Approved Evidence",
  change_strategy: "Narrow the argument",
  change_cta: "Change the CTA",
  retry: "Retry",
};

export function parseQaBlockDetails(value: unknown): QaBlockDetails | undefined {
  if (!value || typeof value !== "object") return undefined;
  const details = value as Record<string, unknown>;
  const reasonCodes = Array.isArray(details.reasonCodes)
    ? details.reasonCodes.filter(
        (code): code is QaReasonCode =>
          typeof code === "string" && code in QA_REASON_CODE_LABELS,
      )
    : [];
  const recommendedActions = Array.isArray(details.recommendedActions)
    ? details.recommendedActions.filter(
        (action): action is QaRecommendedAction =>
          typeof action === "string" && action in QA_RECOMMENDED_ACTION_LABELS,
      )
    : [];
  if (reasonCodes.length === 0) return undefined;
  return {
    blockedStage: details.blockedStage as QaBlockStage,
    reasonCodes,
    recommendedActions,
  };
}
