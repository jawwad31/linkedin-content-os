import type { ReactNode } from "react";

import type { EffectiveClientRole } from "@/lib/access/roles";

import { AppHeader } from "./app-header";
import { AppSidebar } from "./app-sidebar";

export function AppShell({
  clientId,
  clientName,
  agencyName,
  role,
  children,
}: {
  clientId: string;
  clientName: string;
  agencyName: string | null;
  role: EffectiveClientRole;
  children: ReactNode;
}) {
  return (
    <div className="lg:flex lg:min-h-screen">
      <AppSidebar
        clientId={clientId}
        clientName={clientName}
        agencyName={agencyName}
        role={role}
      />
      <div className="flex w-full flex-1 flex-col">
        <AppHeader
          clientId={clientId}
          clientName={clientName}
          agencyName={agencyName}
          role={role}
        />
        <main className="w-full flex-1 bg-background p-6 lg:p-8">
          <div className="mx-auto w-full max-w-[1440px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
