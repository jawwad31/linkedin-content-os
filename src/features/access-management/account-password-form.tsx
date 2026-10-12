"use client";

import { useActionState, useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { changePasswordAction } from "./actions";
import { EMPTY_USER_MANAGEMENT_STATE } from "./state";

/** Change your own password, later on, by entering the current one first. */
export function AccountPasswordForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(
    changePasswordAction,
    EMPTY_USER_MANAGEMENT_STATE,
  );

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="currentPassword" className="text-small font-medium">Current password</label>
        <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required />
      </div>
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
      {state.success ? <p role="status" className="text-small text-success-strong">{state.success}</p> : null}
      <Button type="submit" variant="brand" disabled={pending} className="self-start">
        {pending ? "Changing password..." : "Change password"}
      </Button>
    </form>
  );
}
