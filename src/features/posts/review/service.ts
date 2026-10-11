import "server-only";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  canAccessClient,
  canManageWorkflowReview,
  canPublishPosts,
  canReviewPosts,
} from "@/lib/access/client-access";
import { writeAuditLog } from "@/lib/audit/log";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/session";

import {
  approvePostRequestSchema,
  editPostRequestSchema,
  markPublishedRequestSchema,
  needsEditRequestSchema,
  rejectPostRequestSchema,
} from "./schemas";
import type { ReviewPostStatus } from "./queries";
import {
  handlePostDeletionUsageCleanup,
  markSourceUsagePublished,
} from "@/features/content-bank/usage-service";

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

type PostAction = "approve" | "needs_edit" | "reject" | "archive";

type PostStatusRow = {
  id: string;
  status: ReviewPostStatus;
  draft_version?: number;
  approved_draft_version?: number | null;
  final_post?: string;
};

const uuidSchema = z.string().uuid();

const AUTH_REQUIRED = {
  ok: false as const,
  code: "AUTH_REQUIRED",
  message: "You must be signed in to continue.",
};

const INVALID_INPUT = {
  ok: false as const,
  code: "VALIDATION_ERROR",
  message: "Could not update this post. Please try again.",
};

const NO_ACCESS = {
  ok: false as const,
  code: "FORBIDDEN",
  message: "You do not have access to this client.",
};

const REVIEW_FORBIDDEN = {
  ok: false as const,
  code: "FORBIDDEN",
  message: "You do not have permission to perform this Post action.",
};

const POST_NOT_AVAILABLE = {
  ok: false as const,
  code: "NOT_FOUND",
  message: "This post is not available.",
};

const GENERIC_FAILURE = {
  ok: false as const,
  code: "UNKNOWN_ERROR",
  message: "Could not update this post. Please try again.",
};

const ONLY_APPROVED_CAN_PUBLISH = {
  ok: false as const,
  code: "VALIDATION_ERROR",
  message: "Only approved posts can be marked as published.",
};

const STALE_VERSION = {
  ok: false as const,
  code: "STALE_VERSION",
  message: "This post changed while you were looking at it. Reload to see the latest version.",
};

const NOT_EDITABLE = {
  ok: false as const,
  code: "INVALID_STATE",
  message: "A published or rejected post cannot be edited.",
};

/** The code PostgREST and Postgres return when a column does not exist yet. */
function isMissingColumn(error: { code?: string } | null): boolean {
  return error?.code === "42703" || error?.code === "PGRST204";
}

const STALE_APPROVAL = {
  ok: false as const,
  code: "STALE_APPROVAL",
  message: "This post draft was modified after approval. Renewed review is required.",
};

type AuthorizedMutation =
  | { ok: true; userId: string; clientId: string; postId: string }
  | { ok: false; failure: ServiceResult<never> };

async function authorizeMutation(
  clientId: string,
  postId: string,
  permission: "review" | "publish" | "archive",
): Promise<AuthorizedMutation> {
  const { user } = await getServerUser();
  if (!user) return { ok: false, failure: AUTH_REQUIRED };

  const clientIdResult = uuidSchema.safeParse(clientId);
  const postIdResult = uuidSchema.safeParse(postId);
  if (!clientIdResult.success || !postIdResult.success) {
    return { ok: false, failure: INVALID_INPUT };
  }

  const hasAccess = await canAccessClient(user.id, clientIdResult.data);
  if (!hasAccess) return { ok: false, failure: NO_ACCESS };

  const allowed =
    permission === "review"
      ? await canReviewPosts(user.id, clientIdResult.data)
      : permission === "publish"
        ? await canPublishPosts(user.id, clientIdResult.data)
        : await canManageWorkflowReview(user.id, clientIdResult.data);
  if (!allowed) {
    return { ok: false, failure: REVIEW_FORBIDDEN };
  }

  return {
    ok: true,
    userId: user.id,
    clientId: clientIdResult.data,
    postId: postIdResult.data,
  };
}

async function getPostStatus(
  clientId: string,
  postId: string,
): Promise<PostStatusRow | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("posts")
    .select("id, status, draft_version, approved_draft_version, final_post")
    .eq("id", postId)
    .eq("client_id", clientId)
    .is("deleted_at", null)
    .maybeSingle<PostStatusRow>();

  if (error || !data) return null;
  return data;
}

function canApplyAction(status: ReviewPostStatus, action: PostAction): boolean {
  if (action === "approve") return status === "review" || status === "needs_edit";
  if (action === "needs_edit") return status === "review";
  if (action === "reject") return status === "review" || status === "needs_edit";
  return status === "review" || status === "needs_edit" || status === "rejected";
}

