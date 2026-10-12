"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";

type InviteMemberState = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

const InviteMemberContext = createContext<InviteMemberState | null>(null);

function useInviteMember(): InviteMemberState {
  const state = useContext(InviteMemberContext);
  if (!state) {
    throw new Error("Invite member controls must be rendered inside InviteMemberScope.");
  }
  return state;
}

/**
 * Shares the open state of the invite form between the top-bar button and the form.
 * Rendered by the Settings page around the tabs, so both sit inside one scope.
 */
export function InviteMemberScope({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <InviteMemberContext.Provider value={{ open, setOpen }}>
      {children}
    </InviteMemberContext.Provider>
  );
}

/** The one primary action of the Team access tab, in the top bar. */
export function InviteMemberButton() {
  const { open, setOpen } = useInviteMember();
  return (
    <Button
      type="button"
      variant="brand"
      aria-expanded={open}
      aria-controls="invite-member-form"
      onClick={() => setOpen(true)}
    >
      <UserPlus aria-hidden="true" className="h-4 w-4" />
      Invite member
    </Button>
  );
}

/**
 * Reveals the existing invite form. It stays mounted while hidden, so a half-filled form
 * survives closing it. Opening it moves focus to the first field.
 */
export function InviteMemberPanel({ children }: { children: ReactNode }) {
  const { open, setOpen } = useInviteMember();
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (open) {
      sectionRef.current?.querySelector<HTMLInputElement>("input")?.focus();
    }
  }, [open]);

  return (
    <section
      id="invite-member-form"
      ref={sectionRef}
      hidden={!open}
      aria-labelledby="invite-member-heading"
      className="flex flex-col gap-4 rounded-card border border-border-subtle bg-white p-5 shadow-xs"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="invite-member-heading" className="text-card-title font-medium text-near-black">
          Invite member
        </h2>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>
      {children}
    </section>
  );
}
