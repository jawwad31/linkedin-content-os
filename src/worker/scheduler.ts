// Persistent Railway RSS collection worker (Feature 14).
//
// Runs standalone under plain `node` (see package.json's "worker" script
// and register-hooks.mjs / ts-resolve-hook.mjs alongside this file — no
// tsx/ts-node dependency was added). Collect-only by default
// (RESEARCH_PIPELINE_FULL=false); set RESEARCH_PIPELINE_FULL=true to also
// mark collected articles relevant or not after each client's collection
// (Feature 17). TrendCards are no longer built.

// @next/env's bundled CJS output isn't statically analyzable for named ESM
// exports under plain Node (no bundler), so `import { loadEnvConfig } from
// "@next/env"` fails at runtime. A default import works under both plain
// Node (CJS interop unwraps it to the whole module.exports object) and
// TypeScript's esModuleInterop (synthesizes the same shape for type-check).
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

import { classifyForClient } from "@/features/research/agents/research-classifier";
import { collectForClient } from "@/features/research/rss-collector";
// Imported from the run-guard submodule directly, not the feature's
// index.ts barrel: that barrel also re-exports queries.ts, which imports
// next/headers through the SSR Supabase client — that only works inside a
// real Next.js request, and would break the worker's module graph even
// though the worker never actually calls that export.
import {
  RSS_COLLECT_LOCK_KEY,
  withResearchRunGuard,
} from "@/features/research/research-runs/run-guard";
import type { ResearchRunSummary } from "@/features/research/research-runs/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchResearchSchedules } from "@/features/research/automation/executor";
import { automationEnabled } from "@/features/research/automation/contracts";
import { researchTick } from "./research-tick";

const CLASSIFY_STAGE = "classify";

// Next.js only auto-loads .env.local for its own `next` CLI commands; a
// plain `node` process (this worker) does not get that for free. Load it
// explicitly, first, before anything below reads process.env. Safe to call
// here (rather than needing dynamic imports after this line): neither
// createAdminClient nor collectForClient's module graph reads env vars at
// import time — both only read process.env lazily, inside function bodies
// that run later, well after this line has already executed.
loadEnvConfig(process.cwd());

/**
 * Env vars createAdminClient() needs. Checked explicitly at startup so a
 * missing-env failure produces one clear, safe log line instead of a vague
 * "Initial collection cycle failed" a few lines into a doomed first cycle.
 */
const REQUIRED_ENV_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

/** Returns the names only — never reads or logs the values themselves. */
function findMissingEnvVars(): string[] {
  return REQUIRED_ENV_VARS.filter((name) => !process.env[name]);
}

type WorkerEnv = {
  enabled: boolean;
  intervalHours: number;
  runOnStart: boolean;
  batchDelayMs: number;
  fullPipeline: boolean;
};

type CycleSummary = {
  clientsProcessed: number;
  sourcesProcessed: number;
  totalFetched: number;
  totalNew: number;
  skippedDuplicate: number;
  skippedInvalid: number;
  skippedStale: number;
  skippedError: number;
  errorCount: number;
  lockedRuns: number;
  failedRuns: number;
  classifiedCount: number;
  relevantCount: number;
  irrelevantCount: number;
  classificationErrorCount: number;
};

function readWorkerEnv(): WorkerEnv {
  const enabled =
    (process.env.RSS_COLLECTOR_ENABLED ?? "true").toLowerCase() !== "false";

  const intervalHoursRaw = Number(
    process.env.RSS_COLLECTOR_INTERVAL_HOURS ?? "6",
  );
  const intervalHours =
    Number.isFinite(intervalHoursRaw) && intervalHoursRaw > 0
      ? intervalHoursRaw
      : 6;

  const runOnStart =
    (process.env.RSS_COLLECTOR_RUN_ON_START ?? "true").toLowerCase() !==
    "false";

  const batchDelayMsRaw = Number(
    process.env.RSS_COLLECTOR_BATCH_DELAY_MS ?? "0",
  );
  const batchDelayMs =
    Number.isFinite(batchDelayMsRaw) && batchDelayMsRaw >= 0
      ? batchDelayMsRaw
      : 0;

  const fullPipeline =
    (process.env.RESEARCH_PIPELINE_FULL ?? "false").toLowerCase() === "true";

  return { enabled, intervalHours, runOnStart, batchDelayMs, fullPipeline };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * client_id values with at least one active, non-archived RSS source.
 * Computed client-side from a plain select (no RPC) — data volumes at this
 * stage don't warrant a dedicated distinct query.
 */
async function discoverEligibleClientIds(): Promise<string[]> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("rss_sources")
    .select("client_id")
    .eq("active", true)
    .is("deleted_at", null);

  if (error || !data) {
    console.error("[rss-worker] Could not list RSS sources for this cycle.");
    return [];
  }

  return Array.from(new Set(data.map((row) => row.client_id as string)));
}

