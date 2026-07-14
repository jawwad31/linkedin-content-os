/**
 * The Planning Agent's prompt contract always writes belief_shift as
 * "what the buyer currently believes -> what they should believe" (see
 * planning-agent.ts), and posts.buyer_belief_shift is copied straight from
 * that field. Splitting on the arrow is safe - it's a guaranteed part of the
 * data contract, not a guess. Returns null for anything that doesn't match,
 * so callers can fall back to plain text (e.g. older records).
 */
export function splitBeliefShift(value: string): { from: string; to: string } | null {
  const parts = value.split(/\s*(?:->|→)\s*/);
  if (parts.length !== 2) return null;

  const clean = (part: string) => part.trim().replace(/^["“]+|["”]+$/g, "").trim();
  const from = clean(parts[0]!);
  const to = clean(parts[1]!);
  if (!from || !to) return null;

  return { from, to };
}
