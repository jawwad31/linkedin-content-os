"use client";

import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
    <div className="min-w-0">
      <p className="text-caption font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 whitespace-pre-line break-words text-body text-near-black">
        {value}
      </p>
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
  const hasInsight = Boolean(experience.whatWasLearned || experience.whatChanged);

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
      <article className="flex flex-col gap-3 rounded-card border border-border-grey bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="accent-purple">Founder Experience</Badge>
          <span className="ml-auto font-mono text-caption text-muted-foreground">
            Added {formatUtcDate(experience.createdAt)}
            {experience.updatedAt !== experience.createdAt
              ? ` · Updated ${formatUtcDate(experience.updatedAt)}`
              : ""}
          </span>
        </div>

        <h2 className="break-words font-heading text-card-title font-semibold text-near-black">
          {experience.title}
        </h2>

        <div className="rounded-control bg-soft-white p-3">
          <p className="text-caption font-medium uppercase tracking-wide text-muted-foreground">
            The Experience
          </p>
          <p className="mt-1 whitespace-pre-line break-words text-body text-near-black">
            {experience.whatHappened}
          </p>
        </div>

        {hasInsight ? (
          <details className="group rounded-control border border-border-grey open:bg-soft-white/60">
            <summary
              className="flex cursor-pointer select-none list-none items-center justify-between gap-2 p-3 text-caption font-medium uppercase tracking-wide text-muted-foreground marker:content-none [&::-webkit-details-marker]:hidden"
            >
              <span>The Insight</span>
              <ChevronRight
                aria-hidden="true"
                className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-90"
              />
            </summary>
            <div className="grid grid-cols-1 gap-3 px-3 pb-3 sm:grid-cols-2">
              <Detail label="What was learned" value={experience.whatWasLearned} />
              <Detail label="What changed" value={experience.whatChanged} />
            </div>
          </details>
        ) : null}

        {experience.whyItMatters ? (
          <details className="group rounded-control border border-border-grey open:bg-soft-white/60">
            <summary
              className="flex cursor-pointer select-none list-none items-center justify-between gap-2 p-3 text-caption font-medium uppercase tracking-wide text-muted-foreground marker:content-none [&::-webkit-details-marker]:hidden"
            >
              <span>Why It Matters</span>
              <ChevronRight
                aria-hidden="true"
                className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-90"
              />
            </summary>
            <p className="whitespace-pre-line break-words px-3 pb-3 text-body text-near-black">
              {experience.whyItMatters}
            </p>
          </details>
        ) : null}

        {canManage ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-border-grey pt-3">
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
                className="text-danger-strong hover:bg-danger/10 hover:text-danger-strong"
                onClick={() => setIsDeleteDialogOpen(true)}
              >
                Delete
              </Button>
            )}
          </div>
        ) : null}
      </article>

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
