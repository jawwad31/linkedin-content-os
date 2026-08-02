import "server-only";

import { createClient } from "@/lib/supabase/server";

import {
  CLIENT_CONTEXT_COLUMNS,
  founderVoiceExampleSchema,
  type FounderVoiceExample,
} from "./schemas";

export type ClientBusinessContext = {
  name: string;
  founderName: string | null;
  industry: string | null;
  businessDescription: string | null;
  primaryIcp: string | null;
  mainOffer: string | null;
  bannedTopics: string[];
  founderVoiceSample: string | null;
  founderVoiceExamples: FounderVoiceExample[];
  phrasesToUse: string[];
  phrasesToAvoid: string[];
  approvedProof: string[];
};

type ClientContextRow = {
  name: string;
  founder_name: string | null;
  industry: string | null;
  business_description: string | null;
  primary_icp: string | null;
  main_offer: string | null;
  banned_topics: string[] | null;
  founder_voice_sample: string | null;
  founder_voice_examples: unknown;
  phrases_to_use: string[] | null;
  phrases_to_avoid: string[] | null;
  approved_proof: string[] | null;
};

export type ClientBusinessContextResult =
  | { ok: true; context: ClientBusinessContext }
  | { ok: false };

function parseVoiceExamples(value: unknown): FounderVoiceExample[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const parsed = founderVoiceExampleSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  }).slice(0, 3);
}

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
      bannedTopics: data.banned_topics ?? [],
      founderVoiceSample: data.founder_voice_sample,
      founderVoiceExamples: parseVoiceExamples(data.founder_voice_examples),
      phrasesToUse: data.phrases_to_use ?? [],
      phrasesToAvoid: data.phrases_to_avoid ?? [],
      approvedProof: data.approved_proof ?? [],
    },
  };
}
