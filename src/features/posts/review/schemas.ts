import { z } from "zod";

export const EDIT_NOTE_MAX_LENGTH = 2000;

export const needsEditRequestSchema = z.object({
  editNote: z
    .string()
    .trim()
    .min(1, "Edit note is required.")
    .max(
      EDIT_NOTE_MAX_LENGTH,
      `Edit note must be ${EDIT_NOTE_MAX_LENGTH} characters or fewer.`,
    ),
});

export type NeedsEditRequest = z.infer<typeof needsEditRequestSchema>;
