"use client";

import { useState } from "react";
import { Copy, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CLIENT_PERMISSIONS,
  CLIENT_PERMISSION_DESCRIPTIONS,
  CLIENT_PERMISSION_LABELS,
  type ClientPermission,
} from "@/lib/access/roles";

import { generateTemporaryPassword } from "./password";

export function TemporaryPasswordField({
  id = "temporaryPassword",
  name = "temporaryPassword",
  label = "Temporary password",
  required = false,
  helpText = "Required only when this email does not already have an account.",
}: {
  id?: string;
  name?: string;
  label?: string;
  required?: boolean;
  helpText?: string;
}) {
  const [password, setPassword] = useState("");
  const [copied, setCopied] = useState(false);

  function generate() {
    setPassword(generateTemporaryPassword());
    setCopied(false);
  }

  async function copy() {
    if (!password) return;
    await navigator.clipboard.writeText(password);
    setCopied(true);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-small font-medium">
        {label}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id={id}
          name={name}
          type="text"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            setCopied(false);
          }}
          autoComplete="new-password"
          required={required}
          minLength={12}
          className="font-mono"
        />
        <Button type="button" onClick={generate} className="sm:shrink-0">
          <RefreshCw aria-hidden="true" className="h-4 w-4" /> Generate
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={copy}
          disabled={!password}
          className="sm:shrink-0"
        >
          <Copy aria-hidden="true" className="h-4 w-4" />
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <p className="text-caption text-muted-foreground">{helpText}</p>
    </div>
  );
}

export function PermissionFields({
  defaultPermissions = [],
  disabled = false,
}: {
  defaultPermissions?: readonly ClientPermission[];
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="flex flex-col gap-2">
      <legend className="mb-1 text-small font-medium">
        Account User permissions
      </legend>
      <div className="grid gap-2 md:grid-cols-2">
        {CLIENT_PERMISSIONS.map((permission) => (
          <label
            key={permission}
            className="flex cursor-pointer items-start gap-3 rounded-control border border-border-grey bg-white p-3"
          >
            <input
              type="checkbox"
              name="permissions"
              value={permission}
              defaultChecked={defaultPermissions.includes(permission)}
              className="mt-1 h-4 w-4 accent-brand-purple"
            />
            <span>
              <span className="block text-small font-medium">
                {CLIENT_PERMISSION_LABELS[permission]}
              </span>
              <span className="mt-0.5 block text-caption text-muted-foreground">
                {CLIENT_PERMISSION_DESCRIPTIONS[permission]}
              </span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
