"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { resolveAuthenticatedDestination } from "@/lib/access/destination";
import { getServerUser } from "@/lib/supabase/session";

import {
  changeOwnPassword,
  provisionAccountUser,
  provisionAgencyUser,
  resetAccountMemberPassword,
  resetAgencyMemberPassword,
  revokeAccountMembership,
  revokeAgencyMembership,
  updateAccountMembership,
} from "./service";
import type { UserManagementState } from "./state";

function permissionsFrom(formData: FormData) {
  return formData.getAll("permissions");
}

export async function provisionAccountUserAction(
  clientId: string,
  _state: UserManagementState,
  formData: FormData,
): Promise<UserManagementState> {
  const result = await provisionAccountUser(clientId, {
    email: formData.get("email"),
    name: formData.get("name"),
    temporaryPassword: formData.get("temporaryPassword"),
    role: formData.get("role"),
    permissions: permissionsFrom(formData),
  });
  if (!result.ok) return { error: result.message, success: null };

  revalidatePath(`/client/${clientId}/settings`);
  return {
    error: null,
    success: result.data.createdNewUser
      ? "User created with immediate Account access. Share the temporary password securely."
      : "Existing user received immediate Account access. Their current password was not changed.",
    createdNewUser: result.data.createdNewUser,
  };
}

export async function provisionAgencyUserAction(
  _state: UserManagementState,
  formData: FormData,
): Promise<UserManagementState> {
  const result = await provisionAgencyUser({
    scope: formData.get("scope"),
    clientId: formData.get("clientId"),
    email: formData.get("email"),
    name: formData.get("name"),
    temporaryPassword: formData.get("temporaryPassword"),
    role: formData.get("role"),
    permissions: permissionsFrom(formData),
  });
  if (!result.ok) return { error: result.message, success: null };

  revalidatePath("/agency/settings");
  return {
    error: null,
    success: result.data.createdNewUser
      ? "User created with immediate access. Share the temporary password securely."
      : "Existing user received immediate access. Their current password was not changed.",
    createdNewUser: result.data.createdNewUser,
  };
}

export async function updateAccountMembershipAction(
  clientId: string,
  membershipId: string,
  _state: UserManagementState,
  formData: FormData,
): Promise<UserManagementState> {
  const result = await updateAccountMembership(clientId, membershipId, {
    role: formData.get("role"),
    permissions: permissionsFrom(formData),
  });
  if (!result.ok) return { error: result.message, success: null };
  revalidatePath(`/client/${clientId}/settings`);
  revalidatePath("/agency/settings");
  return { error: null, success: "Account access updated." };
}

export async function revokeAccountMembershipAction(
  clientId: string,
  membershipId: string,
  _state: UserManagementState,
  _formData: FormData,
): Promise<UserManagementState> {
  void _state;
  void _formData;
  const result = await revokeAccountMembership(clientId, membershipId);
  if (!result.ok) return { error: result.message, success: null };
  revalidatePath(`/client/${clientId}/settings`);
  revalidatePath("/agency/settings");
  return { error: null, success: "Account access revoked." };
}

export async function resetAccountPasswordAction(
  clientId: string,
  membershipId: string,
  _state: UserManagementState,
  formData: FormData,
): Promise<UserManagementState> {
  const result = await resetAccountMemberPassword(clientId, membershipId, {
    temporaryPassword: formData.get("temporaryPassword"),
  });
  if (!result.ok) return { error: result.message, success: null };
  return {
    error: null,
    success: "Password reset. Share it securely; the user must replace it after signing in.",
  };
}

export async function revokeAgencyMembershipAction(
  membershipId: string,
  _state: UserManagementState,
  _formData: FormData,
): Promise<UserManagementState> {
  void _state;
  void _formData;
  const result = await revokeAgencyMembership(membershipId);
  if (!result.ok) return { error: result.message, success: null };
  revalidatePath("/agency/settings");
  return { error: null, success: "Agency access revoked." };
}

export async function resetAgencyPasswordAction(
  membershipId: string,
  _state: UserManagementState,
  formData: FormData,
): Promise<UserManagementState> {
  const result = await resetAgencyMemberPassword(membershipId, {
    temporaryPassword: formData.get("temporaryPassword"),
  });
  if (!result.ok) return { error: result.message, success: null };
  return {
    error: null,
    success: "Password reset. Share it securely; the user must replace it after signing in.",
  };
}

export async function changeOwnPasswordAction(
  _state: UserManagementState,
  formData: FormData,
): Promise<UserManagementState> {
  const result = await changeOwnPassword({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!result.ok) return { error: result.message, success: null };

  const { user } = await getServerUser();
  redirect(user ? await resolveAuthenticatedDestination(user.id) : "/login");
}
