import { LogoutButton } from "@/features/auth/logout-button";

export default function DashboardPage() {
  return (
    <main className="p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <LogoutButton />
      </div>
      <p className="mt-2">High-level operating status for this client.</p>
    </main>
  );
}
