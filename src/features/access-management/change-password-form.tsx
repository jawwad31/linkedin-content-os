"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { changeOwnPasswordAction } from "./actions";
import { EMPTY_USER_MANAGEMENT_STATE } from "./state";

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(
    changeOwnPasswordAction,
    EMPTY_USER_MANAGEMENT_STATE,
  );
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-small font-medium">New password</label>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={12} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="confirmPassword" className="text-small font-medium">Confirm new password</label>
        <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" minLength={12} required />
      </div>
      <p className="text-caption text-muted-foreground">
        Use at least 12 characters with uppercase, lowercase, number, and symbol.
      </p>
      {state.error ? <p role="alert" className="text-small text-danger-strong">{state.error}</p> : null}
      <Button type="submit" variant="brand" disabled={pending}>
        {pending ? "Changing password..." : "Change password and continue"}
      </Button>
    </form>
  );
}
