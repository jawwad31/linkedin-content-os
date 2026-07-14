"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { createInvitationAction, type InviteFormState } from "./actions";

const initialState: InviteFormState = { error: null, success: null };

export function InviteForm({ clientId }: { clientId: string }) {
  const [state, formAction, isPending] = useActionState(
    createInvitationAction.bind(null, clientId),
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="invitedEmail" className="text-small font-medium">
          Email
        </label>
        <Input
          id="invitedEmail"
          name="invitedEmail"
          type="email"
          autoComplete="off"
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="role" className="text-small font-medium">
          Role
        </label>
        <select
          id="role"
          name="role"
          defaultValue="client_user"
          className="h-10 w-full rounded-control border border-border-grey bg-white px-3 text-body text-near-black outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50"
        >
          <option value="client_admin">Client Admin</option>
          <option value="client_user">Client User</option>
        </select>
      </div>

      {state.error ? (
        <p role="alert" className="text-small text-danger-strong">
          {state.error}
        </p>
      ) : null}

      {state.success ? (
        <p className="text-small text-success-strong">{state.success}</p>
      ) : null}

      <Button type="submit" variant="brand" disabled={isPending}>
        {isPending ? "Sending invite..." : "Send Invite"}
      </Button>
    </form>
  );
}
