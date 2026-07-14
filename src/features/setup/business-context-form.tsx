"use client";

import {
  Building2,
  Compass,
  Mic,
  Send,
  ShieldAlert,
  ShieldCheck,
  Target,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  canRoleManageClientSetup,
  type EffectiveClientRole,
} from "@/lib/access/roles";
import { cn } from "@/lib/utils";

import { saveBusinessContextAction, type SaveBusinessContextState } from "./actions";
import type { ClientBusinessContext } from "./queries";

type TabId =
  | "profile"
  | "icp"
  | "pov"
  | "voice"
  | "proof"
  | "guardrails"
  | "publishing";

const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: "profile", label: "Business Profile", icon: Building2 },
  { id: "icp", label: "ICP & Offer", icon: Target },
  { id: "pov", label: "POV & Content Pillars", icon: Compass },
  { id: "voice", label: "Founder Voice", icon: Mic },
  { id: "proof", label: "Proof & Reference Material", icon: ShieldCheck },
  { id: "guardrails", label: "Guardrails & Banned Topics", icon: ShieldAlert },
  { id: "publishing", label: "Publishing Preferences", icon: Send },
];

function toLines(values: string[]): string {
  return values.join("\n");
}

function SectionIntro({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-brand-orange" />
      <div>
        <h3 className="text-body font-semibold text-near-black">{title}</h3>
        <p className="mt-0.5 text-small text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function FieldBlock({
  label,
  htmlFor,
  name,
  value,
  as = "input",
  rows,
  maxLength,
  required,
  helperText,
  readOnly,
}: {
  label: string;
  htmlFor: string;
  name: string;
  value: string;
  as?: "input" | "textarea";
  rows?: number;
  maxLength: number;
  required?: boolean;
  helperText?: string;
  readOnly: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={readOnly ? undefined : htmlFor}
        className="text-small font-medium text-near-black"
      >
        {label}
      </label>
      {readOnly ? (
        <p className="min-h-10 whitespace-pre-line break-words rounded-control border border-border-grey bg-soft-white px-3.5 py-2.5 text-body text-near-black">
          {value.length > 0 ? (
            value
          ) : (
            <span className="text-muted-foreground">Not set</span>
          )}
        </p>
      ) : as === "textarea" ? (
        <Textarea
          id={htmlFor}
          name={name}
          rows={rows}
          defaultValue={value}
          maxLength={maxLength}
          required={required}
        />
      ) : (
        <Input
          id={htmlFor}
          name={name}
          defaultValue={value}
          maxLength={maxLength}
          required={required}
        />
      )}
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
  role: EffectiveClientRole;
  context: ClientBusinessContext;
}) {
  const [activeTab, setActiveTab] = useState<TabId>("profile");
  const [state, formAction, isPending] = useActionState(
    saveBusinessContextAction.bind(null, clientId),
    initialState,
  );

  const isReadOnly = !canRoleManageClientSetup(role);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {isReadOnly ? (
        <p className="rounded-control border border-border-grey bg-soft-white px-3 py-2 text-small font-medium text-muted-foreground">
          Client Users can view Setup but cannot edit business context.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-1.5 rounded-2xl bg-soft-white p-1.5">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-4 py-2 text-small font-medium text-muted-foreground transition-colors hover:text-near-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50 focus-visible:ring-offset-2",
              activeTab === tab.id && "bg-white text-near-black shadow-sm",
            )}
          >
            <tab.icon aria-hidden="true" className="h-4 w-4 shrink-0" />
            {tab.label}
          </button>
        ))}
      </div>

      <p className="text-caption text-muted-foreground">
        Founder Experiences are managed on their own dedicated page.
      </p>

      <div hidden={activeTab !== "profile"} className="flex flex-col gap-4">
        <SectionIntro
          icon={Building2}
          title="Business Profile"
          description="The core identity Research, Ideas, and Posts all reference."
        />
        <FieldBlock
          label="Client Workspace / business name"
          htmlFor="name"
          name="name"
          value={context.name}
          maxLength={200}
          required
          readOnly={isReadOnly}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FieldBlock
            label="Founder name"
            htmlFor="founderName"
            name="founderName"
            value={context.founderName ?? ""}
            maxLength={200}
            readOnly={isReadOnly}
          />
          <FieldBlock
            label="Industry"
            htmlFor="industry"
            name="industry"
            value={context.industry ?? ""}
            maxLength={200}
            readOnly={isReadOnly}
          />
        </div>
        <FieldBlock
          label="Business description"
          htmlFor="businessDescription"
          name="businessDescription"
          value={context.businessDescription ?? ""}
          as="textarea"
          rows={4}
          maxLength={4000}
          readOnly={isReadOnly}
        />
      </div>

      <div hidden={activeTab !== "icp"} className="flex flex-col gap-4">
        <SectionIntro
          icon={Target}
          title="ICP & Offer"
          description="Who the content is for, and what it's ultimately pointing toward."
        />
        <FieldBlock
          label="Primary ICP"
          htmlFor="primaryIcp"
          name="primaryIcp"
          value={context.primaryIcp ?? ""}
          as="textarea"
          rows={3}
          maxLength={2000}
          readOnly={isReadOnly}
        />
        <FieldBlock
          label="Main offer"
          htmlFor="mainOffer"
          name="mainOffer"
          value={context.mainOffer ?? ""}
          as="textarea"
          rows={3}
          maxLength={2000}
          readOnly={isReadOnly}
        />
      </div>

      <div hidden={activeTab !== "pov"} className="flex flex-col gap-4">
        <SectionIntro
          icon={Compass}
          title="POV & Content Pillars"
          description="The operator point of view and recurring themes that shape angles and research direction."
        />
        <FieldBlock
          label="Core POV"
          htmlFor="corePov"
          name="corePov"
          value={context.corePov ?? ""}
          as="textarea"
          rows={4}
          maxLength={4000}
          readOnly={isReadOnly}
        />
        <FieldBlock
          label="Content pillars"
          htmlFor="contentPillars"
          name="contentPillars"
          value={toLines(context.contentPillars)}
          as="textarea"
          rows={4}
          maxLength={4000}
          helperText="One per line."
          readOnly={isReadOnly}
        />
        <FieldBlock
          label="Research keywords"
          htmlFor="researchKeywords"
          name="researchKeywords"
          value={toLines(context.researchKeywords)}
          as="textarea"
          rows={3}
          maxLength={2000}
          helperText="One per line."
          readOnly={isReadOnly}
        />
      </div>

      <div hidden={activeTab !== "voice"} className="flex flex-col gap-4">
        <SectionIntro
          icon={Mic}
          title="Founder Voice"
          description="How this founder actually sounds, so drafts read like them instead of a generic creator."
        />
        <FieldBlock
          label="Founder voice sample"
          htmlFor="founderVoiceSample"
          name="founderVoiceSample"
          value={context.founderVoiceSample ?? ""}
          as="textarea"
          rows={4}
          maxLength={4000}
          readOnly={isReadOnly}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FieldBlock
            label="Phrases to use"
            htmlFor="phrasesToUse"
            name="phrasesToUse"
            value={toLines(context.phrasesToUse)}
            as="textarea"
            rows={3}
            maxLength={2000}
            helperText="One per line."
            readOnly={isReadOnly}
          />
          <FieldBlock
            label="Phrases to avoid"
            htmlFor="phrasesToAvoid"
            name="phrasesToAvoid"
            value={toLines(context.phrasesToAvoid)}
            as="textarea"
            rows={3}
            maxLength={2000}
            helperText="One per line."
            readOnly={isReadOnly}
          />
        </div>
      </div>

      <div hidden={activeTab !== "proof"} className="flex flex-col gap-4">
        <SectionIntro
          icon={ShieldCheck}
          title="Proof & Reference Material"
          description="Only real, approved proof the Content Agent is allowed to draw from."
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FieldBlock
            label="Approved proof"
            htmlFor="approvedProof"
            name="approvedProof"
            value={toLines(context.approvedProof)}
            as="textarea"
            rows={5}
            maxLength={4000}
            helperText="One per line. Only real, approved proof points."
            readOnly={isReadOnly}
          />
          <FieldBlock
            label="Reference material"
            htmlFor="referenceMaterial"
            name="referenceMaterial"
            value={toLines(context.referenceMaterial)}
            as="textarea"
            rows={5}
            maxLength={4000}
            helperText="One per line."
            readOnly={isReadOnly}
          />
        </div>
      </div>

      <div hidden={activeTab !== "guardrails"} className="flex flex-col gap-4">
        <SectionIntro
          icon={ShieldAlert}
          title="Guardrails & Banned Topics"
          description="Topics Research and Content Agents must never touch for this Client Workspace."
        />
        <FieldBlock
          label="Banned topics"
          htmlFor="bannedTopics"
          name="bannedTopics"
          value={toLines(context.bannedTopics)}
          as="textarea"
          rows={4}
          maxLength={2000}
          helperText="One per line."
          readOnly={isReadOnly}
        />
      </div>

      <div hidden={activeTab !== "publishing"} className="flex flex-col gap-4">
        <SectionIntro
          icon={Send}
          title="Publishing Preferences"
          description="Cadence, tone, or formatting notes that apply when posts are drafted for this Client Workspace."
        />
        <FieldBlock
          label="Publishing preferences"
          htmlFor="publishingPreferencesNotes"
          name="publishingPreferencesNotes"
          value={context.publishingPreferencesNotes}
          as="textarea"
          rows={4}
          maxLength={2000}
          readOnly={isReadOnly}
        />
      </div>

      {state.error ? (
        <p
          role="alert"
          className="rounded-control bg-danger/10 px-3 py-2 text-small font-medium text-danger"
        >
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="rounded-control bg-success/10 px-3 py-2 text-small font-medium text-success">
          {state.success}
        </p>
      ) : null}

      {isReadOnly ? null : (
        <Button
          type="submit"
          variant="gradient"
          size="lg"
          disabled={isPending}
          className="self-start"
        >
          {isPending ? "Saving..." : "Save business context"}
        </Button>
      )}
    </form>
  );
}
