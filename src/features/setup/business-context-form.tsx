"use client";

import {
  Building2,
  Mic,
  ShieldAlert,
  Target,
  User,
  type LucideIcon,
} from "lucide-react";
import { useActionState, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  SegmentedNavigation,
  type SegmentedNavigationItem,
} from "@/components/ui/segmented-navigation";
import { Textarea } from "@/components/ui/textarea";
import {
  canRoleManageClientSetup,
  type EffectiveClientRole,
} from "@/lib/access/roles";
import { cn } from "@/lib/utils";

import {
  saveBusinessContextAction,
  type SaveBusinessContextState,
} from "./actions";
import type { ClientBusinessContext } from "./queries";
import {
  businessContextFormSchema,
  type BusinessContextFormInput,
} from "./schemas";

type TabId =
  | "business_profile"
  | "business_icp"
  | "personal_profile"
  | "personal_voice"
  | "guardrails";

const TABS: SegmentedNavigationItem<TabId>[] = [
  { id: "business_profile", label: "Business Profile", icon: Building2 },
  { id: "business_icp", label: "ICP & Offer", icon: Target },
  { id: "personal_profile", label: "Personal Brand", icon: User },
  { id: "personal_voice", label: "Voice & Style", icon: Mic },
  { id: "guardrails", label: "Guardrails & Proof", icon: ShieldAlert },
];

const FIELD_TABS: Record<keyof BusinessContextFormInput, TabId> = {
  name: "business_profile",
  industry: "business_profile",
  businessDescription: "business_profile",
  deliveryApproach: "business_profile",
  businessPositioning: "business_profile",

  primaryIcp: "business_icp",
  audienceUnderstanding: "business_icp",
  painPoints: "business_icp",
  mainOffer: "business_icp",
  commercialDetails: "business_icp",
  questionsAndDoubts: "business_icp",

  founderName: "personal_profile",
  roleAndWork: "personal_profile",
  personalPositioning: "personal_profile",
  personalReaders: "personal_profile",
  contentPillars: "personal_profile",
  principles: "personal_profile",

  voiceGuide: "personal_voice",
  founderVoiceSample: "personal_voice",
  phrasesToUse: "personal_voice",
  phrasesToAvoid: "personal_voice",
  voiceExample1Label: "personal_voice",
  voiceExample1Text: "personal_voice",
  voiceExample1Url: "personal_voice",
  voiceExample2Label: "personal_voice",
  voiceExample2Text: "personal_voice",
  voiceExample2Url: "personal_voice",
  voiceExample3Label: "personal_voice",
  voiceExample3Text: "personal_voice",
  voiceExample3Url: "personal_voice",

  approvedProof: "guardrails",
  bannedTopics: "guardrails",
  boundaries: "guardrails",
  businessMentions: "guardrails",
};

