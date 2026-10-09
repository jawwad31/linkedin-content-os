import "server-only";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  canAccessClient,
  canRunResearchAgent,
  canManageIdeas,
  canDraftPosts,
} from "@/lib/access/client-access";
import { writeAuditLog } from "@/lib/audit/log";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerUser } from "@/lib/supabase/session";
import { generatePostFromIdea } from "@/features/posts/generate/service";
import {
  RSS_COLLECT_LOCK_KEY,
  withResearchRunGuard,
} from "../research-runs/run-guard";
import {
  RESEARCH_BUDGET,
  runRequestSchema,
  saveSettingsSchema,
  type ResearchOutcome,
  type ResearchSettings,
} from "./contracts";
import { getPreviousFindings } from "./queries";
import { researchWeb } from "./provider";
import { automationEnabled } from "../automation/contracts";
import { loadResearchSources } from "../automation/executor";

type Result<T> =
  { ok: true; data: T } | { ok: false; code: string; message: string };
const messages: Record<string, string> = {
  FORBIDDEN: "You do not have permission to perform this research action.",
  REVISION_CHANGED:
    "Research settings changed. Refresh before saving or running.",
  RUN_IN_PROGRESS:
    "Research is already running for this workspace. Refresh shortly.",
  FINDING_UNAVAILABLE:
    "Select up to three approved findings from this workspace.",
  NOT_CONFIGURED:
    "Web research is not configured. An administrator must set up its provider.",
  VALIDATION_ERROR: "Check the research settings and try again.",
};
function failure(code = "UNKNOWN_ERROR"): Result<never> {
  return {
    ok: false,
    code,
    message:
      messages[code] ??
      "Could not complete this research action. Please refresh and try again.",
  };
}
async function authorize(
  clientId: string,
  mode: "manage" | "draft" = "manage",
) {
  const { user } = await getServerUser();
  if (
    !user ||
    !z.string().uuid().safeParse(clientId).success ||
    !(await canAccessClient(user.id, clientId))
  )
    return null;
  const allowed =
    mode === "manage"
      ? await canRunResearchAgent(user.id, clientId)
      : (await canManageIdeas(user.id, clientId)) &&
        (await canDraftPosts(user.id, clientId));
  return allowed ? user : null;
}

export async function saveWebResearchSettings(
  clientId: string,
  input: unknown,
): Promise<Result<{ revision: number }>> {
  const parsed = saveSettingsSchema.safeParse(input);
  if (!parsed.success) return failure("VALIDATION_ERROR");
  const user = await authorize(clientId);
  if (!user) return failure("FORBIDDEN");
  const db = await createClient();
  const { data, error } = await db.rpc("save_research_settings", {
    p_client_id: clientId,
    p_expected_revision: parsed.data.expectedRevision,
    p_prompt: parsed.data.prompt,
    p_lookback_days: parsed.data.lookbackDays,
    p_use_profile: parsed.data.useProfileContext,
  });
  if (error || !data?.ok) return failure(data?.code);
  await writeAuditLog({
    clientId,
    userId: user.id,
    action: "research_settings_saved",
    entityType: "client",
    entityId: clientId,
    metadata: {
      revision: data.revision,
      profile_context_enabled: parsed.data.useProfileContext,
    },
  });
  revalidatePath(`/client/${clientId}/research`);
  return { ok: true, data: { revision: data.revision } };
}

