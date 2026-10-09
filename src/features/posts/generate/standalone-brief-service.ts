import "server-only";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { canManageIdeas, canDraftPosts, canManageFounderExperiences } from "@/lib/access/client-access";
import type { StrategyOverrides } from "@/lib/ai/playbooks/contracts";
import { writeAuditLog } from "@/lib/audit/log";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/session";

import { standaloneBriefSchema, STANDALONE_SOURCE_MAX_BYTES } from "./standalone-brief-schema";

type Result =
  | { ok: true; data: { ideaId: string } }
  | { ok: false; code: string; message: string };
type SavedBrief = { id: string; source_context: unknown; status: string };
type DocumentRow = { id: string; content_hash: string; version: number; content_text: string };

const failure = (code: string, message: string): Result => ({ ok: false, code, message });
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
function requestRecordId(kind: string, clientId: string, userId: string, requestId: string) {
  const value = hash(JSON.stringify(["standalone-brief-v1", kind, clientId, userId, requestId]));
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-4${value.slice(13, 16)}-8${value.slice(17, 20)}-${value.slice(20, 32)}`;
}

const savedRequestSchema = z.object({ standaloneRequestHash: z.string().length(64) });

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
  const resume = (row: SavedBrief): Result => {
    const saved = savedRequestSchema.safeParse(row.source_context);
    return saved.success && saved.data.standaloneRequestHash === requestHash && ["ready", "used"].includes(row.status)
      ? { ok: true, data: { ideaId: row.id } }
      : failure("VALIDATION_ERROR", "This saved brief has changed. Start a new post.");
  };
  const existing = await findBrief();
  if (existing.error) return failure("UNKNOWN_ERROR", "Could not load the saved brief. Please try again.");
  if (existing.data) return resume(existing.data);

  let document: DocumentRow | null = null;
  if (input.source.mode !== "note") {
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

  const overrides: StrategyOverrides = {
    // A note/document is not an explicitly selected, approved gated resource.
    ctaType: "none",
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
  };
  const inserted = await supabase.from("content_ideas").insert({
    id: ideaId, client_id: clientId, source_type: "custom_upload",
    source_ids_json: document ? [document.id] : [], source_context: sourceContext,
    angle: input.topic, founder_direction: input.instructions || null,
    commercial_relevance: input.primaryTakeaway || null, content_pillar: input.contentPillar || null,
    intended_reader: input.intendedReader || null, primary_takeaway: input.primaryTakeaway || null,
    allocation_bucket: "evergreen", post_type: input.postType ?? null,
    funnel_stage: input.funnelStage ?? null, strategy_overrides: overrides, status: "ready",
  }).select("id,source_context,status").maybeSingle<SavedBrief>();
  if (inserted.error || !inserted.data) {
    if (inserted.error?.code === "23505") {
      const retry = await findBrief();
      if (retry.data) return resume(retry.data);
    }
    return failure("UNKNOWN_ERROR", "Could not save the post brief. Please try again.");
  }
  await writeAuditLog({
    clientId, userId: user.id, action: "standalone_brief_created",
    entityType: "content_idea", entityId: ideaId,
    metadata: { source_type: "custom_upload", source_id: document?.id ?? null },
  });
  revalidatePath(`/client/${clientId}/ideas`);
  revalidatePath(`/client/${clientId}/posts`);
  revalidatePath(`/client/${clientId}/settings`);
  return { ok: true, data: { ideaId } };
}
