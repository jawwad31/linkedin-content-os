import Link from "next/link";
import { redirect } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AccountPasswordForm } from "@/features/access-management/account-password-form";
import { resolveAuthenticatedDestination } from "@/lib/access/destination";
import { getServerUser } from "@/lib/supabase/session";

export default async function AccountPasswordPage() {
  const { user } = await getServerUser();
  if (!user) redirect("/login");

  const backHref = await resolveAuthenticatedDestination(user.id);

  return (
    <main className="flex min-h-screen items-center justify-center bg-soft-white p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Change your password</CardTitle>
          <CardDescription>
            Signed in as {user.email}. Enter your current password, then choose a new one.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <AccountPasswordForm />
          <Link href={backHref} className="text-small text-link underline-offset-2 hover:underline">
            Back to the app
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
