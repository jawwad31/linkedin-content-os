import { redirect } from "next/navigation";

import { LogoutButton } from "@/features/auth/logout-button";
import { ClientList } from "@/features/clients/client-list";
import { getAccessibleClients } from "@/features/clients/queries";
import { getServerUser } from "@/lib/supabase/session";

export default async function ClientsPage() {
  const { user } = await getServerUser();

  if (!user) {
    redirect("/login");
  }

  const result = await getAccessibleClients(user.id);

  return (
    <main className="p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Clients</h1>
        <LogoutButton />
      </div>
      <p className="mt-2">Choose which client to work on.</p>

      {result.ok ? (
        <ClientList clients={result.clients} />
      ) : (
        <p className="mt-6 text-small text-danger">
          We could not load your clients. Please try again.
        </p>
      )}
    </main>
  );
}
