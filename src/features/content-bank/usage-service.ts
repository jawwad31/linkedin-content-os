import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SourceUsageRecord } from "./schemas";

export type SourceType = "founder_experience" | "content_resource";
export type UsageChannel = "linkedin_post" | "newsletter" | "calendar_slot";
export type UsageStatus = "reserved" | "used" | "published" | "cancelled";

export type ReserveSourceResult =
  | { ok: true; usageId: string }
  | { ok: false; code: string; error: string };

type SupabaseAnyClient =
  | Awaited<ReturnType<typeof createClient>>
  | ReturnType<typeof createAdminClient>;

type ReserveSourceParams = {
  clientId: string;
  sourceId: string;
  sourceType: SourceType;
  channel?: UsageChannel;
  contentIdeaId?: string | null;
  postId?: string | null;
  angle?: string | null;
  takeaway?: string | null;
  requireAtomic?: boolean;
};

const RESERVE_ERROR_MESSAGES: Record<string, string> = {
  NOT_FOUND: "Content Bank source entry was not found.",
  ARCHIVED_ENTRY: "Archived content bank entries cannot be reserved or drafted.",
  SINGLE_USE_CONFLICT:
    "This entry is single-use and has already been reserved or used in a post. Enable reuse on this entry to draft another angle.",
};

/** PostgREST / Postgres codes for "this function does not exist (yet)". */
function isMissingFunctionError(error: { code?: string } | null): boolean {
  return error?.code === "PGRST202" || error?.code === "42883";
}

/**
 * Atomically reserves a Content Bank source entry for a draft, calendar slot, or newsletter.
 * The check and the insert run in one SQL function that holds a per-entry advisory lock, so a
 * concurrent calendar plan or standalone draft cannot also claim a single-use entry. If
 * allow_reuse is false and the entry has active usage (reserved, used, published), returns
 * SINGLE_USE_CONFLICT.
 */
export async function reserveSourceEntry(
  params: ReserveSourceParams,
  customClient?: SupabaseAnyClient,
): Promise<ReserveSourceResult> {
  const supabase = customClient ?? (await createClient());

  const { data, error } = await supabase.rpc("reserve_content_bank_source", {
    p_client_id: params.clientId,
    p_source_id: params.sourceId,
    p_source_type: params.sourceType,
    p_channel: params.channel ?? "linkedin_post",
    p_content_idea_id: params.contentIdeaId ?? null,
    p_post_id: params.postId ?? null,
    p_angle: params.angle ?? null,
    p_takeaway: params.takeaway ?? null,
  });

  if (isMissingFunctionError(error)) {
    if (params.requireAtomic) {
      return {
        ok: false,
        code: "RESERVATION_UNAVAILABLE",
        error: "Atomic source reservation is not available. Please contact an administrator before drafting this entry.",
      };
    }
    // The P05 migration has not been applied yet. Remove this fallback once it is
    // confirmed in every environment.
    return reserveSourceEntryWithoutLock(params, supabase);
  }

  const result = data as { ok?: boolean; code?: string; usage_id?: string } | null;

  if (error || !result) {
    return {
      ok: false,
      code: "RESERVATION_FAILED",
      error: "Failed to reserve the source entry.",
    };
  }

  if (result.ok && result.usage_id) {
    return { ok: true, usageId: result.usage_id };
  }

  const code = result.code ?? "RESERVATION_FAILED";
  return {
    ok: false,
    code,
    error: RESERVE_ERROR_MESSAGES[code] ?? "Failed to reserve the source entry.",
  };
}

/**
 * Pre-P05 behaviour: check, then insert, as separate statements. Not safe under
 * contention; kept only until the reserve_content_bank_source migration is applied.
 */
