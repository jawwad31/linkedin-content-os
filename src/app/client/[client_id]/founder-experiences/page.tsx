import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import { getCurrentUserRoleForClient } from "@/features/clients/invitations/queries";
import { FounderExperiencesPanel } from "@/features/founder-experiences/founder-experiences-panel";
import { getFounderExperiences } from "@/features/founder-experiences/queries";
import { getServerUser } from "@/lib/supabase/session";

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

  const role = await getCurrentUserRoleForClient(user.id, clientId);
  const result = role ? await getFounderExperiences(clientId) : null;

  return (
    <div>
      <PageHeader
        title="Founder Knowledge"
        description="Log real operator moments so future ideas can use lived experience instead of generic prompts."
      />

      <div className="mt-6">
        {role && result ? (
          result.ok ? (
            <FounderExperiencesPanel
              clientId={clientId}
              role={role}
              experiences={result.experiences}
            />
          ) : (
            <p className="text-small text-danger">
              We could not load founder experiences. Please try again.
            </p>
          )
        ) : null}
      </div>
    </div>
  );
}
