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
    <main className="p-8">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="mt-2">
        Track setup, research, ideas, and post readiness for this client.
      </p>

      {result.ok ? (
        <DashboardView clientId={clientId} metrics={result.metrics} />
      ) : (
        <p className="mt-6 text-small text-danger">
          Could not load dashboard metrics. Refresh and try again.
        </p>
      )}
    </main>
  );
}
