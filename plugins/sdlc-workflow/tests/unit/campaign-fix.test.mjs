// Every failure of campaign.mjs names its fix: a table of the failure classes of the walk, each
// with who repairs it and, for the agent, a command that names a real sub-command.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { run } from '../../scripts/campaign.mjs';
import { assertFix, words } from '../helpers/fix-shape.mjs';

const SRC = 'brainstorm-demo';
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const wf = (root, slug) => path.join(root, '.ai', 'workflows', slug);
const WRITE_UP = { 'ux-impact': 'none', 'ux-impact-confirmed': true, 'try-out': 'no', 'estimated-slices': 8 };

function board(work, items) {
  return {
    schema: 'sdlc/v1', artifact: 'brainstorm-board', slug: SRC, topic: 'demo',
    stack: { platforms: ['node'], languages: ['js'], 'user-confirmed': true },
    areas: [{ key: 'eng', name: 'Engine', side: 'solution', state: 'explored', scope: 'keep' }],
    threads: [{ key: 'main', name: 'Main', area: 'eng', state: 'live' }],
    items: items.map((key) => ({ key, kind: 'decision', thread: 'main', text: `Decision ${key}.`, source: 'person', scope: 'keep', session: 1, 'decided-at': '2026-10-24T00:00:00Z' })),
    work,
  };
}

const PACKET = (key, order, items, extra = {}) => ({ key, title: key, shape: 'intake', slug: `demo-${key}`, entry: 'x', state: 'proposed', order, items, goal: `Build ${key}.`, 'acceptance-criteria': [`${key} runs.`], ...WRITE_UP, ...(order > 1 ? { 'why-here': 'after the first' } : {}), ...extra });

function fixture() {
  const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'campaign-fix-')));
  git(root, 'init', '-q', '-b', 'main');
  writeFileSync(path.join(root, '.gitignore'), '.ai/\n');
  writeFileSync(path.join(root, 'app.txt'), 'v0\n');
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'init');
  const dir = wf(root, SRC);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'brainstorm-board.json'), JSON.stringify(board([PACKET('engine', 1, ['d-one']), PACKET('screen', 2, ['d-two'])], ['d-one', 'd-two']), null, 2));
  const wrote = run(['write', dir]);
  assert.equal(wrote.ok, true, JSON.stringify(wrote));
  return { root, dir, done: () => rmSync(root, { recursive: true, force: true }) };
}

test('campaign.mjs: each failure class names who repairs it, and an agent command that exists', async () => {
  const f = fixture();
  const empty = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'campaign-fix-empty-')));
  try {
    const bad = path.join(empty, '.ai', 'workflows', 'bad');
    mkdirSync(bad, { recursive: true });
    writeFileSync(path.join(bad, 'brainstorm-board.json'), JSON.stringify(board([PACKET('lost', 1, ['d-none'])], ['d-one']), null, 2));
    mkdirSync(wf(f.root, 'brainstorm-nolist'), { recursive: true });

    // [label, argv, who, command?, error pattern]
    const table = [
      ['no board', ['check', path.join(empty, 'nothing')], 'agent', false, /no brainstorm-board\.json/],
      ['a board that fails the list check', ['check', bad], 'agent', true, /./],
      ['a board that fails the list check, at write', ['write', bad], 'agent', true, /./],
      ['no source folder', ['status', f.root, 'brainstorm-nope'], 'agent', true, /no source folder/],
      ['a source with no list', ['status', f.root, 'brainstorm-nolist'], 'person', false, /has no list/],
      ['a key that is not a packet', ['open', f.root, SRC, 'nope'], 'agent', true, /is not a packet of the list/],
      ['start before open', ['start', f.root, SRC, 'engine'], 'agent', true, /is not open/],
      ['close with no state', ['close', f.root, SRC, 'engine', 'maybe'], 'agent', false, /done or dropped/],
      ['close done of a build packet', ['close', f.root, SRC, 'engine', 'done'], 'agent', true, /is a build packet/],
      ['skip with no reason', ['skip', f.root, SRC, 'engine'], 'agent', true, /--reason/],
      ['ahead with no keys', ['ahead', f.root, SRC], 'agent', true, /name each packet/],
      ['an answer of how far that is not one', ['next', f.root, SRC, '--how-far', 'some'], 'agent', true, /--how-far is next, all or a number/],
      ['slice-order with another action', ['slice-order', f.root, 'demo-engine', 'drop'], 'agent', true, /the action is add/],
      ['slice-order with one slice', ['slice-order', f.root, 'demo-engine', 'add', '--slice', 'a'], 'agent', true, /give --slice/],
      ['slice-order before the roster', ['slice-order', f.root, 'demo-engine', 'add', '--slice', 'a', '--after', 'b'], 'agent', false, /does not exist/],
      ['migrate with no phase', ['migrate', f.root, SRC, 'later'], 'agent', true, /the phase is report/],
      ['migrate report with no old ledger', ['migrate', f.root, SRC, 'report'], 'agent', true, /no old campaign ledger/],
      ['remove-worktree with no path', ['remove-worktree', f.root, SRC], 'agent', true, /give the worktree path/],
      ['remove-worktree of a path that is no worktree', ['remove-worktree', f.root, SRC, empty], 'agent', false, /is not a worktree/],
    ];
    for (const [label, argv, who, command, pattern] of table) {
      const r = run(argv);
      assert.equal(r.ok, false, `${label}: ${JSON.stringify(r)}`);
      assert.match(r.error, pattern, label);
      await assertFix(r.fix, { who, command });
    }

    // The walk: open, then a start that is not on the list branch names land; done before built names next.
    assert.equal(run(['open', f.root, SRC, 'engine']).ok, true);
    const offBranch = run(['start', f.root, SRC, 'engine']);
    await assertFix(offBranch.fix, { who: 'agent', command: true });
    assert.match(offBranch.fix.command, / land /);
    const early = run(['done', f.root, SRC, 'engine']);
    await assertFix(early.fix, { who: 'agent', command: true });
    assert.match(early.fix.command, / next /);
    const reopen = run(['reopen', f.root, SRC, 'screen']);
    await assertFix(reopen.fix, { who: 'agent', command: true });
  } finally {
    f.done();
    rmSync(empty, { recursive: true, force: true });
  }
});

