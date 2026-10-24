// The key registry (skills/wf/keys.json) and the files generated from it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { context, fill, generate, hostRows, loadRegistry, registryErrors } from '../../scripts/generate.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('the registry has a valid shape', () => {
  assert.deepEqual(registryErrors(loadRegistry(pluginRoot), pluginRoot), []);
});

test('every generated file matches the registry', () => {
  assert.deepEqual(generate({ root: pluginRoot, write: false }), [], 'run npm run generate');
});

test('registryErrors names a bad host value, a missing reference and a duplicate key', () => {
  const reg = loadRegistry(pluginRoot);
  const bad = structuredClone(reg);
  bad.keys[0].hosts.codex = 'gap:';
  bad.keys[1].reference = 'reference/none.md';
  bad.keys.push(structuredClone(bad.keys[2]));
  const errors = registryErrors(bad, pluginRoot).join('\n');
  assert.match(errors, /intake: host codex must be/);
  assert.match(errors, /reference reference\/none\.md does not exist/);
  assert.match(errors, /appears twice/);
});

test('every key, sub-key and mode has a host row, and a gap names its reason', () => {
  for (const r of hostRows(loadRegistry(pluginRoot))) {
    for (const h of ['claude', 'codex', 'pi']) assert.match(String(r.hosts?.[h]), /^(full|differs: \S|gap: \S)/, `${r.id} on ${h}`);
  }
});

test('fill refuses an unknown placeholder', () => {
  const ctx = context(loadRegistry(pluginRoot));
  assert.equal(fill('{keyCount} keys', ctx), `${ctx.keyCount} keys`);
  assert.throws(() => fill('{nope}', ctx), /unknown placeholder \{nope\}/);
});
