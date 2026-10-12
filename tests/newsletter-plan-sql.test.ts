import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  asUser,
  createMigratedDb,
  seedExperience,
  seedWorkspace,
  type MigratedDb,
  type SeededWorkspace,
} from "./support/pg-harness";

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
type Section = {
  heading: string;
  sourceIds: string[];
  commentary: string;
  body: string;
  keyPoints?: string[];
};
type Payload = {
  title: string;
  startDate: string;
  endDate: string;
  reader: string;
  depth: string;
  sections: Section[];
  plan?: Record<string, unknown>;
  article?: string;
  claims?: unknown[];
};

const base = (sections: Section[], extra: Partial<Payload> = {}): Payload => ({
  title: "November edition",
  startDate: "2026-10-01",
  endDate: "2026-10-07",
  reader: "Agency operators",
  depth: "standard",
  sections,
  ...extra,
});
const section = (ids: string[], heading = "Heading"): Section => ({
  heading,
  sourceIds: ids,
  commentary: "",
  body: "",
});
async function rpc(query: string, args: unknown[]) {
  return (await db.query<{ r: Result }>(`select public.${query} as r`, args))
    .rows[0].r;
}
const save = (
  ws: SeededWorkspace,
  sourceIds: string[],
  input: Payload,
  id: string | null = null,
  revision: number | null = null,
) =>
  asUser(db, ws.adminId, () =>
    rpc("save_newsletter_edition($1,$2,$3,$4,$5::jsonb,$6::jsonb)", [
      ws.clientId,
      id,
      revision,
      randomUUID(),
      JSON.stringify(input),
      JSON.stringify(
        sourceIds.map((s) => ({
          id: s,
          type: "founder_experience",
          reuseConfirmed: false,
        })),
      ),
    ]),
  );
const transition = (ws: SeededWorkspace, id: string, rev: number, action: string) =>
  asUser(db, ws.adminId, () =>
    rpc("transition_newsletter_edition($1,$2,$3,$4,null,null)", [
      ws.clientId,
      id,
      rev,
      action,
    ]),
  );
const begin = (ws: SeededWorkspace, id: string, rev: number, mode: string) =>
  rpc("begin_newsletter_attempt($1,$2,$3,$4,$5,$6)", [
    ws.clientId,
    id,
    ws.adminId,
    rev,
    randomUUID(),
    mode,
  ]);
const finish = (
  ws: SeededWorkspace,
  attempt: Result,
  input: Payload | null,
  qa: unknown = { verdict: "pass", issues: [], proofNotes: "Checked" },
) =>
  rpc("finish_newsletter_attempt($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb)", [
    ws.clientId,
    attempt.attempt,
    attempt.token,
    input ? JSON.stringify(input) : null,
    JSON.stringify(qa),
    JSON.stringify({ profileRevision: 1 }),
  ]);
async function fixture(label: string, count = 2) {
  const ws = await seedWorkspace(db, label);
  await db.query("insert into profiles(id) values($1),($2),($3)", [
    ws.adminId,
    ws.plannerId,
    ws.drafterId,
  ]);
  const ids: string[] = [];
  for (let i = 0; i < count; i++)
    ids.push(await seedExperience(db, ws.clientId, `Experience ${i}`));
  const edition = await save(
    ws,
    ids,
    base(ids.map((id, i) => section([id], `Source ${i}`))),
  );
  return { ws, ids, edition };
}
const usage = async (editionId: string) =>
  (
    await db.query<{ status: string }>(
      "select status from source_usage where newsletter_id=$1 order by source_id",
      [editionId],
    )
  ).rows.map((r) => r.status);

