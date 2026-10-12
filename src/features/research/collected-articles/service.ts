import "server-only";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { canAccessClient, canContributeResearch, canUserDeleteBusinessRecords } from "@/lib/access/client-access";
import { writeAuditLog } from "@/lib/audit/log";
import type {
  ArticleBatchStatus,
  BatchArticleStatusResult,
  BatchEditFailure,
} from "@/lib/bulk-edit/contracts";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/session";

import { articleToEntryFields } from "./article-entry";
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

const USED_ARTICLE_LOCKED = {
  ok: false as const,
  code: "DEPENDENCY_CONFLICT",
  message:
    "This article is used by a TrendCard. Remove that dependency before changing its status.",
};

const GENERIC_FAILURE = {
  ok: false as const,
  code: "UNKNOWN_ERROR",
  message: ARTICLE_ERROR_COPY,
};

type MarkTargetStatus = ArticleBatchStatus;

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

  const canMutate = await canContributeResearch(user.id, clientIdResult.data);
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
  if (before.status === "used") return USED_ARTICLE_LOCKED;

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

  if (updateError || !after) {
    console.error("[collected-articles] Could not update article status.", {
      code: updateError?.code ?? "NO_UPDATED_ROW",
    });
    return GENERIC_FAILURE;
  }

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

