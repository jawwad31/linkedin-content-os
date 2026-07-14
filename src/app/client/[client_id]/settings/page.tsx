import { redirect } from "next/navigation";
import { Users } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { AccessList } from "@/features/clients/invitations/access-list";
import { InviteForm } from "@/features/clients/invitations/invite-form";
import {
  getClientAccessList,
  getCurrentUserRoleForClient,
} from "@/features/clients/invitations/queries";
import { BusinessContextSection } from "@/features/setup/business-context-section";
import { OperationalLogsPanel } from "@/features/setup/operational-logs-panel";
import { getOperationalLogs } from "@/features/setup/operational-logs-queries";
import {
  canRoleManageClientUsers,
  canRoleViewOperationalLogs,
} from "@/lib/access/roles";
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
    <div>
      <PageHeader
        title="Settings"
        description="The always-on context Research, Ideas, and Posts use for this Client Workspace, plus who has access to it."
      />

      {role ? (
        <div className="mt-6 flex flex-col gap-6">
          <BusinessContextSection clientId={clientId} role={role} />

          {canRoleManageClientUsers(role) ? (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Users aria-hidden="true" className="h-5 w-5 text-brand-purple" />
                  <CardTitle>Team Access</CardTitle>
                </div>
                <CardDescription>
                  Invite collaborators and manage who has access to this
                  Client Workspace.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-6">
                <InviteForm clientId={clientId} />
                <TeamAccessList clientId={clientId} />
              </CardContent>
            </Card>
          ) : null}

          {canRoleViewOperationalLogs(role) ? (
            <OperationalLogsSection clientId={clientId} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

async function TeamAccessList({ clientId }: { clientId: string }) {
  const result = await getClientAccessList(clientId);

  if (!result.ok) {
    return (
      <p className="text-small text-danger-strong">
        We could not load team access. Please try again.
      </p>
    );
  }

  return <AccessList clientId={clientId} members={result.members} />;
}

async function OperationalLogsSection({ clientId }: { clientId: string }) {
  const result = await getOperationalLogs(clientId);

  if (!result.ok) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Activity & AI Logs</CardTitle>
          <CardDescription>
            Owner-only operational view of recent client activity and safe AI
            usage metadata.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-small text-danger-strong">
            We could not load operational logs. Please try again.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <OperationalLogsPanel
      auditLogs={result.auditLogs}
      llmLogs={result.llmLogs}
    />
  );
}
