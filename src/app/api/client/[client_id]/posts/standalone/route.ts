import { prepareStandaloneBrief } from "@/features/posts/generate/standalone-brief-service";
import { apiFailure, apiSuccess, statusForErrorCode } from "@/lib/errors/api-response";
import { enforceRateLimit, RATE_LIMIT_WINDOW_MS } from "@/lib/rate-limit/server";

export async function POST(request: Request, { params }: { params: Promise<{ client_id: string }> }) {
  const { client_id: clientId } = await params;
  const limited = await enforceRateLimit(request, {
    action: "standalone-brief", clientId, limit: 5, windowMs: RATE_LIMIT_WINDOW_MS,
  });
  if (limited) return limited;
  try {
    // JSON escaping can expand a 128 KB source. Bound the actual stream as well
    // as declared lengths; absent/forged Content-Length is not an exception.
    const reader = request.body?.getReader();
    if (!reader) return apiFailure("VALIDATION_ERROR", "Add a source and post brief.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 800_000) {
        await reader.cancel();
        return apiFailure("VALIDATION_ERROR", "The source file is too large.", 413);
      }
      chunks.push(chunk.value);
    }
    let body: unknown;
    try {
      body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
    } catch {
      return apiFailure("VALIDATION_ERROR", "Check the source and post brief.");
    }
    const result = await prepareStandaloneBrief(clientId, body);
    return result.ok ? apiSuccess(result.data)
      : apiFailure(result.code, result.message, statusForErrorCode(result.code));
  } catch {
    return apiFailure("UNKNOWN_ERROR", "Could not save the post brief. Please try again.", 500);
  }
}
