"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { canMutateClientWorkflow } from "@/lib/access/client-access";
import { writeAuditLog } from "@/lib/audit/log";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/session";

import {
  FOUNDER_EXPERIENCE_COLUMNS,
  founderExperienceFormSchema,
  toFounderExperienceRow,
} from "./schemas";

export type FounderExperienceFormState = {
  error: string | null;
  success: string | null;
};

export type ArchiveFounderExperienceState = {
  error: string | null;
};

const SAVE_ERROR_COPY =
  "Could not save this founder experience. Check the fields and try again.";
const ARCHIVE_ERROR_COPY =
  "Could not archive this founder experience. Try again.";
const ACCESS_ERROR_COPY =
  "You do not have permission to update workflow content for this Client Workspace.";

const uuidSchema = z.string().uuid();

type FounderExperienceColumnValues = Record<string, unknown>;

/**
 * Explicit application-level role gate — the primary check, not RLS.
 * RLS's workflow-contributor founder_experiences policies are the backstop.
 */
async function verifyWorkflowContributor(
  clientId: string,
): Promise<{ ok: true; userId: string } | { ok: false }> {
  const { user } = await getServerUser();
  if (!user) return { ok: false };

  const canMutate = await canMutateClientWorkflow(user.id, clientId);
  if (!canMutate) return { ok: false };

  return { ok: true, userId: user.id };
}

function parseFounderExperienceForm(formData: FormData) {
  return founderExperienceFormSchema.safeParse({
    title: formData.get("title"),
    whatHappened: formData.get("whatHappened"),
    whatWasLearned: formData.get("whatWasLearned"),
    whatChanged: formData.get("whatChanged"),
    whyItMatters: formData.get("whyItMatters"),
  });
}

export async function createFounderExperienceAction(
  clientId: string,
  _prevState: FounderExperienceFormState,
  formData: FormData,
): Promise<FounderExperienceFormState> {
  const clientIdResult = uuidSchema.safeParse(clientId);
  if (!clientIdResult.success) {
    return { error: SAVE_ERROR_COPY, success: null };
  }

  const parsed = parseFounderExperienceForm(formData);
  if (!parsed.success) {
    return { error: SAVE_ERROR_COPY, success: null };
  }

  const auth = await verifyWorkflowContributor(clientIdResult.data);
  if (!auth.ok) {
    return { error: ACCESS_ERROR_COPY, success: null };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("founder_experiences")
    .insert({
      client_id: clientIdResult.data,
      ...toFounderExperienceRow(parsed.data),
    })
    .select("id")
    .single();

  if (error || !data) {
    return { error: SAVE_ERROR_COPY, success: null };
  }

  await writeAuditLog({
    clientId: clientIdResult.data,
    userId: auth.userId,
    action: "founder_experience_created",
    entityType: "founder_experience",
    entityId: data.id,
    metadata: { title_present: true },
  });

  revalidatePath(`/client/${clientIdResult.data}/founder-experiences`);

  return { error: null, success: "Founder experience added." };
}

export async function updateFounderExperienceAction(
  clientId: string,
  experienceId: string,
  _prevState: FounderExperienceFormState,
  formData: FormData,
): Promise<FounderExperienceFormState> {
  const clientIdResult = uuidSchema.safeParse(clientId);
  const experienceIdResult = uuidSchema.safeParse(experienceId);
  if (!clientIdResult.success || !experienceIdResult.success) {
    return { error: SAVE_ERROR_COPY, success: null };
  }

  const parsed = parseFounderExperienceForm(formData);
  if (!parsed.success) {
    return { error: SAVE_ERROR_COPY, success: null };
  }

  const auth = await verifyWorkflowContributor(clientIdResult.data);
  if (!auth.ok) {
    return { error: ACCESS_ERROR_COPY, success: null };
  }

  const supabase = await createClient();
  const columns = FOUNDER_EXPERIENCE_COLUMNS.join(", ");

  const { data: before, error: fetchError } = await supabase
    .from("founder_experiences")
    .select(columns)
    .eq("id", experienceIdResult.data)
    .eq("client_id", clientIdResult.data)
    .is("deleted_at", null)
    .maybeSingle<FounderExperienceColumnValues>();

  if (fetchError || !before) {
    return { error: SAVE_ERROR_COPY, success: null };
  }

  const update = toFounderExperienceRow(parsed.data);

  const { data: after, error: updateError } = await supabase
    .from("founder_experiences")
    .update(update)
    .eq("id", experienceIdResult.data)
    .eq("client_id", clientIdResult.data)
    .is("deleted_at", null)
    .select(columns)
    .maybeSingle<FounderExperienceColumnValues>();

  if (updateError || !after) {
    return { error: SAVE_ERROR_COPY, success: null };
  }

  const changedFields = FOUNDER_EXPERIENCE_COLUMNS.filter(
    (column) => JSON.stringify(before[column]) !== JSON.stringify(after[column]),
  );

  if (changedFields.length > 0) {
    await writeAuditLog({
      clientId: clientIdResult.data,
      userId: auth.userId,
      action: "founder_experience_updated",
      entityType: "founder_experience",
      entityId: experienceIdResult.data,
      metadata: {
        changed_fields: changedFields,
        changed_count: changedFields.length,
      },
    });
  }

  revalidatePath(`/client/${clientIdResult.data}/founder-experiences`);

  return { error: null, success: "Founder experience updated." };
}

export async function archiveFounderExperienceAction(
  clientId: string,
  experienceId: string,
  _prevState: ArchiveFounderExperienceState,
  _formData: FormData,
): Promise<ArchiveFounderExperienceState> {
  const clientIdResult = uuidSchema.safeParse(clientId);
  const experienceIdResult = uuidSchema.safeParse(experienceId);
  if (!clientIdResult.success || !experienceIdResult.success) {
    return { error: ARCHIVE_ERROR_COPY };
  }

  const auth = await verifyWorkflowContributor(clientIdResult.data);
  if (!auth.ok) {
    return { error: ACCESS_ERROR_COPY };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("founder_experiences")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", experienceIdResult.data)
    .eq("client_id", clientIdResult.data)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return { error: ARCHIVE_ERROR_COPY };
  }

  await writeAuditLog({
    clientId: clientIdResult.data,
    userId: auth.userId,
    action: "founder_experience_deleted",
    entityType: "founder_experience",
    entityId: experienceIdResult.data,
  });

  revalidatePath(`/client/${clientIdResult.data}/founder-experiences`);

  return { error: null };
}
