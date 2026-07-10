import {
  canRoleMutateClientWorkflow,
  type EffectiveClientRole,
} from "@/lib/access/roles";

import { FounderExperienceCard } from "./founder-experience-card";
import { FounderExperienceForm } from "./founder-experience-form";
import type { FounderExperience } from "./queries";

export function FounderExperiencesPanel({
  clientId,
  role,
  experiences,
}: {
  clientId: string;
  role: EffectiveClientRole;
  experiences: FounderExperience[];
}) {
  const canManage = canRoleMutateClientWorkflow(role);

  return (
    <div className="flex flex-col gap-6">
      {!canManage ? (
        <p className="rounded-control border border-border-grey bg-soft-white px-3 py-2 text-small font-medium text-muted-foreground">
          You do not have permission to update workflow content for this
          Client Workspace.
        </p>
      ) : null}

      {canManage ? <FounderExperienceForm clientId={clientId} /> : null}

      <div className="flex flex-col gap-4">
        <h3 className="text-card-title font-heading font-semibold">
          Founder Experience Log
        </h3>

        {experiences.length === 0 ? (
          <div className="rounded-card border border-border-grey bg-white p-8 text-center">
            <p className="text-body font-medium">No founder experiences yet.</p>
            <p className="mt-1 text-small text-muted-foreground">
              Add real operator moments so future ideas can use lived
              experience instead of generic prompts.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {experiences.map((experience) => (
              <FounderExperienceCard
                key={experience.id}
                clientId={clientId}
                role={role}
                experience={experience}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
