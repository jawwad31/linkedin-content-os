import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  ALLOWED_PLAYBOOK_FILES,
  PLAYBOOK_MANIFEST,
  SECTIONED_PLAYBOOK_FILES,
  type PlaybookStage,
} from "./manifest";
import type { GenerationPlanV2 } from "./contracts";

const contentCache = new Map<string, Promise<string>>();
const allowedFiles = new Set<string>(ALLOWED_PLAYBOOK_FILES);
const sectionedFiles = new Set<string>(SECTIONED_PLAYBOOK_FILES);

const SECTION_PATTERN =
  /<!-- playbook-section:([a-z0-9_-]+) -->\r?\n([\s\S]*?)\r?\n<!-- \/playbook-section -->/g;

function stripFrontmatter(markdown: string): string {
  return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").trim();
}

export function resolvePlaybookPath(relativePath: string): string {
  if (!allowedFiles.has(relativePath)) {
    throw new Error(`Playbook file is not allowlisted: ${relativePath}`);
  }

  const projectRoot = process.cwd();
  const roots = {
    skills: path.join(projectRoot, ".agents", "skills"),
    resources: path.join(projectRoot, "resources"),
  };
  const absolutePath = relativePath.startsWith(".agents/skills/")
    ? path.resolve(roots.skills, relativePath.slice(".agents/skills/".length))
    : path.resolve(roots.resources, relativePath.slice("resources/".length));
  const expectedRoot = relativePath.startsWith(".agents/skills/")
    ? roots.skills
    : roots.resources;
  const relativeToRoot = path.relative(expectedRoot, absolutePath);

  if (
    relativeToRoot.startsWith("..") ||
    path.isAbsolute(relativeToRoot) ||
    !absolutePath.toLowerCase().endsWith(".md")
  ) {
    throw new Error(`Invalid playbook path: ${relativePath}`);
  }

  return absolutePath;
}

export async function loadPlaybookFile(relativePath: string): Promise<string> {
  const absolutePath = resolvePlaybookPath(relativePath);
  let cached = contentCache.get(absolutePath);

  if (!cached) {
    cached = readFile(absolutePath, "utf8")
      .then(stripFrontmatter)
      .catch((error: unknown) => {
        contentCache.delete(absolutePath);
        const reason = error instanceof Error ? error.message : "unknown error";
        throw new Error(`Required playbook is missing or unreadable: ${relativePath}. ${reason}`);
      });
    contentCache.set(absolutePath, cached);
  }

  return cached;
}

function parseSections(relativePath: string, markdown: string): Map<string, string> {
  const sections = new Map<string, string>();
  for (const match of markdown.matchAll(SECTION_PATTERN)) {
    const id = match[1];
    const body = match[2]?.trim();
    if (!id || !body) continue;
    if (sections.has(id)) {
      throw new Error(`Duplicate playbook section "${id}" in ${relativePath}.`);
    }
    sections.set(id, body);
  }
  return sections;
}

export async function loadPlaybookSections(
  relativePath: string,
  sectionIds: readonly string[],
): Promise<string> {
  if (!sectionedFiles.has(relativePath)) {
    throw new Error(`Playbook file does not support section loading: ${relativePath}`);
  }

  const markdown = await loadPlaybookFile(relativePath);
  const sections = parseSections(relativePath, markdown);
  const uniqueIds = [...new Set(sectionIds)];
  const selected = uniqueIds.map((id) => {
    const body = sections.get(id);
    if (!body) {
      throw new Error(`Required playbook section "${id}" is missing from ${relativePath}.`);
    }
    return `### ${relativePath}#${id}\n\n${body}`;
  });

  return selected.join("\n\n");
}

export async function loadStagePlaybook(stage: PlaybookStage): Promise<string> {
  const files = PLAYBOOK_MANIFEST[stage];
  const sections = await Promise.all(
    files.map(async (file) => `## Playbook source: ${file}\n\n${await loadPlaybookFile(file)}`),
  );

  return sections.join("\n\n---\n\n");
}

async function joinPlaybookParts(parts: Array<Promise<string> | string>) {
  return (await Promise.all(parts)).filter(Boolean).join("\n\n---\n\n");
}

export async function loadPlanningPlaybook(): Promise<string> {
  return joinPlaybookParts([
    loadStagePlaybook("planning"),
    loadPlaybookSections("resources/strategy/post-structures.md", [
      "universal",
      "selection",
    ]),
    loadPlaybookSections("resources/craft/hooks.md", ["universal", "selection"]),
    loadPlaybookSections("resources/craft/body-frameworks.md", [
      "universal",
      "selection",
    ]),
    loadPlaybookSections("resources/craft/cta.md", ["universal", "selection"]),
  ]);
}

function selectedCraftSections(plan: GenerationPlanV2) {
  return [
    loadPlaybookSections("resources/strategy/post-structures.md", [
      "universal",
      plan.execution.postStructure,
    ]),
    loadPlaybookSections("resources/craft/hooks.md", [
      "universal",
      plan.execution.hookType,
    ]),
    loadPlaybookSections("resources/craft/body-frameworks.md", [
      "universal",
      plan.execution.bodyFramework,
    ]),
    loadPlaybookSections("resources/craft/cta.md", [
      "universal",
      plan.execution.ctaType,
    ]),
  ];
}

export async function loadContentPlaybook(plan: GenerationPlanV2): Promise<string> {
  return joinPlaybookParts([
    loadStagePlaybook("content"),
    ...selectedCraftSections(plan),
  ]);
}

export async function loadReviewPlaybook(plan: GenerationPlanV2): Promise<string> {
  return joinPlaybookParts([
    loadStagePlaybook("review"),
    ...selectedCraftSections(plan),
  ]);
}

export async function validatePlaybookManifest(): Promise<void> {
  const files = await Promise.all(
    ALLOWED_PLAYBOOK_FILES.map(async (file) => [file, await loadPlaybookFile(file)] as const),
  );

  for (const [file, markdown] of files) {
    if (!sectionedFiles.has(file)) continue;
    const sections = parseSections(file, markdown);
    if (!sections.has("universal") || !sections.has("selection")) {
      throw new Error(
        `Sectioned playbook ${file} must contain universal and selection sections.`,
      );
    }
  }
}

export function clearPlaybookCacheForTests(): void {
  contentCache.clear();
}
