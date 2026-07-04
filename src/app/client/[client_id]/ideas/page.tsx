import { LogoutButton } from "@/features/auth/logout-button";

export default function IdeasPage() {
  return (
    <main className="p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Ideas</h1>
        <LogoutButton />
      </div>
      <p className="mt-2">Content Ideas for this client.</p>
    </main>
  );
}
