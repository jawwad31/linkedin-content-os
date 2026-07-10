import { PageHeader } from "@/components/ui/page-header";
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
    <div>
      <PageHeader
        title="Client Workspaces"
        description="Client Workspaces available through this Agency."
      />

      {result?.ok ? (
        <ClientList
          clients={result.workspaces}
          emptyTitle="No Client Workspaces yet."
          emptyDescription="Client Workspace creation is not part of this phase."
        />
      ) : (
        <p className="mt-6 rounded-card border border-border-grey bg-white p-6 text-small text-danger">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
