import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  require__,
  require_dist
} from "./chunk-DS4JUPRY.mjs";
import {
  __toESM
} from "./chunk-ZGVOYTOL.mjs";

// lib/config.mjs
var import__ = __toESM(require__(), 1);
var import_ajv_formats = __toESM(require_dist(), 1);
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
var __dirname = dirname(fileURLToPath(import.meta.url));
var DEFAULT_SCHEMA_PATH = resolve(__dirname, "..", "schemas", "sdlc-config.schema.json");
var DEFAULT_SDLC_CONFIG = Object.freeze({
  view: {
    render: {
      concurrency: 4,
      debounceMs: 2e3
    },
    // NOTE: there is deliberately no `serve` block here. Serve/daemon settings
    // (host, port, liveReload, tailscale, and the perRepoServe master switch)
    // are MACHINE-WIDE only and live in ~/.sdlc/hub-config.json — a repo cannot
    // set them. `view.serve` is rejected by the per-repo schema. See §6.1.
    bootstrap: {
      enabled: true,
      renderMissing: true,
      renderStale: true
    },
    // Per-repo participation toggle for the machine-wide multi-repo hub
    // (default-on / opt-out since v9.34.0). The ONLY per-repo hub field — all
    // singleton hub settings live in ~/.sdlc/hub-config.json (§6.1).
    hub: {
      enabled: true
    },
    // Free narrative fragments (Tier 2, v9.70.0): any artifact may ship N
    // `<stem>.<label>.html.fragment` siblings of UNRESTRICTED raw HTML, injected
    // raw-inline below the page body. Default-on; set false to suppress them
    // repo-wide (e.g. if an unrestricted fragment's global CSS/JS breaks a page
    // and you want to render without it while fixing the fragment).
    narrativeFragments: true,
    // CSS containment for free narrative fragments (v9.71.0): default-on. Each
    // fragment's `<style>` rules are wrapped in `@scope (.nfrag[data-label=…])`
    // so a global selector can't bleed to the page or sibling fragments. Set
    // false to inject `<style>` verbatim/unscoped (the pre-9.71.0 behaviour).
    scopeNarrativeCss: true,
    // Where a managed-artifact write gets rendered (RENDER-DISPATCH-PLAN):
    //   'hub'    — the hook ENQUEUES the change to a durable per-repo render
    //              queue (.ai/_view/.render-queue/) and the serving daemon
    //              drains + renders it through the shared bounded engine. No
    //              short-lived per-write renderer; one renderer (the daemon)
    //              keeps .last-render identity consistent across hosts.
    //   'inline' — DEPRECATED in 9.154.0, removed in the next release (W11.9):
    //              the hook spawns `render-sunflower` itself (2s debounce). A
    //              session that sets it logs one deprecated-config line.
    renderDispatch: "hub",
    // When 'hub' dispatch is active and no daemon is answering, the write hook
    // makes a best-effort detached attempt to start the hub (the queued change
    // renders at the hub's startup catch-up). Set false to never auto-start.
    ensureHubOnWrite: true,
    // Render queue tuning (RENDER-DISPATCH-PLAN). maxPending is a hard backstop;
    // coalescing by bucket normally bounds the queue well below it.
    renderQueue: {
      maxPending: 500
    }
  },
  hooks: {
    autoStage: true,
    // When true, the Stop hook appends the turn's exact token usage (copied from
    // the host transcript) to .ai/workflows/<slug>/cost.jsonl. Never blocks.
    // WIDE-VIEW-REPAIR-PLAN §10.
    costLedger: true,
    validateOnWrite: true,
    verifyOnWrite: true,
    // When true, post-write-verify BLOCKS a review, review-command, or plan .md
    // written without its sibling .yaml, which later stages read. Opt out
    // globally here, or per-artifact with `fragment: none` in its frontmatter.
    remindMissingFragments: true,
    // When true, post-write-verify validates a present sibling .yaml against
    // siblingYamlSchemas.<type> and BLOCKS on a schema violation — but only for
    // types whose schema has been reconciled to the live authoring convention
    // (see SIBLING_YAML_VALIDATED_TYPES in hooks/post-write-verify.mjs). Set
    // false to disable while other type schemas are still being reconciled.
    validateSiblingYaml: true,
    // When true, post-write-verify WARNS (never blocks) when 00-index.md is over
    // 20 KB, carries YAML comment prose, or has current-stage past its first
    // 4,000 characters. ARTIFACT-SPLIT-PLAN S4.
    indexLint: true,
    // When true, post-write-verify HARD-BLOCKS a `verify` artifact whose
    // frontmatter contradicts a passing result: `result: pass` with
    // metric-acceptance-met < metric-acceptance-total, or `result: pass` with
    // interactive-verification: deferred. These are false-positive-free
    // cross-field checks (a true pass meets every AC and defers none). Set false
    // to disable the result gate (AC-VERIFIABILITY recommendations R7).
    verifyResultGate: true,
    // When true, post-write-verify HARD-BLOCKS a `.ai/ship-plan-audit.md` write
    // that finalizes the ledger without triage: an open BLOCKER/HIGH finding with
    // no `triage: accept` while `triage-status` is not `complete` or
    // `awaiting-user` with `awaiting-since` equal to `last-run` (ship-plan/audit.md
    // Step 5; the awaiting escape lasts one run). Under Codex the Stop hook
    // re-checks the same gate, so a turn cannot end on an untriaged ledger.
    shipPlanAuditTriageGate: true,
    // When true, pre-write-validate REFUSES a `04-plan*.md` write while the
    // workflow needs design (`ux-impact` visual/flow/new-surface, or a legacy
    // `02b-design.md`) and the design is not settled: no `02c-craft.md` with a
    // resolved `image-gate` and `direction-confirmed-by`, and no
    // `progress.design: skipped` + `design-skip-reason`. The design lane's human
    // rule (skills/wf/reference/design/_lane.md; lib/design-lane.mjs).
    designDirectionGate: true,
    // When true, post-write-verify WARNS (non-blocking) on shadow-deferral
    // vocabulary in a `verify` body that co-occurs with `result: pass`
    // ("deferred to user/manual", "UNVERIFIED-INTERACTIVE", "will be verified
    // during <slice>", "decidable by static reasoning"). Heuristic, so it warns
    // rather than blocks. Set false to silence the prose-deferral lint.
    verifyDeferralLint: true
  },
  // Semantic leak guards (HOOKS-SEMANTIC Phase 1): scan outward-facing text —
  // git commit/tag messages, gh pr/release titles+bodies, public-doc writes —
  // for internal workflow vocabulary, using the lexicon derived from
  // skills/wf/reference/_output-boundary.md. Default OFF and advisory-first:
  // 'advisory' emits a systemMessage, 'enforce' denies the tool call. Promote
  // to enforce only after the advisory false-positive rate proves ~0 across
  // real workflows (the graduation gate).
  semantic: {
    enabled: false,
    mode: "advisory"
  },
  // Agent memory-file seeding (MEMORY-SEED-PLAN): when seedRules is true
  // (default), each SessionStart in an sdlc-engaged repo (one with .ai/workflows/)
  // ensures a small, versioned, fenced `/wf` rules block in AGENTS.md (canonical;
  // read by Codex natively and by Claude via an `@AGENTS.md` import added to
  // CLAUDE.md). The plugin owns only the fenced region and never edits outside it.
  // Set false to disable seeding entirely.
  memory: {
    seedRules: true
  },
  // Knowledge-compounding corpus (INTENT-FIDELITY W12 meta-loop). `.ai/solutions/`
  // is the per-repo corpus (feedback-loops W1). `globalDir` optionally points plan's
  // reuse scan at a USER-LEVEL corpus read alongside it, and gives retro a place to
  // promote a repo lesson (always user-confirmed) + append about-the-workflow lessons
  // to a `plugin-feedback.md`. null = disabled (no global corpus); the dir stays local,
  // never synced by the plugin (repo lessons can carry project specifics).
  solutions: {
    globalDir: null
  }
});
var configValidators = /* @__PURE__ */ new Map();
function configPathFor(projectRoot = process.cwd()) {
  return join(projectRoot, ".ai", "sdlc-config.json");
}
function clone(value) {
  return structuredClone(value);
}
function deepMerge(base, override) {
  if (!override || typeof override !== "object" || Array.isArray(override)) {
    return clone(base);
  }
  const out = clone(base);
  for (const [key, value] of Object.entries(override)) {
    if (key === "$schema") {
      out[key] = value;
    } else if (value && typeof value === "object" && !Array.isArray(value) && out[key] && typeof out[key] === "object" && !Array.isArray(out[key])) {
      out[key] = deepMerge(out[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}
async function ensureConfigValidator(schemaPath = DEFAULT_SCHEMA_PATH) {
  const cached = configValidators.get(schemaPath);
  if (cached) return cached;
  const schema = JSON.parse(await readFile(schemaPath, "utf-8"));
  const ajv = new import__.default({ allErrors: true, strict: false });
  (0, import_ajv_formats.default)(ajv);
  const validate = ajv.compile(schema);
  configValidators.set(schemaPath, validate);
  return validate;
}
async function validateConfig(config, { schemaPath = DEFAULT_SCHEMA_PATH } = {}) {
  const validate = await ensureConfigValidator(schemaPath);
  const valid = validate(config);
  return {
    valid,
    errors: valid ? [] : (validate.errors ?? []).map((err) => ({
      path: err.instancePath || "/",
      message: err.message ?? "schema violation",
      keyword: err.keyword
    }))
  };
}
async function loadConfigWithMeta(projectRoot = process.cwd(), {
  configPath = configPathFor(projectRoot),
  schemaPath = DEFAULT_SCHEMA_PATH,
  strict = false
} = {}) {
  const warnings = [];
  let userConfig = {};
  let exists = existsSync(configPath);
  if (exists) {
    try {
      const text = await readFile(configPath, "utf-8");
      userConfig = JSON.parse(text.replace(/^\uFEFF/, ""));
    } catch (err) {
      if (strict) throw err;
      warnings.push(`could not parse ${configPath}: ${err.message}`);
      userConfig = {};
    }
  }
  const config = deepMerge(DEFAULT_SDLC_CONFIG, userConfig);
  const validation = await validateConfig(config, { schemaPath });
  if (!validation.valid) {
    const message = validation.errors.map((err) => `${err.path}: ${err.message}`).join("; ");
    if (strict) throw new Error(`invalid sdlc config: ${message}`);
    warnings.push(`invalid sdlc config: ${message}`);
  }
  return {
    config,
    configPath,
    exists,
    warnings,
    validation
  };
}
async function loadConfig(projectRoot = process.cwd(), opts = {}) {
  return (await loadConfigWithMeta(projectRoot, opts)).config;
}

// lib/hook-utils.mjs
import { existsSync as existsSync3 } from "node:fs";
import { appendFile, mkdir, readFile as readFile2 } from "node:fs/promises";
import { execFile } from "node:child_process";
import { dirname as dirname3, join as join3, resolve as resolve3 } from "node:path";
import { promisify } from "node:util";

// lib/project-root.mjs
import { execFileSync } from "node:child_process";
import { existsSync as existsSync2, realpathSync } from "node:fs";
import { dirname as dirname2, join as join2, resolve as resolve2 } from "node:path";
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
    return resolve2(p);
  }
}
function sameDir(a, b) {
  if (process.platform === "win32") return a.toLowerCase() === b.toLowerCase();
  return a === b;
}
function ownsWorkflowStore(dir) {
  return existsSync2(join2(dir, ".ai", "workflows"));
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
    const parent = dirname2(dir);
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
  return resolve3(projectRoot, path);
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
  if (!existsSync3(filePath)) return null;
  try {
    return await readFile2(filePath, "utf-8");
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
function normalizeHookPayload(input) {
  if (!input || typeof input !== "object") return input;
  const aliases = [
    ["toolInput", "tool_input"],
    ["toolName", "tool_name"],
    ["hookEventName", "hook_event_name"]
  ];
  for (const [camel, snake] of aliases) {
    if (input[snake] === void 0 && input[camel] !== void 0) {
      input[snake] = input[camel];
    }
  }
  return input;
}
var INVALID_JSON_HEX_BYTES = 200;
function describeInvalidJson(text, err, { bytes = INVALID_JSON_HEX_BYTES } = {}) {
  const buf = Buffer.from(String(text ?? ""), "utf-8");
  const head = buf.subarray(0, bytes).toString("hex");
  return `invalid hook JSON on stdin: ${err?.message ?? err}; ${buf.length} bytes; first ${Math.min(bytes, buf.length)} bytes hex: ${head}`;
}
async function readStdinJson({ emptyValue = {} } = {}) {
  const text = (await readStdin()).trim();
  if (!text) return emptyValue;
  try {
    return normalizeHookPayload(JSON.parse(text));
  } catch (err) {
    err.message = describeInvalidJson(text, err);
    throw err;
  }
}

export {
  loadConfig,
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
  readTextIfExists,
  readStdinJson
};
