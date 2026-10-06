import "server-only";

import { createClient } from "@/lib/supabase/server";

import {
  CLIENT_CONTEXT_COLUMNS,
  founderVoiceExampleSchema,
  type FounderVoiceExample,
} from "./schemas";

export type ClientBusinessContext = {
  // Business Profile
  name: string;
  industry: string | null;
  businessDescription: string | null;
  primaryIcp: string | null;
  audienceUnderstanding: string | null;
  painPoints: string | null;
  mainOffer: string | null;
  commercialDetails: string | null;
  deliveryApproach: string | null;
  businessPositioning: string | null;
  questionsAndDoubts: string | null;
  bannedTopics: string[];
  approvedProof: string[];

  // Personal-Brand Profile
  founderName: string | null;
  roleAndWork: string | null;
  personalPositioning: string | null;
  personalReaders: string | null;
  contentPillars: string[];
  principles: string | null;
  voiceGuide: string | null;
  founderVoiceSample: string | null;
  founderVoiceExamples: FounderVoiceExample[];
  phrasesToUse: string[];
  phrasesToAvoid: string[];
  boundaries: string | null;
  businessMentions: string | null;

  // Metadata
  profileRevision: number;
};

type ClientContextRow = {
  name: string;
  founder_name: string | null;
  industry: string | null;
  business_description: string | null;
  primary_icp: string | null;
  audience_understanding: string | null;
  pain_points: string | null;
  main_offer: string | null;
  commercial_details: string | null;
  delivery_approach: string | null;
  business_positioning: string | null;
  questions_and_doubts: string | null;
  banned_topics: string[] | null;
  approved_proof: string[] | null;

  role_and_work: string | null;
  personal_positioning: string | null;
  core_pov?: string | null;
  personal_readers: string | null;
  content_pillars: string[] | null;
  principles: string | null;
  voice_guide: string | null;
  founder_voice_sample: string | null;
  founder_voice_examples: unknown;
  phrases_to_use: string[] | null;
  phrases_to_avoid: string[] | null;
  boundaries: string | null;
  business_mentions: string | null;
  profile_revision: number | null;
};

export type ClientBusinessContextResult =
  | { ok: true; context: ClientBusinessContext }
  | { ok: false };

function parseVoiceExamples(value: unknown): FounderVoiceExample[] {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((entry) => {
      const parsed = founderVoiceExampleSchema.safeParse(entry);
      return parsed.success ? [parsed.data] : [];
    })
    .slice(0, 3);
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

export async function getClientBusinessContext(
  clientId: string,
): Promise<ClientBusinessContextResult> {
  const supabase = await createClient();
  const selectColumns = [...new Set([...CLIENT_CONTEXT_COLUMNS, "core_pov"])].join(", ");
  const { data, error } = await supabase
    .from("clients")
    .select(selectColumns)
    .eq("id", clientId)
    .is("deleted_at", null)
    .maybeSingle<ClientContextRow>();

  if (error || !data) return { ok: false };

  return {
    ok: true,
    context: {
      name: data.name,
      industry: data.industry,
      businessDescription: data.business_description,
      primaryIcp: data.primary_icp,
      audienceUnderstanding: data.audience_understanding ?? null,
      painPoints: data.pain_points ?? null,
      mainOffer: data.main_offer,
      commercialDetails: data.commercial_details ?? null,
      deliveryApproach: data.delivery_approach ?? null,
      businessPositioning: data.business_positioning ?? null,
      questionsAndDoubts: data.questions_and_doubts ?? null,
      bannedTopics: data.banned_topics ?? [],
      approvedProof: data.approved_proof ?? [],

      founderName: data.founder_name,
      roleAndWork: data.role_and_work ?? null,
      // Deliberately map legacy core_pov if personal_positioning is not yet set
      personalPositioning: data.personal_positioning ?? data.core_pov ?? null,
      personalReaders: data.personal_readers ?? null,
      contentPillars: parseStringArray(data.content_pillars),
      principles: data.principles ?? null,
      voiceGuide: data.voice_guide ?? null,
      founderVoiceSample: data.founder_voice_sample,
      founderVoiceExamples: parseVoiceExamples(data.founder_voice_examples),
      phrasesToUse: data.phrases_to_use ?? [],
      phrasesToAvoid: data.phrases_to_avoid ?? [],
      boundaries: data.boundaries ?? null,
      businessMentions: data.business_mentions ?? null,

      profileRevision: typeof data.profile_revision === "number" ? data.profile_revision : 1,
    },
  };
}
