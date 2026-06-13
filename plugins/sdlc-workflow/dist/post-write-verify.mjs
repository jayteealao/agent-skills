#!/usr/bin/env node
import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  collectToolInputPaths,
  hasFrontmatterFence,
  isManagedArtifactMarkdownPath,
  isProjectContextMarkdownPath,
  isProseLogPath,
  logError,
  outputSystemMessage,
  projectRootFromInput,
  readStdinJson,
  readTextIfExists,
  resolveProjectPath
} from "./chunk-4OZLXOMA.mjs";
import {
  loadConfig
} from "./chunk-H5U2H73C.mjs";
import {
  safeLoadFrontmatterFile
} from "./chunk-5U76735W.mjs";
import {
  jsYaml
} from "./chunk-LFGT2BKG.mjs";
import "./chunk-UTP6CBAZ.mjs";
import {
  require__,
  require_dist
} from "./chunk-FZ2GR6GF.mjs";
import {
  __toESM
} from "./chunk-SGA7NFMW.mjs";

// hooks/post-write-verify.mjs
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";

// lib/schema-validator.mjs
var import__ = __toESM(require__(), 1);
var import_ajv_formats = __toESM(require_dist(), 1);
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
var __dirname = dirname(fileURLToPath(import.meta.url));
var DEFAULT_SCHEMA_PATH = resolve(__dirname, "..", "tests", "frontmatter.schema.json");
var schemaCache = /* @__PURE__ */ new Map();
var ajvCache = /* @__PURE__ */ new Map();
var validatorCache = /* @__PURE__ */ new Map();
function loadJsonSchemaSync(schemaPath = DEFAULT_SCHEMA_PATH) {
  const resolved = resolve(schemaPath);
  if (schemaCache.has(resolved)) return schemaCache.get(resolved);
  const schema = JSON.parse(readFileSync(resolved, "utf-8"));
  schemaCache.set(resolved, schema);
  return schema;
}
function ajvFor(schemaPath) {
  const resolved = resolve(schemaPath);
  if (ajvCache.has(resolved)) return ajvCache.get(resolved);
  const ajv = new import__.default({
    allErrors: true,
    strict: false,
    allowUnionTypes: true,
    validateSchema: false
  });
  (0, import_ajv_formats.default)(ajv);
  ajvCache.set(resolved, ajv);
  return ajv;
}
function resolveLocalRef(schema, refNode) {
  if (!refNode?.$ref?.startsWith("#/$defs/")) return refNode;
  const name = refNode.$ref.slice("#/$defs/".length);
  return schema.$defs?.[name] ?? refNode;
}
function typeSchemaMatches(typeSchema, typeValue) {
  if (!typeSchema) return false;
  if (Object.hasOwn(typeSchema, "const")) return typeSchema.const === typeValue;
  if (Array.isArray(typeSchema.enum)) return typeSchema.enum.includes(typeValue);
  return false;
}
function findFrontmatterBranch(schema, typeValue) {
  if (!typeValue) return null;
  for (const chunk of schema.allOf ?? []) {
    for (const branchRef of chunk.oneOf ?? []) {
      const branch = resolveLocalRef(schema, branchRef);
      if (typeSchemaMatches(branch?.properties?.type, typeValue)) {
        return branch;
      }
    }
  }
  return null;
}
function schemaWithDefs(rootSchema, subSchema) {
  return {
    ...subSchema,
    $schema: rootSchema.$schema,
    $defs: rootSchema.$defs ?? {}
  };
}
function compileValidator({ schemaPath = DEFAULT_SCHEMA_PATH, kind = "frontmatter", name = null }) {
  const cacheKey = `${resolve(schemaPath)}::${kind}::${name ?? "<root>"}`;
  if (validatorCache.has(cacheKey)) return validatorCache.get(cacheKey);
  const rootSchema = loadJsonSchemaSync(schemaPath);
  let schema;
  if (kind === "frontmatter" && name) {
    const branch = findFrontmatterBranch(rootSchema, name);
    schema = branch ? schemaWithDefs(rootSchema, branch) : rootSchema;
  } else if (kind === "sibling-yaml") {
    const branch = rootSchema.siblingYamlSchemas?.[name];
    schema = branch ? schemaWithDefs(rootSchema, branch) : null;
  } else {
    schema = rootSchema;
  }
  if (!schema) return null;
  const ajv = ajvFor(schemaPath);
  const validate = ajv.compile(schema);
  validatorCache.set(cacheKey, validate);
  return validate;
}
function normalizeAjvErrors(errors = []) {
  return errors.map((err) => ({
    path: err.instancePath || "/",
    message: err.message ?? "schema violation",
    keyword: err.keyword,
    schemaPath: err.schemaPath,
    params: err.params ?? {}
  }));
}
function validateFrontmatter(data, { schemaPath = DEFAULT_SCHEMA_PATH } = {}) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return {
      valid: false,
      type: null,
      errors: [{ path: "/", message: "frontmatter is not a YAML mapping", keyword: "type" }]
    };
  }
  const type = data.type ?? null;
  const validate = compileValidator({ schemaPath, kind: "frontmatter", name: type });
  const valid = validate(data);
  return {
    valid,
    type,
    errors: valid ? [] : normalizeAjvErrors(validate.errors)
  };
}
function validateSiblingYaml(data, { artifact = data?.artifact, schemaPath = DEFAULT_SCHEMA_PATH } = {}) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return {
      valid: false,
      artifact: artifact ?? null,
      errors: [{ path: "/", message: "sibling YAML is not a mapping", keyword: "type" }]
    };
  }
  const validate = compileValidator({ schemaPath, kind: "sibling-yaml", name: artifact });
  if (!validate) {
    return {
      valid: false,
      artifact: artifact ?? null,
      errors: [{ path: "/artifact", message: `no sibling YAML schema for artifact: ${artifact ?? "<missing>"}`, keyword: "required" }]
    };
  }
  const valid = validate(data);
  return {
    valid,
    artifact,
    errors: valid ? [] : normalizeAjvErrors(validate.errors)
  };
}
async function validateSiblingYamlFile(filePath, { schemaPath = DEFAULT_SCHEMA_PATH, artifact } = {}) {
  let data;
  try {
    data = jsYaml.load(await readFile(filePath, "utf-8"));
  } catch (err) {
    return {
      path: filePath,
      valid: false,
      artifact: artifact ?? null,
      errors: [{ path: "/", message: err.message ?? "YAML parse error", keyword: "parse" }]
    };
  }
  const result = validateSiblingYaml(data, { artifact: artifact ?? data?.artifact, schemaPath });
  return { path: filePath, ...result };
}
async function validateFrontmatterFile(filePath, { schemaPath = DEFAULT_SCHEMA_PATH } = {}) {
  const loaded = await safeLoadFrontmatterFile(filePath);
  if (loaded.parseError) {
    return {
      path: filePath,
      valid: false,
      type: null,
      errors: [{ path: "/", message: loaded.parseError, keyword: "parse" }],
      frontmatter: null
    };
  }
  const result = validateFrontmatter(loaded.data, { schemaPath });
  return {
    path: filePath,
    ...result,
    frontmatter: loaded.data
  };
}
function formatValidationErrors(errors = []) {
  return errors.map((err) => `${err.path || "/"}: ${err.message}`).join("\n");
}

