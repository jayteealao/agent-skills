// tests/unit/gates.test.mjs — the two single-source gates run green on this tree
// (SINGLE-SOURCE-PLAN W6).
//
//   verify-host-neutrality — host-mechanics wording fails outside the permanent
//     exception list; the burndown allowlist is EMPTY at cutover and stays so.
//   verify-release-versions — three in-tree carriers + two root catalogs agree.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('host-neutrality gate: clean, with an empty burndown allowlist', () => {
  const r = spawnSync(process.execPath, [path.join(pluginRoot, 'scripts', 'verify-host-neutrality.mjs'), '--json'], {
    cwd: pluginRoot, encoding: 'utf8',
  });
  const out = JSON.parse(r.stdout || '{}');
  assert.equal(r.status, 0, `findings:\n${(out.findings ?? []).map((f) => `  [${f.family}] ${f.file}:${f.line} ${f.text}`).join('\n')}\nproblems: ${(out.problems ?? []).join('; ')}\nstderr: ${r.stderr}`);
  assert.deepEqual(out.findings, []);
  assert.deepEqual(out.problems, []);
  const allow = JSON.parse(readFileSync(path.join(pluginRoot, 'scripts', 'host-neutrality-allowlist.json'), 'utf8'));
  assert.deepEqual(allow.files, [], 'the burndown allowlist must be empty at and after cutover');
});

test('host-neutrality gate: the permanent exception list is exactly the §3.3 budget', async () => {
  const src = readFileSync(path.join(pluginRoot, 'scripts', 'verify-host-neutrality.mjs'), 'utf8');
  const contract = [...src.matchAll(/^\s+'(skills\/wf\/reference\/[^']+\.md)',/gm)].map((m) => m[1]);
  assert.deepEqual(contract, [
    'skills/wf/reference/_host-invocation.md',
    'skills/wf/reference/_gate-question.md',
    'skills/wf/reference/_subagents.md',
    'skills/wf/reference/_timestamp.md',
    'skills/wf/reference/yolo.md',
  ]);
});

test('release-versions gate: one version on every carrier, both root catalogs on ./plugins/sdlc-workflow', async () => {
  const { checkVersions } = await import('../../scripts/verify-release-versions.mjs');
  const r = checkVersions();
  assert.deepEqual(r.problems, []);
  assert.match(r.version, /^\d+\.\d+\.\d+$/);
});
