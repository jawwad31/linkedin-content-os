import "server-only";

import { createClient } from "@/lib/supabase/server";

export type FounderExperience = {
  id: string;
  title: string;
  whatHappened: string;
  whatWasLearned: string | null;
  whatChanged: string | null;
  whyItMatters: string | null;
  createdAt: string;
  updatedAt: string;
};

type FounderExperienceRow = {
  id: string;
  title: string;
  what_happened: string;
  what_was_learned: string | null;
  what_changed: string | null;
  why_it_matters: string | null;
  created_at: string;
  updated_at: string;
};

export type FounderExperiencesResult =
  | { ok: true; experiences: FounderExperience[] }
  | { ok: false };

/**
 * Active (non-archived) Founder Experiences for one client, newest first.
 * Scoped by client_id; RLS's founder_experiences_select_accepted_access
 * policy is the backstop, not the primary access gate (the [client_id]
 * layout already verifies accepted access before this ever runs).
 */
export async function getFounderExperiences(
  clientId: string,
): Promise<FounderExperiencesResult> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("founder_experiences")
    .select(
      "id, title, what_happened, what_was_learned, what_changed, why_it_matters, created_at, updated_at",
    )
    .eq("client_id", clientId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .returns<FounderExperienceRow[]>();

  if (error) return { ok: false };

  return {
    ok: true,
    experiences: data.map((row) => ({
      id: row.id,
      title: row.title,
      whatHappened: row.what_happened,
      whatWasLearned: row.what_was_learned,
      whatChanged: row.what_changed,
      whyItMatters: row.why_it_matters,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  };
}