async function reserveSourceEntryWithoutLock(
  params: ReserveSourceParams,
  supabase: SupabaseAnyClient,
): Promise<ReserveSourceResult> {
  // 1. Verify existence, ownership, and readiness of source entry
  const table =
    params.sourceType === "founder_experience"
      ? "founder_experiences"
      : "content_resources";

  const { data: source, error: sourceError } = await supabase
    .from(table)
    .select("id, client_id, allow_reuse, readiness, deleted_at")
    .eq("id", params.sourceId)
    .eq("client_id", params.clientId)
    .is("deleted_at", null)
    .maybeSingle<{
      id: string;
      client_id: string;
      allow_reuse: boolean;
      readiness: string;
      deleted_at: string | null;
    }>();

  if (sourceError || !source) {
    return {
      ok: false,
      code: "NOT_FOUND",
      error: "Content Bank source entry was not found.",
    };
  }

  if (source.readiness === "archived") {
    return {
      ok: false,
      code: "ARCHIVED_ENTRY",
      error: "Archived content bank entries cannot be reserved or drafted.",
    };
  }

  // 2. Check single-use contention
  if (!source.allow_reuse) {
    const { data: activeUses, error: usageCheckError } = await supabase
      .from("source_usage")
      .select("id, status")
      .eq("client_id", params.clientId)
      .eq("source_id", params.sourceId)
      .in("status", ["reserved", "used", "published"]);

    if (usageCheckError) {
      return {
        ok: false,
        code: "QUERY_FAILED",
        error: "Could not verify source usage eligibility.",
      };
    }

    if (activeUses && activeUses.length > 0) {
      return {
        ok: false,
        code: "SINGLE_USE_CONFLICT",
        error:
          "This entry is single-use and has already been reserved or used in a post. Enable reuse on this entry to draft another angle.",
      };
    }
  }

  // 3. Insert reservation record
  const { data: newUsage, error: insertError } = await supabase
    .from("source_usage")
    .insert({
      client_id: params.clientId,
      source_id: params.sourceId,
      source_type: params.sourceType,
      channel: params.channel ?? "linkedin_post",
      status: "reserved",
      content_idea_id: params.contentIdeaId ?? null,
      post_id: params.postId ?? null,
      angle: params.angle ?? null,
      takeaway: params.takeaway ?? null,
    })
    .select("id")
    .single<{ id: string }>();

  if (insertError || !newUsage) {
    return {
      ok: false,
      code: "RESERVATION_FAILED",
      error: "Failed to reserve the source entry.",
    };
  }

  return { ok: true, usageId: newUsage.id };
}

/**
 * Commits a reservation to 'used' upon successful draft generation or assignment completion.
 */
export async function commitSourceUsage(
  params: {
    clientId: string;
    usageId?: string;
    sourceId?: string;
    postId?: string | null;
    contentIdeaId?: string | null;
  },
  customClient?: SupabaseAnyClient,
): Promise<{ ok: boolean }> {
  const supabase = customClient ?? (await createClient());

  let query = supabase
    .from("source_usage")
    .update({
      status: "used",
      post_id: params.postId ?? undefined,
      content_idea_id: params.contentIdeaId ?? undefined,
      updated_at: new Date().toISOString(),
    })
    .eq("client_id", params.clientId)
    .neq("status", "published"); // Never downgrade published records

  if (params.usageId) {
    query = query.eq("id", params.usageId);
  } else if (params.postId) {
    query = query.eq("post_id", params.postId);
  } else if (params.contentIdeaId) {
    query = query.eq("content_idea_id", params.contentIdeaId);
  } else if (params.sourceId) {
    query = query.eq("source_id", params.sourceId).eq("status", "reserved");
  } else {
    return { ok: false };
  }

  const { error } = await query;
  return { ok: !error };
}

/**
 * Releases a pending reservation if draft generation fails or assignment is cancelled.
 */
export async function releaseSourceReservation(
  params: {
    clientId: string;
    usageId?: string;
    sourceId?: string;
    postId?: string;
    contentIdeaId?: string;
  },
  customClient?: SupabaseAnyClient,
): Promise<{ ok: boolean }> {
  const supabase = customClient ?? (await createClient());

  let query = supabase
    .from("source_usage")
    .update({
      status: "cancelled",
      updated_at: new Date().toISOString(),
    })
    .eq("client_id", params.clientId)
    .eq("status", "reserved"); // Only cancel pending reservations

  if (params.usageId) {
    query = query.eq("id", params.usageId);
  } else if (params.postId) {
    query = query.eq("post_id", params.postId);
  } else if (params.contentIdeaId) {
    query = query.eq("content_idea_id", params.contentIdeaId);
  } else if (params.sourceId) {
    query = query.eq("source_id", params.sourceId);
  } else {
    return { ok: false };
  }

  const { error } = await query;
  return { ok: !error };
}

