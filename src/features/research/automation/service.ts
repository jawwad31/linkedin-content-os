import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerUser } from "@/lib/supabase/session";
import { canRunResearchAgent } from "@/lib/access/client-access";
import {
  withResearchRunGuard,
  RSS_COLLECT_LOCK_KEY,
} from "../research-runs/run-guard";
import {
  automationEnabled,
  scheduleSchema,
  sourceSchema,
  type AutomationView,
} from "./contracts";
import { sourceUrl } from "./safe-fetch";
import { refreshSource } from "./executor";
const fail = (code = "UNKNOWN_ERROR") => ({
  ok: false as const,
  code,
  message:
    (
      {
        FORBIDDEN: "You do not have permission to manage research automation.",
        VALIDATION_ERROR: "Check the schedule or source URL and try again.",
        REVISION_CHANGED: "The schedule changed. Refresh before saving.",
        SOURCE_LIMIT: "This workspace supports up to four research sources.",
        RUN_IN_PROGRESS: "Research is already running for this workspace.",
        NOT_CONFIGURED: "Research automation is not available yet.",
      } as Record<string, string>
    )[code] ?? "Could not complete this action. Refresh and try again.",
});

export async function getAutomationView(
  clientId: string,
  canManage: boolean,
): Promise<AutomationView | null> {
  if (!automationEnabled()) return null;
  const db = await createClient();
  const notifications = await db
    .from("research_notifications")
    .select("id,briefing_id,kind,created_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (notifications.error) throw new Error("AUTOMATION_SCHEMA_UNAVAILABLE");
  const view: AutomationView = {
    canManage,
    schedule: {
      version: 0,
      enabled: false,
      timezone: "Asia/Karachi",
      local_time: "09:00",
      weekday: null,
      next_due_at: null,
      last_due_at: null,
    },
    sources: [],
    versions: [],
    notifications: notifications.data ?? [],
  };
  if (!canManage) return view;
  const [schedule, sources, versions] = await Promise.all([
    db
      .from("research_schedules")
      .select("version,enabled,timezone,local_time,weekday,next_due_at,last_due_at")
      .eq("client_id", clientId)
      .maybeSingle(),
    db
      .from("research_sources")
      .select("id,url,kind,enabled,checked_at,error_code")
      .eq("client_id", clientId)
      .is("deleted_at", null)
      .order("created_at")
      .limit(4),
    db
      .from("research_source_versions")
      .select(
        "id,source_id,url,title,content,change_kind,fetched_at,content_hash",
      )
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  if (schedule.error || sources.error || versions.error)
    throw new Error("AUTOMATION_SCHEMA_UNAVAILABLE");
  return {
    ...view,
    schedule: schedule.data ?? view.schedule,
    sources: sources.data ?? [],
    versions: versions.data ?? [],
  };
}
export async function manageAutomation(
  clientId: string,
  action: string,
  input: unknown,
) {
  if (!automationEnabled()) return fail("NOT_CONFIGURED");
  const { user } = await getServerUser();
  if (
    !user ||
    !z.string().uuid().safeParse(clientId).success ||
    !(await canRunResearchAgent(user.id, clientId))
  )
    return fail("FORBIDDEN");
  const db = await createClient();
  if (action === "schedule") {
    const parsed = scheduleSchema.safeParse(input);
    if (!parsed.success) return fail("VALIDATION_ERROR");
    const p = parsed.data;
    const { data, error } = await db.rpc("save_research_schedule", {
      p_client_id: clientId,
      p_version: p.version,
      p_enabled: p.enabled,
      p_timezone: p.timezone,
      p_time: p.time,
      p_weekday: p.weekday ?? null,
    });
    return error || !data?.ok ? fail(data?.code) : { ok: true as const, data };
  }
  if (action !== "source") return fail("VALIDATION_ERROR");
  const parsed = sourceSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR");
  let url: string;
  try {
    url = sourceUrl(parsed.data.url).href;
  } catch {
    return fail("VALIDATION_ERROR");
  }
  const { data, error } = await db.rpc("manage_research_source", {
    p_client_id: clientId,
    p_url: url,
    p_kind: parsed.data.kind,
    p_source_id: parsed.data.sourceId ?? null,
    p_enabled: parsed.data.enabled ?? true,
    p_archived: parsed.data.archived ?? false,
  });
  if (error || !data?.ok) return fail(data?.code);
  if (parsed.data.sourceId) return { ok: true as const, data };
  const guarded = await withResearchRunGuard(
    clientId,
    RSS_COLLECT_LOCK_KEY,
    "manual",
    async (runId) => {
      return refreshSource(
        createAdminClient(),
        clientId,
        { id: data.id, url, kind: parsed.data.kind },
        user.id,
        undefined,
        runId,
      );
    },
    (r) => ({
      sourcesProcessed: 1,
      totalFetched: 1,
      totalNew: r.changed,
      skippedDuplicate: 0,
      skippedInvalid: 0,
      skippedError: r.error ? 1 : 0,
      errorCount: r.error ? 1 : 0,
    }),
    user.id,
    "source_import",
    (r) => !!r.error,
  );
  if (!guarded.ok) return fail();
  if (guarded.status === "locked") return fail("RUN_IN_PROGRESS");
  return { ok: true as const, data: { ...data, ...guarded.result } };
}
