import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { RESOURCE_TYPES } from "@/lib/ai/playbooks/taxonomies";
import { LEAD_MAGNET_TYPES } from "@/features/content-bank/schemas";
import { contentResourceInputSchema } from "@/features/resources/schemas";

import { createMigratedDb, seedWorkspace, type MigratedDb } from "./support/pg-harness";

let db: MigratedDb;

beforeAll(async () => {
  db = await createMigratedDb();
}, 180_000);

afterAll(async () => {
  await db.close();
});

async function insertResource(clientId: string, resourceType: string, keyword: string) {
  return db.query(
    `insert into public.content_resources
       (client_id, title, resource_type, keyword, delivery_instructions)
     values ($1, $2, $3, $4, 'Send manually after the comment.')
     returning id`,
    [clientId, `A ${resourceType}`, resourceType, keyword],
  );
}

describe("Content Resource types", () => {
  it("offers the same types in the form list and the Content Bank schema", () => {
    expect([...RESOURCE_TYPES].sort()).toEqual([...LEAD_MAGNET_TYPES].sort());
    expect(RESOURCE_TYPES).toContain("framework");
  });

  it("validates a framework in the legacy resource schema", () => {
    const parsed = contentResourceInputSchema.safeParse({
      title: "Reliability framework",
      resourceType: "framework",
      keyword: "frame",
      deliveryInstructions: "Send manually.",
    });
    expect(parsed.success).toBe(true);
    expect(contentResourceInputSchema.safeParse({
      title: "x", resourceType: "podcast", keyword: "x", deliveryInstructions: "y",
    }).success).toBe(false);
  });

  it("lets the database store every supported type, including framework", async () => {
    const ws = await seedWorkspace(db, "resource-types");
    for (const [index, type] of RESOURCE_TYPES.entries()) {
      const result = await insertResource(ws.clientId, type, `KEY${index}`);
      expect(result.rows).toHaveLength(1);
    }
    const stored = await db.query<{ resource_type: string }>(
      "select resource_type from public.content_resources where client_id = $1 order by resource_type",
      [ws.clientId],
    );
    expect(stored.rows.map((row) => row.resource_type)).toContain("framework");
  });

  it("still rejects an unsupported type with the same constraint", async () => {
    const ws = await seedWorkspace(db, "resource-type-invalid");
    await expect(insertResource(ws.clientId, "podcast", "BAD")).rejects.toThrow(
      /content_resources_type_check/,
    );
  });

  it("keeps the type check named and rerunnable", async () => {
    const check = await db.query<{ definition: string }>(
      `select pg_get_constraintdef(oid) as definition from pg_constraint
       where conname = 'content_resources_type_check'
         and conrelid = 'public.content_resources'::regclass`,
    );
    expect(check.rows).toHaveLength(1);
    expect(check.rows[0].definition).toContain("framework");
  });
});
