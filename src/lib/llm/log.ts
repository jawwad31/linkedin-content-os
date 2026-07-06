import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

type LlmLogInput = {
  clientId: string | null;
  userId: string | null;
  provider: string;
  model: string;
  feature: string;
  status: "success" | "error";
  tokenInputCount?: number | null;
  tokenOutputCount?: number | null;
  estimatedCost?: number | null;
  errorType?: string | null;
};

/**
 * Writes a safe LLM metadata log entry using the service role. llm_logs has
 * no INSERT policy for the authenticated role — writes are intentionally
 * restricted to trusted server-side code. Never pass raw prompts, raw
 * provider responses, or business context here — metadata only.
 *
 * Best-effort: a logging failure never blocks the caller's actual
 * classification result, which has already been decided by the time this
 * runs.
 */
export async function writeLlmLog(input: LlmLogInput): Promise<void> {
  const supabase = createAdminClient();

  const { error } = await supabase.from("llm_logs").insert({
    client_id: input.clientId,
    user_id: input.userId,
    provider: input.provider,
    model: input.model,
    feature: input.feature,
    status: input.status,
    token_input_count: input.tokenInputCount ?? null,
    token_output_count: input.tokenOutputCount ?? null,
    estimated_cost: input.estimatedCost ?? null,
    error_type: input.errorType ?? null,
  });

  if (error) {
    console.error("Failed to write LLM log for feature:", input.feature);
  }
}
