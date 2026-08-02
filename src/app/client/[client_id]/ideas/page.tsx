import { redirect } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ContentIdeasPanel } from "@/features/ideas/management/content-ideas-panel";
import { IdeaSourceLauncher } from "@/features/ideas/management/idea-source-launcher";
import { getContentIdeas } from "@/features/ideas/management/queries";
import { getIdeaSources } from "@/features/ideas/management/source-queries";
import { getServerUser } from "@/lib/supabase/session";
import { getContentResources } from "@/features/resources/queries";
import { getCurrentUserAccessForClient } from "@/lib/access/client-access";

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

  const access = await getCurrentUserAccessForClient(user.id, clientId);
  const role = access?.role ?? null;
  const [ideasResult, sourcesResult, resourcesResult] = role
    ? await Promise.all([
        getContentIdeas(clientId),
        getIdeaSources(clientId),
        getContentResources(clientId),
      ])
    : [null, null, null];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Ideas"
        description="Review generated Content Ideas and add Founder Direction before drafting posts."
      />

      <Card>
        <CardHeader>
          <CardTitle>Generate Ideas from Approved Sources</CardTitle>
          <CardDescription>
            Choose an approved TrendCard, Founder Experience, or Trend Reaction
            to generate Content Ideas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {role && sourcesResult ? (
            sourcesResult.ok ? (
              <IdeaSourceLauncher
                clientId={clientId}
                role={role}
                permissions={access?.permissions ?? []}
                sources={sourcesResult.sources}
              />
            ) : (
              <p className="text-small text-danger-strong">
                We could not load idea sources. Please try again.
              </p>
            )
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Content Ideas</CardTitle>
          <CardDescription>
            Ideas generated from Founder Experiences, approved TrendCards, and
            Trend Reactions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {role && ideasResult ? (
            ideasResult.ok ? (
              <ContentIdeasPanel
                clientId={clientId}
                role={role}
                permissions={access?.permissions ?? []}
                ideas={ideasResult.ideas}
                resources={
                  resourcesResult?.ok
                    ? resourcesResult.resources.filter(
                        (resource) =>
                          resource.active && resource.commentGateApproved,
                      )
                    : []
                }
              />
            ) : (
              <p className="text-small text-danger-strong">
                We could not load Content Ideas. Please try again.
              </p>
            )
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
