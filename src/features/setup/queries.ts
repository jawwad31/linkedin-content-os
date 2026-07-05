import "server-only";

import { createClient } from "@/lib/supabase/server";

import { CLIENT_CONTEXT_COLUMNS } from "./schemas";

export type ClientBusinessContext = {
  name: string;
  founderName: string | null;
  industry: string | null;
  businessDescription: string | null;
  primaryIcp: string | null;
  mainOffer: string | null;
  corePov: string | null;
  contentPillars: string[];
  researchKeywords: string[];
  bannedTopics: string[];
  founderVoiceSample: string | null;
  phrasesToUse: string[];
  phrasesToAvoid: string[];
  approvedProof: string[];
  referenceMaterial: string[];
  publishingPreferencesNotes: string;
};

type ClientContextRow = {
  name: string;
  founder_name: string | null;
  industry: string | null;
  business_description: string | null;
  primary_icp: string | null;
  main_offer: string | null;
  core_pov: string | null;
  content_pillars: string[] | null;
  research_keywords: string[] | null;
  banned_topics: string[] | null;
  founder_voice_sample: string | null;
  phrases_to_use: string[] | null;
  phrases_to_avoid: string[] | null;
  approved_proof: string[] | null;
  reference_material: string[] | null;
  publishing_preferences: { notes?: string } | null;
};

export type ClientBusinessContextResult =
  | { ok: true; context: ClientBusinessContext }
  | { ok: false };

/**
 * The client's editable business context fields, scoped by client_id.
 * Callers must have already verified the caller has accepted access to
 * this client (the [client_id] layout does this before any page renders) —
 * RLS's clients_select_accepted_access policy is the backstop, not the
 * primary gate.
 */
export async function getClientBusinessContext(
  clientId: string,
): Promise<ClientBusinessContextResult> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("clients")
    .select(CLIENT_CONTEXT_COLUMNS.join(", "))
    .eq("id", clientId)
    .is("deleted_at", null)
    .maybeSingle<ClientContextRow>();

  if (error || !data) return { ok: false };

  return {
    ok: true,
    context: {
      name: data.name,
      founderName: data.founder_name,
      industry: data.industry,
      businessDescription: data.business_description,
      primaryIcp: data.primary_icp,
      mainOffer: data.main_offer,
      corePov: data.core_pov,
      contentPillars: data.content_pillars ?? [],
      researchKeywords: data.research_keywords ?? [],
      bannedTopics: data.banned_topics ?? [],
      founderVoiceSample: data.founder_voice_sample,
      phrasesToUse: data.phrases_to_use ?? [],
      phrasesToAvoid: data.phrases_to_avoid ?? [],
      approvedProof: data.approved_proof ?? [],
      referenceMaterial: data.reference_material ?? [],
      publishingPreferencesNotes: data.publishing_preferences?.notes ?? "",
    },
  };
}
