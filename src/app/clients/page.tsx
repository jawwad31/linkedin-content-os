import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import { LogoutButton } from "@/features/auth/logout-button";
import { ClientList } from "@/features/clients/client-list";
import { PendingInvitations } from "@/features/clients/invitations/pending-invitations";
import { getPendingInvitationsForCurrentUser } from "@/features/clients/invitations/queries";
import { getAccessibleClients } from "@/features/clients/queries";
import { getServerUser } from "@/lib/supabase/session";

export default async function ClientsPage() {
  const { user } = await getServerUser();

  if (!user) {
    redirect("/login");
  }

  const [clientsResult, invitationsResult] = await Promise.all([
    getAccessibleClients(user.id),
    getPendingInvitationsForCurrentUser(),
  ]);

  return (
    <main className="mx-auto w-full max-w-[1440px] p-6 lg:p-8">
      <PageHeader
        title="Client Workspaces"
        description="Choose which Client Workspace to work on."
        action={<LogoutButton />}
      />

      {invitationsResult.ok && invitationsResult.invitations.length > 0 ? (
        <PendingInvitations invitations={invitationsResult.invitations} />
      ) : null}

      {clientsResult.ok ? (
        <ClientList clients={clientsResult.clients} />
      ) : (
        <p className="mt-6 text-small text-danger">
          We could not load your Client Workspaces. Please try again.
        </p>
      )}
    </main>
  );
}
