import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  asUser,
  createMigratedDb,
  seedExperience,
  seedWorkspace,
  type MigratedDb,
} from "./support/pg-harness";

type Result = { ok: boolean; code?: string; freed?: number };

let db: MigratedDb;

beforeAll(async () => {
  db = await createMigratedDb();
}, 180_000);

afterAll(async () => {
  await db.close();
});

async function reviewer(clientId: string, label: string) {
  const id = (
    await db.query<{ id: string }>("insert into auth.users (email) values ($1) returning id", [
      `${label}@example.test`,
    ])
  ).rows[0].id;
  await db.query("insert into public.profiles (id) values ($1)", [id]);
  await db.query(
    `insert into public.client_access (client_id, user_id, role, invitation_status, permissions)
     values ($1, $2, 'client_user', 'accepted', array['posts_review'])`,
    [clientId, id],
  );
  return id;
}

async function setup(label: string) {
  const ws = await seedWorkspace(db, label);
  await db.query("insert into public.profiles (id) values ($1), ($2), ($3)", [
    ws.adminId, ws.plannerId, ws.drafterId,
  ]);
  const reviewerId = await reviewer(ws.clientId, `${label}-reviewer`);
  const entry = await seedExperience(db, ws.clientId, "Single-use entry");
  const post = await newPost(ws.clientId, "review");
  const usage = (
    await db.query<{ id: string }>(
      `insert into public.source_usage (client_id, source_id, source_type, channel, status, post_id)
       values ($1, $2, 'founder_experience', 'linkedin_post', 'used', $3) returning id`,
      [ws.clientId, entry, post],
    )
  ).rows[0].id;
  return { ...ws, reviewerId, entry, post, usage };
}

async function newPost(clientId: string, status: string) {
  return (
    await db.query<{ id: string }>(
      "insert into public.posts (client_id, final_post, status) values ($1, 'Body', $2) returning id",
      [clientId, status],
    )
  ).rows[0].id;
}

async function reject(userId: string, clientId: string, postId: string, note: string | null): Promise<Result> {
  return asUser(db, userId, async () =>
    (
      await db.query<{ r: Result }>("select public.reject_post($1, $2, $3) as r", [clientId, postId, note])
    ).rows[0].r,
  );
}

async function postRow(postId: string) {
  return (
    await db.query<{ status: string; edit_note: string | null }>(
      "select status, edit_note from public.posts where id = $1",
      [postId],
    )
  ).rows[0];
}

async function usageStatus(usageId: string) {
  return (await db.query<{ status: string }>("select status from public.source_usage where id = $1", [usageId]))
    .rows[0].status;
}

