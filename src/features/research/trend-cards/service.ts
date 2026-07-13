import "server-only";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  canAccessClient,
  canManageWorkflowReview,
  canMutateClientWorkflow,
  canUserDeleteBusinessRecords,
} from "@/lib/access/client-access";
import { writeAuditLog } from "@/lib/audit/log";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/session";

import { founderTakeInputSchema, trendReactionInputSchema } from "./schemas";

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

const uuidSchema = z.string().uuid();

const CARD_ERROR_COPY = "Could not update this TrendCard. Please try again.";

const AUTH_REQUIRED = {
  ok: false as const,
  code: "AUTH_REQUIRED",
  message: "You must be signed in to continue.",
};

const INVALID_INPUT = {
  ok: false as const,
  code: "VALIDATION_ERROR",
  message: CARD_ERROR_COPY,
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

const REVIEW_FORBIDDEN = {
  ok: false as const,
  code: "FORBIDDEN",
  message: "You do not have permission to approve or archive TrendCards.",
};

const NOT_FOUND = {
  ok: false as const,
  code: "NOT_FOUND",
  message: CARD_ERROR_COPY,
};

const CARD_IN_USE = {
  ok: false as const,
  code: "VALIDATION_ERROR",
  message:
    "This TrendCard has reactions or linked ideas and can no longer be archived.",
};

const GENERIC_FAILURE = {
  ok: false as const,
  code: "UNKNOWN_ERROR",
  message: CARD_ERROR_COPY,
};

type AuthorizedMutation =
  | { ok: true; userId: string; clientId: string }
  | { ok: false; failure: ServiceResult<never> };

/**
 * Application-level auth is the primary gate here (not RLS): authenticated
 * user, Client Workspace access, and the requested permission category.
 *
 * trend_cards (renamed from market_signals) kept the tightened RLS posture
 * from the Feature 18 security correction: no insert/update policies for
 * the authenticated role, so every trend_cards mutation below uses
 * createAdminClient(), with this check standing in for the RLS backstop
 * that intentionally does not exist for writes on that table.
 */
async function authorizeMutation(
  clientId: string,
  permission: "workflow" | "review",
): Promise<AuthorizedMutation> {
  const { user } = await getServerUser();
  if (!user) return { ok: false, failure: AUTH_REQUIRED };

  const clientIdResult = uuidSchema.safeParse(clientId);
  if (!clientIdResult.success) return { ok: false, failure: INVALID_INPUT };

  const hasAccess = await canAccessClient(user.id, clientIdResult.data);
  if (!hasAccess) return { ok: false, failure: NO_ACCESS };

  const isAllowed =
    permission === "workflow"
      ? await canMutateClientWorkflow(user.id, clientIdResult.data)
      : await canManageWorkflowReview(user.id, clientIdResult.data);

  if (!isAllowed) {
    return {
      ok: false,
      failure: permission === "workflow" ? WORKFLOW_FORBIDDEN : REVIEW_FORBIDDEN,
    };
  }

  return { ok: true, userId: user.id, clientId: clientIdResult.data };
}

export async function saveFounderTake(
  clientId: string,
  cardId: string,
  founderTakeInput: string,
): Promise<ServiceResult<{ id: string; founderTake: string | null }>> {
  const cardIdResult = uuidSchema.safeParse(cardId);
  if (!cardIdResult.success) return INVALID_INPUT;

  const parsed = founderTakeInputSchema.safeParse({
    founderTake: founderTakeInput,
  });
  if (!parsed.success) return INVALID_INPUT;

  const auth = await authorizeMutation(clientId, "workflow");
  if (!auth.ok) return auth.failure;

  const admin = createAdminClient();

  const { data: before, error: fetchError } = await admin
    .from("trend_cards")
    .select("id, founder_take")
    .eq("id", cardIdResult.data)
    .eq("client_id", auth.clientId)
    .is("deleted_at", null)
    .maybeSingle<{ id: string; founder_take: string | null }>();

  if (fetchError || !before) return NOT_FOUND;

  const nextFounderTake =
    parsed.data.founderTake.length > 0 ? parsed.data.founderTake : null;

  const { data: after, error: updateError } = await admin
    .from("trend_cards")
    .update({ founder_take: nextFounderTake })
    .eq("id", cardIdResult.data)
    .eq("client_id", auth.clientId)
    .is("deleted_at", null)
    .select("id, founder_take")
    .maybeSingle<{ id: string; founder_take: string | null }>();

  if (updateError || !after) return GENERIC_FAILURE;

  await writeAuditLog({
    clientId: auth.clientId,
    userId: auth.userId,
    action: before.founder_take ? "founder_take_updated" : "founder_take_added",
    entityType: "trend_card",
    entityId: cardIdResult.data,
  });

  revalidatePath(`/client/${auth.clientId}/research`);

  return { ok: true, data: { id: after.id, founderTake: after.founder_take } };
}

export async function approveTrendCardForIdeas(
  clientId: string,
  cardId: string,
): Promise<ServiceResult<{ id: string; approvedForIdeas: boolean }>> {
  const cardIdResult = uuidSchema.safeParse(cardId);
  if (!cardIdResult.success) return INVALID_INPUT;

  const auth = await authorizeMutation(clientId, "review");
  if (!auth.ok) return auth.failure;

  const admin = createAdminClient();

  const { data: before, error: fetchError } = await admin
    .from("trend_cards")
    .select("id, approved_for_ideas")
    .eq("id", cardIdResult.data)
    .eq("client_id", auth.clientId)
    .is("deleted_at", null)
    .maybeSingle<{ id: string; approved_for_ideas: boolean }>();

  if (fetchError || !before) return NOT_FOUND;

  if (before.approved_for_ideas) {
    return { ok: true, data: { id: before.id, approvedForIdeas: true } };
  }

  const { data: after, error: updateError } = await admin
    .from("trend_cards")
    .update({ approved_for_ideas: true })
    .eq("id", cardIdResult.data)
    .eq("client_id", auth.clientId)
    .is("deleted_at", null)
    .select("id, approved_for_ideas")
    .maybeSingle<{ id: string; approved_for_ideas: boolean }>();

  if (updateError || !after) return GENERIC_FAILURE;

  await writeAuditLog({
    clientId: auth.clientId,
    userId: auth.userId,
    action: "trend_card_approved_for_ideas",
    entityType: "trend_card",
    entityId: cardIdResult.data,
  });

  revalidatePath(`/client/${auth.clientId}/research`);

  return {
    ok: true,
    data: { id: after.id, approvedForIdeas: after.approved_for_ideas },
  };
}

/**
 * Soft-archives a TrendCard (sets deleted_at — never a hard delete), only
 * while nothing depends on it yet: no trend reactions and no Content Ideas
 * citing it. Mirrors the original workflow's "can_delete" guard.
 */
export async function archiveTrendCard(
  clientId: string,
  cardId: string,
): Promise<ServiceResult<{ id: string }>> {
  const cardIdResult = uuidSchema.safeParse(cardId);
  if (!cardIdResult.success) return INVALID_INPUT;

  const auth = await authorizeMutation(clientId, "review");
  if (!auth.ok) return auth.failure;

  const admin = createAdminClient();

  const { data: card, error: fetchError } = await admin
    .from("trend_cards")
    .select("id")
    .eq("id", cardIdResult.data)
    .eq("client_id", auth.clientId)
    .is("deleted_at", null)
    .maybeSingle<{ id: string }>();

  if (fetchError || !card) return NOT_FOUND;

  const { count: reactionCount, error: reactionsError } = await admin
    .from("founder_experiences")
    .select("id", { count: "exact", head: true })
    .eq("client_id", auth.clientId)
    .eq("entry_type", "trend_reaction")
    .eq("source_trend_card_id", cardIdResult.data)
    .is("deleted_at", null);

  if (reactionsError) return GENERIC_FAILURE;
  if ((reactionCount ?? 0) > 0) return CARD_IN_USE;

  const { count: ideaCount, error: ideasError } = await admin
    .from("content_ideas")
    .select("id", { count: "exact", head: true })
    .eq("client_id", auth.clientId)
    .contains("source_ids_json", JSON.stringify([cardIdResult.data]))
    .is("deleted_at", null);

  if (ideasError) return GENERIC_FAILURE;
  if ((ideaCount ?? 0) > 0) return CARD_IN_USE;

  const { data: archived, error: archiveError } = await admin
    .from("trend_cards")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", cardIdResult.data)
    .eq("client_id", auth.clientId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (archiveError || !archived) return GENERIC_FAILURE;

  await writeAuditLog({
    clientId: auth.clientId,
    userId: auth.userId,
    action: "trend_card_archived",
    entityType: "trend_card",
    entityId: cardIdResult.data,
  });

  revalidatePath(`/client/${auth.clientId}/research`);

  return { ok: true, data: { id: archived.id } };
}

/**
 * Records a founder's reaction to one TrendCard as a founder_experiences
 * row (entry_type='trend_reaction', linked via source_trend_card_id). The
 * insert uses the session-bound client — founder_experiences kept its
 * workflow-contributor insert RLS policy, so RLS is the backstop here just
 * like the Founder Experiences feature itself.
 */
export async function addTrendReaction(
  clientId: string,
  cardId: string,
  input: unknown,
): Promise<ServiceResult<{ id: string }>> {
  const cardIdResult = uuidSchema.safeParse(cardId);
  if (!cardIdResult.success) return INVALID_INPUT;

  const parsed = trendReactionInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: parsed.error.issues[0]?.message ?? CARD_ERROR_COPY,
    };
  }

  const auth = await authorizeMutation(clientId, "workflow");
  if (!auth.ok) return auth.failure;

  const supabase = await createClient();

  const { data: card, error: fetchError } = await supabase
    .from("trend_cards")
    .select("id, title")
    .eq("id", cardIdResult.data)
    .eq("client_id", auth.clientId)
    .is("deleted_at", null)
    .maybeSingle<{ id: string; title: string }>();

  if (fetchError || !card) return NOT_FOUND;

  const proof = parsed.data.proofOrExample?.trim() ?? "";

  const { data: inserted, error: insertError } = await supabase
    .from("founder_experiences")
    .insert({
      client_id: auth.clientId,
      title: `Reaction: ${card.title}`.slice(0, 200),
      entry_type: "trend_reaction",
      reaction_type: parsed.data.reactionType,
      source_trend_card_id: cardIdResult.data,
      what_was_learned: parsed.data.take,
      what_happened: proof.length > 0 ? proof : null,
    })
    .select("id")
    .single();

  if (insertError || !inserted) return GENERIC_FAILURE;

  await writeAuditLog({
    clientId: auth.clientId,
    userId: auth.userId,
    action: "trend_card_reaction_added",
    entityType: "trend_card",
    entityId: cardIdResult.data,
    metadata: { reaction_type: parsed.data.reactionType },
  });

  revalidatePath(`/client/${auth.clientId}/research`);

  return { ok: true, data: { id: inserted.id } };
}

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
