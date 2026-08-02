"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { canManageResearchSources } from "@/lib/access/client-access";
import { writeAuditLog } from "@/lib/audit/log";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/session";

export type SaveResearchKeywordsState = {
  error: string | null;
  success: string | null;
};

const uuidSchema = z.string().uuid();
const keywordsSchema = z.string().trim().max(2_000);

export async function saveResearchKeywordsAction(
  clientId: string,
  _previous: SaveResearchKeywordsState,
  formData: FormData,
): Promise<SaveResearchKeywordsState> {
  const client = uuidSchema.safeParse(clientId);
  const keywords = keywordsSchema.safeParse(formData.get("researchKeywords"));
  if (!client.success || !keywords.success) {
    return { error: "Check the keywords and try again.", success: null };
  }

  const { user } = await getServerUser();
  if (!user || !(await canManageResearchSources(user.id, client.data))) {
    return {
      error: "You do not have permission to manage Research settings.",
      success: null,
    };
  }

  const values = keywords.data
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .update({ research_keywords: values })
    .eq("id", client.data)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error || !data) {
    return { error: "Could not save Research keywords.", success: null };
  }

  await writeAuditLog({
    clientId: client.data,
    userId: user.id,
    action: "research_keywords_updated",
    entityType: "client",
    entityId: client.data,
    metadata: { keyword_count: values.length },
  });
  revalidatePath(`/client/${client.data}/research`);
  return { error: null, success: "Research keywords saved." };
}
