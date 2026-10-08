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
  skippedStale?: number;
  skippedError: number;
  errorCount: number;
  // Optional: only set when a run also classifies (Feature 17). Omitted by
  // collect-only callers (the worker's default path), which writes 0s.
  classifiedCount?: number;
  relevantCount?: number;
  irrelevantCount?: number;
  classificationErrorCount?: number;
  // Optional: only set when a run also synthesizes (Feature 18). Omitted by
  // collect/classify-only callers, which write 0s.
  signalsCreated?: number;
  synthesisErrorCount?: number;
};

const STAGE_LABELS: Record<string, string> = {
  web_research: "Web research",
  rss_collect: "Collecting articles",
  classify: "Classifying articles",
  synthesize: "Synthesizing TrendCards",
};

/** Research run `stage` is a free-form internal lock/pipeline-stage string
 * (e.g. "rss_collect"), not something meant for display. Falls back to the
 * raw value for any stage not yet mapped, rather than hiding it. */
export function formatResearchRunStage(stage: string | null): string | null {
  if (!stage) return null;
  return STAGE_LABELS[stage] ?? stage;
}

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
  signalsCreated: number;
  synthesisErrorCount: number;
  createdAt: string;
};
