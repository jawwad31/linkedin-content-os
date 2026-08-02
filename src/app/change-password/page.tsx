import { redirect } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ChangePasswordForm } from "@/features/access-management/change-password-form";
import { resolveAuthenticatedDestination } from "@/lib/access/destination";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/session";

export default async function ChangePasswordPage() {
  const { user } = await getServerUser({ allowPasswordChangeRequired: true });
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("must_change_password")
    .eq("id", user.id)
    .maybeSingle<{ must_change_password: boolean }>();

  if (!profile?.must_change_password) {
    redirect(await resolveAuthenticatedDestination(user.id));
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-soft-white p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Replace your temporary password</CardTitle>
          <CardDescription>
            Your administrator created or reset this login manually. Choose a
            private password before using the app.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </main>
  );
}
