"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerUser } from "@/lib/supabase/session";
import {
  canDraftPosts,
  canManageIdeas,
  canReviewPosts,
  canPublishPosts,
  canAccessClient,
} from "@/lib/access/client-access";
import { getBusinessContext } from "@/features/posts/generate/service";
import { retrieveScopedExcerpts } from "@/features/documents/retrieval-service";
import { buildContextManifest } from "@/features/documents/context-builder";
import {
  editionInputSchema,
  sourceSelectionSchema,
  validateSourceArrangement,
  exportEdition,
  exportEditionHtml,
  hasPrivateEvidenceLink,
  type EditionInput,
  type NewsletterSource,
} from "./contracts";
import { draftNewsletter, planNewsletter, reviewNewsletter } from "./agent";

export async function exportNewsletter(
  clientId: string,
  editionId: string,
  revision: number,
): Promise<
  { ok: true; text: string; html: string } | { ok: false; message: string }
> {
  const { user } = await getServerUser();
  if (
    !user ||
    ![clientId, editionId].every(
      (v) => z.string().uuid().safeParse(v).success,
    ) ||
    !z.number().int().positive().safeParse(revision).success ||
    !(await canAccessClient(user.id, clientId))
  )
    return { ok: false, message: "This approved edition is unavailable." };
  const db = await createClient();
  const { data, error } = await db.rpc("read_approved_newsletter", {
    p_client: clientId,
    p_edition: editionId,
    p_revision: revision,
  });
  if (error || !data?.ok)
    return {
      ok: false,
      message:
        "The edition changed or is no longer approved. Refresh before copying.",
    };
  const parsed = editionInputSchema.safeParse(data.payload);
  if (!parsed.success)
    return { ok: false, message: "This approved edition is unavailable." };
  const text = exportEdition(parsed.data);
  if (hasPrivateEvidenceLink(text))
    return {
      ok: false,
      message:
        "Remove private evidence links before export, then rerun QA and approval.",
    };
  return { ok: true, text, html: exportEditionHtml(parsed.data) };
}

type Result =
  { ok: true; id: string; revision: number } | { ok: false; message: string };
