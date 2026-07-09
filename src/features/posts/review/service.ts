import "server-only";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUserRoleForClient } from "@/features/clients/invitations/queries";
import { writeAuditLog } from "@/lib/audit/log";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/session";

import { needsEditRequestSchema } from "./schemas";
import type { ReviewPostStatus } from "./queries";

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

type PostAction = "approve" | "needs_edit" | "reject" | "archive";

type PostStatusRow = {
  id: string;
  status: ReviewPostStatus;
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

const VIEWER_FORBIDDEN = {
  ok: false as const,
  code: "FORBIDDEN",
  message: "Your role is view-only for this client.",
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

type AuthorizedMutation =
  | { ok: true; userId: string; clientId: string; postId: string }
  | { ok: false; failure: ServiceResult<never> };

async function authorizeMutation(
  clientId: string,
  postId: string,
): Promise<AuthorizedMutation> {
  const { user } = await getServerUser();
  if (!user) return { ok: false, failure: AUTH_REQUIRED };

  const clientIdResult = uuidSchema.safeParse(clientId);
  const postIdResult = uuidSchema.safeParse(postId);
  if (!clientIdResult.success || !postIdResult.success) {
    return { ok: false, failure: INVALID_INPUT };
  }

  const role = await getCurrentUserRoleForClient(user.id, clientIdResult.data);
  if (!role) return { ok: false, failure: NO_ACCESS };
  if (role !== "owner" && role !== "editor") {
    return { ok: false, failure: VIEWER_FORBIDDEN };
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
    .select("id, status")
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
    entityType: "post",
    entityId: input.postId,
    metadata: {
      post_id: input.postId,
      previous_status: input.previousStatus,
      next_status: input.nextStatus,
      ...(typeof input.hasEditNote === "boolean"
        ? { has_edit_note: input.hasEditNote }
        : {}),
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
  editNote?: string;
}): Promise<ServiceResult<Record<string, never>>> {
  const supabase = await createClient();
  const update: {
    status: ReviewPostStatus;
    approved_at?: string;
    edit_note?: string;
  } = { status: input.nextStatus };

  if (input.nextStatus === "approved") {
    update.approved_at = new Date().toISOString();
  }

  if (typeof input.editNote === "string") {
    update.edit_note = input.editNote;
  }

  const { data, error } = await supabase
    .from("posts")
    .update(update)
    .eq("id", input.postId)
    .eq("client_id", input.clientId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error || !data) return GENERIC_FAILURE;

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
  const auth = await authorizeMutation(clientId, postId);
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
): Promise<ServiceResult<Record<string, never>>> {
  const result = await getAuthorizedPostForAction(clientId, postId, "approve");
  if (!result.ok) return result.failure;

  return updatePostStatus({
    clientId: result.auth.clientId,
    userId: result.auth.userId,
    postId: result.auth.postId,
    previousStatus: result.post.status,
    nextStatus: "approved",
    action: "post_approved",
  });
}

export async function markPostNeedsEdit(
  clientId: string,
  postId: string,
  input: unknown,
): Promise<ServiceResult<Record<string, never>>> {
  const parsed = needsEditRequestSchema.safeParse(input);
  if (!parsed.success) return INVALID_INPUT;

  const result = await getAuthorizedPostForAction(
    clientId,
    postId,
    "needs_edit",
  );
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
): Promise<ServiceResult<Record<string, never>>> {
  const result = await getAuthorizedPostForAction(clientId, postId, "reject");
  if (!result.ok) return result.failure;

  return updatePostStatus({
    clientId: result.auth.clientId,
    userId: result.auth.userId,
    postId: result.auth.postId,
    previousStatus: result.post.status,
    nextStatus: "rejected",
    action: "post_rejected",
  });
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

  revalidatePath(`/client/${result.auth.clientId}/publish`);
  revalidatePath(
    `/client/${result.auth.clientId}/posts/${result.auth.postId}/review`,
  );

  return { ok: true, data: {} };
}
