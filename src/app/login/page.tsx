import { redirect } from "next/navigation";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { resolveAuthenticatedDestination } from "@/lib/access/destination";
import { getServerUser } from "@/lib/supabase/session";
import { LoginForm } from "@/features/auth/login-form";

export default async function LoginPage() {
  const { user } = await getServerUser();

  if (user) {
    redirect(await resolveAuthenticatedDestination(user.id));
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-soft-white bg-radial-brand p-8">
      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader className="items-center text-center">
          <span
            aria-hidden="true"
            className="mb-3 flex h-14 w-14 items-center justify-center rounded-control bg-gradient-brand font-heading text-xl font-bold text-white shadow-md"
          >
            A
          </span>
          <CardTitle>Sign in to AIXelerate Content OS</CardTitle>
          <CardDescription>
            Enter your email and password to continue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </main>
  );
}
