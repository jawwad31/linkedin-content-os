import type { ReactNode } from "react";
import { isPublicWebUrl } from "@/features/research/web-research/contracts";
import { parseArticle } from "./article";


const INLINE = /(\[[^\]]+\]\(https?:\/\/[^)\s]+\)|\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g;

function inline(text: string): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    const link = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(part);
    if (link)
      return isPublicWebUrl(link[2]) ? (
        <a
          key={i}
          href={link[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-link underline"
        >
          {link[1]}
        </a>
      ) : (
        <span key={i}>{link[1]}</span>
      );
    const bold = /^\*\*([^*]+)\*\*$/.exec(part);
    if (bold) return <strong key={i}>{bold[1]}</strong>;
    const italic = /^\*([^*\s][^*]*)\*$/.exec(part);
    if (italic) return <em key={i}>{italic[1]}</em>;
    return part;
  });
}

/** The edition as the reader will see it. Links render only when they are public web links. */
export function ArticleView({ markdown }: { markdown: string }) {
  return (
    <div className="flex flex-col gap-3 text-body leading-relaxed text-near-black">
      {parseArticle(markdown).map((block, i) => {
        if (block.kind === "heading")
          return block.level === 1 ? (
            <h2 key={i} className="font-heading text-section-title font-semibold">
              {inline(block.text)}
            </h2>
          ) : (
            <h3
              key={i}
              className="mt-2 font-heading text-card-title font-semibold"
            >
              {inline(block.text)}
            </h3>
          );
        if (block.kind === "list") {
          const Tag = block.ordered ? "ol" : "ul";
          return (
            <Tag
              key={i}
              className={`flex flex-col gap-1 pl-5 ${block.ordered ? "list-decimal" : "list-disc"}`}
            >
              {block.items.map((item, j) => (
                <li key={j}>{inline(item)}</li>
              ))}
            </Tag>
          );
        }
        return <p key={i}>{inline(block.text)}</p>;
      })}
    </div>
  );
}
