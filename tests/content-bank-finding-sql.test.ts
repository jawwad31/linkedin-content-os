import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  asUser,
  createMigratedDb,
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

/** A workspace, a research finding, and one member who may contribute research. */
async function fixture(label: string) {
  const ws: SeededWorkspace = await seedWorkspace(db, label);
  await db.query("insert into profiles(id) values($1),($2),($3)", [
    ws.adminId,
    ws.plannerId,
    ws.drafterId,
  ]);
  const researcherId = (
    await db.query<{ id: string }>(
      "insert into auth.users (email) values ($1) returning id",
      [`${label}-researcher@example.test`],
    )
  ).rows[0].id;
  await db.query("insert into profiles(id) values($1)", [researcherId]);
  await db.query(
    "insert into public.client_access (client_id, user_id, role, invitation_status, permissions) values ($1,$2,'client_user','accepted',array['research_contribute'])",
    [ws.clientId, researcherId],
  );
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
  const findingId = (
    await db.query<{ id: string }>(
      "insert into research_findings(client_id,briefing_id,payload,fingerprint) values($1,$2,'{}','fp-1') returning id",
      [ws.clientId, briefing],
    )
  ).rows[0].id;
  return { ws, researcherId, findingId };
}

/** The same insert the app makes when a finding is saved to the Content Bank. */
const insertReaction = (
  clientId: string,
  findingId: string,
  title = "Finding title",
) =>
  db.query<{ id: string }>(
    `insert into public.founder_experiences
       (client_id,title,entry_type,reaction_type,source_research_finding_id,category,readiness,allow_reuse,what_was_learned)
     values ($1,$2,'trend_reaction','observation',$3,'observation','ready',true,'An angle')
     returning id`,
    [clientId, title, findingId],
  );

describe("Content Bank entry saved from a research finding", () => {
  it("links one live entry to one finding", async () => {
    const { ws, findingId } = await fixture("link");
    const entry = (await insertReaction(ws.clientId, findingId)).rows[0].id;
    const row = (
      await db.query<{ source_research_finding_id: string; source_trend_card_id: string | null }>(
        "select source_research_finding_id, source_trend_card_id from public.founder_experiences where id=$1",
        [entry],
      )
    ).rows[0];
    expect(row.source_research_finding_id).toBe(findingId);
    expect(row.source_trend_card_id).toBeNull();
  });

  it("refuses a second live entry for the same finding", async () => {
    const { ws, findingId } = await fixture("duplicate");
    await insertReaction(ws.clientId, findingId);
    await expect(insertReaction(ws.clientId, findingId, "Again")).rejects.toMatchObject({
      code: "23505",
    });
  });

  it("allows a new entry once the first one is deleted", async () => {
    const { ws, findingId } = await fixture("deleted");
    const first = (await insertReaction(ws.clientId, findingId)).rows[0].id;
    await db.query("update public.founder_experiences set deleted_at=now() where id=$1", [first]);
    const second = (await insertReaction(ws.clientId, findingId, "Again")).rows[0].id;
    expect(second).not.toBe(first);
  });

  it("keeps the entry and clears the link if the finding row goes away", async () => {
    const { ws, findingId } = await fixture("orphan");
    const entry = (await insertReaction(ws.clientId, findingId)).rows[0].id;
    await db.query("delete from public.research_findings where id=$1", [findingId]);
    const row = (
      await db.query<{ source_research_finding_id: string | null }>(
        "select source_research_finding_id from public.founder_experiences where id=$1",
        [entry],
      )
    ).rows[0];
    expect(row.source_research_finding_id).toBeNull();
  });

  it("leaves existing entries without a finding link", async () => {
    const { ws } = await fixture("untouched");
    await db.query(
      "insert into public.founder_experiences (client_id,title) values ($1,'Plain experience'), ($1,'Another')",
      [ws.clientId],
    );
    const { rows } = await db.query<{ n: number }>(
      "select count(*)::int as n from public.founder_experiences where client_id=$1 and source_research_finding_id is not null",
      [ws.clientId],
    );
    expect(rows[0].n).toBe(0);
  });

  it("is saved under the existing row policy: research contributors and admins only", async () => {
    const { ws, researcherId, findingId } = await fixture("policy");
    const asMember = (userId: string, finding: string, title: string) =>
      asUser(db, userId, () => insertReaction(ws.clientId, finding, title));
    // A member without research_contribute is refused by row-level security.
    await expect(asMember(ws.drafterId, findingId, "Drafter")).rejects.toThrow(/row-level security/);
    await expect(asMember(ws.plannerId, findingId, "Planner")).rejects.toThrow(/row-level security/);
    // A research contributor may save it.
    expect((await asMember(researcherId, findingId, "Researcher")).rows).toHaveLength(1);
    // An admin may save a different finding.
    const other = (
      await db.query<{ id: string }>(
        "insert into research_findings(client_id,briefing_id,payload,fingerprint) select client_id,briefing_id,'{}','fp-2' from research_findings where id=$1 returning id",
        [findingId],
      )
    ).rows[0].id;
    expect((await asMember(ws.adminId, other, "Admin")).rows).toHaveLength(1);
  });
});
