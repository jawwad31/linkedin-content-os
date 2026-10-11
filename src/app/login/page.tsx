import { redirect } from "next/navigation";

import { resolveAuthenticatedDestination } from "@/lib/access/destination";
import { getServerUser } from "@/lib/supabase/session";
import { LoginForm } from "@/features/auth/login-form";

export default async function LoginPage() {
  const { user } = await getServerUser();

  if (user) {
    redirect(await resolveAuthenticatedDestination(user.id));
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-[448px]">
        <div className="flex flex-col gap-8 rounded-dialog border border-border-subtle bg-white p-8 shadow-md md:p-10">
          <div className="flex flex-col gap-1">
            <h1 className="font-heading text-[32px] font-semibold leading-none tracking-[-0.018em] text-near-black">
              Virel
            </h1>
            <p className="text-small text-muted-foreground">Sign in to your workspace.</p>
          </div>

          <LoginForm />
        </div>
      </div>
    </main>
  );
}
