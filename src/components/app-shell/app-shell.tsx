import type { ReactNode } from "react";

import type { ClientRole } from "@/features/clients/invitations/schemas";

import { AppHeader } from "./app-header";
import { AppSidebar } from "./app-sidebar";

export function AppShell({
  clientId,
  clientName,
  role,
  children,
}: {
  clientId: string;
  clientName: string;
  role: ClientRole;
  children: ReactNode;
}) {
  return (
    <div className="lg:flex lg:min-h-screen">
      <AppSidebar clientId={clientId} clientName={clientName} role={role} />
      <div className="flex w-full flex-1 flex-col">
        <AppHeader clientId={clientId} clientName={clientName} role={role} />
        <main className="w-full flex-1 bg-background p-6 lg:p-8">
          <div className="mx-auto w-full max-w-[1440px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
