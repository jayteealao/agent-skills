import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SCHEMA_PATH = resolve(__dirname, '..', 'schemas', 'sdlc-config.schema.json');

export const DEFAULT_SDLC_CONFIG = Object.freeze({
  // How the write-time checks act: `strict` refuses a write that fails a gate,
  // `warn` lets it stand and shows the same reason as a warning, and `off` runs
  // no check. The lints only warn, in `strict` and `warn` alike.
  checks: 'strict',
  // Semantic leak guards (HOOKS-SEMANTIC Phase 1): scan outward-facing text —
  // git commit/tag messages, gh pr/release titles+bodies, public-doc writes —
  // for internal workflow vocabulary, using the lexicon derived from
  // skills/wf/reference/_output-boundary.md. Default OFF and advisory-first:
  // 'advisory' emits a systemMessage, 'enforce' denies the tool call. Promote
  // to enforce only after the advisory false-positive rate proves ~0 across
  // real workflows (the graduation gate).
  semantic: {
    enabled: false,
    mode: 'advisory',
  },
  // Agent memory-file seeding (MEMORY-SEED-PLAN): when seedRules is true
  // (default), each SessionStart in an sdlc-engaged repo (one with .ai/workflows/)
  // ensures a small, versioned, fenced `/wf` rules block in AGENTS.md (canonical;
  // read by Codex natively and by Claude via an `@AGENTS.md` import added to
  // CLAUDE.md). The plugin owns only the fenced region and never edits outside it.
  // Set false to disable seeding entirely.
  memory: {
    seedRules: true,
  },
  // Knowledge-compounding corpus (INTENT-FIDELITY W12 meta-loop). `.ai/solutions/`
  // is the per-repo corpus (feedback-loops W1). `globalDir` optionally points plan's
  // reuse scan at a USER-LEVEL corpus read alongside it, and gives retro a place to
  // promote a repo lesson (always user-confirmed) + append about-the-workflow lessons
  // to a `plugin-feedback.md`. null = disabled (no global corpus); the dir stays local,
  // never synced by the plugin (repo lessons can carry project specifics).
  solutions: {
    globalDir: null,
  },
});

const configValidators = new Map();   // schemaPath → compiled validator

export function configPathFor(projectRoot = process.cwd()) {
  return join(projectRoot, '.ai', 'sdlc-config.json');
}

function clone(value) {
  return structuredClone(value);
}

/** Settings that no release reads now, as dotted paths. The loader drops each one, with one warning. */
export const RETIRED_CONFIG_KEYS = Object.freeze(['campaign', 'hooks', 'view', 'yolo.usageBudget']);

/** The checks mode of a loaded config: `strict`, `warn` or `off`. */
export const CHECKS_MODES = Object.freeze(['strict', 'warn', 'off']);
export function checksModeOf(config) {
  return CHECKS_MODES.includes(config?.checks) ? config.checks : 'strict';
}

/** The user config without the retired settings, and the paths it dropped. */
export function withoutRetiredKeys(userConfig, retired = RETIRED_CONFIG_KEYS) {
  if (!userConfig || typeof userConfig !== 'object' || Array.isArray(userConfig)) return { config: userConfig, dropped: [] };
  const config = clone(userConfig);
  const dropped = [];
  for (const key of retired) {
    const parts = key.split('.');
    let parent = config;
    for (const part of parts.slice(0, -1)) parent = parent && typeof parent === 'object' ? parent[part] : undefined;
    const last = parts.at(-1);
    if (parent && typeof parent === 'object' && Object.hasOwn(parent, last)) {
      delete parent[last];
      dropped.push(key);
    }
  }
  return { config, dropped };
}

export function deepMerge(base, override) {
  if (!override || typeof override !== 'object' || Array.isArray(override)) {
    return clone(base);
  }

  const out = clone(base);
  for (const [key, value] of Object.entries(override)) {
    if (key === '$schema') {
      out[key] = value;
    } else if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      out[key] &&
      typeof out[key] === 'object' &&
      !Array.isArray(out[key])
    ) {
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
  const schema = JSON.parse(await readFile(schemaPath, 'utf-8'));
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  configValidators.set(schemaPath, validate);
  return validate;
}

export async function validateConfig(config, { schemaPath = DEFAULT_SCHEMA_PATH } = {}) {
  const validate = await ensureConfigValidator(schemaPath);
  const valid = validate(config);
  return {
    valid,
    errors: valid ? [] : (validate.errors ?? []).map((err) => ({
      path: err.instancePath || '/',
      message: err.message ?? 'schema violation',
      keyword: err.keyword,
    })),
  };
}

export async function loadConfigWithMeta(projectRoot = process.cwd(), {
  configPath = configPathFor(projectRoot),
  schemaPath = DEFAULT_SCHEMA_PATH,
  strict = false,
} = {}) {
  const warnings = [];
  let userConfig = {};
  let exists = existsSync(configPath);

  if (exists) {
    try {
      const text = await readFile(configPath, 'utf-8');
      userConfig = JSON.parse(text.replace(/^\uFEFF/, ''));
    } catch (err) {
      if (strict) throw err;
      warnings.push(`could not parse ${configPath}: ${err.message}`);
      userConfig = {};
    }
  }

  const retired = withoutRetiredKeys(userConfig);
  if (retired.dropped.length > 0) {
    warnings.push(`${configPath}: these settings are no longer read and are ignored: ${retired.dropped.join(', ')}`);
  }
  const config = deepMerge(DEFAULT_SDLC_CONFIG, retired.config);
  const validation = await validateConfig(config, { schemaPath });
  if (!validation.valid) {
    const message = validation.errors.map((err) => `${err.path}: ${err.message}`).join('; ');
    if (strict) throw new Error(`invalid sdlc config: ${message}`);
    warnings.push(`invalid sdlc config: ${message}`);
  }

  return {
    config,
    configPath,
    exists,
    warnings,
    validation,
  };
}

export async function loadConfig(projectRoot = process.cwd(), opts = {}) {
  return (await loadConfigWithMeta(projectRoot, opts)).config;
}

export function configHash(config) {
  return createHash('sha256')
    .update(stableStringify(config))
    .digest('hex')
    .slice(0, 16);
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => (
    `${JSON.stringify(key)}:${stableStringify(value[key])}`
  )).join(',')}}`;
}
