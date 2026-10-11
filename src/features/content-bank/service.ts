import "server-only";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { contentResourceInputSchema } from "@/features/resources/schemas";
import { trendReactionInputSchema } from "@/features/research/trend-cards/schemas";
import {
  canAccessClient, canContributeResearch, canManageClientSetup, canManageFounderExperiences,
  canUserDeleteBusinessRecords,
} from "@/lib/access/client-access";
import { writeAuditLog } from "@/lib/audit/log";
import { createClient } from "@/lib/supabase/server";
import { isMissingTableError } from "@/lib/supabase/schema-errors";
import { getServerUser } from "@/lib/supabase/session";

import {
  createContentBankEntrySchema, updateContentBankEntrySchema,
  type ContentBankEntry, type CreateContentBankEntryInput, type UpdateContentBankEntryInput,
} from "./schemas";
import { getContentBankEntry, getContentBankUsageHistory } from "./queries";

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

const identitySchema = z.object({
  clientId: z.string().uuid(), entryId: z.string().uuid(),
  sourceType: z.enum(["founder_experience", "content_resource"]),
});
const AUTH_REQUIRED = { ok: false as const, code: "AUTH_REQUIRED", message: "You must be signed in to continue." };
const FORBIDDEN = { ok: false as const, code: "FORBIDDEN", message: "You do not have permission to manage this entry." };
const INVALID_INPUT = { ok: false as const, code: "VALIDATION_ERROR", message: "Check the entry details and try again." };
const NOT_FOUND = { ok: false as const, code: "NOT_FOUND", message: "This Content Bank entry is not available." };
const GENERIC_FAILURE = { ok: false as const, code: "SERVER_ERROR", message: "Could not save this entry. Refresh and try again." };

const sharedFields = ["category", "title", "rawNotes", "readiness", "allowReuse"];
const experienceFields = [...sharedFields, "takeaway", "whatHappened", "whatWasLearned", "whatChanged", "whyItMatters"];
const resourceFields = [...sharedFields, "resourceType", "description", "problemSolved", "targetUseCase", "keyword", "deliveryUrl", "deliveryInstructions", "active", "commentGateApproved"];

function acceptsFields(input: object, isResource: boolean, isReaction = false) {
  const allowed = new Set(isResource ? resourceFields : [...experienceFields, ...(isReaction ? ["reactionType"] : [])]);
  return Object.keys(input).every((key) => allowed.has(key));
}

function refreshSources(clientId: string) {
  for (const page of ["content-bank", "resources", "ideas", "research", "calendar", "newsletter"]) {
    revalidatePath(`/client/${clientId}/${page}`);
  }
}

async function loadEntry(
  clientId: string, entryId: string, sourceType: ContentBankEntry["sourceType"], requireManagement = true,
): Promise<ServiceResult<{ userId: string; entry: ContentBankEntry }>> {
  const { user } = await getServerUser();
  if (!user) return AUTH_REQUIRED;
  if (!identitySchema.safeParse({ clientId, entryId, sourceType }).success) return INVALID_INPUT;
  if (!(await canAccessClient(user.id, clientId))) return FORBIDDEN;
  const existing = await getContentBankEntry(clientId, entryId, sourceType);
  if (!existing) return NOT_FOUND;
  const entry = existing.entry;
  if (requireManagement) {
    const allowed = entry.sourceType === "content_resource"
      ? await canManageClientSetup(user.id, clientId)
      : entry.entryType === "trend_reaction"
        ? await canContributeResearch(user.id, clientId)
        : await canManageFounderExperiences(user.id, clientId);
    if (!allowed) return FORBIDDEN;
  }
  return { ok: true, data: { userId: user.id, entry } };
}

