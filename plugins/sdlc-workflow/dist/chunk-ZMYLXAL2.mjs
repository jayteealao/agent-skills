import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  require__,
  require_dist
} from "./chunk-FZ2GR6GF.mjs";
import {
  __toESM
} from "./chunk-SGA7NFMW.mjs";

// lib/config.mjs
var import__ = __toESM(require__(), 1);
var import_ajv_formats = __toESM(require_dist(), 1);
import { createHash } from "node:crypto";
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
    //   'inline' — the legacy path: the hook spawns `render-sunflower` itself
    //              (2s debounce). The rollback / A-B switch.
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
    validateSiblingYaml: true
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
function configHash(config) {
  return createHash("sha256").update(stableStringify(config)).digest("hex").slice(0, 16);
}
function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

export {
  configPathFor,
  deepMerge,
  loadConfigWithMeta,
  loadConfig,
  configHash
};
