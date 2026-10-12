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
};
async function rpc(name: string, params: unknown[], casts: string[] = []): Promise<Reply> {
  return (
    await db.query<{ r: Reply }>(
      `select public.${name}(${params.map((_, i) => `$${i + 1}${casts[i] ?? ""}`).join(",")}) r`,
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

const ZONE = "Asia/Karachi";

async function workspace(label: string) {
  const ws = await seedWorkspace(db, label);
  await db.query("insert into public.profiles(id) values($1),($2),($3)", [
    ws.adminId,
    ws.plannerId,
    ws.drafterId,
  ]);
  await asUser(db, ws.adminId, () =>
    rpc("save_research_settings", [ws.clientId, 0, INITIAL_RESEARCH_PROMPT, 7, false]),
  );
  return ws;
}
async function schedule(clientId: string) {
  return (
    await db.query<{
      weekday: number | null;
      version: number;
      next_due_at: Date | null;
      last_due_at: Date | null;
      isodow: number | null;
      local_time: string | null;
    }>(
      `select weekday, version, next_due_at, last_due_at,
              extract(isodow from (next_due_at at time zone $2))::int as isodow,
              to_char(next_due_at at time zone $2,'HH24:MI') as local_time
         from public.research_schedules where client_id=$1`,
      [clientId, ZONE],
    )
  ).rows[0];
}

describe("weekly research schedule", () => {
  it("saves a weekly schedule on the chosen day and time", async () => {
    const ws = await workspace("weekly-save");
    const saved = await asUser(db, ws.adminId, () =>
      rpc("save_research_schedule", [ws.clientId, 0, true, ZONE, "09:00", 1], ["", "", "", "", "", "::smallint"]),
    );
    expect(saved.ok).toBe(true);
    const row = await schedule(ws.clientId);
    expect(row.weekday).toBe(1);
    expect(row.isodow).toBe(1);
    expect(row.local_time).toBe("09:00");
    const days = (row.next_due_at!.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(0);
    expect(days).toBeLessThanOrEqual(7.01);
  });

  it("keeps the old five-argument call daily, and clears a weekly choice", async () => {
    const ws = await workspace("weekly-daily");
    await asUser(db, ws.adminId, () =>
      rpc("save_research_schedule", [ws.clientId, 0, true, ZONE, "09:00", 3], ["", "", "", "", "", "::smallint"]),
    );
    expect((await schedule(ws.clientId)).weekday).toBe(3);
    const daily = await asUser(db, ws.adminId, () =>
      rpc("save_research_schedule", [ws.clientId, 1, true, ZONE, "09:00"]),
    );
    expect(daily.ok).toBe(true);
    const row = await schedule(ws.clientId);
    expect(row.weekday).toBeNull();
    expect((row.next_due_at!.getTime() - Date.now()) / 86_400_000).toBeLessThanOrEqual(1.01);
  });

  it("rejects a day of the week outside Monday to Sunday", async () => {
    const ws = await workspace("weekly-invalid");
    for (const bad of [0, 8]) {
      const result = await asUser(db, ws.adminId, () =>
        rpc("save_research_schedule", [ws.clientId, 0, true, ZONE, "09:00", bad], ["", "", "", "", "", "::smallint"]),
      );
      expect(result).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    }
  });

  it("is still admin-only", async () => {
    const ws = await workspace("weekly-forbidden");
    const result = await asUser(db, ws.drafterId, () =>
      rpc("save_research_schedule", [ws.clientId, 0, true, ZONE, "09:00", 1], ["", "", "", "", "", "::smallint"]),
    );
    expect(result).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });

  it("after a scheduled run, the next one is on the same weekday a week later", async () => {
    const ws = await workspace("weekly-advance");
    await asUser(db, ws.adminId, () =>
      rpc("save_research_schedule", [ws.clientId, 0, true, ZONE, "09:00", 1], ["", "", "", "", "", "::smallint"]),
    );
    // Pretend the most recent Monday 09:00 (Karachi) has just come due.
    const due = (
      await db.query<{ t: Date }>(
        `select private.research_day_due(d, $1, '09:00') t from (
           select case when private.research_day_due(m, $1, '09:00') <= now() then m else m - 7 end as d
             from (select ((now() at time zone $1)::date - ((extract(isodow from (now() at time zone $1))::int + 6) % 7)) as m) x
         ) y`,
        [ZONE],
      )
    ).rows[0].t;
    await db.query("update public.research_schedules set next_due_at=$2 where client_id=$1", [ws.clientId, due]);

    const claimed = await service(() =>
      rpc("claim_scheduled_research", [ws.clientId, JSON.stringify(RESEARCH_BUDGET)]),
    );
    expect(claimed.ok).toBe(true);
    const finished = await service(() =>
      rpc("finish_scheduled_research", [
        ws.clientId,
        claimed.occurrenceId,
        claimed.token,
        JSON.stringify({
          outcome: "empty", summary: "Test", errorCode: null, coverageGaps: [],
          candidates: [], findings: [], toolCalls: 1, tokenInput: 1, tokenOutput: 1,
        }),
        "[]",
      ]),
    );
    expect(finished.ok).toBe(true);

    const row = await schedule(ws.clientId);
    expect(row.last_due_at!.toISOString()).toBe(due.toISOString());
    expect(row.isodow).toBe(1);
    expect(row.local_time).toBe("09:00");
    expect(row.next_due_at!.getTime()).toBeGreaterThan(Date.now());
    // Exactly the next Monday after the one that just ran: seven days later, give or take a DST hour.
    const gapDays = (row.next_due_at!.getTime() - due.getTime()) / 86_400_000;
    expect(gapDays).toBeGreaterThan(6.9);
    expect(gapDays).toBeLessThan(7.1);
  });
});
