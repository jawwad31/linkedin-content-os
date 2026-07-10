import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { AgencyShell } from "@/components/app-shell/agency-shell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LogoutButton } from "@/features/auth/logout-button";
import { getAgencyAccessForUser } from "@/lib/access/agency-access";
import { resolveAuthenticatedDestination } from "@/lib/access/destination";
import { getServerUser } from "@/lib/supabase/session";

export default async function AgencyLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { user } = await getServerUser();

  if (!user) {
    redirect("/login");
  }

  const accessResult = await getAgencyAccessForUser(user.id);

  if (!accessResult.ok) {
    if (accessResult.reason === "multiple_memberships") {
      return (
        <AgencyConfigurationError
          message="Multiple Agency memberships were found. Contact an administrator to resolve account configuration."
        />
      );
    }

    if (accessResult.reason === "query_failed") {
      return (
        <AgencyConfigurationError message="We could not load Agency access. Please try again." />
      );
    }

    const destination = await resolveAuthenticatedDestination(user.id);
    redirect(destination === "/agency" ? "/no-access" : destination);
  }

  return (
    <AgencyShell agencyName={accessResult.access.agencyName}>
      {children}
    </AgencyShell>
  );
}

function AgencyConfigurationError({ message }: { message: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-soft-white p-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Agency access unavailable</CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
        <CardContent>
          <LogoutButton className="w-full" />
        </CardContent>
      </Card>
    </main>
  );
}
