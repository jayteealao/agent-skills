// A small JSON Schema (2020-12) checker for the schemas of the plugin.
//
// It takes the keywords the schemas use: type, enum, const, the number, string and array
// limits, pattern, required, properties, additionalProperties, items, allOf, anyOf, oneOf,
// not, if/then/else and local $ref. The annotations ($schema, $id, title, description,
// default, $comment, examples) do nothing. A keyword outside this set throws when the
// schema compiles, so a schema cannot rely on a check that does not run.
//
// The errors have the shape and the messages of ajv with allErrors:
// { instancePath, schemaPath, keyword, params, message }.

// siblingYamlSchemas holds the schemas of the sibling records; each one compiles on its own.
const ANNOTATIONS = new Set(['$schema', '$id', 'title', 'description', 'default', '$comment', 'examples', 'deprecated', '$defs', 'definitions', 'siblingYamlSchemas']);
const KNOWN = new Set([
  'type', 'enum', 'const', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum',
  'minLength', 'maxLength', 'pattern', 'minItems', 'maxItems', 'items', 'required',
  'properties', 'additionalProperties', 'allOf', 'anyOf', 'oneOf', 'not', 'if', 'then', 'else', '$ref',
]);

export class SchemaError extends Error {
  constructor(message) { super(message); this.name = 'SchemaError'; }
}

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function hasType(v, t) {
  switch (t) {
    case 'null': return v === null;
    case 'array': return Array.isArray(v);
    case 'object': return typeOf(v) === 'object';
    case 'integer': return typeof v === 'number' && Number.isInteger(v);
    case 'number': return typeof v === 'number' && Number.isFinite(v);
    default: return typeof v === t;
  }
}

export function deepEqual(a, b) {
  if (a === b) return true;
  if (typeOf(a) !== typeOf(b) || typeof a !== 'object' || a === null) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => Object.hasOwn(b, k) && deepEqual(a[k], b[k]));
}

const pointer = (seg) => String(seg).replace(/~/g, '~0').replace(/\//g, '~1');
const codePoints = (s) => [...s].length;

function resolveRef(root, ref) {
  if (ref === '#') return root;
  if (!ref.startsWith('#/')) throw new SchemaError(`only local $ref is supported: ${ref}`);
  let node = root;
  for (const raw of ref.slice(2).split('/')) {
    const seg = decodeURIComponent(raw).replace(/~1/g, '/').replace(/~0/g, '~');
    node = node?.[seg];
    if (node === undefined) throw new SchemaError(`$ref does not resolve: ${ref}`);
  }
  return node;
}

/** Throw a SchemaError when a schema uses a keyword this checker does not run. */
function checkKeywords(schema, path, seen = new Set()) {
  if (typeof schema === 'boolean' || seen.has(schema)) return;
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) throw new SchemaError(`${path} is not a schema`);
  seen.add(schema);
  for (const [k, v] of Object.entries(schema)) {
    if (ANNOTATIONS.has(k)) {
      if (k === '$defs' || k === 'definitions') for (const [n, s] of Object.entries(v)) checkKeywords(s, `${path}/${k}/${n}`, seen);
      continue;
    }
    if (!KNOWN.has(k)) throw new SchemaError(`${path}: the keyword ${k} is not supported`);
    if (k === 'properties') for (const [n, s] of Object.entries(v)) checkKeywords(s, `${path}/properties/${pointer(n)}`, seen);
    else if (['allOf', 'anyOf', 'oneOf'].includes(k)) v.forEach((s, i) => checkKeywords(s, `${path}/${k}/${i}`, seen));
    else if (['items', 'not', 'if', 'then', 'else'].includes(k)) checkKeywords(v, `${path}/${k}`, seen);
    else if (k === 'additionalProperties' && typeof v === 'object') checkKeywords(v, `${path}/${k}`, seen);
    else if (k === 'pattern') new RegExp(v, 'u');
  }
}

/**
 * Compile a schema into a validate function. `validate(data)` returns true or false and
 * sets `validate.errors` to the list of errors (null when the data is valid), as ajv does.
 * `root` is the document that a `#/...` $ref resolves against; it defaults to the schema.
 */
