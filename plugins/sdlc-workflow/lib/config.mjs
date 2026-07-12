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
  view: {
    render: {
      concurrency: 4,
      debounceMs: 2000,
    },
    // NOTE: there is deliberately no `serve` block here. Serve/daemon settings
    // (host, port, liveReload, tailscale, and the perRepoServe master switch)
    // are MACHINE-WIDE only and live in ~/.sdlc/hub-config.json — a repo cannot
    // set them. `view.serve` is rejected by the per-repo schema. See §6.1.
    bootstrap: {
      enabled: true,
      renderMissing: true,
      renderStale: true,
    },
    // Per-repo participation toggle for the machine-wide multi-repo hub
    // (default-on / opt-out since v9.34.0). The ONLY per-repo hub field — all
    // singleton hub settings live in ~/.sdlc/hub-config.json (§6.1).
    hub: {
      enabled: true,
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
    //   'inline' — the legacy path: the hook spawns `render-sunflower` itself
    //              (2s debounce). The rollback / A-B switch.
    renderDispatch: 'hub',
    // When 'hub' dispatch is active and no daemon is answering, the write hook
    // makes a best-effort detached attempt to start the hub (the queued change
    // renders at the hub's startup catch-up). Set false to never auto-start.
    ensureHubOnWrite: true,
    // Render queue tuning (RENDER-DISPATCH-PLAN). maxPending is a hard backstop;
    // coalescing by bucket normally bounds the queue well below it.
    renderQueue: {
      maxPending: 500,
    },
  },
  hooks: {
    autoStage: true,
    validateOnWrite: true,
    verifyOnWrite: true,
    // When true, post-write-verify BLOCKS a rich-tier .md written without its
    // mandatory sibling .yaml (and nudges on a missing .html.fragment). Opt out
    // globally here, or per-artifact with `fragment: none` in its frontmatter.
    remindMissingFragments: true,
    // When true, post-write-verify validates a present sibling .yaml against
    // siblingYamlSchemas.<type> and BLOCKS on a schema violation — but only for
    // types whose schema has been reconciled to the live authoring convention
    // (see SIBLING_YAML_VALIDATED_TYPES in hooks/post-write-verify.mjs). Set
    // false to disable while other type schemas are still being reconciled.
    validateSiblingYaml: true,
    // When true, post-write-verify HARD-BLOCKS a `verify` artifact whose
    // frontmatter contradicts a passing result: `result: pass` with
    // metric-acceptance-met < metric-acceptance-total, or `result: pass` with
    // interactive-verification: deferred. These are false-positive-free
    // cross-field checks (a true pass meets every AC and defers none). Set false
    // to disable the result gate (AC-VERIFIABILITY recommendations R7).
    verifyResultGate: true,
    // When true, post-write-verify WARNS (non-blocking) on shadow-deferral
    // vocabulary in a `verify` body that co-occurs with `result: pass`
    // ("deferred to user/manual", "UNVERIFIED-INTERACTIVE", "will be verified
    // during <slice>", "decidable by static reasoning"). Heuristic, so it warns
    // rather than blocks. Set false to silence the prose-deferral lint.
    verifyDeferralLint: true,
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
});

const configValidators = new Map();   // schemaPath → compiled validator

export function configPathFor(projectRoot = process.cwd()) {
  return join(projectRoot, '.ai', 'sdlc-config.json');
}

function clone(value) {
  return structuredClone(value);
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

  const config = deepMerge(DEFAULT_SDLC_CONFIG, userConfig);
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
