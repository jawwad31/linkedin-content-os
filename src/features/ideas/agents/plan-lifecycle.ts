import {
  isCompatibleGenerationPlan,
  type GenerationPlanV2,
} from "@/lib/ai/playbooks/contracts";

export type PlanDecision =
  | { action: "reuse"; plan: GenerationPlanV2 }
  | { action: "replan"; reason: "missing" | "incompatible" | "outdated" };

export function decideGenerationPlan(input: {
  plan: unknown;
  version: number | null;
  storedInputHash: string | null;
  currentInputHash: string;
  sourceMode: string;
}): PlanDecision {
  if (input.plan === null || input.plan === undefined) {
    return { action: "replan", reason: "missing" };
  }

  if (!isCompatibleGenerationPlan(input.plan, input.sourceMode, input.version)) {
    return { action: "replan", reason: "incompatible" };
  }

  if (input.storedInputHash !== input.currentInputHash) {
    return { action: "replan", reason: "outdated" };
  }

  return { action: "reuse", plan: input.plan };
}
