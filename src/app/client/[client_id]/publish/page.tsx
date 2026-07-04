import { LogoutButton } from "@/features/auth/logout-button";

export default function PublishPage() {
  return (
    <main className="p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Publish</h1>
        <LogoutButton />
      </div>
      <p className="mt-2">Approved posts ready to copy and publish history.</p>
    </main>
  );
}
