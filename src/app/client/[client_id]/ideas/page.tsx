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
import { IdeaSourceLauncher } from "@/features/ideas/management/idea-source-launcher";
import { getContentIdeas } from "@/features/ideas/management/queries";
import { getIdeaSources } from "@/features/ideas/management/source-queries";
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
  const [ideasResult, sourcesResult] = role
    ? await Promise.all([getContentIdeas(clientId), getIdeaSources(clientId)])
    : [null, null];

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
                sources={sourcesResult.sources}
              />
            ) : (
              <p className="text-small text-danger">
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
                ideas={ideasResult.ideas}
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
