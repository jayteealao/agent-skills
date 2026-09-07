// The W9 surface freeze (WIDE-VIEW-REPAIR-PLAN §11).
//
// (1) The six counts on the working tree equal the pins in surface-policy.json,
//     so `npm test` fails when a key, mode, rubric, aggregate, artifact stem, or
//     frontmatter type is added without the one-line pin change — and when one
//     is deleted without lowering the pin (the file must state the tree).
// (2) checkSurface semantics: over the pin fails; under the pin is slack.
// (3) The counters see the members the docs name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DIMENSIONS, POLICY_PATH, checkSurface, countSurface, readPolicy, surfaceMembers, tableRows,
} from '../../scripts/verify-surface.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('surface-policy.json pins equal the working tree counts', () => {
  const policy = readPolicy(POLICY_PATH);
  const counts = countSurface(pluginRoot);
  for (const d of DIMENSIONS) {
    assert.equal(counts[d], policy[d], `${d}: tree has ${counts[d]}, surface-policy.json pins ${policy[d]} — a surface changed; meet SURFACE-POLICY.md §2 and change the pin in the same commit`);
  }
});

test('the counters see the surface the docs name', () => {
  const m = surfaceMembers(pluginRoot);
  for (const k of ['intake', 'shape', 'slice', 'plan', 'implement', 'verify', 'review', 'handoff', 'ship', 'retro', 'status', 'task', 'auto', 'yolo']) {
    assert.ok(m.keys.includes(k), `keys lacks ${k}`);
  }
  assert.equal(new Set(m.keys).size, m.keys.length, 'a key appears twice in the SKILL.md tables');
  for (const mode of ['fix', 'rca', 'audit', 'adopt', 'amend', 'modernize']) assert.ok(m.intakeModes.includes(mode), `intakeModes lacks ${mode}`);
  for (const r of ['correctness', 'security', 'intent-fidelity']) assert.ok(m.reviewRubrics.includes(r), `reviewRubrics lacks ${r}`);
  for (const a of ['all', 'pre-merge', 'quick']) assert.ok(m.aggregates.includes(a), `aggregates lacks ${a}`);
  for (const s of ['00-index.md', '04-plan-<X>.md', '09-ship-run-<X>.md']) assert.ok(m.artifactStems.includes(s), `artifactStems lacks ${s}`);
  for (const t of ['index', 'plan', 'review', 'ship-run']) assert.ok(m.frontmatterTypes.includes(t), `frontmatterTypes lacks ${t}`);
});

test('checkSurface: over the pin fails and names the dimension; under the pin is slack', () => {
  const policy = { keys: 22, intakeModes: 12, reviewRubrics: 11, aggregates: 7, artifactStems: 93, frontmatterTypes: 66 };
  assert.deepEqual(checkSurface({ ...policy }, policy), { failures: [], slack: [] });
  const over = checkSurface({ ...policy, keys: 23, aggregates: 6 }, policy);
  assert.equal(over.failures.length, 1);
  assert.match(over.failures[0], /^keys: 23 exceeds the pin of 22/);
  assert.deepEqual(over.slack, ['aggregates: 6 of 7']);
});

test('tableRows: collects rows of the named table only, skipping the separator', () => {
  const text = '| Key | Arguments |\n|---|---|\n| `a` | x |\n| `b` | y |\n\nprose\n\n| Mode | Does |\n|---|---|\n| `c` | z |\n\n| Key | Arguments |\n|---|---|\n| `d` | w |\n';
  assert.deepEqual(tableRows(text, 'Key').map((r) => r.slice(0, 5)), ['| `a`', '| `b`', '| `d`']);
  assert.equal(tableRows(text, 'Mode').length, 1);
});

test('the gate runs green on the working tree and exits 1 when a pin is undercut', () => {
  const ok = spawnSync(process.execPath, [path.join(pluginRoot, 'scripts', 'verify-surface.mjs'), '--json'], { encoding: 'utf-8' });
  assert.equal(ok.status, 0, ok.stderr);
  const report = JSON.parse(ok.stdout);
  assert.deepEqual(report.failures, []);
  assert.deepEqual(Object.keys(report.counts).sort(), [...DIMENSIONS].sort());
});
