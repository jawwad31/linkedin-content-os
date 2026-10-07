import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createMigratedDb, seedCalendar, seedExperience, seedWorkspace, type MigratedDb } from "./support/pg-harness";
import { strategyOverridesSchema } from "@/lib/ai/playbooks/contracts";

let db: MigratedDb;
beforeAll(async () => { db = await createMigratedDb(); }, 180_000);
afterAll(async () => { await db.close(); });
type Result = { ok: boolean; code?: string; job_id?: string; slot_id?: string; idea_id?: string; lease_token?: string; post_id?: string; done?: boolean; busy?: boolean };
const brief = { topic: "A supplied operational topic", postType: "framework", funnelStage: "Depth", contentPillar: "Reliability", intendedReader: "Operators", primaryTakeaway: "Measure first" };
const values = { finalPost: "A reviewed draft", buyerBeliefShift: "Measure first", proofNotes: "Supplied evidence", riskNotes: "QA warnings are advisory", ctaIntent: "none", qaResult: { warnings: ["qa_fallback_to_draft"] }, formatRecommendation: {}, sourceContextUsed: {} };
async function rpc(fn: string, params: unknown[]) {
  const placeholders = params.map((_, i) => `$${i + 1}`).join(",");
  return (await db.query<{ r: Result }>(`select public.${fn}(${placeholders}) as r`, params)).rows[0].r;
}
async function fixture(label: string, count = 2, source = false) {
  const ws = await seedWorkspace(db, label);
  // Provisioned application users have a profile; the auth stub does not run
  // Supabase's provisioning flow automatically.
  await db.query("insert into public.profiles(id) values ($1),($2),($3)", [ws.adminId, ws.plannerId, ws.drafterId]);
  const calendar = await seedCalendar(db, ws.clientId, "2026-11-01", count);
  const sourceId = source ? await seedExperience(db, ws.clientId, "Actual experience") : null;
  const slots = Array.from({ length: count }, (_, i) => ({ bucket: sourceId && i === 0 ? "experience" : "evergreen", requested_bucket: sourceId && i === 0 ? "experience" : "evergreen", source_id: i === 0 ? sourceId : null, source_type: sourceId && i === 0 ? "founder_experience" : null }));
  await asUser(db, ws.adminId, () => rpc("commit_calendar_plan", [ws.clientId, calendar, JSON.stringify(slots), false]));
  const rows = (await db.query<{ id: string }>("select id from public.calendar_slots where calendar_id=$1 order by slot_index", [calendar])).rows;
  const payload = rows.map(row => ({ slot_id: row.id, brief }));
  return { ...ws, calendar, rows, payload, sourceId };
}
async function start(f: Awaited<ReturnType<typeof fixture>>, payload = f.payload, key = randomUUID()) {
  return rpc("start_calendar_draft_job", [f.clientId, f.calendar, key, JSON.stringify(payload)]);
}
async function claim(client: string, job: string) { return rpc("claim_calendar_draft_slot", [client, job]); }
async function finish(client: string, job: string, c: Result) { return rpc("finish_calendar_draft_slot", [client, job, c.slot_id, c.lease_token, JSON.stringify(values)]); }

