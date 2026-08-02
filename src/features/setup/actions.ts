"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { canManageClientSetup } from "@/lib/access/client-access";
import { writeAuditLog } from "@/lib/audit/log";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/session";

import {
  businessContextFormSchema,
  CLIENT_CONTEXT_COLUMNS,
  toClientContextUpdate,
} from "./schemas";

export type SaveBusinessContextState = {
  error: string | null;
  success: string | null;
};

const SAVE_ERROR_COPY =
  "Could not save business context. Check the fields and try again.";
const SETUP_FORBIDDEN_COPY =
  "You do not have permission to edit Settings for this Client Workspace.";

const uuidSchema = z.string().uuid();

type ContextColumnValues = Record<string, unknown>;

export async function saveBusinessContextAction(
  clientId: string,
  _prevState: SaveBusinessContextState,
  formData: FormData,
): Promise<SaveBusinessContextState> {
  const clientIdResult = uuidSchema.safeParse(clientId);
  if (!clientIdResult.success) {
    return { error: SAVE_ERROR_COPY, success: null };
  }

  const { user } = await getServerUser();
  if (!user) {
    return { error: SAVE_ERROR_COPY, success: null };
  }

  const parsed = businessContextFormSchema.safeParse({
    name: formData.get("name"),
    founderName: formData.get("founderName"),
    industry: formData.get("industry"),
    businessDescription: formData.get("businessDescription"),
    primaryIcp: formData.get("primaryIcp"),
    mainOffer: formData.get("mainOffer"),
    bannedTopics: formData.get("bannedTopics"),
    founderVoiceSample: formData.get("founderVoiceSample"),
    phrasesToUse: formData.get("phrasesToUse"),
    phrasesToAvoid: formData.get("phrasesToAvoid"),
    approvedProof: formData.get("approvedProof"),
    voiceExample1Label: formData.get("voiceExample1Label"),
    voiceExample1Text: formData.get("voiceExample1Text"),
    voiceExample1Url: formData.get("voiceExample1Url"),
    voiceExample2Label: formData.get("voiceExample2Label"),
    voiceExample2Text: formData.get("voiceExample2Text"),
    voiceExample2Url: formData.get("voiceExample2Url"),
    voiceExample3Label: formData.get("voiceExample3Label"),
    voiceExample3Text: formData.get("voiceExample3Text"),
    voiceExample3Url: formData.get("voiceExample3Url"),
  });

  if (!parsed.success) {
    return { error: SAVE_ERROR_COPY, success: null };
  }

  const canManage = await canManageClientSetup(user.id, clientIdResult.data);
  if (!canManage) {
    return { error: SETUP_FORBIDDEN_COPY, success: null };
  }

  const supabase = await createClient();
  const columns = CLIENT_CONTEXT_COLUMNS.join(", ");

  const { data: before, error: fetchError } = await supabase
    .from("clients")
    .select(columns)
    .eq("id", clientIdResult.data)
    .is("deleted_at", null)
    .maybeSingle<ContextColumnValues>();

  if (fetchError || !before) {
    return { error: SAVE_ERROR_COPY, success: null };
  }

  const update = toClientContextUpdate(parsed.data);

  const { data: after, error: updateError } = await supabase
    .from("clients")
    .update(update)
    .eq("id", clientIdResult.data)
    .is("deleted_at", null)
    .select(columns)
    .maybeSingle<ContextColumnValues>();

  if (updateError || !after) {
    return { error: SAVE_ERROR_COPY, success: null };
  }

  const changedFields = CLIENT_CONTEXT_COLUMNS.filter(
    (column) => JSON.stringify(before[column]) !== JSON.stringify(after[column]),
  );

  if (changedFields.length > 0) {
    await writeAuditLog({
      clientId: clientIdResult.data,
      userId: user.id,
      action: "client_settings_updated",
      entityType: "client",
      entityId: clientIdResult.data,
      metadata: {
        changed_fields: changedFields,
        changed_count: changedFields.length,
      },
    });
  }

  revalidatePath(`/client/${clientIdResult.data}/settings`);

  return { error: null, success: "Business context saved." };
}
