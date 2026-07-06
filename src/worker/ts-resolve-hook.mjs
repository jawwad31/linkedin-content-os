import { statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const WORKER_DIR = path.dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = path.join(WORKER_DIR, "..");
const SERVER_ONLY_STUB = pathToFileURL(
  path.join(WORKER_DIR, "server-only-stub.mjs"),
).href;

const EXTENSIONS = [".ts", ".tsx", ".mjs", ".js", ".json"];

function isFile(candidate) {
  try {
    return statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function resolveFile(basePath) {
  if (isFile(basePath)) return basePath;

  for (const ext of EXTENSIONS) {
    const candidate = `${basePath}${ext}`;
    if (isFile(candidate)) return candidate;
  }

  for (const ext of EXTENSIONS) {
    const candidate = path.join(basePath, `index${ext}`);
    if (isFile(candidate)) return candidate;
  }

  return null;
}

/**
 * Minimal Node ESM resolve hook so the worker entry point can run under
 * plain `node` (native TypeScript type-stripping, no bundler) while reusing
 * the project's existing "@/..." aliased and extension-less relative
 * imports exactly as written throughout src/ — no new dependency (no tsx,
 * no ts-node). Bare package specifiers (zod, @supabase/supabase-js,
 * fast-xml-parser, etc.) are left untouched and fall through to Node's
 * normal node_modules resolution.
 */
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") {
    return { url: SERVER_ONLY_STUB, shortCircuit: true };
  }

  if (specifier.startsWith("@/")) {
    const target = path.join(SRC_ROOT, specifier.slice(2));
    const resolved = resolveFile(target);
    if (resolved) {
      return { url: pathToFileURL(resolved).href, shortCircuit: true };
    }
  }

  if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    context.parentURL?.startsWith("file://")
  ) {
    const parentDir = path.dirname(fileURLToPath(context.parentURL));
    const target = path.join(parentDir, specifier);
    const resolved = resolveFile(target);
    if (resolved) {
      return { url: pathToFileURL(resolved).href, shortCircuit: true };
    }
  }

  return nextResolve(specifier, context);
}
