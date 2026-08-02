import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import { FounderExperiencesPanel } from "@/features/founder-experiences/founder-experiences-panel";
import { getFounderExperiences } from "@/features/founder-experiences/queries";
import { getServerUser } from "@/lib/supabase/session";
import { getCurrentUserAccessForClient } from "@/lib/access/client-access";

export default async function FounderExperiencesPage({
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
  const result = access ? await getFounderExperiences(clientId) : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Founder Experiences"
        description="Log real operator moments so future Ideas and Posts can draw on lived experience instead of generic prompts."
      />

      {access && result ? (
        result.ok ? (
          <FounderExperiencesPanel
            clientId={clientId}
            role={access.role}
            permissions={access.permissions}
            experiences={result.experiences}
          />
        ) : (
          <p className="text-small text-danger-strong">
            We could not load founder experiences. Please try again.
          </p>
        )
      ) : null}
    </div>
  );
}
