import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);

// lib/hook-utils.mjs
import { existsSync as existsSync2 } from "node:fs";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { dirname as dirname2, join as join2, resolve as resolve2 } from "node:path";
import { promisify } from "node:util";

// lib/project-root.mjs
import { execFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
var WALK_CAP = 200;
function gitToplevel(dir) {
  try {
    const out = execFileSync("git", ["-C", dir, "rev-parse", "--show-toplevel"], {
      encoding: "utf-8",
      windowsHide: true,
      timeout: 2e3,
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}
function canon(p) {
  try {
    return realpathSync.native(p);
  } catch {
    return resolve(p);
  }
}
function sameDir(a, b) {
  if (process.platform === "win32") return a.toLowerCase() === b.toLowerCase();
  return a === b;
}
function ownsWorkflowStore(dir) {
  return existsSync(join(dir, ".ai", "workflows"));
}
function resolveProjectRoot(startDir = process.cwd()) {
  const start = canon(startDir);
  if (ownsWorkflowStore(start)) return start;
  const top = gitToplevel(start);
  if (!top) return start;
  const topCanon = canon(top);
  let dir = start;
  for (let i = 0; i < WALK_CAP; i++) {
    if (ownsWorkflowStore(dir)) return dir;
    if (sameDir(dir, topCanon)) break;
    const parent = dirname(dir);
    if (sameDir(parent, dir)) break;
    dir = parent;
  }
  return topCanon;
}

// lib/hook-utils.mjs
var execFileAsync = promisify(execFile);
function projectRootFromInput(input = {}) {
  return resolveProjectRoot(input.cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd());
}
var systemMessageBuffer = null;
function beginSystemMessages() {
  systemMessageBuffer = [];
}
function outputSystemMessage(message) {
  if (systemMessageBuffer) {
    systemMessageBuffer.push(message);
    return;
  }
  process.stdout.write(`${JSON.stringify({ systemMessage: message })}
`);
}
function flushSystemMessages() {
  if (!systemMessageBuffer) return;
  const messages = systemMessageBuffer;
  systemMessageBuffer = null;
  if (!messages.length) return;
  process.stdout.write(`${JSON.stringify({ systemMessage: messages.join("\n\n") })}
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
  return resolve2(projectRoot, path);
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
  return /(?:^|\/)\.ai\/workflows\/[^/]+\/(?:po-answers|steer|commentary)\.md$/.test(normalized);
}
var EVIDENCE_DIRS = Object.freeze(["probe-evidence", "verify-evidence"]);
function isEvidencePath(filePath) {
  const normalized = normalizePathForMatch(filePath);
  return /(?:^|\/)\.ai\/workflows\/[^/]+\/(?:probe-evidence|verify-evidence)\//.test(normalized);
}
var SOURCE_DIRS = Object.freeze(["research", "references"]);
function isBrainstormSourcePath(filePath) {
  const normalized = normalizePathForMatch(filePath);
  return /(?:^|\/)\.ai\/workflows\/[^/]+\/(?:research|references)\//.test(normalized);
}
var WORK_DIR = "work";
function isWorkSetPath(filePath) {
  return /(?:^|\/)\.ai\/workflows\/[^/]+\/work\//.test(normalizePathForMatch(filePath));
}
function isPacketPath(filePath) {
  const m = normalizePathForMatch(filePath).match(/(?:^|\/)\.ai\/workflows\/[^/]+\/work\/([^/]+\.md)$/);
  return Boolean(m) && !["index.md", "changes.md", "migration.md"].includes(m[1]);
}
function isWorkSetFreeFormPath(filePath) {
  const normalized = normalizePathForMatch(filePath);
  return /(?:^|\/)\.ai\/workflows\/[^/]+\/work\/(?:changes\.md$|migration\.md$|[^/]+\/)/.test(normalized);
}
function isHistorySnapshotPath(filePath) {
  return /(?:^|\/)\.ai\/workflows\/[^/]+\/history\//.test(normalizePathForMatch(filePath));
}
function isDesignBoardsPath(filePath) {
  return /(?:^|\/)\.ai\/workflows\/[^/]+\/design\//.test(normalizePathForMatch(filePath));
}
function isFreeFormWorkflowPath(filePath) {
  return isEvidencePath(filePath) || isBrainstormSourcePath(filePath) || isWorkSetFreeFormPath(filePath) || isHistorySnapshotPath(filePath) || isDesignBoardsPath(filePath);
}
function isProjectContextMarkdownPath(filePath) {
  const normalized = normalizePathForMatch(filePath);
  return /(?:^|\/)(PRODUCT|DESIGN)\.md$/.test(normalized) || /(?:^|\/)\.ai\/ship-plan\.md$/.test(normalized) || // Project-root observability artifacts: .ai/observability.md (type:
  // observability-plan) and .ai/observability-build.md (type:
  // observability-build), authored/realized by /wf project observability. The optional
  // -build keeps .ai/observability-audit.md OUT — that ledger is kind-keyed
  // (kind: observability-audit, no sdlc/v1 type) and must not be schema-gated.
  // Added in v9.132.0 (OBSERVABILITY-ROUTER-PLAN).
  /(?:^|\/)\.ai\/observability(?:-build)?\.md$/.test(normalized) || // The design record (design/record.md): .ai/design/current.md (type:
  // design-current) and .ai/design/direction.md (type: design-direction).
  /(?:^|\/)\.ai\/design\/(?:current|direction)\.md$/.test(normalized);
}
function isShipPlanAuditPath(filePath) {
  const normalized = normalizePathForMatch(filePath);
  return /(?:^|\/)\.ai\/ship-plan-audit\.md$/.test(normalized);
}
function isBrainstormBoardPath(filePath) {
  const normalized = normalizePathForMatch(filePath);
  return /(?:^|\/)\.ai\/workflows\/[^/]+\/(?:brainstorm-board(?:-[a-z0-9-]+)?|ideate-work)\.json$/.test(normalized);
}
function isPrototypeLedgerPath(filePath) {
  const normalized = normalizePathForMatch(filePath);
  return /(?:^|\/)\.ai\/workflows\/[^/]+\/prototype-ledger\.json$/.test(normalized);
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
  if (/(?:^|\/)\.ai\/observability\.md$/.test(normalized)) {
    return { filename: "observability.md", expectedType: "observability-plan" };
  }
  if (/(?:^|\/)\.ai\/observability-build\.md$/.test(normalized)) {
    return { filename: "observability-build.md", expectedType: "observability-build" };
  }
  if (/(?:^|\/)\.ai\/design\/current\.md$/.test(normalized)) {
    return { filename: "current.md", expectedType: "design-current" };
  }
  if (/(?:^|\/)\.ai\/design\/direction\.md$/.test(normalized)) {
    return { filename: "direction.md", expectedType: "design-direction" };
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
  if (!existsSync2(filePath)) return null;
  try {
    return await readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}

export {
  projectRootFromInput,
  beginSystemMessages,
  outputSystemMessage,
  flushSystemMessages,
  collectToolInputPaths,
  normalizePathForMatch,
  resolveProjectPath,
  workflowPathInfo,
  isWorkflowMarkdownPath,
  isProseLogPath,
  EVIDENCE_DIRS,
  SOURCE_DIRS,
  WORK_DIR,
  isWorkSetPath,
  isPacketPath,
  isFreeFormWorkflowPath,
  isProjectContextMarkdownPath,
  isShipPlanAuditPath,
  isBrainstormBoardPath,
  isPrototypeLedgerPath,
  projectContextPathInfo,
  isManagedArtifactMarkdownPath,
  isInsideWorkflowArtifacts,
  hasFrontmatterFence,
  formatList,
  gitAdd,
  readTextIfExists
};
