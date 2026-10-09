import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  asUser,
  createMigratedDb,
  seedExperience,
  seedWorkspace,
  type MigratedDb,
  type SeededWorkspace,
} from "./support/pg-harness";
import { researchFinding } from "./fixtures/web-research";
import type {
  EditionInput,
  SourceSelection,
} from "@/features/newsletter/contracts";
let db: MigratedDb;
beforeAll(async () => {
  db = await createMigratedDb();
}, 180000);
afterAll(async () => {
  await db?.close();
});
type Result = {
  ok: boolean;
  code?: string;
  id: string;
  revision: number;
  attempt: string;
  token: string;
};
const payload = (ids: string[], body = ""): EditionInput => ({
  title: "Weekly lessons",
  startDate: "2026-10-01",
  endDate: "2026-10-07",
  reader: "Agency operators",
  depth: "standard",
  sections: ids.map((id) => ({
    heading: "One useful lesson",
    sourceIds: [id],
    commentary: "",
    body,
  })),
});
async function rpc(query: string, args: unknown[]) {
  return (await db.query<{ r: Result }>(`select public.${query} as r`, args))
    .rows[0].r;
}
const save = (
  ws: SeededWorkspace,
  sources: SourceSelection[],
  input = payload(sources.map((s) => s.id)),
  id: string | null = null,
  revision: number | null = null,
  key = randomUUID(),
) =>
  asUser(db, ws.adminId, () =>
    rpc("save_newsletter_edition($1,$2,$3,$4,$5::jsonb,$6::jsonb)", [
      ws.clientId,
      id,
      revision,
      key,
      JSON.stringify(input),
      JSON.stringify(sources),
    ]),
  );
const transition = (
  ws: SeededWorkspace,
  id: string,
  revision: number,
  action: string,
  url: string | null = null,
  date: string | null = null,
) =>
  asUser(db, ws.adminId, () =>
    rpc("transition_newsletter_edition($1,$2,$3,$4,$5,$6)", [
      ws.clientId,
      id,
      revision,
      action,
      url,
      date,
    ]),
  );
const begin = (
  ws: SeededWorkspace,
  id: string,
  revision: number,
  mode = "draft",
  actor = ws.adminId,
  key = randomUUID(),
) =>
  rpc("begin_newsletter_attempt($1,$2,$3,$4,$5,$6)", [
    ws.clientId,
    id,
    actor,
    revision,
    key,
    mode,
  ]);
const finish = (
  ws: SeededWorkspace,
  attempt: Result,
  input: EditionInput | null,
) =>
  rpc("finish_newsletter_attempt($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb)", [
    ws.clientId,
    attempt.attempt,
    attempt.token,
    input ? JSON.stringify(input) : null,
    JSON.stringify({ verdict: "pass", issues: [], proofNotes: "Checked" }),
    JSON.stringify({ profileRevision: 1 }),
  ]);
