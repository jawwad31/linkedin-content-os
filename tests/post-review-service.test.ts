import { beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "00000000-0000-4000-8000-0000000000aa";
const CLIENT_ID = "00000000-0000-4000-8000-0000000000c1";
const POST_ID = "00000000-0000-4000-8000-0000000000b1";

type Call = { table: string; op: string; payload?: Record<string, unknown>; filters: [string, unknown][] };

const state = vi.hoisted(() => ({
  post: null as Record<string, unknown> | null,
  updateRows: [{ id: "post" }] as { id: string }[] | null,
  updateError: null as { code?: string } | null,
  /** Results returned by the next updates, in order, before the defaults apply. */
  updateQueue: [] as { data: { id: string } | null; error: { code?: string } | null }[],
  rpcResult: { data: null, error: null } as { data: unknown; error: unknown },
  calls: [] as Call[],
  rpcCalls: [] as { name: string; args: Record<string, unknown> }[],
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/audit/log", () => ({ writeAuditLog: vi.fn(async () => undefined) }));
vi.mock("@/lib/supabase/session", () => ({ getServerUser: vi.fn() }));
vi.mock("@/lib/access/client-access", () => ({
  canAccessClient: vi.fn(),
  canManageWorkflowReview: vi.fn(),
  canPublishPosts: vi.fn(),
  canReviewPosts: vi.fn(),
}));
vi.mock("@/features/content-bank/usage-service", () => ({
  handlePostDeletionUsageCleanup: vi.fn(),
  markSourceUsagePublished: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => {
      const call: Call = { table, op: "select", filters: [] };
      const chain: Record<string, unknown> = {};
      for (const method of ["eq", "is", "neq"]) {
        chain[method] = (column: string, value: unknown) => {
          call.filters.push([column, value]);
          return chain;
        };
      }
      chain.select = () => chain;
      chain.update = (payload: Record<string, unknown>) => {
        call.op = "update";
        call.payload = payload;
        state.calls.push(call);
        return chain;
      };
      chain.maybeSingle = async () => {
        if (call.op !== "update") return { data: state.post, error: null };
        return state.updateQueue.shift() ?? { data: state.updateRows?.[0] ?? null, error: state.updateError };
      };
      return chain;
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ name, args });
      return state.rpcResult;
    },
  }),
}));

import {
  approvePost,
  editPostContent,
  markPostPublished,
  rejectPost,
} from "@/features/posts/review/service";
import { canAccessClient, canPublishPosts, canReviewPosts } from "@/lib/access/client-access";
import { writeAuditLog } from "@/lib/audit/log";
import { getServerUser } from "@/lib/supabase/session";

const post = (overrides: Record<string, unknown> = {}) => ({
  id: POST_ID,
  status: "review",
  draft_version: 3,
  approved_draft_version: null,
  final_post: "Body",
  ...overrides,
});

const updates = () => state.calls.filter((call) => call.op === "update");

beforeEach(() => {
  state.post = post();
  state.updateRows = [{ id: "post" }];
  state.updateError = null;
  state.updateQueue.length = 0;
  state.rpcResult = { data: null, error: null };
  state.calls.length = 0;
  state.rpcCalls.length = 0;
  vi.mocked(writeAuditLog).mockClear();
  vi.mocked(getServerUser).mockResolvedValue({ user: { id: USER_ID } } as never);
  vi.mocked(canAccessClient).mockResolvedValue(true);
  vi.mocked(canReviewPosts).mockResolvedValue(true);
  vi.mocked(canPublishPosts).mockResolvedValue(true);
});

