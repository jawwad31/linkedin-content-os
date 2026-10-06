import "server-only";

import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  DocumentPurpose,
  RetrievedExcerpt,
} from "./schemas";

type SupabaseAnyClient =
  | Awaited<ReturnType<typeof createClient>>
  | ReturnType<typeof createAdminClient>;

export function computeContentHash(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export type SectionChunk = {
  sectionTitle: string | null;
  text: string;
};

/**
 * Splits markdown or text content into semantic sections based on headers or paragraphs.
 */
export function chunkDocumentContent(content: string): SectionChunk[] {
  const lines = content.split("\n");
  const chunks: SectionChunk[] = [];

  let currentTitle: string | null = null;
  let currentLines: string[] = [];

  for (const line of lines) {
    const headerMatch = line.match(/^#{1,4}\s+(.+)$/);
    if (headerMatch) {
      if (currentLines.length > 0) {
        const text = currentLines.join("\n").trim();
        if (text) {
          chunks.push({ sectionTitle: currentTitle, text });
        }
        currentLines = [];
      }
      currentTitle = headerMatch[1].trim();
    } else {
      currentLines.push(line);
    }
  }

  if (currentLines.length > 0) {
    const text = currentLines.join("\n").trim();
    if (text) {
      chunks.push({ sectionTitle: currentTitle, text });
    }
  }

  // Fallback if no markdown headers were found: split by double newlines into blocks
  if (chunks.length === 0 && content.trim()) {
    const paragraphs = content
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);

    for (const p of paragraphs) {
      chunks.push({ sectionTitle: null, text: p });
    }
  }

  return chunks;
}

/**
 * Computes a simple term frequency relevance score between query and chunk.
 */
function scoreChunkRelevance(query: string, text: string, title: string | null): number {
  const queryTerms = query
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);

  if (queryTerms.length === 0) return 0;

  const lowerText = text.toLowerCase();
  const lowerTitle = (title ?? "").toLowerCase();

  let matches = 0;
  for (const term of queryTerms) {
    if (lowerTitle.includes(term)) {
      matches += 3; // Boost header matches
    }
    const occurrences = lowerText.split(term).length - 1;
    matches += Math.min(occurrences, 5);
  }

  return matches / queryTerms.length;
}

/**
 * Retrieves relevant sections from client documents.
 * Invariants:
 * 1. Strictly isolated to clientId.
 * 2. Only 'ready' documents that are not archived or deleted are searched.
 * 3. Exact documentId, contentHash, and section provenance are retained.
 * 4. Private evidence is never returned with purpose 'reader_download'.
 */
export async function retrieveScopedExcerpts(
  params: {
    clientId: string;
    query: string;
    purpose?: DocumentPurpose;
    documentIds?: string[];
    minScore?: number;
    maxResults?: number;
  },
  customClient?: SupabaseAnyClient,
): Promise<RetrievedExcerpt[]> {
  const supabase = customClient ?? (await createClient());

  let query = supabase
    .from("client_documents")
    .select(
      "id, client_id, filename, content_text, content_hash, purpose, version, status",
    )
    .eq("client_id", params.clientId)
    .eq("status", "ready")
    .is("deleted_at", null);

  if (params.purpose) {
    query = query.eq("purpose", params.purpose);
  }

  if (params.documentIds && params.documentIds.length > 0) {
    query = query.in("id", params.documentIds);
  }

  const { data: docs, error } = await query;
  if (error || !docs || docs.length === 0) {
    return [];
  }

  const minScore = params.minScore ?? 0.5;
  const maxResults = params.maxResults ?? 5;
  const scoredExcerpts: RetrievedExcerpt[] = [];

  for (const doc of docs) {
    // If the document is short (< 800 chars), use the entire document as one excerpt
    if (doc.content_text.length < 800) {
      const score = scoreChunkRelevance(params.query, doc.content_text, null);
      if (score >= minScore) {
        scoredExcerpts.push({
          documentId: doc.id,
          filename: doc.filename,
          contentHash: doc.content_hash,
          purpose: doc.purpose,
          sectionTitle: null,
          excerpt: doc.content_text.trim(),
          score,
        });
      }
      continue;
    }

    // Otherwise, chunk into sections
    const chunks = chunkDocumentContent(doc.content_text);
    for (const chunk of chunks) {
      const score = scoreChunkRelevance(
        params.query,
        chunk.text,
        chunk.sectionTitle,
      );
      if (score >= minScore) {
        scoredExcerpts.push({
          documentId: doc.id,
          filename: doc.filename,
          contentHash: doc.content_hash,
          purpose: doc.purpose,
          sectionTitle: chunk.sectionTitle,
          excerpt: chunk.text,
          score,
        });
      }
    }
  }

  // Sort by score descending and limit
  scoredExcerpts.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return scoredExcerpts.slice(0, maxResults);
}
