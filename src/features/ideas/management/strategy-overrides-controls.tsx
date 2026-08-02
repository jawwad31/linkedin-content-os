"use client";

import { ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { StrategyOverrides } from "@/lib/ai/playbooks/contracts";
import {
  ANGLE_TYPES,
  CTA_TYPES,
  POST_STRUCTURES,
} from "@/lib/ai/playbooks/taxonomies";
import type { ContentResource } from "@/features/resources/queries";

const titleCase = (value: string) =>
  value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

function StrategySelect({
  label,
  value,
  values,
  onChange,
}: {
  label: string;
  value: string;
  values: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-small text-near-black">
      <span className="text-caption font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded-control border border-border-grey bg-white px-3 text-small outline-none focus:border-brand-purple"
      >
        <option value="">AI default</option>
        {values.map((option) => (
          <option key={option} value={option}>
            {titleCase(option)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function StrategyOverridesControls({
  clientId,
  ideaId,
  overrides,
  resources,
}: {
  clientId: string;
  ideaId: string;
  overrides: StrategyOverrides;
  resources: ContentResource[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Record<string, string>>({
    angleType: overrides.angleType ?? "",
    postStructure: overrides.postStructure ?? "",
    ctaType: overrides.ctaType ?? "",
    resourceId: overrides.resourceId ?? "",
  });
  const [state, setState] = useState<"idle" | "pending" | "success" | "error">(
    "idle",
  );

  async function save() {
    setState("pending");
    try {
      const response = await fetch(
        `/api/client/${clientId}/ideas/${ideaId}/strategy-overrides`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            Object.fromEntries(
              Object.entries(draft).map(([key, value]) => [
                key,
                value.length > 0 ? value : null,
              ]),
            ),
          ),
        },
      );
      const payload = await response.json();
      if (!payload.success) {
        setState("error");
        return;
      }
      setState("success");
      router.refresh();
    } catch {
      setState("error");
    }
  }

  return (
    <details className="group rounded-control border border-border-grey open:bg-soft-white/60">
      <summary className="flex cursor-pointer select-none list-none items-center justify-between gap-2 p-3 text-caption font-medium uppercase tracking-wide text-muted-foreground marker:content-none [&::-webkit-details-marker]:hidden">
        <span>Advanced Strategy Overrides</span>
        <ChevronRight
          aria-hidden="true"
          className="h-4 w-4 shrink-0 transition-transform group-open:rotate-90"
        />
      </summary>
      <div className="grid grid-cols-1 gap-3 px-3 pb-3 sm:grid-cols-2">
        <StrategySelect
          label="Angle"
          value={draft.angleType}
          values={ANGLE_TYPES}
          onChange={(value) => setDraft((current) => ({ ...current, angleType: value }))}
        />
        <StrategySelect
          label="Post structure"
          value={draft.postStructure}
          values={POST_STRUCTURES}
          onChange={(value) =>
            setDraft((current) => ({ ...current, postStructure: value }))
          }
        />
        <StrategySelect
          label="CTA"
          value={draft.ctaType}
          values={
            draft.resourceId || resources.length > 0
              ? CTA_TYPES
              : CTA_TYPES.filter((type) => type !== "comment_gate")
          }
          onChange={(value) =>
            setDraft((current) => {
              if (value === "comment_gate") {
                return {
                  ...current,
                  ctaType: value,
                  resourceId: current.resourceId || resources[0]?.id || "",
                };
              }
              return {
                ...current,
                ctaType: value,
                resourceId:
                  current.ctaType === "comment_gate" ? "" : current.resourceId,
              };
            })
          }
        />
        <label className="flex min-w-0 flex-col gap-1 text-small text-near-black">
          <span className="text-caption font-medium uppercase tracking-wide text-muted-foreground">
            Content resource
          </span>
          <select
            value={draft.resourceId}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                resourceId: event.target.value,
                ctaType: event.target.value ? "comment_gate" : "",
              }))
            }
            className="h-10 rounded-control border border-border-grey bg-white px-3 text-small outline-none focus:border-brand-purple"
          >
            <option value="">No resource</option>
            {resources.map((resource) => (
              <option key={resource.id} value={resource.id}>
                {resource.title} ({resource.keyword})
              </option>
            ))}
          </select>
          <span className="text-caption text-muted-foreground">
            Selecting a resource automatically uses the Resource Post archetype
            and Comment Gate CTA.
          </span>
        </label>
        <div className="flex items-center gap-2 sm:col-span-2">
          <Button type="button" variant="outline" size="sm" onClick={save} disabled={state === "pending"}>
            {state === "pending" ? "Saving..." : "Save Overrides"}
          </Button>
          {state === "success" ? (
            <span className="text-small text-success-strong">Overrides saved.</span>
          ) : null}
          {state === "error" ? (
            <span role="alert" className="text-small text-danger-strong">
              Could not save overrides.
            </span>
          ) : null}
        </div>
      </div>
    </details>
  );
}