describe("P06 durable SQL transitions", () => {
  it("deduplicates starts, serialises two claimants, commits a post/use/slot atomically, and retries finish safely", async () => {
    const f = await fixture("batch-atomic", 2, true);
    await asUser(db, f.adminId, async () => {
      const key = randomUUID();
      const j = await start(f, f.payload, key);
      expect(j.ok).toBe(true);
      expect((await start(f, f.payload, key)).job_id).toBe(j.job_id);
      expect((await start(f)).code).toBe("BATCH_ACTIVE");
      const c = await claim(f.clientId, j.job_id!);
      expect(c.lease_token).toBeTruthy();
      expect((await claim(f.clientId, j.job_id!)).busy).toBe(true);
      const completed = await finish(f.clientId, j.job_id!, c);
      expect(completed.ok).toBe(true);
      expect((await finish(f.clientId, j.job_id!, c)).post_id).toBe(completed.post_id);
      const next = await claim(f.clientId, j.job_id!);
      expect(next.slot_id).not.toBe(c.slot_id);
      await rpc("fail_calendar_draft_slot", [f.clientId, j.job_id!, next.slot_id, next.lease_token, "raw secret and stack"]);
      expect((await claim(f.clientId, j.job_id!)).done).toBe(true);
    });
    expect((await db.query<{ count: number }>("select count(*)::int as count from public.posts where client_id=$1", [f.clientId])).rows[0].count).toBe(1);
    const use = (await db.query<{ status: string; post_id: string }>("select status,post_id from public.source_usage where source_id=$1", [f.sourceId])).rows;
    expect(use).toHaveLength(1); expect(use[0].status).toBe("used"); expect(use[0].post_id).toBeTruthy();
    expect((await db.query<{ draft_error_code: string }>("select draft_error_code from public.calendar_slots where id=$1", [f.rows[1].id])).rows[0].draft_error_code).toBe("GENERATION_FAILED");
  });

  it("recovers expired work with the same backing idea and rejects the stale lease", async () => {
    const f = await fixture("batch-expired", 1);
    let job: string; let old: Result;
    await asUser(db, f.adminId, async () => { job = (await start(f)).job_id!; old = await claim(f.clientId, job); });
    await db.query("update public.calendar_slots set lease_expires_at=now()-interval '1 second' where id=$1", [old!.slot_id]);
    await asUser(db, f.adminId, async () => {
      const recovered = await claim(f.clientId, job!);
      expect(recovered.idea_id).toBe(old!.idea_id); expect(recovered.lease_token).not.toBe(old!.lease_token);
      expect((await finish(f.clientId, job!, old!)).code).toBe("LEASE_LOST");
      expect((await finish(f.clientId, job!, recovered)).ok).toBe(true);
    });
  });

  it("keeps successful slots on retries and never creates another backing idea or reservation", async () => {
    const f = await fixture("batch-retry", 2, true);
    await asUser(db, f.adminId, async () => {
      const j = await start(f); const failed = await claim(f.clientId, j.job_id!);
      await rpc("fail_calendar_draft_slot", [f.clientId, j.job_id!, failed.slot_id, failed.lease_token, "NOT_CONFIGURED"]);
      const success = await claim(f.clientId, j.job_id!); await finish(f.clientId, j.job_id!, success);
      const retry = await start(f, [f.payload[0]]); const recovered = await claim(f.clientId, retry.job_id!);
      expect(recovered.idea_id).toBe(failed.idea_id);
      await finish(f.clientId, retry.job_id!, recovered);
      expect((await start(f, [f.payload[1]])).code).toBe("SLOT_NOT_AVAILABLE");
    });
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.content_ideas where client_id=$1", [f.clientId])).rows[0].n).toBe(2);
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.source_usage where source_id=$1", [f.sourceId])).rows[0].n).toBe(1);
  });

  it("preserves queued/running work during P05 replan/cancel; batch cancellation invalidates a running result", async () => {
    const f = await fixture("batch-cancel", 2, true);
    await asUser(db, f.adminId, async () => {
      const j = await start(f); const c = await claim(f.clientId, j.job_id!);
      expect((await rpc("commit_calendar_plan", [f.clientId, f.calendar, "[]", true])).ok).toBe(true);
      await rpc("cancel_calendar_slots", [f.clientId, f.calendar, null]);
      expect((await db.query<{ status: string }>("select status from public.calendar_slots where id=$1", [c.slot_id])).rows[0].status).toBe("drafting");
      expect((await rpc("cancel_calendar_draft_job", [f.clientId, j.job_id])).ok).toBe(true);
      expect((await finish(f.clientId, j.job_id!, c)).code).toBe("LEASE_LOST");
    });
    expect((await db.query<{ status: string }>("select status from public.source_usage where source_id=$1", [f.sourceId])).rows[0].status).toBe("cancelled");
  });

  it("requires both capabilities, rejects cross-account IDs, and rechecks revocation before saving", async () => {
    const f = await fixture("batch-permissions", 1);
    for (const user of [f.plannerId, f.drafterId]) await asUser(db, user, async () => expect((await start(f)).code).toBe("FORBIDDEN"));
    const other = await fixture("batch-other", 1);
    await asUser(db, other.adminId, async () => expect((await start(f)).code).toBe("FORBIDDEN"));
    await db.query("update public.client_access set permissions=array['ideas_manage','posts_draft'] where user_id=$1", [f.drafterId]);
    let j: Result; let c: Result;
    await asUser(db, f.drafterId, async () => { j = await start(f); c = await claim(f.clientId, j.job_id!); });
    await db.query("update public.client_access set permissions=array['ideas_manage'] where user_id=$1", [f.drafterId]);
    await asUser(db, f.drafterId, async () => {
      expect((await finish(f.clientId, j!.job_id!, c!)).code).toBe("FORBIDDEN");
      expect((await rpc("renew_calendar_draft_lease", [f.clientId, j!.job_id, c!.slot_id, c!.lease_token])).code).toBe("FORBIDDEN");
    });
  });

  it("blocks direct state/post forgery, and respects account/password status", async () => {
    const f = await fixture("batch-forgery", 1);
    await asUser(db, f.adminId, async () => {
      const j = await start(f); const c = await claim(f.clientId, j.job_id!);
      await expect(db.query("update public.calendar_slots set lease_token=$1 where id=$2", [randomUUID(), c.slot_id])).rejects.toThrow(/Draft state/);
      await expect(db.query("insert into public.posts(client_id,content_idea_id,final_post) values ($1,$2,'Bypass lease')", [f.clientId,c.idea_id])).rejects.toThrow(/calendar drafting service/);
      await expect(db.query("update public.calendar_draft_jobs set status='completed' where id=$1", [j.job_id])).rejects.toThrow(/permission denied/);
    });
    await db.query("update public.profiles set must_change_password=true where id=$1", [f.adminId]);
    await asUser(db, f.adminId, async () => expect((await start(f)).code).toBe("FORBIDDEN"));
    await db.query("update public.profiles set must_change_password=false where id=$1", [f.adminId]);
    await db.query("update public.clients set deleted_at=now() where id=$1", [f.clientId]);
    await asUser(db, f.adminId, async () => expect((await start(f)).code).toBe("FORBIDDEN"));
  });

  it("caps attempts across restart/new requests and rejects oversized batches", async () => {
    const f = await fixture("batch-budget", 1);
    await asUser(db, f.adminId, async () => {
      expect((await start(f, Array(11).fill(f.payload[0]))).code).toBe("VALIDATION_ERROR");
      for (let i=0;i<3;i++) {
        const j = await start(f); const c = await claim(f.clientId,j.job_id!);
        await rpc("fail_calendar_draft_slot", [f.clientId,j.job_id,c.slot_id,c.lease_token,"GENERATION_FAILED"]);
      }
      expect((await start(f)).code).toBe("ATTEMPTS_EXHAUSTED");
    });
  });

  it("does not save after a source is archived and preserves advisory QA with a review-only result", async () => {
    const f = await fixture("batch-source-change", 1, true);
    let j: Result; let c: Result;
    await asUser(db, f.adminId, async () => { j = await start(f); c = await claim(f.clientId,j.job_id!); });
    await db.query("update public.founder_experiences set readiness='archived' where id=$1", [f.sourceId]);
    await asUser(db, f.adminId, async () => expect((await finish(f.clientId,j!.job_id!,c!)).code).toBe("SOURCE_UNAVAILABLE"));
    await db.query("update public.founder_experiences set readiness='ready' where id=$1", [f.sourceId]);
    await asUser(db, f.adminId, async () => {
      const saved = await rpc("finish_calendar_draft_slot", [f.clientId,j!.job_id,c!.slot_id,c!.lease_token,JSON.stringify({ ...values,status: "approved",approved_draft_version: 1 })]);
      expect(saved.ok).toBe(true);
      const post = (await db.query<{status: string; approved_draft_version: number | null; qa_result: { warnings: string[] }}>(
        "select status,approved_draft_version,qa_result from public.posts where id=$1",[saved.post_id])).rows[0];
      expect(post.status).toBe("review"); expect(post.approved_draft_version).toBeNull();
      expect(post.qa_result.warnings).toEqual(["qa_fallback_to_draft"]);
    });
  });

  it("denies anonymous execution and hides job records from another account", async () => {
    const f = await fixture("batch-read-scope",1); const other = await fixture("batch-read-other",1);
    await asUser(db,f.adminId,async () => { expect((await start(f)).ok).toBe(true); });
    await asUser(db,other.adminId,async () => {
      expect((await db.query("select id from public.calendar_draft_jobs where client_id=$1",[f.clientId])).rows).toEqual([]);
    });
    await db.exec("set role anon");
    try { await expect(claim(f.clientId,randomUUID())).rejects.toThrow(/permission denied/); }
    finally { await db.exec("reset role"); }
  });

  it("rolls back a failed post insert together with source usage and slot completion", async () => {
    const f = await fixture("batch-transaction",1,true);
    await asUser(db,f.adminId,async () => {
      const j=await start(f); const c=await claim(f.clientId,j.job_id!);
      await expect(rpc("finish_calendar_draft_slot",[f.clientId,j.job_id,c.slot_id,c.lease_token,
        JSON.stringify({ ...values,formatRecommendation: null })])).rejects.toThrow(/posts_format_recommendation_object_check/);
      const slot=(await db.query<{status:string;post_id:string|null}>("select status,post_id from public.calendar_slots where id=$1",[c.slot_id])).rows[0];
      expect(slot).toMatchObject({status:"drafting",post_id:null});
      expect((await db.query<{status:string}>("select status from public.source_usage where source_id=$1",[f.sourceId])).rows[0].status).toBe("reserved");
      expect((await finish(f.clientId,j.job_id!,c)).ok).toBe(true);
    });
  });

  it("can reapply the forward migration without resetting an active batch", async () => {
    const f=await fixture("batch-rerunnable",1);
    let j: Result;
    await asUser(db,f.adminId,async () => { j=await start(f); });
    await db.exec(readFileSync("supabase/migrations/20261007070000_resumable_calendar_drafting.sql","utf8"));
    await asUser(db,f.adminId,async () => {
      const c=await claim(f.clientId,j!.job_id!); expect(c.slot_id).toBe(f.rows[0].id);
      expect((await finish(f.clientId,j!.job_id!,c)).ok).toBe(true);
    });
  });

  it("keeps selected editorial controls valid when optional brief fields are blank",async () => {
    const f=await fixture("batch-blank-options",1);
    await asUser(db,f.adminId,async () => {
      const j=await start(f,[{slot_id:f.rows[0].id,brief:{...brief,postType:"how_to",funnelStage:"Discovery",contentPillar:"",intendedReader:"",primaryTakeaway:""}}]);
      const c=await claim(f.clientId,j.job_id!);
      const row=(await db.query<{strategy_overrides:unknown}>("select strategy_overrides from public.content_ideas where id=$1",[c.idea_id])).rows[0];
      expect(strategyOverridesSchema.parse(row.strategy_overrides)).toEqual({postType:"how_to",funnelStage:"Discovery"});
    });
  });

  it("rejects a backing idea that has been substituted after claiming the slot",async () => {
    const f=await fixture("batch-idea-substitution",1,true);
    let j:Result; let c:Result;
    await asUser(db,f.adminId,async () => { j=await start(f);c=await claim(f.clientId,j.job_id!); });
    await db.query("update public.content_ideas set source_type='profile_led',source_ids_json='[]' where id=$1",[c!.idea_id]);
    await asUser(db,f.adminId,async () => {
      expect((await finish(f.clientId,j!.job_id!,c!)).code).toBe("SOURCE_UNAVAILABLE");
    });
    expect((await db.query("select id from public.posts where client_id=$1",[f.clientId])).rows).toEqual([]);
  });
});
