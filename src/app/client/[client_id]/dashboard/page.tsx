import { DashboardView } from "@/features/dashboard/dashboard-view";
import { getDashboardMetrics } from "@/features/dashboard/queries";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ client_id: string }>;
}) {
  const { client_id: clientId } = await params;

  const result = await getDashboardMetrics(clientId);

  return (
    <div>
      {result.ok ? (
        <DashboardView clientId={clientId} metrics={result.metrics} />
      ) : (
        <p className="text-small text-danger">
          Could not load dashboard metrics. Refresh and try again.
        </p>
      )}
    </div>
  );
}
