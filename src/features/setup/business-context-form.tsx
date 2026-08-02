"use client";

import {
  Building2,
  Mic,
  ShieldAlert,
  ShieldCheck,
  Target,
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

type TabId = "profile" | "icp" | "voice" | "evidence" | "guardrails";

const TABS: SegmentedNavigationItem<TabId>[] = [
  { id: "profile", label: "Business Profile", icon: Building2 },
  { id: "icp", label: "ICP & Offer", icon: Target },
  { id: "voice", label: "Founder Voice", icon: Mic },
  { id: "evidence", label: "Approved Evidence", icon: ShieldCheck },
  { id: "guardrails", label: "Guardrails", icon: ShieldAlert },
];

const FIELD_TABS: Record<keyof BusinessContextFormInput, TabId> = {
  name: "profile",
  founderName: "profile",
  industry: "profile",
  businessDescription: "profile",
  primaryIcp: "icp",
  mainOffer: "icp",
  bannedTopics: "guardrails",
  founderVoiceSample: "voice",
  phrasesToUse: "voice",
  phrasesToAvoid: "voice",
  approvedProof: "evidence",
  voiceExample1Label: "voice",
  voiceExample1Text: "voice",
  voiceExample1Url: "voice",
  voiceExample2Label: "voice",
  voiceExample2Text: "voice",
  voiceExample2Url: "voice",
  voiceExample3Label: "voice",
  voiceExample3Text: "voice",
  voiceExample3Url: "voice",
};

function toLines(values: string[]) {
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
  const [activeTab, setActiveTab] = useState<TabId>("profile");
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
      {isReadOnly ? (
        <p className="rounded-control border border-border-grey bg-soft-white px-3 py-2 text-small font-medium text-muted-foreground">
          Account Users can view Settings but cannot edit business context.
        </p>
      ) : null}

      <SegmentedNavigation items={TABS} activeId={activeTab} onChange={setActiveTab} />

      <p className="text-caption text-muted-foreground">
        Founder Experiences and Content Resources are managed on their dedicated pages. Research keywords are managed in Research.
      </p>

      <div hidden={activeTab !== "profile"} className="flex flex-col gap-4">
        <SectionIntro
          icon={Building2}
          title="Business Profile"
          description="The durable identity and business description used as background context."
        />
        <FieldBlock label="Client Workspace / business name" name="name" value={context.name} maxLength={200} required readOnly={isReadOnly} error={validationErrors.name} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FieldBlock label="Founder name" name="founderName" value={context.founderName ?? ""} maxLength={200} readOnly={isReadOnly} error={validationErrors.founderName} />
          <FieldBlock label="Industry" name="industry" value={context.industry ?? ""} maxLength={200} readOnly={isReadOnly} error={validationErrors.industry} />
        </div>
        <FieldBlock label="Business description" name="businessDescription" value={context.businessDescription ?? ""} as="textarea" rows={4} maxLength={4_000} readOnly={isReadOnly} error={validationErrors.businessDescription} />
      </div>

      <div hidden={activeTab !== "icp"} className="flex flex-col gap-4">
        <SectionIntro
          icon={Target}
          title="ICP & Offer"
          description="Who the content should help and the commercial context behind it."
        />
        <FieldBlock label="Primary ICP" name="primaryIcp" value={context.primaryIcp ?? ""} as="textarea" rows={4} maxLength={2_000} readOnly={isReadOnly} error={validationErrors.primaryIcp} />
        <FieldBlock label="Main offer" name="mainOffer" value={context.mainOffer ?? ""} as="textarea" rows={4} maxLength={2_000} readOnly={isReadOnly} error={validationErrors.mainOffer} />
      </div>

      <div hidden={activeTab !== "voice"} className="flex flex-col gap-5">
        <SectionIntro
          icon={Mic}
          title="Founder Voice"
          description="Calibrate how drafts sound. Inspiration posts are style references, never factual sources."
        />
        <FieldBlock label="Founder voice description or sample" name="founderVoiceSample" value={context.founderVoiceSample ?? ""} as="textarea" rows={4} maxLength={4_000} readOnly={isReadOnly} error={validationErrors.founderVoiceSample} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FieldBlock label="Phrases to use" name="phrasesToUse" value={toLines(context.phrasesToUse)} as="textarea" rows={3} maxLength={2_000} helperText="One per line." readOnly={isReadOnly} error={validationErrors.phrasesToUse} />
          <FieldBlock label="Phrases to avoid" name="phrasesToAvoid" value={toLines(context.phrasesToAvoid)} as="textarea" rows={3} maxLength={2_000} helperText="One per line." readOnly={isReadOnly} error={validationErrors.phrasesToAvoid} />
        </div>
        <div className="flex flex-col gap-4">
          <div>
            <h4 className="text-small font-semibold text-near-black">Voice inspiration posts</h4>
            <p className="mt-1 text-caption text-muted-foreground">
              Add up to three posts the founder likes. The writer may learn cadence and formatting, but cannot copy their claims or wording.
            </p>
          </div>
          {([1, 2, 3] as const).map((number, index) => (
            <div key={number} className="grid grid-cols-1 gap-3 rounded-control border border-border-grey bg-soft-white p-3">
              <p className="text-caption font-medium uppercase tracking-wide text-muted-foreground">
                Inspiration post {number}
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
                rows={6}
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

      <div hidden={activeTab !== "evidence"} className="flex flex-col gap-4">
        <SectionIntro
          icon={ShieldCheck}
          title="Approved Evidence"
          description="Only real proof points the Planning, Content, and Review agents may publish."
        />
        <FieldBlock
          label="Approved Evidence"
          name="approvedProof"
          value={toLines(context.approvedProof)}
          as="textarea"
          rows={7}
          maxLength={4_000}
          helperText="One item per line. Include the exact metric, timeframe, result, example, or claim that is approved."
          readOnly={isReadOnly}
          error={validationErrors.approvedProof}
        />
      </div>

      <div hidden={activeTab !== "guardrails"} className="flex flex-col gap-4">
        <SectionIntro
          icon={ShieldAlert}
          title="Guardrails & Banned Topics"
          description="Topics and claims the Research and content workflow must not use."
        />
        <FieldBlock label="Banned topics" name="bannedTopics" value={toLines(context.bannedTopics)} as="textarea" rows={5} maxLength={2_000} helperText="One per line." readOnly={isReadOnly} error={validationErrors.bannedTopics} />
      </div>

      {state.error ? (
        <p role="alert" className="rounded-control bg-danger/10 px-3 py-2 text-small font-medium text-danger-strong">{state.error}</p>
      ) : null}
      {state.success ? (
        <p className="rounded-control bg-success/10 px-3 py-2 text-small font-medium text-success-strong">{state.success}</p>
      ) : null}
      {!isReadOnly ? (
        <Button type="submit" variant="brand" size="lg" disabled={isPending} className="self-start">
          {isPending ? "Saving..." : "Save business context"}
        </Button>
      ) : null}
    </form>
  );
}
