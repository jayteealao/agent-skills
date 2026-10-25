// What stays on this machine and what a shell may write. Every dot file that the plugin writes
// into a workflow folder is on the local list or on the synced list; a shell write into a local
// workflow path of a linked project, or a shell append to the answer logs, is refused.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { LOCAL_ONLY_ENTRIES, isLocalOnly, recordPathOf } from '../../../lib/records-root.mjs';
import { shellWriteRefusal, shellWriteTargets } from '../../../hooks/shell-write-guard.mjs';
import { LOCAL_ONLY_NAMES } from '../../../hooks/_adapter.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

// The dot files of a workflow folder that sync, each with its reason.
const SYNCED = {
  '.driver-journal.jsonl': 'the run journal: the watch of another machine reads it',
  '.implement-progress.jsonl': 'the old step record',
  '.test-receipt-<slice>.json': 'the green test run that verify reuses',
  '.implement-handover-<slice>.md': 'the handover of an implement that stopped',
  '.old': 'the old record files that a migration kept',
};
// Dot files of the plugin that live outside the workflow folders.
const ELSEWHERE = new Set(['.release.json', '.v10-cleanup.json', '.meta.json', '.campaign-journal.jsonl']);

function sources(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (e === 'node_modules') continue;
    if (statSync(p).isDirectory()) sources(p, out);
    else if (/\.(mjs|js)$/.test(e)) out.push(p);
  }
  return out;
}

