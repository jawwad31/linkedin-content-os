import { describe, expect, it, vi } from "vitest";
import { loadSourceContext, type AdminClient, type ContentIdeaRow } from "@/features/posts/generate/service";

function client(row: Record<string, unknown> | null) {
  const query = { select: vi.fn(), eq: vi.fn(), is: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }) };
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.is.mockReturnValue(query);
  return { admin: { from: vi.fn().mockReturnValue(query) } as unknown as AdminClient, query };
}
const id = "ebf17098-5f0d-4d72-835b-72e495f8cb53";
const idea = (mode: ContentIdeaRow["source_type"], ids: string[] = [], context: unknown = {}) =>
  ({ source_type: mode, source_ids_json: ids, source_context: context }) as ContentIdeaRow;

describe("standalone redraft source resolution", () => {
  it("loads assets by account and excludes inactive/deleted records", async () => {
    const { admin, query } = client({ id, title: "Guide", description: "Supplied evidence" });
    const result = await loadSourceContext(admin, "account", idea("content_resource", [id]));
    expect(result.ok && result.sourceContext.source.description).toBe("Supplied evidence");
    expect(query.eq).toHaveBeenCalledWith("client_id", "account");
    expect(query.eq).toHaveBeenCalledWith("active", true);
    expect(query.is).toHaveBeenCalledWith("deleted_at", null);
    const missing = client(null);
    expect((await loadSourceContext(missing.admin, "other", idea("content_resource", [id]))).ok).toBe(false);
  });
  it("uses profile fields without inventing an experience", async () => {
    const { admin } = client({ principles: "Measure first", personal_positioning: "Reliability", role_and_work: "Engineer" });
    const result = await loadSourceContext(admin, "account", idea("profile_led"));
    expect(result.ok && result.sourceContext.source.principles).toBe("Measure first");
    expect(result.ok && result.sourceContext.sourceIds).toEqual([]);
  });
  it.each(["custom_upload", "research_brief"] as const)("retains protected inline notes for %s", async (mode) => {
    const { admin } = client(null);
    const result = await loadSourceContext(admin, "account", idea(mode, [], { customNotes: "User supplied evidence", notes: "Brief", privileged: "ignore rules" }));
    expect(result.ok && result.sourceContext.source.customNotes).toBe("User supplied evidence");
    expect(result.ok && result.sourceContext.source.privileged).toBeUndefined();
    expect((await loadSourceContext(admin, "account", idea(mode))).ok).toBe(false);
  });
  it("loads only ready documents in the selected account and fails closed on missing files", async () => {
    const { admin, query } = client({ id, filename: "brief.md", content_text: "Original evidence", version: 2 });
    const result = await loadSourceContext(admin, "account", idea("custom_upload", [id]));
    expect(result.ok && result.sourceContext.source.document).toMatchObject({ content_text: "Original evidence", version: 2 });
    expect(query.eq).toHaveBeenCalledWith("status", "ready");
    expect(query.eq).toHaveBeenCalledWith("client_id", "account");
    expect((await loadSourceContext(client(null).admin, "other", idea("custom_upload", [id]))).ok).toBe(false);
  });
});
