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
    serve: {
      enabled: true,
      host: '127.0.0.1',
      port: 4173,
      liveReload: true,
      tailscale: {
        enabled: false,
        mode: 'serve',
        path: '/',
        https: true,
        acknowledgedPublic: false,
      },
    },
    bootstrap: {
      enabled: true,
      renderMissing: true,
      renderStale: true,
    },
    // Per-repo opt-in to the machine-wide multi-repo hub. The ONLY per-repo hub
    // field — all singleton hub settings live in ~/.sdlc/hub-config.json (§6.1).
    hub: {
      enabled: true,
    },
  },
  hooks: {
    autoStage: true,
    validateOnWrite: true,
    verifyOnWrite: true,
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
