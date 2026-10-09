import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import {
  createMigratedDb,
  seedWorkspace,
  asUser,
  type MigratedDb,
} from "./support/pg-harness";
import {
  INITIAL_RESEARCH_PROMPT,
  RESEARCH_BUDGET,
} from "@/features/research/web-research/contracts";
let db: MigratedDb;
beforeAll(async () => {
  db = await createMigratedDb();
}, 180_000);
afterAll(async () => {
  await db?.close();
});
type Reply = {
  ok: boolean;
  code?: string;
  occurrenceId?: string;
  token?: string;
  briefingId?: string;
  runId?: string;
  id?: string;
  actor?: string;
  profile?: unknown;
  settings?: { prompt: string };
  retry?: boolean;
  changed?: number;
};
async function rpc(name: string, params: unknown[]): Promise<Reply> {
  return (
    await db.query<{ r: Reply }>(
      `select public.${name}(${params.map((_, i) => `$${i + 1}`).join(",")}) r`,
      params,
    )
  ).rows[0].r;
}
async function service<T>(fn: () => Promise<T>) {
  await db.exec("set role service_role");
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}
async function fixture(label: string) {
  const ws = await seedWorkspace(db, label);
  await db.query("insert into public.profiles(id) values($1),($2),($3)", [
    ws.adminId,
    ws.plannerId,
    ws.drafterId,
  ]);
  await asUser(db, ws.adminId, async () => {
    await rpc("save_research_settings", [
      ws.clientId,
      0,
      INITIAL_RESEARCH_PROMPT,
      7,
      false,
    ]);
    await rpc("save_research_schedule", [
      ws.clientId,
      0,
      true,
      "Asia/Karachi",
      "09:00",
    ]);
  });
  await db.query(
    "update public.research_schedules set next_due_at=now()-interval '8 days' where client_id=$1",
    [ws.clientId],
  );
  return ws;
}
const claim = (client: string) =>
  service(() =>
    rpc("claim_scheduled_research", [client, JSON.stringify(RESEARCH_BUDGET)]),
  );
const output = (outcome = "empty") => ({
  outcome,
  summary: "Test briefing",
  errorCode: outcome === "failed" ? "PROVIDER_ERROR" : null,
  coverageGaps: [],
  candidates: [],
  findings: [],
  toolCalls: 1,
  tokenInput: 1,
  tokenOutput: 1,
});
const finish = (client: string, c: Reply, outcome = "empty") =>
  service(() =>
    rpc("finish_scheduled_research", [
      client,
      c.occurrenceId,
      c.token,
      JSON.stringify(output(outcome)),
      "[]",
    ]),
  );
