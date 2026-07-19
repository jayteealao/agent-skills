import { existsSync } from 'node:fs';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';

import { resolveProjectRoot } from './project-root.mjs';

const execFileAsync = promisify(execFile);

// Hook input `cwd` tracks the session's working directory, which can sit in a
// repo subfolder. Resolving it through resolveProjectRoot keeps every consumer
// (config loading, hookLogPath under .ai/_view, bootstrap spawn cwd) anchored
// at the real project root instead of minting stray `.ai/` dirs at the cwd.
export function projectRootFromInput(input = {}) {
  return resolveProjectRoot(input.cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd());
}

export function outputSystemMessage(message) {
  process.stdout.write(`${JSON.stringify({ systemMessage: message })}\n`);
}

export function collectToolInputPaths(input = {}) {
  const toolInput = input.tool_input ?? {};
  const out = [];
  if (typeof toolInput.file_path === 'string') out.push(toolInput.file_path);
  if (typeof toolInput.notebook_path === 'string') out.push(toolInput.notebook_path);
  if (Array.isArray(toolInput.edits)) {
    for (const edit of toolInput.edits) {
      if (typeof edit?.file_path === 'string') out.push(edit.file_path);
    }
  }
  return [...new Set(out)];
}

export function normalizePathForMatch(path) {
  return String(path ?? '').replace(/\\/g, '/');
}

export function resolveProjectPath(projectRoot, path) {
  if (!path) return null;
  return resolve(projectRoot, path);
}

export function workflowPathInfo(filePath) {
  const normalized = normalizePathForMatch(filePath);
  const match = normalized.match(/(?:^|\/)\.ai\/workflows\/([^/]+)\/(.+)$/);
  if (!match) return null;
  return {
    slug: match[1],
    storageRel: match[2],
    filename: match[2].split('/').at(-1),
    workflowsRoot: normalized.slice(0, match.index) + normalized.slice(match.index).replace(/\/?\.ai\/workflows\/[^/]+\/.+$/, '/.ai/workflows'),
  };
}

export function isWorkflowMarkdownPath(filePath) {
  const normalized = normalizePathForMatch(filePath);
  return /(?:^|\/)\.ai\/workflows\/[^/]+\/.+\.md$/.test(normalized);
}

// po-answers.md is the cumulative product-owner Q/A log and steer.md is the
// user-owned standing-steering file: both are frontmatter-less prose that live
// beside a workflow's artifacts. Neither has an sdlc/v1 schema type, so every
// enforcement point must exempt them — the pre-write filename + frontmatter gates
// AND the post-write schema verifier. Centralised here so the carve-out can't
// drift between the two hooks (that exact drift shipped a broken post-write check
// in 9.34.1). steer.md added in 9.120.0 (W6 standing-steering contract).
export function isProseLogPath(filePath) {
  const normalized = normalizePathForMatch(filePath);
  return /(?:^|\/)\.ai\/workflows\/[^/]+\/(?:po-answers|steer)\.md$/.test(normalized);
}

export function isProjectContextMarkdownPath(filePath) {
  const normalized = normalizePathForMatch(filePath);
  return (
    /(?:^|\/)(PRODUCT|DESIGN)\.md$/.test(normalized) ||
    /(?:^|\/)\.ai\/ship-plan\.md$/.test(normalized) ||
    // Project-root observability artifacts: .ai/observability.md (type:
    // observability-plan) and .ai/observability-build.md (type:
    // observability-build), authored/realized by /wf observability. The optional
    // -build keeps .ai/observability-audit.md OUT — that ledger is kind-keyed
    // (kind: observability-audit, no sdlc/v1 type) and must not be schema-gated.
    // Added in v9.132.0 (OBSERVABILITY-ROUTER-PLAN).
    /(?:^|\/)\.ai\/observability(?:-build)?\.md$/.test(normalized)
  );
}

export function isDocsIndexMarkdownPath(filePath) {
  const normalized = normalizePathForMatch(filePath);
  return /(?:^|\/)\.ai\/docs\/[^/]+\/08b-docs-index\.md$/.test(normalized);
}

export function projectContextPathInfo(filePath) {
  const normalized = normalizePathForMatch(filePath);
  if (/(?:^|\/)PRODUCT\.md$/.test(normalized)) {
    return { filename: 'PRODUCT.md', expectedType: 'project-context' };
  }
  if (/(?:^|\/)DESIGN\.md$/.test(normalized)) {
    return { filename: 'DESIGN.md', expectedType: 'project-context' };
  }
  if (/(?:^|\/)\.ai\/ship-plan\.md$/.test(normalized)) {
    return { filename: 'ship-plan.md', expectedType: 'ship-plan' };
  }
  if (/(?:^|\/)\.ai\/observability\.md$/.test(normalized)) {
    return { filename: 'observability.md', expectedType: 'observability-plan' };
  }
  if (/(?:^|\/)\.ai\/observability-build\.md$/.test(normalized)) {
    return { filename: 'observability-build.md', expectedType: 'observability-build' };
  }
  return null;
}

export function isManagedArtifactMarkdownPath(filePath) {
  const normalized = normalizePathForMatch(filePath);
  return (
    /(?:^|\/)\.ai\/workflows\/[^/]+\/.+\.md$/.test(normalized) ||
    /(?:^|\/)\.ai\/simplify\/.+\.md$/.test(normalized) ||
    /(?:^|\/)\.ai\/profiles\/.+\/.+\.md$/.test(normalized) ||
    /(?:^|\/)\.ai\/docs\/[^/]+\/.+\.md$/.test(normalized) ||
    // Solutions corpus: category files only (type: solution). The category
    // subdir requirement keeps the frontmatter-less .ai/solutions/INDEX.md
    // exempt, same as the workflows registry INDEX.md.
    /(?:^|\/)\.ai\/solutions\/[^/]+\/.+\.md$/.test(normalized) ||
    isProjectContextMarkdownPath(normalized)
  );
}

export function isInsideWorkflowArtifacts(filePath) {
  return /(?:^|\/)\.ai\/workflows\//.test(normalizePathForMatch(filePath));
}

export function hasFrontmatterFence(content) {
  return /^---\r?\n/.test(String(content ?? ''));
}

export function formatList(items) {
  return items.map((item, index) => `  ${index + 1}. ${item}`).join('\n');
}

export async function gitAdd(projectRoot, filePath) {
  try {
    await execFileAsync('git', ['-C', projectRoot, 'add', filePath], {
      windowsHide: true,
      timeout: 5000,
    });
    return true;
  } catch {
    return false;
  }
}

export async function readTextIfExists(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    return await readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

export async function appendLine(filePath, line) {
  await mkdir(dirname(filePath), { recursive: true });
  await appendFile(filePath, `${line}\n`, 'utf-8');
}

export function hookLogPath(projectRoot, filename) {
  return join(projectRoot, '.ai', '_view', filename);
}
