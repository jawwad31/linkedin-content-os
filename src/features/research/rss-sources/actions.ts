"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUserRoleForClient } from "@/features/clients/invitations/queries";
import { writeAuditLog } from "@/lib/audit/log";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/session";

import { RSS_SOURCE_COLUMNS, rssSourceFormSchema, toRssSourceRow } from "./schemas";

export type RssSourceFormState = {
  error: string | null;
  success: string | null;
};

export type ToggleRssSourceState = {
  error: string | null;
};

export type ArchiveRssSourceState = {
  error: string | null;
};

const SAVE_ERROR_COPY =
  "Could not save this RSS source. Check the fields and try again.";
const TOGGLE_ERROR_COPY = "Could not update this RSS source. Try again.";
const ARCHIVE_ERROR_COPY = "Could not archive this RSS source. Try again.";
const VIEWER_ERROR_COPY = "Your role is view-only for this client.";

const uuidSchema = z.string().uuid();

type RssSourceColumnValues = Record<string, unknown>;

/**
 * Explicit application-level role gate — the primary check, not RLS.
 * RLS's rss_sources_insert_owner_editor / rss_sources_update_owner_editor
 * policies are the backstop.
 */
async function verifyOwnerEditor(
  clientId: string,
): Promise<{ ok: true; userId: string } | { ok: false }> {
  const { user } = await getServerUser();
  if (!user) return { ok: false };

  const role = await getCurrentUserRoleForClient(user.id, clientId);
  if (role !== "owner" && role !== "editor") return { ok: false };

  return { ok: true, userId: user.id };
}

function parseRssSourceForm(formData: FormData) {
  return rssSourceFormSchema.safeParse({
    sourceName: formData.get("sourceName"),
    feedUrl: formData.get("feedUrl"),
    category: formData.get("category"),
  });
}

export async function createRssSourceAction(
  clientId: string,
  _prevState: RssSourceFormState,
  formData: FormData,
): Promise<RssSourceFormState> {
  const clientIdResult = uuidSchema.safeParse(clientId);
  if (!clientIdResult.success) {
    return { error: SAVE_ERROR_COPY, success: null };
  }

  const parsed = parseRssSourceForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? SAVE_ERROR_COPY, success: null };
  }

  const auth = await verifyOwnerEditor(clientIdResult.data);
  if (!auth.ok) {
    return { error: VIEWER_ERROR_COPY, success: null };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("rss_sources")
    .insert({
      client_id: clientIdResult.data,
      ...toRssSourceRow(parsed.data),
    })
    .select("id")
    .single();

  if (error || !data) {
    return { error: SAVE_ERROR_COPY, success: null };
  }

  await writeAuditLog({
    clientId: clientIdResult.data,
    userId: auth.userId,
    action: "rss_source_created",
    entityType: "rss_source",
    entityId: data.id,
    metadata: { source_name_present: true },
  });

  revalidatePath(`/client/${clientIdResult.data}/research`);

  return { error: null, success: "RSS source added." };
}

