// Each failure class of scripts/goal.mjs prints a fix: who repairs it, and for the agent the
// exact next command, which names a real command of a real script.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertFix } from '../helpers/fix-shape.mjs';
import { conditionText } from '../../lib/goal.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = path.join(pluginRoot, 'scripts', 'goal.mjs');
const S = 'billing';

function makeRoot() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'goal-fix-'));
  const dir = path.join(root, '.ai', 'workflows', S);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, '00-index.md'), `---\nschema: sdlc/v1\ntype: index\nslug: ${S}\nworkflow-type: standard\n---\n`);
  return { root, dir, done: () => rmSync(root, { recursive: true, force: true }) };
}

function run(root, cmd, slug, ...rest) {
  const env = { ...process.env, SDLC_HOME: path.join(root, 'home') };
  try {
    return JSON.parse(execFileSync(process.execPath, [SCRIPT, cmd, root, slug, ...rest], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env }));
  } catch (e) {
    return { ...JSON.parse(e.stdout), exit: e.status };
  }
}

async function fails(r, error, { who, command }) {
  assert.equal(r.ok, false, JSON.stringify(r));
  assert.equal(r.exit, 1, 'a failure exits 1');
  assert.match(r.error, error);
  await assertFix(r.fix, { who, command });
  return r.fix;
}

test('goal.mjs: every failure class names its fix', async () => {
  const f = makeRoot();
  try {
    const none = await fails(run(f.root, 'arm', 'nope'), /no workflow nope/, { who: 'agent', command: true });
    assert.match(none.command, /wf\.mjs" status ".+"$/);
    const host = await fails(run(f.root, 'arm', S, '--host', 'vim'), /host must be one of/, { who: 'agent', command: true });
    assert.match(host.command, /goal\.mjs" arm ".+" billing --host <claude-code\|codex\|pi>$/);
    await fails(run(f.root, 'arm', S, '--max-checks', '0'), /the contract is not valid: max-checks/, { who: 'agent', command: true });
    await fails(run(f.root, 'park', S), /park needs a gate id/, { who: 'agent', command: true });
    await fails(run(f.root, 'park', S, 'g1'), /no goal contract/, { who: 'agent', command: true });
    writeFileSync(path.join(f.dir, 'goal.md'), '---\nstate: [unclosed\n---\n');
    await fails(run(f.root, 'status', S), /goal\.md does not parse/, { who: 'agent', command: false });
  } finally { f.done(); }
});

test('a condition longer than the host accepts is the person\'s', async () => {
  let err;
  try { conditionText({ script: 'x'.repeat(5000), root: '/r', slug: 's', maxChecks: 3 }); } catch (e) { err = e; }
  assert.match(err.message, /above the limit/);
  await assertFix(err.fix, { who: 'person', command: false });
});
