import { redirect } from "next/navigation";

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
    <main className="p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Clients</h1>
        <LogoutButton />
      </div>
      <p className="mt-2">Choose which client to work on.</p>

      {invitationsResult.ok && invitationsResult.invitations.length > 0 ? (
        <PendingInvitations invitations={invitationsResult.invitations} />
      ) : null}

      {clientsResult.ok ? (
        <ClientList clients={clientsResult.clients} />
      ) : (
        <p className="mt-6 text-small text-danger">
          We could not load your clients. Please try again.
        </p>
      )}
    </main>
  );
}
