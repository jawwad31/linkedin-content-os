"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  canRoleManageResearchSources,
  type EffectiveClientRole,
} from "@/lib/access/roles";

import {
  saveResearchKeywordsAction,
  type SaveResearchKeywordsState,
} from "./actions";

const initialState: SaveResearchKeywordsState = { error: null, success: null };

export function ResearchKeywordsForm({
  clientId,
  role,
  keywords,
}: {
  clientId: string;
  role: EffectiveClientRole;
  keywords: string[];
}) {
  const canManage = canRoleManageResearchSources(role);
  const [state, action, pending] = useActionState(
    saveResearchKeywordsAction.bind(null, clientId),
    initialState,
  );

  return (
    <form action={action} className="flex flex-col gap-3">
      <div>
        <label htmlFor="researchKeywords" className="text-small font-medium text-near-black">
          Research keywords
        </label>
        <p className="mt-1 text-caption text-muted-foreground">
          Used only to classify RSS articles and synthesize relevant TrendCards. One per line.
        </p>
      </div>
      {canManage ? (
        <Textarea
          id="researchKeywords"
          name="researchKeywords"
          defaultValue={keywords.join("\n")}
          rows={5}
          maxLength={2_000}
        />
      ) : (
        <p className="min-h-24 whitespace-pre-line rounded-control border border-border-grey bg-soft-white p-3 text-small">
          {keywords.length > 0 ? keywords.join("\n") : "No Research keywords configured."}
        </p>
      )}
      {state.error ? <p role="alert" className="text-small text-danger-strong">{state.error}</p> : null}
      {state.success ? <p className="text-small text-success-strong">{state.success}</p> : null}
      {canManage ? (
        <Button type="submit" variant="outline" size="sm" disabled={pending} className="self-start">
          {pending ? "Saving..." : "Save Research Keywords"}
        </Button>
      ) : null}
    </form>
  );
}
