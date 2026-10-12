/** "0:32", "1:05": minutes and zero-padded seconds, never negative. */
export function formatElapsed(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(Number.isFinite(totalSeconds) ? totalSeconds : 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * The line shown when drafting stopped after the brief was saved (wireframe s7).
 * A Content Bank entry stays reserved for this brief, so the wording says exactly
 * that: it is not used up, and it is not free for another post until this one
 * succeeds or is abandoned.
 */
export function draftFailureCopy(fromContentBank: boolean): { headline: string; detail: string } {
  return {
    headline: "Drafting stopped while writing. Your source and fields are saved.",
    detail: fromContentBank
      ? "The entry has not been used up. It stays reserved for this post while you try again."
      : "Nothing has been used. Try again with the same source and fields.",
  };
}

/** The wireframe's reuse notice under the source, in plain words. */
export function reuseNotice(allowReuse: boolean): string {
  return allowReuse
    ? "Reusable. This entry stays available after the post is drafted."
    : "Single-use. This entry is used up once the post is drafted. Reuse is turned off.";
}
