import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  storedFindingSchema,
  settingsSchema,
  researchBudget,
  type ResearchResult,
} from "../web-research/contracts";
import { researchWeb } from "../web-research/pipeline/run";
import { fetchSource, type SourcePage } from "./safe-fetch";
import { automationEnabled } from "./contracts";
import { collectForClient } from "../rss-collector/collect-for-client";

type Admin = ReturnType<typeof createAdminClient>;
type Claim = {
  occurrenceId: string;
  token: string;
  briefingId: string;
  runId: string;
  actor: string;
};
async function renewClaim(db: Admin, clientId: string, claim: Claim) {
  const { data, error } = await db.rpc("renew_scheduled_research", {
    p_client_id: clientId,
    p_occurrence_id: claim.occurrenceId,
    p_token: claim.token,
  });
  if (error || !data?.ok) throw new Error("LEASE_CHANGED");
}
export async function refreshSource(
  db: Admin,
  clientId: string,
  source: { id: string; url: string; kind: string },
  actor: string,
  claim?: Claim,
  runId?: string,
) {
  const pages: SourcePage[] = [];
  let error: string | null = null;
  if (claim) await renewClaim(db, clientId, claim);
  try {
    if (source.kind !== "article") throw new Error("SOURCE_BLOCKED");
    const index = await fetchSource(source.url);
    pages.push(index);
  } catch (e) {
    error = sourceError(e);
  }
  const { data, error: commitError } = await db.rpc("record_research_source", {
    p_client_id: clientId,
    p_source_id: source.id,
    p_actor: actor,
    p_pages: pages,
    p_error: error,
    p_occurrence_id: claim?.occurrenceId ?? null,
    p_token: claim?.token ?? null,
    p_run_id: runId ?? null,
  });
  if (commitError || !data?.ok) throw new Error("SOURCE_COMMIT_FAILED");
  return {
    changed: Number(data.changed ?? 0),
    error,
  };
}
function sourceError(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  return ["SOURCE_BLOCKED", "SOURCE_TOO_LARGE"].includes(code)
    ? code
    : "SOURCE_UNAVAILABLE";
}
export async function loadResearchSources(
  db: Admin,
  clientId: string,
  actor: string,
  briefingId: string,
) {
  const { data, error } = await db.rpc("load_rss_research_context", {
    p_client_id: clientId,
    p_actor: actor,
    p_briefing_id: briefingId,
  });
  const parsed = z
    .object({
      ok: z.literal(true),
      sources: z
        .array(
          z.object({
            id: z.string().uuid(),
            url: z.string().url(),
            title: z.string(),
            text: z.string(),
            contentHash: z.string(),
            fetchedAt: z.string(),
            kind: z.enum(["article", "rss"]).optional(),
            feedUrl: z.string().url().optional(),
            feedPublishedAt: z.string().nullable().optional(),
          }),
        )
        .max(24),
      omitted: z.number().int().nonnegative(),
    })
    .safeParse(data);
  if (error || !parsed.success) throw new Error("SOURCE_HISTORY_UNAVAILABLE");
  return { sources: parsed.data.sources, omitted: parsed.data.omitted };
}
const claimSchema = z.object({
  ok: z.literal(true),
  occurrenceId: z.string().uuid(),
  token: z.string().uuid(),
  briefingId: z.string().uuid(),
  runId: z.string().uuid(),
  actor: z.string().uuid(),
  settings: settingsSchema.extend({ revision: z.number().int().positive() }),
  profile: z.record(z.string(), z.unknown()).nullable(),
});
const failedResult = (code: string): ResearchResult => ({
  outcome: "failed",
  errorCode: code,
  summary: "",
  coverageGaps: [
    "Scheduled research did not finish. A bounded retry may follow.",
  ],
  candidates: [],
  findings: [],
  toolCalls: 0,
  tokenInput: null,
  tokenOutput: null,
});

export async function dispatchResearchSchedules(): Promise<{
  claimed: number;
  finished: number;
  errors: number;
}> {
  const summary = { claimed: 0, finished: 0, errors: 0 };
  if (!automationEnabled()) return summary;
  const db = createAdminClient();
  const due = await db
    .from("research_schedules")
    .select("client_id")
    .eq("enabled", true)
    .lte("next_due_at", new Date().toISOString())
    .order("next_due_at")
    .limit(10);
  if (due.error) throw new Error("AUTOMATION_SCHEMA_UNAVAILABLE");
  for (const row of due.data ?? []) {
    const { data, error } = await db.rpc("claim_scheduled_research", {
      p_client_id: row.client_id,
      p_budget: researchBudget(),
    });
    if (error) {
      summary.errors++;
      continue;
    }
    if (!data?.ok) continue;
    const parsed = claimSchema.safeParse(data);
    if (!parsed.success) {
      summary.errors++;
      continue;
    }
    summary.claimed++;
    const claim = parsed.data;
    let result: ResearchResult;
    let sources: Awaited<ReturnType<typeof loadResearchSources>>["sources"] =
      [];
    try {
      const gaps: string[] = [];
      // Refresh feeds under this occurrence's existing RSS lock. This is
      // collection only: the saved prompt still performs fresh web research.
      const rss = await collectForClient(row.client_id, {
        maxSources: 10,
        beforeSource: () => renewClaim(db, row.client_id, claim),
      });
      if (rss.loadError || rss.errors.length)
        gaps.push(
          "Some RSS feeds could not be refreshed. Available feed articles and web search were used.",
        );
      if (rss.skippedSources)
        gaps.push(
          `${rss.skippedSources} RSS feeds were outside this run's ten-feed refresh budget. Their collected history is retained.`,
        );
      const context = await loadResearchSources(
        db,
        row.client_id,
        claim.actor,
        claim.briefingId,
      );
      sources = context.sources;
      if (context.omitted)
        gaps.push(
          `${context.omitted} sources were outside this run's input budget of four imported article URLs and twenty RSS articles. Their originals are retained.`,
        );
      const previous = await db
        .from("research_findings")
        .select("id,payload,fingerprint")
        .eq("client_id", row.client_id)
        .neq("approval_status", "archived")
        .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString())
        .order("created_at", { ascending: false })
        .limit(60);
      if (previous.error) throw new Error("HISTORY_UNAVAILABLE");
      const prior = (previous.data ?? []).flatMap((f) => {
        const p = storedFindingSchema.safeParse(f.payload);
        return p.success
          ? [{ ...p.data, id: f.id, fingerprint: f.fingerprint }]
          : [];
      });
      await renewClaim(db, row.client_id, claim);
      result = await researchWeb({
        clientId: row.client_id,
        userId: claim.actor,
        settings: claim.settings,
        profile: claim.profile,
        previous: prior,
        sources,
        beforeStage: () => renewClaim(db, row.client_id, claim),
      });
      if (gaps.length) {
        result.coverageGaps.push(...gaps);
        if (["success", "empty"].includes(result.outcome))
          result.outcome = "partial";
      }
    } catch {
      result = failedResult("AUTOMATION_FAILED");
    }
    const finished = await db.rpc("finish_scheduled_research", {
      p_client_id: row.client_id,
      p_occurrence_id: claim.occurrenceId,
      p_token: claim.token,
      p_result: result,
      p_sources: sources,
    });
    if (finished.error || !finished.data?.ok) summary.errors++;
    else summary.finished++;
  }
  return summary;
}
