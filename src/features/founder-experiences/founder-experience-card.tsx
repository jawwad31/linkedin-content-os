"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DestructiveConfirmDialog } from "@/components/shared/destructive-confirm-dialog";
import {
  canRoleMutateClientWorkflow,
  type EffectiveClientRole,
} from "@/lib/access/roles";
import { formatUtcDate } from "@/lib/format/date";

import { FounderExperienceForm } from "./founder-experience-form";
import type { FounderExperience } from "./queries";

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
  role: EffectiveClientRole;
  experience: FounderExperience;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const canManage = canRoleMutateClientWorkflow(role);
  const isAdmin = role === "agency_admin" || role === "client_admin";

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
    <>
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
            Added {formatUtcDate(experience.createdAt)}
            {experience.updatedAt !== experience.createdAt
              ? ` · Updated ${formatUtcDate(experience.updatedAt)}`
              : ""}
          </span>

          {canManage ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setMode("edit")}
              >
                Edit
              </Button>
              {isAdmin && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-danger hover:bg-danger/10 hover:text-danger"
                  onClick={() => setIsDeleteDialogOpen(true)}
                >
                  Delete
                </Button>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <DestructiveConfirmDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        recordType="Founder Experience"
        recordTitle={experience.title}
        onConfirm={async () => {
          const res = await fetch(`/api/client/${clientId}/founder-experiences/${experience.id}`, {
            method: "DELETE",
          });
          if (!res.ok) {
            const data = await res.json();
            return {
              ok: false,
              error: data.error?.message || "Failed to delete entry.",
            };
          }
          return { ok: true };
        }}
        onSuccess={() => {
          router.refresh();
        }}
      />
    </>
  );
}