export async function runWebResearch(
  clientId: string,
  input: unknown,
): Promise<Result<{ id: string; outcome: ResearchOutcome | "running" }>> {
  const parsed = runRequestSchema.safeParse(input);
  if (!parsed.success) return failure("VALIDATION_ERROR");
  const user = await authorize(clientId);
  if (!user) return failure("FORBIDDEN");
  const db = await createClient();
  const prior = await db
    .from("research_briefings")
    .select("id,outcome,created_by,revision")
    .eq("client_id", clientId)
    .eq("request_key", parsed.data.requestKey)
    .maybeSingle();
  if (prior.error) return failure();
  if (prior.data)
    return prior.data.created_by === user.id &&
      prior.data.revision === parsed.data.expectedRevision
      ? { ok: true, data: { id: prior.data.id, outcome: prior.data.outcome } }
      : failure("FORBIDDEN");
  let problem: string | null = null;
  try {
    const previous = await getPreviousFindings(clientId);
    const guarded = await withResearchRunGuard(
      clientId,
      RSS_COLLECT_LOCK_KEY,
      "manual",
      async (runId) => {
        const { data: prepared, error } = await db.rpc("prepare_web_research", {
          p_client_id: clientId,
          p_run_id: runId,
          p_request_key: parsed.data.requestKey,
          p_revision: parsed.data.expectedRevision,
          p_budget: RESEARCH_BUDGET,
        });
        if (error || !prepared?.ok) {
          problem = prepared?.code ?? "UNKNOWN_ERROR";
          throw new Error("PREPARE_FAILED");
        }
        const settings: ResearchSettings = {
          revision: parsed.data.expectedRevision,
          prompt: prepared.prompt,
          lookbackDays: prepared.lookbackDays,
          useProfileContext: prepared.useProfileContext,
        };
        // The DB captures optional profile context only when the saved toggle is on.
        const admin = createAdminClient();
        const context = automationEnabled()
          ? await loadResearchSources(admin, clientId, user.id, prepared.id)
          : { sources: [], omitted: 0 };
        const sources = context.sources;
        const result = await researchWeb({
          clientId,
          userId: user.id,
          settings,
          profile: prepared.profile,
          previous,
          sources,
        });
        if (context.omitted) {
          result.coverageGaps.push(
            `${context.omitted} sources were outside this run's input budget of four imported article URLs and twenty RSS articles. Originals are retained.`,
          );
          if (["success", "empty"].includes(result.outcome))
            result.outcome = "partial";
        }
        const currentUser = await authorize(clientId);
        if (currentUser?.id !== user.id) {
          problem = "FORBIDDEN";
          throw new Error("ACCESS_CHANGED");
        }
        const { data: finished, error: finishError } = await admin.rpc(
          "finish_web_research",
          {
            p_client_id: clientId,
            p_briefing_id: prepared.id,
            p_actor: user.id,
            p_result: result,
          },
        );
        if (finishError || !finished?.ok) {
          problem = finished?.code ?? "UNKNOWN_ERROR";
          throw new Error("COMMIT_FAILED");
        }
        return { id: prepared.id as string, ...result };
      },
      (result) => ({
        sourcesProcessed: result.candidates.length,
        totalFetched: result.candidates.length,
        totalNew: result.findings.filter((f) => f.novelty !== "repeated")
          .length,
        skippedDuplicate: result.findings.filter(
          (f) => f.novelty === "repeated",
        ).length,
        skippedInvalid: 0,
        skippedError: result.outcome === "failed" ? 1 : 0,
        errorCount: result.coverageGaps.length,
        signalsCreated: result.findings.length,
      }),
      user.id,
      "web_research",
      (result) =>
        result.outcome === "failed" || result.outcome === "not_configured",
    );
    revalidatePath(`/client/${clientId}/research`);
    if (!guarded.ok) return failure(problem ?? undefined);
    if (guarded.status === "locked") return failure("RUN_IN_PROGRESS");
    return {
      ok: true,
      data: { id: guarded.result.id, outcome: guarded.result.outcome },
    };
  } catch {
    return failure();
  }
}

export async function reviewWebFinding(
  clientId: string,
  input: unknown,
): Promise<Result<Record<string, never>>> {
  const parsed = z
    .object({
      findingId: z.string().uuid(),
      status: z.enum(["approved", "archived"]),
    })
    .strict()
    .safeParse(input);
  if (!parsed.success) return failure("VALIDATION_ERROR");
  const user = await authorize(clientId);
  if (!user) return failure("FORBIDDEN");
  const db = await createClient();
  const { data, error } = await db.rpc("review_research_finding", {
    p_client_id: clientId,
    p_finding_id: parsed.data.findingId,
    p_status: parsed.data.status,
  });
  if (error || !data?.ok) return failure(data?.code);
  await writeAuditLog({
    clientId,
    userId: user.id,
    action: `research_finding_${parsed.data.status}`,
    entityType: "research_finding",
    entityId: parsed.data.findingId,
  });
  revalidatePath(`/client/${clientId}/research`);
  return { ok: true, data: {} };
}

export async function createResearchPosts(
  clientId: string,
  input: unknown,
): Promise<
  Result<{
    items: {
      findingId: string;
      ideaId: string;
      postId: string | null;
      error: string | null;
    }[];
  }>
> {
  const parsed = z
    .object({ findingIds: z.array(z.string().uuid()).min(1).max(3) })
    .strict()
    .safeParse(input);
  if (!parsed.success) return failure("VALIDATION_ERROR");
  const user = await authorize(clientId, "draft");
  if (!user) return failure("FORBIDDEN");
  const db = await createClient();
  const { data, error } = await db.rpc("select_research_findings", {
    p_client_id: clientId,
    p_finding_ids: parsed.data.findingIds,
  });
  if (error || !data?.ok) return failure(data?.code);
  const selected = z
    .array(
      z.object({ findingId: z.string().uuid(), ideaId: z.string().uuid() }),
    )
    .max(3)
    .safeParse(data.items);
  if (!selected.success) return failure();
  const items = [];
  for (const item of selected.data) {
    try {
      const generated = await generatePostFromIdea(clientId, item.ideaId, {});
      items.push({
        ...item,
        postId: generated.ok ? generated.data.postId : null,
        error: generated.ok ? null : generated.message,
      });
    } catch {
      items.push({
        ...item,
        postId: null,
        error:
          "Drafting did not finish. Retry this selection or open its idea.",
      });
    }
  }
  await writeAuditLog({
    clientId,
    userId: user.id,
    action: "research_findings_selected",
    entityType: "client",
    entityId: clientId,
    metadata: {
      selected_count: items.length,
      drafted_count: items.filter((i) => i.postId).length,
    },
  });
  revalidatePath(`/client/${clientId}/research`);
  return { ok: true, data: { items } };
}