export async function markCollectedArticlesStatus(
  clientId: string,
  itemIds: string[],
  targetStatus: MarkTargetStatus,
): Promise<ServiceResult<BatchArticleStatusResult>> {
  const { user } = await getServerUser();
  if (!user) return AUTH_REQUIRED;

  const clientIdResult = uuidSchema.safeParse(clientId);
  const parsedIds = z.array(uuidSchema).min(1).max(100).safeParse(itemIds);
  if (!clientIdResult.success || !parsedIds.success) return INVALID_INPUT;

  const ids = Array.from(new Set(parsedIds.data));
  const hasAccess = await canAccessClient(user.id, clientIdResult.data);
  if (!hasAccess) return NO_ACCESS;

  const canMutate = await canContributeResearch(user.id, clientIdResult.data);
  if (!canMutate) return WORKFLOW_FORBIDDEN;

  const supabase = await createClient();
  const { data: rows, error: fetchError } = await supabase
    .from("market_signal_items")
    .select("id, status")
    .eq("client_id", clientIdResult.data)
    .in("id", ids)
    .is("deleted_at", null)
    .returns<Array<{ id: string; status: CollectedArticleStatus }>>();

  if (fetchError) return GENERIC_FAILURE;

  const rowById = new Map(rows.map((row) => [row.id, row]));
  const failures: BatchEditFailure[] = [];
  const alreadyUpdatedIds: string[] = [];
  const idsToUpdate: string[] = [];

  for (const id of ids) {
    const row = rowById.get(id);
    if (!row) {
      failures.push({
        id,
        code: "NOT_FOUND",
        message: "This article could not be found.",
      });
    } else if (row.status === "used") {
      failures.push({
        id,
        code: USED_ARTICLE_LOCKED.code,
        message: USED_ARTICLE_LOCKED.message,
      });
    } else if (row.status === targetStatus) {
      alreadyUpdatedIds.push(id);
    } else {
      idsToUpdate.push(id);
    }
  }

  let changedIds: string[] = [];
  if (idsToUpdate.length > 0) {
    const { data: updatedRows, error: updateError } = await supabase
      .from("market_signal_items")
      .update({ status: targetStatus })
      .eq("client_id", clientIdResult.data)
      .in("id", idsToUpdate)
      .neq("status", "used")
      .is("deleted_at", null)
      .select("id")
      .returns<Array<{ id: string }>>();

    if (updateError) {
      console.error("[collected-articles] Could not batch-update statuses.", {
        code: updateError.code,
      });
      for (const id of idsToUpdate) {
        failures.push({
          id,
          code: "UNKNOWN_ERROR",
          message: ARTICLE_ERROR_COPY,
        });
      }
    } else {
      changedIds = updatedRows.map((row) => row.id);
      const changedSet = new Set(changedIds);
      for (const id of idsToUpdate) {
        if (!changedSet.has(id)) {
          failures.push({
            id,
            code: "UNKNOWN_ERROR",
            message: ARTICLE_ERROR_COPY,
          });
        }
      }
    }
  }

  const successfulIds = new Set([...alreadyUpdatedIds, ...changedIds]);
  const updatedIds = ids.filter((id) => successfulIds.has(id));

  if (changedIds.length > 0) {
    await writeAuditLog({
      clientId: clientIdResult.data,
      userId: user.id,
      action:
        targetStatus === "relevant"
          ? "articles_bulk_marked_relevant"
          : "articles_bulk_marked_irrelevant",
      entityType: "market_signal_item",
      metadata: {
        requested_count: ids.length,
        changed_count: changedIds.length,
        target_status: targetStatus,
      },
    });
  }

  revalidatePath(`/client/${clientIdResult.data}/research`);

  return {
    ok: true,
    data: {
      requestedCount: ids.length,
      updatedIds,
      failures,
    },
  };
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
    console.error("[collected-articles] Could not delete article.", {
      code: deleteError?.code ?? "NO_DELETED_ROW",
    });
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

/**
 * Saves one collected article to the Content Bank as a reusable, unused trend reaction.
 * Uses the signed-in user's own session, so the existing founder_experiences insert policy
 * (research_contribute or admin) is the backstop. Saving the same article again returns the
 * entry that already exists. It never creates a post, an idea or an approval.
 */
export async function saveArticleToContentBank(
  clientId: string,
  itemId: string,
): Promise<ServiceResult<{ entryId: string; alreadySaved: boolean }>> {
  const { user } = await getServerUser();
  if (!user) return AUTH_REQUIRED;
  const ids = z.object({ clientId: uuidSchema, itemId: uuidSchema }).safeParse({ clientId, itemId });
  if (!ids.success) return INVALID_INPUT;
  if (!(await canAccessClient(user.id, clientId))) return NO_ACCESS;
  if (!(await canContributeResearch(user.id, clientId))) {
    return {
      ok: false,
      code: "FORBIDDEN",
      message: "You do not have permission to save articles to the Content Bank.",
    };
  }
  const saveFailed = {
    ok: false as const,
    code: "UNKNOWN_ERROR",
    message: "Could not save this article to the Content Bank. Nothing was changed.",
  };

  const db = await createClient();
  const { data: row, error } = await db
    .from("market_signal_items")
    .select("id, title, url, summary, source_name, published_at, classification_reason")
    .eq("client_id", clientId)
    .eq("id", itemId)
    .is("deleted_at", null)
    .maybeSingle<{
      id: string;
      title: string;
      url: string;
      summary: string | null;
      source_name: string | null;
      published_at: string | null;
      classification_reason: string | null;
    }>();
  if (error || !row) return NOT_FOUND;

  const existingEntry = () =>
    db
      .from("founder_experiences")
      .select("id")
      .eq("client_id", clientId)
      .eq("source_article_id", itemId)
      .is("deleted_at", null)
      .maybeSingle<{ id: string }>();
  const existing = await existingEntry();
  if (existing.error) return saveFailed;
  if (existing.data) {
    return { ok: true, data: { entryId: existing.data.id, alreadySaved: true } };
  }

  const fields = articleToEntryFields({
    title: row.title,
    url: row.url,
    summary: row.summary,
    sourceName: row.source_name,
    publishedAt: row.published_at,
    classificationReason: row.classification_reason,
  });
  const { data: inserted, error: insertError } = await db
    .from("founder_experiences")
    .insert({
      client_id: clientId,
      title: fields.title,
      entry_type: "trend_reaction",
      reaction_type: "observation",
      source_article_id: row.id,
      category: "observation",
      readiness: "ready",
      allow_reuse: true,
      what_happened: fields.whatHappened,
      what_was_learned: fields.whatWasLearned,
      what_changed: fields.whatChanged,
      why_it_matters: fields.whyItMatters,
    })
    .select("id")
    .maybeSingle<{ id: string }>();
  if (insertError?.code === "23505") {
    // Another request saved it first; the unique index kept it to one entry.
    const winner = await existingEntry();
    return winner.data
      ? { ok: true, data: { entryId: winner.data.id, alreadySaved: true } }
      : saveFailed;
  }
  if (insertError || !inserted) return saveFailed;

  await writeAuditLog({
    clientId,
    userId: user.id,
    action: "content_bank_entry_created",
    entityType: "founder_experience",
    entityId: inserted.id,
    metadata: {
      sourceType: "founder_experience",
      entryId: inserted.id,
      origin: "collected_article",
      articleId: row.id,
    },
  });
  revalidatePath(`/client/${clientId}/research`);
  revalidatePath(`/client/${clientId}/content-bank`);
  return { ok: true, data: { entryId: inserted.id, alreadySaved: false } };
}
