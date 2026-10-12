/** Same ceiling the Content Bank applies when a trend reaction is edited. */
const FIELD_LIMIT = 2000;

export type ArticleForEntry = {
  title: string;
  url: string;
  summary: string | null;
  sourceName: string | null;
  publishedAt: string | null;
  classificationReason: string | null;
};

export type ArticleEntryFields = {
  title: string;
  whatHappened: string;
  whatWasLearned: string;
  whatChanged: string | null;
  whyItMatters: string | null;
};

function clip(value: string, limit: number): string {
  const text = value.trim();
  return text.length <= limit ? text : `${text.slice(0, limit - 1).trimEnd()}…`;
}

/** "- Title (Source, published 2026-10-01): https://…", the same shape a finding's source line has. */
export function articleSourceLine(article: ArticleForEntry): string {
  const published = article.publishedAt
    ? `published ${article.publishedAt.slice(0, 10)}`
    : "date not reported";
  const origin = article.sourceName ? `${article.sourceName}, ${published}` : published;
  return `- ${article.title} (${origin}): ${article.url}`;
}

/**
 * Maps one collected RSS article onto a trend-reaction Content Bank entry. The article
 * stays the evidence: its link and date are written into the "what happened / proof" field,
 * and the article's own record is linked by the database column, not copied. Nothing is
 * invented: the reason the classifier gave is used only if there is one.
 */
export function articleToEntryFields(article: ArticleForEntry): ArticleEntryFields {
  const summary = article.summary?.trim() ?? "";
  const line = articleSourceLine(article);
  const reason = article.classificationReason?.trim() ?? "";
  return {
    title: clip(article.title, 200),
    whatHappened: clip(summary ? `${summary}\n\n${line}` : line, FIELD_LIMIT),
    whatWasLearned: clip(
      reason || `Saved from ${article.sourceName ?? "a collected article"}. Add your own take before drafting.`,
      FIELD_LIMIT,
    ),
    whatChanged: summary ? clip(summary, FIELD_LIMIT) : null,
    whyItMatters: reason ? clip(reason, FIELD_LIMIT) : null,
  };
}
