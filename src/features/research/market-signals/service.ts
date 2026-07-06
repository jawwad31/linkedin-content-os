import "server-only";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUserRoleForClient } from "@/features/clients/invitations/queries";
import { writeAuditLog } from "@/lib/audit/log";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerUser } from "@/lib/supabase/session";

import { founderTakeInputSchema } from "./schemas";

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

const uuidSchema = z.string().uuid();

const SIGNAL_ERROR_COPY = "Could not update this Market Signal. Please try again.";

const AUTH_REQUIRED = {
  ok: false as const,
  code: "AUTH_REQUIRED",
  message: "You must be signed in to continue.",
};

const INVALID_INPUT = {
  ok: false as const,
  code: "VALIDATION_ERROR",
  message: SIGNAL_ERROR_COPY,
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

const NOT_FOUND = {
  ok: false as const,
  code: "NOT_FOUND",
  message: SIGNAL_ERROR_COPY,
};

const GENERIC_FAILURE = {
  ok: false as const,
  code: "UNKNOWN_ERROR",
  message: SIGNAL_ERROR_COPY,
};

type AuthorizedMutation =
  | { ok: true; userId: string; clientId: string }
  | { ok: false; failure: ServiceResult<never> };

/**
 * Application-level auth is the primary gate here (not RLS): authenticated
 * user, accepted client access, owner/editor role.
 *
 * market_signals had its owner/editor insert/update RLS policies dropped
 * (Feature 18 security correction — see
 * supabase/migrations/20260706140000_market_signals_rls_tighten.sql). Only
 * the service role can write to this table now, so every mutation below
 * uses createAdminClient() instead of the session-bound client, with this
 * check standing in for the RLS backstop that no longer exists for writes.
 */
async function authorizeMutation(clientId: string): Promise<AuthorizedMutation> {
  const { user } = await getServerUser();
  if (!user) return { ok: false, failure: AUTH_REQUIRED };

  const clientIdResult = uuidSchema.safeParse(clientId);
  if (!clientIdResult.success) return { ok: false, failure: INVALID_INPUT };

  const role = await getCurrentUserRoleForClient(user.id, clientIdResult.data);
  if (!role) return { ok: false, failure: NO_ACCESS };
  if (role !== "owner" && role !== "editor") {
    return { ok: false, failure: VIEWER_FORBIDDEN };
  }

  return { ok: true, userId: user.id, clientId: clientIdResult.data };
}

export async function saveFounderTake(
  clientId: string,
  signalId: string,
  founderTakeInput: string,
): Promise<ServiceResult<{ id: string; founderTake: string | null }>> {
  const signalIdResult = uuidSchema.safeParse(signalId);
  if (!signalIdResult.success) return INVALID_INPUT;

  const parsed = founderTakeInputSchema.safeParse({
    founderTake: founderTakeInput,
  });
  if (!parsed.success) return INVALID_INPUT;

  const auth = await authorizeMutation(clientId);
  if (!auth.ok) return auth.failure;

  const admin = createAdminClient();

  const { data: before, error: fetchError } = await admin
    .from("market_signals")
    .select("id, founder_take")
    .eq("id", signalIdResult.data)
    .eq("client_id", auth.clientId)
    .is("deleted_at", null)
    .maybeSingle<{ id: string; founder_take: string | null }>();

  if (fetchError || !before) return NOT_FOUND;

  const nextFounderTake =
    parsed.data.founderTake.length > 0 ? parsed.data.founderTake : null;

  const { data: after, error: updateError } = await admin
    .from("market_signals")
    .update({ founder_take: nextFounderTake })
    .eq("id", signalIdResult.data)
    .eq("client_id", auth.clientId)
    .is("deleted_at", null)
    .select("id, founder_take")
    .maybeSingle<{ id: string; founder_take: string | null }>();

  if (updateError || !after) return GENERIC_FAILURE;

  await writeAuditLog({
    clientId: auth.clientId,
    userId: auth.userId,
    action: before.founder_take ? "founder_take_updated" : "founder_take_added",
    entityType: "market_signal",
    entityId: signalIdResult.data,
  });

  revalidatePath(`/client/${auth.clientId}/research`);

  return { ok: true, data: { id: after.id, founderTake: after.founder_take } };
}

export async function approveMarketSignalForIdeas(
  clientId: string,
  signalId: string,
): Promise<ServiceResult<{ id: string; approvedForIdeas: boolean }>> {
  const signalIdResult = uuidSchema.safeParse(signalId);
  if (!signalIdResult.success) return INVALID_INPUT;

  const auth = await authorizeMutation(clientId);
  if (!auth.ok) return auth.failure;

  const admin = createAdminClient();

  const { data: before, error: fetchError } = await admin
    .from("market_signals")
    .select("id, approved_for_ideas")
    .eq("id", signalIdResult.data)
    .eq("client_id", auth.clientId)
    .is("deleted_at", null)
    .maybeSingle<{ id: string; approved_for_ideas: boolean }>();

  if (fetchError || !before) return NOT_FOUND;

  if (before.approved_for_ideas) {
    return { ok: true, data: { id: before.id, approvedForIdeas: true } };
  }

  const { data: after, error: updateError } = await admin
    .from("market_signals")
    .update({ approved_for_ideas: true })
    .eq("id", signalIdResult.data)
    .eq("client_id", auth.clientId)
    .is("deleted_at", null)
    .select("id, approved_for_ideas")
    .maybeSingle<{ id: string; approved_for_ideas: boolean }>();

  if (updateError || !after) return GENERIC_FAILURE;

  await writeAuditLog({
    clientId: auth.clientId,
    userId: auth.userId,
    action: "market_signal_approved_for_ideas",
    entityType: "market_signal",
    entityId: signalIdResult.data,
  });

  revalidatePath(`/client/${auth.clientId}/research`);

  return {
    ok: true,
    data: { id: after.id, approvedForIdeas: after.approved_for_ideas },
  };
}
