// lib/schema-check.mjs: the keywords the schemas use, with the error shape and messages of ajv.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SchemaError, compile, plainErrors } from '../../../lib/schema-check.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const messages = (v) => (v.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message}`);

test('type, enum, const and the limits give the ajv messages', () => {
  const v = compile({
    type: 'object',
    required: ['id', 'kind'],
    properties: {
      id: { type: 'string', pattern: '^[a-z]+$', minLength: 2, maxLength: 4 },
      kind: { enum: ['a', 'b'] },
      fixed: { const: 1 },
      n: { type: 'integer', minimum: 1, maximum: 3 },
      list: { type: 'array', items: { type: ['string', 'null'] }, minItems: 1 },
    },
    additionalProperties: false,
  });
  assert.equal(v({ id: 'ab', kind: 'a' }), true);
  assert.equal(v.errors, null);
  assert.equal(v({ id: 'A', fixed: 2, n: 9, list: [], extra: 1 }), false);
  assert.deepEqual(messages(v), [
    "/ must have required property 'kind'",
    '/ must NOT have additional properties',
    '/id must NOT have fewer than 2 characters',
    '/id must match pattern "^[a-z]+$"',
    '/fixed must be equal to constant',
    '/n must be <= 3',
    '/list must NOT have fewer than 1 items',
  ]);
  assert.equal(v({ id: 'abcde', kind: 'c', list: [1] }), false);
  assert.deepEqual(messages(v), ['/id must NOT have more than 4 characters', '/kind must be equal to one of the allowed values', '/list/0 must be string,null']);
});

test('oneOf, anyOf, not, if/then and local $ref', () => {
  const v = compile({
    $defs: { pos: { type: 'integer', minimum: 1 } },
    type: 'object',
    properties: {
      one: { oneOf: [{ type: 'string' }, { const: 'x' }] },
      any: { anyOf: [{ type: 'boolean' }, { $ref: '#/$defs/pos' }] },
      no: { not: { const: 'bad' } },
      kind: { type: 'string' },
    },
    if: { properties: { kind: { const: 'gate' } } },
    then: { required: ['reason'] },
  });
  assert.equal(v({ one: 'y', any: 2, no: 'ok', kind: 'plain' }), true);
  assert.equal(v({ one: 'x', any: 0, no: 'bad', kind: 'gate' }), false);
  assert.deepEqual(messages(v), [
    "/ must have required property 'reason'",
    '/ must match "then" schema',
    '/one must match exactly one schema in oneOf',
    '/any must be boolean',
    '/any must be >= 1',
    '/any must match a schema in anyOf',
    '/no must NOT be valid',
  ]);
  assert.deepEqual(v.errors.find((e) => e.keyword === 'oneOf').params, { passingSchemas: [0, 1] });
});

test('plainErrors gives the hook shape', () => {
  const v = compile({ type: 'object', required: ['x'] });
  v({});
  assert.deepEqual(plainErrors(v.errors), [{ path: '/', message: "must have required property 'x'", keyword: 'required', schemaPath: '#/required', params: { missingProperty: 'x' } }]);
});

test('a keyword the checker does not run throws when the schema compiles', () => {
  assert.throws(() => compile({ type: 'string', format: 'date' }), SchemaError);
  assert.throws(() => compile({ properties: { a: { uniqueItems: true } } }), SchemaError);
});

test('the plugin schemas compile', () => {
  for (const name of ['frontmatter.schema.json', 'sdlc-config.schema.json', 'design-boards.schema.json']) {
    const schema = JSON.parse(readFileSync(path.join(pluginRoot, 'schemas', name), 'utf8'));
    assert.equal(typeof compile(schema), 'function', name);
  }
});
