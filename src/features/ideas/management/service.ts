import "server-only";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUserRoleForClient } from "@/features/clients/invitations/queries";
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

const VIEWER_FORBIDDEN = {
  ok: false as const,
  code: "FORBIDDEN",
  message: "Your role is view-only for this client.",
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

  const role = await getCurrentUserRoleForClient(user.id, clientIdResult.data);
  if (!role) return { ok: false, failure: NO_ACCESS };
  if (role !== "owner" && role !== "editor") {
    return { ok: false, failure: VIEWER_FORBIDDEN };
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
