import "server-only";

import { createClient } from "@/lib/supabase/server";

const LOG_LIMIT = 25;

export type OperationalAuditLog = {
  id: string;
  action: string;
  actorUserId: string | null;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type OperationalLlmLog = {
  id: string;
  feature: string;
  provider: string;
  model: string;
  status: "success" | "error";
  tokenInputCount: number | null;
  tokenOutputCount: number | null;
  estimatedCost: number | null;
  errorType: string | null;
  createdAt: string;
};

export type OperationalLogsResult =
  | {
      ok: true;
      auditLogs: OperationalAuditLog[];
      llmLogs: OperationalLlmLog[];
    }
  | { ok: false };

type AuditLogRow = {
  id: string;
  action: string;
  user_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  metadata: unknown;
  created_at: string;
};

type LlmLogRow = {
  id: string;
  provider: string;
  model: string;
  feature: string;
  status: "success" | "error";
  token_input_count: number | null;
  token_output_count: number | null;
  estimated_cost: number | null;
  error_type: string | null;
  created_at: string;
};

function toMetadata(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

/**
 * Recent operational logs for one Client Workspace. Callers must already have
 * enforced Account Admin visibility; this query is still scoped by client_id
 * and remains subject to RLS.
 */
export async function getOperationalLogs(
  clientId: string,
): Promise<OperationalLogsResult> {
  const supabase = await createClient();

  const [auditResult, llmResult] = await Promise.all([
    supabase
      .from("audit_logs")
      .select("id, action, user_id, entity_type, entity_id, metadata, created_at")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(LOG_LIMIT)
      .returns<AuditLogRow[]>(),
    supabase
      .from("llm_logs")
      .select(
        "id, provider, model, feature, status, token_input_count, token_output_count, estimated_cost, error_type, created_at",
      )
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(LOG_LIMIT)
      .returns<LlmLogRow[]>(),
  ]);

  if (auditResult.error || llmResult.error) return { ok: false };

  return {
    ok: true,
    auditLogs: auditResult.data.map((row) => ({
      id: row.id,
      action: row.action,
      actorUserId: row.user_id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      metadata: toMetadata(row.metadata),
      createdAt: row.created_at,
    })),
    llmLogs: llmResult.data.map((row) => ({
      id: row.id,
      provider: row.provider,
      model: row.model,
      feature: row.feature,
      status: row.status,
      tokenInputCount: row.token_input_count,
      tokenOutputCount: row.token_output_count,
      estimatedCost: row.estimated_cost,
      errorType: row.error_type,
      createdAt: row.created_at,
    })),
  };
}
