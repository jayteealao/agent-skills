// lib/deferrals.mjs and `wf.mjs defer check`: open deferrals, their clearing probes, person tasks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { checkDeferrals, deferralLine, openDeferrals } from '../../lib/deferrals.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const node = JSON.stringify(process.execPath);

function fixture(deferrals) {
  const root = mkdtempSync(path.join(tmpdir(), 'sdlc-defer-'));
  const dir = path.join(root, '.ai', 'workflows', 'demo');
  mkdirSync(dir, { recursive: true });
  const yaml = deferrals.map((d) => [
    `  - slice: ${d.slice}`,
    `    reason: "${d.reason}"`,
    `    clearing-event: "${d.event}"`,
    ...(d.probe ? [`    clearing-probe: '${d.probe}'`] : []),
    `    cleared-by: ${d.cleared ?? 'null'}`,
    ...(d.needed ? [`    needed-by: ${d.needed}`] : []),
  ].join('\n')).join('\n');
  writeFileSync(path.join(dir, '00-index.md'), `---\nschema: sdlc/v1\ntype: index\nslug: demo\nruntime-evidence-deferrals:\n${yaml}\n---\n# demo\n`);
  return { root, dir, done: () => rmSync(root, { recursive: true, force: true }) };
}

test('openDeferrals skips the cleared entries and a missing index', () => {
  const f = fixture([
    { slice: 'a', reason: 'no emulator', event: 'boot the AVD' },
    { slice: 'b', reason: 'no creds', event: 'set the key', cleared: 'probe-1' },
  ]);
  try {
    assert.deepEqual(openDeferrals(f.dir).map((d) => d.slice), ['a']);
    assert.deepEqual(openDeferrals(path.join(f.root, 'nope')), []);
  } finally { f.done(); }
});

test('checkDeferrals: unchanged, changed and no-probe, and the person task of the next slice', () => {
  const f = fixture([
    { slice: 'a', reason: 'r', event: 'boot the AVD', probe: 'fails', needed: 'c' },
    { slice: 'b', reason: 'r', event: 'set the key', probe: 'passes', needed: 'c' },
    { slice: 'd', reason: 'r', event: 'buy a device' },
  ]);
  try {
    const probe = (cmd) => ({ ok: cmd === 'passes', tail: cmd === 'passes' ? 'ok' : 'no device' });
    const r = checkDeferrals(f.root, 'demo', { next: 'c', probe });
    assert.deepEqual(r.entries.map((e) => [e.slice, e.state, e.neededNow]), [['a', 'unchanged', true], ['b', 'changed', false], ['d', 'no-probe', false]]);
    assert.deepEqual(r.stop.map((e) => e.slice), ['a']);
    assert.equal(deferralLine(r.entries[0]), 'a: still open, not probed again — boot the AVD; needed by c (now: a person task)');
    assert.deepEqual(checkDeferrals(f.root, 'demo', { next: 'x', probe }).stop, []);
  } finally { f.done(); }
});

test('wf.mjs defer check runs the real probe and exits 1 for a person task', () => {
  const f = fixture([{ slice: 'a', reason: 'r', event: 'make the flag file', probe: `${node} -e "process.exit(require(\\"fs\\").existsSync(\\"flag\\")?0:1)"`, needed: 'b' }]);
  const cli = (...a) => spawnSync(process.execPath, [path.join(pluginRoot, 'scripts', 'wf.mjs'), 'defer', 'check', ...a], { encoding: 'utf8' });
  try {
    let r = cli(f.root, 'demo', '--next', 'b');
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stdout, /a: still open, not probed again — make the flag file; needed by b \(now: a person task\)/);
    writeFileSync(path.join(f.root, 'flag'), '');
    r = cli(f.root, 'demo', '--next', 'b');
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /the clearing event happened/);
  } finally { f.done(); }
});
