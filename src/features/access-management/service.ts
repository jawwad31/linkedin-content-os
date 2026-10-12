import "server-only";

import { z } from "zod";

import { getCurrentUserAccessForClient } from "@/lib/access/client-access";
import type { ClientPermission, ClientRole } from "@/lib/access/roles";
import { writeAuditLog } from "@/lib/audit/log";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { verifyPassword } from "@/lib/supabase/verify-password";
import { getServerUser } from "@/lib/supabase/session";

import { findAuthUserByEmail } from "./auth-users";
import { canAccountAdminResetTarget } from "./policy";
import {
  changeOwnPasswordWithCurrentSchema,
  changePasswordSchema,
  provisionAccountUserSchema,
  resetPasswordSchema,
  updateAccountMembershipSchema,
} from "./schemas";

type AdminClient = ReturnType<typeof createAdminClient>;

export type AccessManagementResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

type AccountAuthorization = {
  userId: string;
  clientId: string;
  role: "client_admin";
};

type ProvisionedAuthUser = {
  id: string;
  email: string;
  created: boolean;
};

export type ProvisionedMembership = {
  membershipId: string;
  userId: string;
  email: string;
  createdNewUser: boolean;
  role: ClientRole;
  clientId: string;
};

const uuidSchema = z.string().uuid();

const AUTH_REQUIRED = {
  ok: false as const,
  code: "AUTH_REQUIRED",
  message: "You must be signed in to continue.",
};

const FORBIDDEN = {
  ok: false as const,
  code: "FORBIDDEN",
  message: "You do not have permission to manage these users.",
};

const VALIDATION_ERROR = {
  ok: false as const,
  code: "VALIDATION_ERROR",
  message: "Check the user details and try again.",
};

const TEMPORARY_PASSWORD_REQUIRED = {
  ok: false as const,
  code: "VALIDATION_ERROR",
  message: "A strong temporary password is required for a new user.",
};

const DUPLICATE_ACCESS = {
  ok: false as const,
  code: "DUPLICATE_ACCESS",
  message: "This user already has the selected access.",
};

const RESET_NEEDS_DASHBOARD = {
  ok: false as const,
  code: "FORBIDDEN",
  message:
    "This person also belongs to another account, so their password cannot be reset from here.",
};

const UNKNOWN_ERROR = {
  ok: false as const,
  code: "UNKNOWN_ERROR",
  message: "Something went wrong. Please try again.",
};

function validationFailure(error: z.ZodError) {
  return {
    ok: false as const,
    code: "VALIDATION_ERROR",
    message: error.issues[0]?.message ?? VALIDATION_ERROR.message,
  };
}

function permissionsForRole(
  role: ClientRole,
  permissions: ClientPermission[],
): ClientPermission[] {
  return role === "client_user" ? permissions : [];
}

async function authorizeAccountManagement(
  userId: string,
  clientId: string,
  admin: AdminClient,
): Promise<AccountAuthorization | null> {
  const access = await getCurrentUserAccessForClient(userId, clientId);
  if (!access || access.role !== "client_admin") return null;

  const { data: client, error } = await admin
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .is("deleted_at", null)
    .maybeSingle<{ id: string }>();

  if (error || !client) return null;

  return {
    userId,
    clientId: client.id,
    role: access.role,
  };
}

async function createOrFindAuthUser(input: {
  admin: AdminClient;
  email: string;
  name?: string;
  temporaryPassword?: string;
}): Promise<AccessManagementResult<ProvisionedAuthUser>> {
  const existing = await findAuthUserByEmail(input.admin, input.email);
  if (existing.error) return UNKNOWN_ERROR;

  if (existing.user) {
    const profileValues: {
      id: string;
      email: string;
      active: boolean;
      name?: string;
    } = {
      id: existing.user.id,
      email: input.email,
      active: true,
    };
    if (input.name) profileValues.name = input.name;

    const { error: profileError } = await input.admin.from("profiles").upsert(
      profileValues,
      { onConflict: "id" },
    );
    if (profileError) return UNKNOWN_ERROR;

    return {
      ok: true,
      data: {
        id: existing.user.id,
        email: input.email,
        created: false,
      },
    };
  }

  if (!input.temporaryPassword) return TEMPORARY_PASSWORD_REQUIRED;

  const { data, error } = await input.admin.auth.admin.createUser({
    email: input.email,
    password: input.temporaryPassword,
    email_confirm: true,
    user_metadata: input.name ? { name: input.name } : {},
  });

  if (error || !data.user) {
    const racedUser = await findAuthUserByEmail(input.admin, input.email);
    if (racedUser.error || !racedUser.user) return UNKNOWN_ERROR;
    return {
      ok: true,
      data: {
        id: racedUser.user.id,
        email: input.email,
        created: false,
      },
    };
  }

  const { error: profileError } = await input.admin.from("profiles").upsert(
    {
      id: data.user.id,
      email: input.email,
      name: input.name ?? null,
      active: true,
      must_change_password: true,
    },
    { onConflict: "id" },
  );

  if (profileError) {
    await input.admin.auth.admin.deleteUser(data.user.id);
    return UNKNOWN_ERROR;
  }

  return {
    ok: true,
    data: { id: data.user.id, email: input.email, created: true },
  };
}

