import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { getAgencyManagementData } from "@/features/access-management/queries";
import {
  AccountTeamManagement,
  AgencyMemberManagement,
} from "@/features/access-management/team-management";
import { AgencyUserProvisionForm } from "@/features/access-management/user-provision-form";

export default async function AgencySettingsPage() {
  const result = await getAgencyManagementData();
  if (!result.ok) {
    return (
      <p className="rounded-card border border-border-grey bg-white p-6 text-small text-danger-strong">
        {result.message}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Agency Settings"
        description="Manage Agency Admins and assign Account Admin or Account User access across the Agency."
      />

      <Card>
        <CardHeader>
          <CardTitle>Add a user</CardTitle>
          <CardDescription>
            Create a login or assign an existing login. Access is immediate and
            no invitation email is sent.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AgencyUserProvisionForm accounts={result.data.accounts} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Agency Admins</CardTitle>
          <CardDescription>Users with access to every Account in this Agency.</CardDescription>
        </CardHeader>
        <CardContent>
          <AgencyMemberManagement members={result.data.agencyMembers} />
        </CardContent>
      </Card>

      {result.data.accounts.map((account) => (
        <Card key={account.id}>
          <CardHeader>
            <CardTitle>{account.name}</CardTitle>
            <CardDescription>Direct Account Admin and Account User access.</CardDescription>
          </CardHeader>
          <CardContent>
            <AccountTeamManagement
              clientId={account.id}
              members={result.data.accountAccess.filter(
                (membership) => membership.clientId === account.id,
              )}
            />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
