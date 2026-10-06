import "server-only";

import type { ContextManifest, RetrievedExcerpt } from "./schemas";

/**
 * Estimates token count using standard ~4 characters per token heuristic.
 */
export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Builds a deterministic context manifest for planning or post drafting.
 * Invariant: Content manifest records references, provenance, and hashes
 * without logging raw internal prompt text.
 */
export function buildContextManifest(params: {
  profileRevision: number;
  sourceIds: { id: string; type: string; version?: number }[];
  playbookVersion: string;
  retrievedSections: RetrievedExcerpt[];
  basePromptText?: string;
}): ContextManifest {
  let totalText = params.basePromptText ?? "";
  for (const s of params.retrievedSections) {
    totalText += `\n${s.filename}\n${s.excerpt}`;
  }

  return {
    profileRevision: params.profileRevision,
    sourceIds: params.sourceIds,
    playbookVersion: params.playbookVersion,
    retrievedSections: params.retrievedSections,
    tokenEstimate: estimateTokenCount(totalText),
    createdAt: new Date().toISOString(),
  };
}
