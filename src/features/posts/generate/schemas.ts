import { z } from "zod";

export const generatePostRequestSchema = z.object({}).strict();

export type GeneratePostRequest = z.infer<typeof generatePostRequestSchema>;
