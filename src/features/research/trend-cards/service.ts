import "server-only";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { canUserDeleteBusinessRecords } from "@/lib/access/client-access";
import { writeAuditLog } from "@/lib/audit/log";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/session";

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

const uuidSchema = z.string().uuid();

export async function deleteTrendCard(
  clientId: string,
  cardId: string,
): Promise<ServiceResult<void>> {
  const { user } = await getServerUser();
  if (!user) return { ok: false, code: "AUTH_REQUIRED", message: "You must be signed in to continue." };

  const clientIdResult = uuidSchema.safeParse(clientId);
  const cardIdResult = uuidSchema.safeParse(cardId);
  if (!clientIdResult.success || !cardIdResult.success) {
    return { ok: false, code: "VALIDATION_ERROR", message: "Invalid parameters." };
  }

  const isAuthorized = await canUserDeleteBusinessRecords(user.id, clientIdResult.data);
  if (!isAuthorized) return { ok: false, code: "FORBIDDEN", message: "You do not have permission to delete TrendCards for this Client Workspace." };

  const supabase = await createClient();

  const { data: card, error: fetchError } = await supabase
    .from("trend_cards")
    .select("id, source_item_ids_json")
    .eq("id", cardIdResult.data)
    .eq("client_id", clientIdResult.data)
    .is("deleted_at", null)
    .maybeSingle();

  if (fetchError || !card) {
    return { ok: false, code: "NOT_FOUND", message: "TrendCard not found." };
  }

  const articleIds: string[] = [];
  if (Array.isArray(card.source_item_ids_json)) {
    for (const item of card.source_item_ids_json) {
      if (typeof item === "string" && uuidSchema.safeParse(item).success) {
        articleIds.push(item);
      }
    }
  }

  const preStatusMap = new Map<string, string>();
  if (articleIds.length > 0) {
    const { data: preArticles } = await supabase
      .from("market_signal_items")
      .select("id, status")
      .in("id", articleIds)
      .eq("client_id", clientIdResult.data)
      .is("deleted_at", null);

    if (preArticles) {
      for (const art of preArticles) {
        preStatusMap.set(art.id, art.status);
      }
    }
  }

  const { error: rpcError } = await supabase.rpc(
    "delete_trend_card_and_restore_articles",
    {
      p_client_id: clientIdResult.data,
      p_trend_card_id: cardIdResult.data,
    }
  );

  if (rpcError) {
    if (rpcError.code === "23503") {
      return {
        ok: false,
        code: "DEPENDENCY_CONFLICT",
        message: "This TrendCard cannot be deleted because downstream content depends on it.",
      };
    }
    if (rpcError.code === "P0002") {
      return {
        ok: false,
        code: "NOT_FOUND",
        message: "TrendCard not found.",
      };
    }
    return {
      ok: false,
      code: "UNKNOWN_ERROR",
      message: "Could not delete this TrendCard. Please try again.",
    };
  }

  let restoredCount = 0;
  if (articleIds.length > 0) {
    const { data: postArticles } = await supabase
      .from("market_signal_items")
      .select("id, status")
      .in("id", articleIds)
      .eq("client_id", clientIdResult.data)
      .is("deleted_at", null);

    if (postArticles) {
      for (const art of postArticles) {
        const beforeStatus = preStatusMap.get(art.id);
        if (beforeStatus === "used" && art.status === "relevant") {
          restoredCount++;
        }
      }
    }
  }

  await writeAuditLog({
    clientId: clientIdResult.data,
    userId: user.id,
    action: "trend_card_hard_deleted",
    entityType: "trend_card",
    entityId: cardIdResult.data,
    metadata: {
      trend_card_id: cardIdResult.data,
      number_of_articles_restored: restoredCount,
    },
  });

  revalidatePath(`/client/${clientIdResult.data}/research`);
  revalidatePath(`/client/${clientIdResult.data}/ideas`);
  revalidatePath(`/client/${clientIdResult.data}/dashboard`);

  return { ok: true, data: undefined };
}
