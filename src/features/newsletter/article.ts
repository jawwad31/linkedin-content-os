import { isPublicWebUrl } from "@/features/research/web-research/contracts";

export type ArticleBlock =
  | { kind: "heading"; level: number; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "paragraph"; text: string };

/**
 * Splits Markdown into headings, lists and paragraphs. Lines of one paragraph are joined,
 * so how the model wrapped its lines never changes the spacing of what is shown or copied.
 */
export function parseArticle(markdown: string): ArticleBlock[] {
  const blocks: ArticleBlock[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flushParagraph = () => {
    if (paragraph.length)
      blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
    paragraph = [];
  };
  const flushList = () => {
    if (list) blocks.push({ kind: "list", ...list });
    list = null;
  };
  for (const raw of markdown.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    const heading = /^\s{0,3}(#{1,6})\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (!line.trim()) {
      flushParagraph();
      flushList();
    } else if (heading) {
      flushParagraph();
      flushList();
      blocks.push({
        kind: "heading",
        level: heading[1].length,
        text: heading[2],
      });
    } else if (bullet || numbered) {
      flushParagraph();
      const ordered = !bullet;
      if (list && list.ordered !== ordered) flushList();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]);
    } else {
      flushList();
      paragraph.push(line.trim());
    }
  }
  flushParagraph();
  flushList();
  return blocks;
}

/** Inline Markdown as plain text: bold and italic marks go, links keep their address in brackets. */
function plainInline(text: string) {
  return text
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1 ($2)")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1$2");
}

/**
 * Plain text for the LinkedIn newsletter editor: one blank line between every block,
 * list items on their own lines, nothing in Markdown symbols.
 */
export function articleToPlainText(markdown: string) {
  return parseArticle(markdown)
    .map((block) => {
      if (block.kind === "list")
        return block.items
          .map((item, i) =>
            `${block.ordered ? `${i + 1}.` : "•"} ${plainInline(item)}`,
          )
          .join("\n");
      return plainInline(block.text);
    })
    .join("\n\n")
    .trim();
}

const escapeHtml = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function htmlInline(text: string) {
  return escapeHtml(text)
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
      (_match, label: string, url: string) => {
        const address = url.replace(/&amp;/g, "&");
        return isPublicWebUrl(address)
          ? `<a href="${escapeHtml(address)}">${label}</a>`
          : label;
      },
    )
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
}

/** The same edition as simple HTML (headings, paragraphs, lists, bold, italics, public links) for a rich paste. */
export function articleToHtml(markdown: string) {
  return parseArticle(markdown)
    .map((block) => {
      if (block.kind === "heading") {
        const tag = block.level === 1 ? "h1" : block.level === 2 ? "h2" : "h3";
        return `<${tag}>${htmlInline(block.text)}</${tag}>`;
      }
      if (block.kind === "list") {
        const tag = block.ordered ? "ol" : "ul";
        return `<${tag}>${block.items.map((i) => `<li>${htmlInline(i)}</li>`).join("")}</${tag}>`;
      }
      return `<p>${htmlInline(block.text)}</p>`;
    })
    .join("");
}
