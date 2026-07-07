import { z } from "zod";

import { PLANNING_MODES } from "@/features/ideas/agents/planning-agent";

export const generateIdeasRequestSchema = z.object({
  mode: z.enum(PLANNING_MODES),
  sourceId: z.string().uuid(),
});

export type GenerateIdeasRequest = z.infer<typeof generateIdeasRequestSchema>;
