import { redirect } from "next/navigation";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentUserRoleForClient } from "@/lib/access/client-access";
import { ContentResourcesPanel } from "@/features/resources/content-resources-panel";
import { getContentResources } from "@/features/resources/queries";
import { getServerUser } from "@/lib/supabase/session";

export default async function ResourcesPage({
  params,
}: {
  params: Promise<{ client_id: string }>;
}) {
  const { client_id: clientId } = await params;
  const { user } = await getServerUser();
  if (!user) redirect("/login");

  const role = await getCurrentUserRoleForClient(user.id, clientId);
  const resourcesResult = role ? await getContentResources(clientId) : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Content Resources"
        description="Manage real guides, templates, checklists, reports, worksheets, and tools that can support an occasional resource post."
      />
      <Card>
        <CardHeader>
          <CardTitle>Resource Library</CardTitle>
          <CardDescription>
            Approved resources may be selected during idea planning. Delivery remains manual.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {role && resourcesResult ? (
            resourcesResult.ok ? (
              <ContentResourcesPanel
                clientId={clientId}
                role={role}
                resources={resourcesResult.resources}
              />
            ) : (
              <p className="text-small text-danger-strong">
                We could not load Content Resources. Please try again.
              </p>
            )
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
