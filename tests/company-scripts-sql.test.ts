import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  asUser,
  createMigratedDb,
  seedCalendar,
  seedExperience,
  seedResource,
  seedWorkspace,
  type MigratedDb,
  type SeededWorkspace,
} from "./support/pg-harness";
import { INITIAL_RESEARCH_PROMPT } from "@/features/research/web-research/contracts";

let db: MigratedDb;
beforeAll(async () => {
  db = await createMigratedDb();
}, 180_000);
afterAll(async () => {
  await db?.close();
});

const script = (name: string) =>
  fs.readFileSync(path.resolve(process.cwd(), "supabase", "admin-scripts", name), "utf8");
const fill = (sql: string, values: Record<string, string>) =>
  Object.entries(values).reduce((text, [key, value]) => text.replaceAll(key, value), sql);
const deleteCompany = (id: string, name: string) =>
  db.exec(fill(script("delete-company.sql"), { __COMPANY_ID__: id, __COMPANY_NAME__: name }));

/** Counts, for one company, of every table that has a client_id column. */
async function counts(clientId: string): Promise<Record<string, number>> {
  const tables = (
    await db.query<{ table_name: string }>(
      "select table_name from information_schema.columns where table_schema='public' and column_name='client_id' and table_name<>'clients' order by 1",
    )
  ).rows.map((row) => row.table_name);
  const result: Record<string, number> = {};
  for (const table of tables) {
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from public.${table} where client_id=$1`,
      [clientId],
    );
    result[table] = rows[0].n;
  }
  return result;
}
const total = (c: Record<string, number>) => Object.values(c).reduce((a, b) => a + b, 0);

/** A company with data in most of the tables a real one fills. */
async function company(label: string): Promise<SeededWorkspace & { name: string }> {
  const ws = await seedWorkspace(db, label);
  await db.query("insert into public.profiles(id) values($1),($2),($3)", [ws.adminId, ws.plannerId, ws.drafterId]);
  const experience = await seedExperience(db, ws.clientId, "An experience", { allowReuse: true });
  const resource = await seedResource(db, ws.clientId, "A resource");
  await db.query(
    "insert into public.content_ideas (client_id, source_type, angle, status, selected_resource_id) values ($1,'founder_experience','An angle','ready',$2)",
    [ws.clientId, resource],
  );
  await seedCalendar(db, ws.clientId, "2026-10-01");
  await db.query(
    "insert into public.client_documents (client_id, filename, file_size_bytes, content_text, content_hash) values ($1,'notes.md',5,'hello','h')",
    [ws.clientId],
  );
  // Research: settings, a schedule, a briefing with a finding, and an entry saved from that finding.
  await asUser(db, ws.adminId, async () => {
    await db.query("select public.save_research_settings($1,0,$2,7,false)", [ws.clientId, INITIAL_RESEARCH_PROMPT]);
    await db.query("select public.save_research_schedule($1,0,true,'Asia/Karachi','09:00')", [ws.clientId]);
  });
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
  const finding = (
    await db.query<{ id: string }>(
      "insert into research_findings(client_id,briefing_id,payload,fingerprint) values($1,$2,'{}','fp') returning id",
      [ws.clientId, briefing],
    )
  ).rows[0].id;
  await db.query(
    "insert into research_candidates(client_id,briefing_id,url,evidence) values($1,$2,'https://example.com/a','{}')",
    [ws.clientId, briefing],
  );
  await db.query(
    "insert into public.founder_experiences (client_id,title,entry_type,source_research_finding_id) values ($1,'From a finding','trend_reaction',$2)",
    [ws.clientId, finding],
  );
  // Newsletter edition that uses the experience (creates versions, sources and a usage row).
  const saved = await asUser(db, ws.adminId, async () =>
    (
      await db.query<{ r: { ok: boolean } }>(
        "select public.save_newsletter_edition($1,null,null,$2,$3::jsonb,$4::jsonb) r",
        [
          ws.clientId,
          randomUUID(),
          JSON.stringify({
            title: "Weekly lessons", startDate: "2026-10-01", endDate: "2026-10-07", reader: "Agency operators", depth: "standard",
            sections: [{ heading: "One lesson", sourceIds: [experience], commentary: "", body: "" }],
          }),
          JSON.stringify([{ id: experience, type: "founder_experience", reuseConfirmed: false }]),
        ],
      )
    ).rows[0].r,
  );
  expect(saved.ok).toBe(true);
  return { ...ws, name: `${label} account` };
}

describe("delete-company.sql", () => {
  it("removes the company and everything under it, and leaves another company and the logins alone", async () => {
    const doomed = await company("doomed");
    const kept = await company("kept");
    const before = await counts(doomed.clientId);
    // The seeded company really does hold rows in many tables, so an empty result proves something.
    expect(Object.values(before).filter((n) => n > 0).length).toBeGreaterThanOrEqual(15);
    const keptBefore = await counts(kept.clientId);

    await deleteCompany(doomed.clientId, doomed.name);

    expect(total(await counts(doomed.clientId))).toBe(0);
    expect(
      (await db.query("select 1 from public.clients where id=$1", [doomed.clientId])).rows,
    ).toHaveLength(0);
    expect(await counts(kept.clientId)).toEqual(keptBefore);
    expect(
      (await db.query("select 1 from public.clients where id=$1", [kept.clientId])).rows,
    ).toHaveLength(1);
    // People keep their logins and profiles; only their access to the company is gone.
    const users = await db.query("select 1 from auth.users where id=any($1::uuid[])", [
      [doomed.adminId, doomed.plannerId, doomed.drafterId],
    ]);
    expect(users.rows).toHaveLength(3);
  });

  it("refuses a name that does not match, and deletes nothing", async () => {
    const ws = await company("wrong-name");
    const before = await counts(ws.clientId);
    await expect(deleteCompany(ws.clientId, "Some other company")).rejects.toThrow(/does not match the saved name/);
    expect(await counts(ws.clientId)).toEqual(before);
  });

  it("refuses an id that does not exist", async () => {
    await expect(deleteCompany(randomUUID(), "Anything")).rejects.toThrow(/No company has the id/);
  });

  it("rolls everything back if a table it does not know about still holds rows", async () => {
    const ws = await company("future-table");
    await db.exec("create table public.zz_future_table (id serial primary key, client_id uuid not null references public.clients(id))");
    await db.query("insert into public.zz_future_table (client_id) values ($1)", [ws.clientId]);
    const before = await counts(ws.clientId);
    await expect(deleteCompany(ws.clientId, ws.name)).rejects.toThrow();
    // Nothing was deleted: the whole script ran as one transaction.
    expect(await counts(ws.clientId)).toEqual(before);
    expect((await db.query("select 1 from public.clients where id=$1", [ws.clientId])).rows).toHaveLength(1);
    await db.exec("drop table public.zz_future_table");
  });
});

describe("create-company.sql", () => {
  const create = (name: string, adminEmail: string) =>
    db.query<{ id: string; name: string; first_admin: string }>(
      fill(script("create-company.sql"), { __COMPANY_NAME__: name, __ADMIN_EMAIL__: adminEmail }).replace(/;\s*$/, ""),
    );
  const emailOf = async (userId: string) =>
    (await db.query<{ email: string }>("select email from auth.users where id=$1", [userId])).rows[0].email;

  it("adds one company with the given person as its Account Admin, and asks for no agency", async () => {
    expect(script("create-company.sql")).not.toMatch(/__AGENCY_ID__/);
    const ws = await seedWorkspace(db, "creator");
    const email = (await emailOf(ws.adminId)).toUpperCase();
    const { rows } = await create("  New Co  ", `  ${email}  `);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("New Co");
    const access = await db.query<{ user_id: string; role: string; invitation_status: string; permissions: string[] }>(
      "select user_id, role, invitation_status, permissions from public.client_access where client_id=$1",
      [rows[0].id],
    );
    expect(access.rows).toEqual([
      { user_id: ws.adminId, role: "client_admin", invitation_status: "accepted", permissions: [] },
    ]);
    const agency = await db.query("select 1 from public.clients c join public.agencies a on a.id=c.agency_id where c.id=$1", [rows[0].id]);
    expect(agency.rows).toHaveLength(1);
    // The new admin can open the company through the normal access rules.
    await asUser(db, ws.adminId, async () => {
      const seen = await db.query("select 1 from public.clients where id=$1", [rows[0].id]);
      expect(seen.rows).toHaveLength(1);
    });
  });

  it("creates nothing for an email with no login or a one-letter name", async () => {
    const ws = await seedWorkspace(db, "creator-bad");
    const before = (await db.query<{ n: number }>("select count(*)::int n from public.clients")).rows[0].n;
    expect((await create("Valid Name", "nobody@example.test")).rows).toHaveLength(0);
    expect((await create("A", await emailOf(ws.adminId))).rows).toHaveLength(0);
    const after = (await db.query<{ n: number }>("select count(*)::int n from public.clients")).rows[0].n;
    expect(after).toBe(before);
  });
});