async function cleanupNewAuthUser(admin: AdminClient, userId: string) {
  await admin.auth.admin.deleteUser(userId);
}

async function addAccountMembership(input: {
  admin: AdminClient;
  actorUserId: string;
  clientId: string;
  authUser: ProvisionedAuthUser;
  role: ClientRole;
  permissions: ClientPermission[];
}): Promise<AccessManagementResult<ProvisionedMembership>> {
  const { data: accepted, error: acceptedError } = await input.admin
    .from("client_access")
    .select("id")
    .eq("client_id", input.clientId)
    .eq("user_id", input.authUser.id)
    .eq("invitation_status", "accepted")
    .maybeSingle<{ id: string }>();

  if (acceptedError) return UNKNOWN_ERROR;
  if (accepted) return DUPLICATE_ACCESS;

  const membershipValues = {
    client_id: input.clientId,
    user_id: input.authUser.id,
    invited_email: input.authUser.email,
    role: input.role,
    permissions: permissionsForRole(input.role, input.permissions),
    invitation_status: "accepted",
    invited_by_user_id: input.actorUserId,
    accepted_at: new Date().toISOString(),
    revoked_at: null,
  };

  const { data: revoked } = await input.admin
    .from("client_access")
    .select("id")
    .eq("client_id", input.clientId)
    .eq("user_id", input.authUser.id)
    .eq("invitation_status", "revoked")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();

  const mutation = revoked
    ? input.admin
        .from("client_access")
        .update(membershipValues)
        .eq("id", revoked.id)
        .select("id")
        .maybeSingle<{ id: string }>()
    : input.admin
        .from("client_access")
        .insert(membershipValues)
        .select("id")
        .single<{ id: string }>();

  const { data: membership, error } = await mutation;
  if (error || !membership) return UNKNOWN_ERROR;

  if (input.authUser.created) {
    await writeAuditLog({
      clientId: input.clientId,
      userId: input.actorUserId,
      action: "user_created",
      entityType: "auth_user",
      entityId: input.authUser.id,
      metadata: { provisioned_without_email: true },
    });
  }

  await writeAuditLog({
    clientId: input.clientId,
    userId: input.actorUserId,
    action: "account_access_added",
    entityType: "client_access",
    entityId: membership.id,
    metadata: {
      target_user_id: input.authUser.id,
      role: input.role,
      permissions: permissionsForRole(input.role, input.permissions),
    },
  });

  return {
    ok: true,
    data: {
      membershipId: membership.id,
      userId: input.authUser.id,
      email: input.authUser.email,
      createdNewUser: input.authUser.created,
      role: input.role,
      clientId: input.clientId,
    },
  };
}

export async function provisionAccountUser(
  clientId: string,
  input: unknown,
): Promise<AccessManagementResult<ProvisionedMembership>> {
  const { user } = await getServerUser();
  if (!user) return AUTH_REQUIRED;

  const clientIdResult = uuidSchema.safeParse(clientId);
  const parsed = provisionAccountUserSchema.safeParse(input);
  if (!clientIdResult.success) return VALIDATION_ERROR;
  if (!parsed.success) return validationFailure(parsed.error);

  const admin = createAdminClient();
  const authorization = await authorizeAccountManagement(
    user.id,
    clientIdResult.data,
    admin,
  );
  if (!authorization) return FORBIDDEN;

  const authUserResult = await createOrFindAuthUser({
    admin,
    email: parsed.data.email,
    name: parsed.data.name,
    temporaryPassword: parsed.data.temporaryPassword,
  });
  if (!authUserResult.ok) return authUserResult;

  const result = await addAccountMembership({
    admin,
    actorUserId: user.id,
    clientId: authorization.clientId,
    authUser: authUserResult.data,
    role: parsed.data.role,
    permissions: parsed.data.permissions,
  });

  if (!result.ok && authUserResult.data.created) {
    await cleanupNewAuthUser(admin, authUserResult.data.id);
  }

  return result;
}

