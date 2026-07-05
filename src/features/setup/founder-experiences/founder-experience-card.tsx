"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ClientRole } from "@/features/clients/invitations/schemas";

import {
  archiveFounderExperienceAction,
  type ArchiveFounderExperienceState,
} from "./actions";
import { FounderExperienceForm } from "./founder-experience-form";
import type { FounderExperience } from "./queries";

const archiveInitialState: ArchiveFounderExperienceState = { error: null };

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function Detail({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;

  return (
    <div>
      <p className="text-caption font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-small text-near-black">{value}</p>
    </div>
  );
}

export function FounderExperienceCard({
  clientId,
  role,
  experience,
}: {
  clientId: string;
  role: ClientRole;
  experience: FounderExperience;
}) {
  const [mode, setMode] = useState<"view" | "edit" | "confirm-archive">(
    "view",
  );
  const [archiveState, archiveAction, isArchiving] = useActionState(
    archiveFounderExperienceAction.bind(null, clientId, experience.id),
    archiveInitialState,
  );

  const canManage = role === "owner" || role === "editor";

  if (mode === "edit") {
    return (
      <FounderExperienceForm
        clientId={clientId}
        experience={experience}
        onCancel={() => setMode("view")}
        onSaved={() => setMode("view")}
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{experience.title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-small text-near-black">{experience.whatHappened}</p>

        <Detail label="What was learned" value={experience.whatWasLearned} />
        <Detail label="What changed" value={experience.whatChanged} />
        <Detail label="Why it matters" value={experience.whyItMatters} />

        <span className="font-mono text-caption text-muted-foreground">
          Added {formatDate(experience.createdAt)}
          {experience.updatedAt !== experience.createdAt
            ? ` · Updated ${formatDate(experience.updatedAt)}`
            : ""}
        </span>

        {canManage ? (
          mode === "confirm-archive" ? (
            <form
              action={archiveAction}
              className="flex flex-col gap-2 rounded-control border border-border-grey bg-soft-white p-3"
            >
              <p className="text-small font-medium">
                Archive this founder experience? It will be hidden from Setup
                but not deleted.
              </p>
              {archiveState.error ? (
                <p role="alert" className="text-small text-danger">
                  {archiveState.error}
                </p>
              ) : null}
              <div className="flex items-center gap-3">
                <Button
                  type="submit"
                  variant="destructive"
                  size="sm"
                  disabled={isArchiving}
                >
                  {isArchiving ? "Archiving..." : "Confirm archive"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setMode("view")}
                  disabled={isArchiving}
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setMode("edit")}
              >
                Edit
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setMode("confirm-archive")}
              >
                Archive
              </Button>
            </div>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}
