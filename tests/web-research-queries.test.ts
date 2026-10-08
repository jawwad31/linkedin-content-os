import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  user: vi.fn(),
  manage: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.create }));
vi.mock("@/lib/supabase/session", () => ({ getServerUser: mocks.user }));
vi.mock("@/lib/access/client-access", () => ({
  canManageResearchSources: mocks.manage,
}));
import {
  getResearchSettings,
  getWebBriefings,
} from "@/features/research/web-research/queries";

beforeEach(() => {
  vi.resetAllMocks();
});
describe("P07 research reads", () => {
  it("never queries private settings for an account user", async () => {
    mocks.user.mockResolvedValue({ user: { id: "member" } });
    mocks.manage.mockResolvedValue(false);
    expect(await getResearchSettings("account")).toBeNull();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("pages through all retained candidates with account and briefing scope instead of accepting the API row cap", async () => {
    const candidates = Array.from({ length: 601 }, (_, i) => ({
      briefing_id: "brief",
      evidence: {
        url: `https://example.com/${i}`,
        title: `Candidate ${i}`,
        publishedOn: null,
        announcedOn: null,
        effectiveOn: null,
        dateEvidence: null,
        sourceKind: "unknown",
        fetchedAt: "2026-10-08T08:00:00Z",
      },
    }));
    const queries: {
      table: string;
      eq: ReturnType<typeof vi.fn>;
      range: ReturnType<typeof vi.fn>;
    }[] = [];
    mocks.create.mockResolvedValue({
      from(table: string) {
        const result = {
          data:
            table === "research_briefings"
              ? [
                  {
                    id: "brief",
                    revision: 1,
                    outcome: "success",
                    summary: "",
                    coverage_gaps: [],
                    error_code: null,
                    created_at: "2026-10-08T08:00:00Z",
                    candidate_count: 601,
                    run_id: "run",
                  },
                ]
              : table === "research_runs"
                ? [{ id: "run", status: "success" }]
                : [],
          error: null,
        };
        const query = {
          select: vi.fn(),
          eq: vi.fn(),
          order: vi.fn(),
          limit: vi.fn(),
          in: vi.fn(),
          range: vi.fn(),
          then: (resolve: (value: typeof result) => unknown) =>
            Promise.resolve(result).then(resolve),
        };
        for (const fn of [
          query.select,
          query.eq,
          query.order,
          query.limit,
          query.in,
        ])
          fn.mockReturnValue(query);
        query.range.mockImplementation((start: number, end: number) =>
          Promise.resolve({
            data: candidates.slice(start, end + 1),
            error: null,
          }),
        );
        queries.push({ table, ...query });
        return query;
      },
    });
    const result = await getWebBriefings("account");
    expect(result[0].candidates).toHaveLength(601);
    const evidenceQueries = queries.filter(
      (q) => q.table === "research_candidates",
    );
    expect(evidenceQueries).toHaveLength(2);
    for (const query of evidenceQueries) {
      expect(query.eq).toHaveBeenCalledWith("client_id", "account");
      expect(query.eq).toHaveBeenCalledWith("briefing_id", "brief");
    }
    expect(evidenceQueries.map((q) => q.range.mock.calls[0])).toEqual([
      [0, 499],
      [500, 999],
    ]);
  });
});
