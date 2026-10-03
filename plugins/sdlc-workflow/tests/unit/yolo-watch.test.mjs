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

test('protected files: PRODUCT.md, steer.md paths, config paths, and the person\'s uncommitted edits', () => {
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

test('usage: crossing a budget line gives usage; a lower reading or the reset time gives usage-reset', () => {
  const root = makeRepo();
  const usageDir = mkdtempSync(path.join(os.tmpdir(), 'yolo-usage-'));
  try {
    const reading = (five, seven, mtime) => {
      const f = path.join(usageDir, 'session-a.json');
      writeFileSync(f, JSON.stringify({ rateLimits: [
        { kind: 'five_hour', percentUsed: five, resetsAt: '2026-10-03T15:00:00Z' },
        { kind: 'seven_day', percentUsed: seven, resetsAt: '2026-10-08T00:00:00Z' },
      ] }));
      utimesSync(f, mtime, mtime);
    };
    let now = T0;
    const w = W.createWatcher({ projectRoot: root, slugs: [SLUG], usageDir, now: () => now });
    reading(40, 10, new Date(T0));
    assert.deepEqual(w.pollUsage(), [], 'under every line');
    reading(80, 10, new Date(T0 + 1000));
    assert.deepEqual(w.pollUsage().map((e) => e.level), ['slow']);
    reading(92, 10, new Date(T0 + 2000));
    const p = w.pollUsage();
    assert.deepEqual(p.map((e) => `${e.event}:${e.level}`), ['usage:pause']);
    assert.equal(p[0].windows.fiveHour.resetsAt, '2026-10-03T15:00:00Z');
    assert.deepEqual(w.pollUsageReset(), [], 'before the reset time');
    now = Date.parse('2026-10-03T15:00:01Z');
    assert.deepEqual(w.pollUsageReset().map((e) => e.event), ['usage-reset']);
    assert.equal(W.usageLevel({ fiveHour: { percentUsed: 10 }, sevenDay: { percentUsed: 86 } }, W.DEFAULT_BUDGET), 'pause', 'the 7-day reserve');
    assert.deepEqual(W.createWatcher({ projectRoot: root, slugs: [SLUG], usageDir: path.join(usageDir, 'none') }).pollUsage(), [], 'no reading, no event');
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(usageDir, { recursive: true, force: true });
  }
});

test('control: a stop request names a stage or current; a pause needs its reset time', () => {
  const root = makeRepo();
  try {
    const v = W.writeControl(root, SLUG, 'stop', ['verify'], T0);
    assert.deepEqual(v, { action: 'stop', after: 'verify', requestedAt: at(0) });
    assert.deepEqual(JSON.parse(readFileSync(W.controlPath(root, SLUG), 'utf8')), v);
    assert.throws(() => W.writeControl(root, SLUG, 'stop', ['handoff']), /after/);
    assert.throws(() => W.writeControl(root, SLUG, 'pause', ['soon']), /ISO 8601/);
    const p = W.writeControl(root, SLUG, 'pause', ['2026-10-03T15:00:00Z', 'five-hour', 'window'], T0);
    assert.equal(p.reason, 'five-hour window');
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

test('steer.md protection reads backticked paths on protect and do-not-touch lines only', () => {
  assert.deepEqual(W.steerProtectedPaths([
    '- Never edit `PRODUCT.md` by hand',
    "- don't touch `src/engine/*.ts` or `config/loader.ts`",
    '- prefer `lib/queue.ts`',
    '- protect `DESIGN.md`',
  ].join('\n')), ['PRODUCT.md', 'config/loader.ts', 'DESIGN.md']);
});

// ---------------------------------------------------------------------------
// W5 — the campaign parts (YOLO-COMMENTARY-PLAN section 4, K1-K6).
// ---------------------------------------------------------------------------
const B = 'realism';
function makeCampaign(root, revision = 1) {
  const work = path.join(root, '.ai', 'workflows', B, 'work');
  mkdirSync(path.join(work, 'campaign'), { recursive: true });
  writeFileSync(path.join(work, 'index.md'), `---\ntype: work-set\nwork-revision: ${revision}\n---\n`);
  writeFileSync(W.campaignJournalPath(root, B), '');
}
const campLine = (root, o) => appendFileSync(W.campaignJournalPath(root, B), `${JSON.stringify({ at: at(1), ...o })}\n`);

test('K1/K3: one watch over the wave\'s slugs and the campaign journal; campaign events become events, heartbeats do not', () => {
  const root = makeRepo();
  try {
    makeCampaign(root);
    const w = W.createWatcher({ projectRoot: root, slugs: [SLUG], campaign: B, now: clockAt(0) });
    assert.deepEqual(w.pollJournals(), []);
    campLine(root, { event: 'wave-start', wave: 1, units: ['W1'], moved: [{ key: 'W2', reason: 'not prepared' }] });
    campLine(root, { event: 'agent-start', agent: 'merge', step: 'merge' });
    campLine(root, { event: 'merge', wave: 1, key: 'W1', slug: 'engine', sha: 'abc', result: 'merged' });
    campLine(root, { event: 'agent-end', agent: 'merge', status: 'complete' });
    campLine(root, { event: 'unit-state', key: 'W1', state: 'merged' });
    campLine(root, { event: 'asked', id: 'q1', wave: 1, text: 'CI is red' });
    const ev = w.pollJournals();
    assert.deepEqual(ev.map((e) => e.event), ['wave-start', 'prepare-waiting', 'merge', 'asked']);
    assert.equal(ev[0].campaign, B);
    assert.deepEqual(ev[1].units, [{ key: 'W2', reason: 'not prepared' }]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('K1: a first campaign watch emits the campaign events of the last 5 minutes, so the wave-start written just before it is not lost', () => {
  const root = makeRepo();
  try {
    makeCampaign(root);
    appendFileSync(W.campaignJournalPath(root, B), `${JSON.stringify({ at: at(-60), event: 'wave-start', wave: 1, units: ['W0'] })}\n`);
    appendFileSync(W.campaignJournalPath(root, B), `${JSON.stringify({ at: at(-1), event: 'wave-start', wave: 2, units: ['W1'] })}\n`);
    const w = W.createWatcher({ projectRoot: root, slugs: [SLUG], campaign: B, now: clockAt(0) });
    const ev = w.pollJournals();
    assert.deepEqual(ev.map((e) => `${e.event}:${e.wave}`), ['wave-start:2']);
    assert.deepEqual(w.pollJournals(), []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('K1: a slug journal that a merge brings in later is history, not new stage events', () => {
  const root = makeRepo();
  try {
    makeCampaign(root);
    const w = W.createWatcher({ projectRoot: root, slugs: [SLUG], campaign: B, now: clockAt(0) });
    assert.deepEqual(w.pollJournals(), []);
    // The drive ran in a worktree; the wave merge now brings its committed journal in.
    const runId = 'r-old';
    mkdirSync(path.dirname(W.journalPath(root, SLUG)), { recursive: true });
    appendFileSync(W.journalPath(root, SLUG), `${JSON.stringify({ at: at(-30), run: runId, seq: 1, event: 'agent-start', agent: 'plan:s1', stage: 'plan', slice: 's1' })}\n`);
    appendFileSync(W.journalPath(root, SLUG), `${JSON.stringify({ at: at(-28), run: runId, seq: 2, event: 'agent-end', agent: 'plan:s1', stage: 'plan', slice: 's1', status: 'complete' })}\n`);
    assert.deepEqual(w.pollJournals().filter((e) => e.slug === SLUG), []);
    appendFileSync(W.journalPath(root, SLUG), `${JSON.stringify({ at: at(1), run: 'r-new', seq: 1, event: 'agent-start', agent: 'plan:s2', stage: 'plan', slice: 's2' })}\n`);
    assert.deepEqual(w.pollJournals().map((e) => e.event), ['stage-start']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('K3 work-changed: a new work-revision from the brainstorm session is an event', () => {
  const root = makeRepo();
  try {
    makeCampaign(root, 3);
    const w = W.createWatcher({ projectRoot: root, slugs: [SLUG], campaign: B, now: clockAt(0) });
    assert.deepEqual(w.pollWorkRevision(), []);
    writeFileSync(path.join(root, '.ai', 'workflows', B, 'work', 'index.md'), '---\ntype: work-set\nwork-revision: 4\n---\n');
    assert.deepEqual(w.pollWorkRevision().map((e) => `${e.event}:${e.from}->${e.to}`), ['work-changed:3->4']);
    assert.deepEqual(w.pollWorkRevision(), []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('in a campaign a slug\'s run-end does not end the watch; the wave-end does', () => {
  const root = makeRepo();
  try {
    makeCampaign(root);
    const w = W.createWatcher({ projectRoot: root, slugs: [SLUG], campaign: B, now: clockAt(0) });
    w.pollJournals();
    W.appendRunEnd(root, SLUG, null, T0 + 60000);
    assert.deepEqual(w.pollJournals().map((e) => e.event), ['run-end']);
    assert.equal(w.allEnded(), false, 'the boundary and the next slug still run');
    campLine(root, { event: 'wave-end', wave: 1, state: 'shipped' });
    assert.deepEqual(w.pollJournals().map((e) => e.event), ['wave-end']);
    assert.equal(w.allEnded(), true);
    w.save();
    assert.ok(existsSync(W.campaignStatePath(root, B)), 'the campaign offsets persist');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('waves overlap: wave 1 shipping does not end the watch while wave 2 is open', () => {
  const root = makeRepo();
  try {
    makeCampaign(root);
    const w = W.createWatcher({ projectRoot: root, slugs: [SLUG], campaign: B, now: clockAt(0) });
    w.pollJournals();
    campLine(root, { event: 'wave-start', wave: 1 });
    campLine(root, { event: 'wave-start', wave: 2 });
    campLine(root, { event: 'wave-end', wave: 1, state: 'shipped' });
    w.pollJournals();
    assert.equal(w.allEnded(), false, 'wave 2 is still open');
    campLine(root, { event: 'wave-end', wave: 2, state: 'shipped' });
    w.pollJournals();
    assert.equal(w.allEnded(), true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('K2: a stage end carries how many slugs run at once', () => {
  const root = makeRepo();
  try {
    makeCampaign(root);
    const other = 'squads';
    mkdirSync(path.join(root, '.ai', 'workflows', other), { recursive: true });
    writeFileSync(W.journalPath(root, other), '');
    const w = W.createWatcher({ projectRoot: root, slugs: [SLUG, other], campaign: B, now: clockAt(0) });
    w.pollJournals();
    journal(root, { at: at(1), seq: 1, event: 'agent-start', agent: 'plan:a', stage: 'plan', slice: 'a' });
    appendFileSync(W.journalPath(root, other), `${JSON.stringify({ run: 'r2', at: at(1), seq: 1, event: 'agent-start', agent: 'plan:b', stage: 'plan', slice: 'b' })}\n`);
    w.pollJournals();
    journal(root, { at: at(2), seq: 1, event: 'agent-end', agent: 'plan:a', status: 'complete' });
    const end = w.pollJournals().find((e) => e.event === 'stage-end');
    assert.equal(end.parallel, 2);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('K4/K5: campaign notes and scoped stop requests', () => {
  const root = makeRepo();
  try {
    makeCampaign(root);
    W.appendNote(root, SLUG, 'Engine merged into wave 1.', 'merge', T0, B);
    assert.match(readFileSync(W.campaignCommentaryPath(root, B), 'utf8'), /Engine merged into wave 1\./);
    assert.match(readFileSync(W.commentaryPath(root, SLUG), 'utf8'), /Engine merged into wave 1\./, 'the slug keeps its own copy');
    W.appendNote(root, '-', 'Wave 1 is ready to try.', 'wave-ready', T0, B);
    assert.doesNotMatch(readFileSync(W.commentaryPath(root, SLUG), 'utf8'), /ready to try/);
    assert.deepEqual(W.writeControl(root, '-', 'stop', ['current'], T0, { campaign: B, scope: 'wave' }), { action: 'stop', scope: 'wave', after: 'current', requestedAt: at(0) });
    assert.deepEqual(W.writeControl(root, 'engine', 'stop', ['verify'], T0, { campaign: B, scope: 'slug' }), { action: 'stop', scope: 'slug', slug: 'engine', after: 'verify', requestedAt: at(0) });
    assert.throws(() => W.writeControl(root, '-', 'stop', ['current'], T0, { campaign: B, scope: 'slug' }), /names the slug/);
    assert.equal(JSON.parse(readFileSync(W.campaignControlPath(root, B), 'utf8')).scope, 'slug');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
