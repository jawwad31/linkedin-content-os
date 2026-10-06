import "server-only";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { canAccessClient, canDraftPosts } from "@/lib/access/client-access";
import { writeAuditLog } from "@/lib/audit/log";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/session";

import {
  ALLOCATION_BUCKETS,
  FUNNEL_STAGES,
  POST_TYPES,
  SOURCE_MODES,
} from "@/lib/ai/playbooks/taxonomies";
import {
  applyStrategyOverrides,
  GENERATION_PLAN_VERSION,
  strategyOverridesSchema,
  type GenerationPlanV2,
} from "@/lib/ai/playbooks/contracts";
import {
  reserveSourceEntry,
  commitSourceUsage,
  releaseSourceReservation,
} from "@/features/content-bank/usage-service";
import {
  produceReviewedPost,
  getBusinessContext,
  getApprovedPlanningResources,
  isCommentGateEligible,
  type ContentIdeaRow,
} from "./service";
import type { ContentAgentSourceContext } from "@/features/posts/agents/content-agent";

export const standaloneDraftInputSchema = z.object({
  sourceType: z.enum(SOURCE_MODES).default("founder_experience"),
  sourceId: z.string().uuid().optional().nullable(),
  allocationBucket: z.enum(ALLOCATION_BUCKETS).default("experience"),
  postType: z.enum(POST_TYPES).default("framework"),
  funnelStage: z.enum(FUNNEL_STAGES).default("Depth"),
  intendedReader: z.string().trim().max(500).optional().nullable(),
  primaryTakeaway: z.string().trim().max(700).optional().nullable(),
  contentPillar: z.string().trim().max(500).optional().nullable(),
  angle: z.string().trim().min(3).max(500).optional().nullable(),
  customNotes: z.string().trim().max(4000).optional().nullable(),
  strategyOverrides: strategyOverridesSchema.optional(),
});

export type StandaloneDraftInput = z.infer<typeof standaloneDraftInputSchema>;

export type StandaloneServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

const AUTH_REQUIRED = {
  ok: false as const,
  code: "AUTH_REQUIRED",
  message: "You must be signed in to continue.",
};

const NO_ACCESS = {
  ok: false as const,
  code: "FORBIDDEN",
  message: "You do not have access to this client.",
};

const WORKFLOW_FORBIDDEN = {
  ok: false as const,
  code: "FORBIDDEN",
  message: "You do not have permission to draft posts.",
};

const INVALID_INPUT = {
  ok: false as const,
  code: "VALIDATION_ERROR",
  message: "Invalid input provided.",
};

const GENERIC_FAILURE = {
  ok: false as const,
  code: "UNKNOWN_ERROR",
  message: "Could not generate post. Please try again.",
};

