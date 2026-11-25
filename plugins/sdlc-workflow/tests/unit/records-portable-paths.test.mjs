// A record holds no path of one computer: an absolute path into .ai/ is stored relative, so the
// record reads the same on every computer. A path outside the project stays: it is a fact of
// the computer that wrote it.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { portablePath, portablePaths, readDoc, writeDoc } from '../../lib/records.mjs';

test('a path into the folder of the workflow is relative to it; one into .ai is relative to the project', () => {
  assert.equal(portablePath('C:\\Users\\j\\dev\\Secbot\\.ai\\workflows\\demo\\verify-evidence\\s1\\', 'demo'), 'verify-evidence/s1/');
  assert.equal(portablePath('/home/j/p/.ai/workflows/demo/probe-evidence/x/a.png', 'demo'), 'probe-evidence/x/a.png');
  assert.equal(portablePath('C:/Users/j/dev/Secbot/.ai/evidence/demo', 'demo'), '.ai/evidence/demo');
  assert.equal(portablePath('C:/p/.ai/workflows/other/x', 'demo'), '.ai/workflows/other/x');
  assert.equal(portablePath('C:/p/.AI/Workflows/Demo/x', 'demo'), 'x', 'Windows paths compare without case');
});

test('a path into the wf-dir in the records clone is relative to the wf-dir', () => {
  assert.equal(portablePath('C:/Users/j/.sdlc/records/secbot/demo/verify-evidence/s1/', 'demo', 'C:\\Users\\j\\.sdlc\\records\\secbot\\demo'), 'verify-evidence/s1/');
  assert.equal(portablePath('C:/Users/j/.sdlc/records/secbot/demo', 'demo', 'C:/Users/j/.sdlc/records/secbot/demo/'), './');
  assert.equal(portablePath('C:/Users/j/.sdlc/records/secbot/demo2/x', 'demo', 'C:/Users/j/.sdlc/records/secbot/demo'), 'C:/Users/j/.sdlc/records/secbot/demo2/x', 'a folder with a longer name is not the wf-dir');
});

test('every other value stays', () => {
  for (const v of ['C:/Users/j/dev/Secbot-wt/feature', 'verify-evidence/s1/', 'see C:/x/.ai/y', 'https://x/.ai/y', '']) assert.equal(portablePath(v, 'demo'), v);
  assert.equal(portablePath(3, 'demo'), 3);
  const fm = { slug: 'demo', list: ['C:/p/.ai/workflows/demo/a'], deep: { run: '/p/.ai/run/demo' }, n: 2, ok: true };
  assert.deepEqual(portablePaths(fm, 'demo'), { slug: 'demo', list: ['a'], deep: { run: '.ai/run/demo' }, n: 2, ok: true });
});

test('a record written with an absolute evidence-dir is stored with a relative one', () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'portable-')), '.ai', 'workflows', 'demo');
  try {
    writeDoc(dir, '04-plan-s1.md', { frontmatter: { schema: 'sdlc/v1', type: 'plan', slug: 'demo', slice: 's1', 'evidence-dir': join(dir, 'verify-evidence', 's1') }, body: '# Plan\n' });
    assert.equal(readDoc(dir, '04-plan-s1.md').frontmatter['evidence-dir'], 'verify-evidence/s1');
  } finally { rmSync(join(dir, '..', '..', '..'), { recursive: true, force: true }); }
});
