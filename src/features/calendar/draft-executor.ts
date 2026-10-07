// Independent of Next requests and provider clients so interruption and mixed
// results can be tested without replacing the database's lease protocol.
export type DraftClaim = { slotId: string; ideaId: string; leaseToken: string };
export type DraftStep = "done" | "busy" | "saved" | "failed" | "stopped";
export type DraftExecutorPorts<T> = {
  claim: () => Promise<{ state: "done" | "busy" } | { state: "claimed"; claim: DraftClaim }>;
  renew: (claim: DraftClaim) => Promise<boolean>;
  produce: (claim: DraftClaim, shouldContinue: () => Promise<boolean>) => Promise<
    { ok: true; values: T } | { ok: false; code: string }>;
  finish: (claim: DraftClaim, values: T) => Promise<boolean>;
  fail: (claim: DraftClaim, code: string) => Promise<boolean>;
};

/** One bounded request handles one slot. The caller may pump again or pause. */
export async function executeDraftStep<T>(ports: DraftExecutorPorts<T>): Promise<DraftStep> {
  const claimed = await ports.claim();
  if (claimed.state !== "claimed") return claimed.state;
  const { claim } = claimed;
  let owned = true;
  const shouldContinue = async () => {
    if (!owned) return false;
    owned = await ports.renew(claim);
    return owned;
  };
  try {
    if (!(await shouldContinue())) return "stopped";
    const result = await ports.produce(claim, shouldContinue);
    if (!(await shouldContinue())) return "stopped";
    if (!result.ok) return await ports.fail(claim, result.code) ? "failed" : "stopped";
    return await ports.finish(claim, result.values) ? "saved" : "stopped";
  } catch {
    // A disconnected request can vanish before this runs. Its persisted lease
    // then expires; another pump recovers the same backing idea.
    if (!owned) return "stopped";
    return await ports.fail(claim, "GENERATION_FAILED").catch(() => false) ? "failed" : "stopped";
  }
}
