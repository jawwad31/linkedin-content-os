import { describe, expect, it, vi } from "vitest";
import { executeDraftStep, type DraftExecutorPorts } from "@/features/calendar/draft-executor";
import { startDraftBatchSchema } from "@/features/calendar/drafting-contracts";

const claim = { slotId: "slot", ideaId: "idea", leaseToken: "lease" };
function ports(): DraftExecutorPorts<string> {
  return { claim: vi.fn(async () => ({ state: "claimed" as const, claim })),
    renew: vi.fn(async () => true), produce: vi.fn(async () => ({ ok: true as const, values: "reviewed draft" })),
    finish: vi.fn(async () => true), fail: vi.fn(async () => true) };
}
describe("one-slot calendar executor", () => {
  it("commits one reviewed draft after rechecking ownership", async () => {
    const p = ports(); expect(await executeDraftStep(p)).toBe("saved");
    expect(p.finish).toHaveBeenCalledWith(claim,"reviewed draft"); expect(p.produce).toHaveBeenCalledTimes(1);
    expect(p.renew).toHaveBeenCalledTimes(2); expect(p.fail).not.toHaveBeenCalled();
  });
  it.each(["done","busy"] as const)("never charges for %s work", async state => {
    const p = ports(); p.claim = vi.fn(async () => ({ state }));
    expect(await executeDraftStep(p)).toBe(state); expect(p.produce).not.toHaveBeenCalled();
  });
  it("does not start paid work after revocation or lease loss", async () => {
    const p = ports(); p.renew = vi.fn(async () => false);
    expect(await executeDraftStep(p)).toBe("stopped"); expect(p.produce).not.toHaveBeenCalled();
  });
  it("discards a late result after cancellation and never marks stale work failed", async () => {
    const p = ports(); p.renew = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect(await executeDraftStep(p)).toBe("stopped"); expect(p.finish).not.toHaveBeenCalled(); expect(p.fail).not.toHaveBeenCalled();
  });
  it("stops subsequent provider stages when ownership is lost", async () => {
    const p = ports(); p.renew = vi.fn().mockResolvedValueOnce(true).mockResolvedValue(false);
    p.produce = vi.fn(async (_claim, shouldContinue) => {
      expect(await shouldContinue()).toBe(false); expect(await shouldContinue()).toBe(false);
      return { ok: false as const, code: "GENERATION_FAILED" };
    });
    expect(await executeDraftStep(p)).toBe("stopped"); expect(p.renew).toHaveBeenCalledTimes(2);
  });
  it("records configuration failures without committing a post, and allows the next slot", async () => {
    const p = ports(); p.produce = vi.fn().mockResolvedValueOnce({ ok: false, code: "NOT_CONFIGURED" }).mockResolvedValueOnce({ ok: true, values: "next draft" });
    expect(await executeDraftStep(p)).toBe("failed"); expect(p.fail).toHaveBeenCalledWith(claim,"NOT_CONFIGURED");
    expect(await executeDraftStep(p)).toBe("saved"); expect(p.finish).toHaveBeenCalledTimes(1);
  });
  it("records interrupted provider work without leaking its exception", async () => {
    const p = ports(); p.produce = vi.fn(async () => { throw new Error("raw provider payload"); });
    expect(await executeDraftStep(p)).toBe("failed"); expect(p.fail).toHaveBeenCalledWith(claim,"GENERATION_FAILED");
  });
  it("requires bounded unique selections and rejects forged brief fields", () => {
    const id = "92c04fcf-63d0-43ce-a3b7-9481233192c0";
    const valid = { requestKey: id, slots: [{ slotId: id, brief: { topic: "An explicit topic" } }] };
    expect(startDraftBatchSchema.safeParse(valid).success).toBe(true);
    expect(startDraftBatchSchema.safeParse({ ...valid, slots: Array(11).fill(valid.slots[0]) }).success).toBe(false);
    expect(startDraftBatchSchema.safeParse({ ...valid, slots: [valid.slots[0],valid.slots[0]] }).success).toBe(false);
    expect(startDraftBatchSchema.safeParse({ ...valid, slots: [{ slotId: id, brief: { topic: "Topic", approved: true } }] }).success).toBe(false);
  });
});
