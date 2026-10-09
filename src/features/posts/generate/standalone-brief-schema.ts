import { z } from "zod";

import { FUNNEL_STAGES, POST_TYPES } from "@/lib/ai/playbooks/taxonomies";

// Standalone sources are supplied in full, never silently shortened to fit.
export const STANDALONE_SOURCE_MAX_BYTES = 128_000;

const sourceSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("note"),
    notes: z.string().max(4000).refine((text) => text.trim().length > 0 && !text.includes("\0"),
      "Add a source note."),
  }).strict(),
  z.object({
    mode: z.literal("document"),
    documentId: z.string().uuid(),
  }).strict(),
  z.object({
    mode: z.literal("upload"),
    filename: z.string().trim().min(1).max(255).refine(
      (name) => /\.(md|txt)$/.test(name), "Choose a .md or .txt file.",
    ),
    contentText: z.string().max(STANDALONE_SOURCE_MAX_BYTES).refine(
      (text) => text.trim().length > 0 && !text.includes("\0"),
      "Choose a nonempty UTF-8 text file.",
    ),
  }).strict(),
]);

export const standaloneBriefSchema = z.object({
  requestId: z.string().uuid(),
  source: sourceSchema,
  topic: z.string().trim().min(3).max(500),
  instructions: z.string().max(4000).default(""),
  postType: z.enum(POST_TYPES).optional(),
  funnelStage: z.enum(FUNNEL_STAGES).optional(),
  intendedReader: z.string().trim().max(500).default(""),
  primaryTakeaway: z.string().trim().max(700).default(""),
  contentPillar: z.string().trim().max(500).default(""),
}).strict();

export type StandaloneBriefInput = z.infer<typeof standaloneBriefSchema>;
export type StandaloneDocumentOption = { id: string; filename: string; version: number };
