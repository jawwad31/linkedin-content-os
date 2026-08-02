import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { ResourceType } from "@/lib/ai/playbooks/taxonomies";

export type ContentResource = {
  id: string;
  title: string;
  resourceType: ResourceType;
  description: string | null;
  problemSolved: string | null;
  targetUseCase: string | null;
  keyword: string;
  deliveryUrl: string | null;
  deliveryInstructions: string | null;
  active: boolean;
  commentGateApproved: boolean;
  createdAt: string;
  updatedAt: string;
};

type ContentResourceRow = {
  id: string;
  title: string;
  resource_type: ResourceType;
  description: string | null;
  problem_solved: string | null;
  target_use_case: string | null;
  keyword: string;
  delivery_url: string | null;
  delivery_instructions: string | null;
  active: boolean;
  comment_gate_approved: boolean;
  created_at: string;
  updated_at: string;
};

export type ContentResourcesResult =
  | { ok: true; resources: ContentResource[] }
  | { ok: false };

function toContentResource(row: ContentResourceRow): ContentResource {
  return {
    id: row.id,
    title: row.title,
    resourceType: row.resource_type,
    description: row.description,
    problemSolved: row.problem_solved,
    targetUseCase: row.target_use_case,
    keyword: row.keyword,
    deliveryUrl: row.delivery_url,
    deliveryInstructions: row.delivery_instructions,
    active: row.active,
    commentGateApproved: row.comment_gate_approved,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getContentResources(
  clientId: string,
): Promise<ContentResourcesResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("content_resources")
    .select(
      "id, title, resource_type, description, problem_solved, target_use_case, keyword, delivery_url, delivery_instructions, active, comment_gate_approved, created_at, updated_at",
    )
    .eq("client_id", clientId)
    .is("deleted_at", null)
    .order("active", { ascending: false })
    .order("created_at", { ascending: false })
    .returns<ContentResourceRow[]>();

  if (error) return { ok: false };
  return { ok: true, resources: data.map(toContentResource) };
}
