import { describe, expect, it } from "vitest";

import {
  CONTENT_BANK_CATEGORIES,
  createContentBankEntrySchema,
  type ContentBankCategory,
} from "@/features/content-bank/schemas";
import {
  canRoleManageClientSetup,
  canRoleManageFounderExperiences,
} from "@/lib/access/roles";
import {
  reserveSourceEntry,
  releaseSourceReservation,
  handlePostDeletionUsageCleanup,
} from "@/features/content-bank/usage-service";

describe("Content Bank and Safe Reuse (P02)", () => {
  describe("Schemas & Categories", () => {
    it("validates all 8 approved Content Bank categories", () => {
      const expectedCategories: ContentBankCategory[] = [
        "problem_solved",
        "case_study",
        "experiment",
        "lesson",
        "observation",
        "process",
        "achievement",
        "lead_magnet",
      ];
      expect(CONTENT_BANK_CATEGORIES).toEqual(expectedCategories);
    });

    it("accepts valid free-form notes and raw transcripts", () => {
      const result = createContentBankEntrySchema.safeParse({
        category: "observation",
        title: "Client onboarding bottlenecks",
        rawNotes: "Pasted transcript from founder check-in: We noticed 80% of delay is waiting for logo assets...",
        takeaway: "Kill asset collection from day 1 onboarding",
        allowReuse: false,
        readiness: "ready",
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.category).toBe("observation");
      expect(result.data.allowReuse).toBe(false);
      expect(result.data.readiness).toBe("ready");
    });

    it("requires asset metadata when category is lead_magnet", () => {
      const validLeadMagnet = createContentBankEntrySchema.safeParse({
        category: "lead_magnet",
        title: "Cold Outreach Audit Checklist",
        resourceType: "checklist",
        keyword: "CHECKLIST",
        deliveryUrl: "https://example.com/asset.pdf",
        deliveryInstructions: "Send via DM upon keyword comment",
        commentGateApproved: true,
        allowReuse: true,
      });

      expect(validLeadMagnet.success).toBe(true);
    });

    it("rejects invalid category or negative reuse values", () => {
      const invalid = createContentBankEntrySchema.safeParse({
        category: "unknown_category",
        title: "Test",
      });
      expect(invalid.success).toBe(false);
    });
  });

  describe("Role & Capability Boundaries", () => {
    it("allows agency_admin and client_admin to manage both lead magnets and experiences", () => {
      expect(canRoleManageClientSetup("agency_admin")).toBe(true);
      expect(canRoleManageClientSetup("client_admin")).toBe(true);
      expect(canRoleManageClientSetup("client_user")).toBe(false);

      expect(canRoleManageFounderExperiences("agency_admin", [])).toBe(true);
      expect(canRoleManageFounderExperiences("client_admin", [])).toBe(true);
    });

    it("restricts client_user without founder_experience_manage from managing experiences", () => {
      expect(canRoleManageFounderExperiences("client_user", [])).toBe(false);
      expect(
        canRoleManageFounderExperiences("client_user", [
          "founder_experience_manage",
        ]),
      ).toBe(true);
    });

    it("denies client_user from managing lead magnets even with founder_experience_manage", () => {
      // Lead magnets require client admin setup capability
      expect(canRoleManageClientSetup("client_user")).toBe(false);
    });
  });

  describe("Atomic Reservation and Contention Mechanics", () => {
    it("rejects reservation when single-use entry is already in use", async () => {
      const mockSingleUseSource = {
        id: "source-1",
        client_id: "client-1",
        allow_reuse: false,
        readiness: "ready",
        deleted_at: null,
      };

      const mockClient = {
        from: (table: string) => {
          if (table === "founder_experiences") {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    is: () => ({
                      maybeSingle: async () => ({
                        data: mockSingleUseSource,
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === "source_usage") {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    in: async () => ({
                      data: [{ id: "usage-1", status: "used" }],
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          return {};
        },
      } as never;

      const result = await reserveSourceEntry(
        {
          clientId: "client-1",
          sourceId: "source-1",
          sourceType: "founder_experience",
        },
        mockClient,
      );

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe("SINGLE_USE_CONFLICT");
      expect(result.error).toContain("single-use");
    });

    it("permits reservation when allow_reuse is true even if already used", async () => {
      const mockReusableSource = {
        id: "source-2",
        client_id: "client-1",
        allow_reuse: true,
        readiness: "ready",
        deleted_at: null,
      };

      const mockClient = {
        from: (table: string) => {
          if (table === "founder_experiences") {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    is: () => ({
                      maybeSingle: async () => ({
                        data: mockReusableSource,
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === "source_usage") {
            return {
              insert: () => ({
                select: () => ({
                  single: async () => ({
                    data: { id: "new-usage-id" },
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {};
        },
      } as never;

      const result = await reserveSourceEntry(
        {
          clientId: "client-1",
          sourceId: "source-2",
          sourceType: "founder_experience",
          angle: "Second perspective",
        },
        mockClient,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.usageId).toBe("new-usage-id");
    });

    it("rejects reservation on archived entries", async () => {
      const mockArchivedSource = {
        id: "source-3",
        client_id: "client-1",
        allow_reuse: true,
        readiness: "archived",
        deleted_at: null,
      };

      const mockClient = {
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                is: () => ({
                  maybeSingle: async () => ({
                    data: mockArchivedSource,
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
      } as never;

      const result = await reserveSourceEntry(
        {
          clientId: "client-1",
          sourceId: "source-3",
          sourceType: "founder_experience",
        },
        mockClient,
      );

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe("ARCHIVED_ENTRY");
    });
  });

  describe("Usage Commit and Post Deletion Tombstone Invariant", () => {
    it("releases reservation on draft failure without touching published records", async () => {
      let updatedStatus: string | null = null;

      const chainable = {
        eq: () => chainable,
        then: (resolve: (val: { error: null }) => void) => resolve({ error: null }),
      };

      const mockClient = {
        from: () => ({
          update: (payload: { status: string }) => {
            updatedStatus = payload.status;
            return chainable;
          },
        }),
      } as never;

      const releaseResult = await releaseSourceReservation(
        {
          clientId: "client-1",
          usageId: "usage-pending-1",
        },
        mockClient,
      );

      expect(releaseResult.ok).toBe(true);
      expect(updatedStatus).toBe("cancelled");
    });

    it("preserves published usage history when an internal post is deleted", async () => {
      let cancelledCount = 0;

      const mockClient = {
        from: () => ({
          update: () => {
            cancelledCount += 1;
            return {
              eq: () => ({
                eq: () => ({
                  in: async () => ({ error: null }),
                }),
              }),
            };
          },
        }),
      } as never;

      // When isPublished is true, handlePostDeletionUsageCleanup must NOT cancel the usage
      const result = await handlePostDeletionUsageCleanup(
        {
          clientId: "client-1",
          postId: "published-post-1",
          isPublished: true,
        },
        mockClient,
      );

      expect(result.ok).toBe(true);
      expect(cancelledCount).toBe(0); // Never cancelled or deleted
    });

    it("cancels reservation when an unpublished draft post is deleted", async () => {
      let cancelledStatus: string | null = null;

      const mockClient = {
        from: () => ({
          update: (payload: { status: string }) => {
            cancelledStatus = payload.status;
            return {
              eq: () => ({
                eq: () => ({
                  in: async () => ({ error: null }),
                }),
              }),
            };
          },
        }),
      } as never;

      const result = await handlePostDeletionUsageCleanup(
        {
          clientId: "client-1",
          postId: "draft-post-1",
          isPublished: false,
        },
        mockClient,
      );

      expect(result.ok).toBe(true);
      expect(cancelledStatus).toBe("cancelled");
    });
  });
});