async function auditPostStatusChange(input: {
  clientId: string;
  userId: string;
  postId: string;
  action: string;
  previousStatus: ReviewPostStatus;
  nextStatus: ReviewPostStatus | "archived";
  hasEditNote?: boolean;
}) {
  await writeAuditLog({
    clientId: input.clientId,
    userId: input.userId,
    action: input.action,
    metadata: {
      postId: input.postId,
      previousStatus: input.previousStatus,
      nextStatus: input.nextStatus,
      hasEditNote: input.hasEditNote,
    },
  });
}

async function updatePostStatus(input: {
  clientId: string;
  userId: string;
  postId: string;
  previousStatus: ReviewPostStatus;
  nextStatus: ReviewPostStatus;
  action: string;
  editNote?: string | null;
  approvedDraftVersion?: number;
}): Promise<ServiceResult<Record<string, never>>> {
  const supabase = await createClient();
  const approvedBy = input.nextStatus === "approved" ? input.userId : null;

  const updates: Record<string, unknown> = {
    status: input.nextStatus,
    updated_at: new Date().toISOString(),
  };

  if (input.nextStatus === "needs_edit") {
    updates.edit_note = input.editNote ?? null;
  }

  if (input.nextStatus === "approved") {
    updates.approved_at = new Date().toISOString();
    if (input.approvedDraftVersion) {
      updates.approved_draft_version = input.approvedDraftVersion;
    }
  }

  const run = (withApprover: boolean) => {
    let query = supabase
      .from("posts")
      .update(withApprover && approvedBy ? { ...updates, approved_by: approvedBy } : updates)
      .eq("id", input.postId)
      .eq("client_id", input.clientId)
      .is("deleted_at", null);
    // Approval is atomic with the version the reviewer read: if the draft moved on,
    // no row matches and nothing is approved.
    if (input.nextStatus === "approved" && input.approvedDraftVersion) {
      query = query.eq("draft_version", input.approvedDraftVersion);
    }
    return query.select("id").maybeSingle<{ id: string }>();
  };

  let { data, error } = await run(true);
  // Before the approver column exists, approve without recording who did.
  if (isMissingColumn(error) && approvedBy) ({ data, error } = await run(false));

  if (error) return GENERIC_FAILURE;
  if (!data) return input.nextStatus === "approved" ? STALE_VERSION : GENERIC_FAILURE;

  await auditPostStatusChange({
    clientId: input.clientId,
    userId: input.userId,
    postId: input.postId,
    action: input.action,
    previousStatus: input.previousStatus,
    nextStatus: input.nextStatus,
    hasEditNote:
      input.nextStatus === "needs_edit" ? Boolean(input.editNote) : undefined,
  });

  revalidatePath(`/client/${input.clientId}/publish`);
  revalidatePath(`/client/${input.clientId}/posts/${input.postId}/review`);

  return { ok: true, data: {} };
}

async function getAuthorizedPostForAction(
  clientId: string,
  postId: string,
  action: PostAction,
): Promise<
  | { ok: true; auth: Extract<AuthorizedMutation, { ok: true }>; post: PostStatusRow }
  | { ok: false; failure: ServiceResult<never> }
> {
  const auth = await authorizeMutation(
    clientId,
    postId,
    action === "archive" ? "archive" : "review",
  );
  if (!auth.ok) return { ok: false, failure: auth.failure };

  const post = await getPostStatus(auth.clientId, auth.postId);
  if (!post || !canApplyAction(post.status, action)) {
    return { ok: false, failure: POST_NOT_AVAILABLE };
  }

  return { ok: true, auth, post };
}

export async function approvePost(
  clientId: string,
  postId: string,
  input: unknown,
): Promise<ServiceResult<Record<string, never>>> {
  const parsed = approvePostRequestSchema.safeParse(input);
  if (!parsed.success) return INVALID_INPUT;

  const result = await getAuthorizedPostForAction(clientId, postId, "approve");
  if (!result.ok) return result.failure;

  // Approval applies to the version the reviewer read, never to a newer one.
  if ((result.post.draft_version ?? 1) !== parsed.data.version) return STALE_VERSION;

  return updatePostStatus({
    clientId: result.auth.clientId,
    userId: result.auth.userId,
    postId: result.auth.postId,
    previousStatus: result.post.status,
    nextStatus: "approved",
    action: "post_approved",
    approvedDraftVersion: parsed.data.version,
  });
}