export async function createContentBankEntry(
  clientId: string, input: CreateContentBankEntryInput,
): Promise<ServiceResult<{ id: string; sourceType: ContentBankEntry["sourceType"] }>> {
  const { user } = await getServerUser();
  if (!user) return AUTH_REQUIRED;
  if (!z.string().uuid().safeParse(clientId).success) return INVALID_INPUT;
  const parsed = createContentBankEntrySchema.safeParse(input);
  if (!parsed.success) return { ...INVALID_INPUT, message: parsed.error.issues[0]?.message ?? INVALID_INPUT.message };
  const data = parsed.data;
  const isResource = data.category === "lead_magnet";
  if (!acceptsFields(data, isResource)) return INVALID_INPUT;
  const allowed = isResource
    ? await canManageClientSetup(user.id, clientId)
    : await canManageFounderExperiences(user.id, clientId);
  if (!allowed) return FORBIDDEN;

  let row: Record<string, unknown>;
  if (isResource) {
    const resource = contentResourceInputSchema.safeParse({
      title: data.title, resourceType: data.resourceType ?? "guide",
      description: data.description, problemSolved: data.problemSolved,
      targetUseCase: data.targetUseCase, keyword: data.keyword ?? "",
      deliveryUrl: data.deliveryUrl, deliveryInstructions: data.deliveryInstructions,
      active: data.readiness === "archived" ? false : data.active ?? true,
      commentGateApproved: data.commentGateApproved ?? false,
    });
    if (!resource.success) return { ...INVALID_INPUT, message: resource.error.issues[0]?.message ?? INVALID_INPUT.message };
    const value = resource.data;
    row = {
      category: "lead_magnet", created_by_user_id: user.id,
      title: value.title, resource_type: value.resourceType,
      description: value.description || null, problem_solved: value.problemSolved || null,
      target_use_case: value.targetUseCase || null, keyword: value.keyword,
      delivery_url: value.deliveryUrl, delivery_instructions: value.deliveryInstructions || null,
      active: value.active, comment_gate_approved: value.commentGateApproved,
    };
  } else {
    row = {
      category: data.category, entry_type: "work_log", title: data.title,
      what_happened: data.whatHappened || data.rawNotes || data.title,
      what_was_learned: data.whatWasLearned || null,
      what_changed: data.whatChanged || null, why_it_matters: data.whyItMatters || null,
      takeaway: data.takeaway || null,
    };
  }
  const sourceType = isResource ? "content_resource" : "founder_experience";
  const supabase = await createClient();
  const { data: inserted, error } = await supabase
    .from(isResource ? "content_resources" : "founder_experiences")
    .insert({ ...row, client_id: clientId, raw_notes: data.rawNotes || null, readiness: data.readiness, allow_reuse: data.allowReuse })
    .select("id").maybeSingle<{ id: string }>();
  if (error || !inserted) return GENERIC_FAILURE;
  await writeAuditLog({ clientId, userId: user.id, action: "content_bank_entry_created", entityType: sourceType, entityId: inserted.id,
    metadata: { sourceType, category: data.category, entryId: inserted.id } });
  refreshSources(clientId);
  return { ok: true, data: { id: inserted.id, sourceType } };
}

