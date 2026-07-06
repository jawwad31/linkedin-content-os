import "server-only";

import { writeAuditLog } from "@/lib/audit/log";
import { createAdminClient } from "@/lib/supabase/admin";

import type { ResearchRunSummary, ResearchRunTriggerType } from "./types";

/** Lock key for the RSS collection stage. Reused by the worker today and by
 * a future manual research runner (Feature 16) — both share this same
 * lock, so a manual click can't overlap with a worker cycle either. */
export const RSS_COLLECT_LOCK_KEY = "rss_collect";

const STALE_RUN_THRESHOLD_MS = 2 * 60 * 60 * 1000;
const STALE_RUN_ERROR = "Research run timed out before completion.";
const RUN_FAILURE_ERROR = "Research run failed. Please try again later.";
const UNIQUE_VIOLATION = "23505";

type StartResearchRunResult =
  | { ok: true; runId: string }
  | { ok: false; reason: "locked" }
  | { ok: false; reason: "error" };

/**
 * Marks running runs older than the stale threshold as failed, scoped to
 * one client_id + lock_key. Runs before every lock attempt so a crashed
 * worker/replica can't hold the lock forever.
 */
async function failStaleRuns(
  admin: ReturnType<typeof createAdminClient>,
  clientId: string,
  lockKey: string,
): Promise<void> {
  const staleBefore = new Date(Date.now() - STALE_RUN_THRESHOLD_MS).toISOString();

  const { error } = await admin
    .from("research_runs")
    .update({
      status: "failed",
      finished_at: new Date().toISOString(),
      error_message: STALE_RUN_ERROR,
    })
    .eq("client_id", clientId)
    .eq("lock_key", lockKey)
    .eq("status", "running")
    .lt("started_at", staleBefore);

  if (error) {
    console.error("[research-runs] Could not clean up stale research runs.");
  }
}

/**
 * Attempts to acquire the distributed run lock for one client_id +
 * lock_key by inserting a `running` research_runs row. The partial unique
 * index on (client_id, lock_key) where status = 'running' is the actual
 * lock — a conflicting insert (23505) means another run already holds it.
 */
export async function startResearchRun(
  clientId: string,
  lockKey: string,
  triggerType: ResearchRunTriggerType,
  triggeredByUserId: string | null = null,
): Promise<StartResearchRunResult> {
  const admin = createAdminClient();

  await failStaleRuns(admin, clientId, lockKey);

  const now = new Date().toISOString();

  const { data, error } = await admin
    .from("research_runs")
    .insert({
      client_id: clientId,
      triggered_by_user_id: triggeredByUserId,
      trigger_type: triggerType,
      status: "running",
      stage: lockKey,
      lock_key: lockKey,
      started_at: now,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { ok: false, reason: "locked" };
    }
    console.error("[research-runs] Could not start research run.");
    return { ok: false, reason: "error" };
  }

  await writeAuditLog({
    clientId,
    userId: null,
    action: "research_run_started",
    entityType: "research_run",
    entityId: data.id,
    metadata: { trigger_type: triggerType, lock_key: lockKey },
  });

  return { ok: true, runId: data.id };
}

/** Marks a run successful and records its summary counters. */
export async function completeResearchRun(
  runId: string,
  summary: ResearchRunSummary,
): Promise<void> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("research_runs")
    .update({
      status: "success",
      finished_at: new Date().toISOString(),
      sources_processed: summary.sourcesProcessed,
      total_fetched: summary.totalFetched,
      total_new: summary.totalNew,
      skipped_duplicate: summary.skippedDuplicate,
      skipped_invalid: summary.skippedInvalid,
      skipped_error: summary.skippedError,
      error_count: summary.errorCount,
    })
    .eq("id", runId)
    .select("client_id, lock_key, trigger_type")
    .single();

  if (error || !data) {
    console.error("[research-runs] Could not mark research run complete.");
    return;
  }

  await writeAuditLog({
    clientId: data.client_id,
    userId: null,
    action: "research_run_completed",
    entityType: "research_run",
    entityId: runId,
    metadata: {
      trigger_type: data.trigger_type,
      lock_key: data.lock_key,
      sources_processed: summary.sourcesProcessed,
      total_new: summary.totalNew,
      error_count: summary.errorCount,
    },
  });
}

/** Marks a run failed with a short, safe error message only. */
export async function failResearchRun(
  runId: string,
  safeError: string,
): Promise<void> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("research_runs")
    .update({
      status: "failed",
      finished_at: new Date().toISOString(),
      error_message: safeError,
    })
    .eq("id", runId)
    .select("client_id, lock_key, trigger_type")
    .single();

  if (error || !data) {
    console.error("[research-runs] Could not mark research run failed.");
    return;
  }

  await writeAuditLog({
    clientId: data.client_id,
    userId: null,
    action: "research_run_failed",
    entityType: "research_run",
    entityId: runId,
    metadata: { trigger_type: data.trigger_type, lock_key: data.lock_key },
  });
}

export type RunGuardResult<T> =
  | { ok: true; status: "completed"; result: T }
  | { ok: true; status: "locked" }
  | { ok: false };

/**
 * Wraps one client's research work in the distributed run lock: acquires
 * the lock (or safely reports it's already held, without ever calling
 * `fn`), runs `fn`, and records success/failure on the research_runs row.
 * `fn` throwing outright (beyond whatever per-item error handling it
 * already does internally, e.g. collectForClient's broken-feed handling)
 * still ends the run as `failed` rather than leaving it stuck `running`.
 */
export async function withResearchRunGuard<T>(
  clientId: string,
  lockKey: string,
  triggerType: ResearchRunTriggerType,
  fn: () => Promise<T>,
  toSummary: (result: T) => ResearchRunSummary,
  triggeredByUserId: string | null = null,
): Promise<RunGuardResult<T>> {
  const start = await startResearchRun(clientId, lockKey, triggerType, triggeredByUserId);

  if (!start.ok) {
    if (start.reason === "locked") {
      console.log(
        `[research-runs] Skipped client — a run is already in progress (${lockKey}).`,
      );

      await writeAuditLog({
        clientId,
        userId: null,
        action: "research_run_skipped_locked",
        entityType: "research_run",
        metadata: { trigger_type: triggerType, lock_key: lockKey },
      });

      return { ok: true, status: "locked" };
    }

    return { ok: false };
  }

  try {
    const result = await fn();
    await completeResearchRun(start.runId, toSummary(result));
    return { ok: true, status: "completed", result };
  } catch {
    await failResearchRun(start.runId, RUN_FAILURE_ERROR);
    return { ok: false };
  }
}
