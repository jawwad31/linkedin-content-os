"use client";

import { BookOpen, Plus } from "lucide-react";
import { useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  canRoleManageFounderExperiences,
  type ClientPermission,
  type EffectiveClientRole,
} from "@/lib/access/roles";
import { cn } from "@/lib/utils";

import { FounderExperienceCard } from "./founder-experience-card";
import { FounderExperienceForm } from "./founder-experience-form";
import type { FounderExperience } from "./queries";

export function FounderExperiencesPanel({
  clientId,
  role,
  permissions,
  experiences,
}: {
  clientId: string;
  role: EffectiveClientRole;
  permissions: ClientPermission[];
  experiences: FounderExperience[];
}) {
  const canManage = canRoleManageFounderExperiences(role, permissions);
  const [isAddOpen, setIsAddOpen] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      {!canManage ? (
        <p className="rounded-control border border-border-grey bg-soft-white px-3 py-2 text-small font-medium text-muted-foreground">
          You do not have permission to update workflow content for this
          Client Workspace.
        </p>
      ) : null}

      {canManage ? (
        isAddOpen ? (
          <FounderExperienceForm
            clientId={clientId}
            onCancel={() => setIsAddOpen(false)}
            onSaved={() => setIsAddOpen(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setIsAddOpen(true)}
            className={cn(buttonVariants({ variant: "brand" }), "self-start gap-2")}
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            Add Founder Experience
          </button>
        )
      ) : null}

      <div className="flex flex-col gap-4">
        <h3 className="text-card-title font-heading font-semibold">
          Founder Experience Log
        </h3>

        {experiences.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="No Founder Experiences yet"
            description="Add real operator moments so future Ideas and Posts can draw on lived experience instead of generic prompts."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {experiences.map((experience) => (
              <FounderExperienceCard
                key={experience.id}
                clientId={clientId}
                role={role}
                permissions={permissions}
                experience={experience}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
