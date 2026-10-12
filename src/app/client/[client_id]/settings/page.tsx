import { redirect } from "next/navigation";
import { FileText } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ListError } from "@/components/ui/list-error";
import { PageHeader } from "@/components/ui/page-header";
import { AccountTeamManagement } from "@/features/access-management/team-management";
import { AccountUserProvisionForm } from "@/features/access-management/user-provision-form";
import {
  InviteMemberButton,
  InviteMemberPanel,
  InviteMemberScope,
} from "@/features/access-management/invite-member";
import { getAccountTeam } from "@/features/access-management/queries";
import { SettingsTabs, type SettingsTab } from "@/features/setup/settings-tabs";
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
  searchParams,
}: {
  params: Promise<{ client_id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { client_id: clientId } = await params;
  const { tab } = await searchParams;
  const { user } = await getServerUser();

  if (!user) {
    redirect("/login");
  }

  const role = await getCurrentUserRoleForClient(user.id, clientId);
  const description = "Manage this Account's content context, reference documents, and user access.";

  return (
    <InviteMemberScope>
      {role ? (
        <SettingsTabs
          title="Settings"
          description={description}
          initialTab={typeof tab === "string" ? tab : undefined}
          tabs={[
            {
              id: "business",
              label: "Business context",
              content: <BusinessContextSection clientId={clientId} role={role} />,
            },
            {
              id: "documents",
              label: "Documents",
              content: (
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <FileText aria-hidden="true" className="h-5 w-5 text-link" />
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
              ),
            },
            ...(canRoleManageClientUsers(role)
              ? [{
                  id: "team" as const,
                  label: "Team access",
                  action: <InviteMemberButton />,
                  content: (
                    <div className="flex flex-col gap-6">
                      <p className="max-w-3xl text-small text-muted-foreground">
                        Create users with immediate access, choose Account User permissions,
                        and manage passwords. No email is sent.
                      </p>
                      <InviteMemberPanel>
                        <AccountUserProvisionForm clientId={clientId} />
                      </InviteMemberPanel>
                      <TeamAccessList clientId={clientId} />
                    </div>
                  ),
                }]
              : []),
            ...(canRoleViewOperationalLogs(role)
              ? [{
                  id: "logs" as const,
                  label: "Activity & AI logs",
                  content: <OperationalLogsSection clientId={clientId} />,
                }]
              : []),
          ] satisfies SettingsTab[]}
        />
      ) : (
        <PageHeader title="Settings" description={description} />
      )}
    </InviteMemberScope>
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
    return <ListError />;
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
          <ListError />
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