export async function updateAccountMembership(
  clientId: string,
  membershipId: string,
  input: unknown,
): Promise<AccessManagementResult<Record<string, never>>> {
  const { user } = await getServerUser();
  if (!user) return AUTH_REQUIRED;

  const clientIdResult = uuidSchema.safeParse(clientId);
  const membershipIdResult = uuidSchema.safeParse(membershipId);
  const parsed = updateAccountMembershipSchema.safeParse(input);
  if (!clientIdResult.success || !membershipIdResult.success) {
    return VALIDATION_ERROR;
  }
  if (!parsed.success) return validationFailure(parsed.error);

  const admin = createAdminClient();
  const authorization = await authorizeAccountManagement(
    user.id,
    clientIdResult.data,
    admin,
  );
  if (!authorization) return FORBIDDEN;

  const { data: membership, error: membershipError } = await admin
    .from("client_access")
    .select("id, user_id, role")
    .eq("id", membershipIdResult.data)
    .eq("client_id", authorization.clientId)
    .eq("invitation_status", "accepted")
    .maybeSingle<{ id: string; user_id: string | null; role: ClientRole }>();

  if (membershipError || !membership) return FORBIDDEN;
  if (
    membership.user_id === user.id &&
    parsed.data.role !== membership.role
  ) {
    return {
      ok: false,
      code: "DEPENDENCY_CONFLICT",
      message: "You cannot change your own Account role.",
    };
  }

  const permissions = permissionsForRole(
    parsed.data.role,
    parsed.data.permissions,
  );
  const { data: updated, error } = await admin
    .from("client_access")
    .update({ role: parsed.data.role, permissions })
    .eq("id", membership.id)
    .eq("client_id", authorization.clientId)
    .eq("invitation_status", "accepted")
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error || !updated) return UNKNOWN_ERROR;

  await writeAuditLog({
    clientId: authorization.clientId,
    userId: user.id,
    action: "account_access_updated",
    entityType: "client_access",
    entityId: membership.id,
    metadata: {
      target_user_id: membership.user_id,
      role: parsed.data.role,
      permissions,
    },
  });

  return { ok: true, data: {} };
}

export async function revokeAccountMembership(
  clientId: string,
  membershipId: string,
): Promise<AccessManagementResult<Record<string, never>>> {
  const { user } = await getServerUser();
  if (!user) return AUTH_REQUIRED;

  const clientIdResult = uuidSchema.safeParse(clientId);
  const membershipIdResult = uuidSchema.safeParse(membershipId);
  if (!clientIdResult.success || !membershipIdResult.success) {
    return VALIDATION_ERROR;
  }

  const admin = createAdminClient();
  const authorization = await authorizeAccountManagement(
    user.id,
    clientIdResult.data,
    admin,
  );
  if (!authorization) return FORBIDDEN;

  const { data: membership, error: membershipError } = await admin
    .from("client_access")
    .select("id, user_id")
    .eq("id", membershipIdResult.data)
    .eq("client_id", authorization.clientId)
    .eq("invitation_status", "accepted")
    .maybeSingle<{ id: string; user_id: string | null }>();

  if (membershipError || !membership) return FORBIDDEN;
  if (membership.user_id === user.id) {
    return {
      ok: false,
      code: "DEPENDENCY_CONFLICT",
      message: "You cannot revoke your own Account access.",
    };
  }

  const { data: revoked, error } = await admin
    .from("client_access")
    .update({
      invitation_status: "revoked",
      revoked_at: new Date().toISOString(),
    })
    .eq("id", membership.id)
    .eq("client_id", authorization.clientId)
    .eq("invitation_status", "accepted")
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error || !revoked) return UNKNOWN_ERROR;

  await writeAuditLog({
    clientId: authorization.clientId,
    userId: user.id,
    action: "access_revoked",
    entityType: "client_access",
    entityId: membership.id,
    metadata: { target_user_id: membership.user_id },
  });

  return { ok: true, data: {} };
}