type CycleFnResult = {
  collect: Awaited<ReturnType<typeof collectForClient>>;
  classify: Awaited<ReturnType<typeof classifyForClient>> | null;
};

function toCycleRunSummary(result: CycleFnResult): ResearchRunSummary {
  const base: ResearchRunSummary = {
    sourcesProcessed: result.collect.sourcesProcessed,
    totalFetched: result.collect.totalFetched,
    totalNew: result.collect.totalNew,
    skippedDuplicate: result.collect.skippedDuplicate,
    skippedInvalid: result.collect.skippedInvalid,
    skippedStale: result.collect.skippedStale,
    skippedError: result.collect.skippedError,
    errorCount: result.collect.errors.length,
  };

  // "not_configured" is a benign, expected ops state — collection still
  // succeeded. Any other failure reason is one error, not a failure of the
  // whole (already-successful) earlier stage.
  return !result.classify
    ? base
    : result.classify.ok
      ? {
          ...base,
          classifiedCount: result.classify.summary.classifiedCount,
          relevantCount: result.classify.summary.relevantCount,
          irrelevantCount: result.classify.summary.irrelevantCount,
          classificationErrorCount: result.classify.summary.errorCount,
        }
      : {
          ...base,
          classificationErrorCount:
            result.classify.reason === "not_configured" ? 0 : 1,
        };
}

/**
 * Runs collectForClient (and, when fullPipeline is enabled, classifyForClient
 * right after) for every eligible client, each wrapped in the distributed
 * research run guard (Feature 15) so overlapping worker replicas/intervals
 * — or a manual trigger (Feature 16) — can't run for the same client at
 * once. One locked client is skipped safely; one client failing outright
 * (beyond the broken-feed handling collectForClient already does
 * internally) is caught here — neither stops the rest of the cycle.
 */
async function runCollectionCycle(
  batchDelayMs: number,
  fullPipeline: boolean,
): Promise<CycleSummary> {
  const summary: CycleSummary = {
    clientsProcessed: 0,
    sourcesProcessed: 0,
    totalFetched: 0,
    totalNew: 0,
    skippedDuplicate: 0,
    skippedInvalid: 0,
    skippedStale: 0,
    skippedError: 0,
    errorCount: 0,
    lockedRuns: 0,
    failedRuns: 0,
    classifiedCount: 0,
    relevantCount: 0,
    irrelevantCount: 0,
    classificationErrorCount: 0,
  };

  const clientIds = await discoverEligibleClientIds();

  for (const clientId of clientIds) {
    const guardResult = await withResearchRunGuard(
      clientId,
      RSS_COLLECT_LOCK_KEY,
      "worker",
      async () => {
        const collect = await collectForClient(clientId);
        const classify = fullPipeline
          ? await classifyForClient(clientId)
          : null;
        return { collect, classify };
      },
      toCycleRunSummary,
      null,
      fullPipeline ? CLASSIFY_STAGE : undefined,
    );

    if (guardResult.ok && guardResult.status === "completed") {
      const result = guardResult.result;
      summary.clientsProcessed += 1;
      summary.sourcesProcessed += result.collect.sourcesProcessed;
      summary.totalFetched += result.collect.totalFetched;
      summary.totalNew += result.collect.totalNew;
      summary.skippedDuplicate += result.collect.skippedDuplicate;
      summary.skippedInvalid += result.collect.skippedInvalid;
      summary.skippedStale += result.collect.skippedStale;
      summary.skippedError += result.collect.skippedError;
      summary.errorCount += result.collect.errors.length;

      if (result.classify?.ok) {
        summary.classifiedCount += result.classify.summary.classifiedCount;
        summary.relevantCount += result.classify.summary.relevantCount;
        summary.irrelevantCount += result.classify.summary.irrelevantCount;
        summary.classificationErrorCount += result.classify.summary.errorCount;
      } else if (
        result.classify &&
        result.classify.reason !== "not_configured"
      ) {
        summary.classificationErrorCount += 1;
      }
    } else if (guardResult.ok && guardResult.status === "locked") {
      summary.lockedRuns += 1;
    } else {
      summary.failedRuns += 1;
      console.error(
        "[rss-worker] Research run failed for one client; continuing.",
      );
    }

    if (batchDelayMs > 0) {
      await sleep(batchDelayMs);
    }
  }

  return summary;
}