describe("P08 durable schedules and scoped source records", () => {
  it("resolves Karachi and both DST transitions to exactly one real local time", async () => {
    const due = async (day: string, zone: string, time: string) =>
      (
        await db.query<{ t: Date }>(
          "select private.research_day_due($1::date,$2,$3::time) t",
          [day, zone, time],
        )
      ).rows[0].t;
    expect(
      new Date(await due("2026-10-09", "Asia/Karachi", "09:00")).toISOString(),
    ).toBe("2026-10-09T04:00:00.000Z");
    expect(
      new Date(
        await due("2026-03-08", "America/New_York", "02:30"),
      ).toISOString(),
    ).toBe("2026-03-08T07:00:00.000Z");
    expect(
      new Date(
        await due("2026-11-01", "America/New_York", "01:30"),
      ).toISOString(),
    ).toBe("2026-11-01T05:30:00.000Z");
  });
  it("coalesces downtime, shares the manual lock, and rejects the second replica without spending another attempt", async () => {
    const ws = await fixture("schedule-lock");
    const run = (
      await db.query<{ id: string }>(
        "insert into public.research_runs(client_id,triggered_by_user_id,trigger_type,status,lock_key,started_at) values($1,$2,'manual','running','rss_collect',now()) returning id",
        [ws.clientId, ws.adminId],
      )
    ).rows[0].id;
    expect((await claim(ws.clientId)).code).toBe("LOCKED");
    await db.query(
      "update public.research_runs set status='success' where id=$1",
      [run],
    );
    const first = await claim(ws.clientId);
    expect(first.ok).toBe(true);
    await db.query(
      "update public.research_occurrences set lease_until=now()+interval '2 seconds' where id=$1",
      [first.occurrenceId],
    );
    expect(
      (
        await service(() =>
          rpc("renew_scheduled_research", [
            ws.clientId,
            first.occurrenceId,
            first.token,
          ]),
        )
      ).ok,
    ).toBe(true);
    expect(first.profile).toBeNull();
    expect(first.settings?.prompt).toBe(INITIAL_RESEARCH_PROMPT);
    expect((await claim(ws.clientId)).code).toBe("LOCKED");
    expect((await finish(ws.clientId, first)).ok).toBe(true);
    expect((await claim(ws.clientId)).code).toBe("NOT_DUE");
    const rows = (
      await db.query<{ state: string; attempts: number }>(
        "select state,attempts from public.research_occurrences where client_id=$1",
        [ws.clientId],
      )
    ).rows;
    expect(rows).toEqual([{ state: "finished", attempts: 1 }]);
    expect(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from public.research_notifications where client_id=$1",
          [ws.clientId],
        )
      ).rows[0].n,
    ).toBe(1);
    for (const table of ["content_ideas", "posts", "calendar_slots"])
      expect(
        (
          await db.query<{ n: number }>(
            `select count(*)::int n from public.${table} where client_id=$1`,
            [ws.clientId],
          )
        ).rows[0].n,
      ).toBe(0);
  });
  it("pause invalidates paid work, refuses stale edits, and does not start a run after pause", async () => {
    const ws = await fixture("schedule-pause");
    const c = await claim(ws.clientId);
    await asUser(db, ws.adminId, async () => {
      expect(
        (
          await rpc("save_research_schedule", [
            ws.clientId,
            0,
            false,
            "Asia/Karachi",
            "09:00",
          ])
        ).code,
      ).toBe("REVISION_CHANGED");
      expect(
        (
          await rpc("save_research_schedule", [
            ws.clientId,
            1,
            false,
            "Asia/Karachi",
            "09:00",
          ])
        ).ok,
      ).toBe(true);
    });
    expect((await finish(ws.clientId, c)).code).toBe("LEASE_CHANGED");
    expect(
      (
        await service(() =>
          rpc("renew_scheduled_research", [
            ws.clientId,
            c.occurrenceId,
            c.token,
          ]),
        )
      ).code,
    ).toBe("LEASE_CHANGED");
    expect((await claim(ws.clientId)).code).toBe("NOT_DUE");
    expect(
      (
        await db.query<{ outcome: string }>(
          "select outcome from public.research_briefings where id=$1",
          [c.briefingId],
        )
      ).rows[0].outcome,
    ).toBe("failed");
  });
  it("bounds retries, records one terminal failure notification, and recovers expired leases", async () => {
    const ws = await fixture("schedule-retry");
    let c = await claim(ws.clientId);
    expect((await finish(ws.clientId, c, "failed")).retry).toBe(true);
    expect((await claim(ws.clientId)).code).toBe("LOCKED");
    await db.query(
      "update public.research_occurrences set retry_at=now()-interval '1 minute' where client_id=$1",
      [ws.clientId],
    );
    c = await claim(ws.clientId);
    expect(c.ok).toBe(true);
    await db.query(
      "update public.research_occurrences set lease_until=now()-interval '1 minute' where client_id=$1",
      [ws.clientId],
    );
    const old = c;
    c = await claim(ws.clientId);
    expect(c.ok).toBe(true);
    expect((await finish(ws.clientId, old)).code).toBe("LEASE_CHANGED");
    expect((await finish(ws.clientId, c, "failed")).retry).toBe(false);
    expect(
      (
        await db.query<{ attempts: number }>(
          "select attempts from public.research_occurrences where client_id=$1",
          [ws.clientId],
        )
      ).rows[0].attempts,
    ).toBe(3);
    expect(
      (
        await db.query<{ kind: string }>(
          "select kind from public.research_notifications where client_id=$1",
          [ws.clientId],
        )
      ).rows,
    ).toEqual([{ kind: "failure" }]);
  });
  it("revoked or password-gated administrators cannot commit or continue schedules", async () => {
    const ws = await fixture("schedule-revocation");
    const c = await claim(ws.clientId);
    await db.query(
      "update public.profiles set must_change_password=true where id=$1",
      [ws.adminId],
    );
    expect((await finish(ws.clientId, c)).code).toBe("LEASE_CHANGED");
    expect((await claim(ws.clientId)).code).toBe("FORBIDDEN");
    expect(
      (
        await db.query<{ enabled: boolean }>(
          "select enabled from public.research_schedules where client_id=$1",
          [ws.clientId],
        )
      ).rows[0].enabled,
    ).toBe(false);
  });
  it("keeps source originals, dedupes identical reads, and detects content changes including reversions", async () => {
    const ws = await fixture("source-history");
    const src = await asUser(db, ws.adminId, () =>
      rpc("manage_research_source", [
        ws.clientId,
        "https://example.com/blog",
        "blog",
        null,
        true,
      ]),
    );
    const c = await claim(ws.clientId);
    const page = (text: string, t: string) => ({
      url: "https://example.com/article",
      title: "Article",
      text,
      original: `<article>${text}</article>`,
      contentHash: createHash("sha256").update(text).digest("hex"),
      fetchedAt: t,
    });
    const record = (text: string, t: string, client = ws.clientId) =>
      service(() =>
        rpc("record_research_source", [
          client,
          src.id,
          ws.adminId,
          JSON.stringify([page(text, t)]),
          null,
          c.occurrenceId,
          c.token,
          null,
        ]),
      );
    expect(
      (await record("Original factual text", "2026-10-09T08:00:00Z")).changed,
    ).toBe(1);
    expect(
      (await record("Original factual text", "2026-10-09T08:01:00Z")).changed,
    ).toBe(0);
    expect(
      (await record("Meaningfully updated text", "2026-10-09T08:02:00Z"))
        .changed,
    ).toBe(1);
    expect(
      (await record("Original factual text", "2026-10-09T08:03:00Z")).changed,
    ).toBe(1);
    const versions = (
      await db.query<{ original: string; change_kind: string }>(
        "select original,change_kind from public.research_source_versions where source_id=$1 order by fetched_at",
        [src.id],
      )
    ).rows;
    expect(versions.map((v) => v.change_kind)).toEqual([
      "new",
      "updated",
      "updated",
    ]);
    expect(versions[0].original).toBe(
      "<article>Original factual text</article>",
    );
    const other = await fixture("source-other");
    expect(
      (await record("Cross scope text", "2026-10-09T08:04:00Z", other.clientId))
        .code,
    ).toBe("FORBIDDEN");
  });
  it("denies members/private cross-account reads and writes while allowing scoped notifications", async () => {
    const a = await fixture("automation-access-a"),
      b = await fixture("automation-access-b");
    const c = await claim(a.clientId);
    await finish(a.clientId, c);
    await asUser(db, a.plannerId, async () => {
      expect(
        (
          await rpc("save_research_schedule", [
            a.clientId,
            1,
            true,
            "Asia/Karachi",
            "09:00",
          ])
        ).code,
      ).toBe("FORBIDDEN");
      expect(
        (await db.query("select * from public.research_schedules")).rows,
      ).toHaveLength(0);
      expect(
        (
          await db.query(
            "select * from public.research_notifications where client_id=$1",
            [a.clientId],
          )
        ).rows,
      ).toHaveLength(1);
      await expect(
        db.query("update public.research_notifications set kind='ready'"),
      ).rejects.toThrow(/permission denied/);
      await expect(
        rpc("claim_scheduled_research", [a.clientId, "{}"]),
      ).rejects.toThrow(/permission denied/);
    });
    await asUser(db, b.adminId, async () => {
      expect(
        (
          await db.query(
            "select * from public.research_notifications where client_id=$1",
            [a.clientId],
          )
        ).rows,
      ).toHaveLength(0);
      expect(
        (
          await rpc("manage_research_source", [
            a.clientId,
            "https://example.com",
            "article",
            null,
            true,
          ])
        ).code,
      ).toBe("FORBIDDEN");
    });
    await db.exec("set role anon");
    try {
      await expect(
        db.query("select * from public.research_sources"),
      ).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec("reset role");
    }
  });
  it("snapshots bounded latest source context, reports omitted coverage, and archives without deleting evidence", async () => {
    const ws = await fixture("source-context");
    const src = await asUser(db, ws.adminId, () =>
      rpc("manage_research_source", [
        ws.clientId,
        "https://example.com/sitemap.xml",
        "blog",
        null,
        true,
      ]),
    );
    const c = await claim(ws.clientId);
    for (let batch = 0; batch < 2; batch++) {
      const pages = Array.from({ length: 3 }, (_, i) => ({
        url: `https://example.com/${batch * 3 + i}`,
        title: "Source title",
        text: "Real factual source text",
        original: "<article>Real factual source text</article>",
        contentHash: createHash("sha256")
          .update(String(batch * 3 + i))
          .digest("hex"),
        fetchedAt: "2026-10-09T08:00:00Z",
      }));
      expect(
        (
          await service(() =>
            rpc("record_research_source", [
              ws.clientId,
              src.id,
              ws.adminId,
              JSON.stringify(pages),
              null,
              c.occurrenceId,
              c.token,
              null,
            ]),
          )
        ).ok,
      ).toBe(true);
    }
    const context = (
      await service(() =>
        db.query<{ r: { ok: boolean; sources: unknown[]; omitted: number } }>(
          "select public.load_research_source_context($1,$2,$3) r",
          [ws.clientId, ws.adminId, c.briefingId],
        ),
      )
    ).rows[0].r;
    expect(context.sources).toHaveLength(4);
    expect(context.omitted).toBe(2);
    const snapshot = (
      await db.query<{ source_snapshot: unknown[] }>(
        "select source_snapshot from public.research_run_inputs where briefing_id=$1",
        [c.briefingId],
      )
    ).rows[0].source_snapshot;
    expect(snapshot).toEqual(context.sources);
    await asUser(db, ws.adminId, () =>
      rpc("manage_research_source", [
        ws.clientId,
        "https://example.com/sitemap.xml",
        "blog",
        src.id,
        false,
        true,
      ]),
    );
    expect(
      (
        await db.query(
          "select * from public.research_source_versions where source_id=$1",
          [src.id],
        )
      ).rows,
    ).toHaveLength(6);
    const archived = (
      await service(() =>
        db.query<{ r: { sources: unknown[] } }>(
          "select public.load_research_source_context($1,$2,$3) r",
          [ws.clientId, ws.adminId, c.briefingId],
        ),
      )
    ).rows[0].r;
    expect(archived.sources).toHaveLength(0);
  });
  it("reruns additively without rewriting saved schedules or source history", async () => {
    const before = (
      await db.query<{ n: number }>(
        "select count(*)::int n from public.research_source_versions",
      )
    ).rows[0].n;
    await db.exec(
      readFileSync(
        "supabase/migrations/20261009072944_research_automation.sql",
        "utf8",
      ),
    );
    expect(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from public.research_source_versions",
        )
      ).rows[0].n,
    ).toBe(before);
    expect(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from public.research_schedules where version>0",
        )
      ).rows[0].n,
    ).toBeGreaterThan(0);
  });
});
