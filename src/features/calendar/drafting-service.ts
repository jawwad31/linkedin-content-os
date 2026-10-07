import "server-only";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canAccessClient, canDraftPosts, canManageIdeas } from "@/lib/access/client-access";
import { getServerUser } from "@/lib/supabase/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit/log";
import { getOpenRouterConfig } from "@/lib/openrouter/client";
import { getBusinessContext, getApprovedPlanningResources, isCommentGateEligible,
  loadSourceContext, produceReviewedPost, type ContentIdeaRow, type ReviewedPostValues } from "@/features/posts/generate/service";
import { executeDraftStep, type DraftClaim } from "./draft-executor";
import { DRAFT_ERROR_COPY, startDraftBatchSchema, type DraftJobSummary } from "./drafting-contracts";
import type { CalendarServiceResult } from "./service";

type Client = Awaited<ReturnType<typeof createClient>>;
type RpcResult = { ok: boolean; code?: string; job_id?: string; slot_id?: string; idea_id?: string;
  lease_token?: string; post_id?: string; done?: boolean; busy?: boolean };
const fail = (code: string) => ({ ok: false as const, code, message: DRAFT_ERROR_COPY[code] ?? "The batch could not continue. Refresh and try again." });
async function authorize(clientId: string) {
  const { user } = await getServerUser();
  if (!user || !z.string().uuid().safeParse(clientId).success) return null;
  const checks = await Promise.all([canAccessClient(user.id, clientId), canManageIdeas(user.id, clientId), canDraftPosts(user.id, clientId)]);
  return checks.every(Boolean) ? user : null;
}
async function rpc(client: Client, name: string, args: Record<string, unknown>): Promise<RpcResult> {
  const { data, error } = await client.rpc(name, args);
  if (error || !data || typeof data.ok !== "boolean") return { ok: false, code: "GENERATION_FAILED" };
  return data as RpcResult;
}
export function calendarDraftingEnabled() { return process.env.CALENDAR_DRAFTING_ENABLED === "true"; }

export async function isCalendarDraftingAvailable(clientId: string) {
  const client = await createClient();
  const { error } = await client.from("calendar_draft_jobs").select("id").eq("client_id", clientId).limit(1);
  return !error;
}

export async function getLatestDraftJob(clientId: string, calendarId: string, userId: string, jobId?: string): Promise<DraftJobSummary | null> {
  const client = await createClient();
  let query = client.from("calendar_draft_jobs")
    .select("id, status, slot_ids, created_by").eq("client_id", clientId).eq("calendar_id", calendarId);
  if (jobId) query = query.eq("id", jobId);
  const { data: job, error } = await query.order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error || !job) return null;
  const { data: slots, error: slotsError } = await client.from("calendar_slots")
    .select("status, draft_attempts, post_id").eq("client_id", clientId).in("id", job.slot_ids);
  if (slotsError || !slots) return null;
  return { id: job.id, status: job.status, canResume: job.created_by === userId,
    total: slots.length, saved: slots.filter(s => s.post_id).length,
    failed: slots.filter(s => s.status === "failed").length,
    pending: slots.filter(s => s.status === "queued" || s.status === "drafting").length,
    attempts: slots.reduce((sum, s) => sum + s.draft_attempts, 0) };
}

export async function startCalendarDraftBatch(clientId: string, calendarId: string, input: unknown): Promise<CalendarServiceResult<{ jobId: string }>> {
  const user = await authorize(clientId);
  if (!user) return fail("FORBIDDEN");
  if (!calendarDraftingEnabled()) return { ok: false, code: "DISABLED", message: "Calendar drafting is not enabled yet." };
  if (!getOpenRouterConfig("OPENROUTER_CONTENT_MODEL")) return fail("NOT_CONFIGURED");
  const parsed = startDraftBatchSchema.safeParse(input);
  if (!parsed.success || !z.string().uuid().safeParse(calendarId).success) return fail("VALIDATION_ERROR");
  const client = await createClient();
  const result = await rpc(client, "start_calendar_draft_job", {
    p_client_id: clientId, p_calendar_id: calendarId, p_request_key: parsed.data.requestKey,
    p_slots: parsed.data.slots.map(slot => ({ slot_id: slot.slotId, brief: slot.brief })),
  });
  if (!result.ok || !result.job_id) return fail(result.code ?? "GENERATION_FAILED");
  await writeAuditLog({ clientId, userId: user.id, action: "calendar_draft_batch_requested", entityType: "calendar_draft_job", entityId: result.job_id,
    metadata: { slot_count: parsed.data.slots.length } });
  revalidatePath(`/client/${clientId}/calendar`);
  return { ok: true, data: { jobId: result.job_id } };
}

