"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEFAULT_CLIENT_USER_PERMISSIONS } from "@/lib/access/roles";

import {
  provisionAccountUserAction,
  provisionAgencyUserAction,
} from "./actions";
import { PermissionFields, TemporaryPasswordField } from "./form-controls";
import { EMPTY_USER_MANAGEMENT_STATE } from "./state";

const selectClasses =
  "h-11 w-full rounded-control border border-border-grey bg-white px-3 text-body text-near-black outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50";

export function AccountUserProvisionForm({ clientId }: { clientId: string }) {
  const [role, setRole] = useState<"client_admin" | "client_user">("client_user");
  const [state, formAction, pending] = useActionState(
    provisionAccountUserAction.bind(null, clientId),
    EMPTY_USER_MANAGEMENT_STATE,
  );

  return (
    <ProvisionFormShell state={state} formAction={formAction} pending={pending}>
      <IdentityFields />
      <TemporaryPasswordField />
      <RoleSelect value={role} onChange={setRole} />
      {role === "client_user" ? (
        <PermissionFields defaultPermissions={DEFAULT_CLIENT_USER_PERMISSIONS} />
      ) : null}
    </ProvisionFormShell>
  );
}

export function AgencyUserProvisionForm({
  accounts,
}: {
  accounts: Array<{ id: string; name: string }>;
}) {
  const [scope, setScope] = useState<"agency" | "account">("agency");
  const [role, setRole] = useState<"client_admin" | "client_user">("client_user");
  const [state, formAction, pending] = useActionState(
    provisionAgencyUserAction,
    EMPTY_USER_MANAGEMENT_STATE,
  );

  return (
    <ProvisionFormShell state={state} formAction={formAction} pending={pending}>
      <IdentityFields />
      <TemporaryPasswordField />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="scope" className="text-small font-medium">Access scope</label>
          <select
            id="scope"
            name="scope"
            value={scope}
            onChange={(event) => setScope(event.target.value as "agency" | "account")}
            className={selectClasses}
          >
            <option value="agency">Entire Agency</option>
            <option value="account">One Account</option>
          </select>
        </div>
        {scope === "account" ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="clientId" className="text-small font-medium">Account</label>
            <select id="clientId" name="clientId" required className={selectClasses}>
              <option value="">Select an Account</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>{account.name}</option>
              ))}
            </select>
          </div>
        ) : (
          <input type="hidden" name="role" value="agency_admin" />
        )}
      </div>
      {scope === "account" ? (
        <>
          <RoleSelect value={role} onChange={setRole} />
          {role === "client_user" ? (
            <PermissionFields defaultPermissions={DEFAULT_CLIENT_USER_PERMISSIONS} />
          ) : null}
        </>
      ) : null}
    </ProvisionFormShell>
  );
}

function IdentityFields() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-small font-medium">Email</label>
        <Input id="email" name="email" type="email" autoComplete="off" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="name" className="text-small font-medium">Name (optional)</label>
        <Input id="name" name="name" type="text" autoComplete="off" maxLength={120} />
      </div>
    </div>
  );
}

function RoleSelect({
  value,
  onChange,
}: {
  value: "client_admin" | "client_user";
  onChange: (role: "client_admin" | "client_user") => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="role" className="text-small font-medium">Account role</label>
      <select
        id="role"
        name="role"
        value={value}
        onChange={(event) => onChange(event.target.value as "client_admin" | "client_user")}
        className={selectClasses}
      >
        <option value="client_admin">Account Admin</option>
        <option value="client_user">Account User</option>
      </select>
    </div>
  );
}

function ProvisionFormShell({
  state,
  formAction,
  pending,
  children,
}: {
  state: { error: string | null; success: string | null };
  formAction: (formData: FormData) => void;
  pending: boolean;
  children: React.ReactNode;
}) {
  return (
    <form action={formAction} className="flex flex-col gap-4">
      {children}
      <p className="text-caption text-muted-foreground">
        Access is active immediately. No invitation or password email is sent.
      </p>
      {state.error ? <p role="alert" className="text-small text-danger-strong">{state.error}</p> : null}
      {state.success ? <p role="status" className="text-small text-success-strong">{state.success}</p> : null}
      <Button type="submit" variant="brand" disabled={pending} className="self-start">
        {pending ? "Adding user..." : "Add user"}
      </Button>
    </form>
  );
}
