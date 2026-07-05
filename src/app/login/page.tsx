import { redirect } from "next/navigation";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { getServerUser } from "@/lib/supabase/session";
import { LoginForm } from "@/features/auth/login-form";

export default async function LoginPage() {
  const { user } = await getServerUser();

  if (user) {
    redirect("/clients");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-soft-white p-8">
      <Card className="w-full max-w-sm shadow-sm">
        <CardHeader className="items-center text-center">
          <span
            aria-hidden="true"
            className="mb-2 flex h-12 w-12 items-center justify-center rounded-control bg-gradient-brand font-heading text-lg font-bold text-white"
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