async function saveEntry(
  clientId: string, entryId: string, sourceType: ContentBankEntry["sourceType"],
  input: UpdateContentBankEntryInput, action: string,
): Promise<ServiceResult<{ id: string }>> {
  const parsed = updateContentBankEntrySchema.safeParse(input);
  if (!parsed.success) return { ...INVALID_INPUT, message: parsed.error.issues[0]?.message ?? INVALID_INPUT.message };
  const loaded = await loadEntry(clientId, entryId, sourceType);
  if (!loaded.ok) return loaded;
  const { entry, userId } = loaded.data;
  const { expectedUpdatedAt, ...data } = parsed.data;
  if (expectedUpdatedAt && expectedUpdatedAt !== entry.updatedAt) {
    return { ...GENERIC_FAILURE, message: "This entry changed while you were editing. Refresh and reopen it before saving." };
  }
  const isResource = sourceType === "content_resource";
  if (!acceptsFields(data, isResource, entry.entryType === "trend_reaction")) return INVALID_INPUT;
  if (entry.entryType === "trend_reaction" && ["reactionType", "whatWasLearned", "whatHappened"].some((field) => field in data)) {
    const reaction = trendReactionInputSchema.safeParse({
      reactionType: data.reactionType ?? entry.reactionType,
      take: data.whatWasLearned ?? entry.whatWasLearned,
      proofOrExample: data.whatHappened ?? entry.whatHappened ?? "",
    });
    if (!reaction.success) return { ...INVALID_INPUT, message: reaction.error.issues[0]?.message ?? INVALID_INPUT.message };
  }
  const targetCategory = data.category ?? entry.category;
  if ((targetCategory === "lead_magnet") !== isResource) {
    return { ...INVALID_INPUT, message: "Experiences and resources keep their original record type. Create a separate entry to change types." };
  }

  // Only provided fields are written. Editing delivery or readiness cannot replace raw notes.
  const columns: Record<string, string> = {
    title: "title", category: "category", rawNotes: "raw_notes", takeaway: "takeaway",
    whatHappened: "what_happened", whatWasLearned: "what_was_learned", whatChanged: "what_changed", whyItMatters: "why_it_matters",
    description: "description", problemSolved: "problem_solved", targetUseCase: "target_use_case",
    resourceType: "resource_type", keyword: "keyword", deliveryUrl: "delivery_url", deliveryInstructions: "delivery_instructions",
    active: "active", commentGateApproved: "comment_gate_approved", reactionType: "reaction_type",
    readiness: "readiness", allowReuse: "allow_reuse",
  };
  const updates: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(data)) {
    if (value !== undefined) updates[columns[field]] = value === "" ? null : value;
  }
  // Reuse/archive alone must also work for old resources with incomplete fields.
  const resourceDetailChanged = isResource && Object.keys(data).some((key) =>
    ["title", "resourceType", "description", "problemSolved", "targetUseCase", "keyword", "deliveryUrl", "deliveryInstructions", "active", "commentGateApproved"].includes(key));
  if (resourceDetailChanged) {
    const resource = contentResourceInputSchema.safeParse({
      title: data.title ?? entry.title, resourceType: data.resourceType ?? entry.resourceType,
      description: data.description ?? entry.description, problemSolved: data.problemSolved ?? entry.problemSolved,
      targetUseCase: data.targetUseCase ?? entry.targetUseCase, keyword: data.keyword ?? entry.keyword,
      deliveryUrl: data.deliveryUrl ?? entry.deliveryUrl, deliveryInstructions: data.deliveryInstructions ?? entry.deliveryInstructions,
      active: data.active ?? entry.active, commentGateApproved: data.commentGateApproved ?? entry.commentGateApproved,
    });
    if (!resource.success) return { ...INVALID_INPUT, message: resource.error.issues[0]?.message ?? INVALID_INPUT.message };
    if (data.keyword !== undefined) updates.keyword = resource.data.keyword;
  }
  if (Object.keys(updates).length === 0) return { ok: true, data: { id: entryId } };
  if (isResource && (data.readiness ?? entry.readiness) === "archived") updates.active = false;
  updates.updated_at = new Date().toISOString();
  const supabase = await createClient();
  const { data: saved, error } = await supabase.from(isResource ? "content_resources" : "founder_experiences")
    .update(updates).eq("id", entryId).eq("client_id", clientId).eq("updated_at", entry.updatedAt).is("deleted_at", null)
    .select("id").maybeSingle<{ id: string }>();
  if (error || !saved) return GENERIC_FAILURE;
  await writeAuditLog({ clientId, userId, action, entityType: sourceType, entityId: entryId,
    metadata: { entryId, sourceType, updatedFields: Object.keys(updates).filter((field) => field !== "updated_at") } });
  refreshSources(clientId);
  return { ok: true, data: saved };
}

export async function updateContentBankEntry(clientId: string, entryId: string, sourceType: ContentBankEntry["sourceType"], input: UpdateContentBankEntryInput) {
  return saveEntry(clientId, entryId, sourceType, input, "content_bank_entry_updated");
}

export async function toggleAllowReuse(clientId: string, entryId: string, sourceType: ContentBankEntry["sourceType"], allowReuse: boolean) {
  return saveEntry(clientId, entryId, sourceType, { allowReuse }, "content_bank_reuse_toggled");
}

export async function archiveContentBankEntry(clientId: string, entryId: string, sourceType: ContentBankEntry["sourceType"]) {
  return saveEntry(clientId, entryId, sourceType, { readiness: "archived" }, "content_bank_entry_archived");
}

