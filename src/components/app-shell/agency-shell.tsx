import type { ReactNode } from "react";
import Link from "next/link";

import { LogoutButton } from "@/features/auth/logout-button";

import { AgencyNav } from "./agency-nav";

export function AgencyShell({
  agencyName,
  children,
}: {
  agencyName: string;
  children: ReactNode;
}) {
  return (
    <div className="lg:flex lg:min-h-screen">
      <aside className="flex flex-col gap-4 bg-near-black p-4 text-soft-white lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:shrink-0 lg:gap-6 lg:p-6">
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
          <span className="text-caption font-mono uppercase tracking-wide text-soft-white/50">
            Agency
          </span>
          <span className="truncate text-body font-medium">{agencyName}</span>
          <Link
            href="/agency/workspaces"
            className="mt-1 rounded-full border border-white/10 px-3 py-1.5 text-center text-small font-medium text-soft-white/70 transition-colors hover:bg-white/10 hover:text-soft-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50 focus-visible:ring-offset-2 focus-visible:ring-offset-near-black"
          >
            View workspaces
          </Link>
        </div>

        <AgencyNav />

        <div className="lg:mt-auto">
          <LogoutButton className="w-full justify-start text-soft-white/60 hover:bg-white/5 hover:text-soft-white" />
        </div>
      </aside>

      <div className="flex w-full flex-1 flex-col">
        <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-border-grey bg-white/90 px-6 py-4 backdrop-blur-md lg:px-8">
          <div className="min-w-0">
            <h2 className="truncate text-card-title font-heading font-semibold">
              Agency
            </h2>
            <p className="mt-1 truncate text-caption font-mono text-muted-foreground">
              {agencyName}
            </p>
          </div>
          <Link
            href="/agency/workspaces"
            className="rounded-full border border-border-grey px-4 py-2 text-small font-medium text-near-black transition-colors hover:bg-soft-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50 focus-visible:ring-offset-2"
          >
            Client Workspaces
          </Link>
        </header>
        <main className="w-full flex-1 bg-background p-6 lg:p-8">
          <div className="mx-auto w-full max-w-[1440px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
