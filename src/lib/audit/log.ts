import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

type AuditLogInput = {
  clientId: string | null;
  userId: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
};

/**
 * Writes a lightweight audit log entry using the service role. audit_logs
 * has no INSERT policy for the authenticated role (Feature 04) — writes are
 * intentionally restricted to trusted server-side code. Never pass raw
 * prompts, secrets, or full business context in metadata.
 *
 * Best-effort: a logging failure never blocks the caller's actual mutation,
 * which has already succeeded by the time this runs.
 */
export async function writeAuditLog(input: AuditLogInput) {
  const supabase = createAdminClient();

  const { error } = await supabase.from("audit_logs").insert({
    client_id: input.clientId,
    user_id: input.userId,
    action: input.action,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    metadata: input.metadata ?? {},
  });

  if (error) {
    console.error("Failed to write audit log for action:", input.action);
  }
}
