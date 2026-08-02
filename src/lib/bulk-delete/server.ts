import "server-only";

import type {
  BatchDeleteFailure,
  BatchDeleteResult,
} from "./contracts";

export type BatchDeleteOperationResult =
  | { ok: true }
  | { ok: false; code: string; message: string };

export async function runBatchDelete({
  ids,
  deleteOne,
  concurrency = 4,
}: {
  ids: string[];
  deleteOne: (id: string) => Promise<BatchDeleteOperationResult>;
  concurrency?: number;
}): Promise<BatchDeleteResult> {
  const outcomes = new Array<BatchDeleteOperationResult>(ids.length);
  let cursor = 0;

  async function worker() {
    while (cursor < ids.length) {
      const index = cursor;
      cursor += 1;

      try {
        outcomes[index] = await deleteOne(ids[index]);
      } catch {
        outcomes[index] = {
          ok: false,
          code: "UNKNOWN_ERROR",
          message: "This record could not be deleted. Please try again.",
        };
      }
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, ids.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  const deletedIds: string[] = [];
  const failures: BatchDeleteFailure[] = [];

  outcomes.forEach((outcome, index) => {
    const id = ids[index];
    if (outcome.ok) {
      deletedIds.push(id);
    } else {
      failures.push({ id, code: outcome.code, message: outcome.message });
    }
  });

  return {
    requestedCount: ids.length,
    deletedIds,
    failures,
  };
}