// hooks/post-write-verify.mjs
var RICH_TIER_TYPES = /* @__PURE__ */ new Set([
  "review",
  "plan",
  "design",
  "ship-run",
  "rca",
  "benchmark",
  "experiment",
  "instrument",
  "profile",
  "simplify-run",
  "review-command",
  "design-audit",
  "design-critique",
  // v9.71 — craft's visual contract gains its own rich layer (02c-craft.yaml +
  // .html.fragment, type: design-contract). Reverses the Gap-D "no interactive
  // layer" call now that craft authors a coverage-grid fragment. Reminder-gated
  // only; NOT in SIBLING_YAML_VALIDATED_TYPES (no real corpus to hard-validate yet).
  "design-contract"
]);
var SIBLING_YAML_VALIDATED_TYPES = /* @__PURE__ */ new Set([
  "plan",
  "review",
  "design",
  "simplify-run",
  "ship-run"
]);
function fragmentOwningType(text) {
  if (!text) return null;
  const fence = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!fence) return null;
  const block = fence[1];
  const typeMatch = /(?:^|\n)\s*type:\s*["']?([A-Za-z0-9-]+)/.exec(block);
  const type = typeMatch ? typeMatch[1] : null;
  if (type !== "augmentation") return type;
  const augMatch = /(?:^|\n)\s*augmentation-type:\s*["']?([A-Za-z0-9-]+)/.exec(block);
  return augMatch ? augMatch[1] : type;
}
function fragmentEscaped(text) {
  if (!text) return false;
  const fence = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!fence) return false;
  return /(?:^|\n)\s*fragment:\s*["']?(none|skip|n\/a)["']?\s*(?:#.*)?$/im.test(fence[1]);
}
async function enforceSiblingFragments(paths, config) {
  if (config.hooks?.remindMissingFragments === false) return;
  const blocking = [];
  const nudges = [];
  for (const path of paths) {
    if (isProseLogPath(path.original) || isProjectContextMarkdownPath(path.original)) continue;
    const text = await readTextIfExists(path.absolute);
    const type = fragmentOwningType(text);
    if (!type || !RICH_TIER_TYPES.has(type)) continue;
    if (fragmentEscaped(text)) continue;
    const stem = path.absolute.replace(/\.md$/, "");
    const fileStem = path.original.replace(/\\/g, "/").split("/").at(-1).replace(/\.md$/, "");
    const hasYaml = existsSync(`${stem}.yaml`);
    const hasFragment = existsSync(`${stem}.html.fragment`);
    if (!hasYaml) {
      const missing = [`${fileStem}.yaml`];
      if (!hasFragment) missing.push(`${fileStem}.html.fragment`);
      blocking.push({ rel: path.original, type, missing });
    } else if (!hasFragment) {
      nudges.push({ rel: path.original, type, missing: [`${fileStem}.html.fragment`] });
    }
  }
  if (blocking.length) {
    const lines = blocking.map((r) => `  - ${r.rel} (type: ${r.type}) \u2014 missing ${r.missing.join(" + ")}`);
    process.stderr.write(
      `wf-postwrite-verify: rich-tier artifact written without its mandatory sibling .yaml:

${lines.join("\n")}

The sunflower view GATES the whole rich page (file-change topology, files-touched
table, verdict heatmap, risk callouts, etc.) on the sibling .yaml \u2014 without it the
page silently degrades to plain prose. Author the siblings NOW, while this artifact
is still in context:
  1. Write <stem>.yaml \u2014 the structured data (schema: siblingYamlSchemas.<type> in
     plugins/sdlc-workflow/tests/frontmatter.schema.json).
  2. Write <stem>.html.fragment \u2014 the body-only interactive layer.
Full contract: plugins/sdlc-workflow/reference/fragment-author-contract.md.
If this artifact legitimately has no structured data to project, set
\`fragment: none\` in its frontmatter to opt out.
`
    );
    process.exit(2);
  }
  if (nudges.length) {
    const lines = nudges.map((r) => `  - ${r.rel} (type: ${r.type}) \u2014 missing ${r.missing.join(" + ")}`);
    outputSystemMessage(
      `wf: rich-tier artifact(s) have their sibling .yaml but no .html.fragment:
${lines.join("\n")}
The page already renders rich from the .yaml; the .html.fragment only adds the interactive layer (collapsible rows, filters, copy controls). Author it per reference/fragment-author-contract.md if this artifact warrants interactivity.`
    );
  }
}
async function validateSiblingYamls(paths, config, schemaPath) {
  if (config.hooks?.validateSiblingYaml === false) return;
  const failures = [];
  for (const path of paths) {
    if (isProseLogPath(path.original) || isProjectContextMarkdownPath(path.original)) continue;
    const text = await readTextIfExists(path.absolute);
    const type = fragmentOwningType(text);
    if (!type || !SIBLING_YAML_VALIDATED_TYPES.has(type)) continue;
    const yamlPath = `${path.absolute.replace(/\.md$/, "")}.yaml`;
    if (!existsSync(yamlPath)) continue;
    const result = await validateSiblingYamlFile(yamlPath, { schemaPath, artifact: type });
    if (!result.valid) {
      failures.push({ rel: `${path.original.replace(/\.md$/, "")}.yaml`, result });
    }
  }
  if (!failures.length) return;
  for (const f of failures) {
    process.stderr.write(`wf-postwrite-verify: sibling YAML validation FAILED for ${f.rel}

`);
    process.stderr.write(`${formatValidationErrors(f.result.errors)}

`);
  }
  process.stderr.write("The sibling .yaml does not conform to siblingYamlSchemas.<type>\n");
  process.stderr.write("(see plugins/sdlc-workflow/tests/frontmatter.schema.json). The sunflower view\n");
  process.stderr.write("reads this file to build the rich page; a malformed shape degrades the figure.\n");
  process.stderr.write("Fix the issues above, then continue.\n");
  process.exit(2);
}
var PLUGIN_ROOT = fileURLToPath2(new URL("..", import.meta.url));
async function main() {
  if (process.env.CLAUDE_PLUGIN_INSTALL === "1") return;
  const input = await readStdinJson();
  const projectRoot = projectRootFromInput(input);
  const config = await loadConfig(projectRoot);
  if (config.hooks.verifyOnWrite === false) return;
  const schemaPath = join(PLUGIN_ROOT, "tests", "frontmatter.schema.json");
  const paths = collectToolInputPaths(input).filter((path) => isManagedArtifactMarkdownPath(path)).map((path) => ({ original: path, absolute: resolveProjectPath(projectRoot, path) })).filter(({ absolute }) => absolute && existsSync(absolute));
  if (!paths.length) return;
  const failures = [];
  for (const path of paths) {
    if (isProseLogPath(path.original)) continue;
    if (isProjectContextMarkdownPath(path.original)) {
      const text = await readTextIfExists(path.absolute);
      if (!hasFrontmatterFence(text)) continue;
    }
    const result = await validateFrontmatterFile(path.absolute, { schemaPath });
    if (!result.valid) failures.push({ path, result });
  }
  if (!failures.length) {
    await validateSiblingYamls(paths, config, schemaPath);
    await enforceSiblingFragments(paths, config);
    return;
  }
  for (const failure of failures) {
    process.stderr.write(`wf-postwrite-verify: frontmatter validation FAILED for ${failure.path.original}

`);
    process.stderr.write(`${formatValidationErrors(failure.result.errors)}

`);
  }
  process.stderr.write("The file was written but does not conform to the sdlc/v1 schema\n");
  process.stderr.write("(see plugins/sdlc-workflow/tests/frontmatter.schema.json).\n");
  process.stderr.write("Re-Edit the frontmatter to fix the issues above, then continue.\n");
  process.exit(2);
}
main().catch(async (err) => {
  try {
    await logError("post-write-verify", err);
  } catch {
  }
  process.exit(0);
});