/** Link a still-pending direct assignment to its backing Idea. */
export async function linkSourceReservationToIdea(
  params: {
    clientId: string;
    usageId: string;
    sourceId: string;
    sourceType: SourceType;
    contentIdeaId: string;
  },
  customClient?: SupabaseAnyClient,
): Promise<{ ok: boolean }> {
  const supabase = customClient ?? (await createClient());
  const { data, error } = await supabase
    .from("source_usage")
    .update({
      content_idea_id: params.contentIdeaId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.usageId)
    .eq("client_id", params.clientId)
    .eq("source_id", params.sourceId)
    .eq("source_type", params.sourceType)
    .eq("channel", "linkedin_post")
    .eq("status", "reserved")
    .select("id")
    .maybeSingle<{ id: string }>();

  return { ok: !error && data?.id === params.usageId };
}

/** Confirm that generation still owns the exact source reservation it saved. */
export async function hasSourceReservationForIdea(
  params: {
    clientId: string;
    usageId: string;
    sourceId: string;
    sourceType: SourceType;
    contentIdeaId: string;
  },
  customClient?: SupabaseAnyClient,
): Promise<boolean> {
  const supabase = customClient ?? (await createClient());
  const { data, error } = await supabase
    .from("source_usage")
    .select("id")
    .eq("id", params.usageId)
    .eq("client_id", params.clientId)
    .eq("source_id", params.sourceId)
    .eq("source_type", params.sourceType)
    .eq("channel", "linkedin_post")
    .eq("content_idea_id", params.contentIdeaId)
    .eq("status", "reserved")
    .maybeSingle<{ id: string }>();

  return !error && data?.id === params.usageId;
}

/**
 * Commit one direct Content Bank assignment. Repeated success recovery is
 * idempotent only when the same usage row already points at the same post.
 */
export async function commitContentBankPostUsage(
  params: {
    clientId: string;
    usageId: string;
    sourceId: string;
    sourceType: SourceType;
    contentIdeaId: string;
    postId: string;
  },
  customClient?: SupabaseAnyClient,
): Promise<{ ok: boolean }> {
  const supabase = customClient ?? (await createClient());
  const { data, error } = await supabase
    .from("source_usage")
    .update({
      status: "used",
      post_id: params.postId,
      content_idea_id: params.contentIdeaId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.usageId)
    .eq("client_id", params.clientId)
    .eq("source_id", params.sourceId)
    .eq("source_type", params.sourceType)
    .eq("channel", "linkedin_post")
    .eq("content_idea_id", params.contentIdeaId)
    .eq("status", "reserved")
    .select("id")
    .maybeSingle<{ id: string }>();

  if (!error && data?.id === params.usageId) return { ok: true };
  if (error) return { ok: false };

  const existing = await supabase
    .from("source_usage")
    .select("id")
    .eq("id", params.usageId)
    .eq("client_id", params.clientId)
    .eq("source_id", params.sourceId)
    .eq("source_type", params.sourceType)
    .eq("channel", "linkedin_post")
    .eq("content_idea_id", params.contentIdeaId)
    .eq("post_id", params.postId)
    .in("status", ["used", "published"])
    .maybeSingle<{ id: string }>();

  return { ok: !existing.error && existing.data?.id === params.usageId };
}

/**
 * Marks source usage as published when an approved post is marked published.
 */
export async function markSourceUsagePublished(
  params: {
    clientId: string;
    postId: string;
  },
  customClient?: SupabaseAnyClient,
): Promise<{ ok: boolean }> {
  const supabase = customClient ?? (await createClient());

  const { error } = await supabase
    .from("source_usage")
    .update({
      status: "published",
      updated_at: new Date().toISOString(),
    })
    .eq("client_id", params.clientId)
    .eq("post_id", params.postId);

  return { ok: !error };
}

/**
 * Handles source usage state when an internal post is deleted or archived.
 * Invariant: Never erase published usage history merely by deleting an internal post.
 * If the post was published, its usage row is preserved with status 'published'.
 * If the post was an unpublished draft, its reservation/usage is marked 'cancelled'.
 */
export async function handlePostDeletionUsageCleanup(
  params: {
    clientId: string;
    postId: string;
    isPublished: boolean;
  },
  customClient?: SupabaseAnyClient,
): Promise<{ ok: boolean }> {
  const supabase = customClient ?? (await createClient());

  if (params.isPublished) {
    // Preserve published usage history; do not cancel or delete it
    return { ok: true };
  }

  // Unpublished draft: cancel active reservations/uses to free up single-use entries
  const { error } = await supabase
    .from("source_usage")
    .update({
      status: "cancelled",
      updated_at: new Date().toISOString(),
    })
    .eq("client_id", params.clientId)
    .eq("post_id", params.postId)
    .in("status", ["reserved", "used"]);

  return { ok: !error };
}

/**
 * Fetches usage history for a Content Bank entry.
 */
export async function getSourceUsageHistory(
  clientId: string,
  sourceId: string,
  customClient?: SupabaseAnyClient,
): Promise<SourceUsageRecord[]> {
  const supabase = customClient ?? (await createClient());

  const { data, error } = await supabase
    .from("source_usage")
    .select(
      "id, client_id, source_id, source_type, channel, status, content_idea_id, post_id, angle, takeaway, created_at, updated_at",
    )
    .eq("client_id", clientId)
    .eq("source_id", sourceId)
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    clientId: row.client_id,
    sourceId: row.source_id,
    sourceType: row.source_type,
    channel: row.channel,
    status: row.status,
    contentIdeaId: row.content_idea_id,
    postId: row.post_id,
    angle: row.angle,
    takeaway: row.takeaway,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}
