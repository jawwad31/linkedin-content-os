"use client";

import { useActionState, useEffect, useId, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import {
  createFounderExperienceAction,
  updateFounderExperienceAction,
  type FounderExperienceFormState,
} from "./actions";
import type { FounderExperience } from "./queries";

const initialState: FounderExperienceFormState = { error: null, success: null };

export function FounderExperienceForm({
  clientId,
  experience,
  onCancel,
  onSaved,
}: {
  clientId: string;
  experience?: FounderExperience;
  onCancel?: () => void;
  onSaved?: () => void;
}) {
  const action = experience
    ? updateFounderExperienceAction.bind(null, clientId, experience.id)
    : createFounderExperienceAction.bind(null, clientId);

  const [state, formAction, isPending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  // Multiple FounderExperienceForm instances can be mounted at once (the
  // permanently-visible top entry form plus a card's inline edit form), so
  // field ids must be unique per instance to avoid duplicate-id/label
  // mismatches. `name` stays a plain field name — that's what the server
  // action reads from FormData.
  const idPrefix = useId();
  const titleId = `${idPrefix}-title`;
  const whatHappenedId = `${idPrefix}-whatHappened`;
  const whatWasLearnedId = `${idPrefix}-whatWasLearned`;
  const whatChangedId = `${idPrefix}-whatChanged`;
  const whyItMattersId = `${idPrefix}-whyItMatters`;

  useEffect(() => {
    if (state.success) {
      // Reset uncontrolled fields so a permanently-visible "new entry" form
      // clears for the next log entry. Harmless for edit-mode instances,
      // which unmount immediately after onSaved() switches the card to
      // view mode.
      formRef.current?.reset();
      onSaved?.();
    }
  }, [state.success, onSaved]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col gap-4 rounded-control border border-border-grey bg-soft-white p-4"
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor={titleId} className="text-small font-medium">
          Title
        </label>
        <Input
          id={titleId}
          name="title"
          defaultValue={experience?.title ?? ""}
          required
          maxLength={200}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={whatHappenedId} className="text-small font-medium">
          What happened
        </label>
        <Textarea
          id={whatHappenedId}
          name="whatHappened"
          rows={4}
          defaultValue={experience?.whatHappened ?? ""}
          required
          maxLength={4000}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={whatWasLearnedId} className="text-small font-medium">
          What was learned
        </label>
        <Textarea
          id={whatWasLearnedId}
          name="whatWasLearned"
          rows={3}
          defaultValue={experience?.whatWasLearned ?? ""}
          maxLength={4000}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={whatChangedId} className="text-small font-medium">
          What changed
        </label>
        <Textarea
          id={whatChangedId}
          name="whatChanged"
          rows={3}
          defaultValue={experience?.whatChanged ?? ""}
          maxLength={4000}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={whyItMattersId} className="text-small font-medium">
          Why it matters
        </label>
        <Textarea
          id={whyItMattersId}
          name="whyItMatters"
          rows={3}
          defaultValue={experience?.whyItMatters ?? ""}
          maxLength={4000}
        />
      </div>

      {state.error ? (
        <p
          role="alert"
          className="rounded-control bg-danger/10 px-3 py-2 text-small font-medium text-danger-strong"
        >
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="rounded-control bg-success/10 px-3 py-2 text-small font-medium text-success-strong">
          {state.success}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" variant="brand" disabled={isPending}>
          {isPending
            ? "Saving..."
            : experience
              ? "Save changes"
              : "Add Founder Experience"}
        </Button>
        {onCancel ? (
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={isPending}
          >
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
