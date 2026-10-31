// The key registry (skills/wf/keys.json) and the files generated from it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

test('the key tables are in route.md only; SKILL.md, which every run loads, holds none', () => {
  const read = (rel) => readFileSync(path.join(pluginRoot, 'skills', 'wf', rel), 'utf8');
  const marker = '<!-- generated from skills/wf/keys.json by npm run generate; edit keys.json -->';
  assert.ok(read('reference/route.md').includes(marker), 'route.md has the generated block');
  assert.match(read('reference/route.md'), /^# Key tables$/m);
  assert.ok(!read('SKILL.md').includes(marker), 'SKILL.md has no generated block');
  assert.doesNotMatch(read('SKILL.md'), /^\| Key \| Arguments \| Does \| Writes \|$/m);
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

test('the lifecycle has nine stages; shape and handoff are aliases of intake and ship', () => {
  const reg = loadRegistry(pluginRoot);
  assert.deepEqual(reg.keys.filter((k) => k.stage).map((k) => k.name), ['intake', 'design', 'slice', 'plan', 'implement', 'verify', 'review', 'ship', 'retro']);
  assert.deepEqual(reg.keys.filter((k) => k.alias).map((k) => [k.name, k.alias]), [['shape', 'intake'], ['handoff', 'ship']]);
  const bad = structuredClone(reg);
  bad.keys.find((k) => k.name === 'shape').alias = 'status';
  bad.keys.find((k) => k.name === 'handoff').stage = true;
  const errors = registryErrors(bad, pluginRoot).join('\n');
  assert.match(errors, /shape: alias status is not a stage key/);
  assert.match(errors, /handoff: an alias is not a stage/);
});