export async function markPostNeedsEdit(
  clientId: string,
  postId: string,
  input: unknown,
): Promise<ServiceResult<Record<string, never>>> {
  const parsed = needsEditRequestSchema.safeParse(input);
  if (!parsed.success) return INVALID_INPUT;

  const result = await getAuthorizedPostForAction(clientId, postId, "needs_edit");
  if (!result.ok) return result.failure;

  return updatePostStatus({
    clientId: result.auth.clientId,
    userId: result.auth.userId,
    postId: result.auth.postId,
    previousStatus: result.post.status,
    nextStatus: "needs_edit",
    action: "post_marked_needs_edit",
    editNote: parsed.data.editNote,
  });
}

export async function rejectPost(
  clientId: string,
  postId: string,
  input: unknown,
): Promise<ServiceResult<Record<string, never>>> {
  const parsed = rejectPostRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { ...INVALID_INPUT, message: parsed.error.issues[0]?.message ?? INVALID_INPUT.message };
  }

  const result = await getAuthorizedPostForAction(clientId, postId, "reject");
  if (!result.ok) return result.failure;

  // One transaction: record the note, reject the post and free its unpublished
  // reservation, so a single-use entry is never left held by a rejected post.
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reject_post", {
    p_client_id: result.auth.clientId,
    p_post_id: result.auth.postId,
    p_note: parsed.data.note,
  });
  const outcome = data as { ok?: boolean; code?: string; freed?: number } | null;
  if (error || !outcome) return GENERIC_FAILURE;
  if (!outcome.ok) {
    if (outcome.code === "FORBIDDEN") return REVIEW_FORBIDDEN;
    if (outcome.code === "NOT_FOUND" || outcome.code === "INVALID_STATE") return POST_NOT_AVAILABLE;
    if (outcome.code === "VALIDATION_ERROR") return INVALID_INPUT;
    return GENERIC_FAILURE;
  }

  await writeAuditLog({
    clientId: result.auth.clientId,
    userId: result.auth.userId,
    action: "post_rejected",
    metadata: {
      postId: result.auth.postId,
      previousStatus: result.post.status,
      nextStatus: "rejected",
      hasEditNote: true,
      entriesFreed: outcome.freed ?? 0,
    },
  });

  revalidatePath(`/client/${result.auth.clientId}/publish`);
  revalidatePath(`/client/${result.auth.clientId}/posts/${result.auth.postId}/review`);
  revalidatePath(`/client/${result.auth.clientId}/posts`);
  revalidatePath(`/client/${result.auth.clientId}/content-bank`);
  revalidatePath(`/client/${result.auth.clientId}/calendar`);

  return { ok: true, data: {} };
}

export async function archivePost(
  clientId: string,
  postId: string,
): Promise<ServiceResult<Record<string, never>>> {
  const result = await getAuthorizedPostForAction(clientId, postId, "archive");
  if (!result.ok) return result.failure;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("posts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", result.auth.postId)
    .eq("client_id", result.auth.clientId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error || !data) return GENERIC_FAILURE;

  await auditPostStatusChange({
    clientId: result.auth.clientId,
    userId: result.auth.userId,
    postId: result.auth.postId,
    action: "post_archived",
    previousStatus: result.post.status,
    nextStatus: "archived",
  });

  await handlePostDeletionUsageCleanup({
    clientId: result.auth.clientId,
    postId: result.auth.postId,
    isPublished: result.post.status === "published",
  });

  revalidatePath(`/client/${result.auth.clientId}/publish`);
  revalidatePath(
    `/client/${result.auth.clientId}/posts/${result.auth.postId}/review`,
  );

  return { ok: true, data: {} };
}

