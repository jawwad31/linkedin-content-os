import { describe, expect, it } from "vitest";

import {
  BATCH_DELETE_MAX_ITEMS,
  batchDeleteRequestSchema,
} from "@/lib/bulk-delete/contracts";
import { runBatchDelete } from "@/lib/bulk-delete/server";

const ID_A = "10000000-0000-4000-8000-000000000001";
const ID_B = "10000000-0000-4000-8000-000000000002";
const ID_C = "10000000-0000-4000-8000-000000000003";

describe("batch delete contract", () => {
  it("accepts an allowlisted entity, exact confirmation, and deduplicates ids", () => {
    const parsed = batchDeleteRequestSchema.parse({
      entityType: "content_idea",
      ids: [ID_A, ID_A, ID_B],
      confirmDelete: "DELETE",
    });

    expect(parsed.ids).toEqual([ID_A, ID_B]);
  });

  it("rejects unknown entities, invalid ids, confirmation drift, and oversized batches", () => {
    expect(
      batchDeleteRequestSchema.safeParse({
        entityType: "client",
        ids: [ID_A],
        confirmDelete: "DELETE",
      }).success,
    ).toBe(false);
    expect(
      batchDeleteRequestSchema.safeParse({
        entityType: "post",
        ids: ["not-a-uuid"],
        confirmDelete: "DELETE",
      }).success,
    ).toBe(false);
    expect(
      batchDeleteRequestSchema.safeParse({
        entityType: "post",
        ids: [ID_A],
        confirmDelete: "delete",
      }).success,
    ).toBe(false);
    expect(
      batchDeleteRequestSchema.safeParse({
        entityType: "post",
        ids: Array.from(
          { length: BATCH_DELETE_MAX_ITEMS + 1 },
          (_, index) =>
            `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        ),
        confirmDelete: "DELETE",
      }).success,
    ).toBe(false);
  });
});

describe("batch delete runner", () => {
  it("returns ordered partial outcomes", async () => {
    const result = await runBatchDelete({
      ids: [ID_A, ID_B, ID_C],
      concurrency: 2,
      deleteOne: async (id) => {
        if (id === ID_B) {
          return {
            ok: false,
            code: "DEPENDENCY_CONFLICT",
            message: "This record is still in use.",
          } as const;
        }
        return { ok: true } as const;
      },
    });

    expect(result).toEqual({
      requestedCount: 3,
      deletedIds: [ID_A, ID_C],
      failures: [
        {
          id: ID_B,
          code: "DEPENDENCY_CONFLICT",
          message: "This record is still in use.",
        },
      ],
    });
  });

  it("maps unexpected item failures to a safe result", async () => {
    const result = await runBatchDelete({
      ids: [ID_A],
      deleteOne: async () => {
        throw new Error("raw internal failure");
      },
    });

    expect(result.failures).toEqual([
      {
        id: ID_A,
        code: "UNKNOWN_ERROR",
        message: "This record could not be deleted. Please try again.",
      },
    ]);
  });
});
