import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { canManageResearchSources } from "@/lib/access/client-access";
import { getServerUser } from "@/lib/supabase/session";
import {
  INITIAL_RESEARCH_PROMPT,
  evidenceSchema,
  storedFindingSchema,
  type BriefingView,
  type ResearchSettings,
} from "./contracts";

export async function getResearchSettings(
  clientId: string,
): Promise<ResearchSettings | null> {
  const { user } = await getServerUser();
  if (!user || !(await canManageResearchSources(user.id, clientId)))
    return null;
  const db = await createClient();
  const { data: head, error } = await db
    .from("research_settings")
    .select("revision")
    .eq("client_id", clientId)
    .maybeSingle();
  if (error) throw new Error("RESEARCH_SCHEMA_UNAVAILABLE");
  if (!head || head.revision === 0)
    return {
      revision: 0,
      prompt: INITIAL_RESEARCH_PROMPT,
      lookbackDays: 7,
      useProfileContext: false,
    };
  const { data: version, error: versionError } = await db
    .from("research_prompt_versions")
    .select("revision,prompt,lookback_days,use_profile_context")
    .eq("client_id", clientId)
    .eq("revision", head.revision)
    .single();
  if (versionError || !version)
    throw new Error("RESEARCH_SETTINGS_UNAVAILABLE");
  return {
    revision: version.revision,
    prompt: version.prompt,
    lookbackDays: version.lookback_days,
    useProfileContext: version.use_profile_context,
  };
}

export async function getWebBriefings(
  clientId: string,
  briefingId?: string,
): Promise<BriefingView[]> {
  const db = await createClient();
  let query = db
    .from("research_briefings")
    .select(
      "id,revision,outcome,summary,coverage_gaps,error_code,created_at,candidate_count,run_id",
    )
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(10);
  if (briefingId && z.string().uuid().safeParse(briefingId).success)
    query = query.eq("id", briefingId);
  const { data, error } = await query;
  if (error) throw new Error("RESEARCH_SCHEMA_UNAVAILABLE");
  if (!data?.length) return [];
  const ids = data.map((row) => row.id);
  const [findings, candidates, runs] = await Promise.all([
    db
      .from("research_findings")
      .select(
        "id,briefing_id,payload,fingerprint,approval_status,content_idea_id",
      )
      .eq("client_id", clientId)
      .in("briefing_id", ids)
      .order("created_at"),
    // PostgREST's row cap must not silently hide part of the retained evidence.
    Promise.all(
      ids.map(async (briefingId) => {
        const rows: { briefing_id: string; evidence: unknown }[] = [];
        for (let offset = 0; ; offset += 500) {
          const page = await db
            .from("research_candidates")
            .select("briefing_id,evidence")
            .eq("client_id", clientId)
            .eq("briefing_id", briefingId)
            .order("id")
            .range(offset, offset + 499);
          if (page.error) throw new Error("RESEARCH_RESULTS_UNAVAILABLE");
          rows.push(...(page.data ?? []));
          if ((page.data?.length ?? 0) < 500) break;
        }
        return rows;
      }),
    ).then((rows) => rows.flat()),
    db
      .from("research_runs")
      .select("id,status")
      .eq("client_id", clientId)
      .in(
        "id",
        data.map((b) => b.run_id),
      ),
  ]);
  if (findings.error || runs.error)
    throw new Error("RESEARCH_RESULTS_UNAVAILABLE");
  return data.map((row) => ({
    ...row,
    coverage_gaps: Array.isArray(row.coverage_gaps)
      ? (row.coverage_gaps as string[])
      : [],
    outcome:
      row.outcome === "running" &&
      ["failed", "cancelled"].includes(
        runs.data?.find((r) => r.id === row.run_id)?.status ?? "",
      )
        ? "failed"
        : row.outcome,
    findings: (findings.data ?? [])
      .filter((f) => f.briefing_id === row.id)
      .flatMap((f) => {
        const parsed = storedFindingSchema.safeParse(f.payload);
        return parsed.success
          ? [
              {
                ...parsed.data,
                id: f.id,
                fingerprint: f.fingerprint,
                approval_status: f.approval_status,
                content_idea_id: f.content_idea_id,
              },
            ]
          : [];
      }),
    candidates: candidates
      .filter((c) => c.briefing_id === row.id)
      .flatMap((c) => {
        const parsed = evidenceSchema
          .extend({ fetchedAt: z.string().datetime() })
          .safeParse(c.evidence);
        return parsed.success ? [parsed.data] : [];
      }),
  }));
}

export async function getPreviousFindings(clientId: string) {
  const db = await createClient();
  const { data, error } = await db
    .from("research_findings")
    .select("id,payload,fingerprint")
    .eq("client_id", clientId)
    .neq("approval_status", "archived")
    .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString())
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) throw new Error("RESEARCH_HISTORY_UNAVAILABLE");
  return (data ?? []).flatMap((row) => {
    const parsed = storedFindingSchema.safeParse(row.payload);
    return parsed.success
      ? [{ ...parsed.data, id: row.id, fingerprint: row.fingerprint }]
      : [];
  });
}
