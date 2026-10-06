import "server-only";

import { revalidatePath } from "next/cache";

import {
  canManageClientSetup,
  canManageFounderExperiences,
} from "@/lib/access/client-access";
import { writeAuditLog } from "@/lib/audit/log";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/session";

import {
  createContentBankEntrySchema,
  type CreateContentBankEntryInput,
} from "./schemas";
import { getContentBankEntry } from "./queries";

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

const AUTH_REQUIRED = {
  ok: false as const,
  code: "AUTH_REQUIRED",
  message: "You must be signed in to continue.",
};

const FORBIDDEN = {
  ok: false as const,
  code: "FORBIDDEN",
  message: "You do not have permission to perform this action.",
};

const ADMIN_REQUIRED_FOR_LEAD_MAGNET = {
  ok: false as const,
  code: "ADMIN_REQUIRED",
  message: "Only Client and Agency Admins can manage Lead Magnets and Resources.",
};

const NOT_FOUND = {
  ok: false as const,
  code: "NOT_FOUND",
  message: "Content bank entry was not found.",
};

const GENERIC_FAILURE = {
  ok: false as const,
  code: "SERVER_ERROR",
  message: "Could not save content bank entry. Please try again.",
};

export async function createContentBankEntry(
  clientId: string,
  input: CreateContentBankEntryInput,
): Promise<ServiceResult<{ id: string; sourceType: "founder_experience" | "content_resource" }>> {
  const { user } = await getServerUser();
  if (!user) return AUTH_REQUIRED;

  const parsed = createContentBankEntrySchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: parsed.error.issues[0]?.message ?? "Invalid content bank entry.",
    };
  }

  const data = parsed.data;
  const isLeadMagnet = data.category === "lead_magnet";

  // Enforce role gates
  if (isLeadMagnet) {
    const isAdmin = await canManageClientSetup(user.id, clientId);
    if (!isAdmin) return ADMIN_REQUIRED_FOR_LEAD_MAGNET;
  } else {
    const canManage = await canManageFounderExperiences(user.id, clientId);
    if (!canManage) return FORBIDDEN;
  }

  const supabase = await createClient();

  if (isLeadMagnet) {
    // Insert into content_resources
    const { data: inserted, error } = await supabase
      .from("content_resources")
      .insert({
        client_id: clientId,
        category: "lead_magnet",
        title: data.title,
        resource_type: data.resourceType ?? "guide",
        description: data.rawNotes ?? null,
        problem_solved: data.takeaway ?? null,
        target_use_case: data.whatHappened ?? null,
        keyword: data.keyword ?? "",
        delivery_url: data.deliveryUrl || null,
        delivery_instructions: data.deliveryInstructions || null,
        comment_gate_approved: data.commentGateApproved ?? false,
        active: data.readiness !== "archived",
        readiness: data.readiness ?? "ready",
        allow_reuse: data.allowReuse ?? false,
        raw_notes: data.rawNotes ?? null,
      })
      .select("id")
      .single<{ id: string }>();

    if (error || !inserted) {
      return GENERIC_FAILURE;
    }

    await writeAuditLog({
      clientId,
      userId: user.id,
      action: "content_bank_entry_created",
      metadata: {
        sourceType: "content_resource",
        category: "lead_magnet",
        entryId: inserted.id,
      },
    });

    revalidatePath(`/client/${clientId}/content-bank`);
    revalidatePath(`/client/${clientId}/resources`);

    return { ok: true, data: { id: inserted.id, sourceType: "content_resource" } };
  } else {
    // Insert into founder_experiences
    const { data: inserted, error } = await supabase
      .from("founder_experiences")
      .insert({
        client_id: clientId,
        category: data.category,
        title: data.title,
        what_happened: data.whatHappened ?? data.title,
        what_was_learned: data.whatWasLearned ?? null,
        what_changed: data.whatChanged ?? null,
        why_it_matters: data.whyItMatters ?? null,
        raw_notes: data.rawNotes ?? null,
        takeaway: data.takeaway ?? null,
        readiness: data.readiness ?? "ready",
        allow_reuse: data.allowReuse ?? false,
      })
      .select("id")
      .single<{ id: string }>();

    if (error || !inserted) {
      return GENERIC_FAILURE;
    }

    await writeAuditLog({
      clientId,
      userId: user.id,
      action: "content_bank_entry_created",
      metadata: {
        sourceType: "founder_experience",
        category: data.category,
        entryId: inserted.id,
      },
    });

    revalidatePath(`/client/${clientId}/content-bank`);
    revalidatePath(`/client/${clientId}/founder-experiences`);

    return { ok: true, data: { id: inserted.id, sourceType: "founder_experience" } };
  }
}

