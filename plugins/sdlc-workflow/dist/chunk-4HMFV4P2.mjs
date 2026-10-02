import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  safeLoadFrontmatterFile
} from "./chunk-5U76735W.mjs";
import {
  require__,
  require_dist
} from "./chunk-FZ2GR6GF.mjs";
import {
  jsYaml
} from "./chunk-LFGT2BKG.mjs";
import {
  __toESM
} from "./chunk-SGA7NFMW.mjs";

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
  } else if (kind === "def") {
    const branch = rootSchema.$defs?.[name];
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
function validateBrainstormBoard(data, { schemaPath = DEFAULT_SCHEMA_PATH } = {}) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { valid: false, errors: [{ path: "/", message: "the brainstorm board is not a JSON object", keyword: "type" }] };
  }
  const validate = compileValidator({ schemaPath, kind: "def", name: "brainstormBoard" });
  const valid = validate(data);
  return { valid, errors: valid ? [] : normalizeAjvErrors(validate.errors) };
}
async function validateBrainstormBoardFile(filePath, { schemaPath = DEFAULT_SCHEMA_PATH } = {}) {
  let data;
  try {
    data = JSON.parse(await readFile(filePath, "utf-8"));
  } catch (err) {
    return { path: filePath, valid: false, errors: [{ path: "/", message: err.message ?? "JSON parse error", keyword: "parse" }] };
  }
  return { path: filePath, ...validateBrainstormBoard(data, { schemaPath }) };
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

export {
  validateFrontmatter,
  validateSiblingYamlFile,
  validateBrainstormBoard,
  validateBrainstormBoardFile,
  validateFrontmatterFile,
  formatValidationErrors
};
