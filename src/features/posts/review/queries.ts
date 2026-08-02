import "server-only";

import {
  formatRecommendationSchema,
  type FormatRecommendation,
} from "@/lib/ai/playbooks/contracts";
import {
  parseQaWarningCodes,
  type QaWarningCode,
} from "@/lib/ai/playbooks/qa-warnings";
import { createClient } from "@/lib/supabase/server";

export type ReviewPostStatus =
  | "review"
  | "needs_edit"
  | "approved"
  | "published"
  | "rejected";

export type ReviewPostIdea = {
  id: string;
  angle: string;
  sourceType: string;
};

export type ReviewPost = {
  id: string;
  contentIdeaId: string | null;
  finalPost: string;
  hook: string | null;
  body: string | null;
  buyerBeliefShift: string | null;
  proofNotes: string | null;
  riskNotes: string | null;
  ctaIntent: string | null;
  formatRecommendation: FormatRecommendation | null;
  qaWarnings: QaWarningCode[];
  sourceContextUsed: unknown;
  status: ReviewPostStatus;
  editNote: string | null;
  approvedAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  idea: ReviewPostIdea | null;
};

type ReviewPostRow = {
  id: string;
  content_idea_id: string | null;
  final_post: string;
  buyer_belief_shift: string | null;
  proof_notes: string | null;
  risk_notes: string | null;
  cta_intent: string | null;
  format_recommendation: unknown;
  qa_result: unknown;
  source_context_used: unknown;
  status: ReviewPostStatus;
  edit_note: string | null;
  approved_at: string | null;
  published_at: string | null;
  created_at: string;
};

type ContentIdeaRow = {
  id: string;
  angle: string;
  source_type: string;
};

export type ReviewPostsResult =
  | { ok: true; posts: ReviewPost[] }
  | { ok: false };

function parseFormatRecommendation(value: unknown): FormatRecommendation | null {
  const parsed = formatRecommendationSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function warningsFromQaResult(value: unknown): QaWarningCode[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return parseQaWarningCodes((value as Record<string, unknown>).warnings);
}

function splitPost(value: string): { hook: string | null; body: string | null } {
  const parts = value
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) return { hook: null, body: null };

  return {
    hook: parts[0] ?? null,
    body: parts.slice(1).join("\n\n") || null,
  };
}

/**
 * Active generated posts for one client, newest first. Explicitly scoped by
 * client_id; RLS is the backstop for accepted-client read access.
 */
export async function getReviewPosts(
  clientId: string,
): Promise<ReviewPostsResult> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("posts")
    .select(
      "id, content_idea_id, final_post, buyer_belief_shift, proof_notes, risk_notes, cta_intent, format_recommendation, qa_result, source_context_used, status, edit_note, approved_at, published_at, created_at",
    )
    .eq("client_id", clientId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .returns<ReviewPostRow[]>();

  if (error) return { ok: false };

  const ideaIds = Array.from(
    new Set(
      data
        .map((post) => post.content_idea_id)
        .filter((id): id is string => typeof id === "string"),
    ),
  );
  const ideaById = new Map<string, ReviewPostIdea>();

  if (ideaIds.length > 0) {
    const { data: ideas, error: ideasError } = await supabase
      .from("content_ideas")
      .select("id, angle, source_type")
      .eq("client_id", clientId)
      .in("id", ideaIds)
      .returns<ContentIdeaRow[]>();

    if (ideasError) return { ok: false };

    for (const idea of ideas) {
      ideaById.set(idea.id, {
        id: idea.id,
        angle: idea.angle,
        sourceType: idea.source_type,
      });
    }
  }

  return {
    ok: true,
    posts: data.map((row) => {
      const split = splitPost(row.final_post);

      return {
        id: row.id,
        contentIdeaId: row.content_idea_id,
        finalPost: row.final_post,
        hook: split.hook,
        body: split.body,
        buyerBeliefShift: row.buyer_belief_shift,
        proofNotes: row.proof_notes,
        riskNotes: row.risk_notes,
        ctaIntent: row.cta_intent,
        formatRecommendation: parseFormatRecommendation(
          row.format_recommendation,
        ),
        qaWarnings: warningsFromQaResult(row.qa_result),
        sourceContextUsed: row.source_context_used,
        status: row.status,
        editNote: row.edit_note,
        approvedAt: row.approved_at,
        publishedAt: row.published_at,
        createdAt: row.created_at,
        idea: row.content_idea_id
          ? (ideaById.get(row.content_idea_id) ?? null)
          : null,
      };
    }),
  };
}

export type ReviewPostClient = {
  name: string;
  founderName: string | null;
};

export type ReviewPostResult =
  | { ok: true; post: ReviewPost; client: ReviewPostClient }
  | { ok: false; code: string; message: string };

type ClientIdentityRow = {
  name: string;
  founder_name: string | null;
};

/**
 * Fetch a single post by both client_id and post_id to enforce access scoping
 * and block cross-client access.
 */
export async function getReviewPost(
  clientId: string,
  postId: string,
): Promise<ReviewPostResult> {
  const supabase = await createClient();

  const [{ data: row, error }, { data: clientRow }] = await Promise.all([
    supabase
      .from("posts")
      .select(
        "id, content_idea_id, final_post, buyer_belief_shift, proof_notes, risk_notes, cta_intent, format_recommendation, qa_result, source_context_used, status, edit_note, approved_at, published_at, created_at",
      )
      .eq("client_id", clientId)
      .eq("id", postId)
      .is("deleted_at", null)
      .maybeSingle<ReviewPostRow>(),
    supabase
      .from("clients")
      .select("name, founder_name")
      .eq("id", clientId)
      .is("deleted_at", null)
      .maybeSingle<ClientIdentityRow>(),
  ]);

  if (error) {
    return { ok: false, code: "DATABASE_ERROR", message: "Failed to load post." };
  }
  if (!row) {
    return { ok: false, code: "NOT_FOUND", message: "Post not found." };
  }

  const client: ReviewPostClient = {
    name: clientRow?.name ?? "Client Workspace",
    founderName: clientRow?.founder_name ?? null,
  };

  let idea: ReviewPostIdea | null = null;
  if (row.content_idea_id) {
    const { data: ideaRow, error: ideaError } = await supabase
      .from("content_ideas")
      .select("id, angle, source_type")
      .eq("client_id", clientId)
      .eq("id", row.content_idea_id)
      .maybeSingle<ContentIdeaRow>();

    if (!ideaError && ideaRow) {
      idea = {
        id: ideaRow.id,
        angle: ideaRow.angle,
        sourceType: ideaRow.source_type,
      };
    }
  }

  const split = splitPost(row.final_post);

  return {
    ok: true,
    client,
    post: {
      id: row.id,
      contentIdeaId: row.content_idea_id,
      finalPost: row.final_post,
      hook: split.hook,
      body: split.body,
      buyerBeliefShift: row.buyer_belief_shift,
      proofNotes: row.proof_notes,
      riskNotes: row.risk_notes,
      ctaIntent: row.cta_intent,
      formatRecommendation: parseFormatRecommendation(
        row.format_recommendation,
      ),
      qaWarnings: warningsFromQaResult(row.qa_result),
      sourceContextUsed: row.source_context_used,
      status: row.status,
      editNote: row.edit_note,
      approvedAt: row.approved_at,
      publishedAt: row.published_at,
      createdAt: row.created_at,
      idea,
    },
  };
}
