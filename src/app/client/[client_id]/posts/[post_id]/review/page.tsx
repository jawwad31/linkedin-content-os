import { LogoutButton } from "@/features/auth/logout-button";

export default function PostReviewPage() {
  return (
    <main className="p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Post Review</h1>
        <LogoutButton />
      </div>
      <p className="mt-2">Review this post before approval.</p>
    </main>
  );
}