test('every dot file that the plugin writes is on the local list, on the synced list, or outside the workflow folders', () => {
  const names = new Set();
  for (const dir of ['lib', 'scripts', 'hooks', path.join('skills', 'wf', 'workflows')]) {
    for (const file of sources(path.join(pluginRoot, dir))) {
      for (const m of readFileSync(file, 'utf8').matchAll(/['`/](\.[a-z][a-z0-9-]*(?:\.[a-z]+)?\.(?:json|jsonl|md|yaml))['`]/g)) names.add(m[1]);
    }
  }
  for (const n of names) {
    const known = Object.hasOwn(LOCAL_ONLY_ENTRIES, n) || Object.hasOwn(SYNCED, n) || ELSEWHERE.has(n);
    assert.ok(known, `${n}: add it to LOCAL_ONLY_ENTRIES (lib/records-root.mjs) or to SYNCED here, with its reason`);
  }
  for (const n of Object.keys(LOCAL_ONLY_ENTRIES)) assert.equal(isLocalOnly(`w1/${n}`), true, n);
  assert.deepEqual([...LOCAL_ONLY_NAMES].sort(), Object.keys(LOCAL_ONLY_ENTRIES).sort(), 'the Codex adapter keeps the same list');
  for (const n of Object.keys(SYNCED)) assert.equal(isLocalOnly(`w1/${n.replace('<slice>', 'api')}`), false, n);
  assert.equal(isLocalOnly('w1/sub/.draft/x.md'), true, 'a draft at any depth');
  assert.equal(isLocalOnly('.conflicts/w1/x.md'), true, 'the kept local copies');
  assert.equal(isLocalOnly('W1/STEPS.JSONL'), false);
  assert.equal(isLocalOnly('w1\\.control.json'), true, 'a Windows path');
});

test('the targets of shell writes', () => {
  assert.deepEqual(shellWriteTargets('echo x > .ai/workflows/w1/a.md'), ['.ai/workflows/w1/a.md']);
  assert.deepEqual(shellWriteTargets('npm test 2>&1 >> "out dir/log.txt"'), ['out dir/log.txt']);
  assert.deepEqual(shellWriteTargets('npm test > /dev/null 2>&1'), []);
  assert.deepEqual(shellWriteTargets('cat a | tee -a .ai/workflows/w1/b.md'), ['.ai/workflows/w1/b.md']);
  assert.deepEqual(shellWriteTargets('cp -r src/x .ai/workflows/w1/evidence && echo ok'), ['.ai/workflows/w1/evidence']);
  assert.deepEqual(shellWriteTargets('mv a.md b.md'), ['b.md']);
  assert.deepEqual(shellWriteTargets("Set-Content -Path '.ai/workflows/w1/c.md' -Value x"), ['.ai/workflows/w1/c.md']);
  assert.deepEqual(shellWriteTargets('Get-Date | Out-File .ai\\workflows\\w1\\d.md'), ['.ai\\workflows\\w1\\d.md']);
  assert.deepEqual(shellWriteTargets('Copy-Item a.md -Destination .ai/workflows/w1/e.md'), ['.ai/workflows/w1/e.md']);
  assert.deepEqual(shellWriteTargets("cat <<'EOF' > x.md\nhi\nEOF"), ['x.md']);
  assert.deepEqual(shellWriteTargets('git status'), []);
});

function linked() {
  const top = mkdtempSync(path.join(tmpdir(), 'shell-guard-'));
  const home = path.join(top, 'home');
  const clone = path.join(home, 'records');
  mkdirSync(path.join(clone, 'notes', 'w1'), { recursive: true });
  execFileSync('git', ['init', '-q', clone]);
  const root = path.join(top, 'project');
  mkdirSync(path.join(root, '.ai', 'workflows', 'w1'), { recursive: true });
  writeFileSync(path.join(root, '.ai', 'sdlc-config.json'), JSON.stringify({ records: { project: 'notes' } }));
  const saved = process.env.SDLC_HOME;
  process.env.SDLC_HOME = home;
  return { top, home, clone, root, done: () => { if (saved === undefined) delete process.env.SDLC_HOME; else process.env.SDLC_HOME = saved; rmSync(top, { recursive: true, force: true }); } };
}

test('a shell write into a local workflow path of a linked project is refused with the real place; a draft passes', () => {
  const w = linked();
  try {
    const r = shellWriteRefusal('npm test > .ai/workflows/w1/verify-evidence/run.txt', w.root, w.root);
    assert.ok(r && r.includes(path.join(w.clone, 'notes', 'w1', 'verify-evidence', 'run.txt')), r);
    assert.equal(shellWriteRefusal('echo x > .ai/workflows/w1/.draft/04-plan.md', w.root, w.root), null);
    assert.equal(shellWriteRefusal(`echo x > "${path.join(w.clone, 'notes', 'w1', 'run.txt')}"`, w.root, w.root), null, 'a write in the clone passes');
    assert.equal(shellWriteRefusal('echo x > src/a.js', w.root, w.root), null);
    assert.equal(recordPathOf(w.root, path.join(w.root, 'src', 'a.js')), path.join(w.root, 'src', 'a.js'));
  } finally { w.done(); }
});

test('a shell append to the answer logs is refused and names decide add, also in an unlinked project', () => {
  const r = shellWriteRefusal('echo "- yes" >> .ai/workflows/w1/po-answers.md', '/r', '/r');
  assert.match(r, /decide add/);
  assert.match(shellWriteRefusal('Add-Content .ai/workflows/w1/steer.md "x"', '/r', '/r'), /decide add/);
});

test('the folded PreToolUse hook runs the shell guard for Bash and PowerShell payloads', () => {
  const w = linked();
  try {
    const hook = path.join(pluginRoot, 'hooks', 'pre-tool-use-all.mjs');
    for (const tool_name of ['Bash', 'PowerShell']) {
      const h = spawnSync(process.execPath, [hook], { input: JSON.stringify({ cwd: w.root, tool_name, tool_input: { command: 'echo x > .ai/workflows/w1/notes.md' } }), encoding: 'utf8', env: process.env });
      assert.equal(h.status, 2, `${tool_name}: ${h.stderr}`);
      assert.match(h.stderr, /records repo clone/);
    }
    const wiring = JSON.parse(readFileSync(path.join(pluginRoot, 'hooks', 'hooks.json'), 'utf8')).hooks.PreToolUse[0].matcher;
    assert.match(wiring, /PowerShell/);
  } finally { w.done(); }
});

test('the Codex adapter sends the path of an Update patch into a linked workflow folder to the check', () => {
  const w = linked();
  try {
    const hook = path.join(pluginRoot, 'hooks', 'pre-tool-use.mjs');
    const patch = '*** Begin Patch\n*** Update File: .ai/workflows/w1/notes.md\n@@\n-a\n+b\n*** End Patch\n';
    const h = spawnSync(process.execPath, [hook, '--plugin-root', pluginRoot], { input: JSON.stringify({ cwd: w.root, hook_event_name: 'PreToolUse', tool_name: 'apply_patch', tool_input: { input: patch } }), encoding: 'utf8', env: process.env });
    assert.equal(h.status, 2, h.stdout + h.stderr);
    assert.match(h.stdout + h.stderr, /records repo clone/);
  } finally { w.done(); }
});
