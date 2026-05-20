// renderers/_validator.mjs
// Wrap ajv to validate merged frontmatter against tests/frontmatter.schema.json.
// Failure surfaces as a warn-banner — the renderer never aborts on a bad
// frontmatter (best-effort HTML still emits).

import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

let ajv = null;
let validators = new Map();

function ensureAjv(schemaPath) {
  if (ajv) return ajv;
  ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    allowUnionTypes: true,
    validateSchema: false,
  });
  addFormats(ajv);
  const root = JSON.parse(readFileSync(schemaPath, 'utf-8'));
  ajv.addSchema(root, root.$id ?? 'frontmatter');
  return ajv;
}

/**
 * Pick the branch of `oneOf` keyed by `type:`. The schema's top-level shape
 * is { oneOf: [<each *Frontmatter>] } where each branch declares a const type.
 * Returning the resolved sub-schema lets us validate the *specific* artifact
 * shape rather than the generic union.
 */
function pickBranch(rootSchema, type) {
  const branches = rootSchema?.oneOf ?? [];
  for (const branch of branches) {
    if (branch.properties?.type?.const === type) return branch;
  }
  // Some schemas register branches under $defs and reference them in oneOf via $ref.
  for (const branch of branches) {
    if (!branch.$ref) continue;
    const refName = branch.$ref.replace(/^#\/\$defs\//, '');
    const resolved = rootSchema.$defs?.[refName];
    if (resolved?.properties?.type?.const === type) return resolved;
  }
  return null;
}

/**
 * Validate merged frontmatter. Returns { valid, errors } where errors is
 * normalised to `[{ path, message }]`. When no branch matches the `type:`,
 * returns `valid: true` with a single warning so unknown types don't block
 * rendering (Check 6 reports the missing renderer separately).
 */
export function validateFrontmatter(frontmatter, schemaPath) {
  if (!frontmatter || typeof frontmatter !== 'object') {
    return { valid: false, errors: [{ path: '', message: 'frontmatter is missing or not an object' }] };
  }
  const type = frontmatter.type;
  if (!type) {
    return { valid: false, errors: [{ path: '/type', message: 'frontmatter has no `type:` field' }] };
  }

  ensureAjv(schemaPath);
  const cacheKey = `${schemaPath}::${type}`;
  let validate = validators.get(cacheKey);
  if (!validate) {
    const root = JSON.parse(readFileSync(schemaPath, 'utf-8'));
    const branch = pickBranch(root, type);
    if (!branch) {
      return { valid: true, errors: [], warning: `no schema branch for type: ${type}` };
    }
    validate = ajv.compile(branch);
    validators.set(cacheKey, validate);
  }

  const ok = validate(frontmatter);
  if (ok) return { valid: true, errors: [] };
  return {
    valid: false,
    errors: (validate.errors ?? []).map((e) => ({
      path:    e.instancePath || e.schemaPath,
      message: e.message ?? 'schema violation',
    })),
  };
}

/**
 * Render a warn-banner snippet listing schema errors. Used by _shell.mjs when
 * the validator returned `valid: false`.
 */
export function renderWarnBanner(errors, kind = 'schema') {
  if (!errors || errors.length === 0) return '';
  const items = errors
    .slice(0, 8)
    .map((e) => `<li><code>${escapeHtml(e.path || '/')}</code> — ${escapeHtml(e.message)}</li>`)
    .join('');
  const overflow = errors.length > 8 ? `<li>… and ${errors.length - 8} more</li>` : '';
  return `<aside class="warn-banner" role="status"><strong>${escapeHtml(kind)} warnings</strong><ul>${items}${overflow}</ul></aside>`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export { escapeHtml };
