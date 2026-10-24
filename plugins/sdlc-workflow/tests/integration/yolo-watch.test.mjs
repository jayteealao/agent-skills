// YOLO-COMMENTARY-PLAN W0 — the built-in yolo watch (scripts/yolo-watch.mjs).
// The offsets survive a restart, no event is lost across a re-arm, the script
// exits at the run end, a silent journal emits `stale`, and every path works as
// a Windows path. The watch polls; it never depends on file-change events.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = path.join(pluginRoot, 'scripts', 'yolo-watch.mjs');
const W = await import(new URL('../../scripts/yolo-watch.mjs', import.meta.url));

const SLUG = 'engine-modules';
const RUN = '20261003T100000Z-engine-modules';
const T0 = Date.parse('2026-10-03T10:00:00Z');
const at = (min) => new Date(T0 + min * 60000).toISOString();

function git(root, ...args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

// A repo with a space in its path, so every path is quoted the hard way on Windows.
function makeRepo() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'yolo watch '));
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 'watch@test');
  git(root, 'config', 'user.name', 'watch');
  writeFileSync(path.join(root, 'PRODUCT.md'), '# Product\n');
  writeFileSync(path.join(root, 'notes.txt'), 'v1\n');
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'base');
  mkdirSync(path.join(root, '.ai', 'workflows', SLUG), { recursive: true });
  writeFileSync(W.journalPath(root, SLUG), '');
  return root;
}

const line = (o) => `${JSON.stringify({ run: RUN, ...o })}\n`;
const journal = (root, ...rows) => appendFileSync(W.journalPath(root, SLUG), rows.map(line).join(''));
const clockAt = (min) => () => T0 + min * 60000;

