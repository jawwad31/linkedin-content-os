import "server-only";

import { z } from "zod";

import { canManageClientUsers } from "@/lib/access/client-access";
import { writeAuditLog } from "@/lib/audit/log";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/session";

import { createInvitationSchema } from "./schemas";

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

const uuidSchema = z.string().uuid();

const AUTH_REQUIRED = {
  ok: false as const,
  code: "AUTH_REQUIRED",
  message: "You must be signed in to continue.",
};

const GENERIC_FAILURE = {
  ok: false as const,
  code: "UNKNOWN_ERROR",
  message: "Something went wrong. Please try again.",
};

const CANNOT_MANAGE_USERS = {
  ok: false as const,
  code: "FORBIDDEN",
  message: "You do not have permission to manage users for this Client Workspace.",
};

const INVITE_NOT_FOUND = {
  ok: false as const,
  code: "NOT_FOUND",
  message: "This invitation could not be found or has already been used.",
};

export type CreatedInvitation = {
  id: string;
  clientId: string;
  invitedEmail: string;
  role: string;
  invitationStatus: string;
  createdAt: string;
  manualInstructions: string;
};

export async function createInvitation(
  clientId: string,
  input: unknown,
): Promise<ServiceResult<CreatedInvitation>> {
  const { user } = await getServerUser();
  if (!user) return AUTH_REQUIRED;

  const clientIdResult = uuidSchema.safeParse(clientId);
  if (!clientIdResult.success) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "This Client Workspace could not be found.",
    };
  }

  const parsed = createInvitationSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: parsed.error.issues[0]?.message ?? "Invalid invitation details.",
    };
  }

  const canManage = await canManageClientUsers(user.id, clientIdResult.data);
  if (!canManage) return CANNOT_MANAGE_USERS;

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("client_access")
    .insert({
      client_id: clientIdResult.data,
      invited_email: parsed.data.invitedEmail,
      role: parsed.data.role,
      invitation_status: "pending",
      invited_by_user_id: user.id,
    })
    .select("id, client_id, invited_email, role, invitation_status, created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        code: "DUPLICATE_INVITE",
        message: "An invitation for this email is already pending.",
      };
    }

    return GENERIC_FAILURE;
  }

  await writeAuditLog({
    clientId: data.client_id,
    userId: user.id,
    action: "user_invited",
    entityType: "client_access",
    entityId: data.id,
    metadata: { invited_email: data.invited_email, role: data.role },
  });

  return {
    ok: true,
    data: {
      id: data.id,
      clientId: data.client_id,
      invitedEmail: data.invited_email,
      role: data.role,
      invitationStatus: data.invitation_status,
      createdAt: data.created_at,
      manualInstructions:
        "Invitation record created. Manually send this user the invite instructions.",
    },
  };
}

export type AcceptedInvitation = {
  id: string;
  clientId: string;
  role: string;
};

export async function acceptInvitation(
  inviteId: string,
): Promise<ServiceResult<AcceptedInvitation>> {
  const { user } = await getServerUser();
  if (!user) return AUTH_REQUIRED;

  const inviteIdResult = uuidSchema.safeParse(inviteId);
  if (!inviteIdResult.success) return INVITE_NOT_FOUND;

  const supabase = await createClient();

  const { data: inviteRow, error: fetchError } = await supabase
    .from("client_access")
    .select("id, client_id, invited_email, user_id, invitation_status")
    .eq("id", inviteIdResult.data)
    .maybeSingle();

  if (fetchError || !inviteRow) return INVITE_NOT_FOUND;

  const callerEmail = (user.email ?? "").toLowerCase();
  const invitedEmail = (inviteRow.invited_email ?? "").toLowerCase();

  const canClaim =
    inviteRow.invitation_status === "pending" &&
    inviteRow.user_id === null &&
    invitedEmail.length > 0 &&
    invitedEmail === callerEmail;

  if (!canClaim) return INVITE_NOT_FOUND;

  const { data, error } = await supabase
    .from("client_access")
    .update({
      user_id: user.id,
      invitation_status: "accepted",
      accepted_at: new Date().toISOString(),
    })
    .eq("id", inviteIdResult.data)
    .select("id, client_id, role")
    .maybeSingle();

  if (error) return GENERIC_FAILURE;
  if (!data) return INVITE_NOT_FOUND;

  await writeAuditLog({
    clientId: data.client_id,
    userId: user.id,
    action: "invitation_accepted",
    entityType: "client_access",
    entityId: data.id,
    metadata: { role: data.role },
  });

  return {
    ok: true,
    data: { id: data.id, clientId: data.client_id, role: data.role },
  };
}

export type RevokedInvitation = {
  id: string;
  clientId: string;
};

export async function revokeInvitation(
  inviteId: string,
): Promise<ServiceResult<RevokedInvitation>> {
  const { user } = await getServerUser();
  if (!user) return AUTH_REQUIRED;

  const inviteIdResult = uuidSchema.safeParse(inviteId);
  if (!inviteIdResult.success) return CANNOT_MANAGE_USERS;

  const supabase = await createClient();

  const { data: inviteRow, error: fetchError } = await supabase
    .from("client_access")
    .select("id, client_id")
    .eq("id", inviteIdResult.data)
    .maybeSingle();

  if (fetchError || !inviteRow) return CANNOT_MANAGE_USERS;

  const canManage = await canManageClientUsers(user.id, inviteRow.client_id);
  if (!canManage) return CANNOT_MANAGE_USERS;

  const { data, error } = await supabase
    .from("client_access")
    .update({
      invitation_status: "revoked",
      revoked_at: new Date().toISOString(),
    })
    .eq("id", inviteIdResult.data)
    .eq("client_id", inviteRow.client_id)
    .select("id, client_id, invited_email")
    .maybeSingle();

  if (error) return GENERIC_FAILURE;
  if (!data) return CANNOT_MANAGE_USERS;

  await writeAuditLog({
    clientId: data.client_id,
    userId: user.id,
    action: "access_revoked",
    entityType: "client_access",
    entityId: data.id,
    metadata: { invited_email: data.invited_email },
  });

  return { ok: true, data: { id: data.id, clientId: data.client_id } };
}
