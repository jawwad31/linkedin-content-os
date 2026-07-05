import { z } from "zod";

/**
 * Content columns this feature reads/writes on founder_experiences, shared
 * between the update action's before/after diff so audit metadata only ever
 * lists field names, never values.
 */
export const FOUNDER_EXPERIENCE_COLUMNS = [
  "title",
  "what_happened",
  "what_was_learned",
  "what_changed",
  "why_it_matters",
] as const;

export type FounderExperienceColumn = (typeof FOUNDER_EXPERIENCE_COLUMNS)[number];

const requiredText = (max: number, message: string) =>
  z.string().trim().min(1, message).max(max);
const optionalText = (max: number) => z.string().trim().max(max);

export const founderExperienceFormSchema = z.object({
  title: requiredText(200, "Title is required."),
  whatHappened: requiredText(4000, "What happened is required."),
  whatWasLearned: optionalText(4000),
  whatChanged: optionalText(4000),
  whyItMatters: optionalText(4000),
});

export type FounderExperienceFormInput = z.infer<
  typeof founderExperienceFormSchema
>;

function emptyToNull(value: string): string | null {
  return value.length === 0 ? null : value;
}

/**
 * Maps validated form input to the exact founder_experiences columns this
 * feature is allowed to write (used for both insert and update).
 */
export function toFounderExperienceRow(input: FounderExperienceFormInput) {
  return {
    title: input.title,
    what_happened: input.whatHappened,
    what_was_learned: emptyToNull(input.whatWasLearned),
    what_changed: emptyToNull(input.whatChanged),
    why_it_matters: emptyToNull(input.whyItMatters),
  } satisfies Record<FounderExperienceColumn, unknown>;
}
