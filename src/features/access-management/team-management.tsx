"use client";

import { useActionState, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CLIENT_PERMISSION_LABELS, CLIENT_ROLE_LABELS, type ClientRole } from "@/lib/access/roles";

import {
  resetAccountPasswordAction,
  resetAgencyPasswordAction,
  revokeAccountMembershipAction,
  revokeAgencyMembershipAction,
  updateAccountMembershipAction,
} from "./actions";
import { PermissionFields, TemporaryPasswordField } from "./form-controls";
import type { ManagedAccountMember, ManagedAgencyMember } from "./queries";
import { EMPTY_USER_MANAGEMENT_STATE } from "./state";

const selectClasses =
  "h-11 w-full rounded-control border border-border-grey bg-white px-3 text-body text-near-black outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50";

export function AccountTeamManagement({
  clientId,
  members,
}: {
  clientId: string;
  members: ManagedAccountMember[];
}) {
  if (members.length === 0) {
    return <p className="text-small text-muted-foreground">No direct Account users yet.</p>;
  }
  return <ul className="flex flex-col gap-3">{members.map((member) => (
    <AccountMemberItem key={member.id} clientId={clientId} member={member} />
  ))}</ul>;
}

function AccountMemberItem({ clientId, member }: { clientId: string; member: ManagedAccountMember }) {
  const [role, setRole] = useState<ClientRole>(member.role);
  const [updateState, updateAction, updating] = useActionState(
    updateAccountMembershipAction.bind(null, clientId, member.id),
    EMPTY_USER_MANAGEMENT_STATE,
  );
  const [resetState, resetAction, resetting] = useActionState(
    resetAccountPasswordAction.bind(null, clientId, member.id),
    EMPTY_USER_MANAGEMENT_STATE,
  );
  const [revokeState, revokeAction, revoking] = useActionState(
    revokeAccountMembershipAction.bind(null, clientId, member.id),
    EMPTY_USER_MANAGEMENT_STATE,
  );

  return (
    <li className="rounded-control border border-border-grey bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="truncate text-body font-medium">{member.name || member.email}</p>
          {member.name ? <p className="truncate text-caption text-muted-foreground">{member.email}</p> : null}
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant="neutral">{CLIENT_ROLE_LABELS[member.role]}</Badge>
            {member.permissions.map((permission) => (
              <Badge key={permission} variant="neutral">{CLIENT_PERMISSION_LABELS[permission]}</Badge>
            ))}
          </div>
        </div>
        <form action={revokeAction} className="flex flex-col items-end gap-1">
          <Button type="submit" variant="destructive" size="sm" disabled={revoking}>
            {revoking ? "Revoking..." : "Revoke access"}
          </Button>
          {revokeState.error ? <p className="max-w-xs text-right text-caption text-danger-strong">{revokeState.error}</p> : null}
        </form>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <details className="rounded-control border border-border-grey p-3">
          <summary className="cursor-pointer text-small font-medium">Edit role and permissions</summary>
          <form action={updateAction} className="mt-4 flex flex-col gap-3">
            <select name="role" value={role} onChange={(event) => setRole(event.target.value as ClientRole)} className={selectClasses}>
              <option value="client_admin">Account Admin</option>
              <option value="client_user">Account User</option>
            </select>
            {role === "client_user" ? <PermissionFields defaultPermissions={member.permissions} /> : null}
            {updateState.error ? <p className="text-small text-danger-strong">{updateState.error}</p> : null}
            {updateState.success ? <p className="text-small text-success-strong">{updateState.success}</p> : null}
            <Button type="submit" variant="brand" disabled={updating} className="self-start">
              {updating ? "Saving..." : "Save access"}
            </Button>
          </form>
        </details>
        <details className="rounded-control border border-border-grey p-3">
          <summary className="cursor-pointer text-small font-medium">Set a new temporary password</summary>
          <form action={resetAction} className="mt-4 flex flex-col gap-3">
            <TemporaryPasswordField id={`password-${member.id}`} required helpText="This replaces the user's password immediately and requires a change at next sign-in." />
            {resetState.error ? <p className="text-small text-danger-strong">{resetState.error}</p> : null}
            {resetState.success ? <p className="text-small text-success-strong">{resetState.success}</p> : null}
            <Button type="submit" variant="brand" disabled={resetting} className="self-start">
              {resetting ? "Resetting..." : "Reset password"}
            </Button>
          </form>
        </details>
      </div>
    </li>
  );
}

export function AgencyMemberManagement({ members }: { members: ManagedAgencyMember[] }) {
  return <ul className="flex flex-col gap-3">{members.map((member) => (
    <AgencyMemberItem key={member.id} member={member} />
  ))}</ul>;
}

function AgencyMemberItem({ member }: { member: ManagedAgencyMember }) {
  const [state, action, pending] = useActionState(
    resetAgencyPasswordAction.bind(null, member.id),
    EMPTY_USER_MANAGEMENT_STATE,
  );
  const [revokeState, revokeAction, revoking] = useActionState(
    revokeAgencyMembershipAction.bind(null, member.id),
    EMPTY_USER_MANAGEMENT_STATE,
  );
  return (
    <li className="rounded-control border border-border-grey bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="truncate text-body font-medium">{member.name || member.email}</p>
          {member.name ? <p className="truncate text-caption text-muted-foreground">{member.email}</p> : null}
          <Badge variant="neutral" className="mt-2">Agency Admin</Badge>
        </div>
        <form action={revokeAction} className="flex flex-col items-end gap-1">
          <Button type="submit" variant="destructive" size="sm" disabled={revoking}>
            {revoking ? "Revoking..." : "Revoke access"}
          </Button>
          {revokeState.error ? <p className="max-w-xs text-right text-caption text-danger-strong">{revokeState.error}</p> : null}
        </form>
      </div>
      <details className="mt-4 rounded-control border border-border-grey p-3">
        <summary className="cursor-pointer text-small font-medium">Set a new temporary password</summary>
        <form action={action} className="mt-4 flex flex-col gap-3">
          <TemporaryPasswordField id={`agency-password-${member.id}`} required helpText="This replaces the user's password immediately and requires a change at next sign-in." />
          {state.error ? <p className="text-small text-danger-strong">{state.error}</p> : null}
          {state.success ? <p className="text-small text-success-strong">{state.success}</p> : null}
          <Button type="submit" variant="brand" disabled={pending} className="self-start">
            {pending ? "Resetting..." : "Reset password"}
          </Button>
        </form>
      </details>
    </li>
  );
}
