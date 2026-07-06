// Persistent Railway RSS collection worker (Feature 14).
//
// Runs standalone under plain `node` (see package.json's "worker" script
// and register-hooks.mjs / ts-resolve-hook.mjs alongside this file — no
// tsx/ts-node dependency was added). Classification and Market Signal
// synthesis (RESEARCH_PIPELINE_FULL) are not implemented yet; this worker
// only collects.

// @next/env's bundled CJS output isn't statically analyzable for named ESM
// exports under plain Node (no bundler), so `import { loadEnvConfig } from
// "@next/env"` fails at runtime. A default import works under both plain
// Node (CJS interop unwraps it to the whole module.exports object) and
// TypeScript's esModuleInterop (synthesizes the same shape for type-check).
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

import { collectForClient } from "@/features/research/rss-collector";
import { createAdminClient } from "@/lib/supabase/admin";

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
};

type CycleSummary = {
  clientsProcessed: number;
  sourcesProcessed: number;
  totalFetched: number;
  totalNew: number;
  skippedDuplicate: number;
  skippedInvalid: number;
  skippedError: number;
  errorCount: number;
};

function readWorkerEnv(): WorkerEnv {
  const enabled =
    (process.env.RSS_COLLECTOR_ENABLED ?? "true").toLowerCase() !== "false";

  const intervalHoursRaw = Number(process.env.RSS_COLLECTOR_INTERVAL_HOURS ?? "6");
  const intervalHours =
    Number.isFinite(intervalHoursRaw) && intervalHoursRaw > 0
      ? intervalHoursRaw
      : 6;

  const runOnStart =
    (process.env.RSS_COLLECTOR_RUN_ON_START ?? "true").toLowerCase() !== "false";

  const batchDelayMsRaw = Number(process.env.RSS_COLLECTOR_BATCH_DELAY_MS ?? "0");
  const batchDelayMs =
    Number.isFinite(batchDelayMsRaw) && batchDelayMsRaw >= 0 ? batchDelayMsRaw : 0;

  return { enabled, intervalHours, runOnStart, batchDelayMs };
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

/**
 * Runs collectForClient for every eligible client. One client failing
 * outright (beyond the broken-feed handling collectForClient already does
 * internally) is caught here and does not stop the rest of the cycle.
 */
async function runCollectionCycle(batchDelayMs: number): Promise<CycleSummary> {
  const summary: CycleSummary = {
    clientsProcessed: 0,
    sourcesProcessed: 0,
    totalFetched: 0,
    totalNew: 0,
    skippedDuplicate: 0,
    skippedInvalid: 0,
    skippedError: 0,
    errorCount: 0,
  };

  const clientIds = await discoverEligibleClientIds();

  for (const clientId of clientIds) {
    try {
      const result = await collectForClient(clientId);
      summary.clientsProcessed += 1;
      summary.sourcesProcessed += result.sourcesProcessed;
      summary.totalFetched += result.totalFetched;
      summary.totalNew += result.totalNew;
      summary.skippedDuplicate += result.skippedDuplicate;
      summary.skippedInvalid += result.skippedInvalid;
      summary.skippedError += result.skippedError;
      summary.errorCount += result.errors.length;
    } catch {
      summary.errorCount += 1;
      console.error("[rss-worker] Collection failed for one client; continuing.");
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

function scheduleNextCycle(env: WorkerEnv): void {
  if (stopped) return;

  const intervalMs = Math.min(
    env.intervalHours * 60 * 60 * 1000,
    MAX_SET_TIMEOUT_MS,
  );

  timer = setTimeout(async () => {
    if (stopped) return;

    try {
      const summary = await runCollectionCycle(env.batchDelayMs);
      logCycleSummary(summary);
    } catch {
      console.error(
        "[rss-worker] Collection cycle failed; will retry next interval.",
      );
    }

    scheduleNextCycle(env);
  }, intervalMs);
}

async function mainLoop(env: WorkerEnv): Promise<void> {
  if (env.runOnStart) {
    try {
      const summary = await runCollectionCycle(env.batchDelayMs);
      logCycleSummary(summary);
    } catch {
      console.error(
        "[rss-worker] Initial collection cycle failed; will retry next interval.",
      );
    }
  }

  scheduleNextCycle(env);
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

  if (!env.enabled) {
    console.log("[rss-worker] RSS_COLLECTOR_ENABLED=false — worker is idle.");
    return;
  }

  process.on("SIGINT", () => handleShutdown("SIGINT"));
  process.on("SIGTERM", () => handleShutdown("SIGTERM"));

  await mainLoop(env);
}

start().catch((error) => {
  console.error(
    "[rss-worker] Failed to start:",
    error instanceof Error ? error.message : "unknown error",
  );
  process.exit(1);
});
