"use client";

import { useActionState, useRef, useState } from "react";
import { KeyRound, ShieldCheck, UserMinus } from "lucide-react";

import { ActionMenu, type ActionMenuItem } from "@/components/ui/action-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CLIENT_ROLE_LABELS, type ClientRole } from "@/lib/access/roles";

import {
  resetAccountPasswordAction,
  revokeAccountMembershipAction,
  updateAccountMembershipAction,
} from "./actions";
import { PermissionFields, TemporaryPasswordField } from "./form-controls";
import type { ManagedAccountMember } from "./queries";
import { EMPTY_USER_MANAGEMENT_STATE } from "./state";
import { teamCapabilityLabels } from "./team-capabilities";

const selectClasses =
  "h-[38px] w-full rounded-control border border-border-grey bg-white px-3 text-small text-near-black outline-none";

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
  return (
    <ul className="overflow-hidden rounded-card border border-border-subtle bg-white shadow-xs">
      {members.map((member) => (
        <AccountMemberItem key={member.id} clientId={clientId} member={member} />
      ))}
    </ul>
  );
}

type OpenPanel = "access" | "password" | null;

/**
 * One row: name and email, the role badge and capability badges, and a row menu. The menu
 * opens the existing edit-access and password forms below the row, or submits the existing
 * revoke action. Those forms and actions are unchanged.
 */
function AccountMemberItem({ clientId, member }: { clientId: string; member: ManagedAccountMember }) {
  const [role, setRole] = useState<ClientRole>(member.role);
  const [panel, setPanel] = useState<OpenPanel>(null);
  const revokeFormRef = useRef<HTMLFormElement>(null);
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

  const displayName = member.name || member.email;
  const capabilities = teamCapabilityLabels(member.role, member.permissions);
  const menuItems: ActionMenuItem[] = [
    { label: "Edit access", icon: ShieldCheck, onSelect: () => setPanel("access") },
    { label: "Set a new password", icon: KeyRound, onSelect: () => setPanel("password") },
    {
      label: "Revoke access",
      icon: UserMinus,
      destructive: true,
      onSelect: () => revokeFormRef.current?.requestSubmit(),
    },
  ];

  return (
    <li className="border-t border-border-subtle px-5 py-4 first:border-t-0">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 sm:grid-cols-[220px_minmax(0,1fr)_auto]">
        <div className="col-start-1 row-start-1 min-w-0">
          <p className="truncate text-body font-medium text-near-black">{displayName}</p>
          {member.name ? <p className="truncate text-caption text-muted-foreground">{member.email}</p> : null}
        </div>
        <div className="col-start-2 row-start-1 justify-self-end sm:col-start-3">
          <ActionMenu label={`More actions for ${displayName}`} items={menuItems} />
        </div>
        <div className="col-span-2 row-start-2 flex min-w-0 flex-wrap gap-1.5 sm:col-span-1 sm:col-start-2 sm:row-start-1">
          <Badge variant="accent-purple">{CLIENT_ROLE_LABELS[member.role]}</Badge>
          {capabilities.map((label) => (
            <Badge key={label} variant="neutral">{label}</Badge>
          ))}
          {capabilities.length === 0 ? (
            <span className="text-caption text-muted-foreground">No capabilities</span>
          ) : null}
        </div>
      </div>

      <form ref={revokeFormRef} action={revokeAction} className="hidden" />
      {revoking ? <p className="mt-3 text-caption text-muted-foreground">Revoking access...</p> : null}
      {revokeState.error ? <p role="alert" className="mt-3 text-caption text-danger-strong">{revokeState.error}</p> : null}

      <div hidden={panel !== "access"} className="mt-4">
        <div className="flex flex-col gap-4 rounded-control border border-border-subtle bg-surface-sunken p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-body font-medium text-near-black">Edit role and permissions</h3>
            <Button type="button" variant="ghost" size="sm" onClick={() => setPanel(null)}>Close</Button>
          </div>
          <form action={updateAction} className="flex flex-col gap-3">
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
        </div>
      </div>

      <div hidden={panel !== "password"} className="mt-4">
        <div className="flex flex-col gap-4 rounded-control border border-border-subtle bg-surface-sunken p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-body font-medium text-near-black">Set a new temporary password</h3>
            <Button type="button" variant="ghost" size="sm" onClick={() => setPanel(null)}>Close</Button>
          </div>
          <form action={resetAction} className="flex flex-col gap-3">
            <TemporaryPasswordField id={`password-${member.id}`} required helpText="This replaces the user's password immediately and requires a change at next sign-in." />
            {resetState.error ? <p className="text-small text-danger-strong">{resetState.error}</p> : null}
            {resetState.success ? <p className="text-small text-success-strong">{resetState.success}</p> : null}
            <Button type="submit" variant="brand" disabled={resetting} className="self-start">
              {resetting ? "Resetting..." : "Reset password"}
            </Button>
          </form>
        </div>
      </div>
    </li>
  );
}