function failure(): Result {
  return {
    ok: false,
    message:
      "Could not complete this action. Check permissions, source eligibility and the current edition version, then refresh and try again.",
  };
}
async function refresh(clientId: string) {
  revalidatePath(`/client/${clientId}/newsletter`);
  revalidatePath(`/client/${clientId}/content-bank`);
}
export async function saveNewsletter(
  clientId: string,
  editionId: string | null,
  expected: number | null,
  requestKey: string,
  input: unknown,
  selections: unknown,
): Promise<Result> {
  const { user } = await getServerUser();
  const payload = editionInputSchema.safeParse(input);
  const sources = z
    .array(sourceSelectionSchema)
    .min(1)
    .max(8)
    .safeParse(selections);
  if (
    !user ||
    !z.string().uuid().safeParse(clientId).success ||
    !z.string().uuid().safeParse(requestKey).success ||
    !payload.success ||
    !sources.success ||
    !validateSourceArrangement(payload.data, sources.data) ||
    !(await canDraftPosts(user.id, clientId)) ||
    (!editionId && !(await canManageIdeas(user.id, clientId)))
  )
    return failure();
  if (
    editionId &&
    (!z.string().uuid().safeParse(editionId).success ||
      !z.number().int().positive().safeParse(expected).success)
  )
    return failure();
  try {
    const db = await createClient();
    const { data, error } = await db.rpc("save_newsletter_edition", {
      p_client: clientId,
      p_edition: editionId,
      p_expected: expected,
      p_request: requestKey,
      p_payload: payload.data,
      p_sources: sources.data,
    });
    if (error || !data?.ok) return failure();
    await refresh(clientId);
    return { ok: true, id: data.id, revision: data.revision };
  } catch {
    return failure();
  }
}
export async function transitionNewsletter(
  clientId: string,
  editionId: string,
  expected: number,
  action: "confirm_outline" | "approve" | "reject" | "publish" | "archive",
  publication?: { url: string; date: string },
): Promise<Result> {
  const { user } = await getServerUser();
  if (
    !user ||
    !z.string().uuid().safeParse(clientId).success ||
    !z.string().uuid().safeParse(editionId).success ||
    !z.number().int().positive().safeParse(expected).success ||
    !["confirm_outline", "approve", "reject", "publish", "archive"].includes(
      action,
    )
  )
    return failure();
  const allowed =
    action === "publish"
      ? await canPublishPosts(user.id, clientId)
      : ["approve", "reject"].includes(action)
        ? await canReviewPosts(user.id, clientId)
        : await canDraftPosts(user.id, clientId);
  if (!allowed) return failure();
  if (action === "publish") {
    const parsed = z
      .object({
        url: z
          .string()
          .url()
          .max(2048)
          .refine((v) => {
            const url = new URL(v);
            return (
              url.protocol === "https:" &&
              ["linkedin.com", "www.linkedin.com"].includes(url.hostname) &&
              !url.username &&
              !url.password
            );
          }),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .safeParse(publication);
    if (!parsed.success) return failure();
  }
  try {
    const db = await createClient();
    const { data, error } = await db.rpc("transition_newsletter_edition", {
      p_client: clientId,
      p_edition: editionId,
      p_expected: expected,
      p_action: action,
      p_url: publication?.url ?? null,
      p_date: publication?.date ?? null,
    });
    if (error || !data?.ok) return failure();
    await refresh(clientId);
    return { ok: true, id: data.id, revision: data.revision };
  } catch {
    return failure();
  }
}
/**
 * Runs one stage of the newsletter workflow on the saved version:
 * plan (propose the outline), draft (write the article, then check it) or qa (check it again).
 * Each stage is one paid attempt that is claimed first and released if anything fails.
 */
export async function generateNewsletter(
  clientId: string,
  editionId: string,
  expected: number,
  requestKey: string,
  mode: "plan" | "draft" | "qa",
): Promise<Result> {
  const { user } = await getServerUser();
  if (
    !user ||
    !["plan", "draft", "qa"].includes(mode) ||
    ![clientId, editionId, requestKey].every(
      (v) => z.string().uuid().safeParse(v).success,
    ) ||
    !z.number().int().positive().safeParse(expected).success ||
    !(await canDraftPosts(user.id, clientId))
  )
    return failure();
  const db = createAdminClient();
  const { data: claim, error: claimError } = await db.rpc(
    "begin_newsletter_attempt",
    {
      p_client: clientId,
      p_edition: editionId,
      p_actor: user.id,
      p_expected: expected,
      p_request: requestKey,
      p_mode: mode,
    },
  );
  if (claimError || !claim?.ok) return failure();
  let completed = false;
  try {
    const [v, s, profile] = await Promise.all([
      db
        .from("newsletter_versions")
        .select("payload")
        .eq("client_id", clientId)
        .eq("edition_id", editionId)
        .eq("revision", expected)
        .single(),
      db
        .from("newsletter_sources")
        .select("source_id,source_type,snapshot,content_hash,usage_id")
        .eq("client_id", clientId)
        .eq("edition_id", editionId)
        .returns<NewsletterSource[]>(),
      getBusinessContext(db, clientId),
    ]);
    if (v.error || s.error || !profile) return failure();
    const parsed = editionInputSchema.safeParse(v.data.payload);
    if (!parsed.success) return failure();
    const payload = parsed.data;
    const excerpts = await retrieveScopedExcerpts(
      {
        clientId,
        purpose: "profile_reference",
        query: `${payload.title} ${payload.reader}`,
        maxResults: 4,
      },
      db,
    );
    const agentInput = {
      clientId,
      userId: user.id,
      payload,
      sources: s.data ?? [],
      profile,
      excerpts,
    };
    let result: EditionInput = payload;
    let qa: unknown = null;
    if (mode === "plan") {
      const planned = await planNewsletter(agentInput);
      if (!planned.ok) return { ok: false, message: planned.message };
      result = planned.payload;
    } else if (mode === "draft") {
      const drafted = await draftNewsletter(agentInput);
      if (!drafted.ok) return { ok: false, message: drafted.message };
      result = drafted.payload;
      qa = await reviewNewsletter({ ...agentInput, payload: result });
    } else {
      if (!payload.article?.trim())
        return { ok: false, message: "There is no draft to check yet." };
      qa = await reviewNewsletter(agentInput);
    }
    const evidence = {
      ...buildContextManifest({
        profileRevision: profile.profileRevision ?? 1,
        sourceIds: agentInput.sources.map((source) => ({
          id: source.source_id,
          type: source.source_type,
        })),
        playbookVersion: "newsletter-v2",
        retrievedSections: excerpts,
      }),
      stage: mode,
      sourceHashes: agentInput.sources.map((source) => ({
        id: source.source_id,
        hash: source.content_hash,
      })),
    };
    const { data, error } = await db.rpc("finish_newsletter_attempt", {
      p_client: clientId,
      p_attempt: claim.attempt,
      p_token: claim.token,
      p_payload: result,
      p_qa: qa,
      p_evidence: evidence,
    });
    if (error || !data?.ok) return failure();
    completed = true;
    await refresh(clientId);
    return { ok: true, id: data.id, revision: data.revision };
  } catch {
    return failure();
  } finally {
    if (!completed)
      await db.rpc("finish_newsletter_attempt", {
        p_client: clientId,
        p_attempt: claim.attempt,
        p_token: claim.token,
        p_payload: null,
        p_qa: null,
        p_evidence: null,
      });
  }
}
