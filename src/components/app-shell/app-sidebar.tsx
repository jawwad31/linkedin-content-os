import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { LogoutButton } from "@/features/auth/logout-button";
import type { EffectiveClientRole } from "@/lib/access/roles";

import { AppNav } from "./app-nav";
import { WorkspaceSwitchLink } from "./workspace-switch-link";

export function AppSidebar({
  clientId,
  clientName,
  agencyName,
  role,
  accessibleClientCount,
}: {
  clientId: string;
  clientName: string;
  agencyName: string | null;
  role: EffectiveClientRole;
  accessibleClientCount: number;
}) {
  return (
    <aside className="hidden flex-col gap-6 bg-near-black p-6 text-soft-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-72 lg:shrink-0">
      <div className="flex items-center gap-2.5 px-1">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-gradient-brand font-heading text-sm font-bold text-white shadow-sm"
        >
          A
        </span>
        <span className="text-small font-heading font-semibold">
          AIXelerate Content OS
        </span>
      </div>

      <div className="flex flex-col gap-2 rounded-control border border-white/10 bg-white/5 p-3.5">
        <p className="truncate text-body font-semibold text-soft-white">
          {clientName}
        </p>
        {agencyName ? (
          <p className="truncate text-caption text-soft-white/50">
            Agency: {agencyName}
          </p>
        ) : null}
        <WorkspaceSwitchLink
          role={role}
          accessibleClientCount={accessibleClientCount}
        />
      </div>

      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-soft-white/40"
        />
        <Input
          type="search"
          disabled
          aria-label="Search coming later"
          placeholder="Search coming later"
          className="border-white/10 bg-transparent pl-9 text-caption text-soft-white placeholder:text-soft-white/40 disabled:bg-transparent disabled:opacity-100"
        />
      </div>

      <AppNav clientId={clientId} />

      <div className="lg:mt-auto">
        <LogoutButton className="w-full justify-start text-soft-white/60 hover:bg-white/5 hover:text-soft-white" />
      </div>
    </aside>
  );
}
