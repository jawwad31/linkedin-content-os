/**
 * A short label for a breadcrumb or page heading: whitespace collapsed, the fallback when
 * the text is empty, and a cut at `maxLength` characters (code points, so an emoji is never
 * split) with an ellipsis. The page itself also truncates to one line with CSS; this keeps
 * the stored text short for the title attribute and the accessible name.
 */
export function breadcrumbLabel(
  text: string | null | undefined,
  fallback: string,
  maxLength = 80,
): string {
  const line = (text ?? "").replace(/\s+/g, " ").trim();
  if (!line) return fallback;

  const characters = Array.from(line);
  if (characters.length <= maxLength) return line;

  return `${characters.slice(0, maxLength - 1).join("").trimEnd()}…`;
}
