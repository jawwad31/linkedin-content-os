import type { ReactNode } from "react";

import { canRoleContributeResearch } from "@/lib/access/roles";
import type { ClientPermission, EffectiveClientRole } from "@/lib/access/roles";

import { AppSidebar } from "./app-sidebar";
import { MobileClientNav } from "./mobile-client-nav";

export function AppShell({
  clientId,
  clientName,
  role,
  permissions,
  accessibleClientCount,
  postsNeedingYou,
  children,
}: {
  clientId: string;
  clientName: string;
  role: EffectiveClientRole;
  permissions: ClientPermission[];
  accessibleClientCount: number;
  postsNeedingYou: number;
  children: ReactNode;
}) {
  const showResearch = canRoleContributeResearch(role, permissions);

  return (
    <div className="lg:flex lg:min-h-screen">
      <MobileClientNav
        clientId={clientId}
        clientName={clientName}
        role={role}
        accessibleClientCount={accessibleClientCount}
        showResearch={showResearch}
        postsNeedingYou={postsNeedingYou}
      />
      <AppSidebar
        clientId={clientId}
        clientName={clientName}
        role={role}
        accessibleClientCount={accessibleClientCount}
        showResearch={showResearch}
        postsNeedingYou={postsNeedingYou}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <main
          data-client-shell
          className="group/shell w-full flex-1 overflow-x-clip bg-background p-4 sm:p-6 lg:px-8 lg:pb-6 lg:pt-0"
        >
          <div className="mx-auto w-full max-w-[1280px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