export async function markPostPublished(
  clientId: string,
  postId: string,
  input: unknown,
): Promise<ServiceResult<Record<string, never>>> {
  const parsed = markPublishedRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { ...INVALID_INPUT, message: parsed.error.issues[0]?.message ?? INVALID_INPUT.message };
  }

  // A date a day ahead of UTC covers every timezone; later than that is a typo.
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const publishedAt = new Date(`${parsed.data.publishedOn}T12:00:00.000Z`);
  if (Number.isNaN(publishedAt.getTime()) || parsed.data.publishedOn > tomorrow) {
    return { ...INVALID_INPUT, message: "Choose the day the post was published; it cannot be in the future." };
  }

  const auth = await authorizeMutation(clientId, postId, "publish");
  if (!auth.ok) return auth.failure;

  const post = await getPostStatus(auth.clientId, auth.postId);
  if (!post) return POST_NOT_AVAILABLE;
  if (post.status !== "approved") return ONLY_APPROVED_CAN_PUBLISH;

  // Stale approval guard: if post draft version changed after approval, block publication
  if (
    post.approved_draft_version &&
    post.draft_version &&
    post.approved_draft_version !== post.draft_version
  ) {
    return STALE_APPROVAL;
  }

  const supabase = await createClient();
  const run = (withUrl: boolean) =>
    supabase
      .from("posts")
      .update({
        status: "published",
        published_at: publishedAt.toISOString(),
        ...(withUrl && parsed.data.linkedinUrl ? { linkedin_url: parsed.data.linkedinUrl } : {}),
      })
      .eq("id", auth.postId)
      .eq("client_id", auth.clientId)
      .eq("status", "approved")
      .is("deleted_at", null)
      .select("id")
      .maybeSingle<{ id: string }>();

  let { data, error } = await run(true);
  if (isMissingColumn(error) && parsed.data.linkedinUrl) ({ data, error } = await run(false));

  if (error || !data) return GENERIC_FAILURE;

  await markSourceUsagePublished({
    clientId: auth.clientId,
    postId: auth.postId,
  });

  await auditPostStatusChange({
    clientId: auth.clientId,
    userId: auth.userId,
    postId: auth.postId,
    action: "post_marked_published",
    previousStatus: post.status,
    nextStatus: "published",
  });

  revalidatePath(`/client/${auth.clientId}/publish`);
  revalidatePath(`/client/${auth.clientId}/posts`);
  revalidatePath(`/client/${auth.clientId}/posts/${auth.postId}/review`);

  return { ok: true, data: {} };
}

/**
 * Updates post draft content or editorial brief fields.
 * Invariant: Any edit to operative content or brief invalidates prior approval,
 * resetting status to 'review' and requiring renewed review.
 */
export async function editPostContent(
  clientId: string,
  postId: string,
  input: unknown,
): Promise<ServiceResult<{ postId: string; approvalInvalidated: boolean; version: number }>> {
  const auth = await authorizeMutation(clientId, postId, "review");
  if (!auth.ok) return auth.failure;

  const parsed = editPostRequestSchema.safeParse(input);
  if (!parsed.success) return INVALID_INPUT;
  const { expectedVersion, ...changes } = parsed.data;

  const post = await getPostStatus(auth.clientId, auth.postId);
  if (!post) return POST_NOT_AVAILABLE;
  if (post.status === "published" || post.status === "rejected") return NOT_EDITABLE;

  // The editor names the version it opened; a newer one is never overwritten.
  const currentVersion = post.draft_version ?? 1;
  if (currentVersion !== expectedVersion) return STALE_VERSION;

  const wasApproved = post.status === "approved";
  const nextDraftVersion = currentVersion + 1;

  const updates: Record<string, unknown> = {
    draft_version: nextDraftVersion,
    updated_at: new Date().toISOString(),
  };

  if (changes.finalPost !== undefined) updates.final_post = changes.finalPost;
  if (changes.postType !== undefined) updates.post_type = changes.postType;
  if (changes.funnelStage !== undefined) updates.funnel_stage = changes.funnelStage;
  if (changes.intendedReader !== undefined) updates.intended_reader = changes.intendedReader;
  if (changes.primaryTakeaway !== undefined) updates.primary_takeaway = changes.primaryTakeaway;
  if (changes.contentPillar !== undefined) updates.content_pillar = changes.contentPillar;

  // If currently approved, invalidate approval and revert to review!
  if (wasApproved) {
    updates.status = "review";
    updates.approved_at = null;
    updates.approved_draft_version = null;
  }

  const supabase = await createClient();
  const run = (withEditor: boolean) =>
    supabase
      .from("posts")
      .update(withEditor ? { ...updates, last_edited_by: auth.userId } : updates)
      .eq("id", auth.postId)
      .eq("client_id", auth.clientId)
      .eq("draft_version", currentVersion)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle<{ id: string }>();

  let { data, error } = await run(true);
  if (isMissingColumn(error)) ({ data, error } = await run(false));

  if (error) return GENERIC_FAILURE;
  if (!data) return STALE_VERSION;

  await writeAuditLog({
    clientId: auth.clientId,
    userId: auth.userId,
    action: wasApproved
      ? "post_edited_approval_invalidated"
      : "post_content_edited",
    metadata: {
      postId: auth.postId,
      previousVersion: currentVersion,
      newVersion: nextDraftVersion,
      approvalInvalidated: wasApproved,
      editedFields: Object.keys(changes),
    },
  });

  revalidatePath(`/client/${auth.clientId}/posts/${auth.postId}/review`);
  revalidatePath(`/client/${auth.clientId}/posts`);
  revalidatePath(`/client/${auth.clientId}/publish`);

  return {
    ok: true,
    data: {
      postId: auth.postId,
      approvalInvalidated: wasApproved,
      version: nextDraftVersion,
    },
  };
}
