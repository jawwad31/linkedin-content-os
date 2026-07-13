import "server-only";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { canUserDeleteBusinessRecords } from "@/lib/access/client-access";
import { writeAuditLog } from "@/lib/audit/log";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/session";

const uuidSchema = z.string().uuid();

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

export async function deleteRssSource(
  clientId: string,
  sourceId: string,
): Promise<ServiceResult<void>> {
  const { user } = await getServerUser();
  if (!user) return { ok: false, code: "AUTH_REQUIRED", message: "You must be signed in to continue." };

  const clientIdResult = uuidSchema.safeParse(clientId);
  const sourceIdResult = uuidSchema.safeParse(sourceId);
  if (!clientIdResult.success || !sourceIdResult.success) {
    return { ok: false, code: "VALIDATION_ERROR", message: "Invalid parameters." };
  }

  const isAuthorized = await canUserDeleteBusinessRecords(user.id, clientIdResult.data);
  if (!isAuthorized) return { ok: false, code: "FORBIDDEN", message: "You do not have permission to delete RSS sources for this Client Workspace." };

  const supabase = await createClient();

  const { data: source, error: fetchError } = await supabase
    .from("rss_sources")
    .select("id")
    .eq("id", sourceIdResult.data)
    .eq("client_id", clientIdResult.data)
    .is("deleted_at", null)
    .maybeSingle();

  if (fetchError || !source) {
    return { ok: false, code: "NOT_FOUND", message: "RSS source not found." };
  }

  const { count: articleCount } = await supabase
    .from("market_signal_items")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientIdResult.data)
    .eq("rss_source_id", sourceIdResult.data)
    .is("deleted_at", null);

  const { data: deleted, error: deleteError } = await supabase
    .from("rss_sources")
    .delete()
    .eq("id", sourceIdResult.data)
    .eq("client_id", clientIdResult.data)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (deleteError || !deleted) {
    return { ok: false, code: "UNKNOWN_ERROR", message: "Could not delete this RSS source. Please try again." };
  }

  await writeAuditLog({
    clientId: clientIdResult.data,
    userId: user.id,
    action: "rss_source_hard_deleted",
    entityType: "rss_source",
    entityId: sourceIdResult.data,
    metadata: {
      source_id: sourceIdResult.data,
      client_id: clientIdResult.data,
      collected_articles_existed: (articleCount ?? 0) > 0,
      collected_articles_count: articleCount ?? 0,
    },
  });

  revalidatePath(`/client/${clientIdResult.data}/research`);
  revalidatePath(`/client/${clientIdResult.data}/settings`);
  revalidatePath(`/client/${clientIdResult.data}/dashboard`);

  return { ok: true, data: undefined };
}
