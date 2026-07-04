import { LogoutButton } from "@/features/auth/logout-button";

export default function ClientsPage() {
  return (
    <main className="p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Clients</h1>
        <LogoutButton />
      </div>
      <p className="mt-2">Choose which client to work on.</p>
    </main>
  );
}
