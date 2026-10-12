import { redirect } from "next/navigation";

import { LogoutButton } from "@/features/auth/logout-button";
import { ClientList } from "@/features/clients/client-list";
import { getAccessibleClients } from "@/features/clients/queries";
import { getServerUser } from "@/lib/supabase/session";

/**
 * Companies: shown to someone who can reach more than one company (an agency
 * admin). A person with exactly one company never sees it; sign-in takes them
 * straight in. Companies are created and removed with the SQL scripts in
 * `supabase/admin-scripts/`, not here.
 */
export default async function ClientsPage() {
  const { user } = await getServerUser();

  if (!user) {
    redirect("/login");
  }

  const clientsResult = await getAccessibleClients(user.id);

  if (clientsResult.ok && clientsResult.clients.length === 1) {
    redirect(`/client/${clientsResult.clients[0].id}/posts`);
  }

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 md:px-8">
      <section className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-page-title-mobile font-heading font-semibold text-near-black sm:text-page-title">Companies</h1>
          <p className="mt-1 text-small text-muted-foreground">Select a company to continue.</p>
        </div>
        <LogoutButton className="w-full sm:w-auto" />
      </section>

      {clientsResult.ok ? (
        <ClientList clients={clientsResult.clients} />
      ) : (
        <p role="alert" className="rounded-card border border-border-grey bg-white p-6 text-small text-danger-strong">
          Could not load your companies. Nothing was changed. Refresh the page to try again.
        </p>
      )}
    </main>
  );
}
