import { z } from "zod";
import { FUNNEL_STAGES, POST_TYPES } from "@/lib/ai/playbooks/taxonomies";

export const MAX_DRAFT_BATCH_SIZE = 10;
export const MAX_SLOT_DRAFT_ATTEMPTS = 3;
export const draftBriefSchema = z.object({
  topic: z.string().trim().min(3).max(500),
  postType: z.enum(POST_TYPES).default("framework"),
  funnelStage: z.enum(FUNNEL_STAGES).default("Depth"),
  contentPillar: z.string().trim().max(500).default(""),
  intendedReader: z.string().trim().max(500).default(""),
  primaryTakeaway: z.string().trim().max(700).default(""),
}).strict();
export type DraftBrief = z.infer<typeof draftBriefSchema>;
export const startDraftBatchSchema = z.object({
  requestKey: z.string().uuid(),
  slots: z.array(z.object({ slotId: z.string().uuid(), brief: draftBriefSchema }).strict())
    .min(1).max(MAX_DRAFT_BATCH_SIZE),
}).strict().refine(value => new Set(value.slots.map(slot => slot.slotId)).size === value.slots.length,
  "Choose each slot once.");

export type DraftJobSummary = {
  id: string;
  status: "active" | "completed" | "cancelled";
  canResume: boolean;
  total: number;
  saved: number;
  failed: number;
  pending: number;
  attempts: number;
};
export const DRAFT_ERROR_COPY: Record<string, string> = {
  FORBIDDEN: "Your current account permissions do not allow this batch.",
  NOT_FOUND: "This batch or calendar is no longer available.",
  VALIDATION_ERROR: "Choose up to ten slots and provide a topic for each.",
  SLOT_NOT_AVAILABLE: "A selected slot changed or already has a draft. Refresh the plan.",
  BATCH_ACTIVE: "A batch is already active for this month. Resume or cancel it first.",
  BRIEF_LOCKED: "A retry uses its original brief. Replan the unfinished slot to change it.",
  SOURCE_UNAVAILABLE: "The selected source is no longer available.",
  ATTEMPTS_EXHAUSTED: "This slot reached its three-attempt limit. Replan it before trying again.",
  NOT_CONFIGURED: "The writing provider is not configured for this environment.",
  LEASE_LOST: "This attempt stopped because its lease expired or the batch was cancelled.",
  GENERATION_FAILED: "Draft generation failed. You can retry this slot.",
};
