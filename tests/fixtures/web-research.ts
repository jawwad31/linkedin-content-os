import type { Finding } from "@/features/research/web-research/contracts";

export const researchFinding: Finding = {
  developmentKey: "measurement-release",
  title: "A measurement change",
  whatChanged: "The platform introduced a new measurement setting.",
  whyItMatters: "Agencies can verify the change before updating campaigns.",
  agencyAction: "Review the published documentation and test the setting.",
  angle: "How to validate the measurement setting",
  category: "confirmed_change",
  confidence: "high",
  consequence: 4,
  relevance: 5,
  novelty: "new",
  previousFindingId: null,
  sources: [
    {
      url: "https://example.com/release",
      title: "Official release",
      publishedOn: "2026-10-06",
      announcedOn: null,
      effectiveOn: "2026-11-01",
      dateEvidence: "Published October 6; takes effect November 1.",
      sourceKind: "primary",
    },
  ],
};
export function webResponse(
  findings: unknown[] = [researchFinding],
  sources = researchFinding.sources.map((s) => ({
    url: s.url,
    title: s.title,
  })),
) {
  return {
    status: "completed",
    output: [
      { type: "web_search_call", status: "completed", action: { sources } },
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: JSON.stringify({
              summary: "A bounded research briefing.",
              coverageGaps: [],
              findings,
            }),
            annotations: [],
          },
        ],
      },
    ],
    usage: { input_tokens: 100, output_tokens: 120 },
  };
}
