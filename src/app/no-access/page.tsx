import { redirect } from "next/navigation";

import { LogoutButton } from "@/features/auth/logout-button";
import { resolveAuthenticatedDestination } from "@/lib/access/destination";
import { getServerUser } from "@/lib/supabase/session";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function NoAccessPage() {
  const { user } = await getServerUser();

  if (!user) {
    redirect("/login");
  }

  const destination = await resolveAuthenticatedDestination(user.id);

  if (destination !== "/no-access") {
    redirect(destination);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-soft-white p-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Access unavailable</CardTitle>
          <CardDescription>
            You do not currently have access to an Agency or Client Workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LogoutButton className="w-full" />
        </CardContent>
      </Card>
    </main>
  );
}