async function setTemporaryPassword(input: {
  admin: AdminClient;
  actorUserId: string;
  targetUserId: string;
  temporaryPassword: string;
  clientId: string;
}): Promise<AccessManagementResult<Record<string, never>>> {
  const { data: previousProfile } = await input.admin
    .from("profiles")
    .select("must_change_password")
    .eq("id", input.targetUserId)
    .maybeSingle<{ must_change_password: boolean }>();

  const { error: profileError } = await input.admin.from("profiles").upsert(
    {
      id: input.targetUserId,
      must_change_password: true,
    },
    { onConflict: "id" },
  );
  if (profileError) return UNKNOWN_ERROR;

  const { error: passwordError } =
    await input.admin.auth.admin.updateUserById(input.targetUserId, {
      password: input.temporaryPassword,
    });

  if (passwordError) {
    await input.admin
      .from("profiles")
      .update({
        must_change_password: previousProfile?.must_change_password ?? false,
      })
      .eq("id", input.targetUserId);
    return UNKNOWN_ERROR;
  }

  await writeAuditLog({
    clientId: input.clientId,
    userId: input.actorUserId,
    action: "password_reset",
    entityType: "auth_user",
    entityId: input.targetUserId,
    metadata: { target_user_id: input.targetUserId },
  });

  return { ok: true, data: {} };
}

export async function resetAccountMemberPassword(
  clientId: string,
  membershipId: string,
  input: unknown,
): Promise<AccessManagementResult<Record<string, never>>> {
  const { user } = await getServerUser();
  if (!user) return AUTH_REQUIRED;

  const clientIdResult = uuidSchema.safeParse(clientId);
  const membershipIdResult = uuidSchema.safeParse(membershipId);
  const parsed = resetPasswordSchema.safeParse(input);
  if (!clientIdResult.success || !membershipIdResult.success) {
    return VALIDATION_ERROR;
  }
  if (!parsed.success) return validationFailure(parsed.error);

  const admin = createAdminClient();
  const authorization = await authorizeAccountManagement(
    user.id,
    clientIdResult.data,
    admin,
  );
  if (!authorization) return FORBIDDEN;

  const { data: membership, error } = await admin
    .from("client_access")
    .select("id, user_id")
    .eq("id", membershipIdResult.data)
    .eq("client_id", authorization.clientId)
    .eq("invitation_status", "accepted")
    .maybeSingle<{ id: string; user_id: string | null }>();
  if (error || !membership?.user_id) return FORBIDDEN;

  const { data: accountMemberships, error: accountsError } = await admin
    .from("client_access")
    .select("client_id")
    .eq("user_id", membership.user_id)
    .eq("invitation_status", "accepted");

  if (
    accountsError ||
    !canAccountAdminResetTarget({
      managedClientId: authorization.clientId,
      acceptedClientIds: accountMemberships.map((candidate) => candidate.client_id),
    })
  ) {
    return RESET_NEEDS_DASHBOARD;
  }

  return setTemporaryPassword({
    admin,
    actorUserId: user.id,
    targetUserId: membership.user_id,
    temporaryPassword: parsed.data.temporaryPassword,
    clientId: authorization.clientId,
  });
}

export async function changeOwnPassword(
  input: unknown,
): Promise<AccessManagementResult<Record<string, never>>> {
  const { user } = await getServerUser({ allowPasswordChangeRequired: true });
  if (!user) return AUTH_REQUIRED;

  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "This password could not be used. Choose another strong password.",
    };
  }

  const admin = createAdminClient();
  const { error: profileError } = await admin
    .from("profiles")
    .update({
      must_change_password: false,
      password_changed_at: new Date().toISOString(),
    })
    .eq("id", user.id);
  if (profileError) return UNKNOWN_ERROR;

  await writeAuditLog({
    clientId: null,
    userId: user.id,
    action: "password_changed",
    entityType: "auth_user",
    entityId: user.id,
  });

  return { ok: true, data: {} };
}

/**
 * A signed-in person changes their own password later on, by proving they know
 * the current one. The new password goes to Supabase Auth, which stores only a
 * salted hash of it; this app never stores or reads a password.
 */
export async function changeOwnPasswordWithCurrent(
  input: unknown,
): Promise<AccessManagementResult<Record<string, never>>> {
  const { user } = await getServerUser();
  if (!user?.email) return AUTH_REQUIRED;

  const parsed = changeOwnPasswordWithCurrentSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  const currentIsRight = await verifyPassword(
    user.email,
    parsed.data.currentPassword,
  );
  if (!currentIsRight) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "Your current password is not correct.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "This password could not be used. Choose another strong password.",
    };
  }

  const admin = createAdminClient();
  await admin
    .from("profiles")
    .update({ password_changed_at: new Date().toISOString() })
    .eq("id", user.id);

  await writeAuditLog({
    clientId: null,
    userId: user.id,
    action: "password_changed",
    entityType: "auth_user",
    entityId: user.id,
    metadata: { self_service: true },
  });

  return { ok: true, data: {} };
}
