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
}, 180_000);
afterAll(async () => {
  await db?.close();
});

async function userId(email: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "insert into auth.users (email) values ($1) returning id",
    [email],
  );
  return rows[0].id;
}

describe("account admins replace the agency level", () => {
  it("an Account Admin reads their own company's logs and not another company's", async () => {
    const mine = await seedWorkspace(db, "logs-mine");
    const other = await seedWorkspace(db, "logs-other");
    await db.query("insert into public.audit_logs (client_id, action, entity_type) values ($1,'x','y'),($2,'x','y')", [mine.clientId, other.clientId]);
    await db.query("insert into public.llm_logs (client_id, feature, model, status) values ($1,'a','m','success'),($2,'a','m','success')", [mine.clientId, other.clientId]);

    await asUser(db, mine.adminId, async () => {
      const audit = await db.query<{ client_id: string }>("select client_id from public.audit_logs");
      const llm = await db.query<{ client_id: string }>("select client_id from public.llm_logs");
      expect(audit.rows.map((r) => r.client_id)).toEqual([mine.clientId]);
      expect(llm.rows.map((r) => r.client_id)).toEqual([mine.clientId]);
    });
  });

  it("an Account User cannot read the logs", async () => {
    const ws = await seedWorkspace(db, "logs-user");
    await db.query("insert into public.audit_logs (client_id, action, entity_type) values ($1,'x','y')", [ws.clientId]);
    await db.query("insert into public.llm_logs (client_id, feature, model, status) values ($1,'a','m','success')", [ws.clientId]);
    await asUser(db, ws.plannerId, async () => {
      expect((await db.query("select 1 from public.audit_logs")).rows).toHaveLength(0);
      expect((await db.query("select 1 from public.llm_logs")).rows).toHaveLength(0);
    });
  });

  it("the migration turns each accepted Agency Admin into an Account Admin of every company under the agency", async () => {
    const ws = await seedWorkspace(db, "backfill");
    const second = (
      await db.query<{ id: string }>("insert into public.clients (agency_id, name) values ($1,'second co') returning id", [ws.agencyId])
    ).rows[0].id;
    const boss = await userId("backfill-boss@example.test");
    const revoked = await userId("backfill-revoked@example.test");
    await db.query(
      "insert into public.agency_members (agency_id, user_id, role, invitation_status) values ($1,$2,'agency_admin','accepted'),($1,$3,'agency_admin','revoked')",
      [ws.agencyId, boss, revoked],
    );
    // An existing, narrower row for the same person in the first company is upgraded, not duplicated.
    await db.query(
      "insert into public.client_access (client_id,user_id,role,invitation_status,permissions) values ($1,$2,'client_user','accepted',array['posts_draft'])",
      [ws.clientId, boss],
    );

    const fs = await import("node:fs");
    const path = await import("node:path");
    const sql = fs.readFileSync(
      path.resolve(process.cwd(), "supabase", "migrations", "20261012230000_account_admins_replace_agency.sql"),
      "utf8",
    );
    await db.exec(sql);
    await db.exec(sql); // safe to run twice

    const rows = (
      await db.query<{ client_id: string; role: string; n: number }>(
        "select client_id, role, count(*) over (partition by client_id)::int n from public.client_access where user_id=$1 and invitation_status='accepted'",
        [boss],
      )
    ).rows;
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.role === "client_admin" && r.n === 1)).toBe(true);
    expect(rows.map((r) => r.client_id).sort()).toEqual([ws.clientId, second].sort());
    expect(
      (await db.query("select 1 from public.client_access where user_id=$1", [revoked])).rows,
    ).toHaveLength(0);
  });
});
