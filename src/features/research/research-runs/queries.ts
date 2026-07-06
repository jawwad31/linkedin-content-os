import "server-only";

import { createClient } from "@/lib/supabase/server";

import type { ResearchRun } from "./types";

type ResearchRunRow = {
  id: string;
  status: ResearchRun["status"];
  stage: string | null;
  trigger_type: ResearchRun["triggerType"];
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  sources_processed: number;
  total_fetched: number;
  total_new: number;
  skipped_duplicate: number;
  skipped_invalid: number;
  skipped_error: number;
  error_count: number;
  classified_count: number;
  relevant_count: number;
  irrelevant_count: number;
  classification_error_count: number;
  signals_created: number;
  synthesis_error_count: number;
  created_at: string;
};

export type RecentResearchRunsResult =
  | { ok: true; runs: ResearchRun[] }
  | { ok: false };

/**
 * Most recent research runs for one client, newest first. Scoped by
 * client_id; RLS's research_runs_select_accepted_access policy is the
 * backstop, not the primary access gate (the [client_id] layout already
 * verifies accepted access before this ever runs).
 */
export async function getRecentResearchRuns(
  clientId: string,
  limit = 10,
): Promise<RecentResearchRunsResult> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("research_runs")
    .select(
      "id, status, stage, trigger_type, error_message, started_at, finished_at, sources_processed, total_fetched, total_new, skipped_duplicate, skipped_invalid, skipped_error, error_count, classified_count, relevant_count, irrelevant_count, classification_error_count, signals_created, synthesis_error_count, created_at",
    )
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<ResearchRunRow[]>();

  if (error) return { ok: false };

  return {
    ok: true,
    runs: data.map((row) => ({
      id: row.id,
      status: row.status,
      stage: row.stage,
      triggerType: row.trigger_type,
      errorMessage: row.error_message,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      sourcesProcessed: row.sources_processed,
      totalFetched: row.total_fetched,
      totalNew: row.total_new,
      skippedDuplicate: row.skipped_duplicate,
      skippedInvalid: row.skipped_invalid,
      skippedError: row.skipped_error,
      errorCount: row.error_count,
      classifiedCount: row.classified_count,
      relevantCount: row.relevant_count,
      irrelevantCount: row.irrelevant_count,
      classificationErrorCount: row.classification_error_count,
      signalsCreated: row.signals_created,
      synthesisErrorCount: row.synthesis_error_count,
      createdAt: row.created_at,
    })),
  };
}
