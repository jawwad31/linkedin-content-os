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
async function service<T>(fn: () => Promise<T>) {
  await db.exec("set role service_role");
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}
async function rpc(name: string, params: unknown[]) {
  return (
    await db.query<{ r: Record<string, unknown> }>(
      `select public.${name}(${params.map((_, i) => `$${i + 1}`).join(",")}) r`,
      params,
    )
  ).rows[0].r;
}
describe("RSS replaces blog discovery without losing history", () => {
  it("blocks new/resumed blog sources but preserves legacy records and snapshots scoped, active, recent RSS articles", async () => {
    const ws = await seedWorkspace(db, "rss-snapshot");
    const other = await seedWorkspace(db, "rss-other");
    await db.query("insert into public.profiles(id) values($1),($2)", [
      ws.adminId,
      other.adminId,
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
      expect(
        await rpc("manage_research_source", [
          ws.clientId,
          "https://example.com/blog",
          "blog",
          null,
          true,
          false,
        ]),
      ).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    });
    const blog = (
      await db.query<{ id: string }>(
        "insert into public.research_sources(client_id,url,kind,configured_by) values($1,'https://example.com/old-blog','blog',$2) returning id",
        [ws.clientId, ws.adminId],
      )
    ).rows[0].id;
    await db.query(
      "insert into public.research_source_versions(client_id,source_id,url,title,original,content,content_hash,fetched_at,change_kind) values($1,$2,'https://example.com/old-post','Old blog','original','old facts',repeat('a',64),now(),'new')",
      [ws.clientId, blog],
    );
    await asUser(db, ws.adminId, async () => {
      expect(
        (
          await rpc("manage_research_source", [
            ws.clientId,
            "https://example.com/old-blog",
            "blog",
            blog,
            true,
            false,
          ])
        ).ok,
      ).toBe(false);
      expect(
        (
          await rpc("manage_research_source", [
            ws.clientId,
            "https://example.com/old-blog",
            "article",
            blog,
            true,
            false,
          ])
        ).ok,
      ).toBe(false);
      expect(
        (
          await rpc("manage_research_source", [
            ws.clientId,
            "https://example.com/old-blog",
            "blog",
            blog,
            false,
            true,
          ])
        ).ok,
      ).toBe(true);
    });
    const feed = async (client: string, active = true) =>
      (
        await db.query<{ id: string }>(
          "insert into public.rss_sources(client_id,source_name,feed_url,active) values($1,'Publisher','https://example.com/feed.xml',$2) returning id",
          [client, active],
        )
      ).rows[0].id;
    const active = await feed(ws.clientId);
    const paused = await feed(ws.clientId, false);
    const foreign = await feed(other.clientId);
    const article = (
      client: string,
      source: string,
      key: string,
      date: string | null,
    ) =>
      db.query(
        "insert into public.market_signal_items(client_id,rss_source_id,title,url,summary,content_hash,published_at,status) values($1,$2,$3,$4,'feed summary',$3,$5,'irrelevant')",
        [client, source, key, `https://example.com/${key}`, date],
      );
    for (let i = 0; i < 22; i++)
      await article(
        ws.clientId,
        active,
        `recent-${i}`,
        new Date(Date.now() - i * 60000).toISOString(),
      );
    await article(ws.clientId, active, "old", "2020-01-01T00:00:00Z");
    await article(ws.clientId, active, "unknown-date", null);
    await article(ws.clientId, active, "future", "2099-01-01T00:00:00Z");
    await article(ws.clientId, paused, "paused", new Date().toISOString());
    await article(other.clientId, foreign, "foreign", new Date().toISOString());
    await db.query(
      "update public.research_schedules set next_due_at=now()-interval '1 hour' where client_id=$1",
      [ws.clientId],
    );
    const claim = await service(() =>
      rpc("claim_scheduled_research", [
        ws.clientId,
        JSON.stringify(RESEARCH_BUDGET),
      ]),
    );
    expect(claim.ok).toBe(true);
    const context = await service(() =>
      rpc("load_rss_research_context", [
        ws.clientId,
        ws.adminId,
        claim.briefingId,
      ]),
    );
    const sources = context.sources as {
      kind: string;
      title: string;
      text: string;
      feedPublishedAt: string | null;
      feedUrl: string;
    }[];
    expect(sources).toHaveLength(20);
    expect(context.omitted).toBe(3);
    expect(
      sources.every(
        (s) =>
          s.kind === "rss" &&
          s.text === "feed summary" &&
          s.feedUrl === "https://example.com/feed.xml",
      ),
    ).toBe(true);
    expect(sources.map((s) => s.title)).not.toContain("Old blog");
    for (const title of ["foreign", "paused", "old", "future"])
      expect(sources.map((s) => s.title)).not.toContain(title);
    expect(
      sources.find((s) => s.title === "unknown-date")?.feedPublishedAt,
    ).toBeNull();
    expect(
      (
        await service(() =>
          rpc("load_rss_research_context", [
            other.clientId,
            ws.adminId,
            claim.briefingId,
          ]),
        )
      ).ok,
    ).toBe(false);
    expect(
      (
        await service(() =>
          rpc("load_rss_research_context", [
            ws.clientId,
            other.adminId,
            claim.briefingId,
          ]),
        )
      ).ok,
    ).toBe(false);
    expect(
      (
        await db.query<{ source_snapshot: unknown }>(
          "select source_snapshot from public.research_run_inputs where briefing_id=$1",
          [claim.briefingId],
        )
      ).rows[0].source_snapshot,
    ).toEqual(sources);
    await db.exec(
      readFileSync(
        "supabase/migrations/20261009142928_rss_prompt_research.sql",
        "utf8",
      ),
    );
    expect(
      (
        await db.query(
          "select id from public.research_source_versions where source_id=$1",
          [blog],
        )
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await db.query(
          "select id from public.market_signal_items where client_id=$1",
          [ws.clientId],
        )
      ).rows,
    ).toHaveLength(26);
    await db.exec("set role authenticated");
    try {
      await expect(
        rpc("load_rss_research_context", [
          ws.clientId,
          ws.adminId,
          claim.briefingId,
        ]),
      ).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec("reset role");
    }
  });
});
