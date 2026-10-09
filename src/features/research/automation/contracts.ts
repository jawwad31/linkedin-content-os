import { z } from "zod";
export function automationEnabled() {
  return process.env.RESEARCH_AUTOMATION_ENABLED === "true";
}
export const scheduleSchema = z
  .object({
    version: z.number().int().nonnegative(),
    enabled: z.boolean(),
    timezone: z
      .string()
      .min(1)
      .max(100)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: value });
          return true;
        } catch {
          return false;
        }
      }),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  })
  .strict();
export const sourceSchema = z
  .object({
    url: z.string().url().max(2048),
    kind: z.enum(["article", "blog"]),
    sourceId: z.string().uuid().optional(),
    enabled: z.boolean().optional(),
    archived: z.boolean().optional(),
  })
  .strict();
export type ScheduleView = {
  version: number;
  enabled: boolean;
  timezone: string;
  local_time: string;
  next_due_at: string | null;
  last_due_at: string | null;
};
export type SourceView = {
  id: string;
  url: string;
  kind: "article" | "blog";
  enabled: boolean;
  checked_at: string | null;
  error_code: string | null;
};
export type SourceVersionView = {
  id: string;
  source_id: string;
  url: string;
  title: string;
  content: string;
  change_kind: "new" | "updated";
  fetched_at: string;
  content_hash: string;
};
export type NotificationView = {
  id: string;
  briefing_id: string;
  kind: "ready" | "partial" | "failure";
  created_at: string;
};
export type AutomationView = {
  schedule: ScheduleView;
  sources: SourceView[];
  versions: SourceVersionView[];
  notifications: NotificationView[];
  canManage: boolean;
};
