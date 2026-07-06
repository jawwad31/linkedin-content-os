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
  // Optional: only set when a run also classifies (Feature 17). Omitted by
  // collect-only callers (the worker's default path), which writes 0s.
  classifiedCount?: number;
  relevantCount?: number;
  irrelevantCount?: number;
  classificationErrorCount?: number;
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
  classifiedCount: number;
  relevantCount: number;
  irrelevantCount: number;
  classificationErrorCount: number;
  createdAt: string;
};
