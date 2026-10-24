import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { safeLoadFrontmatterFile } from './frontmatter.mjs';
import { compile, plainErrors } from './schema-check.mjs';
import { parse as parseYaml } from './yaml.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SCHEMA_PATH = resolve(__dirname, '..', 'schemas', 'frontmatter.schema.json');

const schemaCache = new Map();
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
  // Compute the cache key from inputs alone and check the cache BEFORE loading
  // the schema, so cached calls skip the schema read+parse entirely.
  const cacheKey = `${resolve(schemaPath)}::${kind}::${name ?? '<root>'}`;
  if (validatorCache.has(cacheKey)) return validatorCache.get(cacheKey);

  const rootSchema = loadJsonSchemaSync(schemaPath);
  let schema;
  if (kind === 'frontmatter' && name) {
    const branch = findFrontmatterBranch(rootSchema, name);
    schema = branch ? schemaWithDefs(rootSchema, branch) : rootSchema;
  } else if (kind === 'sibling-yaml') {
    const branch = rootSchema.siblingYamlSchemas?.[name];
    schema = branch ? schemaWithDefs(rootSchema, branch) : null;
  } else if (kind === 'def') {
    const branch = rootSchema.$defs?.[name];
    schema = branch ? schemaWithDefs(rootSchema, branch) : null;
  } else {
    schema = rootSchema;
  }

  if (!schema) return null;
  const validate = compile(schema);
  validatorCache.set(cacheKey, validate);
  return validate;
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
    errors: valid ? [] : plainErrors(validate.errors),
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
    errors: valid ? [] : plainErrors(validate.errors),
  };
}

/**
 * Read a sibling `.yaml` file and validate it against siblingYamlSchemas[artifact].
 * `artifact` defaults to the YAML's own `artifact:` field. A parse error or a
 * schema violation surfaces as { valid:false, errors }.
 */
export async function validateSiblingYamlFile(filePath, { schemaPath = DEFAULT_SCHEMA_PATH, artifact } = {}) {
  let data;
  try {
    data = parseYaml(await readFile(filePath, 'utf-8'));
  } catch (err) {
    return {
      path: filePath,
      valid: false,
      artifact: artifact ?? null,
      errors: [{ path: '/', message: err.message ?? 'YAML parse error', keyword: 'parse' }],
    };
  }
  const result = validateSiblingYaml(data, { artifact: artifact ?? data?.artifact, schemaPath });
  return { path: filePath, ...result };
}

/**
 * Validate a brainstorm's agent board (brainstorm-board.json) against
 * $defs.brainstormBoard. The board is JSON, not frontmatter, so it has its own
 * entry point; post-write-verify calls it on every write of the file.
 */
export function validateBrainstormBoard(data, { schemaPath = DEFAULT_SCHEMA_PATH } = {}) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { valid: false, errors: [{ path: '/', message: 'the brainstorm board is not a JSON object', keyword: 'type' }] };
  }
  const validate = compileValidator({ schemaPath, kind: 'def', name: 'brainstormBoard' });
  const valid = validate(data);
  return { valid, errors: valid ? [] : plainErrors(validate.errors) };
}

export async function validateBrainstormBoardFile(filePath, { schemaPath = DEFAULT_SCHEMA_PATH } = {}) {
  let data;
  try {
    data = JSON.parse(await readFile(filePath, 'utf-8'));
  } catch (err) {
    return { path: filePath, valid: false, errors: [{ path: '/', message: err.message ?? 'JSON parse error', keyword: 'parse' }] };
  }
  return { path: filePath, ...validateBrainstormBoard(data, { schemaPath }) };
}

/**
 * Validate a prototype's proof ledger (prototype-ledger.json) against
 * $defs.prototypeLedger. post-write-verify calls it on every write of the file;
 * lib/prototype.mjs ledgerProblems() adds the rules between ids.
 */
export function validatePrototypeLedger(data, { schemaPath = DEFAULT_SCHEMA_PATH } = {}) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { valid: false, errors: [{ path: '/', message: 'the proof ledger is not a JSON object', keyword: 'type' }] };
  }
  const validate = compileValidator({ schemaPath, kind: 'def', name: 'prototypeLedger' });
  const valid = validate(data);
  return { valid, errors: valid ? [] : plainErrors(validate.errors) };
}

export async function validatePrototypeLedgerFile(filePath, { schemaPath = DEFAULT_SCHEMA_PATH } = {}) {
  let data;
  try {
    data = JSON.parse(await readFile(filePath, 'utf-8'));
  } catch (err) {
    return { path: filePath, valid: false, errors: [{ path: '/', message: err.message ?? 'JSON parse error', keyword: 'parse' }] };
  }
  return { path: filePath, ...validatePrototypeLedger(data, { schemaPath }) };
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
  validatorCache.clear();
}
