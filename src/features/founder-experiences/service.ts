import "server-only";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { canUserDeleteBusinessRecords } from "@/lib/access/client-access";
import { writeAuditLog } from "@/lib/audit/log";
import { createClient } from "@/lib/supabase/server";
import { isMissingTableError } from "@/lib/supabase/schema-errors";
import { getServerUser } from "@/lib/supabase/session";

const uuidSchema = z.string().uuid();

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

export async function deleteFounderExperience(
  clientId: string,
  experienceId: string,
): Promise<ServiceResult<void>> {
  const { user } = await getServerUser();
  if (!user) return { ok: false, code: "AUTH_REQUIRED", message: "You must be signed in to continue." };

  const clientIdResult = uuidSchema.safeParse(clientId);
  const experienceIdResult = uuidSchema.safeParse(experienceId);
  if (!clientIdResult.success || !experienceIdResult.success) {
    return { ok: false, code: "VALIDATION_ERROR", message: "Invalid parameters." };
  }

  const isAuthorized = await canUserDeleteBusinessRecords(user.id, clientIdResult.data);
  if (!isAuthorized) return { ok: false, code: "FORBIDDEN", message: "You do not have permission to delete entries for this Client Workspace." };

  const supabase = await createClient();

  const { data: exp, error: fetchError } = await supabase
    .from("founder_experiences")
    .select("id, entry_type")
    .eq("id", experienceIdResult.data)
    .eq("client_id", clientIdResult.data)
    .is("deleted_at", null)
    .maybeSingle();

  if (fetchError || !exp) {
    return { ok: false, code: "NOT_FOUND", message: "Founder Experience not found." };
  }

  const { count: citedCount, error: citeError } = await supabase
    .from("content_ideas")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientIdResult.data)
    .is("deleted_at", null)
    .contains("source_ids_json", JSON.stringify([experienceIdResult.data]));

  if (citeError) {
    return { ok: false, code: "UNKNOWN_ERROR", message: "Could not perform dependency check." };
  }

  if ((citedCount ?? 0) > 0) {
    return {
      ok: false,
      code: "DEPENDENCY_CONFLICT",
      message: "This Founder Experience cannot be deleted because a Content Idea depends on it.",
    };
  }

  // A plain GET, not HEAD: a failed HEAD request carries no error body, so the client
  // library would report the failure as success and hide a real dependency check error.
  const { data: plannedSlots, error: planError } = await supabase
    .from("calendar_slots")
    .select("id")
    .eq("client_id", clientIdResult.data)
    .eq("source_id", experienceIdResult.data)
    .neq("status", "cancelled")
    .limit(1);

  // Before the calendar migration is applied no slot can exist, so a missing table is
  // not a dependency. Any other error still blocks the delete.
  if (planError && !isMissingTableError(planError)) {
    return { ok: false, code: "UNKNOWN_ERROR", message: "Could not perform dependency check." };
  }

  if ((plannedSlots?.length ?? 0) > 0) {
    return {
      ok: false,
      code: "DEPENDENCY_CONFLICT",
      message: "This Founder Experience cannot be deleted because it is planned in a content calendar. Cancel that slot first.",
    };
  }

  const { data: deleted, error: deleteError } = await supabase
    .from("founder_experiences")
    .delete()
    .eq("id", experienceIdResult.data)
    .eq("client_id", clientIdResult.data)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (deleteError || !deleted) {
    return { ok: false, code: "UNKNOWN_ERROR", message: "Could not delete this entry. Please try again." };
  }

  await writeAuditLog({
    clientId: clientIdResult.data,
    userId: user.id,
    action: "founder_experience_hard_deleted",
    entityType: "founder_experience",
    entityId: experienceIdResult.data,
    metadata: {
      experience_id: experienceIdResult.data,
      entry_type: exp.entry_type,
    },
  });

  revalidatePath(`/client/${clientIdResult.data}/founder-experiences`);
  revalidatePath(`/client/${clientIdResult.data}/ideas`);
  revalidatePath(`/client/${clientIdResult.data}/dashboard`);

  return { ok: true, data: undefined };
}