describe("approvePost", () => {
  it("approves exactly the version the reviewer read, atomically, and records who", async () => {
    const result = await approvePost(CLIENT_ID, POST_ID, { version: 3 });

    expect(result.ok).toBe(true);
    const update = updates()[0];
    expect(update.payload).toMatchObject({ status: "approved", approved_draft_version: 3, approved_by: USER_ID });
    // The write only matches while the draft is still that version.
    expect(update.filters).toContainEqual(["draft_version", 3]);
  });

  it("refuses a newer version than the one that was read, without writing", async () => {
    const result = await approvePost(CLIENT_ID, POST_ID, { version: 2 });

    expect(result).toMatchObject({ ok: false, code: "STALE_VERSION" });
    expect(updates()).toHaveLength(0);
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it("refuses when the draft changes between the check and the write", async () => {
    state.updateRows = null;
    expect(await approvePost(CLIENT_ID, POST_ID, { version: 3 })).toMatchObject({ ok: false, code: "STALE_VERSION" });
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it.each([undefined, null, {}, { version: "3" }, { version: 0 }, { version: 1.5 }, { version: 3, extra: true }])(
    "needs a valid version (%j)",
    async (body) => {
      expect(await approvePost(CLIENT_ID, POST_ID, body)).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
      expect(updates()).toHaveLength(0);
    },
  );

  it("still approves before the approver column exists, without recording who", async () => {
    state.updateQueue.push({ data: null, error: { code: "42703" } });

    const result = await approvePost(CLIENT_ID, POST_ID, { version: 3 });

    expect(result.ok).toBe(true);
    expect(updates()).toHaveLength(2);
    expect(updates()[0].payload).toHaveProperty("approved_by");
    expect(updates()[1].payload).not.toHaveProperty("approved_by");
  });

  it("needs the Review capability", async () => {
    vi.mocked(canReviewPosts).mockResolvedValue(false);
    expect(await approvePost(CLIENT_ID, POST_ID, { version: 3 })).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(updates()).toHaveLength(0);
  });
});

describe("rejectPost", () => {
  it("rejects through the database function with the note, which frees the entry", async () => {
    state.rpcResult = { data: { ok: true, freed: 1 }, error: null };

    const result = await rejectPost(CLIENT_ID, POST_ID, { note: "  Off brand.  " });

    expect(result.ok).toBe(true);
    expect(state.rpcCalls).toEqual([
      { name: "reject_post", args: { p_client_id: CLIENT_ID, p_post_id: POST_ID, p_note: "Off brand." } },
    ]);
    expect(updates()).toHaveLength(0);
    expect(vi.mocked(writeAuditLog).mock.calls[0][0].metadata).toMatchObject({ entriesFreed: 1 });
  });

  it.each([undefined, {}, { note: "" }, { note: "   " }, { note: "x".repeat(2001) }])(
    "needs a one-line note (%j)",
    async (body) => {
      expect(await rejectPost(CLIENT_ID, POST_ID, body)).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
      expect(state.rpcCalls).toHaveLength(0);
    },
  );

  it("does not reject a post that is not under review", async () => {
    state.post = post({ status: "approved" });
    expect(await rejectPost(CLIENT_ID, POST_ID, { note: "No." })).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(state.rpcCalls).toHaveLength(0);
  });

  it.each([
    ["FORBIDDEN", "FORBIDDEN"],
    ["INVALID_STATE", "NOT_FOUND"],
    ["NOT_FOUND", "NOT_FOUND"],
  ])("maps a database %s to %s and audits nothing", async (code, expected) => {
    state.rpcResult = { data: { ok: false, code }, error: null };
    expect(await rejectPost(CLIENT_ID, POST_ID, { note: "No." })).toMatchObject({ ok: false, code: expected });
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it("never exposes a raw database error", async () => {
    state.rpcResult = { data: null, error: { code: "XX000", message: 'deadlock on "source_usage"' } };
    const result = await rejectPost(CLIENT_ID, POST_ID, { note: "No." });
    expect(result).toMatchObject({ ok: false, code: "UNKNOWN_ERROR" });
    if (!result.ok) expect(result.message).not.toMatch(/deadlock|source_usage/);
  });
});

describe("markPostPublished", () => {
  const today = new Date().toISOString().slice(0, 10);

  beforeEach(() => {
    state.post = post({ status: "approved", draft_version: 2, approved_draft_version: 2 });
  });

  it("records the day and LinkedIn link, only for an approved post", async () => {
    const result = await markPostPublished(CLIENT_ID, POST_ID, {
      publishedOn: "2026-10-11",
      linkedinUrl: "https://www.linkedin.com/posts/example-123",
    });

    expect(result.ok).toBe(true);
    const update = updates()[0];
    expect(update.payload).toMatchObject({
      status: "published",
      published_at: "2026-10-11T12:00:00.000Z",
      linkedin_url: "https://www.linkedin.com/posts/example-123",
    });
    expect(update.filters).toContainEqual(["status", "approved"]);
  });

  it("works without a link", async () => {
    expect((await markPostPublished(CLIENT_ID, POST_ID, { publishedOn: today })).ok).toBe(true);
    expect(updates()[0].payload).not.toHaveProperty("linkedin_url");
  });

  it.each([
    "http://www.linkedin.com/posts/x",
    "https://evil.example.com/linkedin.com",
    "https://notlinkedin.com/posts/x",
    "javascript:alert(1)",
    "not a link",
  ])("refuses a link that is not LinkedIn (%s)", async (linkedinUrl) => {
    expect(await markPostPublished(CLIENT_ID, POST_ID, { publishedOn: today, linkedinUrl })).toMatchObject({
      ok: false,
      code: "VALIDATION_ERROR",
    });
    expect(updates()).toHaveLength(0);
  });

  it("accepts a lnkd.in short link", async () => {
    expect((await markPostPublished(CLIENT_ID, POST_ID, { publishedOn: today, linkedinUrl: "https://lnkd.in/abc" })).ok).toBe(true);
  });

  it.each([undefined, {}, { publishedOn: "yesterday" }, { publishedOn: "2099-01-01" }, { publishedOn: "2026-13-40" }])(
    "needs a real date that is not in the future (%j)",
    async (body) => {
      expect(await markPostPublished(CLIENT_ID, POST_ID, body)).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
      expect(updates()).toHaveLength(0);
    },
  );

  it("refuses a post that is not approved, or whose approval is stale", async () => {
    state.post = post({ status: "review" });
    expect(await markPostPublished(CLIENT_ID, POST_ID, { publishedOn: today })).toMatchObject({ ok: false });

    state.post = post({ status: "approved", draft_version: 4, approved_draft_version: 3 });
    expect(await markPostPublished(CLIENT_ID, POST_ID, { publishedOn: today })).toMatchObject({
      ok: false,
      code: "STALE_APPROVAL",
    });
    expect(updates()).toHaveLength(0);
  });

  it("needs the Publish capability", async () => {
    vi.mocked(canPublishPosts).mockResolvedValue(false);
    expect(await markPostPublished(CLIENT_ID, POST_ID, { publishedOn: today })).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });
});

describe("editPostContent", () => {
  it("saves the next version, records the editor and writes only if the version still matches", async () => {
    const result = await editPostContent(CLIENT_ID, POST_ID, { finalPost: "New text", expectedVersion: 3 });

    expect(result).toEqual({ ok: true, data: { postId: POST_ID, approvalInvalidated: false, version: 4 } });
    const update = updates()[0];
    expect(update.payload).toMatchObject({ final_post: "New text", draft_version: 4, last_edited_by: USER_ID });
    expect(update.filters).toContainEqual(["draft_version", 3]);
  });

  it("withdraws approval when an approved post is edited", async () => {
    state.post = post({ status: "approved", draft_version: 3, approved_draft_version: 3 });

    const result = await editPostContent(CLIENT_ID, POST_ID, { finalPost: "Changed", expectedVersion: 3 });

    expect(result).toMatchObject({ ok: true, data: { approvalInvalidated: true, version: 4 } });
    expect(updates()[0].payload).toMatchObject({ status: "review", approved_at: null, approved_draft_version: null });
  });

  it("will not overwrite a newer version", async () => {
    expect(await editPostContent(CLIENT_ID, POST_ID, { finalPost: "Old edit", expectedVersion: 2 })).toMatchObject({
      ok: false,
      code: "STALE_VERSION",
    });
    expect(updates()).toHaveLength(0);

    state.updateRows = null;
    expect(await editPostContent(CLIENT_ID, POST_ID, { finalPost: "Race", expectedVersion: 3 })).toMatchObject({
      ok: false,
      code: "STALE_VERSION",
    });
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it.each(["published", "rejected"])("will not edit a %s post", async (status) => {
    state.post = post({ status });
    expect(await editPostContent(CLIENT_ID, POST_ID, { finalPost: "x", expectedVersion: 3 })).toMatchObject({
      ok: false,
      code: "INVALID_STATE",
    });
    expect(updates()).toHaveLength(0);
  });

  it("needs the version that was edited and the Review capability", async () => {
    expect(await editPostContent(CLIENT_ID, POST_ID, { finalPost: "x" })).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    vi.mocked(canReviewPosts).mockResolvedValue(false);
    expect(await editPostContent(CLIENT_ID, POST_ID, { finalPost: "x", expectedVersion: 3 })).toMatchObject({
      ok: false,
      code: "FORBIDDEN",
    });
    expect(updates()).toHaveLength(0);
  });
});
