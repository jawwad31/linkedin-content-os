import type { ReactNode } from "react";
import { notFound } from "next/navigation";

import { AppShell } from "@/components/app-shell/app-shell";
import { getClientShellAccess } from "@/lib/access/client-access";
import { createClient } from "@/lib/supabase/server";

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

  // Posts waiting on a person (review, needs edits, approved and ready to publish by hand).
  // A failed count only hides the badge; it must never break the page.
  const { count } = await (await createClient())
    .from("posts")
    .select("id", { count: "exact", head: true })
    .eq("client_id", access.clientId)
    .in("status", ["review", "needs_edit", "approved"]);

  return (
    <AppShell
      clientId={access.clientId}
      clientName={access.clientName}
      role={access.role}
      permissions={access.permissions}
      postsNeedingYou={count ?? 0}
    >
      {children}
    </AppShell>
  );
}