export async function updateRssSourceAction(
  clientId: string,
  sourceId: string,
  _prevState: RssSourceFormState,
  formData: FormData,
): Promise<RssSourceFormState> {
  const clientIdResult = uuidSchema.safeParse(clientId);
  const sourceIdResult = uuidSchema.safeParse(sourceId);
  if (!clientIdResult.success || !sourceIdResult.success) {
    return { error: SAVE_ERROR_COPY, success: null };
  }

  const parsed = parseRssSourceForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? SAVE_ERROR_COPY, success: null };
  }

  const auth = await verifyOwnerEditor(clientIdResult.data);
  if (!auth.ok) {
    return { error: VIEWER_ERROR_COPY, success: null };
  }

  const supabase = await createClient();
  const columns = RSS_SOURCE_COLUMNS.join(", ");

  const { data: before, error: fetchError } = await supabase
    .from("rss_sources")
    .select(columns)
    .eq("id", sourceIdResult.data)
    .eq("client_id", clientIdResult.data)
    .is("deleted_at", null)
    .maybeSingle<RssSourceColumnValues>();

  if (fetchError || !before) {
    return { error: SAVE_ERROR_COPY, success: null };
  }

  const update = toRssSourceRow(parsed.data);

  const { data: after, error: updateError } = await supabase
    .from("rss_sources")
    .update(update)
    .eq("id", sourceIdResult.data)
    .eq("client_id", clientIdResult.data)
    .is("deleted_at", null)
    .select(columns)
    .maybeSingle<RssSourceColumnValues>();

  if (updateError || !after) {
    return { error: SAVE_ERROR_COPY, success: null };
  }

  const changedFields = RSS_SOURCE_COLUMNS.filter(
    (column) => JSON.stringify(before[column]) !== JSON.stringify(after[column]),
  );

  if (changedFields.length > 0) {
    await writeAuditLog({
      clientId: clientIdResult.data,
      userId: auth.userId,
      action: "rss_source_updated",
      entityType: "rss_source",
      entityId: sourceIdResult.data,
      metadata: {
        changed_fields: changedFields,
        changed_count: changedFields.length,
      },
    });
  }

  revalidatePath(`/client/${clientIdResult.data}/research`);

  return { error: null, success: "RSS source updated." };
}

export async function toggleRssSourceActiveAction(
  clientId: string,
  sourceId: string,
  _prevState: ToggleRssSourceState,
  _formData: FormData,
): Promise<ToggleRssSourceState> {
  const clientIdResult = uuidSchema.safeParse(clientId);
  const sourceIdResult = uuidSchema.safeParse(sourceId);
  if (!clientIdResult.success || !sourceIdResult.success) {
    return { error: TOGGLE_ERROR_COPY };
  }

  const auth = await verifyOwnerEditor(clientIdResult.data);
  if (!auth.ok) {
    return { error: VIEWER_ERROR_COPY };
  }

  const supabase = await createClient();

  const { data: before, error: fetchError } = await supabase
    .from("rss_sources")
    .select("active")
    .eq("id", sourceIdResult.data)
    .eq("client_id", clientIdResult.data)
    .is("deleted_at", null)
    .maybeSingle<{ active: boolean }>();

  if (fetchError || !before) {
    return { error: TOGGLE_ERROR_COPY };
  }

  const nextActive = !before.active;

  const { data, error } = await supabase
    .from("rss_sources")
    .update({ active: nextActive })
    .eq("id", sourceIdResult.data)
    .eq("client_id", clientIdResult.data)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return { error: TOGGLE_ERROR_COPY };
  }

  await writeAuditLog({
    clientId: clientIdResult.data,
    userId: auth.userId,
    action: "rss_source_toggled",
    entityType: "rss_source",
    entityId: sourceIdResult.data,
    metadata: { active: nextActive },
  });

  revalidatePath(`/client/${clientIdResult.data}/research`);

  return { error: null };
}

export async function archiveRssSourceAction(
  clientId: string,
  sourceId: string,
  _prevState: ArchiveRssSourceState,
  _formData: FormData,
): Promise<ArchiveRssSourceState> {
  const clientIdResult = uuidSchema.safeParse(clientId);
  const sourceIdResult = uuidSchema.safeParse(sourceId);
  if (!clientIdResult.success || !sourceIdResult.success) {
    return { error: ARCHIVE_ERROR_COPY };
  }

  const auth = await verifyOwnerEditor(clientIdResult.data);
  if (!auth.ok) {
    return { error: VIEWER_ERROR_COPY };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("rss_sources")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", sourceIdResult.data)
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
    action: "rss_source_deleted",
    entityType: "rss_source",
    entityId: sourceIdResult.data,
  });

  revalidatePath(`/client/${clientIdResult.data}/research`);

  return { error: null };
}
