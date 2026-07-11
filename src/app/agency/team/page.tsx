import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { getAgencyTeam } from "@/features/agency/queries";
import { formatUtcDate } from "@/lib/format/date";
import { getServerUser } from "@/lib/supabase/session";

function getMemberDisplayName(member: {
  invitedEmail: string | null;
  profileName: string | null;
}) {
  return (
    member.invitedEmail?.trim() ||
    member.profileName?.trim() ||
    "Agency administrator"
  );
}

export default async function AgencyTeamPage() {
  const { user } = await getServerUser();
  const result = user ? await getAgencyTeam(user.id) : null;
  const errorMessage =
    result && !result.ok && result.reason === "multiple_memberships"
      ? "Multiple Agency memberships were found. Contact an administrator to resolve account configuration."
      : "We could not load Agency team members. Please try again.";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Agency Team"
        description="Accepted Agency Admin members."
      />

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>
            Phase 1 keeps Agency team management read-only.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {result?.ok ? (
            result.members.length === 0 ? (
              <p className="text-small text-muted-foreground">
                No accepted Agency members found.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {result.members.map((member) => (
                  <li
                    key={member.id}
                    className="flex flex-col gap-3 rounded-card border border-border-grey bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-body font-medium">
                        {getMemberDisplayName(member)}
                      </p>
                      <p className="mt-1 truncate font-mono text-caption text-muted-foreground">
                        {member.agencyName ?? result.access.agencyName} | Joined{" "}
                        {formatUtcDate(member.createdAt)}
                      </p>
                    </div>
                    <Badge variant="neutral">Agency Admin</Badge>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <p className="text-small text-danger">
              {errorMessage}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
