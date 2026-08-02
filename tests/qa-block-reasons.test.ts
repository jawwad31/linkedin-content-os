import { describe, expect, it } from "vitest";

import {
  buildQaBlockDetails,
  parseQaBlockDetails,
  QA_RECOMMENDED_ACTION_LABELS,
  QA_REASON_CODE_LABELS,
} from "@/lib/ai/playbooks/qa-block-reasons";
import type { QaResult } from "@/lib/ai/playbooks/contracts";

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

describe("buildQaBlockDetails", () => {
  it("maps deterministic issue codes to safe reason codes without leaking detail text", () => {
    const details = buildQaBlockDetails({
      stage: "final_validation",
      deterministicIssues: [
        { code: "unsupported_numeric_claim", detail: "Numeric claim: $500k" },
        { code: "unsupported_quote", detail: "Quoted language is not present." },
      ],
    });

    expect(details.blockedStage).toBe("final_validation");
    expect(details.reasonCodes).toEqual(
      expect.arrayContaining(["unsupported_numeric_claim", "unsupported_quote"]),
    );
    expect(JSON.stringify(details)).not.toContain("$500k");
    expect(details.recommendedActions).toContain("add_approved_proof");
  });

  it("maps failed QA checks to safe reason codes", () => {
    const details = buildQaBlockDetails({
      stage: "initial_review",
      qaChecks: { ...passingChecks, credibility: "fail", icpFit: "fail" },
    });

    expect(details.reasonCodes).toEqual(
      expect.arrayContaining(["strategy_exceeds_source", "audience_mismatch"]),
    );
    expect(details.recommendedActions).toContain("change_strategy");
  });

  it("falls back to a strategy-exceeds-source reason when no signal is available", () => {
    const details = buildQaBlockDetails({ stage: "corrective_review" });
    expect(details.reasonCodes).toEqual(["strategy_exceeds_source"]);
  });

  it("every reason code and recommended action has a safe human label", () => {
    const details = buildQaBlockDetails({
      stage: "initial_review",
      qaChecks: { ...passingChecks, voice: "fail" },
    });
    for (const code of details.reasonCodes) {
      expect(QA_REASON_CODE_LABELS[code]).toBeTruthy();
    }
    for (const action of details.recommendedActions) {
      expect(QA_RECOMMENDED_ACTION_LABELS[action]).toBeTruthy();
    }
  });
});

describe("parseQaBlockDetails", () => {
  it("accepts a well-formed API payload", () => {
    const parsed = parseQaBlockDetails({
      blockedStage: "initial_review",
      reasonCodes: ["strategy_exceeds_source"],
      recommendedActions: ["change_strategy"],
    });
    expect(parsed).toEqual({
      blockedStage: "initial_review",
      reasonCodes: ["strategy_exceeds_source"],
      recommendedActions: ["change_strategy"],
    });
  });

  it("drops unknown codes and returns undefined when nothing safe remains", () => {
    expect(
      parseQaBlockDetails({
        blockedStage: "initial_review",
        reasonCodes: ["some_new_unmapped_code"],
        recommendedActions: [],
      }),
    ).toBeUndefined();
    expect(parseQaBlockDetails(null)).toBeUndefined();
    expect(parseQaBlockDetails("not an object")).toBeUndefined();
  });
});
