// The orient schema of the yolo driver accepts what the orient brief asks for: an open
// deferral has `clearedBy: null`, and an absent optional field can come back as null.
//
// yolo.js is a Workflow script, not a module, so the schema object is extracted by
// brace-matching and checked with a small type check of the JSON-schema `type` keyword.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const src = readFileSync(path.join(pluginRoot, 'skills', 'wf', 'workflows', 'yolo.js'), 'utf8');

function extractConst(name) {
  const at = src.indexOf(`const ${name} = {`);
  assert.ok(at >= 0, `could not locate ${name} in yolo.js`);
  let depth = 0;
  for (let j = src.indexOf('{', at); j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return new Function(`return ${src.slice(src.indexOf('{', at), j + 1)}`)();
  }
  throw new Error(`unbalanced braces extracting ${name}`);
}

// The errors of `value` against the `type` and `properties` keywords of `schema`.
function typeErrors(schema, value, where = '$') {
  const kindOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v === 'number' ? 'number' : typeof v);
  const errors = [];
  if (schema.type) {
    const types = [].concat(schema.type);
    if (!types.includes(kindOf(value))) errors.push(`${where}: ${kindOf(value)} is not ${types.join('|')}`);
  }
  if (value && typeof value === 'object' && !Array.isArray(value) && schema.properties) {
    for (const [k, v] of Object.entries(value)) if (schema.properties[k]) errors.push(...typeErrors(schema.properties[k], v, `${where}.${k}`));
  }
  if (Array.isArray(value) && schema.items) value.forEach((v, i) => errors.push(...typeErrors(schema.items, v, `${where}[${i}]`)));
  return errors;
}

test('an orient result with an open deferral (clearedBy: null) passes the orient schema', () => {
  const ORIENT_RESULT = extractConst('ORIENT_RESULT');
  const result = {
    ok: true, slug: 'demo', mode: 'slug', reviewScope: 'slug-wide', fileConvention: 'suffixed', branch: {}, slices: [],
    targetSlice: null, reviewDimension: null,
    priorDeferrals: [{ slice: 'auth', reason: 'no emulator', deferredAt: '2026-10-27T10:00:00Z', clearedBy: null, repeatOf: null, ac: null, clearingEvent: null, clearingProbe: null }],
  };
  assert.deepEqual(typeErrors(ORIENT_RESULT, result), []);
  // A cleared deferral still carries a string.
  assert.deepEqual(typeErrors(ORIENT_RESULT, { ...result, priorDeferrals: [{ slice: 'auth', clearedBy: 'probe-1' }] }), []);
});

test('the orient brief asks for null only where the schema allows it', () => {
  const ORIENT_RESULT = extractConst('ORIENT_RESULT');
  assert.match(src, /clearedBy \(= cleared-by, null if open\)/);
  assert.deepEqual(ORIENT_RESULT.properties.priorDeferrals.items.properties.clearedBy.type, ['string', 'null']);
});
