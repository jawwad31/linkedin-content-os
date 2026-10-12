import "server-only";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { canManageIdeas, canDraftPosts, canManageFounderExperiences } from "@/lib/access/client-access";
import {
  linkSourceReservationToIdea,
  releaseSourceReservation,
  reserveSourceEntry,
} from "@/features/content-bank/usage-service";
import type { StrategyOverrides } from "@/lib/ai/playbooks/contracts";
import { writeAuditLog } from "@/lib/audit/log";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/session";

import {
  directContentBankContextSchema,
  standaloneBriefSchema,
  STANDALONE_SOURCE_MAX_BYTES,
  type StandaloneBriefInput,
} from "./standalone-brief-schema";

type Result =
  | { ok: true; data: { ideaId: string } }
  | { ok: false; code: string; message: string };
type SavedBrief = { id: string; source_context: unknown; status: string };
type DocumentRow = { id: string; content_hash: string; version: number; content_text: string };
type DirectContentBankSource = {
  sourceId: string;
  sourceType: "founder_experience" | "content_resource";
  ideaSourceType: "founder_experience" | "trend_reaction" | "content_resource";
  sourceIds: string[];
  resourceOffer: boolean;
};

const failure = (code: string, message: string): Result => ({ ok: false, code, message });
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
function requestRecordId(kind: string, clientId: string, userId: string, requestId: string) {
  const value = hash(JSON.stringify(["standalone-brief-v1", kind, clientId, userId, requestId]));
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-4${value.slice(13, 16)}-8${value.slice(17, 20)}-${value.slice(20, 32)}`;
}

const savedRequestSchema = z.object({ standaloneRequestHash: z.string().length(64) });

async function resolveContentBankSource(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clientId: string,
  source: Extract<StandaloneBriefInput["source"], { mode: "content_bank" }>,
  postType: StandaloneBriefInput["postType"],
): Promise<
  | { ok: true; source: DirectContentBankSource }
  | { ok: false; result: Result }
> {
  const resourceOffer = postType === "lead_magnet_offer";
  if (source.sourceType === "content_resource") {
    const { data, error } = await supabase.from("content_resources")
      .select("id,readiness,active,comment_gate_approved,keyword,delivery_url,delivery_instructions")
      .eq("id", source.sourceId).eq("client_id", clientId)
      .is("deleted_at", null).maybeSingle<{
        id: string;
        readiness: string;
        active: boolean;
        comment_gate_approved: boolean;
        keyword: string | null;
        delivery_url: string | null;
        delivery_instructions: string | null;
      }>();
    if (error || !data) {
      return { ok: false, result: failure("NOT_FOUND", "This Content Bank resource is no longer available in this workspace.") };
    }
    if (data.readiness !== "ready" || !data.active) {
      return { ok: false, result: failure("SOURCE_UNAVAILABLE", "This Content Bank resource is no longer ready and active. Return to Content Bank and choose another source.") };
    }
    if (resourceOffer && (!data.comment_gate_approved || !data.keyword || !(data.delivery_url || data.delivery_instructions))) {
      return { ok: false, result: failure("SOURCE_UNAVAILABLE", "This resource is not approved for a comment-gated offer. Use it for an educational post or update its approval and delivery details.") };
    }
    if (resourceOffer) {
      const recent = await supabase.from("posts").select("source_context_used")
        .eq("client_id", clientId).is("deleted_at", null)
        .neq("status", "rejected").order("created_at", { ascending: false })
        .limit(5).returns<Array<{ source_context_used: unknown }>>();
      if (recent.error || !recent.data) {
        return { ok: false, result: failure("UNKNOWN_ERROR", "Could not verify comment-gate eligibility. Please try again.") };
      }
      const recentCommentGate = recent.data.some(({ source_context_used: value }) =>
        Boolean(value && typeof value === "object" && !Array.isArray(value) &&
          (value as Record<string, unknown>).cta_type === "comment_gate"));
      if (recentCommentGate) {
        return { ok: false, result: failure("SOURCE_UNAVAILABLE", "A recent active post already used a comment-gated resource. Choose another post type for this source.") };
      }
    }
    return { ok: true, source: {
      sourceId: data.id,
      sourceType: "content_resource",
      ideaSourceType: "content_resource",
      sourceIds: [data.id],
      resourceOffer,
    } };
  }

  if (resourceOffer) {
    return { ok: false, result: failure("VALIDATION_ERROR", "Resource offers require an approved Content Resource.") };
  }
  const { data, error } = await supabase.from("founder_experiences")
    .select("id,readiness,entry_type,source_trend_card_id")
    .eq("id", source.sourceId).eq("client_id", clientId)
    .is("deleted_at", null).maybeSingle<{
      id: string;
      readiness: string;
      entry_type: "work_log" | "trend_reaction";
      source_trend_card_id: string | null;
    }>();
  if (error || !data) {
    return { ok: false, result: failure("NOT_FOUND", "This Founder Experience is no longer available in this workspace.") };
  }
  if (data.readiness !== "ready") {
    return { ok: false, result: failure("SOURCE_UNAVAILABLE", "This Founder Experience is no longer ready. Return to Content Bank and choose another source.") };
  }
  if (data.entry_type === "trend_reaction") {
    if (!data.source_trend_card_id) {
      // Saved from a research finding: the finding is its research source. It
      // only has to still exist for this workspace and not be archived.
      const finding = await supabase.from("founder_experiences")
        .select("source_research_finding_id").eq("id", data.id).eq("client_id", clientId)
        .maybeSingle<{ source_research_finding_id: string | null }>();
      const findingId = finding.data?.source_research_finding_id;
      if (finding.error || !findingId) {
        return { ok: false, result: failure("SOURCE_UNAVAILABLE", "This trend reaction no longer has its research source.") };
      }
      const research = await supabase.from("research_findings").select("id")
        .eq("id", findingId).eq("client_id", clientId).neq("approval_status", "archived")
        .maybeSingle<{ id: string }>();
      if (research.error || !research.data) {
        return { ok: false, result: failure("SOURCE_UNAVAILABLE", "The research finding for this trend reaction is no longer available.") };
      }
      return { ok: true, source: {
        sourceId: data.id,
        sourceType: "founder_experience",
        ideaSourceType: "trend_reaction",
        sourceIds: [data.id],
        resourceOffer: false,
      } };
    }
    const linked = await supabase.from("trend_cards").select("id")
      .eq("id", data.source_trend_card_id).eq("client_id", clientId)
      .eq("approved_for_ideas", true).is("deleted_at", null)
      .maybeSingle<{ id: string }>();
    if (linked.error || !linked.data) {
      return { ok: false, result: failure("SOURCE_UNAVAILABLE", "The research source for this trend reaction is no longer approved for drafting.") };
    }
    return { ok: true, source: {
      sourceId: data.id,
      sourceType: "founder_experience",
      ideaSourceType: "trend_reaction",
      sourceIds: [data.id, linked.data.id],
      resourceOffer: false,
    } };
  }
  if (data.entry_type !== "work_log" || data.source_trend_card_id) {
    return { ok: false, result: failure("SOURCE_UNAVAILABLE", "This Founder Experience is not eligible for direct drafting.") };
  }
  return { ok: true, source: {
    sourceId: data.id,
    sourceType: "founder_experience",
    ideaSourceType: "founder_experience",
    sourceIds: [data.id],
    resourceOffer: false,
  } };
}

/** Save one protected brief; the normal idea-to-post endpoint owns paid generation. */
export async function prepareStandaloneBrief(clientId: string, rawInput: unknown): Promise<Result> {
  const { user } = await getServerUser();
  if (!user) return failure("AUTH_REQUIRED", "You must be signed in to continue.");
  const parsed = standaloneBriefSchema.safeParse(rawInput);
  if (!z.string().uuid().safeParse(clientId).success || !parsed.success) {
    return failure("VALIDATION_ERROR", "Check the source and post brief.");
  }
  const input = parsed.data;
  const [canPlan, canDraft] = await Promise.all([
    canManageIdeas(user.id, clientId), canDraftPosts(user.id, clientId),
  ]);
  if (!canPlan || !canDraft) return failure("FORBIDDEN", "You need permission to create ideas and draft posts.");

  const supabase = await createClient();
  const ideaId = requestRecordId("idea", clientId, user.id, input.requestId);
  const requestHash = hash(JSON.stringify(input));
  const findBrief = () => supabase.from("content_ideas").select("id,source_context,status")
    .eq("client_id", clientId).eq("id", ideaId).is("deleted_at", null).maybeSingle<SavedBrief>();
  const resume = async (row: SavedBrief): Promise<Result> => {
    const saved = savedRequestSchema.safeParse(row.source_context);
    if (!saved.success || saved.data.standaloneRequestHash !== requestHash || !["ready", "used"].includes(row.status)) {
      return failure("VALIDATION_ERROR", "This saved brief has changed. Start a new post.");
    }
    const direct = directContentBankContextSchema.safeParse(row.source_context);
    if (direct.success && row.status === "ready") {
      const linked = await linkSourceReservationToIdea({
        clientId,
        usageId: direct.data.contentBankUsageId,
        sourceId: direct.data.contentBankSource.sourceId,
        sourceType: direct.data.contentBankSource.sourceType,
        contentIdeaId: row.id,
      }, supabase);
      if (!linked.ok) {
        return failure("SOURCE_UNAVAILABLE", "This saved assignment no longer owns its Content Bank reservation. Start again from Content Bank.");
      }
    }
    return { ok: true, data: { ideaId: row.id } };
  };
  const existing = await findBrief();
  if (existing.error) return failure("UNKNOWN_ERROR", "Could not load the saved brief. Please try again.");
  if (existing.data) return resume(existing.data);

  let document: DocumentRow | null = null;
  if (input.source.mode === "document" || input.source.mode === "upload") {
    const source = input.source;
    const documentId = source.mode === "upload"
      ? requestRecordId("document", clientId, user.id, input.requestId) : source.documentId;
    const findDocument = () => supabase.from("client_documents")
      .select("id,content_hash,version,content_text")
      .eq("id", documentId).eq("client_id", clientId)
      .eq("purpose", "source_material").eq("status", "ready").is("deleted_at", null)
      .maybeSingle<DocumentRow>();

    if (source.mode === "upload") {
      if (!(await canManageFounderExperiences(user.id, clientId))) {
        return failure("FORBIDDEN", "You do not have permission to upload source documents.");
      }
      const byteLength = Buffer.byteLength(source.contentText, "utf8");
      if (byteLength > STANDALONE_SOURCE_MAX_BYTES) {
        return failure("VALIDATION_ERROR", "Standalone source files must be 128 KB or smaller.");
      }
      const contentHash = hash(source.contentText);
      // A new file preserves older files even when their filenames match. A
      // retried request uses the same ID; it never archives or replaces a file.
      const saved = await supabase.from("client_documents").insert({
        id: documentId, client_id: clientId, filename: source.filename,
        content_text: source.contentText, content_hash: contentHash,
        file_size_bytes: byteLength, mime_type: source.filename.endsWith(".md") ? "text/markdown" : "text/plain",
        purpose: "source_material", status: "ready", version: 1,
      }).select("id,content_hash,version,content_text").maybeSingle<DocumentRow>();
      if (saved.error && saved.error.code !== "23505") {
        return failure("UNKNOWN_ERROR", "Could not save the source file. Please try again.");
      }
      document = saved.data ?? (await findDocument()).data;
      if (!document || document.content_hash !== contentHash) {
        return failure("NOT_FOUND", "This source file is no longer available. Start a new post.");
      }
      if (saved.data) await writeAuditLog({
        clientId, userId: user.id, action: "client_document_uploaded",
        entityType: "client_document", entityId: documentId,
        metadata: { purpose: "source_material", version: 1, fileSizeBytes: byteLength },
      });
    } else {
      document = (await findDocument()).data;
    }
    if (!document) return failure("NOT_FOUND", "Choose a ready source document from this workspace.");
    if (Buffer.byteLength(document.content_text, "utf8") > STANDALONE_SOURCE_MAX_BYTES) {
      return failure("VALIDATION_ERROR", "This document exceeds the 128 KB standalone draft limit. Supply a smaller source file or a relevant note; the original will remain unchanged.");
    }
    if (!document.content_text.trim() || document.content_text.includes("\0") || hash(document.content_text) !== document.content_hash) {
      return failure("VALIDATION_ERROR", "Choose a nonempty text source.");
    }
  }

  if (input.postType === "lead_magnet_offer" && input.source.mode !== "content_bank") {
    return failure("VALIDATION_ERROR", "Resource offers require an approved Content Resource selected from Content Bank.");
  }

  let directSource: DirectContentBankSource | null = null;
  let reservationId: string | null = null;
  if (input.source.mode === "content_bank") {
    const resolved = await resolveContentBankSource(
      supabase,
      clientId,
      input.source,
      input.postType,
    );
    if (!resolved.ok) return resolved.result;
    directSource = resolved.source;
    const reservation = await reserveSourceEntry({
      clientId,
      sourceId: directSource.sourceId,
      sourceType: directSource.sourceType,
      channel: "linkedin_post",
      angle: input.topic,
      takeaway: input.primaryTakeaway || null,
      requireAtomic: true,
    }, supabase);
    if (!reservation.ok) return failure(reservation.code, reservation.error);
    reservationId = reservation.usageId;
  }

  const overrides: StrategyOverrides = {
    ctaType: directSource?.resourceOffer ? "comment_gate" : "none",
    ...(directSource?.resourceOffer ? { resourceId: directSource.sourceId } : {}),
    ...(input.postType ? { postType: input.postType } : {}),
    ...(input.funnelStage ? { funnelStage: input.funnelStage } : {}),
    ...(input.intendedReader ? { intendedReader: input.intendedReader } : {}),
    ...(input.primaryTakeaway ? { primaryTakeaway: input.primaryTakeaway } : {}),
    ...(input.contentPillar ? { contentPillar: input.contentPillar } : {}),
  };
  const sourceContext = {
    customNotes: input.source.mode === "note" ? input.source.notes : "",
    standaloneRequestHash: requestHash,
    ...(document ? { selectedDocument: {
      id: document.id, contentHash: document.content_hash, version: document.version,
    } } : {}),
    ...(directSource && reservationId ? {
      contentBankDirectCreate: true as const,
      contentBankUsageId: reservationId,
      contentBankSource: directSource,
    } : {}),
  };
  const inserted = await supabase.from("content_ideas").insert({
    id: ideaId, client_id: clientId, source_type: directSource?.ideaSourceType ?? "custom_upload",
    source_ids_json: directSource?.sourceIds ?? (document ? [document.id] : []), source_context: sourceContext,
    angle: input.topic, founder_direction: input.instructions || null,
    commercial_relevance: input.primaryTakeaway || null, content_pillar: input.contentPillar || null,
    intended_reader: input.intendedReader || null, primary_takeaway: input.primaryTakeaway || null,
    allocation_bucket: directSource?.sourceType === "content_resource"
      ? "asset"
      : directSource
        ? "experience"
        : "evergreen",
    post_type: input.postType ?? null,
    funnel_stage: input.funnelStage ?? null, strategy_overrides: overrides, status: "ready",
    selected_resource_id: directSource?.resourceOffer ? directSource.sourceId : null,
  }).select("id,source_context,status").maybeSingle<SavedBrief>();
  if (inserted.error || !inserted.data) {
    if (reservationId) {
      await releaseSourceReservation({ clientId, usageId: reservationId }, supabase);
    }
    if (inserted.error?.code === "23505") {
      const retry = await findBrief();
      if (retry.data) return resume(retry.data);
    }
    return failure("UNKNOWN_ERROR", "Could not save the post brief. Please try again.");
  }
  if (directSource && reservationId) {
    const linked = await linkSourceReservationToIdea({
      clientId,
      usageId: reservationId,
      sourceId: directSource.sourceId,
      sourceType: directSource.sourceType,
      contentIdeaId: inserted.data.id,
    }, supabase);
    if (!linked.ok) {
      return failure("UNKNOWN_ERROR", "The post brief was saved, but its source reservation could not be confirmed. Retry this same brief.");
    }
  }
  await writeAuditLog({
    clientId, userId: user.id, action: "standalone_brief_created",
    entityType: "content_idea", entityId: ideaId,
    metadata: {
      source_type: directSource?.ideaSourceType ?? "custom_upload",
      source_id: directSource?.sourceId ?? document?.id ?? null,
    },
  });
  revalidatePath(`/client/${clientId}/ideas`);
  revalidatePath(`/client/${clientId}/posts`);
  revalidatePath(`/client/${clientId}/settings`);
  if (directSource) revalidatePath(`/client/${clientId}/content-bank`);
  return { ok: true, data: { ideaId } };
}
