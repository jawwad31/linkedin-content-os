import { Plus } from "lucide-react";
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
      <section className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
        <div>
          <h1 className="text-headline-lg font-bold text-on-surface mb-2">Workspace Select</h1>
          <p className="text-body-lg text-on-surface-variant max-w-xl">
            Client Workspaces available through this Agency. Select a client ecosystem to continue orchestrating content.
          </p>
        </div>
        <div className="w-full md:w-auto">
          {/* Add Client is restricted to agency admin, this page is only accessible by agency admins anyway */}
          <button className="bg-gradient-brand text-white font-label-lg flex items-center justify-center gap-2 px-8 py-4 rounded-full shadow-lg hover:opacity-90 active:scale-95 transition-all w-full md:w-auto">
            <Plus className="w-5 h-5" />
            Add Client
          </button>
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