export function compile(schema, { root = schema } = {}) {
  checkKeywords(schema, '#');
  if (root !== schema) for (const [n, s] of Object.entries(root.$defs ?? {})) checkKeywords(s, `#/$defs/${n}`);
  const patterns = new Map();
  const re = (p) => { if (!patterns.has(p)) patterns.set(p, new RegExp(p, 'u')); return patterns.get(p); };

  function run(s, data, inst, sp, errors) {
    if (s === true) return;
    if (s === false) { errors.push({ instancePath: inst, schemaPath: sp, keyword: 'false schema', params: {}, message: 'boolean schema is false' }); return; }
    const err = (keyword, params, message) => errors.push({ instancePath: inst, schemaPath: `${sp}/${keyword}`, keyword, params, message });

    if (s.$ref) run(resolveRef(root, s.$ref), data, inst, s.$ref, errors);

    if (s.type !== undefined) {
      const types = Array.isArray(s.type) ? s.type : [s.type];
      if (!types.some((t) => hasType(data, t))) err('type', { type: Array.isArray(s.type) ? s.type.join(',') : s.type }, `must be ${types.join(',')}`);
    }

    // The keywords for any type, in the order ajv runs them.
    if (Object.hasOwn(s, 'const') && !deepEqual(data, s.const)) err('const', { allowedValue: s.const }, 'must be equal to constant');
    if (s.enum && !s.enum.some((e) => deepEqual(data, e))) err('enum', { allowedValues: s.enum }, 'must be equal to one of the allowed values');
    if (s.not !== undefined) {
      const sub = [];
      run(s.not, data, inst, `${sp}/not`, sub);
      if (!sub.length) err('not', {}, 'must NOT be valid');
    }
    if (s.anyOf) {
      const sub = [];
      let pass = false;
      s.anyOf.forEach((b, i) => { const e = []; run(b, data, inst, `${sp}/anyOf/${i}`, e); if (!e.length) pass = true; else sub.push(...e); });
      if (!pass) { errors.push(...sub); err('anyOf', {}, 'must match a schema in anyOf'); }
    }
    if (s.oneOf) {
      const sub = [];
      const passing = [];
      s.oneOf.forEach((b, i) => { const e = []; run(b, data, inst, `${sp}/oneOf/${i}`, e); if (!e.length) passing.push(i); else sub.push(...e); });
      if (passing.length !== 1) {
        if (!passing.length) errors.push(...sub);
        err('oneOf', { passingSchemas: passing.length ? passing : null }, 'must match exactly one schema in oneOf');
      }
    }
    if (s.allOf) s.allOf.forEach((b, i) => run(b, data, inst, `${sp}/allOf/${i}`, errors));
    if (s.if !== undefined && (s.then !== undefined || s.else !== undefined)) {
      const cond = [];
      run(s.if, data, inst, `${sp}/if`, cond);
      const branch = cond.length ? 'else' : 'then';
      if (s[branch] !== undefined) {
        const sub = [];
        run(s[branch], data, inst, `${sp}/${branch}`, sub);
        if (sub.length) { errors.push(...sub); err('if', { failingKeyword: branch }, `must match "${branch}" schema`); }
      }
    }

    if (typeof data === 'number') {
      if (s.maximum !== undefined && !(data <= s.maximum)) err('maximum', { comparison: '<=', limit: s.maximum }, `must be <= ${s.maximum}`);
      if (s.minimum !== undefined && !(data >= s.minimum)) err('minimum', { comparison: '>=', limit: s.minimum }, `must be >= ${s.minimum}`);
      if (s.exclusiveMaximum !== undefined && !(data < s.exclusiveMaximum)) err('exclusiveMaximum', { comparison: '<', limit: s.exclusiveMaximum }, `must be < ${s.exclusiveMaximum}`);
      if (s.exclusiveMinimum !== undefined && !(data > s.exclusiveMinimum)) err('exclusiveMinimum', { comparison: '>', limit: s.exclusiveMinimum }, `must be > ${s.exclusiveMinimum}`);
    }
    if (typeof data === 'string') {
      if (s.maxLength !== undefined && codePoints(data) > s.maxLength) err('maxLength', { limit: s.maxLength }, `must NOT have more than ${s.maxLength} characters`);
      if (s.minLength !== undefined && codePoints(data) < s.minLength) err('minLength', { limit: s.minLength }, `must NOT have fewer than ${s.minLength} characters`);
      if (s.pattern !== undefined && !re(s.pattern).test(data)) err('pattern', { pattern: s.pattern }, `must match pattern "${s.pattern}"`);
    }
    if (Array.isArray(data)) {
      if (s.maxItems !== undefined && data.length > s.maxItems) err('maxItems', { limit: s.maxItems }, `must NOT have more than ${s.maxItems} items`);
      if (s.minItems !== undefined && data.length < s.minItems) err('minItems', { limit: s.minItems }, `must NOT have fewer than ${s.minItems} items`);
      if (s.items !== undefined) data.forEach((x, i) => run(s.items, x, `${inst}/${i}`, `${sp}/items`, errors));
    }
    if (typeOf(data) === 'object') {
      for (const p of s.required ?? []) {
        if (data[p] === undefined) err('required', { missingProperty: p }, `must have required property '${p}'`);
      }
      const props = s.properties ?? {};
      if (s.additionalProperties !== undefined && s.additionalProperties !== true) {
        for (const k of Object.keys(data)) {
          if (Object.hasOwn(props, k)) continue;
          if (s.additionalProperties === false) err('additionalProperties', { additionalProperty: k }, 'must NOT have additional properties');
          else run(s.additionalProperties, data[k], `${inst}/${pointer(k)}`, `${sp}/additionalProperties`, errors);
        }
      }
      for (const [k, sub] of Object.entries(props)) {
        if (data[k] !== undefined) run(sub, data[k], `${inst}/${pointer(k)}`, `${sp}/properties/${pointer(k)}`, errors);
      }
    }
  }

  const validate = (data) => {
    const errors = [];
    run(schema, data, '', '#', errors);
    validate.errors = errors.length ? errors : null;
    return !errors.length;
  };
  validate.errors = null;
  return validate;
}

/** The errors in the plain shape the hooks and the CLI report: { path, message, keyword, schemaPath, params }. */
export function plainErrors(errors = []) {
  return (errors ?? []).map((err) => ({
    path: err.instancePath || '/',
    message: err.message ?? 'schema violation',
    keyword: err.keyword,
    schemaPath: err.schemaPath,
    params: err.params ?? {},
  }));
}
