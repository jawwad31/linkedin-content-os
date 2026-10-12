/** The longest stretch of article text the writer is given; matches what is stored. */
export const WRITER_ARTICLE_TEXT_LIMIT = 12_000;

export type SourceArticleRow = {
  id: string;
  title: string;
  summary: string | null;
  url: string;
  source_name: string | null;
  published_at: string | null;
  /** The article page's readable text, read when the article was saved. Null if it could not be read. */
  full_text?: string | null;
};

/** Exactly the trimming the feed summary always had, so stored plan hashes stay valid. */
function trimSummary(value: string | null, maxLength: number): string | null {
  if (!value) return null;
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function clip(value: string | null, limit: number): string | null {
  if (!value) return null;
  const text = value.trim();
  if (!text) return null;
  return text.length <= limit ? text : `${text.slice(0, limit).trimEnd()}…`;
}

/**
 * One article as the writer sees it. `summary` is the feed's own short teaser. `text` is
 * the whole article when it could be read, and is left out otherwise, so the writer knows
 * only the summary is available rather than being handed an empty field.
 */
export function toSourceArticle(row: SourceArticleRow): Record<string, unknown> {
  const text = clip(row.full_text ?? null, WRITER_ARTICLE_TEXT_LIMIT);
  return {
    id: row.id,
    title: row.title,
    summary: trimSummary(row.summary, 700),
    url: row.url,
    source_name: row.source_name,
    published_at: row.published_at,
    ...(text ? { text } : {}),
  };
}
