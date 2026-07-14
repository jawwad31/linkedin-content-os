"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff, Mail, Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { login, type LoginState } from "./actions";

const initialState: LoginState = { error: null };

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(login, initialState);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <div className="relative group">
        <div className="flex flex-col gap-2">
          <label htmlFor="email" className="text-small text-on-surface-variant font-medium">
            Email address
          </label>
          <div className="relative">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant w-5 h-5 pointer-events-none" />
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="Email"
              required
              style={{ paddingLeft: '3rem', paddingRight: '2.5rem' }}
              className="h-14 w-full rounded-lg border border-outline bg-transparent text-body-lg text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/60 focus-visible:border-primary focus-visible:border-2 focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 hover:border-on-surface-variant"
            />
          </div>
        </div>
      </div>

      <div className="relative group">
        <div className="flex flex-col gap-2">
          <label htmlFor="password" className="text-small text-on-surface-variant font-medium">
            Password
          </label>
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant w-5 h-5 pointer-events-none" />
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Password"
              required
              style={{ paddingLeft: '3rem', paddingRight: '5rem' }}
              className="h-14 w-full rounded-lg border border-outline bg-transparent text-body-lg text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/60 focus-visible:border-primary focus-visible:border-2 focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 hover:border-on-surface-variant"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full hover:bg-surface-variant transition-colors text-on-surface-variant"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>



      {state.error ? (
        <p role="alert" className="text-small text-danger-strong">
          {state.error}
        </p>
      ) : null}

      <Button
        type="submit"
        variant="brand"
        disabled={isPending}
        className="w-full h-12 rounded-full font-bold"
      >
        {isPending ? "Signing in..." : "Sign In"}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="w-5 h-5 ml-1"
        >
          <path d="M14 16.94V12.94H5.08L5.05 10.93H14V6.94L19 11.94Z" />
        </svg>
      </Button>
    </form>
  );
}
