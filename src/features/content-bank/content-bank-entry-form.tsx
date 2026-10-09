"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { REACTION_TYPES, REACTION_TYPE_LABELS } from "@/features/research/trend-cards/schemas";
import { RESOURCE_TYPES } from "@/lib/ai/playbooks/taxonomies";

import { createContentBankEntryAction, updateContentBankEntryAction } from "./actions";
import {
  CONTENT_BANK_CATEGORIES, CONTENT_BANK_CATEGORY_LABELS, CONTENT_BANK_READINESS,
  createContentBankEntrySchema, updateContentBankEntrySchema,
  type ContentBankCategory, type ContentBankEntry,
} from "./schemas";

const selectClass = "h-10 rounded-control border border-border-grey bg-white px-3 text-small";

function entryValues(entry?: ContentBankEntry): Record<string, string | boolean> {
  return {
    category: entry?.category ?? "observation", title: entry?.title ?? "",
    rawNotes: entry?.rawNotes ?? "", takeaway: entry?.takeaway ?? "",
    whatHappened: entry?.whatHappened ?? "", whatWasLearned: entry?.whatWasLearned ?? "",
    whatChanged: entry?.whatChanged ?? "", whyItMatters: entry?.whyItMatters ?? "",
    resourceType: entry?.resourceType ?? "guide", description: entry?.description ?? "",
    problemSolved: entry?.problemSolved ?? "", targetUseCase: entry?.targetUseCase ?? "",
    keyword: entry?.keyword ?? "", deliveryUrl: entry?.deliveryUrl ?? "",
    deliveryInstructions: entry?.deliveryInstructions ?? "", active: entry?.active ?? true,
    commentGateApproved: entry?.commentGateApproved ?? false,
    readiness: entry?.readiness ?? "ready", allowReuse: entry?.allowReuse ?? false,
    reactionType: entry?.reactionType ?? "observation",
  };
}

export function ContentBankEntryForm({
  clientId, entry, canManageExperiences, canManageResources, onCancel, onSaved,
}: {
  clientId: string; entry?: ContentBankEntry;
  canManageExperiences: boolean; canManageResources: boolean;
  onCancel: () => void; onSaved: () => void;
}) {
  const initial = entryValues(entry);
  const [category, setCategory] = useState<ContentBankCategory>(entry?.category ?? (canManageExperiences ? "observation" : "lead_magnet"));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const isResource = entry ? entry.sourceType === "content_resource" : category === "lead_magnet";
  const isReaction = entry?.entryType === "trend_reaction";

  function textField(name: string, label: string, maxLength: number, multiline = true, required = false) {
    const props = { name, defaultValue: String(initial[name] ?? ""), maxLength, required };
    return <label className="flex flex-col gap-1.5 text-small font-medium">
      {label}
      {multiline ? <Textarea {...props} rows={3} /> : <Input {...props} />}
    </label>;
  }

  function checkbox(name: string, label: string) {
    return <label className="flex items-start gap-2 text-small">
      <input name={name} type="checkbox" defaultChecked={Boolean(initial[name])} className="mt-1 h-4 w-4" />
      {label}
    </label>;
  }

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const values: Record<string, unknown> = {};
    for (const [key, value] of form.entries()) values[key] = value;
    for (const key of ["allowReuse", ...(isResource ? ["active", "commentGateApproved"] : [])]) values[key] = form.has(key);
    values.category = category;
    // Unchanged values are omitted, including legacy notes with significant whitespace.
    const input = entry
      ? Object.fromEntries(Object.entries(values).filter(([key, value]) => value !== initial[key]))
      : values;
    if (entry) input.expectedUpdatedAt = entry.updatedAt;
    const parsed = entry ? updateContentBankEntrySchema.safeParse(input) : createContentBankEntrySchema.safeParse(input);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check the entry details."); return; }
    startTransition(async () => {
      try {
        const result = entry
          ? await updateContentBankEntryAction(clientId, entry.id, entry.sourceType, updateContentBankEntrySchema.parse(input))
          : await createContentBankEntryAction(clientId, createContentBankEntrySchema.parse(input));
        if (result.error) setError(result.error);
        else onSaved();
      } catch { setError("Could not save this entry. Your changes are still here; try again."); }
    });
  }

  return <form onSubmit={save} className="rounded-card border border-border-grey bg-soft-white p-4">
    <h2 className="mb-4 text-card-title font-semibold">{entry ? "Edit Content Bank entry" : "Capture experience or resource"}</h2>
    <fieldset disabled={isPending} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-small font-medium">Category
          <select value={category} onChange={(event) => setCategory(event.target.value as ContentBankCategory)} className={selectClass}>
            {CONTENT_BANK_CATEGORIES.filter((value) => entry
              ? (value === "lead_magnet") === isResource
              : value === "lead_magnet" ? canManageResources : canManageExperiences).map((value) =>
              <option key={value} value={value}>{CONTENT_BANK_CATEGORY_LABELS[value]}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-small font-medium">Readiness
          <select name="readiness" defaultValue={String(initial.readiness)} className={selectClass}>
            {CONTENT_BANK_READINESS.filter((value) => entry || value !== "archived").map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
      </div>
      {textField("title", "Title", 200, false, true)}
      {textField("rawNotes", "Raw notes / pasted transcript", 10_000)}
      {isResource ? <>
        <p className="text-small text-muted-foreground">Delivery is manual. Add a URL or delivery instructions. Raw notes and the resource description are saved separately.</p>
        <label className="flex flex-col gap-1.5 text-small font-medium">Resource type
          <select name="resourceType" defaultValue={String(initial.resourceType)} className={selectClass}>
            {RESOURCE_TYPES.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        {textField("description", "Resource description", 2_000)}
        {textField("problemSolved", "Problem solved", 1_500)}
        {textField("targetUseCase", "Target use case", 1_500)}
        {textField("keyword", "Comment keyword (letters, numbers, underscore or hyphen)", 40, false, true)}
        <label className="flex flex-col gap-1.5 text-small font-medium">Delivery URL
          <Input name="deliveryUrl" type="url" defaultValue={String(initial.deliveryUrl)} maxLength={2_000} />
        </label>
        {textField("deliveryInstructions", "Delivery instructions", 2_000)}
        {checkbox("active", "Active resource. Archived readiness deactivates it; restoring readiness requires deliberate activation.")}
        {checkbox("commentGateApproved", "Approve this resource for a comment-keyword CTA with manual delivery.")}
      </> : <>
        {textField("takeaway", "Primary takeaway", 2_000)}
        {isReaction ? <label className="flex flex-col gap-1.5 text-small font-medium">Reaction type
          <select name="reactionType" defaultValue={String(initial.reactionType)} className={selectClass}>
            {REACTION_TYPES.map((value) => <option key={value} value={value}>{REACTION_TYPE_LABELS[value]}</option>)}
          </select>
        </label> : null}
        {textField("whatHappened", isReaction ? "Proof or example" : "What happened", isReaction ? 2_000 : 4_000)}
        {textField("whatWasLearned", isReaction ? "Your take" : "What was learned", isReaction ? 2_000 : 4_000, true, isReaction)}
        {textField("whatChanged", "What changed", 4_000)}
        {textField("whyItMatters", "Why it matters", 4_000)}
      </>}
      {checkbox("allowReuse", "Allow multi-angle reuse. Each new use still requires deliberate selection.")}
      {error ? <p role="alert" className="text-small text-danger-strong">{error}</p> : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" variant="brand">{isPending ? "Saving..." : entry ? "Save changes" : "Save to Content Bank"}</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </fieldset>
  </form>;
}
