import { describe, expect, it } from "vitest";

import {
  BATCH_EDIT_MAX_ITEMS,
  batchArticleStatusRequestSchema,
  batchArticleStatusResultSchema,
} from "@/lib/bulk-edit/contracts";

const ID_A = "10000000-0000-4000-8000-000000000001";
const ID_B = "10000000-0000-4000-8000-000000000002";

describe("article batch-status contract", () => {
  it("accepts relevant or irrelevant and deduplicates ids", () => {
    const parsed = batchArticleStatusRequestSchema.parse({
      ids: [ID_A, ID_A, ID_B],
      targetStatus: "relevant",
    });

    expect(parsed).toEqual({
      ids: [ID_A, ID_B],
      targetStatus: "relevant",
    });
    expect(
      batchArticleStatusRequestSchema.safeParse({
        ids: [ID_A],
        targetStatus: "irrelevant",
      }).success,
    ).toBe(true);
  });

  it("rejects unsupported statuses, invalid ids, and oversized batches", () => {
    expect(
      batchArticleStatusRequestSchema.safeParse({
        ids: [ID_A],
        targetStatus: "used",
      }).success,
    ).toBe(false);
    expect(
      batchArticleStatusRequestSchema.safeParse({
        ids: ["not-a-uuid"],
        targetStatus: "relevant",
      }).success,
    ).toBe(false);
    expect(
      batchArticleStatusRequestSchema.safeParse({
        ids: Array.from(
          { length: BATCH_EDIT_MAX_ITEMS + 1 },
          (_, index) =>
            `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        ),
        targetStatus: "irrelevant",
      }).success,
    ).toBe(false);
  });

  it("validates partial-success responses", () => {
    expect(
      batchArticleStatusResultSchema.parse({
        requestedCount: 2,
        updatedIds: [ID_A],
        failures: [
          {
            id: ID_B,
            code: "DEPENDENCY_CONFLICT",
            message: "This article supports a TrendCard.",
          },
        ],
      }),
    ).toMatchObject({ requestedCount: 2, updatedIds: [ID_A] });
  });
});
