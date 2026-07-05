"use client";

import { type ReactNode, useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ClientRole } from "@/features/clients/invitations/schemas";
import { cn } from "@/lib/utils";

import { saveBusinessContextAction, type SaveBusinessContextState } from "./actions";
import type { ClientBusinessContext } from "./queries";

type TabId = "profile" | "icp" | "pov" | "voice" | "publishing";

const TABS: { id: TabId; label: string }[] = [
  { id: "profile", label: "Business Profile" },
  { id: "icp", label: "ICP & Offer" },
  { id: "pov", label: "POV & Pillars" },
  { id: "voice", label: "Voice & Proof" },
  { id: "publishing", label: "Publishing Preferences" },
];

function toLines(values: string[]): string {
  return values.join("\n");
}

function Field({
  label,
  htmlFor,
  helperText,
  children,
}: {
  label: string;
  htmlFor: string;
  helperText?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-small font-medium">
        {label}
      </label>
      {children}
      {helperText ? (
        <p className="text-caption text-muted-foreground">{helperText}</p>
      ) : null}
    </div>
  );
}

const initialState: SaveBusinessContextState = { error: null, success: null };

export function BusinessContextForm({
  clientId,
  role,
  context,
}: {
  clientId: string;
  role: ClientRole;
  context: ClientBusinessContext;
}) {
  const [activeTab, setActiveTab] = useState<TabId>("profile");
  const [state, formAction, isPending] = useActionState(
    saveBusinessContextAction.bind(null, clientId),
    initialState,
  );

  const isReadOnly = role === "viewer";

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <div className="flex gap-1 overflow-x-auto border-b border-border-grey">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "shrink-0 whitespace-nowrap border-b-2 border-transparent px-4 py-2.5 text-small font-medium text-muted-foreground transition-colors hover:text-near-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50 focus-visible:ring-offset-2",
              activeTab === tab.id &&
                "border-brand-orange text-near-black",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <p className="text-caption text-muted-foreground">
        Founder Experiences are managed in the next setup step.
      </p>

      <div hidden={activeTab !== "profile"} className="flex flex-col gap-4">
        <Field label="Client / business name" htmlFor="name">
          <Input
            id="name"
            name="name"
            defaultValue={context.name}
            disabled={isReadOnly}
            required
            maxLength={200}
          />
        </Field>
        <Field label="Founder name" htmlFor="founderName">
          <Input
            id="founderName"
            name="founderName"
            defaultValue={context.founderName ?? ""}
            disabled={isReadOnly}
            maxLength={200}
          />
        </Field>
        <Field label="Industry" htmlFor="industry">
          <Input
            id="industry"
            name="industry"
            defaultValue={context.industry ?? ""}
            disabled={isReadOnly}
            maxLength={200}
          />
        </Field>
        <Field label="Business description" htmlFor="businessDescription">
          <Textarea
            id="businessDescription"
            name="businessDescription"
            rows={4}
            defaultValue={context.businessDescription ?? ""}
            disabled={isReadOnly}
            maxLength={4000}
          />
        </Field>
      </div>

      <div hidden={activeTab !== "icp"} className="flex flex-col gap-4">
        <Field label="Primary ICP" htmlFor="primaryIcp">
          <Textarea
            id="primaryIcp"
            name="primaryIcp"
            rows={3}
            defaultValue={context.primaryIcp ?? ""}
            disabled={isReadOnly}
            maxLength={2000}
          />
        </Field>
        <Field label="Main offer" htmlFor="mainOffer">
          <Textarea
            id="mainOffer"
            name="mainOffer"
            rows={3}
            defaultValue={context.mainOffer ?? ""}
            disabled={isReadOnly}
            maxLength={2000}
          />
        </Field>
      </div>

      <div hidden={activeTab !== "pov"} className="flex flex-col gap-4">
        <Field label="Core POV" htmlFor="corePov">
          <Textarea
            id="corePov"
            name="corePov"
            rows={4}
            defaultValue={context.corePov ?? ""}
            disabled={isReadOnly}
            maxLength={4000}
          />
        </Field>
        <Field
          label="Content pillars"
          htmlFor="contentPillars"
          helperText="One per line."
        >
          <Textarea
            id="contentPillars"
            name="contentPillars"
            rows={4}
            defaultValue={toLines(context.contentPillars)}
            disabled={isReadOnly}
            maxLength={4000}
          />
        </Field>
        <Field
          label="Research keywords"
          htmlFor="researchKeywords"
          helperText="One per line."
        >
          <Textarea
            id="researchKeywords"
            name="researchKeywords"
            rows={3}
            defaultValue={toLines(context.researchKeywords)}
            disabled={isReadOnly}
            maxLength={2000}
          />
        </Field>
        <Field
          label="Banned topics"
          htmlFor="bannedTopics"
          helperText="One per line."
        >
          <Textarea
            id="bannedTopics"
            name="bannedTopics"
            rows={3}
            defaultValue={toLines(context.bannedTopics)}
            disabled={isReadOnly}
            maxLength={2000}
          />
        </Field>
      </div>

      <div hidden={activeTab !== "voice"} className="flex flex-col gap-4">
        <Field label="Founder voice sample" htmlFor="founderVoiceSample">
          <Textarea
            id="founderVoiceSample"
            name="founderVoiceSample"
            rows={4}
            defaultValue={context.founderVoiceSample ?? ""}
            disabled={isReadOnly}
            maxLength={4000}
          />
        </Field>
        <Field
          label="Phrases to use"
          htmlFor="phrasesToUse"
          helperText="One per line."
        >
          <Textarea
            id="phrasesToUse"
            name="phrasesToUse"
            rows={3}
            defaultValue={toLines(context.phrasesToUse)}
            disabled={isReadOnly}
            maxLength={2000}
          />
        </Field>
        <Field
          label="Phrases to avoid"
          htmlFor="phrasesToAvoid"
          helperText="One per line."
        >
          <Textarea
            id="phrasesToAvoid"
            name="phrasesToAvoid"
            rows={3}
            defaultValue={toLines(context.phrasesToAvoid)}
            disabled={isReadOnly}
            maxLength={2000}
          />
        </Field>
        <Field
          label="Approved proof"
          htmlFor="approvedProof"
          helperText="One per line. Only real, approved proof points."
        >
          <Textarea
            id="approvedProof"
            name="approvedProof"
            rows={4}
            defaultValue={toLines(context.approvedProof)}
            disabled={isReadOnly}
            maxLength={4000}
          />
        </Field>
        <Field
          label="Reference material"
          htmlFor="referenceMaterial"
          helperText="One per line."
        >
          <Textarea
            id="referenceMaterial"
            name="referenceMaterial"
            rows={4}
            defaultValue={toLines(context.referenceMaterial)}
            disabled={isReadOnly}
            maxLength={4000}
          />
        </Field>
      </div>

      <div hidden={activeTab !== "publishing"} className="flex flex-col gap-4">
        <Field
          label="Publishing preferences"
          htmlFor="publishingPreferencesNotes"
          helperText="Notes on cadence, tone, or formatting preferences for this client."
        >
          <Textarea
            id="publishingPreferencesNotes"
            name="publishingPreferencesNotes"
            rows={4}
            defaultValue={context.publishingPreferencesNotes}
            disabled={isReadOnly}
            maxLength={2000}
          />
        </Field>
      </div>

      {state.error ? (
        <p role="alert" className="text-small text-danger">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="text-small text-success">{state.success}</p>
      ) : null}

      {isReadOnly ? (
        <p className="text-small text-muted-foreground">
          Your role is view-only for this client.
        </p>
      ) : (
        <Button type="submit" variant="gradient" disabled={isPending} className="self-start">
          {isPending ? "Saving..." : "Save business context"}
        </Button>
      )}
    </form>
  );
}
