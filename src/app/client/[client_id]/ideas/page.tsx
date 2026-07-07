import { redirect } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentUserRoleForClient } from "@/features/clients/invitations/queries";
import { ContentIdeasPanel } from "@/features/ideas/management/content-ideas-panel";
import { getContentIdeas } from "@/features/ideas/management/queries";
import { getServerUser } from "@/lib/supabase/session";

export default async function IdeasPage({
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
  const result = role ? await getContentIdeas(clientId) : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Ideas"
        description="Review generated Content Ideas and add Founder Direction before drafting posts."
      />

      <Card>
        <CardHeader>
          <CardTitle>Content Ideas</CardTitle>
          <CardDescription>
            Ideas generated from Founder Experiences, approved TrendCards, and
            Trend Reactions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {role === "viewer" ? (
            <p className="mb-4 rounded-control border border-border-grey bg-soft-white px-3 py-2 text-small font-medium text-muted-foreground">
              Your role is view-only for this client.
            </p>
          ) : null}

          {role && result ? (
            result.ok ? (
              <ContentIdeasPanel
                clientId={clientId}
                role={role}
                ideas={result.ideas}
              />
            ) : (
              <p className="text-small text-danger">
                We could not load Content Ideas. Please try again.
              </p>
            )
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
