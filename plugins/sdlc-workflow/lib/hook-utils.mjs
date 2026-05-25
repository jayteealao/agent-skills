import { existsSync } from 'node:fs';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export function projectRootFromInput(input = {}) {
  return input.cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
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

export function isProjectContextMarkdownPath(filePath) {
  const normalized = normalizePathForMatch(filePath);
  return (
    /(?:^|\/)(PRODUCT|DESIGN)\.md$/.test(normalized) ||
    /(?:^|\/)\.ai\/ship-plan\.md$/.test(normalized)
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
  return null;
}

export function isManagedArtifactMarkdownPath(filePath) {
  const normalized = normalizePathForMatch(filePath);
  return (
    /(?:^|\/)\.ai\/workflows\/[^/]+\/.+\.md$/.test(normalized) ||
    /(?:^|\/)\.ai\/simplify\/.+\.md$/.test(normalized) ||
    /(?:^|\/)\.ai\/profiles\/.+\/.+\.md$/.test(normalized) ||
    isDocsIndexMarkdownPath(normalized) ||
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

export function stringifyField(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.join('; ');
  if (typeof value === 'object') return Object.entries(value).map(([key, val]) => `${key}: ${val}`).join(', ');
  return String(value);
}

export async function currentGitBranch(projectRoot) {
  try {
    const { stdout } = await execFileAsync('git', ['-C', projectRoot, 'branch', '--show-current'], {
      windowsHide: true,
      timeout: 2000,
    });
    return stdout.trim();
  } catch {
    return '';
  }
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
