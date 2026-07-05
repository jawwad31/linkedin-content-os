import type { ReactNode } from "react";
import { notFound } from "next/navigation";

import { AppShell } from "@/components/app-shell/app-shell";
import { getClientShellAccess } from "@/lib/access/client-access";

export default async function ClientLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ client_id: string }>;
}) {
  const { client_id: clientId } = await params;

  const access = await getClientShellAccess(clientId);

  if (!access.ok) {
    notFound();
  }

  return (
    <AppShell
      clientId={access.clientId}
      clientName={access.clientName}
      role={access.role}
    >
      {children}
    </AppShell>
  );
}
