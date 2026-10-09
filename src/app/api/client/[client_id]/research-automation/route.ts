import { z } from "zod";
import {
  apiFailure,
  apiSuccess,
  statusForErrorCode,
} from "@/lib/errors/api-response";
import { enforceRateLimit } from "@/lib/rate-limit/server";
import { manageAutomation } from "@/features/research/automation/service";
export const maxDuration = 300;
export async function POST(
  request: Request,
  { params }: { params: Promise<{ client_id: string }> },
) {
  const { client_id: clientId } = await params;
  const limited = await enforceRateLimit(request, {
    action: "research-automation",
    clientId,
    limit: 12,
  });
  if (limited) return limited;
  try {
    const text = await request.text();
    if (text.length > 8000)
      return apiFailure("VALIDATION_ERROR", "Check your research request.");
    const parsed = z
      .object({ action: z.enum(["schedule", "source"]), input: z.unknown() })
      .strict()
      .safeParse(JSON.parse(text));
    if (!parsed.success)
      return apiFailure("VALIDATION_ERROR", "Check your research request.");
    const result = await manageAutomation(
      clientId,
      parsed.data.action,
      parsed.data.input,
    );
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
      "Could not complete this research action.",
      500,
    );
  }
}