function toLines(values: string[] | undefined) {
  if (!values || !Array.isArray(values)) return "";
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
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-brand-orange" aria-hidden="true" />
      <div>
        <h3 className="text-body font-semibold text-near-black">{title}</h3>
        <p className="mt-0.5 text-small text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function FieldBlock({
  label,
  name,
  value,
  as = "input",
  type = "text",
  rows,
  maxLength,
  required,
  helperText,
  readOnly,
  error,
}: {
  label: string;
  name: keyof BusinessContextFormInput;
  value: string;
  as?: "input" | "textarea";
  type?: "text" | "url";
  rows?: number;
  maxLength: number;
  required?: boolean;
  helperText?: string;
  readOnly: boolean;
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={readOnly ? undefined : name} className="text-small font-medium text-near-black">
        {label}
        {required ? <span className="ml-1 text-danger-strong">*</span> : null}
      </label>
      {readOnly ? (
        <p className="min-h-10 whitespace-pre-line break-words rounded-control border border-border-grey bg-soft-white px-3.5 py-2.5 text-body text-near-black">
          {value || <span className="text-muted-foreground">Not set</span>}
        </p>
      ) : as === "textarea" ? (
        <Textarea
          id={name}
          name={name}
          rows={rows}
          defaultValue={value}
          maxLength={maxLength}
          required={required}
          className={cn(error && "border-danger focus-visible:ring-danger/50")}
        />
      ) : (
        <Input
          id={name}
          name={name}
          type={type}
          defaultValue={value}
          maxLength={maxLength}
          required={required}
          className={cn(error && "border-danger focus-visible:ring-danger/50")}
        />
      )}
      {error ? (
        <p className="text-caption text-danger-strong">{error}</p>
      ) : helperText ? (
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
  const [activeTab, setActiveTab] = useState<TabId>("business_profile");
  const [state, formAction, isPending] = useActionState(
    saveBusinessContextAction.bind(null, clientId),
    initialState,
  );
  const [validationErrors, setValidationErrors] = useState<
    Partial<Record<keyof BusinessContextFormInput, string>>
  >({});
  const isReadOnly = !canRoleManageClientSetup(role);

  useEffect(() => {
    if (!state.success) return;
    const timer = setTimeout(() => setValidationErrors({}), 0);
    return () => clearTimeout(timer);
  }, [state.success]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (isReadOnly) return;
    const formData = new FormData(event.currentTarget);
    const rawData = Object.fromEntries(
      Object.keys(FIELD_TABS).map((field) => [
        field,
        (formData.get(field) as string) || "",
      ]),
    );
    const parsed = businessContextFormSchema.safeParse(rawData);
    if (parsed.success) {
      setValidationErrors({});
      return;
    }

    event.preventDefault();
    const errors: Partial<Record<keyof BusinessContextFormInput, string>> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as keyof BusinessContextFormInput;
      errors[field] ??= issue.message;
    }
    setValidationErrors(errors);
    const firstField = Object.keys(errors)[0] as keyof BusinessContextFormInput;
    if (!firstField) return;
    setActiveTab(FIELD_TABS[firstField]);
    setTimeout(() => document.getElementById(firstField)?.focus(), 50);
  }

  const example = (index: 0 | 1 | 2) => context.founderVoiceExamples[index];

  return (
    <form action={formAction} noValidate onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-surface-container-high px-2.5 py-0.5 text-caption font-semibold text-on-surface">
            Profile Revision #{context.profileRevision}
          </span>
          <span className="text-caption text-muted-foreground">
            Two distinct context profiles for Virel
          </span>
        </div>
      </div>

      {isReadOnly ? (
        <p className="rounded-control border border-border-grey bg-soft-white px-3 py-2 text-small font-medium text-muted-foreground">
          Account Users can view Settings but cannot edit context profiles.
        </p>
      ) : null}

      <SegmentedNavigation items={TABS} activeId={activeTab} onChange={setActiveTab} />

      {/* Tab 1: Business Profile */}
      <div hidden={activeTab !== "business_profile"} className="flex flex-col gap-4">
        <SectionIntro
          icon={Building2}
          title="Business Profile"
          description="The core company identity, industry description, and delivery approach."
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FieldBlock
            label="Business name"
            name="name"
            value={context.name}
            maxLength={200}
            required
            readOnly={isReadOnly}
            error={validationErrors.name}
          />
          <FieldBlock
            label="Industry"
            name="industry"
            value={context.industry ?? ""}
            maxLength={200}
            readOnly={isReadOnly}
            error={validationErrors.industry}
          />
        </div>
        <FieldBlock
          label="Business description"
          name="businessDescription"
          value={context.businessDescription ?? ""}
          as="textarea"
          rows={4}
          maxLength={4_000}
          helperText="Complete description of what the business does."
          readOnly={isReadOnly}
          error={validationErrors.businessDescription}
        />
        <FieldBlock
          label="Delivery approach"
          name="deliveryApproach"
          value={context.deliveryApproach ?? ""}
          as="textarea"
          rows={3}
          maxLength={2_000}
          helperText="Process, methodology, or delivery method (no forced framework)."
          readOnly={isReadOnly}
          error={validationErrors.deliveryApproach}
        />
        <FieldBlock
          label="Business positioning"
          name="businessPositioning"
          value={context.businessPositioning ?? ""}
          as="textarea"
          rows={3}
          maxLength={2_000}
          helperText="Alternatives buyers consider and key business differentiators."
          readOnly={isReadOnly}
          error={validationErrors.businessPositioning}
        />
      </div>

      {/* Tab 2: ICP & Offer */}
      <div hidden={activeTab !== "business_icp"} className="flex flex-col gap-4">
        <SectionIntro
          icon={Target}
          title="Primary Buyer ICP & Commercial Offer"
          description="Detailed target audience understanding, problems, and commercial offer specifics."
        />
        <FieldBlock
          label="Primary buyer ICP"
          name="primaryIcp"
          value={context.primaryIcp ?? ""}
          as="textarea"
          rows={3}
          maxLength={2_000}
          helperText="Roles, industries, geography, seniority, company size, department."
          readOnly={isReadOnly}
          error={validationErrors.primaryIcp}
        />
        <FieldBlock
          label="Audience understanding"
          name="audienceUnderstanding"
          value={context.audienceUnderstanding ?? ""}
          as="textarea"
          rows={3}
          maxLength={2_000}
          helperText="What buyers care about, struggle with, value, and distrust."
          readOnly={isReadOnly}
          error={validationErrors.audienceUnderstanding}
        />
        <FieldBlock
          label="Pain points"
          name="painPoints"
          value={context.painPoints ?? ""}
          as="textarea"
          rows={3}
          maxLength={2_000}
          helperText="Problem and consequences; optional frequency and urgency."
          readOnly={isReadOnly}
          error={validationErrors.painPoints}
        />
        <FieldBlock
          label="Main offer"
          name="mainOffer"
          value={context.mainOffer ?? ""}
          as="textarea"
          rows={3}
          maxLength={2_000}
          helperText="Service/product, deliverables, delivery method, inclusions."
          readOnly={isReadOnly}
          error={validationErrors.mainOffer}
        />
        <FieldBlock
          label="Commercial details (optional)"
          name="commercialDetails"
          value={context.commercialDetails ?? ""}
          as="textarea"
          rows={2}
          maxLength={2_000}
          helperText="Optional pricing ranges, guarantees, or exclusions."
          readOnly={isReadOnly}
          error={validationErrors.commercialDetails}
        />
        <FieldBlock
          label="Questions and doubts (optional)"
          name="questionsAndDoubts"
          value={context.questionsAndDoubts ?? ""}
          as="textarea"
          rows={2}
          maxLength={2_000}
          helperText="Common questions, reservations, or objections from buyers."
          readOnly={isReadOnly}
          error={validationErrors.questionsAndDoubts}
        />
      </div>

      {/* Tab 3: Personal Brand */}
      <div hidden={activeTab !== "personal_profile"} className="flex flex-col gap-4">
        <SectionIntro
          icon={User}
          title="Personal-Brand Profile"
          description="Positioning, role, intended readers (beyond buyer ICP), content pillars, and core principles."
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FieldBlock
            label="Name / Persona"
            name="founderName"
            value={context.founderName ?? ""}
            maxLength={200}
            readOnly={isReadOnly}
            error={validationErrors.founderName}
          />
          <FieldBlock
            label="Role and work"
            name="roleAndWork"
            value={context.roleAndWork ?? ""}
            maxLength={2_000}
            helperText="What you personally do, build, manage, or advise on."
            readOnly={isReadOnly}
            error={validationErrors.roleAndWork}
          />
        </div>
        <FieldBlock
          label="Expertise & personal positioning"
          name="personalPositioning"
          value={context.personalPositioning ?? ""}
          as="textarea"
          rows={3}
          maxLength={2_000}
          helperText="Subjects you want to be associated with and why readers should follow."
          readOnly={isReadOnly}
          error={validationErrors.personalPositioning}
        />
        <FieldBlock
          label="Intended personal readers"
          name="personalReaders"
          value={context.personalReaders ?? ""}
          as="textarea"
          rows={3}
          maxLength={2_000}
          helperText="Target readership: practitioners, peers, operators, or buyers. AI can draft for these readers instead of solely substituting buyer ICP."
          readOnly={isReadOnly}
          error={validationErrors.personalReaders}
        />
        <FieldBlock
          label="Content pillars"
          name="contentPillars"
          value={toLines(context.contentPillars)}
          as="textarea"
          rows={3}
          maxLength={2_000}
          helperText="Recurring topics, themes, and boundaries. One per line."
          readOnly={isReadOnly}
          error={validationErrors.contentPillars}
        />
        <FieldBlock
          label="Principles & approved beliefs (optional)"
          name="principles"
          value={context.principles ?? ""}
          as="textarea"
          rows={3}
          maxLength={2_000}
          helperText="Approved beliefs, strong points of view, and industry disagreements."
          readOnly={isReadOnly}
          error={validationErrors.principles}
        />
      </div>

      {/* Tab 4: Voice & Style */}
      <div hidden={activeTab !== "personal_voice"} className="flex flex-col gap-5">
        <SectionIntro
          icon={Mic}
          title="Voice & Writing Style"
          description="Calibrate style, tone, phrases, and reference samples."
        />
        <FieldBlock
          label="Voice style guide"
          name="voiceGuide"
          value={context.voiceGuide ?? ""}
          as="textarea"
          rows={4}
          maxLength={4_000}
          helperText="Style preferences, cadence, formatting guidelines, or externally prepared guide."
          readOnly={isReadOnly}
          error={validationErrors.voiceGuide}
        />
        <FieldBlock
          label="Writing sample"
          name="founderVoiceSample"
          value={context.founderVoiceSample ?? ""}
          as="textarea"
          rows={4}
          maxLength={4_000}
          helperText="A representative post or excerpt written in the authentic voice."
          readOnly={isReadOnly}
          error={validationErrors.founderVoiceSample}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FieldBlock
            label="Phrases to use"
            name="phrasesToUse"
            value={toLines(context.phrasesToUse)}
            as="textarea"
            rows={3}
            maxLength={2_000}
            helperText="One per line."
            readOnly={isReadOnly}
            error={validationErrors.phrasesToUse}
          />
          <FieldBlock
            label="Phrases to avoid"
            name="phrasesToAvoid"
            value={toLines(context.phrasesToAvoid)}
            as="textarea"
            rows={3}
            maxLength={2_000}
            helperText="One per line."
            readOnly={isReadOnly}
            error={validationErrors.phrasesToAvoid}
          />
        </div>
        <div className="flex flex-col gap-4">
          <div>
            <h4 className="text-small font-semibold text-near-black">Style-only inspiration examples</h4>
            <p className="mt-1 text-caption text-muted-foreground">
              Up to 3 style inspiration posts. Influences cadence only; never claims or facts.
            </p>
          </div>
          {([1, 2, 3] as const).map((number, index) => (
            <div key={number} className="grid grid-cols-1 gap-3 rounded-control border border-border-grey bg-soft-white p-3">
              <p className="text-caption font-medium uppercase tracking-wide text-muted-foreground">
                Inspiration example {number}
              </p>
              <FieldBlock
                label="Label"
                name={`voiceExample${number}Label`}
                value={example(index as 0 | 1 | 2)?.label ?? ""}
                maxLength={120}
                readOnly={isReadOnly}
                error={validationErrors[`voiceExample${number}Label`]}
              />
              <FieldBlock
                label="Post text"
                name={`voiceExample${number}Text`}
                value={example(index as 0 | 1 | 2)?.text ?? ""}
                as="textarea"
                rows={5}
                maxLength={6_000}
                readOnly={isReadOnly}
                error={validationErrors[`voiceExample${number}Text`]}
              />
              <FieldBlock
                label="Attribution URL (optional)"
                name={`voiceExample${number}Url`}
                value={example(index as 0 | 1 | 2)?.attributionUrl ?? ""}
                type="url"
                maxLength={2_000}
                readOnly={isReadOnly}
                error={validationErrors[`voiceExample${number}Url`]}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Tab 5: Guardrails & Proof */}
      <div hidden={activeTab !== "guardrails"} className="flex flex-col gap-4">
        <SectionIntro
          icon={ShieldAlert}
          title="Guardrails, Proof & Boundaries"
          description="Factual evidence boundary, sensitive personal topics, and banned subjects."
        />
        <FieldBlock
          label="Approved proof & evidence notes"
          name="approvedProof"
          value={toLines(context.approvedProof)}
          as="textarea"
          rows={5}
          maxLength={4_000}
          helperText="One item per line. Real approved metrics, results, client stories, or factual claims."
          readOnly={isReadOnly}
          error={validationErrors.approvedProof}
        />
        <FieldBlock
          label="Banned topics"
          name="bannedTopics"
          value={toLines(context.bannedTopics)}
          as="textarea"
          rows={4}
          maxLength={2_000}
          helperText="Topics, competitors, or claims the writer and research must avoid. One per line."
          readOnly={isReadOnly}
          error={validationErrors.bannedTopics}
        />
        <FieldBlock
          label="Personal boundaries"
          name="boundaries"
          value={context.boundaries ?? ""}
          as="textarea"
          rows={3}
          maxLength={2_000}
          helperText="Private topics, client confidentiality, sensitive metrics, personal disclosures."
          readOnly={isReadOnly}
          error={validationErrors.boundaries}
        />
        <FieldBlock
          label="Business mentions guidance"
          name="businessMentions"
          value={context.businessMentions ?? ""}
          as="textarea"
          rows={3}
          maxLength={2_000}
          helperText="When and how mentioning the company or commercial offer is appropriate."
          readOnly={isReadOnly}
          error={validationErrors.businessMentions}
        />
      </div>

      {state.error ? (
        <p role="alert" className="rounded-control bg-danger/10 px-3 py-2 text-small font-medium text-danger-strong">{state.error}</p>
      ) : null}
      {state.success ? (
        <p className="rounded-control bg-success/10 px-3 py-2 text-small font-medium text-success-strong">{state.success}</p>
      ) : null}
      {!isReadOnly ? (
        <Button type="submit" variant="brand" size="lg" disabled={isPending} className="self-start">
          {isPending ? "Saving..." : "Save Context Profiles"}
        </Button>
      ) : null}
    </form>
  );
}
