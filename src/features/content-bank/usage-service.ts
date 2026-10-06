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

/**
 * Atomically reserves a Content Bank source entry for a draft, calendar slot, or newsletter.
 * If allow_reuse is false, checks for any existing active usage (reserved, used, published)
 * and returns SINGLE_USE_CONFLICT if already claimed.
 */
export async function reserveSourceEntry(
  params: {
    clientId: string;
    sourceId: string;
    sourceType: SourceType;
    channel?: UsageChannel;
    contentIdeaId?: string | null;
    postId?: string | null;
    angle?: string | null;
    takeaway?: string | null;
  },
  customClient?: SupabaseAnyClient,
): Promise<ReserveSourceResult> {
  const supabase = customClient ?? (await createClient());

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