test('next: the how-far answer is recorded under its stable key, and ask-how-far returns the last one', () => {
  const f = fixture();
  try {
    for (const key of ['engine', 'screen']) assert.equal(run(['open', f.root, SRC, key]).ok, true);
    const first = run(['next', f.root, SRC]);
    assert.equal(first.action, 'ask-how-far');
    assert.equal(first.howFar, null, 'no answer yet');
    assert.equal(first.recordHowFar, undefined);
    const answered = run(['next', f.root, SRC, '--how-far', 'all', '--since', first.since]);
    assert.ok(answered.recordHowFar, JSON.stringify(answered));
    assert.match(answered.recordHowFar, / decide add ".+" brainstorm-demo --kind answer --key campaign-how-far --question ".+" --answer "all"$/);
    // The agent runs the command as the walk prints it.
    const args = words(answered.recordHowFar).slice(1);
    const rec = spawnSync(process.execPath, args, { encoding: 'utf8' });
    assert.equal(rec.status, 0, rec.stderr);
    assert.equal(run(['next', f.root, SRC, '--how-far', 'all', '--since', first.since]).recordHowFar, undefined, 'a recorded answer is not recorded again');
    assert.ok(run(['next', f.root, SRC, '--how-far', '2', '--since', first.since]).recordHowFar, 'a new answer is recorded');
    assert.deepEqual(run(['next', f.root, SRC]).howFar, { answer: 'all' });
  } finally { f.done(); }
});

test('campaign.mjs: a gate of the person and a defect name the person, with no command', async () => {
  const f = fixture();
  const home = mkdtempSync(path.join(os.tmpdir(), 'campaign-fix-home-'));
  const before = process.env.SDLC_HOME;
  process.env.SDLC_HOME = home;
  try {
    assert.equal(run(['open', f.root, SRC, 'engine']).ok, true);
    assert.equal(run(['land', f.root, SRC]).ok, true);
    assert.equal(run(['start', f.root, SRC, 'engine']).ok, true);
    writeFileSync(path.join(wf(f.root, 'demo-engine'), '03-slice.md'), '---\ntype: slice\n---\n');
    assert.equal(run(['built', f.root, SRC, 'engine', '--no-push']).ok, true);
    // The fidelity row that is not honored waits for the person.
    writeFileSync(path.join(wf(f.root, 'demo-engine'), '07-review.md'), '# Review\n\n## Decision Fidelity\n\n| Key | Verdict | Evidence | Approval |\n|---|---|---|---|\n| d-one | narrowed | app.txt:1 | — |\n');
    const gate = run(['done', f.root, SRC, 'engine', '--no-push']);
    assert.match(gate.error, /not honored and not approved/);
    await assertFix(gate.fix, { who: 'person', command: false });

    // The stacked shape: no packet runs ahead of another, and the person picks the shape.
    writeFileSync(path.join(f.root, '.ai', 'ship-plan.md'), '---\npr-shape: stacked\n---\n');
    const stacked = run(['skip', f.root, SRC, 'screen', '--reason', 'later']);
    assert.match(stacked.error, /stacked shape/);
    await assertFix(stacked.fix, { who: 'person', command: false });

    // An error with no fix of its own is a defect: the fix says to report it and names the log.
    const defect = run(['status', f.root, { toString() { throw new Error('a bug'); } }]);
    assert.equal(defect.ok, false);
    await assertFix(defect.fix, { who: 'person', command: false });
    assert.match(defect.fix.do, /defect of the plugin/);
    assert.ok(defect.fix.do.includes(path.join(home, 'errors.log')), defect.fix.do);
  } finally {
    if (before === undefined) delete process.env.SDLC_HOME; else process.env.SDLC_HOME = before;
    f.done();
    rmSync(home, { recursive: true, force: true });
  }
});