test('stage events come only from stage agents; scouts and classifiers are noise', () => {
  const root = makeRepo();
  try {
    const w = W.createWatcher({ projectRoot: root, slugs: [SLUG], now: clockAt(0) });
    assert.deepEqual(w.pollJournals(), [], 'an empty journal gives no event');
    writeFileSync(path.join(root, '.ai', 'workflows', SLUG, '05-implement-auth.md'), '---\nstatus: complete\n---\nbody\n');
    journal(root,
      { at: at(1), seq: 1, event: 'agent-start', agent: 'orient', phase: 'Orient' },
      { at: at(2), seq: 2, event: 'agent-start', agent: 'implement:auth', phase: 'Drive', stage: 'implement', slice: 'auth' },
      { at: at(3), seq: 3, event: 'agent-start', agent: 'scout:security', phase: 'Review' },
      { at: at(4), seq: 2, event: 'agent-end', agent: 'implement:auth', status: 'complete', errors: 2 },
      { at: at(5), seq: 4, event: 'agent-start', agent: 'classify:implement:auth', stage: 'classify' },
      { at: at(5), seq: 5, event: 'agent-start', agent: 'plan-index-writeback', stage: 'plan' },
    );
    const ev = w.pollJournals();
    assert.deepEqual(ev.map((e) => e.event), ['stage-start', 'stage-end']);
    assert.equal(ev[1].stage, 'implement');
    assert.equal(ev[1].slice, 'auth');
    assert.equal(ev[1].errors, 2);
    assert.equal(ev[1].artifact, `.ai/workflows/${SLUG}/05-implement-auth.md`);
    assert.equal(ev[1].artifactStatus, 'complete');
    assert.equal(ev[1].startedAt, at(2));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('the offsets survive a restart: a new watch emits each line once', () => {
  const root = makeRepo();
  try {
    const a = W.createWatcher({ projectRoot: root, slugs: [SLUG], now: clockAt(0) });
    a.pollJournals();
    journal(root, { at: at(1), seq: 1, event: 'agent-start', agent: 'plan:auth', stage: 'plan', slice: 'auth' });
    assert.equal(a.pollJournals().length, 1);
    a.save();
    assert.ok(existsSync(W.statePath(root, SLUG)), 'the state file is written');
    journal(root, { at: at(2), seq: 1, event: 'agent-end', agent: 'plan:auth', status: 'complete', errors: 0 });
    const b = W.createWatcher({ projectRoot: root, slugs: [SLUG], now: clockAt(2) });
    const ev = b.pollJournals();
    assert.deepEqual(ev.map((e) => e.event), ['stage-end'], 'the restarted watch emits the new line only');
    assert.equal(ev[0].startedAt, at(1), 'the open stage survived the restart');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('no event is lost across a re-arm: a half-written line waits for its newline', () => {
  const root = makeRepo();
  try {
    const a = W.createWatcher({ projectRoot: root, slugs: [SLUG], now: clockAt(0) });
    a.pollJournals();
    const full = JSON.stringify({ run: RUN, at: at(1), seq: 1, event: 'agent-start', agent: 'verify:auth', stage: 'verify', slice: 'auth' });
    appendFileSync(W.journalPath(root, SLUG), full.slice(0, 30));
    assert.deepEqual(a.pollJournals(), [], 'a torn line is not read');
    a.save();
    appendFileSync(W.journalPath(root, SLUG), `${full.slice(30)}\n`);
    const b = W.createWatcher({ projectRoot: root, slugs: [SLUG], now: clockAt(1) });
    assert.deepEqual(b.pollJournals().map((e) => e.event), ['stage-start']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a first watch with no state skips the history, unless --since asks for it', () => {
  const root = makeRepo();
  try {
    journal(root,
      { at: at(1), seq: 1, event: 'agent-start', agent: 'plan:auth', stage: 'plan', slice: 'auth' },
      { at: at(2), seq: 1, event: 'agent-end', agent: 'plan:auth', status: 'complete' },
      { at: at(3), seq: 2, event: 'agent-start', agent: 'implement:auth', stage: 'implement', slice: 'auth' },
    );
    assert.deepEqual(W.createWatcher({ projectRoot: root, slugs: [SLUG], now: clockAt(3) }).pollJournals(), []);
    rmSync(W.statePath(root, SLUG), { force: true });
    const since = W.createWatcher({ projectRoot: root, slugs: [SLUG], since: 1, now: clockAt(3) }).pollJournals();
    assert.deepEqual(since.map((e) => `${e.event}:${e.stage}`), ['stage-start:implement']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a re-armed watch over a finished run is silent: a newest run-end line is never stale', () => {
  const root = makeRepo();
  try {
    journal(root,
      { at: at(0), run: 'r1', seq: 1, event: 'agent-start', agent: 'plan:auth', stage: 'plan', slice: 'auth' },
      { at: at(2), run: 'r1', seq: 1, event: 'agent-end', agent: 'plan:auth', status: 'complete' },
      { at: at(3), run: 'r1', event: 'run-end', agent: 'main-session' },
    );
    let now = T0 + 4 * 60000;
    const first = W.createWatcher({ projectRoot: root, slugs: [SLUG], now: () => now });
    assert.deepEqual(first.pollJournals(), []);
    first.save();
    // The re-arm loads the saved state, which resets `ended` for a relaunch.
    now = T0 + 10 * 60000;
    const w = W.createWatcher({ projectRoot: root, slugs: [SLUG], now: () => now });
    assert.deepEqual(w.pollJournals(), []);
    now = T0 + 60 * 60000;
    assert.deepEqual(w.pollJournals(), [], 'no stale for a run that ended');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a silent journal emits stale once; a silent journal that ended emits run-end', () => {
  const root = makeRepo();
  try {
    journal(root,
      { at: at(0), seq: 1, event: 'agent-start', agent: 'plan:auth', stage: 'plan', slice: 'auth' },
      { at: at(2), seq: 1, event: 'agent-end', agent: 'plan:auth', status: 'complete' },
      { at: at(3), seq: 2, event: 'agent-start', agent: 'implement:auth', stage: 'implement', slice: 'auth' },
    );
    let now = T0 + 3 * 60000;
    const w = W.createWatcher({ projectRoot: root, slugs: [SLUG], now: () => now });
    assert.deepEqual(w.pollJournals(), [], 'inside the 20-minute floor');
    now = T0 + 24 * 60000;
    const ev = w.pollJournals();
    assert.equal(ev.length, 1);
    assert.equal(ev[0].event, 'stale');
    assert.equal(ev[0].lastAgent, 'implement:auth');
    assert.equal(ev[0].limitMinutes, 20);
    now = T0 + 40 * 60000;
    assert.deepEqual(w.pollJournals(), [], 'stale is said once per silence');
    journal(root, { at: at(41), seq: 2, event: 'agent-end', agent: 'implement:auth', status: 'complete' });
    now = T0 + 41 * 60000;
    assert.deepEqual(w.pollJournals().map((e) => e.event), ['stage-end'], 'a new line ends the silence');
    assert.equal(w.allEnded(), false);
    now = T0 + 120 * 60000;
    const end = w.pollJournals();
    assert.deepEqual(end.map((e) => e.event), ['run-end']);
    assert.equal(end[0].inferred, true);
    assert.equal(w.allEnded(), true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('the liveness limit is the run\'s own longest gap when that exceeds the floor', () => {
  const root = makeRepo();
  try {
    journal(root,
      { at: at(0), seq: 1, event: 'agent-start', agent: 'implement:a', stage: 'implement', slice: 'a' },
      { at: at(45), seq: 1, event: 'agent-end', agent: 'implement:a', status: 'complete' },
      { at: at(46), seq: 2, event: 'agent-start', agent: 'verify:a', stage: 'verify', slice: 'a' },
    );
    let now = T0 + 46 * 60000;
    const w = W.createWatcher({ projectRoot: root, slugs: [SLUG], now: () => now });
    w.pollJournals();
    now = T0 + (46 + 30) * 60000;
    assert.deepEqual(w.pollJournals(), [], '30 minutes is inside a 45-minute cadence');
    now = T0 + (46 + 50) * 60000;
    assert.deepEqual(w.pollJournals().map((e) => e.event), ['stale']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a hard-stop gives a stop event; an intent-bearing record gives a decision event', () => {
  const root = makeRepo();
  try {
    const dir = path.join(root, '.ai', 'workflows', SLUG);
    writeFileSync(path.join(dir, '04-plan-auth.md'), '---\nstatus: awaiting-input\n---\n- D6 class: intent-bearing — pick the data shape\n');
    const w = W.createWatcher({ projectRoot: root, slugs: [SLUG], now: clockAt(0) });
    w.pollJournals();
    journal(root,
      { at: at(1), seq: 1, event: 'agent-start', agent: 'plan:auth', stage: 'plan', slice: 'auth' },
      { at: at(2), seq: 1, event: 'agent-end', agent: 'plan:auth', status: 'hard-stop' },
    );
    const ev = w.pollJournals();
    assert.deepEqual(ev.map((e) => e.event), ['stage-start', 'stage-end', 'stop', 'decision']);
    const stop = ev.find((e) => e.event === 'stop');
    assert.equal(stop.kind, 'hard-stop');
    assert.equal(stop.resume, `/wf yolo ${SLUG}`);
    const d = ev.find((e) => e.event === 'decision');
    assert.deepEqual(d.reasons, ['awaiting-input', 'intent-bearing']);
    assert.equal(d.intentBearing, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a run-end journal line ends the watch, and a new run id starts a new run', () => {
  const root = makeRepo();
  try {
    const w = W.createWatcher({ projectRoot: root, slugs: [SLUG], now: clockAt(0) });
    w.pollJournals();
    W.appendRunEnd(root, SLUG, 'stop-request', T0 + 60000);
    const ev = w.pollJournals();
    assert.deepEqual(ev.map((e) => e.event), ['run-end']);
    assert.equal(ev[0].stoppedAt, 'stop-request');
    assert.equal(ev[0].inferred, false);
    assert.equal(w.allEnded(), true);
    appendFileSync(W.journalPath(root, SLUG), `${JSON.stringify({ run: 'run-2', at: at(5), seq: 1, event: 'agent-start', agent: 'orient' })}\n`);
    w.pollJournals();
    assert.equal(w.allEnded(), false, 'a relaunched run is live again');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('new commits give one commit event each, oldest first', () => {
  const root = makeRepo();
  try {
    const w = W.createWatcher({ projectRoot: root, slugs: [SLUG], now: clockAt(0) });
    assert.deepEqual(w.pollCommits(), []);
    for (const n of [1, 2]) {
      writeFileSync(path.join(root, `f${n}.txt`), `${n}\n`);
      git(root, 'add', `f${n}.txt`);
      git(root, 'commit', '-q', '-m', `add file ${n}`);
    }
    const ev = w.pollCommits();
    assert.deepEqual(ev.map((e) => e.subject), ['add file 1', 'add file 2']);
    assert.equal(ev[0].files, 1);
    assert.deepEqual(w.pollCommits(), [], 'a commit is told once');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('protected files: a live steer entry of the store protects its path; a superseded or other entry does not', async () => {
  const { addDecision } = await import('../../lib/decisions.mjs');
  const root = makeRepo();
  try {
    const dir = path.join(root, '.ai', 'workflows', SLUG);
    addDecision(dir, { kind: 'steer', answer: 'do not touch `config/loader.ts`' });
    addDecision(dir, { key: 'k', answer: 'never edit `src/answer.ts`' });
    const w = W.createWatcher({ projectRoot: root, slugs: [SLUG], now: clockAt(0) });
    const files = Object.keys(w.states.get(SLUG).st.repo.hashes);
    assert.ok(files.includes('config/loader.ts'));
    assert.ok(!files.includes('src/answer.ts'), 'an answer is not a steer entry');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('protected files: PRODUCT.md, the paths of an old steer.md, config paths, and the person\'s uncommitted edits', () => {
  const root = makeRepo();
  try {
    const dir = path.join(root, '.ai', 'workflows', SLUG);
    writeFileSync(path.join(dir, 'steer.md'), '- do not touch `config/loader.ts` — it is being rewritten\n- prefer `src/queue.ts`\n');
    writeFileSync(path.join(root, '.ai', 'sdlc-config.json'), JSON.stringify({ yolo: { protectedFiles: ['docs/spec.md'] } }));
    writeFileSync(path.join(root, 'notes.txt'), 'the person edits this\n');
    const w = W.createWatcher({ projectRoot: root, slugs: [SLUG], now: clockAt(0) });
    const files = Object.keys(w.states.get(SLUG).st.repo.hashes);
    for (const f of ['PRODUCT.md', 'DESIGN.md', 'config/loader.ts', 'docs/spec.md', 'notes.txt']) assert.ok(files.includes(f), `${f} is protected`);
    assert.ok(!files.includes('src/queue.ts'), 'a preference line protects nothing');
    writeFileSync(path.join(root, 'PRODUCT.md'), '# Product\nchanged by a stage\n');
    writeFileSync(path.join(root, 'notes.txt'), 'overwritten\n');
    const ev = w.pollProtected();
    assert.deepEqual(ev.map((e) => `${e.file}:${e.change}:${e.dirtyAtStart}`).sort(), ['PRODUCT.md:modified:false', 'notes.txt:modified:true']);
    assert.deepEqual(w.pollProtected(), []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('control: a stop request names a stage or current; there is no pause', () => {
  const root = makeRepo();
  try {
    const v = W.writeControl(root, SLUG, 'stop', ['verify'], T0);
    assert.deepEqual(v, { action: 'stop', after: 'verify', requestedAt: at(0) });
    assert.deepEqual(JSON.parse(readFileSync(W.controlPath(root, SLUG), 'utf8')), v);
    assert.throws(() => W.writeControl(root, SLUG, 'stop', ['handoff']), /after/);
    assert.throws(() => W.writeControl(root, SLUG, 'pause', ['2026-10-03T15:00:00Z']), /the action is stop, clear, or show/);
    W.writeControl(root, SLUG, 'clear', []);
    assert.equal(existsSync(W.controlPath(root, SLUG)), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('note: commentary.md gets a header once and one timed section per note', () => {
  const root = makeRepo();
  try {
    W.appendNote(root, SLUG, 'Implement on auth ended. It made 7 commits.', 'stage-end', T0);
    W.appendNote(root, SLUG, 'Verify started.', null, T0 + 60000);
    const text = readFileSync(W.commentaryPath(root, SLUG), 'utf8');
    assert.equal((text.match(/^# Commentary/gm) || []).length, 1);
    assert.match(text, /## 2026-10-03 10:00 UTC — stage-end\n\nImplement on auth ended\. It made 7 commits\./);
    assert.match(text, /## 2026-10-03 10:01 UTC\n\nVerify started\./);
    assert.throws(() => W.appendNote(root, SLUG, '   '), /empty/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('the CLI exits by itself after the run-end line, and the run-end is its last line', async () => {
  const root = makeRepo();
  try {
    const child = spawn(process.execPath, [SCRIPT, root, SLUG], {
      env: { ...process.env, SDLC_WATCH_JOURNAL_MS: '40', SDLC_WATCH_GIT_MS: '40', SDLC_WATCH_USAGE_MS: '100000', SDLC_USAGE_DIR: path.join(root, 'no-usage') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    child.stdout.on('data', (d) => { stdout += d; });
    // A first watch reads the lines already in the journal as history and emits
    // nothing for them, so write the run's lines only after the first poll saved
    // its state. Under a loaded test run, the child can take a second to start.
    const deadline = Date.now() + 10000;
    while (!existsSync(W.statePath(root, SLUG)) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 25));
    assert.ok(existsSync(W.statePath(root, SLUG)), 'the watch polled once');
    journal(root,
      { at: new Date().toISOString(), seq: 1, event: 'agent-start', agent: 'review', stage: 'review' },
      { at: new Date().toISOString(), seq: 1, event: 'agent-end', agent: 'review', status: 'complete' },
    );
    await new Promise((r) => setTimeout(r, 300));
    W.appendRunEnd(root, SLUG, null);
    const code = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { child.kill(); reject(new Error(`watch did not exit; stdout: ${stdout}`)); }, 8000);
      child.on('exit', (c) => { clearTimeout(timer); resolve(c); });
    });
    assert.equal(code, 0);
    const events = stdout.trim().split('\n').map((l) => JSON.parse(l));
    assert.deepEqual(events.map((e) => e.event), ['stage-start', 'stage-end', 'run-end']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('the CLI writes only JSON lines to stdout and refuses an unknown slug', () => {
  const root = makeRepo();
  try {
    let err;
    try {
      execFileSync(process.execPath, [SCRIPT, root, 'no-such-slug'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) { err = e; }
    assert.equal(err.status, 2);
    assert.equal(err.stdout, '');
    execFileSync(process.execPath, [SCRIPT, 'note', root, SLUG, '--event', 'run-end'], { input: 'The run ended.\n', stdio: ['pipe', 'pipe', 'pipe'] });
    assert.match(readFileSync(W.commentaryPath(root, SLUG), 'utf8'), /— run-end\n\nThe run ended\./);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('steer protection reads backticked paths on protect and do-not-touch lines only', () => {
  assert.deepEqual(W.steerProtectedPaths([
    '- Never edit `PRODUCT.md` by hand',
    "- don't touch `src/engine/*.ts` or `config/loader.ts`",
    '- prefer `lib/queue.ts`',
    '- protect `DESIGN.md`',
  ].join('\n')), ['PRODUCT.md', 'config/loader.ts', 'DESIGN.md']);
});

// ---------------------------------------------------------------------------
// K1, K2 (YOLO-COMMENTARY-PLAN section 4): old lines that arrive later, and slugs that run at once.
// ---------------------------------------------------------------------------
test('K1: a slug journal that a merge brings in later is history, not new stage events', () => {
  const root = makeRepo();
  try {
    const w = W.createWatcher({ projectRoot: root, slugs: [SLUG], now: clockAt(0) });
    assert.deepEqual(w.pollJournals(), []);
    // The drive ran elsewhere; a merge now brings its committed journal in.
    const runId = 'r-old';
    appendFileSync(W.journalPath(root, SLUG), `${JSON.stringify({ at: at(-30), run: runId, seq: 1, event: 'agent-start', agent: 'plan:s1', stage: 'plan', slice: 's1' })}\n`);
    appendFileSync(W.journalPath(root, SLUG), `${JSON.stringify({ at: at(-28), run: runId, seq: 2, event: 'agent-end', agent: 'plan:s1', stage: 'plan', slice: 's1', status: 'complete' })}\n`);
    assert.deepEqual(w.pollJournals().filter((e) => e.slug === SLUG), []);
    appendFileSync(W.journalPath(root, SLUG), `${JSON.stringify({ at: at(1), run: 'r-new', seq: 1, event: 'agent-start', agent: 'plan:s2', stage: 'plan', slice: 's2' })}\n`);
    assert.deepEqual(w.pollJournals().map((e) => e.event), ['stage-start']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('K2: a stage end carries how many slugs run at once', () => {
  const root = makeRepo();
  try {
    const other = 'squads';
    mkdirSync(path.join(root, '.ai', 'workflows', other), { recursive: true });
    writeFileSync(W.journalPath(root, other), '');
    const w = W.createWatcher({ projectRoot: root, slugs: [SLUG, other], now: clockAt(0) });
    w.pollJournals();
    journal(root, { at: at(1), seq: 1, event: 'agent-start', agent: 'plan:a', stage: 'plan', slice: 'a' });
    appendFileSync(W.journalPath(root, other), `${JSON.stringify({ run: 'r2', at: at(1), seq: 1, event: 'agent-start', agent: 'plan:b', stage: 'plan', slice: 'b' })}\n`);
    w.pollJournals();
    journal(root, { at: at(2), seq: 1, event: 'agent-end', agent: 'plan:a', status: 'complete' });
    const end = w.pollJournals().find((e) => e.event === 'stage-end');
    assert.equal(end.parallel, 2);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// WF-WATCH-MONITOR-PLAN — F2 to F6.
// ---------------------------------------------------------------------------
const tmpDir = (name) => mkdtempSync(path.join(os.tmpdir(), `${name} `));

test('F3: a restart does not reset the silence; a long gap and a long silence across two restarts give stale', () => {
  const root = makeRepo();
  const projectsDir = tmpDir('projects');
  const lockDir = tmpDir('locks');
  try {
    journal(root,
      { at: at(0), seq: 1, event: 'agent-start', agent: 'implement:a', stage: 'implement', slice: 'a' },
      { at: at(40), seq: 1, event: 'agent-end', agent: 'implement:a', status: 'complete' },
      { at: at(41), seq: 2, event: 'agent-start', agent: 'verify:a', stage: 'verify', slice: 'a' },
    );
    const opts = { projectRoot: root, slugs: [SLUG], projectsDir, lockDir };
    const a = W.createWatcher({ ...opts, now: () => T0 + 40 * 60000 });
    a.pollJournals();
    a.save();
    const b = W.createWatcher({ ...opts, now: () => T0 + 71 * 60000 });
    assert.deepEqual(b.pollJournals(), [], 'a restart alone gives no stale: 30 minutes is inside the 40-minute cadence');
    b.save();
    const c = W.createWatcher({ ...opts, now: () => T0 + 90 * 60000 });
    const ev = c.pollJournals();
    assert.deepEqual(ev.map((e) => e.event), ['stale'], '49 minutes of silence since the last line, across two restarts');
    assert.equal(ev[0].lastAgent, 'verify:a');
    assert.equal(ev[0].signal, 'journal');
  } finally { for (const d of [root, projectsDir, lockDir]) rmSync(d, { recursive: true, force: true }); }
});

test('F3: a restart after the run ended counts from its own start', () => {
  assert.equal(W.keptWatchFrom({ watchFrom: 100, lastLineAt: 200, newest: { event: 'agent-start' } }, 999), 100, 'the run wrote after the first watch: keep its start');
  assert.equal(W.keptWatchFrom({ watchFrom: 300, lastLineAt: 200, newest: { event: 'agent-start' } }, 999), 999, 'no line since the first watch: a new launch');
  assert.equal(W.keptWatchFrom({ watchFrom: 100, lastLineAt: 200, newest: { event: 'run-end' } }, 999), 999, 'the run ended');
  assert.equal(W.keptWatchFrom({ lastLineAt: 200 }, 999), 999, 'a state from before F3');
});

function agentTranscript(projectsDir, root, label, mtimeMs) {
  const dir = path.join(projectsDir, W.projectDirName(root), 'session-1', 'subagents', 'workflows', 'wf_1');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `agent-${label.replace(/[^a-z0-9]/gi, '')}.jsonl`);
  writeFileSync(file, '{}\n');
  writeFileSync(file.replace(/\.jsonl$/, '.meta.json'), JSON.stringify({ agentType: 'workflow-subagent', description: label }));
  utimesSync(file, mtimeMs / 1000, mtimeMs / 1000);
  return file;
}

test('F6: a long agent that still writes its transcript is not stale; a silent transcript is', () => {
  const root = makeRepo();
  const projectsDir = tmpDir('projects');
  const lockDir = tmpDir('locks');
  try {
    journal(root, { at: at(0), seq: 1, event: 'agent-start', agent: 'implement:auth', stage: 'implement', slice: 'auth' });
    const file = agentTranscript(projectsDir, root, 'implement:auth', T0 + 25 * 60000);
    let now = T0;
    const w = W.createWatcher({ projectRoot: root, slugs: [SLUG], projectsDir, lockDir, now: () => now });
    w.pollJournals();
    now = T0 + 30 * 60000;
    assert.deepEqual(w.pollJournals(), [], '30 minutes of journal silence, but the transcript wrote 5 minutes ago');
    now = T0 + 41 * 60000;
    const ev = w.pollJournals();
    assert.deepEqual(ev.map((e) => e.event), ['stale'], '16 minutes of transcript silence');
    assert.equal(ev[0].signal, 'transcript');
    assert.equal(ev[0].limitMinutes, 15);
    utimesSync(file, (T0 + 50 * 60000) / 1000, (T0 + 50 * 60000) / 1000);
    now = T0 + 55 * 60000;
    assert.deepEqual(w.pollJournals(), [], 'stale is said once per agent');
  } finally { for (const d of [root, projectsDir, lockDir]) rmSync(d, { recursive: true, force: true }); }
});

test('F6: a transcript older than the agent start belongs to another agent, so the journal rule applies', () => {
  const root = makeRepo();
  const projectsDir = tmpDir('projects');
  const lockDir = tmpDir('locks');
  try {
    agentTranscript(projectsDir, root, 'implement:auth', T0 - 120 * 60000);
    journal(root, { at: at(0), seq: 1, event: 'agent-start', agent: 'implement:auth', stage: 'implement', slice: 'auth' });
    let now = T0;
    const w = W.createWatcher({ projectRoot: root, slugs: [SLUG], projectsDir, lockDir, now: () => now });
    w.pollJournals();
    now = T0 + 18 * 60000;
    assert.deepEqual(w.pollJournals(), [], 'inside the 20-minute journal floor');
    now = T0 + 21 * 60000;
    assert.deepEqual(w.pollJournals().map((e) => `${e.event}:${e.signal}`), ['stale:journal']);
  } finally { for (const d of [root, projectsDir, lockDir]) rmSync(d, { recursive: true, force: true }); }
});

test('F4: the watch writes one commentary line per stage start and per commit, and never twice', () => {
  const root = makeRepo();
  const projectsDir = tmpDir('projects');
  const lockDir = tmpDir('locks');
  try {
    const w = W.createWatcher({ projectRoot: root, slugs: [SLUG], projectsDir, lockDir, now: clockAt(0) });
    w.recordFacts(w.pollJournals());
    journal(root, { at: at(1), seq: 1, event: 'agent-start', agent: 'plan:auth', stage: 'plan', slice: 'auth' });
    w.recordFacts(w.pollJournals());
    writeFileSync(path.join(root, 'notes.txt'), 'v2\n');
    git(root, 'commit', '-q', '-am', 'feat(auth): login form');
    w.recordFacts(w.pollCommits());
    w.recordFacts(w.pollJournals());
    const slugText = readFileSync(W.commentaryPath(root, SLUG), 'utf8');
    assert.match(slugText, /^- 2026-10-03 10:01 UTC · stage start · plan · slice auth$/m);
    assert.match(slugText, /^- .+ · commit `[0-9a-f]{12}` · feat\(auth\): login form$/m);
    assert.equal(slugText.match(/^- .+ · stage start · /gm).length, 1, 'a poll with no new line writes nothing');
  } finally { for (const d of [root, projectsDir, lockDir]) rmSync(d, { recursive: true, force: true }); }
});

test('F5: a newer watch replaces an older one, and a lock whose holder died is taken again', () => {
  const root = makeRepo();
  const projectsDir = tmpDir('projects');
  const lockDir = tmpDir('locks');
  try {
    const opts = { projectRoot: root, slugs: [SLUG], projectsDir, lockDir, now: clockAt(0) };
    const older = W.createWatcher({ ...opts, lockId: 'older' });
    const newer = W.createWatcher({ ...opts, lockId: 'newer' });
    assert.equal(newer.checkLocks(), null);
    const replaced = older.checkLocks();
    assert.equal(replaced.event, 'watch-replaced');
    assert.equal(replaced.by, 'slug');
    newer.releaseLocks();
    // A lock whose holder died is taken again.
    const survivor = W.createWatcher({ ...opts, lockId: 'survivor' });
    writeFileSync(W.lockFileOf(W.journalPath(root, SLUG), lockDir), JSON.stringify({ id: 'dead', pid: 999999999, kind: 'slug' }));
    assert.equal(survivor.checkLocks(), null);
    assert.equal(JSON.parse(readFileSync(W.lockFileOf(W.journalPath(root, SLUG), lockDir), 'utf8')).id, 'survivor');
  } finally { for (const d of [root, projectsDir, lockDir]) rmSync(d, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// The live-campaign audit of 2026-10-14 — B1 to B4.
// ---------------------------------------------------------------------------
test('B1: a first watch over a journal that ends in the old run-end waits for the relaunch', () => {
  const root = makeRepo();
  const projectsDir = tmpDir('projects');
  const lockDir = tmpDir('locks');
  try {
    journal(root,
      { at: at(-30), run: 'r-old', seq: 1, event: 'agent-start', agent: 'plan:a', stage: 'plan', slice: 'a' },
      { at: at(-29), run: 'r-old', seq: 1, event: 'agent-end', agent: 'plan:a', status: 'complete' },
      { at: at(-28), run: 'r-old', event: 'run-end', agent: 'main-session' },
    );
    const w = W.createWatcher({ projectRoot: root, slugs: [SLUG], projectsDir, lockDir, now: clockAt(0) });
    assert.deepEqual(w.pollJournals(), []);
    assert.equal(w.allEnded(), false, 'the old run-end does not end the watch of the relaunch');
    journal(root, { at: at(1), run: 'r-new', seq: 1, event: 'agent-start', agent: 'plan:b', stage: 'plan', slice: 'b' });
    assert.deepEqual(w.pollJournals().map((e) => e.event), ['stage-start']);
  } finally { for (const d of [root, projectsDir, lockDir]) rmSync(d, { recursive: true, force: true }); }
});

test('B3: a linked worktree has no dirty-at-start protection; the main checkout keeps it', () => {
  const root = makeRepo();
  const wtBase = tmpDir('worktrees');
  const wt = path.join(wtBase, 'w1');
  try {
    git(root, 'worktree', 'add', '-q', '-b', 'drive', wt);
    writeFileSync(path.join(wt, 'notes.txt'), 'an earlier run\n');
    writeFileSync(path.join(root, 'notes.txt'), 'the person\n');
    const cfg = W.readConfig(root);
    assert.equal(W.isLinkedWorktree(wt), true);
    assert.equal(W.isLinkedWorktree(root), false);
    assert.deepEqual(W.protectedSet(wt, [SLUG], cfg).dirtyAtStart, [], 'a worktree holds no edits of the person');
    assert.deepEqual(W.protectedSet(root, [SLUG], cfg).dirtyAtStart, ['notes.txt']);
  } finally {
    try { git(root, 'worktree', 'remove', '--force', wt); } catch { /* gone */ }
    for (const d of [root, wtBase]) rmSync(d, { recursive: true, force: true });
  }
});

test('B3: an agent that saves a protected file many times gives one event per quiet window', () => {
  const root = makeRepo();
  const projectsDir = tmpDir('projects');
  const lockDir = tmpDir('locks');
  try {
    let now = T0;
    const w = W.createWatcher({ projectRoot: root, slugs: [SLUG], projectsDir, lockDir, now: () => now });
    writeFileSync(path.join(root, 'PRODUCT.md'), '# Product\nv2\n');
    assert.deepEqual(w.pollProtected().map((e) => e.file), ['PRODUCT.md']);
    now = T0 + 40 * 1000;
    writeFileSync(path.join(root, 'PRODUCT.md'), '# Product\nv3\n');
    assert.deepEqual(w.pollProtected(), [], 'a second save 40 seconds later is the same edit');
    now = T0 + 11 * 60000;
    writeFileSync(path.join(root, 'PRODUCT.md'), '# Product\nv4\n');
    assert.deepEqual(w.pollProtected().map((e) => e.file), ['PRODUCT.md'], 'a save after the quiet window is news');
  } finally { for (const d of [root, projectsDir, lockDir]) rmSync(d, { recursive: true, force: true }); }
});

test('B2: the lifetime is 31 minutes, 110 with --once, or the given minutes', () => {
  assert.equal(W.lifetimeMs({}, {}), 31 * 60000);
  assert.equal(W.lifetimeMs({ once: true }, {}), 110 * 60000);
  assert.equal(W.lifetimeMs({ 'max-minutes': '5' }, {}), 5 * 60000);
  assert.equal(W.lifetimeMs({}, { SDLC_WATCH_MAX_MINUTES: '2' }), 2 * 60000);
});

function runCli(args, env, { onSpawn = null, timeoutMs = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], { env: { ...process.env, SDLC_WATCH_JOURNAL_MS: '50', SDLC_WATCH_GIT_MS: '50', ...env } });
    let stdout = '';
    child.stdout.on('data', (d) => { stdout += d; });
    const kill = setTimeout(() => { child.kill(); reject(new Error(`the CLI did not exit; stdout: ${stdout}`)); }, timeoutMs);
    child.on('exit', (code) => { clearTimeout(kill); resolve({ code, lines: stdout.trim() ? stdout.trim().split('\n').map((l) => JSON.parse(l)) : [] }); });
    if (onSpawn) onSpawn();
  });
}

test('B2: a watch ends itself after its lifetime, silent without --once and with watch-timeout with it', async () => {
  const root = makeRepo();
  const lockDir = tmpDir('locks');
  const projectsDir = tmpDir('projects');
  try {
    const env = { SDLC_WATCH_LOCK_DIR: lockDir, SDLC_CLAUDE_PROJECTS_DIR: projectsDir, SDLC_USAGE_DIR: projectsDir };
    const plain = await runCli([root, SLUG, '--max-minutes', '0.01'], env);
    assert.equal(plain.code, 0);
    assert.deepEqual(plain.lines, []);
    const once = await runCli([root, SLUG, '--once', '--max-minutes', '0.01'], env);
    assert.deepEqual(once.lines.map((l) => l.event), ['watch-timeout']);
  } finally { for (const d of [root, lockDir, projectsDir]) rmSync(d, { recursive: true, force: true }); }
});

test('B4: --once exits after the first poll that gives events, and the next watch goes on from there', async () => {
  const root = makeRepo();
  const lockDir = tmpDir('locks');
  const projectsDir = tmpDir('projects');
  try {
    const env = { SDLC_WATCH_LOCK_DIR: lockDir, SDLC_CLAUDE_PROJECTS_DIR: projectsDir, SDLC_USAGE_DIR: projectsDir };
    const stamp = (min) => new Date(Date.now() + min * 60000).toISOString();
    // The line comes after the watch start: once the first poll saved the state.
    const afterFirstPoll = (write) => () => { const t = setInterval(() => { if (existsSync(W.statePath(root, SLUG))) { clearInterval(t); write(); } }, 20); };
    const first = await runCli([root, SLUG, '--once'], env, {
      onSpawn: afterFirstPoll(() => journal(root, { at: stamp(0), seq: 1, event: 'agent-start', agent: 'plan:auth', stage: 'plan', slice: 'auth' })),
    });
    assert.equal(first.code, 0);
    assert.deepEqual(first.lines.map((l) => l.event), ['stage-start']);
    const second = await runCli([root, SLUG, '--once'], env, {
      onSpawn: () => setTimeout(() => journal(root, { at: stamp(1), seq: 1, event: 'agent-end', agent: 'plan:auth', status: 'complete' }), 400),
    });
    assert.deepEqual(second.lines.map((l) => l.event), ['stage-end'], 'the stage start is not given again');
  } finally { for (const d of [root, lockDir, projectsDir]) rmSync(d, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------- the look-in
// The PO, 2026-10-19: the campaign session reported only on events, so a long stage gave
// no word for an hour. After 15 minutes with no full note, the watch asks the session to look in.

test('look-in: 15 quiet minutes give one look-in with the running agents; a stage start does not restart the clock', () => {
  const root = makeRepo();
  const lockDir = tmpDir('locks');
  const projectsDir = tmpDir('projects');
  try {
    let now = T0;
    const w = W.createWatcher({ projectRoot: root, slugs: [SLUG], now: () => now, lookInMs: 15 * 60000, lockDir, projectsDir });
    assert.deepEqual(w.pollLookIn([]), [], 'the first poll starts the clock');
    now = T0 + 2 * 60000;
    journal(root, { at: at(2), seq: 1, event: 'agent-start', agent: 'implement:board', stage: 'implement', slice: 'board' });
    const started = w.pollJournals();
    assert.deepEqual(started.map((e) => e.event), ['stage-start']);
    assert.deepEqual(w.pollLookIn(started), [], 'a stage start is one line, not a full note');
    now = T0 + 14 * 60000;
    assert.deepEqual(w.pollLookIn([]), []);
    now = T0 + 15 * 60000;
    const ev = w.pollLookIn([]);
    assert.equal(ev.length, 1);
    assert.equal(ev[0].event, 'look-in');
    assert.equal(ev[0].sinceMinutes, 15);
    assert.deepEqual(ev[0].running, [{ slug: SLUG, agent: 'implement:board', stage: 'implement', slice: 'board', startedAt: at(2), minutes: 13, root, journal: W.journalPath(root, SLUG), transcript: null }]);
    now = T0 + 29 * 60000;
    assert.deepEqual(w.pollLookIn([]), [], 'the next look-in comes 15 minutes after this one');
    now = T0 + 30 * 60000;
    assert.deepEqual(w.pollLookIn([]).map((e) => e.event), ['look-in']);
  } finally { for (const d of [root, lockDir, projectsDir]) rmSync(d, { recursive: true, force: true }); }
});

test('look-in: a full note restarts the clock, the clock survives a restart, and 0 turns it off', () => {
  const root = makeRepo();
  const lockDir = tmpDir('locks');
  const projectsDir = tmpDir('projects');
  try {
    let now = T0;
    const opts = { projectRoot: root, slugs: [SLUG], now: () => now, lockDir, projectsDir };
    const a = W.createWatcher({ ...opts, lookInMs: 15 * 60000 });
    a.pollLookIn([]);
    now = T0 + 10 * 60000;
    assert.deepEqual(a.pollLookIn([{ event: 'stage-end' }]), [], 'the session gives a full note now');
    a.save();
    // A re-armed watch keeps the clock: the look-in comes 15 minutes after the stage end.
    now = T0 + 24 * 60000;
    const b = W.createWatcher({ ...opts, lookInMs: 15 * 60000 });
    assert.deepEqual(b.pollLookIn([]), []);
    now = T0 + 25 * 60000;
    assert.deepEqual(b.pollLookIn([]).map((e) => e.event), ['look-in']);
    const off = W.createWatcher({ ...opts, lookInMs: 0 });
    now = T0 + 300 * 60000;
    assert.deepEqual(off.pollLookIn([]), []);
  } finally { for (const d of [root, lockDir, projectsDir]) rmSync(d, { recursive: true, force: true }); }
});

test('look-in: 15 minutes by default, or the given minutes; 0 turns it off', () => {
  assert.equal(W.lookInMsOf({}, {}), 15 * 60000);
  assert.equal(W.lookInMsOf({ 'look-in': '5' }, {}), 5 * 60000);
  assert.equal(W.lookInMsOf({ 'look-in': '0' }, {}), 0);
  assert.equal(W.lookInMsOf({}, { SDLC_WATCH_LOOK_IN_MINUTES: '30' }), 30 * 60000);
  assert.equal(W.lookInMsOf({ 'look-in': 'soon' }, {}), 15 * 60000, 'a bad value keeps the default');
});

test('look-in: a quiet --once watch wakes the session with a look-in, not after 110 minutes', async () => {
  const root = makeRepo();
  const lockDir = tmpDir('locks');
  const projectsDir = tmpDir('projects');
  try {
    const env = { SDLC_WATCH_LOCK_DIR: lockDir, SDLC_CLAUDE_PROJECTS_DIR: projectsDir, SDLC_USAGE_DIR: projectsDir };
    const r = await runCli([root, SLUG, '--once', '--look-in', '0.01'], env);
    assert.equal(r.code, 0);
    assert.deepEqual(r.lines.map((l) => l.event), ['look-in']);
  } finally { for (const d of [root, lockDir, projectsDir]) rmSync(d, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------- one end per run
// SoccerManager, 2026-10-20: the wave driver writes agent lines after a unit's run-end
// (the unit-end agent's own end, read-check-report). Every re-armed watch reset `ended`,
// saw an agent-end as the newest line, and said the finished unit's run-end again.

test('a run ends once: a re-armed watch does not infer the end of a run that already ended', () => {
  const root = makeRepo();
  const lockDir = tmpDir('locks');
  const projectsDir = tmpDir('projects');
  try {
    let now = T0;
    const opts = { projectRoot: root, slugs: [SLUG], now: () => now, lockDir, projectsDir };
    const a = W.createWatcher(opts);
    a.pollJournals();
    journal(root,
      { at: at(1), seq: 39, event: 'agent-start', agent: 'unit-end@x' },
      { at: at(1), event: 'run-end', agent: 'unit-end@x', driver: 'campaign-wave' },
      { at: at(2), seq: 39, event: 'agent-end', agent: 'unit-end@x', status: 'complete' },
      { at: at(3), seq: 40, event: 'agent-start', agent: 'read-check-report@x' },
      { at: at(3), seq: 40, event: 'agent-end', agent: 'read-check-report@x', status: 'present:false' },
    );
    now = T0 + 4 * 60000;
    assert.deepEqual(a.pollJournals().map((e) => e.event), ['run-end']);
    a.save();
    // A state saved before `endedRun` existed: an ended state keeps its run as ended.
    const file = W.statePath(root, SLUG);
    const saved = JSON.parse(readFileSync(file, 'utf8'));
    delete saved.endedRun;
    writeFileSync(file, JSON.stringify(saved));
    for (const min of [120, 240]) {
      now = T0 + min * 60000;
      const b = W.createWatcher(opts);
      assert.deepEqual(b.pollJournals().filter((e) => e.event === 'run-end'), [], `no second run-end at minute ${min}`);
      b.save();
    }
    // A relaunch with a new run id ends again.
    appendFileSync(W.journalPath(root, SLUG), `${JSON.stringify({ run: 'run-2', at: at(241), seq: 1, event: 'agent-start', agent: 'orient' })}\n${JSON.stringify({ run: 'run-2', at: at(242), seq: 1, event: 'agent-end', agent: 'orient', status: 'complete' })}\n`);
    now = T0 + 242 * 60000;
    const c = W.createWatcher(opts);
    c.pollJournals();
    now = T0 + 400 * 60000;
    const end = c.pollJournals();
    assert.deepEqual(end.map((e) => e.event), ['run-end']);
    assert.equal(end[0].run, 'run-2');
  } finally { for (const d of [root, lockDir, projectsDir]) rmSync(d, { recursive: true, force: true }); }
});

test('the CLI refuses a watch with no slug', async () => {
  const root = makeRepo();
  const lockDir = tmpDir('locks');
  const projectsDir = tmpDir('projects');
  try {
    const env = { SDLC_WATCH_LOCK_DIR: lockDir, SDLC_CLAUDE_PROJECTS_DIR: projectsDir, SDLC_USAGE_DIR: projectsDir };
    assert.equal((await runCli([root, '--once'], env)).code, 2);
  } finally { for (const d of [root, lockDir, projectsDir]) rmSync(d, { recursive: true, force: true }); }
});

test('a replaced or truncated journal repeats no event: its lines up to now are history', () => {
  const root = makeRepo();
  try {
    let now = T0;
    const w = W.createWatcher({ projectRoot: root, slugs: [SLUG], now: () => now });
    w.pollJournals();
    journal(root,
      { at: at(1), seq: 1, event: 'agent-start', agent: 'plan:auth', stage: 'plan', slice: 'auth' },
      { at: at(2), seq: 1, event: 'agent-end', agent: 'plan:auth', status: 'complete' },
      { at: at(3), seq: 2, event: 'agent-start', agent: 'implement:auth', stage: 'implement', slice: 'auth' },
    );
    now = T0 + 3 * 60000;
    assert.deepEqual(w.pollJournals().map((e) => e.event), ['stage-start', 'stage-end', 'stage-start']);
    // A merge or a checkout writes a shorter journal in its place.
    writeFileSync(W.journalPath(root, SLUG), line({ at: at(1), seq: 1, event: 'agent-start', agent: 'plan:auth', stage: 'plan', slice: 'auth' }));
    now = T0 + 4 * 60000;
    assert.deepEqual(w.pollJournals(), [], 'the old lines say nothing again');
    journal(root, { at: at(5), seq: 1, event: 'agent-end', agent: 'plan:auth', status: 'complete' });
    now = T0 + 5 * 60000;
    assert.deepEqual(w.pollJournals().map((e) => e.event), ['stage-end'], 'a new line is news');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('look-in: a run that ended is not running, even with an agent that never ended', () => {
  const root = makeRepo();
  const lockDir = tmpDir('locks');
  const projectsDir = tmpDir('projects');
  try {
    let now = T0;
    const opts = { projectRoot: root, slugs: [SLUG], now: () => now, lookInMs: 15 * 60000, lockDir, projectsDir };
    const a = W.createWatcher(opts);
    a.pollJournals();
    a.pollLookIn([]);
    journal(root, { at: at(1), seq: 1, event: 'agent-start', agent: 'implement:auth', stage: 'implement', slice: 'auth' });
    now = T0 + 1 * 60000;
    a.pollJournals();
    // The run is stopped mid-stage: the agent never writes its end.
    W.appendRunEnd(root, SLUG, 'stop-request', T0 + 2 * 60000);
    now = T0 + 2 * 60000;
    assert.deepEqual(a.pollJournals().map((e) => e.event), ['run-end']);
    a.save();
    now = T0 + 30 * 60000;
    const b = W.createWatcher(opts);
    b.pollJournals();
    assert.deepEqual(b.pollLookIn([]), [], 'a watch after the run end starts a new clock');
    now = T0 + 45 * 60000;
    const ev = b.pollLookIn([]);
    assert.deepEqual(ev.map((e) => e.event), ['look-in']);
    assert.deepEqual(ev[0].running, [], 'the stopped agent is not running');
  } finally { for (const d of [root, lockDir, projectsDir]) rmSync(d, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------- a tool call that waits
// Lantern, 2026-10-20: a verify agent sent two tool calls in one message. One returned;
// the other opened a Terminal tab and waited 113 minutes for the person's approval. The
// watch said the agent hangs, and the session offered to stop the run three times.

const toolUse = (id, name, ts) => JSON.stringify({ type: 'assistant', timestamp: ts, message: { content: [{ type: 'tool_use', id, name, input: {} }] } });
const toolResult = (id, ts) => JSON.stringify({ type: 'user', timestamp: ts, message: { content: [{ type: 'tool_result', tool_use_id: id, content: 'ok' }] } });

test('pendingToolOf: the newest tool call with no result; null when every call returned', () => {
  const dir = tmpDir('transcript');
  try {
    const file = path.join(dir, 'agent-x.jsonl');
    writeFileSync(file, [toolUse('a', 'Bash', at(1)), toolUse('b', 'mcp__terminal__run_in_terminal', at(1)), toolResult('a', at(2)), 'torn {'].join('\n') + '\n');
    assert.deepEqual(W.pendingToolOf(file), { tool: 'mcp__terminal__run_in_terminal', since: at(1) });
    appendFileSync(file, toolResult('b', at(90)) + '\n');
    assert.equal(W.pendingToolOf(file), null);
    assert.equal(W.pendingToolOf(path.join(dir, 'missing.jsonl')), null);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('F6: a silent agent with a tool call that has no result is pending-tool, not hung', () => {
  const root = makeRepo();
  const projectsDir = tmpDir('projects');
  const lockDir = tmpDir('locks');
  try {
    journal(root, { at: at(0), seq: 1, event: 'agent-start', agent: 'verify:auth', stage: 'verify', slice: 'auth' });
    const file = agentTranscript(projectsDir, root, 'verify:auth', T0 + 25 * 60000);
    writeFileSync(file, [toolUse('a', 'Bash', at(24)), toolUse('b', 'mcp__terminal__run_in_terminal', at(24)), toolResult('a', at(25))].join('\n') + '\n');
    utimesSync(file, (T0 + 25 * 60000) / 1000, (T0 + 25 * 60000) / 1000);
    let now = T0;
    const w = W.createWatcher({ projectRoot: root, slugs: [SLUG], projectsDir, lockDir, now: () => now });
    w.pollJournals();
    now = T0 + 41 * 60000;
    const ev = w.pollJournals();
    assert.deepEqual(ev.map((e) => e.event), ['stale']);
    assert.equal(ev[0].signal, 'pending-tool');
    assert.equal(ev[0].tool, 'mcp__terminal__run_in_terminal');
    assert.equal(ev[0].toolSince, at(24));
  } finally { for (const d of [root, projectsDir, lockDir]) rmSync(d, { recursive: true, force: true }); }
});

// ---- WF-SYSTEM-REVIEW A3, A4 ------------------------------------------------------

const BS = String.fromCharCode(92);

test('A4: the line command writes a Windows path that parses, stamps at, and adds the agent flags', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'yw-line-'));
  try {
    const file = path.join(dir, '.driver-journal.jsonl');
    const winPath = ['C:', 'Users', 'x', '07-review.md'].join(BS);
    const json = JSON.stringify({ run: 'r1', event: 'refuter', target: winPath, note: "it's" }).replace(/'/g, BS + 'u0027');
    execFileSync(process.execPath, [path.join(pluginRoot, 'scripts', 'yolo-watch.mjs'), 'line', file, json, '--status', 'blocked', '--errors', '2', '--reason', 'no device', '--route-back', 'implement', '--fields', '{"upheld":3}']);
    const line = JSON.parse(readFileSync(file, 'utf8').trim());
    assert.equal(line.target, winPath);
    assert.equal(line.note, "it's");
    assert.match(line.at, /^\d{4}-\d\d-\d\dT/);
    assert.deepEqual([line.status, line.errors, line.reason, line.routeBack, line.upheld], ['blocked', 2, 'no device', 'implement', 3]);
    // A hand-typed copy that lost the escapes of its backslashes still parses.
    const raw = ['C:', 'Users', 'xyz', 'plan.md'].join(BS);
    assert.equal(W.parseLineJson(`{"target":"${raw}"}`).target, raw);
    assert.equal(W.parseLineJson(`{"a":"x${BS}${BS}y${BS}n"}`).a, `x${BS}y
`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('A3: end carries the reason, and a second end of the same run appends nothing', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'yw-end-'));
  try {
    const file = path.join(root, '.ai', 'workflows', 'demo', '.driver-journal.jsonl');
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify({ at: '2026-10-21T10:00:00Z', run: 'r1', event: 'agent-start' })}\n`);
    const a = W.appendRunEnd(root, 'demo', 'implement', Date.now(), { reason: 'tests red', agent: 'run-end' });
    assert.deepEqual([a.run, a.stoppedAt, a.reason, a.agent], ['r1', 'implement', 'tests red', 'run-end']);
    assert.equal(W.appendRunEnd(root, 'demo', null, Date.now()), null, 'the main session end after the driver end appends nothing');
    assert.equal(readFileSync(file, 'utf8').trim().split('\n').length, 2);
    // A new run of the same slug ends again.
    appendFileSync(file, `${JSON.stringify({ at: '2026-10-21T11:00:00Z', run: 'r2', event: 'agent-start' })}\n`);
    assert.equal(W.appendRunEnd(root, 'demo', null, Date.now()).run, 'r2');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
