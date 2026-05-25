import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { safeLoadFrontmatterFile } from './frontmatter.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SCHEMA_PATH = resolve(__dirname, '..', 'tests', 'frontmatter.schema.json');

const schemaCache = new Map();
const ajvCache = new Map();
const validatorCache = new Map();

export function defaultFrontmatterSchemaPath() {
  return DEFAULT_SCHEMA_PATH;
}

export async function loadJsonSchema(schemaPath = DEFAULT_SCHEMA_PATH) {
  const resolved = resolve(schemaPath);
  if (schemaCache.has(resolved)) return schemaCache.get(resolved);
  const schema = JSON.parse(await readFile(resolved, 'utf-8'));
  schemaCache.set(resolved, schema);
  return schema;
}

function loadJsonSchemaSync(schemaPath = DEFAULT_SCHEMA_PATH) {
  const resolved = resolve(schemaPath);
  if (schemaCache.has(resolved)) return schemaCache.get(resolved);
  const schema = JSON.parse(readFileSync(resolved, 'utf-8'));
  schemaCache.set(resolved, schema);
  return schema;
}

function ajvFor(schemaPath) {
  const resolved = resolve(schemaPath);
  if (ajvCache.has(resolved)) return ajvCache.get(resolved);
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    allowUnionTypes: true,
    validateSchema: false,
  });
  addFormats(ajv);
  ajvCache.set(resolved, ajv);
  return ajv;
}

function resolveLocalRef(schema, refNode) {
  if (!refNode?.$ref?.startsWith('#/$defs/')) return refNode;
  const name = refNode.$ref.slice('#/$defs/'.length);
  return schema.$defs?.[name] ?? refNode;
}

function typeSchemaMatches(typeSchema, typeValue) {
  if (!typeSchema) return false;
  if (Object.hasOwn(typeSchema, 'const')) return typeSchema.const === typeValue;
  if (Array.isArray(typeSchema.enum)) return typeSchema.enum.includes(typeValue);
  return false;
}

export function findFrontmatterBranch(schema, typeValue) {
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
    $defs: rootSchema.$defs ?? {},
  };
}

function compileValidator({ schemaPath = DEFAULT_SCHEMA_PATH, kind = 'frontmatter', name = null }) {
  const rootSchema = loadJsonSchemaSync(schemaPath);
  let schema;
  let cacheName = name ?? '<root>';
  if (kind === 'frontmatter' && name) {
    const branch = findFrontmatterBranch(rootSchema, name);
    schema = branch ? schemaWithDefs(rootSchema, branch) : rootSchema;
    if (!branch) cacheName = '<root>';
  } else if (kind === 'sibling-yaml') {
    const branch = rootSchema.siblingYamlSchemas?.[name];
    schema = branch ? schemaWithDefs(rootSchema, branch) : null;
  } else {
    schema = rootSchema;
  }

  if (!schema) return null;
  const cacheKey = `${resolve(schemaPath)}::${kind}::${cacheName}`;
  if (validatorCache.has(cacheKey)) return validatorCache.get(cacheKey);

  const ajv = ajvFor(schemaPath);
  const validate = ajv.compile(schema);
  validatorCache.set(cacheKey, validate);
  return validate;
}

export function normalizeAjvErrors(errors = []) {
  return errors.map((err) => ({
    path: err.instancePath || '/',
    message: err.message ?? 'schema violation',
    keyword: err.keyword,
    schemaPath: err.schemaPath,
    params: err.params ?? {},
  }));
}

export function validateFrontmatter(data, { schemaPath = DEFAULT_SCHEMA_PATH } = {}) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return {
      valid: false,
      type: null,
      errors: [{ path: '/', message: 'frontmatter is not a YAML mapping', keyword: 'type' }],
    };
  }

  const type = data.type ?? null;
  const validate = compileValidator({ schemaPath, kind: 'frontmatter', name: type });
  const valid = validate(data);
  return {
    valid,
    type,
    errors: valid ? [] : normalizeAjvErrors(validate.errors),
  };
}

export function validateSiblingYaml(data, { artifact = data?.artifact, schemaPath = DEFAULT_SCHEMA_PATH } = {}) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return {
      valid: false,
      artifact: artifact ?? null,
      errors: [{ path: '/', message: 'sibling YAML is not a mapping', keyword: 'type' }],
    };
  }

  const validate = compileValidator({ schemaPath, kind: 'sibling-yaml', name: artifact });
  if (!validate) {
    return {
      valid: false,
      artifact: artifact ?? null,
      errors: [{ path: '/artifact', message: `no sibling YAML schema for artifact: ${artifact ?? '<missing>'}`, keyword: 'required' }],
    };
  }
  const valid = validate(data);
  return {
    valid,
    artifact,
    errors: valid ? [] : normalizeAjvErrors(validate.errors),
  };
}

export async function validateFrontmatterFile(filePath, { schemaPath = DEFAULT_SCHEMA_PATH } = {}) {
  const loaded = await safeLoadFrontmatterFile(filePath);
  if (loaded.parseError) {
    return {
      path: filePath,
      valid: false,
      type: null,
      errors: [{ path: '/', message: loaded.parseError, keyword: 'parse' }],
      frontmatter: null,
    };
  }

  const result = validateFrontmatter(loaded.data, { schemaPath });
  return {
    path: filePath,
    ...result,
    frontmatter: loaded.data,
  };
}

export function formatValidationErrors(errors = []) {
  return errors
    .map((err) => `${err.path || '/'}: ${err.message}`)
    .join('\n');
}

export function clearSchemaValidatorCaches() {
  schemaCache.clear();
  ajvCache.clear();
  validatorCache.clear();
}
