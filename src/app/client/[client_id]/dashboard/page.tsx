import { redirect } from "next/navigation";

import { DashboardView } from "@/features/dashboard/dashboard-view";
import { getDashboardMetrics } from "@/features/dashboard/queries";
import { getCurrentUserRoleForClient } from "@/lib/access/client-access";
import { getServerUser } from "@/lib/supabase/session";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ client_id: string }>;
}) {
  const { client_id: clientId } = await params;
  const { user } = await getServerUser();

  if (!user) {
    redirect("/login");
  }

  const role = await getCurrentUserRoleForClient(user.id, clientId);
  if (!role) {
    return (
      <div className="rounded-card border border-border-grey bg-white p-6 text-small text-danger">
        You do not have access to this client.
      </div>
    );
  }

  const result = await getDashboardMetrics(clientId);

  return (
    <div>
      {result.ok ? (
        <DashboardView
          clientId={clientId}
          metrics={result.metrics}
          role={role}
        />
      ) : (
        <p className="text-small text-danger">
          Could not load dashboard metrics. Refresh and try again.
        </p>
      )}
    </div>
  );
}