describe("newsletter plan stage", () => {
  it("plans, confirms, drafts and approves without losing the saved outline", async () => {
    const { ws, ids, edition } = await fixture("flow");
    expect(edition.ok).toBe(true);
    const plan = await begin(ws, edition.id, 1, "plan");
    expect(plan.ok).toBe(true);
    // The outline overlaps: both sources feed the first section, one feeds the second.
    const outline = base(
      [section(ids, "What changed"), section([ids[1]], "What to test")],
      { plan: { status: "ready", factLedger: [{ factId: "F01" }] } },
    );
    const planned = await finish(ws, plan, outline, null);
    expect(planned.ok).toBe(true);
    expect(planned.revision).toBe(2);
    expect(await usage(edition.id)).toEqual(["reserved", "reserved"]);
    const saved = await db.query<{ payload: Payload }>(
      "select payload from newsletter_versions where edition_id=$1 and revision=2",
      [edition.id],
    );
    expect(saved.rows[0].payload.plan?.status).toBe("ready");
    expect(
      (await db.query<{ status: string; outline_revision: number | null }>(
        "select status, outline_revision from newsletter_editions where id=$1",
        [edition.id],
      )).rows[0],
    ).toEqual({ status: "outline", outline_revision: null });

    expect((await begin(ws, edition.id, 2, "draft")).code).toBe(
      "OUTLINE_REQUIRED",
    );
    expect((await transition(ws, edition.id, 2, "confirm_outline")).ok).toBe(
      true,
    );
    const draft = await begin(ws, edition.id, 2, "draft");
    expect(draft.ok).toBe(true);
    const written = await finish(ws, draft, {
      ...outline,
      article: "# Title\n\nThe article.",
      claims: [{ claimText: "x", factIds: ["F01"] }],
    });
    expect(written.ok).toBe(true);
    expect(written.revision).toBe(3);
    expect(await usage(edition.id)).toEqual(["used", "used"]);

    const qa = await begin(ws, edition.id, 3, "qa");
    expect(qa.ok).toBe(true);
    const current = (
      await db.query<{ payload: Payload }>(
        "select payload from newsletter_versions where edition_id=$1 and revision=3",
        [edition.id],
      )
    ).rows[0].payload;
    expect((await finish(ws, qa, current)).ok).toBe(true);
    // Approval needs only the article; the per-section bodies stay empty.
    expect((await transition(ws, edition.id, 3, "approve")).ok).toBe(true);
  });

  it("a plan that leaves a selected source out is refused", async () => {
    const { ws, ids, edition } = await fixture("omitted");
    const plan = await begin(ws, edition.id, 1, "plan");
    const result = await finish(
      ws,
      plan,
      base([section([ids[0]], "Only one")], { plan: { status: "ready" } }),
      null,
    );
    expect(result.ok).toBe(false);
    expect(result.code).toBe("SOURCE_ARRANGEMENT");
  });

  it("a plan attempt may only change the outline, not the edition brief", async () => {
    const { ws, ids, edition } = await fixture("brief");
    const plan = await begin(ws, edition.id, 1, "plan");
    const result = await finish(
      ws,
      plan,
      base(ids.map((id) => section([id])), {
        title: "A different name",
        plan: { status: "ready" },
      }),
      null,
    );
    expect(result.code).toBe("CONFLICT");
  });

  it("a plan that is not ready can be saved but never confirmed", async () => {
    const { ws, ids, edition } = await fixture("gap");
    const plan = await begin(ws, edition.id, 1, "plan");
    const planned = await finish(
      ws,
      plan,
      base(ids.map((id) => section([id])), {
        plan: { status: "research_gap", openQuestions: ["More detail needed"] },
      }),
      null,
    );
    expect(planned.ok).toBe(true);
    const confirm = await transition(ws, edition.id, 2, "confirm_outline");
    expect(confirm.ok).toBe(false);
    expect(confirm.code).toBe("PLAN_NOT_READY");
  });

  it("a failed plan keeps the sources reserved and can be retried", async () => {
    const { ws, ids, edition } = await fixture("retry");
    const plan = await begin(ws, edition.id, 1, "plan");
    expect((await finish(ws, plan, null, null)).ok).toBe(true);
    expect(await usage(edition.id)).toEqual(["reserved", "reserved"]);
    const again = await begin(ws, edition.id, 1, "plan");
    expect(again.ok).toBe(true);
    expect(
      (
        await finish(
          ws,
          again,
          base(ids.map((id) => section([id])), { plan: { status: "ready" } }),
          null,
        )
      ).revision,
    ).toBe(2);
  });

  it("a draft cannot rewrite the confirmed outline or plan", async () => {
    const { ws, ids, edition } = await fixture("locked");
    const plan = await begin(ws, edition.id, 1, "plan");
    const outline = base(ids.map((id) => section([id], "Confirmed")), {
      plan: { status: "ready" },
    });
    await finish(ws, plan, outline, null);
    await transition(ws, edition.id, 2, "confirm_outline");
    const draft = await begin(ws, edition.id, 2, "draft");
    const tampered = await finish(ws, draft, {
      ...outline,
      plan: { status: "ready", thesis: "changed" },
      article: "Text",
    });
    expect(tampered.code).toBe("CONFLICT");
  });

  it("without an article or section bodies, approval is refused", async () => {
    const { ws, edition } = await fixture("empty");
    const qa = await begin(ws, edition.id, 1, "qa");
    const current = (
      await db.query<{ payload: Payload }>(
        "select payload from newsletter_versions where edition_id=$1 and revision=1",
        [edition.id],
      )
    ).rows[0].payload;
    await finish(ws, qa, current);
    expect((await transition(ws, edition.id, 1, "approve")).code).toBe(
      "QA_REQUIRED",
    );
  });

  it("experience snapshots record the entry type", async () => {
    const { edition } = await fixture("entrytype", 1);
    const row = await db.query<{ snapshot: { entryType?: string } }>(
      "select snapshot from newsletter_sources where edition_id=$1",
      [edition.id],
    );
    expect(row.rows[0].snapshot.entryType).toBe("work_log");
  });
});