async function fixture(label: string, reusable = false) {
  const ws = await seedWorkspace(db, label);
  await db.query("insert into profiles(id) values($1),($2),($3)", [
    ws.adminId,
    ws.plannerId,
    ws.drafterId,
  ]);
  const sourceId = await seedExperience(
    db,
    ws.clientId,
    "Supplied experience",
    { allowReuse: reusable },
  );
  const selections: SourceSelection[] = [
    { id: sourceId, type: "founder_experience", reuseConfirmed: false },
  ];
  return { ws, sourceId, selections };
}
async function finding(ws: SeededWorkspace, fingerprint: string) {
  await db.query(
    "insert into research_prompt_versions(client_id,revision,prompt) values($1,1,'Test saved research prompt') on conflict do nothing",
    [ws.clientId],
  );
  const run = (
    await db.query<{ id: string }>(
      "insert into research_runs(client_id,trigger_type,status) values($1,'manual','success') returning id",
      [ws.clientId],
    )
  ).rows[0].id;
  const briefing = (
    await db.query<{ id: string }>(
      "insert into research_briefings(client_id,run_id,revision,outcome,request_key,created_by) values($1,$2,1,'success',$3,$4) returning id",
      [ws.clientId, run, randomUUID(), ws.adminId],
    )
  ).rows[0].id;
  return (
    await db.query<{ id: string }>(
      "insert into research_findings(client_id,briefing_id,payload,fingerprint,approval_status) values($1,$2,$3,$4,'approved') returning id",
      [
        ws.clientId,
        briefing,
        JSON.stringify({ ...researchFinding, fingerprint }),
        fingerprint,
      ],
    )
  ).rows[0].id;
}
describe("newsletter transactions and access", () => {
  it("reserves one use, is idempotent and excludes calendar counts", async () => {
    const { ws, sourceId, selections } = await fixture("idempotency");
    const key = randomUUID();
    const a = await save(ws, selections, payload([sourceId]), null, null, key);
    expect(a.ok).toBe(true);
    expect(
      (await save(ws, selections, payload([sourceId]), null, null, key)).id,
    ).toBe(a.id);
    expect(
      (
        await db.query("select * from source_usage where newsletter_id=$1", [
          a.id,
        ])
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await db.query("select * from calendar_slots where client_id=$1", [
          ws.clientId,
        ])
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await rpc("reserve_content_bank_source($1,$2,'founder_experience')", [
          ws.clientId,
          sourceId,
        ])
      ).code,
    ).toBe("SINGLE_USE_CONFLICT");
  });
  it("mixes approved research and an experience; duplicate developments roll back everything", async () => {
    const { ws, sourceId, selections } = await fixture("mixed");
    const f1 = await finding(ws, "one");
    const f2 = await finding(ws, "two");
    const same = await finding(ws, "one");
    const mixed: SourceSelection[] = [
      ...selections,
      { id: f1, type: "research_finding", reuseConfirmed: false },
      { id: f2, type: "research_finding", reuseConfirmed: false },
    ];
    const duplicate = await save(ws, [
      { id: f1, type: "research_finding", reuseConfirmed: false },
      { id: same, type: "research_finding", reuseConfirmed: false },
    ]);
    expect(duplicate.ok).toBe(false);
    expect(
      (
        await db.query("select * from newsletter_editions where client_id=$1", [
          ws.clientId,
        ])
      ).rows,
    ).toHaveLength(0);
    const a = await save(ws, mixed);
    expect(a.ok).toBe(true);
    expect(
      (
        await db.query("select * from newsletter_sources where edition_id=$1", [
          a.id,
        ])
      ).rows,
    ).toHaveLength(3);
    expect((await transition(ws, a.id, 1, "confirm_outline")).ok).toBe(true);
    const job = await begin(ws, a.id, 1);
    expect(job.ok).toBe(true);
    expect(
      (await finish(ws, job, payload([sourceId, f1, f2], "Grounded draft"))).ok,
    ).toBe(true);
  });
  it("failure releases the source, retries commit once, and duplicate paid requests cannot start again", async () => {
    const { ws, sourceId, selections } = await fixture("retry");
    const a = await save(ws, selections);
    await transition(ws, a.id, 1, "confirm_outline");
    const key = randomUUID();
    const first = await begin(ws, a.id, 1, "draft", ws.adminId, key);
    expect(first.ok).toBe(true);
    expect((await begin(ws, a.id, 1, "draft", ws.adminId, key)).code).toBe(
      "REQUEST_ALREADY_HANDLED",
    );
    await finish(ws, first, null);
    expect(
      (
        await db.query<{ status: string }>(
          "select status from source_usage where source_id=$1",
          [sourceId],
        )
      ).rows[0].status,
    ).toBe("cancelled");
    const second = await begin(ws, a.id, 1);
    expect(second.ok).toBe(true);
    const result = await finish(ws, second, payload([sourceId], "Draft text"));
    expect(result.revision).toBe(2);
    expect(
      (await finish(ws, second, payload([sourceId], "Another text"))).ok,
    ).toBe(false);
    expect(
      (
        await db.query(
          "select * from source_usage where source_id=$1 and status='used'",
          [sourceId],
        )
      ).rows,
    ).toHaveLength(1);
  });
  it("requires exact human approval; edit resets QA/approval and publication records use", async () => {
    const { ws, sourceId, selections } = await fixture("approval");
    const a = await save(ws, selections, payload([sourceId], "Manual draft"));
    expect((await transition(ws, a.id, 1, "approve")).code).toBe("QA_REQUIRED");
    const qa = await begin(ws, a.id, 1, "qa");
    await finish(ws, qa, payload([sourceId], "Manual draft"));
    expect((await transition(ws, a.id, 1, "approve")).ok).toBe(true);
    expect(
      (
        await asUser(db, ws.adminId, () =>
          rpc("read_approved_newsletter($1,$2,$3)", [ws.clientId, a.id, 1]),
        )
      ).ok,
    ).toBe(true);
    expect(
      (await transition(ws, a.id, null as unknown as number, "approve")).ok,
    ).toBe(false);
    const edited = await save(
      ws,
      selections,
      payload([sourceId], "Edited manual draft"),
      a.id,
      1,
    );
    expect(edited.revision).toBe(2);
    expect(
      (
        await asUser(db, ws.adminId, () =>
          rpc("read_approved_newsletter($1,$2,$3)", [ws.clientId, a.id, 1]),
        )
      ).ok,
    ).toBe(false);
    expect(
      (
        await transition(
          ws,
          a.id,
          1,
          "publish",
          "https://www.linkedin.com/pulse/example",
          "2026-10-07",
        )
      ).ok,
    ).toBe(false);
    expect((await transition(ws, a.id, 2, "approve")).code).toBe("QA_REQUIRED");
    await finish(
      ws,
      await begin(ws, a.id, 2, "qa"),
      payload([sourceId], "Edited manual draft"),
    );
    await transition(ws, a.id, 2, "approve");
    expect(
      (
        await transition(
          ws,
          a.id,
          2,
          "publish",
          "https://www.linkedin.com/pulse/example",
          "2026-10-07",
        )
      ).ok,
    ).toBe(true);
    expect(
      (
        await db.query<{ status: string }>(
          "select status from source_usage where newsletter_id=$1",
          [a.id],
        )
      ).rows[0].status,
    ).toBe("published");
    expect((await save(ws, selections, payload([sourceId]), a.id, 2)).ok).toBe(
      false,
    );
  });
  it("requires deliberate permitted reuse and preserves use after archive", async () => {
    const { ws, sourceId, selections } = await fixture("reuse", true);
    const a = await save(ws, selections);
    expect((await save(ws, selections)).ok).toBe(false);
    expect(
      (await save(ws, [{ ...selections[0], reuseConfirmed: true }])).ok,
    ).toBe(true);
    await transition(ws, a.id, 1, "confirm_outline");
    await finish(ws, await begin(ws, a.id, 1), payload([sourceId], "draft"));
    await transition(ws, a.id, 2, "archive");
    expect(
      (
        await db.query(
          "select * from source_usage where newsletter_id=$1 and status='used'",
          [a.id],
        )
      ).rows,
    ).toHaveLength(1);
  });
  it("denies cross-workspace reads, source substitution, one-capability creation and forged writes", async () => {
    const { ws, sourceId, selections } = await fixture("scope");
    const other = await seedWorkspace(db, "outsider");
    const a = await save(ws, selections);
    await asUser(db, other.adminId, async () => {
      expect(
        (
          await db.query(
            "select * from newsletter_sources where edition_id=$1",
            [a.id],
          )
        ).rows,
      ).toHaveLength(0);
    });
    expect((await save(other, selections)).ok).toBe(false);
    for (const actor of [ws.drafterId, ws.plannerId])
      await asUser(db, actor, async () => {
        expect(
          (
            await rpc(
              "save_newsletter_edition($1,null,null,$2,$3::jsonb,$4::jsonb)",
              [
                ws.clientId,
                randomUUID(),
                JSON.stringify(payload([sourceId])),
                JSON.stringify(selections),
              ],
            )
          ).ok,
        ).toBe(false);
      });
    await asUser(db, ws.adminId, async () => {
      await expect(
        db.query(
          "update newsletter_editions set approved_revision=revision where id=$1",
          [a.id],
        ),
      ).rejects.toThrow(/permission denied/);
      await expect(
        db.query(
          "update source_usage set status='published' where newsletter_id=$1 returning id",
          [a.id],
        ),
      ).resolves.toMatchObject({ rows: [] });
      await expect(
        db.query(
          "select public.begin_newsletter_attempt($1,$2,$3,1,$4,'draft')",
          [ws.clientId, a.id, ws.adminId, randomUUID()],
        ),
      ).rejects.toThrow(/permission denied/);
    });
  });
  it("blocks source hard deletion and invalidates results after revocation, expired lease or brief change", async () => {
    const { ws, sourceId, selections } = await fixture("lease");
    const a = await save(ws, selections);
    await transition(ws, a.id, 1, "confirm_outline");
    const job = await begin(ws, a.id, 1);
    await expect(
      db.query("delete from founder_experiences where client_id=$1 and id=$2", [
        ws.clientId,
        sourceId,
      ]),
    ).rejects.toThrow(/foreign key/);
    expect((await save(ws, selections, payload([sourceId]), a.id, 1)).ok).toBe(
      false,
    );
    await db.query(
      "update profiles set must_change_password=true where id=$1",
      [ws.adminId],
    );
    expect((await finish(ws, job, payload([sourceId], "bad"))).ok).toBe(false);
    await db.query(
      "update profiles set must_change_password=false where id=$1",
      [ws.adminId],
    );
    await db.query(
      "update newsletter_attempts set lease_until=now()-interval '1 minute' where id=$1",
      [job.attempt],
    );
    expect((await finish(ws, job, payload([sourceId], "bad"))).ok).toBe(false);
    const next = await begin(ws, a.id, 1);
    expect(next.ok).toBe(true);
    expect(
      (
        await finish(ws, next, {
          ...payload([sourceId], "bad"),
          reader: "Different reader",
        })
      ).ok,
    ).toBe(false);
  });
  it("rejects null payload fields and reruns without destroying an active edition", async () => {
    const { ws, sourceId, selections } = await fixture("rerun");
    const a = await save(ws, selections);
    expect(
      (
        await save(ws, selections, {
          ...payload([sourceId]),
          title: null,
        } as unknown as EditionInput)
      ).ok,
    ).toBe(false);
    await db.exec(
      fs.readFileSync(
        "supabase/migrations/20261009131721_newsletter_editions.sql",
        "utf8",
      ),
    );
    expect(
      (await db.query("select * from newsletter_editions where id=$1", [a.id]))
        .rows,
    ).toHaveLength(1);
    await db.exec("set role anon");
    try {
      await expect(
        db.query("select * from newsletter_editions"),
      ).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec("reset role");
    }
  });
});
