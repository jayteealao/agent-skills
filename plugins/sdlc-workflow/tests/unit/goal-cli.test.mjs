// WF-GOAL-PLAN W2 — scripts/goal.mjs: arm writes the contract and the arm request, check
// prints the evidence and ends with the GOAL: line, park blocks the next check (D5), the
// cap is enforced in code (D6), resume arms again with a fresh count, and clear.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = path.join(pluginRoot, 'scripts', 'goal.mjs');
const S = 'billing';

const json = (root, ...args) => {
  try { return JSON.parse(execFileSync(process.execPath, [SCRIPT, args[0], root, S, ...args.slice(1)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })); } catch (e) { return JSON.parse(e.stdout); }
};
const check = (root) => execFileSync(process.execPath, [SCRIPT, 'check', root, S], { encoding: 'utf8' }).trim().split(/\r?\n/);

function makeRoot() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'goal cli '));
  const dir = path.join(root, '.ai', 'workflows', S);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, '00-index.md'), `---\nschema: sdlc/v1\ntype: index\nslug: ${S}\nworkflow-type: standard\n---\n`);
  writeFileSync(path.join(root, 'ok.js'), 'console.log("all good"); process.exit(0);\n');
  writeFileSync(path.join(root, 'bad.js'), 'console.log("one failure"); process.exit(1);\n');
  return root;
}

test('kind proofs: arm, check MET, resume with a failing proof, park, the cap, and clear', () => {
  const root = makeRoot();
  try {
    const a = json(root, 'arm', '--objective', 'CI green', '--proof', 'node ok.js', '--max-checks', '2');
    assert.equal(a.ok, true, JSON.stringify(a));
    assert.equal(a.kind, 'proofs');
    assert.match(a.arm.command, /^\/goal The goal is met only when/);
    const req = JSON.parse(readFileSync(path.join(root, '.ai', 'workflows', S, 'goal', 'arm.json'), 'utf8'));
    assert.equal(req.state, 'pending', 'the mod reads the arm request at the end of the turn');

    const met = check(root);
    assert.equal(met.at(-1), 'GOAL: MET');
    assert.ok(met.some((l) => l.includes('$ node ok.js')) && met.some((l) => l.includes('| all good')), 'the evidence is in the output');
    assert.equal(json(root, 'status').state, 'met');

    const again = json(root, 'arm', '--proof', 'node ok.js', '--proof', 'node bad.js');
    assert.equal(again.arming, 2);
    assert.equal(check(root).at(-1), 'GOAL: NOT-MET 1 of 2 proof(s) fail: node bad.js');
    assert.equal(json(root, 'status').checks, 1, 'the count restarts at each arming');
    assert.equal(check(root).at(-1), 'GOAL: NOT-MET 1 of 2 proof(s) fail: node bad.js');
    assert.match(check(root).at(-1), /^GOAL: BLOCKED budget: 2 checks used/);

    json(root, 'arm');
    assert.equal(json(root, 'park', 'design-confirm', '--reason', 'the person confirms the boards').ok, true);
    assert.equal(check(root).at(-1), 'GOAL: BLOCKED gate design-confirm: the person confirms the boards');
    json(root, 'arm');
    assert.equal(json(root, 'status').parked, null, 'resume clears the park');

    const c = json(root, 'clear');
    assert.equal(c.state, 'cleared');
    assert.match(c.host, /\/goal clear/);
    assert.match(check(root).at(-1), /^GOAL: BLOCKED the goal is cleared/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('kind lifecycle: the check names the next stage', () => {
  const root = makeRoot();
  try {
    assert.equal(json(root, 'arm').kind, 'lifecycle');
    assert.equal(check(root).at(-1), 'GOAL: NOT-MET next: intake. the shape phase of intake has not run');
    assert.equal(json(root, 'lifecycle').next.stage, 'intake');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a check with no contract is BLOCKED and still ends with the GOAL: line', () => {
  const root = makeRoot();
  try {
    assert.match(check(root).at(-1), /^GOAL: BLOCKED no goal contract/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('arm reads the index of the record layout: an optimize workflow arms kind optimize', async () => {
  const { writeDoc } = await import('../../lib/records.mjs');
  const root = makeRoot();
  try {
    const dir = path.join(root, '.ai', 'workflows', S);
    rmSync(path.join(dir, '00-index.md'));
    writeDoc(dir, '00-index.md', { frontmatter: { schema: 'sdlc/v1', type: 'index', slug: S, 'workflow-type': 'optimize' } });
    assert.equal(json(root, 'arm').kind, 'optimize');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
