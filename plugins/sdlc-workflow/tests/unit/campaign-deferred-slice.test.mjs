// A slice that is built and verified, except the runtime evidence that a recorded wall blocks,
// has the roster status `deferred`. The campaign counts it as built; ship still blocks on the
// open deferral, which it reads from the index, not from the roster status.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { openSlices } from '../../scripts/campaign.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function workflow(slices) {
  const root = mkdtempSync(path.join(tmpdir(), 'sdlc-deferred-slice-'));
  const dir = path.join(root, '.ai', 'workflows', 'demo');
  mkdirSync(dir, { recursive: true });
  const rows = slices.map(([slug, status]) => `  - slug: ${slug}\n    status: ${status}`).join('\n');
  writeFileSync(path.join(dir, '00-index.md'), `---\nschema: sdlc/v1\ntype: index\nslug: demo\nslices:\n${rows}\n---\n`);
  return root;
}

test('a work packet whose slices are complete and deferred passes the built check', () => {
  const root = workflow([['api', 'complete'], ['screen', 'deferred']]);
  try {
    assert.deepEqual(openSlices(root, 'demo'), []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a slice in progress still holds the work packet open', () => {
  const root = workflow([['api', 'deferred'], ['screen', 'in-progress']]);
  try {
    assert.deepEqual(openSlices(root, 'demo'), ['screen']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('the roster schema and the verify stage know the deferred status', () => {
  const schema = readFileSync(path.join(pluginRoot, 'schemas', 'frontmatter.schema.json'), 'utf8');
  assert.equal((schema.match(/"defined", "in-progress", "complete", "deferred", "skipped", "dropped"/g) || []).length, 3);
  // `record stage-done` owns the rule (lib/stage-done.mjs); the verify card cites it.
  const verify = readFileSync(path.join(pluginRoot, 'skills', 'wf', 'reference', 'verify.md'), 'utf8');
  assert.match(verify, /`record stage-done` sets the roster status\./);
  assert.doesNotMatch(verify, /A `partial` whose only residue is open runtime-evidence deferrals sets `status: deferred`/);
  const stageDone = readFileSync(path.join(pluginRoot, 'lib', 'stage-done.mjs'), 'utf8');
  assert.match(stageDone, /residue is open deferrals gives `deferred`/);
});

test('a write-back that reports ok but wrote nothing is logged as a failure', () => {
  const yolo = readFileSync(path.join(pluginRoot, 'skills', 'wf', 'workflows', 'yolo.js'), 'utf8');
  assert.match(yolo, /complete but the write-back wrote nothing/);
  assert.doesNotMatch(yolo, /\['\(nothing\)'\]/);
});
