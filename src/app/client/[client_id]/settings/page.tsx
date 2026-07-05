import { redirect } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AccessList } from "@/features/clients/invitations/access-list";
import { InviteForm } from "@/features/clients/invitations/invite-form";
import {
  getClientAccessList,
  getCurrentUserRoleForClient,
} from "@/features/clients/invitations/queries";
import { BusinessContextSection } from "@/features/setup/business-context-section";
import { getServerUser } from "@/lib/supabase/session";

export default async function SetupPage({
  params,
}: {
  params: Promise<{ client_id: string }>;
}) {
  const { client_id: clientId } = await params;
  const { user } = await getServerUser();

  if (!user) {
    redirect("/login");
  }

  const role = await getCurrentUserRoleForClient(user.id, clientId);

  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold">Setup</h1>
      <p className="mt-2">Business context for this client.</p>

      {role ? (
        <BusinessContextSection clientId={clientId} role={role} />
      ) : null}

      {role === "owner" ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Team Access</CardTitle>
            <CardDescription>
              Invite collaborators and manage who has access to this client.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <InviteForm clientId={clientId} />
            <TeamAccessList clientId={clientId} />
          </CardContent>
        </Card>
      ) : null}
    </main>
  );
}

async function TeamAccessList({ clientId }: { clientId: string }) {
  const result = await getClientAccessList(clientId);

  if (!result.ok) {
    return (
      <p className="text-small text-danger">
        We could not load team access. Please try again.
      </p>
    );
  }

  return <AccessList clientId={clientId} members={result.members} />;
}