export async function pumpCalendarDraftBatch(clientId: string, jobId: string): Promise<CalendarServiceResult<{ step: string; job: DraftJobSummary | null }>> {
  const user = await authorize(clientId);
  if (!user) return fail("FORBIDDEN");
  if (!calendarDraftingEnabled()) return { ok: false, code: "DISABLED", message: "Calendar drafting is paused in this environment." };
  if (!z.string().uuid().safeParse(jobId).success) return fail("VALIDATION_ERROR");
  const client = await createClient();
  const base = { p_client_id: clientId, p_job_id: jobId };
  const leaseArgs = (claim: DraftClaim) => ({ ...base, p_slot_id: claim.slotId, p_lease_token: claim.leaseToken });
  try {
    const step = await executeDraftStep<ReviewedPostValues>({
      claim: async () => {
        const result = await rpc(client, "claim_calendar_draft_slot", base);
        if (!result.ok) throw new Error("Batch cannot be claimed.");
        if (result.done) return { state: "done" };
        if (result.busy) return { state: "busy" };
        if (!result.slot_id || !result.idea_id || !result.lease_token) throw new Error("Invalid claim.");
        return { state: "claimed", claim: { slotId: result.slot_id, ideaId: result.idea_id, leaseToken: result.lease_token } };
      },
      renew: async claim => (await rpc(client, "renew_calendar_draft_lease", leaseArgs(claim))).ok,
      produce: async (claim, shouldContinue) => {
        const admin = createAdminClient();
        const [context, resources, eligible, ideaResult] = await Promise.all([
          getBusinessContext(admin, clientId), getApprovedPlanningResources(admin, clientId), isCommentGateEligible(admin, clientId),
          client.from("content_ideas").select("*").eq("client_id", clientId).eq("id", claim.ideaId)
            .is("deleted_at", null).in("status", ["ready", "used"]).maybeSingle<ContentIdeaRow>(),
        ]);
        if (!context || ideaResult.error || !ideaResult.data) return { ok: false, code: "SOURCE_UNAVAILABLE" };
        const source = await loadSourceContext(admin, clientId, ideaResult.data);
        if (!source.ok) return { ok: false, code: "SOURCE_UNAVAILABLE" };
        const generated = await produceReviewedPost({ clientId, userId: user.id, businessContext: context,
          idea: ideaResult.data, sourceContext: source.sourceContext, resources, commentGateEligible: eligible, shouldContinue });
        return generated.ok ? generated : { ok: false, code: generated.failure.ok ? "GENERATION_FAILED" :
          generated.failure.code.includes("NOT_CONFIGURED") ? "NOT_CONFIGURED" : "GENERATION_FAILED" };
      },
      finish: async (claim, values) => {
        const result = await rpc(client, "finish_calendar_draft_slot", { ...leaseArgs(claim), p_values: values });
        if (result.ok) await writeAuditLog({ clientId, userId: user.id, action: "calendar_slot_drafted", entityType: "calendar_slot", entityId: claim.slotId,
          metadata: { job_id: jobId, post_id: result.post_id, idea_id: claim.ideaId } });
        else if (result.code !== "LEASE_LOST" && result.code !== "FORBIDDEN") {
          await rpc(client, "fail_calendar_draft_slot", { ...leaseArgs(claim), p_error_code: result.code });
        }
        return result.ok;
      },
      fail: async (claim, code) => (await rpc(client, "fail_calendar_draft_slot", { ...leaseArgs(claim), p_error_code: code })).ok,
    });
    const { data: job } = await client.from("calendar_draft_jobs").select("calendar_id").eq("id", jobId).eq("client_id", clientId).maybeSingle();
    revalidatePath(`/client/${clientId}/calendar`); revalidatePath(`/client/${clientId}/posts`);
    return { ok: true, data: { step, job: job ? await getLatestDraftJob(clientId, job.calendar_id, user.id, jobId) : null } };
  } catch { return fail("GENERATION_FAILED"); }
}

export async function cancelCalendarDraftBatch(clientId: string, jobId: string): Promise<CalendarServiceResult<null>> {
  const user = await authorize(clientId);
  if (!user) return fail("FORBIDDEN");
  if (!z.string().uuid().safeParse(jobId).success) return fail("VALIDATION_ERROR");
  const result = await rpc(await createClient(), "cancel_calendar_draft_job", { p_client_id: clientId, p_job_id: jobId });
  if (!result.ok) return fail(result.code ?? "GENERATION_FAILED");
  await writeAuditLog({ clientId, userId: user.id, action: "calendar_draft_batch_cancelled", entityType: "calendar_draft_job", entityId: jobId, metadata: {} });
  revalidatePath(`/client/${clientId}/calendar`);
  return { ok: true, data: null };
}
