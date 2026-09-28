// ARTIFACT-SPLIT-PLAN S5: evidence folders are free-form and never make a
// workflow stale; `.jsonl` ledgers are ignored by the stale check too.
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { deepEqual, equal } from 'node:assert/strict';
import { EVIDENCE_DIRS, isEvidencePath, isProbeEvidencePath } from '../../../lib/hook-utils.mjs';
import { listWorkflowArtifactFiles, loadWorkflowIndex } from '../../../lib/workflow-index.mjs';

test('isEvidencePath covers probe-evidence/ and verify-evidence/ directly under a slug', () => {
  deepEqual([...EVIDENCE_DIRS], ['probe-evidence', 'verify-evidence']);
  for (const p of [
    '.ai/workflows/demo/verify-evidence/core/report.md',
    '.ai/workflows/demo/probe-evidence/login/incidental.md',
    'C:\\repo\\.ai\\workflows\\demo\\verify-evidence\\core\\report.md',
    '/abs/repo/.ai/workflows/demo/verify-evidence/core/raw.txt',
  ]) equal(isEvidencePath(p), true, p);
  for (const p of [
    '.ai/workflows/demo/06-verify-core.md',
    '.ai/workflows/demo/index-history.jsonl',
    '.ai/workflows/demo/nested/verify-evidence/x.md',
    '.ai/verify-evidence/x.md',
    'verify-evidence/core/report.md',
  ]) equal(isEvidencePath(p), false, p);
});

test('isProbeEvidencePath keeps its old meaning (probe-evidence/ only)', () => {
  equal(isProbeEvidencePath('.ai/workflows/demo/probe-evidence/login/a.md'), true);
  equal(isProbeEvidencePath('.ai/workflows/demo/verify-evidence/core/report.md'), false);
});

function write(path, text, mtimeSec) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text, 'utf-8');
  utimesSync(path, mtimeSec, mtimeSec);
}

test('the stale check ignores evidence folders and .jsonl ledgers', async () => {
  const root = mkdtempSync(join(tmpdir(), 'sdlc-stale-evidence-'));
  try {
    const dir = join(root, '.ai', 'workflows', 'demo');
    const t0 = 1_700_000_000;
    write(join(dir, '00-index.md'), '---\nschema: sdlc/v1\ntype: index\nslug: demo\nstatus: active\ncurrent-stage: verify\n---\n', t0 + 100);
    write(join(dir, '06-verify-core.md'), '---\ntype: verify\n---\n', t0);
    // All newer than the index, none of them an artifact.
    write(join(dir, 'verify-evidence', 'core', 'report.md'), 'raw\n', t0 + 500);
    write(join(dir, 'probe-evidence', 'login', 'incidental.md'), 'raw\n', t0 + 500);
    write(join(dir, 'index-history.jsonl'), '{}\n', t0 + 500);
    write(join(dir, '.read-ledger.jsonl'), '{}\n', t0 + 500);

    const files = (await listWorkflowArtifactFiles(dir)).map((p) => p.slice(dir.length + 1).replace(/\\/g, '/'));
    deepEqual(files.sort(), ['00-index.md', '06-verify-core.md']);

    let wf = await loadWorkflowIndex(join(dir, '00-index.md'), { projectRoot: root });
    equal(wf.isStale, false);
    equal(wf.classification, 'active');

    // A real artifact written after the index still marks the workflow stale.
    write(join(dir, '07-review.md'), '---\ntype: review\n---\n', t0 + 600);
    wf = await loadWorkflowIndex(join(dir, '00-index.md'), { projectRoot: root });
    equal(wf.isStale, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
