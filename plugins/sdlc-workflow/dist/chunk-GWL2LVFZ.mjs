import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);

// lib/error-log.mjs
import { mkdir, appendFile, stat, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
var MAX_LOG_BYTES = 1024 * 1024;
function hookErrorLogPath(projectRoot = process.cwd()) {
  return join(projectRoot, ".ai", "_view", ".hook-errors.log");
}
async function rotateIfLarge(logPath) {
  try {
    if ((await stat(logPath)).size > MAX_LOG_BYTES) {
      await rename(logPath, `${logPath}.1`);
    }
  } catch {
  }
}
async function logError(label, err, {
  projectRoot = process.cwd(),
  context = {},
  logPath = hookErrorLogPath(projectRoot)
} = {}) {
  await mkdir(dirname(logPath), { recursive: true });
  await rotateIfLarge(logPath);
  const record = {
    at: (/* @__PURE__ */ new Date()).toISOString(),
    label,
    message: err?.message ?? String(err),
    stack: err?.stack ?? null,
    context
  };
  try {
    await appendFile(logPath, `${JSON.stringify(record)}
`, "utf-8");
  } catch (e) {
    try {
      process.stderr.write(`[error-log] could not write ${logPath}: ${e.message}
`);
    } catch {
    }
  }
}

// lib/hook-utils.mjs
import { existsSync } from "node:fs";
import { appendFile as appendFile2, mkdir as mkdir2, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { dirname as dirname2, join as join2, resolve } from "node:path";
import { promisify } from "node:util";
var execFileAsync = promisify(execFile);
function projectRootFromInput(input = {}) {
  return input.cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
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
  return /(?:^|\/)\.ai\/workflows\/[^/]+\/.+\.md$/.test(normalized) || /(?:^|\/)\.ai\/simplify\/.+\.md$/.test(normalized) || /(?:^|\/)\.ai\/profiles\/.+\/.+\.md$/.test(normalized) || /(?:^|\/)\.ai\/docs\/[^/]+\/.+\.md$/.test(normalized) || isProjectContextMarkdownPath(normalized);
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
function stringifyField(value) {
  if (value === null || value === void 0) return "";
  if (Array.isArray(value)) return value.join("; ");
  if (typeof value === "object") return Object.entries(value).map(([key, val]) => `${key}: ${val}`).join(", ");
  return String(value);
}
async function currentGitBranch(projectRoot) {
  try {
    const { stdout } = await execFileAsync("git", ["-C", projectRoot, "branch", "--show-current"], {
      windowsHide: true,
      timeout: 2e3
    });
    return stdout.trim();
  } catch {
    return "";
  }
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
  logError,
  projectRootFromInput,
  outputSystemMessage,
  collectToolInputPaths,
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
  stringifyField,
  currentGitBranch,
  gitAdd,
  readTextIfExists,
  readStdinJson
};
