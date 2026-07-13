import "server-only";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { canAccessClient, canMutateClientWorkflow, canUserDeleteBusinessRecords } from "@/lib/access/client-access";
import { writeAuditLog } from "@/lib/audit/log";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/session";

import { founderDirectionRequestSchema } from "./schemas";

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

const uuidSchema = z.string().uuid();

const AUTH_REQUIRED = {
  ok: false as const,
  code: "AUTH_REQUIRED",
  message: "You must be signed in to continue.",
};

const INVALID_INPUT = {
  ok: false as const,
  code: "VALIDATION_ERROR",
  message: "Could not update this idea. Please try again.",
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

const IDEA_NOT_AVAILABLE = {
  ok: false as const,
  code: "NOT_FOUND",
  message: "This idea is not available.",
};

const GENERIC_FAILURE = {
  ok: false as const,
  code: "UNKNOWN_ERROR",
  message: "Could not update this idea. Please try again.",
};

type AuthorizedMutation =
  | { ok: true; userId: string; clientId: string; ideaId: string }
  | { ok: false; failure: ServiceResult<never> };

type IdeaDirectionRow = {
  id: string;
  founder_direction: string | null;
};

async function authorizeMutation(
  clientId: string,
  ideaId: string,
): Promise<AuthorizedMutation> {
  const { user } = await getServerUser();
  if (!user) return { ok: false, failure: AUTH_REQUIRED };

  const clientIdResult = uuidSchema.safeParse(clientId);
  const ideaIdResult = uuidSchema.safeParse(ideaId);

  if (!clientIdResult.success || !ideaIdResult.success) {
    return { ok: false, failure: INVALID_INPUT };
  }

  const hasAccess = await canAccessClient(user.id, clientIdResult.data);
  if (!hasAccess) return { ok: false, failure: NO_ACCESS };

  const canMutate = await canMutateClientWorkflow(user.id, clientIdResult.data);
  if (!canMutate) {
    return { ok: false, failure: WORKFLOW_FORBIDDEN };
  }

  return {
    ok: true,
    userId: user.id,
    clientId: clientIdResult.data,
    ideaId: ideaIdResult.data,
  };
}

export async function updateFounderDirection(
  clientId: string,
  ideaId: string,
  input: unknown,
): Promise<ServiceResult<Record<string, never>>> {
  const parsed = founderDirectionRequestSchema.safeParse(input);
  if (!parsed.success) return INVALID_INPUT;

  const auth = await authorizeMutation(clientId, ideaId);
  if (!auth.ok) return auth.failure;

  const supabase = await createClient();

  const { data: before, error: fetchError } = await supabase
    .from("content_ideas")
    .select("id, founder_direction")
    .eq("id", auth.ideaId)
    .eq("client_id", auth.clientId)
    .is("deleted_at", null)
    .maybeSingle<IdeaDirectionRow>();

  if (fetchError || !before) return IDEA_NOT_AVAILABLE;

  const nextDirection =
    parsed.data.founderDirection.length > 0
      ? parsed.data.founderDirection
      : null;

  const { data: after, error: updateError } = await supabase
    .from("content_ideas")
    .update({ founder_direction: nextDirection })
    .eq("id", auth.ideaId)
    .eq("client_id", auth.clientId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (updateError || !after) return GENERIC_FAILURE;

  await writeAuditLog({
    clientId: auth.clientId,
    userId: auth.userId,
    action: "content_idea_founder_direction_updated",
    entityType: "content_idea",
    entityId: auth.ideaId,
    metadata: {
      idea_id: auth.ideaId,
      previous_has_direction: Boolean(before.founder_direction),
      next_has_direction: Boolean(nextDirection),
    },
  });

  revalidatePath(`/client/${auth.clientId}/ideas`);

  return { ok: true, data: {} };
}

export async function archiveContentIdea(
  clientId: string,
  ideaId: string,
): Promise<ServiceResult<Record<string, never>>> {
  const auth = await authorizeMutation(clientId, ideaId);
  if (!auth.ok) return auth.failure;

  const supabase = await createClient();

  const { data: archived, error: archiveError } = await supabase
    .from("content_ideas")
    .update({
      status: "archived",
      deleted_at: new Date().toISOString(),
    })
    .eq("id", auth.ideaId)
    .eq("client_id", auth.clientId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (archiveError || !archived) return IDEA_NOT_AVAILABLE;

  await writeAuditLog({
    clientId: auth.clientId,
    userId: auth.userId,
    action: "content_idea_archived",
    entityType: "content_idea",
    entityId: auth.ideaId,
    metadata: { idea_id: auth.ideaId },
  });

  revalidatePath(`/client/${auth.clientId}/ideas`);

  return { ok: true, data: {} };
}

export async function deleteContentIdea(
  clientId: string,
  ideaId: string,
): Promise<ServiceResult<void>> {
  const { user } = await getServerUser();
  if (!user) return { ok: false, code: "AUTH_REQUIRED", message: "You must be signed in to continue." };

  const clientIdResult = uuidSchema.safeParse(clientId);
  const ideaIdResult = uuidSchema.safeParse(ideaId);
  if (!clientIdResult.success || !ideaIdResult.success) {
    return { ok: false, code: "VALIDATION_ERROR", message: "Invalid parameters." };
  }

  const isAuthorized = await canUserDeleteBusinessRecords(user.id, clientIdResult.data);
  if (!isAuthorized) return { ok: false, code: "FORBIDDEN", message: "You do not have permission to delete ideas for this Client Workspace." };

  const supabase = await createClient();

  const { data: idea, error: fetchError } = await supabase
    .from("content_ideas")
    .select("id, source_type, status")
    .eq("id", ideaIdResult.data)
    .eq("client_id", clientIdResult.data)
    .is("deleted_at", null)
    .maybeSingle();

  if (fetchError || !idea) {
    return { ok: false, code: "NOT_FOUND", message: "Content Idea not found." };
  }

  const { count: postCount, error: postError } = await supabase
    .from("posts")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientIdResult.data)
    .eq("content_idea_id", ideaIdResult.data)
    .is("deleted_at", null);

  if (postError) {
    return { ok: false, code: "UNKNOWN_ERROR", message: "Could not perform dependency check." };
  }

  if ((postCount ?? 0) > 0) {
    return {
      ok: false,
      code: "DEPENDENCY_CONFLICT",
      message: "This Content Idea cannot be deleted because a Post was generated from it. Delete the Post first.",
    };
  }

  const { data: deleted, error: deleteError } = await supabase
    .from("content_ideas")
    .delete()
    .eq("id", ideaIdResult.data)
    .eq("client_id", clientIdResult.data)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (deleteError || !deleted) {
    return { ok: false, code: "UNKNOWN_ERROR", message: "Could not delete this Content Idea. Please try again." };
  }

  await writeAuditLog({
    clientId: clientIdResult.data,
    userId: user.id,
    action: "content_idea_hard_deleted",
    entityType: "content_idea",
    entityId: ideaIdResult.data,
    metadata: {
      idea_id: ideaIdResult.data,
      source_type: idea.source_type,
      previous_status: idea.status,
    },
  });

  revalidatePath(`/client/${clientIdResult.data}/ideas`);
  revalidatePath(`/client/${clientIdResult.data}/posts`);
  revalidatePath(`/client/${clientIdResult.data}/dashboard`);

  return { ok: true, data: undefined };
}
