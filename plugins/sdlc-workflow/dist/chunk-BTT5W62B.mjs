import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  __toESM,
  require__,
  require_dist
} from "./chunk-KGLQRRIU.mjs";

// renderers/_validator.mjs
var import__ = __toESM(require__(), 1);
var import_ajv_formats = __toESM(require_dist(), 1);
import { readFileSync } from "node:fs";
var ajv = null;
var validators = /* @__PURE__ */ new Map();
function ensureAjv(schemaPath) {
  if (ajv) return ajv;
  ajv = new import__.default({
    allErrors: true,
    strict: false,
    allowUnionTypes: true,
    validateSchema: false
  });
  (0, import_ajv_formats.default)(ajv);
  const root = JSON.parse(readFileSync(schemaPath, "utf-8"));
  ajv.addSchema(root, root.$id ?? "frontmatter");
  return ajv;
}
function pickBranch(rootSchema, type) {
  const branches = rootSchema?.oneOf ?? [];
  for (const branch of branches) {
    if (branch.properties?.type?.const === type) return branch;
  }
  for (const branch of branches) {
    if (!branch.$ref) continue;
    const refName = branch.$ref.replace(/^#\/\$defs\//, "");
    const resolved = rootSchema.$defs?.[refName];
    if (resolved?.properties?.type?.const === type) return resolved;
  }
  return null;
}
function validateFrontmatter(frontmatter, schemaPath) {
  if (!frontmatter || typeof frontmatter !== "object") {
    return { valid: false, errors: [{ path: "", message: "frontmatter is missing or not an object" }] };
  }
  const type = frontmatter.type;
  if (!type) {
    return { valid: false, errors: [{ path: "/type", message: "frontmatter has no `type:` field" }] };
  }
  ensureAjv(schemaPath);
  const cacheKey = `${schemaPath}::${type}`;
  let validate = validators.get(cacheKey);
  if (!validate) {
    const root = JSON.parse(readFileSync(schemaPath, "utf-8"));
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
      path: e.instancePath || e.schemaPath,
      message: e.message ?? "schema violation"
    }))
  };
}
function renderWarnBanner(errors, kind = "schema") {
  if (!errors || errors.length === 0) return "";
  const items = errors.slice(0, 8).map((e) => `<li><code>${escapeHtml(e.path || "/")}</code> \u2014 ${escapeHtml(e.message)}</li>`).join("");
  const overflow = errors.length > 8 ? `<li>\u2026 and ${errors.length - 8} more</li>` : "";
  return `<aside class="warn-banner" role="status"><strong>${escapeHtml(kind)} warnings</strong><ul>${items}${overflow}</ul></aside>`;
}
function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
}

export {
  validateFrontmatter,
  renderWarnBanner,
  escapeHtml
};
