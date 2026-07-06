import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  resolveProjectRoot
} from "./chunk-UTP6CBAZ.mjs";

// lib/hook-utils.mjs
import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
var execFileAsync = promisify(execFile);
function projectRootFromInput(input = {}) {
  return resolveProjectRoot(input.cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd());
}
function outputSystemMessage(message) {
  process.stdout.write(`${JSON.stringify({ systemMessage: message })}
`);
}
function collectToolInputPaths(input = {}) {
  const toolInput = input.tool_input ?? {};
  const out = [];
  if (typeof toolInput.file_path === "string") out.push(toolInput.file_path);
  if (typeof toolInput.notebook_path === "string") out.push(toolInput.notebook_path);
  if (Array.isArray(toolInput.edits)) {
    for (const edit of toolInput.edits) {
      if (typeof edit?.file_path === "string") out.push(edit.file_path);
    }
  }
  return [...new Set(out)];
}
function normalizePathForMatch(path) {
  return String(path ?? "").replace(/\\/g, "/");
}
function resolveProjectPath(projectRoot, path) {
  if (!path) return null;
  return resolve(projectRoot, path);
}
function workflowPathInfo(filePath) {
  const normalized = normalizePathForMatch(filePath);
  const match = normalized.match(/(?:^|\/)\.ai\/workflows\/([^/]+)\/(.+)$/);
  if (!match) return null;
  return {
    slug: match[1],
    storageRel: match[2],
    filename: match[2].split("/").at(-1),
    workflowsRoot: normalized.slice(0, match.index) + normalized.slice(match.index).replace(/\/?\.ai\/workflows\/[^/]+\/.+$/, "/.ai/workflows")
  };
}
function isWorkflowMarkdownPath(filePath) {
  const normalized = normalizePathForMatch(filePath);
  return /(?:^|\/)\.ai\/workflows\/[^/]+\/.+\.md$/.test(normalized);
}
function isProseLogPath(filePath) {
  const normalized = normalizePathForMatch(filePath);
  return /(?:^|\/)\.ai\/workflows\/[^/]+\/po-answers\.md$/.test(normalized);
}
function isProjectContextMarkdownPath(filePath) {
  const normalized = normalizePathForMatch(filePath);
  return /(?:^|\/)(PRODUCT|DESIGN)\.md$/.test(normalized) || /(?:^|\/)\.ai\/ship-plan\.md$/.test(normalized);
}
function projectContextPathInfo(filePath) {
  const normalized = normalizePathForMatch(filePath);
  if (/(?:^|\/)PRODUCT\.md$/.test(normalized)) {
    return { filename: "PRODUCT.md", expectedType: "project-context" };
  }
  if (/(?:^|\/)DESIGN\.md$/.test(normalized)) {
    return { filename: "DESIGN.md", expectedType: "project-context" };
  }
  if (/(?:^|\/)\.ai\/ship-plan\.md$/.test(normalized)) {
    return { filename: "ship-plan.md", expectedType: "ship-plan" };
  }
  return null;
}
function isManagedArtifactMarkdownPath(filePath) {
  const normalized = normalizePathForMatch(filePath);
  return /(?:^|\/)\.ai\/workflows\/[^/]+\/.+\.md$/.test(normalized) || /(?:^|\/)\.ai\/simplify\/.+\.md$/.test(normalized) || /(?:^|\/)\.ai\/profiles\/.+\/.+\.md$/.test(normalized) || /(?:^|\/)\.ai\/docs\/[^/]+\/.+\.md$/.test(normalized) || // Solutions corpus: category files only (type: solution). The category
  // subdir requirement keeps the frontmatter-less .ai/solutions/INDEX.md
  // exempt, same as the workflows registry INDEX.md.
  /(?:^|\/)\.ai\/solutions\/[^/]+\/.+\.md$/.test(normalized) || isProjectContextMarkdownPath(normalized);
}
function isInsideWorkflowArtifacts(filePath) {
  return /(?:^|\/)\.ai\/workflows\//.test(normalizePathForMatch(filePath));
}
function hasFrontmatterFence(content) {
  return /^---\r?\n/.test(String(content ?? ""));
}
function formatList(items) {
  return items.map((item, index) => `  ${index + 1}. ${item}`).join("\n");
}
async function gitAdd(projectRoot, filePath) {
  try {
    await execFileAsync("git", ["-C", projectRoot, "add", filePath], {
      windowsHide: true,
      timeout: 5e3
    });
    return true;
  } catch {
    return false;
  }
}
async function readTextIfExists(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    return await readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}

// lib/stdin.mjs
async function readStdin() {
  let text = "";
  process.stdin.setEncoding("utf-8");
  for await (const chunk of process.stdin) {
    text += chunk;
  }
  return text;
}
async function readStdinJson({ emptyValue = {} } = {}) {
  const text = (await readStdin()).trim();
  if (!text) return emptyValue;
  try {
    return JSON.parse(text);
  } catch (err) {
    err.message = `invalid hook JSON on stdin: ${err.message}`;
    throw err;
  }
}

export {
  projectRootFromInput,
  outputSystemMessage,
  collectToolInputPaths,
  normalizePathForMatch,
  resolveProjectPath,
  workflowPathInfo,
  isWorkflowMarkdownPath,
  isProseLogPath,
  isProjectContextMarkdownPath,
  projectContextPathInfo,
  isManagedArtifactMarkdownPath,
  isInsideWorkflowArtifacts,
  hasFrontmatterFence,
  formatList,
  gitAdd,
  readTextIfExists,
  readStdinJson
};
