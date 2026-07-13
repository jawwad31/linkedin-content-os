import "server-only";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { canAccessClient, canMutateClientWorkflow, canUserDeleteBusinessRecords } from "@/lib/access/client-access";
import { writeAuditLog } from "@/lib/audit/log";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/session";

import type { CollectedArticleStatus } from "./queries";

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

const uuidSchema = z.string().uuid();

const ARTICLE_ERROR_COPY = "Could not update this article. Please try again.";

const AUTH_REQUIRED = {
  ok: false as const,
  code: "AUTH_REQUIRED",
  message: "You must be signed in to continue.",
};

const INVALID_INPUT = {
  ok: false as const,
  code: "VALIDATION_ERROR",
  message: ARTICLE_ERROR_COPY,
};

const NO_ACCESS = {
  ok: false as const,
  code: "FORBIDDEN",
  message: "You do not have access to this client.",
};

const WORKFLOW_FORBIDDEN = {
  ok: false as const,
  code: "FORBIDDEN",
  message: "You do not have permission to update workflow content for this Client Workspace.",
};

const NOT_FOUND = {
  ok: false as const,
  code: "NOT_FOUND",
  message: ARTICLE_ERROR_COPY,
};

const GENERIC_FAILURE = {
  ok: false as const,
  code: "UNKNOWN_ERROR",
  message: ARTICLE_ERROR_COPY,
};

type MarkTargetStatus = "relevant" | "irrelevant";

type MarkResult = { id: string; status: CollectedArticleStatus };

/**
 * Marks a collected article relevant or irrelevant. Application-level auth
 * is the primary gate here (not RLS): authenticated user, accepted client
 * access, and workflow contributor permission. RLS's market signal item
 * policy is the backstop, so the
 * regular session-bound client is used, not the admin client.
 *
 * "used" articles (already consumed by a synthesized TrendCard) are
 * locked — they cannot be re-marked from here.
 */
async function markCollectedArticleStatus(
  clientId: string,
  itemId: string,
  targetStatus: MarkTargetStatus,
): Promise<ServiceResult<MarkResult>> {
  const { user } = await getServerUser();
  if (!user) return AUTH_REQUIRED;

  const clientIdResult = uuidSchema.safeParse(clientId);
  const itemIdResult = uuidSchema.safeParse(itemId);
  if (!clientIdResult.success || !itemIdResult.success) return INVALID_INPUT;

  const hasAccess = await canAccessClient(user.id, clientIdResult.data);
  if (!hasAccess) return NO_ACCESS;

  const canMutate = await canMutateClientWorkflow(user.id, clientIdResult.data);
  if (!canMutate) return WORKFLOW_FORBIDDEN;

  const supabase = await createClient();

  const { data: before, error: fetchError } = await supabase
    .from("market_signal_items")
    .select("id, status, classification_reason")
    .eq("id", itemIdResult.data)
    .eq("client_id", clientIdResult.data)
    .is("deleted_at", null)
    .maybeSingle<{
      id: string;
      status: CollectedArticleStatus;
      classification_reason: string | null;
    }>();

  if (fetchError || !before) return NOT_FOUND;
  if (before.status === "used") return NOT_FOUND;

  const reviewerNote =
    targetStatus === "relevant"
      ? "Marked relevant by reviewer."
      : "Marked irrelevant by reviewer.";
  const nextClassificationReason = before.classification_reason?.trim()
    ? before.classification_reason
    : reviewerNote;

  const { data: after, error: updateError } = await supabase
    .from("market_signal_items")
    .update({
      status: targetStatus,
      classification_reason: nextClassificationReason,
    })
    .eq("id", itemIdResult.data)
    .eq("client_id", clientIdResult.data)
    .is("deleted_at", null)
    .select("id, status")
    .maybeSingle<MarkResult>();

  if (updateError || !after) return GENERIC_FAILURE;

  await writeAuditLog({
    clientId: clientIdResult.data,
    userId: user.id,
    action:
      targetStatus === "relevant"
        ? "article_marked_relevant"
        : "article_marked_irrelevant",
    entityType: "market_signal_item",
    entityId: itemIdResult.data,
    metadata: { previous_status: before.status, next_status: targetStatus },
  });

  revalidatePath(`/client/${clientIdResult.data}/research`);

  return { ok: true, data: after };
}

export async function markCollectedArticleRelevant(
  clientId: string,
  itemId: string,
): Promise<ServiceResult<MarkResult>> {
  return markCollectedArticleStatus(clientId, itemId, "relevant");
}

export async function markCollectedArticleIrrelevant(
  clientId: string,
  itemId: string,
): Promise<ServiceResult<MarkResult>> {
  return markCollectedArticleStatus(clientId, itemId, "irrelevant");
}

export async function deleteCollectedArticle(
  clientId: string,
  itemId: string,
): Promise<ServiceResult<void>> {
  const { user } = await getServerUser();
  if (!user) return { ok: false, code: "AUTH_REQUIRED", message: "You must be signed in to continue." };

  const clientIdResult = uuidSchema.safeParse(clientId);
  const itemIdResult = uuidSchema.safeParse(itemId);
  if (!clientIdResult.success || !itemIdResult.success) {
    return { ok: false, code: "VALIDATION_ERROR", message: "Invalid parameters." };
  }

  const isAuthorized = await canUserDeleteBusinessRecords(user.id, clientIdResult.data);
  if (!isAuthorized) return { ok: false, code: "FORBIDDEN", message: "You do not have permission to delete articles for this Client Workspace." };

  const supabase = await createClient();

  const { data: article, error: fetchError } = await supabase
    .from("market_signal_items")
    .select("id, status")
    .eq("id", itemIdResult.data)
    .eq("client_id", clientIdResult.data)
    .is("deleted_at", null)
    .maybeSingle();

  if (fetchError || !article) {
    return { ok: false, code: "NOT_FOUND", message: "Article not found." };
  }

  const { count: citedCount, error: citeError } = await supabase
    .from("trend_cards")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientIdResult.data)
    .is("deleted_at", null)
    .contains("source_item_ids_json", JSON.stringify([itemIdResult.data]));

  if (citeError) {
    return { ok: false, code: "UNKNOWN_ERROR", message: "Could not perform dependency check." };
  }

  if ((citedCount ?? 0) > 0) {
    return {
      ok: false,
      code: "DEPENDENCY_CONFLICT",
      message: "This article cannot be deleted because it supports an existing TrendCard.",
    };
  }

  const { data: deleted, error: deleteError } = await supabase
    .from("market_signal_items")
    .delete()
    .eq("id", itemIdResult.data)
    .eq("client_id", clientIdResult.data)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (deleteError || !deleted) {
    return { ok: false, code: "UNKNOWN_ERROR", message: "Could not delete this article. Please try again." };
  }

  await writeAuditLog({
    clientId: clientIdResult.data,
    userId: user.id,
    action: "article_hard_deleted",
    entityType: "market_signal_item",
    entityId: itemIdResult.data,
    metadata: {
      article_id: itemIdResult.data,
      previous_status: article.status,
    },
  });

  revalidatePath(`/client/${clientIdResult.data}/research`);
  revalidatePath(`/client/${clientIdResult.data}/dashboard`);

  return { ok: true, data: undefined };
}
