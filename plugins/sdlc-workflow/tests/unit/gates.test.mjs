// tests/unit/gates.test.mjs — the two single-source gates run green on this tree
// (SINGLE-SOURCE-PLAN W6).
//
//   verify-host-neutrality — host-mechanics wording fails outside the permanent
//     exception list; the burndown allowlist is EMPTY at cutover and stays so.
//   verify-release-versions — three in-tree carriers, the derived carriers
//     (runtime-manifest runtimeVersion + rendererBuildId, nav.html brand, package-lock),
//     + two root catalogs agree; _shell.mjs carries no literal (W7 §9.2).

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
  // In CI the checkout is full-history (fetch-depth 0), so the merge-base
  // comparison must actually run; a note means it silently degraded.
  if (process.env.CI) assert.equal(out.note, null, `merge-base comparison degraded in CI: ${out.note}`);
});

test('host-neutrality gate: the family roster is the documented eleven', async () => {
  const { FAMILIES } = await import('../../scripts/verify-host-neutrality.mjs');
  assert.deepEqual(FAMILIES.map((f) => f.name), [
    'claude-tools', 'claude-model-pins', 'codex-tools', 'invocation-sigil', 'plugin-root',
    'timestamp-mandate', 'claude-hook-names', 'host-names', 'stale-tree', 'retired-router',
    'arguments-token',
  ]);
});

test('host-neutrality gate: arguments-token binds SKILL.md files and clears on an earlier citation', async () => {
  const { scan } = await import('../../scripts/verify-host-neutrality.mjs');
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const root = mkdtempSync(path.join(tmpdir(), 'sdlc-arguments-token-'));
  try {
    mkdirSync(path.join(root, 'skills', 'cited'), { recursive: true });
    mkdirSync(path.join(root, 'skills', 'late'), { recursive: true });
    mkdirSync(path.join(root, 'skills', 'ref', 'reference'), { recursive: true });
    // Citation first, token after: clean.
    writeFileSync(path.join(root, 'skills', 'cited', 'SKILL.md'),
      'Read [_host-invocation.md](../wf/reference/_host-invocation.md) first.\nSplit $ARGUMENTS on whitespace.\nThe slug is $1.\n');
    // Token first, citation after: the token lines fire, the citation line does not.
    writeFileSync(path.join(root, 'skills', 'late', 'SKILL.md'),
      'Split $ARGUMENTS on whitespace.\nSee [_host-invocation.md](../wf/reference/_host-invocation.md) for `$ARGUMENTS`.\n');
    // A reference file is out of scope: wf cites the contract before it loads one.
    writeFileSync(path.join(root, 'skills', 'ref', 'reference', 'plan.md'), 'Resolve the slug from $ARGUMENTS.\n');
    const hits = scan(root).filter((f) => f.family === 'arguments-token');
    assert.deepEqual(hits.map((f) => `${f.file}:${f.line}`), ['skills/late/SKILL.md:1']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('host-neutrality gate: the permanent exception list is exactly the §3.3 budget', async () => {
  // The exported list itself, so an entry added anywhere (not only under
  // skills/wf/reference/) is caught (v9.153.1).
  const { CONTRACT_FILES } = await import('../../scripts/verify-host-neutrality.mjs');
  assert.deepEqual(CONTRACT_FILES, [
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
