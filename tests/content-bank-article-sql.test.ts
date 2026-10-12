import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  asUser,
  createMigratedDb,
  seedWorkspace,
  type MigratedDb,
} from "./support/pg-harness";

let db: MigratedDb;
beforeAll(async () => {
  db = await createMigratedDb();
}, 180000);
afterAll(async () => {
  await db?.close();
});

let counter = 0;
/** A workspace, a collected article, and one member who may contribute research. */
async function fixture(label: string) {
  const ws = await seedWorkspace(db, label);
  await db.query("insert into profiles(id) values($1),($2),($3)", [ws.adminId, ws.plannerId, ws.drafterId]);
  const researcherId = (
    await db.query<{ id: string }>("insert into auth.users (email) values ($1) returning id", [`${label}-researcher@example.test`])
  ).rows[0].id;
  await db.query("insert into profiles(id) values($1)", [researcherId]);
  await db.query(
    "insert into public.client_access (client_id, user_id, role, invitation_status, permissions) values ($1,$2,'client_user','accepted',array['research_contribute'])",
    [ws.clientId, researcherId],
  );
  const articleId = await newArticle(ws.clientId);
  return { ws, researcherId, articleId };
}
async function newArticle(clientId: string) {
  counter += 1;
  return (
    await db.query<{ id: string }>(
      "insert into public.market_signal_items (client_id,title,url,content_hash) values ($1,'An article',$2,$3) returning id",
      [clientId, `https://example.com/a${counter}`, `hash-${counter}`],
    )
  ).rows[0].id;
}

/** The same insert the app makes when an article is saved to the Content Bank. */
const insertReaction = (clientId: string, articleId: string, title = "Article title") =>
  db.query<{ id: string }>(
    `insert into public.founder_experiences
       (client_id,title,entry_type,reaction_type,source_article_id,category,readiness,allow_reuse,what_was_learned)
     values ($1,$2,'trend_reaction','observation',$3,'observation','ready',true,'A takeaway')
     returning id`,
    [clientId, title, articleId],
  );

describe("Content Bank entry saved from a collected article", () => {
  it("links one live entry to one article", async () => {
    const { ws, articleId } = await fixture("a-link");
    const entry = (await insertReaction(ws.clientId, articleId)).rows[0].id;
    const row = (
      await db.query<{ source_article_id: string; source_trend_card_id: string | null; source_research_finding_id: string | null }>(
        "select source_article_id, source_trend_card_id, source_research_finding_id from public.founder_experiences where id=$1",
        [entry],
      )
    ).rows[0];
    expect(row.source_article_id).toBe(articleId);
    expect(row.source_trend_card_id).toBeNull();
    expect(row.source_research_finding_id).toBeNull();
  });

  it("refuses a second live entry for the same article", async () => {
    const { ws, articleId } = await fixture("a-duplicate");
    await insertReaction(ws.clientId, articleId);
    await expect(insertReaction(ws.clientId, articleId, "Again")).rejects.toMatchObject({ code: "23505" });
  });

  it("allows a new entry once the first one is deleted", async () => {
    const { ws, articleId } = await fixture("a-deleted");
    const first = (await insertReaction(ws.clientId, articleId)).rows[0].id;
    await db.query("update public.founder_experiences set deleted_at=now() where id=$1", [first]);
    expect((await insertReaction(ws.clientId, articleId, "Again")).rows[0].id).not.toBe(first);
  });

  it("keeps the entry and clears the link if the article row goes away", async () => {
    const { ws, articleId } = await fixture("a-orphan");
    const entry = (await insertReaction(ws.clientId, articleId)).rows[0].id;
    await db.query("delete from public.market_signal_items where id=$1", [articleId]);
    const row = (
      await db.query<{ source_article_id: string | null }>("select source_article_id from public.founder_experiences where id=$1", [entry])
    ).rows[0];
    expect(row.source_article_id).toBeNull();
  });

  it("leaves existing entries without an article link", async () => {
    const { ws } = await fixture("a-untouched");
    await db.query("insert into public.founder_experiences (client_id,title) values ($1,'Plain experience')", [ws.clientId]);
    const { rows } = await db.query<{ n: number }>(
      "select count(*)::int as n from public.founder_experiences where client_id=$1 and source_article_id is not null",
      [ws.clientId],
    );
    expect(rows[0].n).toBe(0);
  });

  it("is saved under the existing row policy: research contributors and admins only", async () => {
    const { ws, researcherId, articleId } = await fixture("a-policy");
    const asMember = (userId: string, article: string, title: string) =>
      asUser(db, userId, () => insertReaction(ws.clientId, article, title));
    await expect(asMember(ws.drafterId, articleId, "Drafter")).rejects.toThrow(/row-level security/);
    await expect(asMember(ws.plannerId, articleId, "Planner")).rejects.toThrow(/row-level security/);
    expect((await asMember(researcherId, articleId, "Researcher")).rows).toHaveLength(1);
    const other = await newArticle(ws.clientId);
    expect((await asMember(ws.adminId, other, "Admin")).rows).toHaveLength(1);
  });
});

describe("the article's stored full text", () => {
  it("starts empty and can be filled by an admin or a research contributor, not by other members", async () => {
    const { ws, researcherId, articleId } = await fixture("a-text");
    const empty = (await db.query<{ full_text: string | null; full_text_fetched_at: string | null }>(
      "select full_text, full_text_fetched_at from public.market_signal_items where id=$1", [articleId])).rows[0];
    expect(empty).toEqual({ full_text: null, full_text_fetched_at: null });

    const write = (userId: string, text: string) =>
      asUser(db, userId, async () => {
        await db.query("update public.market_signal_items set full_text=$2, full_text_fetched_at=now() where id=$1", [articleId, text]);
        return (await db.query<{ full_text: string | null }>("select full_text from public.market_signal_items where id=$1", [articleId])).rows[0]?.full_text;
      });
    // Row-level security hides the row from a writer without the capability, so the update changes nothing.
    await write(ws.drafterId, "from the drafter");
    await write(ws.plannerId, "from the planner");
    expect((await db.query<{ full_text: string | null }>("select full_text from public.market_signal_items where id=$1", [articleId])).rows[0].full_text).toBeNull();
    expect(await write(researcherId, "from the researcher")).toBe("from the researcher");
    expect(await write(ws.adminId, "from the admin")).toBe("from the admin");
  });
});