export async function generateStandalonePost(
  clientId: string,
  rawInput: unknown,
): Promise<StandaloneServiceResult<{ postId: string; ideaId: string; alreadyGenerated?: boolean }>> {
  const { user } = await getServerUser();
  if (!user) return AUTH_REQUIRED;

  const clientIdParsed = z.string().uuid().safeParse(clientId);
  if (!clientIdParsed.success) return INVALID_INPUT;
  const verifiedClientId = clientIdParsed.data;

  const parsed = standaloneDraftInputSchema.safeParse(rawInput);
  if (!parsed.success) return INVALID_INPUT;
  const input = parsed.data;

  const hasAccess = await canAccessClient(user.id, verifiedClientId);
  if (!hasAccess) return NO_ACCESS;

  const canDraft = await canDraftPosts(user.id, verifiedClientId);
  if (!canDraft) return WORKFLOW_FORBIDDEN;

  const admin = createAdminClient();
  const [businessContext, resources, commentGateEligible] = await Promise.all([
    getBusinessContext(admin, verifiedClientId),
    getApprovedPlanningResources(admin, verifiedClientId),
    isCommentGateEligible(admin, verifiedClientId),
  ]);

  if (!businessContext) return NO_ACCESS;

  // 1. Source Resolution & Reservation
  let reservationId: string | null = null;
  let sourceContext: ContentAgentSourceContext;
  const angle = input.angle ?? "Strategic insight for operators";

  if (input.sourceType === "founder_experience" && input.sourceId) {
    const reservation = await reserveSourceEntry(
      {
        clientId: verifiedClientId,
        sourceId: input.sourceId,
        sourceType: "founder_experience",
        channel: "linkedin_post",
        angle,
        takeaway: input.primaryTakeaway,
      },
      admin,
    );

    if (!reservation.ok) {
      return {
        ok: false,
        code: reservation.code,
        message: reservation.error,
      };
    }
    reservationId = reservation.usageId;

    const { data: exp } = await admin
      .from("founder_experiences")
      .select("*")
      .eq("id", input.sourceId)
      .eq("client_id", verifiedClientId)
      .single();

    sourceContext = {
      sourceType: "founder_experience",
      sourceIds: [input.sourceId],
      sourceTitle: exp?.title ?? "Founder Experience",
      source: exp ?? {},
      sourceArticles: [],
    };
  } else if (input.sourceType === "content_resource" && input.sourceId) {
    const reservation = await reserveSourceEntry(
      {
        clientId: verifiedClientId,
        sourceId: input.sourceId,
        sourceType: "content_resource",
        channel: "linkedin_post",
        angle,
        takeaway: input.primaryTakeaway,
      },
      admin,
    );

    if (!reservation.ok) {
      return {
        ok: false,
        code: reservation.code,
        message: reservation.error,
      };
    }
    reservationId = reservation.usageId;

    const { data: res } = await admin
      .from("content_resources")
      .select("*")
      .eq("id", input.sourceId)
      .eq("client_id", verifiedClientId)
      .single();

    sourceContext = {
      sourceType: "content_resource",
      sourceIds: [input.sourceId],
      sourceTitle: res?.title ?? "Resource",
      source: res ?? {},
      sourceArticles: [],
      selectedResource: res ?? null,
    };
  } else if (input.sourceType === "profile_led") {
    // Strictly educational draft derived from personal & business profile context
    sourceContext = {
      sourceType: "profile_led",
      sourceIds: [],
      sourceTitle: "Profile Principles & Frameworks",
      source: {
        principles: businessContext.principles,
        personalPositioning: businessContext.personalPositioning,
        contentPillars: businessContext.contentPillars,
        roleAndWork: businessContext.roleAndWork,
      },
      sourceArticles: [],
    };
  } else if (input.sourceType === "custom_upload") {
    // Uploaded supporting notes or document
    sourceContext = {
      sourceType: "custom_upload",
      sourceIds: input.sourceId ? [input.sourceId] : [],
      sourceTitle: "Custom Supporting Document",
      source: {
        customNotes: input.customNotes ?? "",
      },
      sourceArticles: [],
    };
  } else {
    // Trend card / research brief or generic
    sourceContext = {
      sourceType: input.sourceType,
      sourceIds: input.sourceId ? [input.sourceId] : [],
      sourceTitle: "External Research & Signal",
      source: {
        notes: input.customNotes ?? "",
      },
      sourceArticles: [],
    };
  }

  // 2. Build GenerationPlanV2 with Editorial Controls
  const basePlan: GenerationPlanV2 = {
    sourceMode: input.sourceType,
    strategy: {
      targetIcp: input.intendedReader ?? businessContext.primaryIcp ?? "Relevant operators and practitioners",
      currentBelief: "Common industry assumption",
      desiredBelief: input.primaryTakeaway ?? "Sharper operational perspective",
      coreArgument: angle,
      primarySourceAnchor: angle,
      proofToUse: [],
      angleType: "diagnostic",
      riskNotes: [],
      readiness: "ready",
    },
    execution: {
      contentArchetype: input.sourceType === "content_resource" ? "resource_post" : "framework_post",
      postStructure: "comprehensive_breakdown",
      bodyFramework: "mistake_lesson",
      hookType: "declarative_pov",
      ctaType: input.sourceType === "content_resource" ? "comment_gate" : "none",
      argumentOutline: [
        "Explain the operating friction or tension.",
        "Break down the actionable mechanism.",
        "Conclude with the clear takeaway.",
      ],
      resourceId: input.sourceType === "content_resource" ? input.sourceId ?? null : null,
    },
    editorial: {
      allocationBucket: input.allocationBucket,
      postType: input.postType,
      funnelStage: input.funnelStage,
      intendedReader: input.intendedReader ?? undefined,
      primaryTakeaway: input.primaryTakeaway ?? undefined,
      contentPillar: input.contentPillar ?? undefined,
    },
    safety: {
      allowedClaims: [],
      claimBoundaries: [
        "Do not invent facts outside supplied context.",
        input.sourceType === "profile_led"
          ? "No invented founder experience or client metrics."
          : "Keep factual claims grounded in the source.",
      ],
    },
  };

  const finalPlan = input.strategyOverrides
    ? applyStrategyOverrides(basePlan, input.strategyOverrides)
    : basePlan;

  // 3. Create Backing Idea to preserve "One Active Post Per Idea" Invariant
  const supabase = await createClient();
  const { data: backingIdea, error: ideaError } = await supabase
    .from("content_ideas")
    .insert({
      client_id: verifiedClientId,
      source_type: input.sourceType,
      source_ids_json: input.sourceId ? [input.sourceId] : [],
      angle,
      buyer_pain: input.intendedReader ? `Friction experienced by ${input.intendedReader}` : null,
      commercial_relevance: input.primaryTakeaway ?? null,
      content_pillar: input.contentPillar ?? null,
      belief_shift: `${finalPlan.strategy.currentBelief} -> ${finalPlan.strategy.desiredBelief}`,
      generation_plan: finalPlan,
      generation_plan_version: GENERATION_PLAN_VERSION,
      allocation_bucket: input.allocationBucket,
      post_type: input.postType,
      funnel_stage: input.funnelStage,
      intended_reader: input.intendedReader ?? null,
      primary_takeaway: input.primaryTakeaway ?? null,
      status: "ready",
    })
    .select("id, client_id, source_type, source_ids_json, angle, buyer_pain, commercial_relevance, content_pillar, belief_shift, angle_boundary, source_context, proof_notes, founder_direction, generation_plan, generation_plan_version, generation_plan_input_hash, strategy_overrides, selected_resource_id, status")
    .single<ContentIdeaRow>();

  if (ideaError || !backingIdea) {
    if (reservationId) {
      await releaseSourceReservation({ clientId: verifiedClientId, usageId: reservationId }, admin);
    }
    return GENERIC_FAILURE;
  }

  // 4. Draft the Post
  const drafted = await produceReviewedPost({
    clientId: verifiedClientId,
    userId: user.id,
    businessContext,
    idea: backingIdea,
    sourceContext,
    resources,
    commentGateEligible,
  });

  if (!drafted.ok) {
    if (reservationId) {
      await releaseSourceReservation({ clientId: verifiedClientId, usageId: reservationId }, admin);
    }
    return drafted.failure;
  }

  // 5. Insert Post into Database
  const { data: insertedPost, error: insertError } = await supabase
    .from("posts")
    .insert({
      client_id: verifiedClientId,
      content_idea_id: backingIdea.id,
      final_post: drafted.values.finalPost,
      buyer_belief_shift: drafted.values.buyerBeliefShift,
      proof_notes: drafted.values.proofNotes,
      risk_notes: drafted.values.riskNotes,
      cta_intent: drafted.values.ctaIntent,
      qa_result: drafted.values.qaResult,
      format_recommendation: drafted.values.formatRecommendation,
      source_context_used: drafted.values.sourceContextUsed,
      allocation_bucket: input.allocationBucket,
      post_type: input.postType,
      funnel_stage: input.funnelStage,
      intended_reader: input.intendedReader ?? null,
      primary_takeaway: input.primaryTakeaway ?? null,
      content_pillar: input.contentPillar ?? null,
      brief_overrides: input.strategyOverrides ?? {},
      draft_version: 1,
      approved_draft_version: null,
      status: "review",
    })
    .select("id")
    .single<{ id: string }>();

  if (insertError || !insertedPost) {
    if (reservationId) {
      await releaseSourceReservation({ clientId: verifiedClientId, usageId: reservationId }, admin);
    }
    return GENERIC_FAILURE;
  }

  // 6. Commit Source Usage Reservation
  if (reservationId) {
    await commitSourceUsage(
      {
        usageId: reservationId,
        clientId: verifiedClientId,
        postId: insertedPost.id,
      },
      admin,
    );
  }

  // 7. Mark Idea Used
  await admin
    .from("content_ideas")
    .update({ status: "used" })
    .eq("id", backingIdea.id)
    .eq("client_id", verifiedClientId);

  // 8. Audit Log
  await writeAuditLog({
    clientId: verifiedClientId,
    userId: user.id,
    action: "standalone_post_generated",
    entityType: "post",
    entityId: insertedPost.id,
    metadata: {
      post_id: insertedPost.id,
      idea_id: backingIdea.id,
      source_type: input.sourceType,
      allocation_bucket: input.allocationBucket,
      funnel_stage: input.funnelStage,
      post_type: input.postType,
      intended_reader: input.intendedReader,
    },
  });

  revalidatePath(`/client/${verifiedClientId}/posts`);
  revalidatePath(`/client/${verifiedClientId}/ideas`);
  revalidatePath(`/client/${verifiedClientId}/dashboard`);

  return {
    ok: true,
    data: {
      postId: insertedPost.id,
      ideaId: backingIdea.id,
      alreadyGenerated: false,
    },
  };
}
