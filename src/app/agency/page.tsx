import Link from "next/link";
import { ArrowRight, Building2, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { getAgencyOverview } from "@/features/agency/queries";
import { formatUtcDate } from "@/lib/format/date";
import { getServerUser } from "@/lib/supabase/session";

export default async function AgencyPage() {
  const { user } = await getServerUser();
  const result = user ? await getAgencyOverview(user.id) : null;

  if (!result?.ok) {
    const message =
      result && !result.ok && result.reason === "multiple_memberships"
        ? "Multiple Agency memberships were found. Contact an administrator to resolve account configuration."
        : "We could not load Agency details. Please try again.";

    return (
      <p className="rounded-card border border-border-grey bg-white p-6 text-small text-danger">
        {message}
      </p>
    );
  }

  const recentWorkspaces = result.workspaces.slice(0, 6);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={result.access.agencyName}
        description="Agency overview for Client Workspace access."
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>Client Workspaces</CardTitle>
                <CardDescription>
                  Workspaces available through this Agency.
                </CardDescription>
              </div>
              <Building2 aria-hidden="true" className="h-5 w-5 text-brand-orange" />
            </div>
          </CardHeader>
          <CardContent className="flex items-end justify-between gap-3">
            <span className="font-mono text-3xl">
              {result.workspaces.length}
            </span>
            <Link
              href="/agency/workspaces"
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              View workspaces
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>Agency Team</CardTitle>
                <CardDescription>
                  Accepted Agency Admin members.
                </CardDescription>
              </div>
              <Users aria-hidden="true" className="h-5 w-5 text-brand-purple" />
            </div>
          </CardHeader>
          <CardContent className="flex items-end justify-between gap-3">
            <span className="font-mono text-3xl">
              {result.teamMemberCount}
            </span>
            <Link
              href="/agency/team"
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              View team
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Available Client Workspaces</CardTitle>
          <CardDescription>
            Open a Client Workspace to manage its content workflow.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recentWorkspaces.length === 0 ? (
            <p className="text-small text-muted-foreground">
              No Client Workspaces are available yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {recentWorkspaces.map((workspace) => (
                <li
                  key={workspace.id}
                  className="flex flex-col gap-3 rounded-card border border-border-grey bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-near-black">
                        {workspace.name}
                      </span>
                      <Badge variant="neutral">Agency Admin</Badge>
                    </div>
                    <p className="mt-1 truncate font-mono text-caption text-muted-foreground">
                      Updated {formatUtcDate(workspace.updatedAt)}
                    </p>
                  </div>
                  <Link
                    href={`/client/${workspace.id}/dashboard`}
                    className={buttonVariants({
                      variant: "secondary",
                      size: "sm",
                    })}
                  >
                    Open
                    <ArrowRight aria-hidden="true" className="h-4 w-4" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