export async function updateContentBankEntry(
  clientId: string,
  entryId: string,
  sourceType: "founder_experience" | "content_resource",
  input: Partial<CreateContentBankEntryInput>,
): Promise<ServiceResult<{ id: string }>> {
  const { user } = await getServerUser();
  if (!user) return AUTH_REQUIRED;

  // Retrieve current entry
  const existing = await getContentBankEntry(clientId, entryId, sourceType);
  if (!existing) return NOT_FOUND;

  const currentEntry = existing.entry;
  const targetCategory = input.category ?? currentEntry.category;

  // Permission checks:
  // If either current or target is lead_magnet, require admin
  const involvesLeadMagnet =
    currentEntry.category === "lead_magnet" || targetCategory === "lead_magnet";

  if (involvesLeadMagnet) {
    const isAdmin = await canManageClientSetup(user.id, clientId);
    if (!isAdmin) return ADMIN_REQUIRED_FOR_LEAD_MAGNET;
  } else {
    const canManage = await canManageFounderExperiences(user.id, clientId);
    if (!canManage) return FORBIDDEN;
  }

  const supabase = await createClient();

  if (sourceType === "content_resource") {
    const { error } = await supabase
      .from("content_resources")
      .update({
        title: input.title ?? currentEntry.title,
        description: input.rawNotes !== undefined ? input.rawNotes : currentEntry.rawNotes,
        problem_solved: input.takeaway !== undefined ? input.takeaway : currentEntry.takeaway,
        target_use_case: input.whatHappened !== undefined ? input.whatHappened : currentEntry.whatHappened,
        resource_type: input.resourceType ?? currentEntry.resourceType ?? "guide",
        keyword: input.keyword !== undefined ? input.keyword : currentEntry.keyword,
        delivery_url: input.deliveryUrl !== undefined ? input.deliveryUrl || null : currentEntry.deliveryUrl,
        delivery_instructions: input.deliveryInstructions !== undefined ? input.deliveryInstructions : currentEntry.deliveryInstructions,
        comment_gate_approved: input.commentGateApproved !== undefined ? input.commentGateApproved : currentEntry.commentGateApproved,
        readiness: input.readiness ?? currentEntry.readiness,
        active: (input.readiness ?? currentEntry.readiness) !== "archived",
        allow_reuse: input.allowReuse !== undefined ? input.allowReuse : currentEntry.allowReuse,
        raw_notes: input.rawNotes !== undefined ? input.rawNotes : currentEntry.rawNotes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", entryId)
      .eq("client_id", clientId);

    if (error) return GENERIC_FAILURE;
  } else {
    const { error } = await supabase
      .from("founder_experiences")
      .update({
        title: input.title ?? currentEntry.title,
        category: targetCategory,
        what_happened: input.whatHappened !== undefined ? input.whatHappened : currentEntry.whatHappened,
        what_was_learned: input.whatWasLearned !== undefined ? input.whatWasLearned : currentEntry.whatWasLearned,
        what_changed: input.whatChanged !== undefined ? input.whatChanged : currentEntry.whatChanged,
        why_it_matters: input.whyItMatters !== undefined ? input.whyItMatters : currentEntry.whyItMatters,
        takeaway: input.takeaway !== undefined ? input.takeaway : currentEntry.takeaway,
        raw_notes: input.rawNotes !== undefined ? input.rawNotes : currentEntry.rawNotes,
        readiness: input.readiness ?? currentEntry.readiness,
        allow_reuse: input.allowReuse !== undefined ? input.allowReuse : currentEntry.allowReuse,
        updated_at: new Date().toISOString(),
      })
      .eq("id", entryId)
      .eq("client_id", clientId);

    if (error) return GENERIC_FAILURE;
  }

  await writeAuditLog({
    clientId,
    userId: user.id,
    action: "content_bank_entry_updated",
    metadata: {
      entryId,
      sourceType,
      updatedFields: Object.keys(input),
    },
  });

  revalidatePath(`/client/${clientId}/content-bank`);
  revalidatePath(`/client/${clientId}/founder-experiences`);
  revalidatePath(`/client/${clientId}/resources`);

  return { ok: true, data: { id: entryId } };
}

export async function toggleAllowReuse(
  clientId: string,
  entryId: string,
  sourceType: "founder_experience" | "content_resource",
  allowReuse: boolean,
): Promise<ServiceResult<{ allowReuse: boolean }>> {
  const { user } = await getServerUser();
  if (!user) return AUTH_REQUIRED;

  if (sourceType === "content_resource") {
    const isAdmin = await canManageClientSetup(user.id, clientId);
    if (!isAdmin) return ADMIN_REQUIRED_FOR_LEAD_MAGNET;
  } else {
    const canManage = await canManageFounderExperiences(user.id, clientId);
    if (!canManage) return FORBIDDEN;
  }

  const supabase = await createClient();
  const table =
    sourceType === "content_resource"
      ? "content_resources"
      : "founder_experiences";

  const { error } = await supabase
    .from(table)
    .update({
      allow_reuse: allowReuse,
      updated_at: new Date().toISOString(),
    })
    .eq("id", entryId)
    .eq("client_id", clientId);

  if (error) return GENERIC_FAILURE;

  await writeAuditLog({
    clientId,
    userId: user.id,
    action: "content_bank_reuse_toggled",
    metadata: {
      entryId,
      sourceType,
      allowReuse,
    },
  });

  revalidatePath(`/client/${clientId}/content-bank`);

  return { ok: true, data: { allowReuse } };
}

export async function archiveContentBankEntry(
  clientId: string,
  entryId: string,
  sourceType: "founder_experience" | "content_resource",
): Promise<ServiceResult<{ id: string }>> {
  const { user } = await getServerUser();
  if (!user) return AUTH_REQUIRED;

  if (sourceType === "content_resource") {
    const isAdmin = await canManageClientSetup(user.id, clientId);
    if (!isAdmin) return ADMIN_REQUIRED_FOR_LEAD_MAGNET;
  } else {
    const canManage = await canManageFounderExperiences(user.id, clientId);
    if (!canManage) return FORBIDDEN;
  }

  const supabase = await createClient();
  const table =
    sourceType === "content_resource"
      ? "content_resources"
      : "founder_experiences";

  const updates: Record<string, unknown> = {
    readiness: "archived",
    updated_at: new Date().toISOString(),
  };

  if (sourceType === "content_resource") {
    updates.active = false;
  }

  const { error } = await supabase
    .from(table)
    .update(updates)
    .eq("id", entryId)
    .eq("client_id", clientId);

  if (error) return GENERIC_FAILURE;

  await writeAuditLog({
    clientId,
    userId: user.id,
    action: "content_bank_entry_archived",
    metadata: {
      entryId,
      sourceType,
    },
  });

  revalidatePath(`/client/${clientId}/content-bank`);

  return { ok: true, data: { id: entryId } };
}