describe("reject_post", () => {
  it("rejects with a note and frees the single-use entry for a reviewer who cannot manage ideas", async () => {
    const f = await setup("reject-ok");

    const result = await reject(f.reviewerId, f.clientId, f.post, "  Off brand for us.  ");

    expect(result).toEqual({ ok: true, freed: 1 });
    expect(await postRow(f.post)).toEqual({ status: "rejected", edit_note: "Off brand for us." });
    expect(await usageStatus(f.usage)).toBe("cancelled");
    // The history row is kept, and the entry can be reserved again.
    const reserved = await db.query<{ r: { ok: boolean } }>(
      "select public.reserve_content_bank_source($1, $2, 'founder_experience') as r",
      [f.clientId, f.entry],
    );
    expect(reserved.rows[0].r.ok).toBe(true);
  });

  it("works for an account admin and from needs_edit", async () => {
    const f = await setup("reject-admin");
    await db.query("update public.posts set status = 'needs_edit' where id = $1", [f.post]);
    expect(await reject(f.adminId, f.clientId, f.post, "No.")).toMatchObject({ ok: true });
  });

  it("refuses people without the review capability and changes nothing", async () => {
    const f = await setup("reject-denied");

    for (const userId of [f.plannerId, f.drafterId]) {
      expect((await reject(userId, f.clientId, f.post, "No.")).code).toBe("FORBIDDEN");
    }
    expect(await postRow(f.post)).toMatchObject({ status: "review" });
    expect(await usageStatus(f.usage)).toBe("used");
  });

  it("refuses a reviewer from another account", async () => {
    const f = await setup("reject-scope-a");
    const other = await setup("reject-scope-b");
    expect((await reject(other.reviewerId, f.clientId, f.post, "No.")).code).toBe("FORBIDDEN");
    expect((await reject(other.reviewerId, other.clientId, f.post, "No.")).code).toBe("NOT_FOUND");
    expect(await postRow(f.post)).toMatchObject({ status: "review" });
  });

  it("refuses a user who must still change their password", async () => {
    const f = await setup("reject-password");
    await db.query("update public.profiles set must_change_password = true where id = $1", [f.reviewerId]);
    expect((await reject(f.reviewerId, f.clientId, f.post, "No.")).code).toBe("FORBIDDEN");
  });

  it("requires a one-line note", async () => {
    const f = await setup("reject-note");
    for (const note of [null, "", "   ", "x".repeat(2001)]) {
      expect((await reject(f.reviewerId, f.clientId, f.post, note)).code).toBe("VALIDATION_ERROR");
    }
    expect(await postRow(f.post)).toMatchObject({ status: "review" });
  });

  it("will not reject an approved, published or already rejected post, or release their usage", async () => {
    const f = await setup("reject-state");
    for (const status of ["approved", "published"]) {
      const post = await newPost(f.clientId, status);
      const usage = (
        await db.query<{ id: string }>(
          `insert into public.source_usage (client_id, source_id, source_type, channel, status, post_id)
           values ($1, $2, 'founder_experience', 'linkedin_post', $3, $4) returning id`,
          [f.clientId, f.entry, status === "published" ? "published" : "used", post],
        )
      ).rows[0].id;
      expect((await reject(f.reviewerId, f.clientId, post, "No.")).code).toBe("INVALID_STATE");
      expect(await usageStatus(usage)).toBe(status === "published" ? "published" : "used");
    }

    expect((await reject(f.reviewerId, f.clientId, f.post, "First.")).ok).toBe(true);
    expect((await reject(f.reviewerId, f.clientId, f.post, "Second.")).code).toBe("INVALID_STATE");
    expect(await postRow(f.post)).toEqual({ status: "rejected", edit_note: "First." });
  });

  it("only frees the rejected post's own reservations", async () => {
    const f = await setup("reject-own");
    const otherEntry = await seedExperience(db, f.clientId, "Another entry");
    const otherPost = await newPost(f.clientId, "review");
    const otherUsage = (
      await db.query<{ id: string }>(
        `insert into public.source_usage (client_id, source_id, source_type, channel, status, post_id)
         values ($1, $2, 'founder_experience', 'linkedin_post', 'used', $3) returning id`,
        [f.clientId, otherEntry, otherPost],
      )
    ).rows[0].id;

    await reject(f.reviewerId, f.clientId, f.post, "No.");

    expect(await usageStatus(otherUsage)).toBe("used");
    expect(await postRow(otherPost)).toMatchObject({ status: "review" });
  });

  it("is not callable by anonymous users, and adds only nullable columns", async () => {
    const grants = await db.query<{ role: string; allowed: boolean }>(
      `select r.rolname as role, has_function_privilege(r.rolname, p.oid, 'execute') as allowed
       from pg_proc p
       cross join (select rolname from pg_roles where rolname in ('anon','authenticated')) r
       where p.pronamespace = 'public'::regnamespace and p.proname = 'reject_post'
       order by 1`,
    );
    expect(grants.rows).toEqual([
      { role: "anon", allowed: false },
      { role: "authenticated", allowed: true },
    ]);

    const columns = await db.query<{ column_name: string; is_nullable: string }>(
      `select column_name, is_nullable from information_schema.columns
       where table_schema = 'public' and table_name = 'posts'
         and column_name in ('approved_by', 'last_edited_by', 'linkedin_url') order by 1`,
    );
    expect(columns.rows).toEqual([
      { column_name: "approved_by", is_nullable: "YES" },
      { column_name: "last_edited_by", is_nullable: "YES" },
      { column_name: "linkedin_url", is_nullable: "YES" },
    ]);
  });
});
