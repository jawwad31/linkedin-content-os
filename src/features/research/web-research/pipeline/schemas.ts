import { z } from "zod";

/**
 * What each model step must return. They use only plain types, enums and nullable values so the
 * provider's strict structured-output mode accepts them. Length limits are enforced afterwards in
 * code, by the finding contract, rather than being asked of the model.
 */
export const planSchema = z.object({
  lanes: z.array(
    z.object({
      /** Short label, for example "Google Business Profile". */
      name: z.string(),
      /** What this lane is looking for, in one or two sentences. */
      focus: z.string(),
      /** One or two public search queries. */
      queries: z.array(z.string()),
    }),
  ),
  /** A date range the saved prompt itself asks for, as YYYY-MM-DD; both null when it asks for none. */
  explicitDateRange: z.object({ from: z.string().nullable(), to: z.string().nullable() }).nullable(),
});
export type ResearchPlan = z.infer<typeof planSchema>;

export const extractionSchema = z.object({
  claims: z.array(
    z.object({
      /** The id of the page the claim comes from, as given in the input. */
      pageId: z.string(),
      claim: z.string(),
      /** A passage copied word for word from that page that states or supports the claim. */
      excerpt: z.string(),
      publishedOn: z.string().nullable(),
      announcedOn: z.string().nullable(),
      effectiveOn: z.string().nullable(),
      /** A passage copied word for word from the page that shows the dates above. */
      dateEvidence: z.string().nullable(),
      sourceKind: z.enum(["primary", "secondary", "unknown"]),
      previousState: z.string().nullable(),
      audience: z.string().nullable(),
      limitations: z.string().nullable(),
    }),
  ),
});
export type ExtractedClaims = z.infer<typeof extractionSchema>;

export const synthesisSchema = z.object({
  summary: z.string(),
  coverageGaps: z.array(z.string()),
  findings: z.array(
    z.object({
      developmentKey: z.string(),
      title: z.string(),
      whatChanged: z.string(),
      whyItMatters: z.string(),
      agencyAction: z.string(),
      angle: z.string(),
      previousState: z.string().nullable(),
      audience: z.string().nullable(),
      limitations: z.string().nullable(),
      category: z.enum(["confirmed_change", "trend_analysis"]),
      confidence: z.enum(["high", "medium", "low"]),
      consequence: z.number(),
      relevance: z.number(),
      novelty: z.enum(["new", "follow_up", "repeated"]),
      previousFindingId: z.string().nullable(),
      /** Ids of the evidence items this finding rests on. Nothing else can be cited. */
      evidenceIds: z.array(z.string()),
    }),
  ),
});
export type SynthesisOutput = z.infer<typeof synthesisSchema>;

const UNSUPPORTED = new Set([
  "minLength", "maxLength", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum",
  "minItems", "maxItems", "pattern", "format", "default", "$schema", "multipleOf", "uniqueItems",
]);
/**
 * The JSON Schema for a model step in the form strict structured output accepts: no length,
 * range or format keywords, every property required, no extra properties.
 */
export function strictJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const visit = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(visit);
    if (!node || typeof node !== "object") return node;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      if (UNSUPPORTED.has(key)) continue;
      // Under "properties" the keys are field names, not schema keywords, so none are removed.
      out[key] =
        key === "properties" && value && typeof value === "object"
          ? Object.fromEntries(Object.entries(value).map(([name, child]) => [name, visit(child)]))
          : visit(value);
    }
    if (out.properties && typeof out.properties === "object") {
      out.required = Object.keys(out.properties);
      out.additionalProperties = false;
    }
    return out;
  };
  return visit(z.toJSONSchema(schema)) as Record<string, unknown>;
}
