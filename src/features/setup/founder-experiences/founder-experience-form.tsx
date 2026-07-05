"use client";

import { useActionState, useEffect } from "react";

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
  onCancel: () => void;
  onSaved: () => void;
}) {
  const action = experience
    ? updateFounderExperienceAction.bind(null, clientId, experience.id)
    : createFounderExperienceAction.bind(null, clientId);

  const [state, formAction, isPending] = useActionState(action, initialState);

  useEffect(() => {
    if (state.success) {
      onSaved();
    }
  }, [state.success, onSaved]);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4 rounded-control border border-border-grey bg-soft-white p-4"
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="title" className="text-small font-medium">
          Title
        </label>
        <Input
          id="title"
          name="title"
          defaultValue={experience?.title ?? ""}
          required
          maxLength={200}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="whatHappened" className="text-small font-medium">
          What happened
        </label>
        <Textarea
          id="whatHappened"
          name="whatHappened"
          rows={4}
          defaultValue={experience?.whatHappened ?? ""}
          required
          maxLength={4000}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="whatWasLearned" className="text-small font-medium">
          What was learned
        </label>
        <Textarea
          id="whatWasLearned"
          name="whatWasLearned"
          rows={3}
          defaultValue={experience?.whatWasLearned ?? ""}
          maxLength={4000}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="whatChanged" className="text-small font-medium">
          What changed
        </label>
        <Textarea
          id="whatChanged"
          name="whatChanged"
          rows={3}
          defaultValue={experience?.whatChanged ?? ""}
          maxLength={4000}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="whyItMatters" className="text-small font-medium">
          Why it matters
        </label>
        <Textarea
          id="whyItMatters"
          name="whyItMatters"
          rows={3}
          defaultValue={experience?.whyItMatters ?? ""}
          maxLength={4000}
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

      <div className="flex items-center gap-3">
        <Button type="submit" variant="gradient" disabled={isPending}>
          {isPending
            ? "Saving..."
            : experience
              ? "Save changes"
              : "Add Founder Experience"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={isPending}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
