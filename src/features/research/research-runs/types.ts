export type ResearchRunTriggerType = "manual" | "worker";

export type ResearchRunStatus =
  | "queued"
  | "running"
  | "success"
  | "failed"
  | "cancelled";

export type ResearchRunSummary = {
  sourcesProcessed: number;
  totalFetched: number;
  totalNew: number;
  skippedDuplicate: number;
  skippedInvalid: number;
  skippedError: number;
  errorCount: number;
};

export type ResearchRun = {
  id: string;
  status: ResearchRunStatus;
  stage: string | null;
  triggerType: ResearchRunTriggerType;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  sourcesProcessed: number;
  totalFetched: number;
  totalNew: number;
  skippedDuplicate: number;
  skippedInvalid: number;
  skippedError: number;
  errorCount: number;
  createdAt: string;
};
