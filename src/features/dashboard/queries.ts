import "server-only";

import { createClient } from "@/lib/supabase/server";

type ClientSetupFieldsRow = {
  name: string | null;
  founder_name: string | null;
  industry: string | null;
  business_description: string | null;
  primary_icp: string | null;
  main_offer: string | null;
  core_pov: string | null;
  content_pillars: unknown;
  research_keywords: unknown;
  approved_proof: unknown;
  publishing_preferences: unknown;
};

const SETUP_FIELD_KEYS = [
  "name",
  "founder_name",
  "industry",
  "business_description",
  "primary_icp",
  "main_offer",
  "core_pov",
  "content_pillars",
  "research_keywords",
  "approved_proof",
  "publishing_preferences",
] as const satisfies readonly (keyof ClientSetupFieldsRow)[];

function isFieldComplete(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

type ResearchRunRow = {
  status: string;
  stage: string | null;
  started_at: string | null;
  created_at: string;
};

export type LatestResearchRun = {
  status: string;
  stage: string | null;
  timestamp: string;
};

export type DashboardMetrics = {
  setupCompleteness: { completed: number; total: number; percent: number };
  latestResearchRun: LatestResearchRun | null;
  collectedArticlesCount: number;
  marketSignalsCount: number;
  ideasCount: number;
  postsNeedingReviewCount: number;
  approvedPostsCount: number;
};

export type DashboardMetricsResult =
  | { ok: true; metrics: DashboardMetrics }
  | { ok: false };

/**
 * High-level status metrics for one client's dashboard. Every query below
 * is explicitly scoped by client_id (never by a bare record id), with RLS
 * as the backstop. Uses the authenticated server client, not service role.
 */
export async function getDashboardMetrics(
  clientId: string,
): Promise<DashboardMetricsResult> {
  const supabase = await createClient();

  const [
    clientResult,
    researchRunResult,
    articlesResult,
    signalsResult,
    ideasResult,
    needsReviewResult,
    approvedResult,
  ] = await Promise.all([
    supabase
      .from("clients")
      .select(SETUP_FIELD_KEYS.join(", "))
      .eq("id", clientId)
      .is("deleted_at", null)
      .maybeSingle<ClientSetupFieldsRow>(),
    supabase
      .from("research_runs")
      .select("status, stage, started_at, created_at")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<ResearchRunRow>(),
    supabase
      .from("market_signal_items")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId)
      .is("deleted_at", null),
    supabase
      .from("market_signals")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId)
      .is("deleted_at", null),
    supabase
      .from("content_ideas")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId)
      .is("deleted_at", null),
    supabase
      .from("posts")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId)
      .is("deleted_at", null)
      .in("status", ["review", "needs_edit"]),
    supabase
      .from("posts")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId)
      .is("deleted_at", null)
      .eq("status", "approved"),
  ]);

  if (
    clientResult.error ||
    researchRunResult.error ||
    articlesResult.error ||
    signalsResult.error ||
    ideasResult.error ||
    needsReviewResult.error ||
    approvedResult.error
  ) {
    return { ok: false };
  }

  const clientRow = clientResult.data;
  const completed = clientRow
    ? SETUP_FIELD_KEYS.filter((key) => isFieldComplete(clientRow[key])).length
    : 0;
  const total: number = SETUP_FIELD_KEYS.length;

  const runRow = researchRunResult.data;

  return {
    ok: true,
    metrics: {
      setupCompleteness: {
        completed,
        total,
        percent: total === 0 ? 0 : Math.round((completed / total) * 100),
      },
      latestResearchRun: runRow
        ? {
            status: runRow.status,
            stage: runRow.stage,
            timestamp: runRow.started_at ?? runRow.created_at,
          }
        : null,
      collectedArticlesCount: articlesResult.count ?? 0,
      marketSignalsCount: signalsResult.count ?? 0,
      ideasCount: ideasResult.count ?? 0,
      postsNeedingReviewCount: needsReviewResult.count ?? 0,
      approvedPostsCount: approvedResult.count ?? 0,
    },
  };
}
