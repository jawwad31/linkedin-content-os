import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SOURCE_MODES } from "@/lib/ai/playbooks/taxonomies";
import { asUser, createMigratedDb, seedWorkspace, type MigratedDb } from "./support/pg-harness";

let db: MigratedDb;
beforeAll(async () => { db = await createMigratedDb(); }, 180_000);
afterAll(async () => { await db.close(); });

describe("standalone source modes on PostgreSQL", () => {
  it("accepts every supported mode and still rejects unknown modes", async () => {
    const ws = await seedWorkspace(db, "standalone-modes");
    await asUser(db, ws.adminId, async () => {
      for (const mode of SOURCE_MODES) {
        const result = await db.query<{ source_type: string }>(
          "insert into public.content_ideas (client_id, source_type, angle, status) values ($1, $2, 'A supplied angle', 'ready') returning source_type",
          [ws.clientId, mode],
        );
        expect(result.rows[0].source_type).toBe(mode);
      }
      await expect(db.query(
        "insert into public.content_ideas (client_id, source_type, angle) values ($1, 'invented', 'Unknown mode')",
        [ws.clientId],
      )).rejects.toThrow(/content_ideas_source_type_check/);
    });
  });
});