export async function loadContentBankUsage(clientId: string, entryId: string, sourceType: ContentBankEntry["sourceType"]) {
  const loaded = await loadEntry(clientId, entryId, sourceType, false);
  if (!loaded.ok) return { ok: false as const, error: loaded.message };
  return getContentBankUsageHistory(clientId, entryId, sourceType);
}

/**
 * Permanently deletes one Founder Experience or Trend Reaction. Admin-only, and
 * refused while a Content Idea, an active calendar slot or any other saved record
 * still depends on the entry; archiving is the ordinary way to retire an entry.
 * (This is the former Founder Experiences page delete, moved here unchanged.)
 */
export async function deleteContentBankExperience(
  clientId: string, entryId: string,
): Promise<ServiceResult<void>> {
  const { user } = await getServerUser();
  if (!user) return AUTH_REQUIRED;
  const ids = z.object({ clientId: z.string().uuid(), entryId: z.string().uuid() }).safeParse({ clientId, entryId });
  if (!ids.success) return INVALID_INPUT;

  if (!(await canUserDeleteBusinessRecords(user.id, ids.data.clientId))) {
    return { ok: false, code: "FORBIDDEN", message: "You do not have permission to delete entries for this Client Workspace." };
  }

  const supabase = await createClient();
  const { data: entry, error: fetchError } = await supabase
    .from("founder_experiences")
    .select("id, entry_type")
    .eq("id", ids.data.entryId)
    .eq("client_id", ids.data.clientId)
    .is("deleted_at", null)
    .maybeSingle<{ id: string; entry_type: string | null }>();
  if (fetchError || !entry) return NOT_FOUND;

  const { count: citedCount, error: citeError } = await supabase
    .from("content_ideas")
    .select("id", { count: "exact", head: true })
    .eq("client_id", ids.data.clientId)
    .is("deleted_at", null)
    .contains("source_ids_json", JSON.stringify([ids.data.entryId]));
  if (citeError) {
    return { ok: false, code: "UNKNOWN_ERROR", message: "Could not perform dependency check." };
  }
  if ((citedCount ?? 0) > 0) {
    return { ok: false, code: "DEPENDENCY_CONFLICT", message: "This entry cannot be deleted because a Content Idea depends on it." };
  }

  // A plain GET, not HEAD: a failed HEAD request carries no error body, so the client
  // library would report the failure as success and hide a real dependency check error.
  const { data: plannedSlots, error: planError } = await supabase
    .from("calendar_slots")
    .select("id")
    .eq("client_id", ids.data.clientId)
    .eq("source_id", ids.data.entryId)
    .neq("status", "cancelled")
    .limit(1);
  // Before the calendar migration is applied no slot can exist, so a missing table is
  // not a dependency. Any other error still blocks the delete.
  if (planError && !isMissingTableError(planError)) {
    return { ok: false, code: "UNKNOWN_ERROR", message: "Could not perform dependency check." };
  }
  if ((plannedSlots?.length ?? 0) > 0) {
    return {
      ok: false, code: "DEPENDENCY_CONFLICT",
      message: "This entry cannot be deleted because it is planned in a content calendar. Cancel that slot first.",
    };
  }

  const { data: deleted, error: deleteError } = await supabase
    .from("founder_experiences")
    .delete()
    .eq("id", ids.data.entryId)
    .eq("client_id", ids.data.clientId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle<{ id: string }>();
  if (deleteError || !deleted) {
    if (deleteError?.code === "23503") {
      return { ok: false, code: "DEPENDENCY_CONFLICT", message: "This entry is referenced by saved content or a newsletter edition and cannot be deleted." };
    }
    return { ok: false, code: "UNKNOWN_ERROR", message: "Could not delete this entry. Please try again." };
  }

  await writeAuditLog({
    clientId: ids.data.clientId,
    userId: user.id,
    action: "founder_experience_hard_deleted",
    entityType: "founder_experience",
    entityId: ids.data.entryId,
    metadata: { experience_id: ids.data.entryId, entry_type: entry.entry_type },
  });

  refreshSources(ids.data.clientId);
  revalidatePath(`/client/${ids.data.clientId}/dashboard`);
  return { ok: true, data: undefined };
}
