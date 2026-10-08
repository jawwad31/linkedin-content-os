import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  asUser,
  createMigratedDb,
  seedWorkspace,
  type MigratedDb,
} from "./support/pg-harness";
import {
  INITIAL_RESEARCH_PROMPT,
  RESEARCH_BUDGET,
} from "@/features/research/web-research/contracts";
import { researchFinding } from "./fixtures/web-research";

let db: MigratedDb;
beforeAll(async () => {
  db = await createMigratedDb();
}, 180_000);
afterAll(async () => {
  await db.close();
});
type Result = {
  ok: boolean;
  code?: string;
  id?: string;
  revision?: number;
  profile?: unknown;
  prompt?: string;
  items?: { findingId: string; ideaId: string }[];
};
async function rpc(fn: string, params: unknown[]) {
  return (
    await db.query<{ r: Result }>(
      `select public.${fn}(${params.map((_, i) => `$${i + 1}`).join(",")}) as r`,
      params,
    )
  ).rows[0].r;
}
async function fixture(label: string) {
  const ws = await seedWorkspace(db, label);
  await db.query("insert into public.profiles(id) values($1),($2),($3)", [
    ws.adminId,
    ws.plannerId,
    ws.drafterId,
  ]);
  await asUser(db, ws.adminId, () =>
    rpc("save_research_settings", [
      ws.clientId,
      0,
      INITIAL_RESEARCH_PROMPT,
      7,
      false,
    ]),
  );
  return ws;
}
async function prepare(
  ws: Awaited<ReturnType<typeof fixture>>,
  revision = 1,
  key = randomUUID(),
) {
  const { rows } = await db.query<{ id: string }>(
    "insert into public.research_runs(client_id,triggered_by_user_id,trigger_type,status,lock_key,started_at) values($1,$2,'manual','running','rss_collect',now()) returning id",
    [ws.clientId, ws.adminId],
  );
  return asUser(db, ws.adminId, () =>
    rpc("prepare_web_research", [
      ws.clientId,
      rows[0].id,
      key,
      revision,
      JSON.stringify(RESEARCH_BUDGET),
    ]),
  );
}
function result(count = 1) {
  return {
    outcome: "success",
    summary: "Test briefing",
    coverageGaps: [],
    errorCode: null,
    toolCalls: 1,
    candidates: researchFinding.sources.map((s) => ({
      ...s,
      fetchedAt: "2026-10-08T08:00:00Z",
    })),
    findings: Array.from({ length: count }, (_, i) => ({
      ...researchFinding,
      developmentKey: `change-${i}`,
      fingerprint: `fingerprint-${i}`,
    })),
  };
}
async function finish(
  client: string,
  briefing: string,
  actor: string,
  payload: unknown = result(),
) {
  await db.exec("set role service_role");
  try {
    return await rpc("finish_web_research", [
      client,
      briefing,
      actor,
      JSON.stringify(payload),
    ]);
  } finally {
    await db.exec("reset role");
  }
}
describe("P07 schema, snapshots and explicit selection", () => {
  it("saves exact immutable versions, rejects stale edits, and reruns without overwriting settings", async () => {
    const ws = await fixture("research-version");
    await asUser(db, ws.adminId, async () => {
      const saved = await rpc("save_research_settings", [
        ws.clientId,
        1,
        "Research astronomy releases exactly as requested.\nPreserve this line.",
        3,
        false,
      ]);
      expect(saved.revision).toBe(2);
      expect(
        (
          await rpc("save_research_settings", [
            ws.clientId,
            1,
            "An obsolete concurrent edit",
            7,
            true,
          ])
        ).code,
      ).toBe("REVISION_CHANGED");
    });
    const migration = readFileSync(
      "supabase/migrations/20261007192100_prompt_controlled_web_research.sql",
      "utf8",
    );
    await db.exec(migration);
    const versions = (
      await db.query<{
        revision: number;
        prompt: string;
        use_profile_context: boolean;
      }>(
        "select revision,prompt,use_profile_context from public.research_prompt_versions where client_id=$1 order by revision",
        [ws.clientId],
      )
    ).rows;
    expect(versions).toHaveLength(2);
    expect(versions[0].prompt).toBe(INITIAL_RESEARCH_PROMPT);
    expect(versions[0].use_profile_context).toBe(false);
    expect(versions[1].prompt).toContain("\nPreserve this line.");
  });
  it("requires a real owned shared lock and the current saved version; profile off stores no profile", async () => {
    const ws = await fixture("research-snapshot");
    await db.query(
      "update public.clients set business_description='private business detail' where id=$1",
      [ws.clientId],
    );
    await asUser(db, ws.adminId, async () => {
      expect(
        (
          await rpc("prepare_web_research", [
            ws.clientId,
            randomUUID(),
            randomUUID(),
            1,
            "{}",
          ])
        ).code,
      ).toBe("RUN_UNAVAILABLE");
    });
    const prepared = await prepare(ws);
    expect(prepared.ok).toBe(true);
    expect(prepared.profile).toBeNull();
    expect(prepared.prompt).toBe(INITIAL_RESEARCH_PROMPT);
    const input = (
      await db.query<{ profile_snapshot: unknown }>(
        "select profile_snapshot from public.research_run_inputs where briefing_id=$1",
        [prepared.id],
      )
    ).rows[0];
    expect(input.profile_snapshot).toBeNull();
    await expect(
      db.query(
        "insert into public.research_runs(client_id,trigger_type,status,lock_key) values($1,'worker','running','rss_collect')",
        [ws.clientId],
      ),
    ).rejects.toMatchObject({ code: "23505" });
    await db.query(
      "update public.research_runs set status='success' where client_id=$1",
      [ws.clientId],
    );
    await asUser(db, ws.adminId, () =>
      rpc("save_research_settings", [
        ws.clientId,
        1,
        "Research the profile context explicitly.",
        7,
        true,
      ]),
    );
    const stale = await prepare(ws, 1);
    expect(stale.code).toBe("REVISION_CHANGED");
    await db.query(
      "update public.research_runs set status='failed' where client_id=$1 and status='running'",
      [ws.clientId],
    );
    const enabled = await prepare(ws, 2);
    expect(enabled.profile).toMatchObject({
      business_description: "private business detail",
    });
  });
  it("denies private prompt reads, forged writes, approval, and cross-account access to account users", async () => {
    const ws = await fixture("research-scope");
    const other = await fixture("research-other");
    const prepared = await prepare(ws);
    await finish(ws.clientId, prepared.id!, ws.adminId);
    await asUser(db, ws.plannerId, async () => {
      expect(
        (
          await db.query(
            "select * from public.research_prompt_versions where client_id=$1",
            [ws.clientId],
          )
        ).rows,
      ).toHaveLength(0);
      expect(
        (
          await db.query(
            "select * from public.research_run_inputs where client_id=$1",
            [ws.clientId],
          )
        ).rows,
      ).toHaveLength(0);
      expect(
        (
          await db.query(
            "select * from public.research_findings where client_id=$1",
            [ws.clientId],
          )
        ).rows,
      ).toHaveLength(1);
      expect(
        (
          await db.query(
            "select * from public.research_briefings where client_id=$1",
            [other.clientId],
          )
        ).rows,
      ).toHaveLength(0);
      expect(
        (
          await rpc("save_research_settings", [
            ws.clientId,
            1,
            "Forbidden prompt update",
            7,
            false,
          ])
        ).code,
      ).toBe("FORBIDDEN");
      await expect(
        rpc("finish_web_research", [
          ws.clientId,
          prepared.id,
          ws.plannerId,
          JSON.stringify(result()),
        ]),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        db.query(
          "update public.research_findings set approval_status='approved' where client_id=$1",
          [ws.clientId],
        ),
      ).rejects.toMatchObject({ code: "42501" });
    });
    await db.exec("set role anon");
    try {
      await expect(
        db.query("select * from public.research_prompt_versions"),
      ).rejects.toMatchObject({ code: "42501" });
    } finally {
      await db.exec("reset role");
    }
  });
  it("rechecks password gate, removed access, initiating actor and account before the result commit", async () => {
    const ws = await fixture("research-revoke");
    const prepared = await prepare(ws);
    expect((await finish(ws.clientId, prepared.id!, ws.drafterId)).code).toBe(
      "FORBIDDEN",
    );
    await db.query(
      "update public.profiles set must_change_password=true where id=$1",
      [ws.adminId],
    );
    expect((await finish(ws.clientId, prepared.id!, ws.adminId)).code).toBe(
      "FORBIDDEN",
    );
    await asUser(db, ws.adminId, async () => {
      expect(
        (
          await db.query(
            "select * from public.research_briefings where client_id=$1",
            [ws.clientId],
          )
        ).rows,
      ).toHaveLength(0);
    });
    await db.query(
      "update public.profiles set must_change_password=false where id=$1",
      [ws.adminId],
    );
    await db.query(
      "delete from public.client_access where client_id=$1 and user_id=$2",
      [ws.clientId, ws.adminId],
    );
    expect((await finish(ws.clientId, prepared.id!, ws.adminId)).code).toBe(
      "FORBIDDEN",
    );
    expect(
      (
        await db.query(
          "select * from public.research_findings where client_id=$1",
          [ws.clientId],
        )
      ).rows,
    ).toHaveLength(0);
  });
  it("commits all candidates without operational ideas/posts and only selects approved sources on request", async () => {
    const ws = await fixture("research-select");
    const prepared = await prepare(ws);
    await finish(ws.clientId, prepared.id!, ws.adminId, result(2));
    expect(
      (
        await db.query(
          "select * from public.content_ideas where client_id=$1",
          [ws.clientId],
        )
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query("select * from public.posts where client_id=$1", [
          ws.clientId,
        ])
      ).rows,
    ).toHaveLength(0);
    const ids = (
      await db.query<{ id: string }>(
        "select id from public.research_findings where client_id=$1 order by id",
        [ws.clientId],
      )
    ).rows.map((f) => f.id);
    await asUser(db, ws.adminId, async () => {
      expect(
        (await rpc("select_research_findings", [ws.clientId, ids])).code,
      ).toBe("FINDING_UNAVAILABLE");
      for (const id of ids)
        expect(
          (await rpc("review_research_finding", [ws.clientId, id, "approved"]))
            .ok,
        ).toBe(true);
      const selected = await rpc("select_research_findings", [
        ws.clientId,
        ids,
      ]);
      expect(selected.items).toHaveLength(2);
      expect(new Set(selected.items!.map((i) => i.ideaId)).size).toBe(2);
      expect(
        (await rpc("select_research_findings", [ws.clientId, ids])).items,
      ).toEqual(selected.items);
      expect(
        (
          await rpc("review_research_finding", [
            ws.clientId,
            ids[0],
            "archived",
          ])
        ).code,
      ).toBe("FINDING_UNAVAILABLE");
    });
    expect(
      (
        await db.query(
          "select * from public.content_ideas where client_id=$1",
          [ws.clientId],
        )
      ).rows,
    ).toHaveLength(2);
    await asUser(db, ws.plannerId, async () => {
      expect(
        (await rpc("select_research_findings", [ws.clientId, ids])).code,
      ).toBe("FORBIDDEN");
    });
    await asUser(db, ws.drafterId, async () => {
      expect(
        (await rpc("select_research_findings", [ws.clientId, ids])).code,
      ).toBe("FORBIDDEN");
    });
  });
  it("records missing provider configuration as a distinct briefing outcome and retries commits idempotently", async () => {
    const ws = await fixture("research-not-configured");
    const prepared = await prepare(ws);
    const payload = {
      ...result(0),
      outcome: "not_configured",
      errorCode: "NOT_CONFIGURED",
      candidates: [],
    };
    expect(
      (await finish(ws.clientId, prepared.id!, ws.adminId, payload)).ok,
    ).toBe(true);
    expect(
      (await finish(ws.clientId, prepared.id!, ws.adminId, result())).ok,
    ).toBe(true);
    const rows = (
      await db.query<{ outcome: string }>(
        "select outcome from public.research_briefings where id=$1",
        [prepared.id],
      )
    ).rows;
    expect(rows[0].outcome).toBe("not_configured");
    expect(
      (
        await db.query(
          "select * from public.research_findings where client_id=$1",
          [ws.clientId],
        )
      ).rows,
    ).toHaveLength(0);
  });
  it("rejects cross-account selections and duplicate IDs, while a member with both capabilities can select", async () => {
    const ws = await fixture("research-capabilities");
    const other = await fixture("research-foreign");
    const prepared = await prepare(ws);
    await finish(ws.clientId, prepared.id!, ws.adminId);
    const id = (
      await db.query<{ id: string }>(
        "select id from public.research_findings where client_id=$1",
        [ws.clientId],
      )
    ).rows[0].id;
    await asUser(db, ws.adminId, async () => {
      expect(
        (await rpc("review_research_finding", [other.clientId, id, "approved"]))
          .code,
      ).toBe("FORBIDDEN");
      await rpc("review_research_finding", [ws.clientId, id, "approved"]);
      expect(
        (await rpc("select_research_findings", [ws.clientId, [id, id]])).code,
      ).toBe("FINDING_UNAVAILABLE");
    });
    await asUser(db, other.adminId, async () => {
      expect(
        (await rpc("select_research_findings", [other.clientId, [id]])).code,
      ).toBe("FINDING_UNAVAILABLE");
    });
    await db.query(
      "update public.client_access set permissions=array['ideas_manage','posts_draft'] where client_id=$1 and user_id=$2",
      [ws.clientId, ws.plannerId],
    );
    await asUser(db, ws.plannerId, async () => {
      expect(
        (await rpc("review_research_finding", [ws.clientId, id, "archived"]))
          .code,
      ).toBe("FORBIDDEN");
      expect(
        (await rpc("select_research_findings", [ws.clientId, [id]])).ok,
      ).toBe(true);
    });
  });
});
