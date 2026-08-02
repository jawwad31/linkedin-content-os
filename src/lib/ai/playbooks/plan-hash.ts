import { createHash } from "node:crypto";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }

  return value;
}

export type PlanHashInput = {
  businessContext: unknown;
  selectedSource: unknown;
  idea: unknown;
  founderDirection: string | null;
  strategyOverrides: unknown;
  resourceState: unknown;
  commentGateEligible: boolean;
};

export type SelectedSourceHashValue = {
  sourceMode: string;
  sourceIds: string[];
  sourceTitle: string | null;
  source: unknown;
  linkedTrendCard: unknown;
  sourceArticles: unknown;
};

export function buildSelectedSourceHashValue(
  input: SelectedSourceHashValue,
): SelectedSourceHashValue {
  return input;
}

export function computeGenerationPlanInputHash(input: PlanHashInput): string {
  const canonical = JSON.stringify(canonicalize(input));
  return createHash("sha256").update(canonical).digest("hex");
}
