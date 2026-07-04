import { LogoutButton } from "@/features/auth/logout-button";

export default function SetupPage() {
  return (
    <main className="p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Setup</h1>
        <LogoutButton />
      </div>
      <p className="mt-2">Business context for this client.</p>
    </main>
  );
}
