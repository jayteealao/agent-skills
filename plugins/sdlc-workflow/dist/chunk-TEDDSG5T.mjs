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
  // How the write-time checks act: `strict` refuses a write that fails a gate,
  // `warn` lets it stand and shows the same reason as a warning, and `off` runs
  // no check. The lints only warn, in `strict` and `warn` alike.
  checks: "strict",
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
var RETIRED_CONFIG_KEYS = Object.freeze(["campaign", "hooks", "view", "yolo.usageBudget"]);
var CHECKS_MODES = Object.freeze(["strict", "warn", "off"]);
function checksModeOf(config) {
  return CHECKS_MODES.includes(config?.checks) ? config.checks : "strict";
}
function withoutRetiredKeys(userConfig, retired = RETIRED_CONFIG_KEYS) {
  if (!userConfig || typeof userConfig !== "object" || Array.isArray(userConfig)) return { config: userConfig, dropped: [] };
  const config = clone(userConfig);
  const dropped = [];
  for (const key of retired) {
    const parts = key.split(".");
    let parent = config;
    for (const part of parts.slice(0, -1)) parent = parent && typeof parent === "object" ? parent[part] : void 0;
    const last = parts.at(-1);
    if (parent && typeof parent === "object" && Object.hasOwn(parent, last)) {
      delete parent[last];
      dropped.push(key);
    }
  }
  return { config, dropped };
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
  const retired = withoutRetiredKeys(userConfig);
  if (retired.dropped.length > 0) {
    warnings.push(`${configPath}: these settings are no longer read and are ignored: ${retired.dropped.join(", ")}`);
  }
  const config = deepMerge(DEFAULT_SDLC_CONFIG, retired.config);
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
  checksModeOf,
  loadConfig,
  readStdinJson
};
