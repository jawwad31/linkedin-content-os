import { z } from "zod";
import {
  apiFailure,
  apiSuccess,
  statusForErrorCode,
} from "@/lib/errors/api-response";
import { enforceRateLimit } from "@/lib/rate-limit/server";
import {
  createResearchPosts,
  reviewWebFinding,
  runWebResearch,
  saveWebResearchSettings,
} from "@/features/research/web-research/service";

export const maxDuration = 300;
export async function POST(
  request: Request,
  { params }: { params: Promise<{ client_id: string }> },
) {
  const { client_id: clientId } = await params;
  const limited = await enforceRateLimit(request, {
    action: "web-research",
    clientId,
    limit: 12,
  });
  if (limited) return limited;
  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > 20_000) throw new Error();
    body = JSON.parse(text);
  } catch {
    return apiFailure(
      "VALIDATION_ERROR",
      "Check the research request and try again.",
    );
  }
  const parsed = z
    .object({
      action: z.enum(["save", "run", "review", "create_posts"]),
      input: z.unknown(),
    })
    .strict()
    .safeParse(body);
  if (!parsed.success)
    return apiFailure(
      "VALIDATION_ERROR",
      "Check the research request and try again.",
    );
  const input = parsed.data.input;
  try {
    const result =
      parsed.data.action === "save"
        ? await saveWebResearchSettings(clientId, input)
        : parsed.data.action === "run"
          ? await runWebResearch(clientId, input)
          : parsed.data.action === "review"
            ? await reviewWebFinding(clientId, input)
            : await createResearchPosts(clientId, input);
    return result.ok
      ? apiSuccess(result.data)
      : apiFailure(
          result.code,
          result.message,
          statusForErrorCode(result.code),
        );
  } catch {
    return apiFailure(
      "UNKNOWN_ERROR",
      "Could not complete this research action. Please try again.",
      500,
    );
  }
}
