import { ClientList } from "@/features/clients/client-list";
import { getAgencyWorkspaces } from "@/features/agency/queries";
import { getServerUser } from "@/lib/supabase/session";

export default async function AgencyWorkspacesPage() {
  const { user } = await getServerUser();
  const result = user ? await getAgencyWorkspaces(user.id) : null;
  const errorMessage =
    result && !result.ok && result.reason === "multiple_memberships"
      ? "Multiple Agency memberships were found. Contact an administrator to resolve account configuration."
      : "We could not load Client Workspaces. Please try again.";

  return (
    <div className="w-full">
      <section className="flex flex-col gap-6 mb-12">
        <div>
          <h1 className="text-headline-lg font-bold text-on-surface mb-2">Workspace Select</h1>
          <p className="text-body-lg text-on-surface-variant max-w-xl">
            Client Workspaces available through this Agency. Select a client ecosystem to continue orchestrating content.
          </p>
        </div>
      </section>

      {result?.ok ? (
        <ClientList
          clients={result.workspaces}
          emptyTitle="No Client Workspaces yet."
          emptyDescription="Client Workspace creation is not part of this phase."
        />
      ) : (
        <div className="rounded-2xl border-2 border-dashed border-outline-variant bg-surface-container-lowest p-8 flex flex-col items-center justify-center text-center h-64 mt-6">
          <p className="text-title-md text-danger">
            {errorMessage}
          </p>
        </div>
      )}
    </div>
  );
}
