import { redirect } from "next/navigation";
import { FileText, Users } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { AccountTeamManagement } from "@/features/access-management/team-management";
import { AccountUserProvisionForm } from "@/features/access-management/user-provision-form";
import { getAccountTeam } from "@/features/access-management/queries";
import { BusinessContextSection } from "@/features/setup/business-context-section";
import { OperationalLogsPanel } from "@/features/setup/operational-logs-panel";
import { getOperationalLogs } from "@/features/setup/operational-logs-queries";
import { DocumentManager } from "@/features/documents/document-manager";
import { listClientDocuments } from "@/features/documents/service";
import {
  canRoleManageClientUsers,
  canRoleViewOperationalLogs,
} from "@/lib/access/roles";
import { getCurrentUserRoleForClient } from "@/lib/access/client-access";
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
        description="Manage this Account's content context, reference documents, and user access."
      />

      {role ? (
        <div className="mt-6 flex flex-col gap-6">
          <BusinessContextSection clientId={clientId} role={role} />

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <FileText aria-hidden="true" className="h-5 w-5 text-brand-orange" />
                <CardTitle>Supporting Documents & Evidence</CardTitle>
              </div>
              <CardDescription>
                Upload markdown briefs, customer interviews, and evidence files. Scoped retrieval
                extracts relevant proof during drafting without polluting prompt logs.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DocumentsSection clientId={clientId} role={role} />
            </CardContent>
          </Card>

          {canRoleManageClientUsers(role) ? (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Users aria-hidden="true" className="h-5 w-5 text-brand-purple" />
                  <CardTitle>Team Access</CardTitle>
                </div>
                <CardDescription>
                  Create users with immediate access, choose Account User permissions,
                  and manage passwords. No email is sent.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-6">
                <AccountUserProvisionForm clientId={clientId} />
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

async function DocumentsSection({
  clientId,
  role,
}: {
  clientId: string;
  role: NonNullable<Awaited<ReturnType<typeof getCurrentUserRoleForClient>>>;
}) {
  const docs = await listClientDocuments(clientId);
  return <DocumentManager clientId={clientId} role={role} documents={docs} />;
}

async function TeamAccessList({ clientId }: { clientId: string }) {
  const result = await getAccountTeam(clientId);

  if (!result.ok) {
    return (
      <p className="text-small text-danger-strong">
        We could not load team access. Please try again.
      </p>
    );
  }

  return <AccountTeamManagement clientId={clientId} members={result.members} />;
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
