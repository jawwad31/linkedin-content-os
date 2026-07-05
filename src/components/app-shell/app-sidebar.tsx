import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { LogoutButton } from "@/features/auth/logout-button";
import type { ClientRole } from "@/features/clients/invitations/schemas";

import { AppNav } from "./app-nav";

const ROLE_LABELS: Record<ClientRole, string> = {
  owner: "Owner",
  editor: "Editor",
  viewer: "Viewer",
};

export function AppSidebar({
  clientId,
  clientName,
  role,
}: {
  clientId: string;
  clientName: string;
  role: ClientRole;
}) {
  return (
    <aside className="flex flex-col gap-4 bg-near-black p-4 text-soft-white lg:h-screen lg:w-64 lg:shrink-0 lg:sticky lg:top-0 lg:gap-6 lg:p-6">
      <div className="flex items-center gap-2 px-1">
        <span
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-gradient-brand font-heading text-sm font-bold text-white"
        >
          A
        </span>
        <span className="text-small font-heading font-semibold">
          AIXelerate Content OS
        </span>
      </div>

      <div className="flex flex-col gap-2 rounded-control border border-white/10 bg-white/5 p-3">
        <div className="flex items-center justify-between">
          <span className="text-caption font-mono uppercase tracking-wide text-soft-white/50">
            Current client
          </span>
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-success" />
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-body font-medium">{clientName}</span>
          <Badge variant="neutral">{ROLE_LABELS[role]}</Badge>
        </div>
        <Link
          href="/clients"
          className="mt-1 rounded-control border border-white/10 px-3 py-1.5 text-center text-small font-medium text-soft-white/70 transition-colors hover:bg-white/10 hover:text-soft-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50 focus-visible:ring-offset-2 focus-visible:ring-offset-near-black"
        >
          Switch workspace
        </Link>
      </div>

      <AppNav clientId={clientId} />

      <div className="lg:mt-auto">
        <LogoutButton className="w-full justify-start text-soft-white/60 hover:bg-white/5 hover:text-soft-white" />
      </div>
    </aside>
  );
}
