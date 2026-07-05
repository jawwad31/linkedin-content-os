"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { ClientRole } from "@/features/clients/invitations/schemas";

import { FounderExperienceCard } from "./founder-experience-card";
import { FounderExperienceForm } from "./founder-experience-form";
import type { FounderExperience } from "./queries";

export function FounderExperiencesPanel({
  clientId,
  role,
  experiences,
}: {
  clientId: string;
  role: ClientRole;
  experiences: FounderExperience[];
}) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const canManage = role === "owner" || role === "editor";

  return (
    <div className="flex flex-col gap-4">
      {!canManage ? (
        <p className="rounded-control border border-border-grey bg-soft-white px-3 py-2 text-small font-medium text-muted-foreground">
          Your role is view-only for this client.
        </p>
      ) : null}

      {canManage ? (
        showCreateForm ? (
          <FounderExperienceForm
            clientId={clientId}
            onCancel={() => setShowCreateForm(false)}
            onSaved={() => setShowCreateForm(false)}
          />
        ) : (
          <Button
            type="button"
            variant="secondary"
            className="self-start"
            onClick={() => setShowCreateForm(true)}
          >
            Add Founder Experience
          </Button>
        )
      ) : null}

      {experiences.length === 0 ? (
        <p className="text-small text-muted-foreground">
          No founder experiences yet.
        </p>
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
  );
}
