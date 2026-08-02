import "server-only";

import { createClient } from "@/lib/supabase/server";

export async function getResearchKeywords(
  clientId: string,
): Promise<{ ok: true; keywords: string[] } | { ok: false }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .select("research_keywords")
    .eq("id", clientId)
    .is("deleted_at", null)
    .maybeSingle<{ research_keywords: string[] | null }>();

  if (error || !data) return { ok: false };
  return { ok: true, keywords: data.research_keywords ?? [] };
}
