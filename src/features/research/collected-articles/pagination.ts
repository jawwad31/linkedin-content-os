export const COLLECTED_ARTICLE_PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_COLLECTED_ARTICLE_PAGE_SIZE = 50;

export type CollectedArticlePageSize =
  (typeof COLLECTED_ARTICLE_PAGE_SIZES)[number];

export function parseCollectedArticlePage(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

export function parseCollectedArticlePageSize(
  value: string | undefined,
): CollectedArticlePageSize {
  const parsed = Number.parseInt(value ?? "", 10);
  return COLLECTED_ARTICLE_PAGE_SIZES.includes(
    parsed as CollectedArticlePageSize,
  )
    ? (parsed as CollectedArticlePageSize)
    : DEFAULT_COLLECTED_ARTICLE_PAGE_SIZE;
}
