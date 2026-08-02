import { describe, expect, it } from "vitest";

import type { QaResult } from "@/lib/ai/playbooks/contracts";
import {
  composeRiskNotes,
  dedupeWarnings,
  parseQaWarningCodes,
  QA_WARNING_CODES,
  QA_WARNING_LABELS,
  warningsFromDeterministicIssues,
  warningsFromFailedChecks,
} from "@/lib/ai/playbooks/qa-warnings";

const passingChecks: QaResult["checks"] = {
  sourceFidelity: "pass",
  credibility: "pass",
  icpFit: "pass",
  beliefShiftClarity: "pass",
  voice: "pass",
  structure: "pass",
  ctaFit: "pass",
  readability: "pass",
};

describe("qa warnings", () => {
  it("maps deterministic issues to safe codes without carrying detail text", () => {
    const codes = warningsFromDeterministicIssues([
      { code: "unsupported_numeric_claim", detail: "Numeric claim: $500k" },
      { code: "invalid_resource_post", detail: "Keyword mismatch." },
    ]);

    expect(codes).toEqual(["unsupported_numeric_claim", "resource_mismatch"]);
    expect(JSON.stringify(codes)).not.toContain("$500k");
  });

  it("maps failed QA checks to safe codes", () => {
    expect(
      warningsFromFailedChecks({
        ...passingChecks,
        credibility: "fail",
        icpFit: "fail",
      }),
    ).toEqual(["strategy_exceeds_source", "audience_mismatch"]);
    expect(warningsFromFailedChecks(passingChecks)).toEqual([]);
  });

  it("every warning code has a human label", () => {
    for (const code of QA_WARNING_CODES) {
      expect(QA_WARNING_LABELS[code]).toBeTruthy();
    }
  });

  it("deduplicates repeated codes", () => {
    expect(
      dedupeWarnings(["excessive_cta", "excessive_cta", "banned_topic"]),
    ).toEqual(["excessive_cta", "banned_topic"]);
  });

  it("appends warning labels to risk notes, one per line", () => {
    const composed = composeRiskNotes("Do not generalize.", [
      "unsupported_quote",
      "unsupported_quote",
    ]);

    expect(composed.split("\n")).toEqual([
      "Do not generalize.",
      `AI review flag: ${QA_WARNING_LABELS.unsupported_quote}`,
    ]);
  });

  it("leaves risk notes untouched when there are no warnings", () => {
    expect(composeRiskNotes("Do not generalize.", [])).toBe(
      "Do not generalize.",
    );
  });

  it("ignores unknown codes when reading a stored qa_result", () => {
    expect(
      parseQaWarningCodes(["excessive_cta", "some_future_code", 42]),
    ).toEqual(["excessive_cta"]);
    expect(parseQaWarningCodes(null)).toEqual([]);
    expect(parseQaWarningCodes("nope")).toEqual([]);
  });
});
