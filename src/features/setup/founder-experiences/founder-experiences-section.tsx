import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ClientRole } from "@/features/clients/invitations/schemas";

import { FounderExperiencesPanel } from "./founder-experiences-panel";
import { getFounderExperiences } from "./queries";

export async function FounderExperiencesSection({
  clientId,
  role,
}: {
  clientId: string;
  role: ClientRole;
}) {
  const result = await getFounderExperiences(clientId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Founder Experiences</CardTitle>
        <CardDescription>
          Log real operator moments so future ideas can use lived experience
          instead of generic prompts.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {result.ok ? (
          <FounderExperiencesPanel
            clientId={clientId}
            role={role}
            experiences={result.experiences}
          />
        ) : (
          <p className="text-small text-danger">
            We could not load founder experiences. Please try again.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