function logCycleSummary(summary: CycleSummary): void {
  console.log("[rss-worker] Cycle complete:", JSON.stringify(summary));
}

// setTimeout's delay is a 32-bit signed int internally; anything past this
// gets silently clamped to 1ms by Node, which would turn a large interval
// into a crash-loop instead of a wait. Cap to that limit.
const MAX_SET_TIMEOUT_MS = 2_147_483_647;

let stopped = false;
let timer: NodeJS.Timeout | null = null;
let nextCollectionAt = 0;

function scheduleNextCycle(env: WorkerEnv): void {
  if (stopped) return;

  const intervalMs = Math.min(
    automationEnabled() ? 60_000 : env.intervalHours * 60 * 60 * 1000,
    MAX_SET_TIMEOUT_MS,
  );

  timer = setTimeout(async () => {
    if (stopped) return;

    await runTick(env);

    scheduleNextCycle(env);
  }, intervalMs);
}

async function mainLoop(env: WorkerEnv): Promise<void> {
  nextCollectionAt = env.runOnStart
    ? 0
    : Date.now() + env.intervalHours * 3_600_000;
  await runTick(env);
  scheduleNextCycle(env);
}
async function runTick(env: WorkerEnv): Promise<void> {
  await researchTick(
    {
      rssEnabled: env.enabled,
      automationEnabled: automationEnabled(),
      rssDue: Date.now() >= nextCollectionAt,
    },
    {
      research: async () => {
        const summary = await dispatchResearchSchedules();
        console.log(
          "[rss-worker] Scheduled research cycle:",
          JSON.stringify(summary),
        );
      },
      rss: async () => {
        try {
          logCycleSummary(
            await runCollectionCycle(env.batchDelayMs, env.fullPipeline),
          );
        } finally {
          nextCollectionAt = Date.now() + env.intervalHours * 3_600_000;
        }
      },
      onError: (task) =>
        console.error(
          `[rss-worker] ${task} cycle failed; will retry on its next tick.`,
        ),
    },
  );
}

function handleShutdown(signal: string): void {
  console.log(`[rss-worker] Received ${signal}, stopping.`);
  stopped = true;
  if (timer) clearTimeout(timer);
  process.exit(0);
}

async function start(): Promise<void> {
  console.log("[rss-worker] Starting RSS collector worker.");

  const missingEnvVars = findMissingEnvVars();
  if (missingEnvVars.length > 0) {
    console.error(
      `[rss-worker] Missing required environment variables: ${missingEnvVars.join(", ")}`,
    );
    process.exit(1);
  }

  const env = readWorkerEnv();

  console.log(
    `[rss-worker] Interval: ${env.intervalHours}h, run on start: ${env.runOnStart}.`,
  );

  if (!env.enabled && !automationEnabled()) {
    console.log(
      "[rss-worker] RSS and research automation are disabled — worker is idle.",
    );
    return;
  }

  process.on("SIGINT", () => handleShutdown("SIGINT"));
  process.on("SIGTERM", () => handleShutdown("SIGTERM"));

  await mainLoop(env);
}

start().catch(() => {
  console.error("[rss-worker] Failed to start. Check service configuration.");
  process.exit(1);
});
