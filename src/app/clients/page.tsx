import { redirect } from "next/navigation";

import { LogoutButton } from "@/features/auth/logout-button";
import { ClientList } from "@/features/clients/client-list";
import { getAccessibleClients } from "@/features/clients/queries";
import { resolveAuthenticatedDestination } from "@/lib/access/destination";
import { getServerUser } from "@/lib/supabase/session";

export default async function ClientsPage() {
  const { user } = await getServerUser();

  if (!user) {
    redirect("/login");
  }

  const destination = await resolveAuthenticatedDestination(user.id);

  if (destination === "/agency") {
    redirect("/agency/workspaces");
  }

  if (destination !== "/clients") {
    redirect(destination);
  }

  const clientsResult = await getAccessibleClients(user.id);

  return (
    <main className="flex-1 w-full max-w-7xl mx-auto px-4 md:px-8 py-8">
      {/* Welcome Section */}
      <section className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
        <div>
          <h1 className="text-page-title-mobile sm:text-page-title font-bold text-on-surface mb-2">Workspace Select</h1>
          <p className="text-body-lg text-on-surface-variant max-w-xl">
            Select a Client Workspace to continue.
          </p>
        </div>
        <div className="w-full md:w-auto">
          <LogoutButton className="h-12 w-full md:w-auto px-8 rounded-full font-bold border border-outline hover:bg-surface-container-low" />
        </div>
      </section>

      {clientsResult.ok ? (
        <ClientList clients={clientsResult.clients} />
      ) : (
        <div className="rounded-2xl border-2 border-dashed border-outline-variant bg-surface-container-lowest p-8 flex flex-col items-center justify-center text-center h-64 mt-6">
          <p className="text-body text-danger-strong">
            We could not load your Client Workspaces. Please try again.
          </p>
        </div>
      )}
    </main>
  );
}
