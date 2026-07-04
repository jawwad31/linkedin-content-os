import { LogoutButton } from "@/features/auth/logout-button";

export default function ResearchPage() {
  return (
    <main className="p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Research</h1>
        <LogoutButton />
      </div>
      <p className="mt-2">Collected Articles and Market Signals.</p>
    </main>
  );
}
