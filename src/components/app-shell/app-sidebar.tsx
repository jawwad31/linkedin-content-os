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
      <div className="flex flex-col gap-3">
        <span className="text-small font-heading font-semibold">
          AIXelerate Content OS
        </span>
        <div className="flex items-center gap-2">
          <span className="truncate text-body font-medium">{clientName}</span>
          <Badge variant="neutral">{ROLE_LABELS[role]}</Badge>
        </div>
      </div>

      <AppNav clientId={clientId} />

      <div className="flex flex-row items-center justify-between gap-2 lg:mt-auto lg:flex-col lg:items-stretch">
        <Link
          href="/clients"
          className="rounded-control px-3 py-2 text-small font-medium text-soft-white/60 transition-colors hover:bg-white/5 hover:text-soft-white"
        >
          Back to Clients
        </Link>
        <LogoutButton className="text-soft-white/60 hover:bg-white/5 hover:text-soft-white" />
      </div>
    </aside>
  );
}
