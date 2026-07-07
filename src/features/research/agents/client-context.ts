import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type AdminClient = ReturnType<typeof createAdminClient>;

export type ClientBusinessContext = {
  industry: string | null;
  businessDescription: string | null;
  primaryIcp: string | null;
  mainOffer: string | null;
  corePov: string | null;
  contentPillars: unknown;
  researchKeywords: unknown;
  bannedTopics: unknown;
};

/**
 * Shared business-context fetch used by both the classifier (Feature 17)
 * and the TrendCard synthesizer (Feature 18) — kept in one place so
 * the exact same minimal, safe field list is used everywhere an agent
 * needs client context.
 */
export async function getClientBusinessContext(
  admin: AdminClient,
  clientId: string,
): Promise<ClientBusinessContext | null> {
  const { data, error } = await admin
    .from("clients")
    .select(
      "industry, business_description, primary_icp, main_offer, core_pov, content_pillars, research_keywords, banned_topics",
    )
    .eq("id", clientId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !data) return null;

  return {
    industry: data.industry,
    businessDescription: data.business_description,
    primaryIcp: data.primary_icp,
    mainOffer: data.main_offer,
    corePov: data.core_pov,
    contentPillars: data.content_pillars,
    researchKeywords: data.research_keywords,
    bannedTopics: data.banned_topics,
  };
}
