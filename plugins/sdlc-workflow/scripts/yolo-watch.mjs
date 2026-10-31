#!/usr/bin/env node
/**
 * scripts/yolo-watch.mjs — the built-in watch for /wf yolo (YOLO-COMMENTARY-PLAN).
 *
 * The main session starts this script with the Monitor tool right after the
 * Workflow call. Every stdout line is one JSON event, and every stdout line
 * becomes a chat notification, so the script writes nothing else to stdout.
 * Diagnostics go to stderr.
 *
 *   node yolo-watch.mjs <projectRoot> <slug> [<slug> ...] [--since <seq>] [--once] [--max-minutes <n>] [--look-in <n>]
 *       Watch the runs. Exit after the run-end event of every slug, or after the
 *       lifetime (31 minutes; 110 with --once). --once: exit after the first poll
 *       that gives news, for a background shell task when the Monitor tool gives
 *       no output; a commit or a stage start is not news. A lifetime end then prints
 *       a watch-timeout line. --look-in: the minutes a stage runs before a look-in
 *       event, for every stage (default: the stage's time box from the test profile,
 *       else 30; 0 turns it off). In a delegated run, a look-in goes to commentary.md only.
 *   node yolo-watch.mjs note <projectRoot> <slug> [--event <kind>]   < text
 *       Append one commentary note (stdin) to .ai/workflows/<slug>/commentary.md.
 *   node yolo-watch.mjs control <projectRoot> <slug> stop <current|plan|implement|verify|review>
 *   node yolo-watch.mjs control <projectRoot> <slug> clear|show
 *       Write, delete or print .ai/run/<slug>/.control.json (the stop request, G1).
 *   node yolo-watch.mjs end <projectRoot> <slug> [--stopped-at <where>] [--reason <text>] [--run <id>]
 *       Append a run-end line to the driver journal. The main session runs it when
 *       the Workflow returns, so the watch ends at once. The driver's last step runs
 *       it too (WF-SYSTEM-REVIEW A3): when the journal's last run-end is for the same
 *       run, it appends nothing.
 *   node yolo-watch.mjs line <journalFile> '<json>' [--fields '<json>'] [--run id] [--seq n] [--status s] [--errors n]
 *                            [--reason r] [--hard-stop-reason r] [--route-back x]
 *       Append one journal line (WF-SYSTEM-REVIEW A4). The driver builds the JSON with
 *       JSON.stringify; the agent adds only what it alone knows, as flags. `at` is the
 *       clock now. Every line goes out through JSON.stringify, so a path with
 *       backslashes always parses.
 *   node yolo-watch.mjs stop-check <projectRoot> <slug>
 *       Print the stop request of the workflow as JSON: whether a stop is asked, and where.
 *   node yolo-watch.mjs help
 *       Print these forms.
 *
 * S1 Poll, never tail: the journal by byte offset every 5 s, git HEAD and the
 *    protected files every 20 s, the usage readings every 60 s. A poll needs no
 *    file-change events, so it works on Windows.
 * S3 The offsets persist in .ai/run/<slug>/.watch-state.json. A re-armed
 *    watch starts where the last watch stopped and misses no event.
 * S4 The script exits by itself after the run-end event: a run-end journal line,
 *    or a journal whose newest line is an agent-end and that stays silent past
 *    the liveness limit (_liveness.md, the staleness rule).
 *
 * WF-WATCH-MONITOR-PLAN:
 * F3 A restart keeps the first watch's start (keptWatchFrom), so the silence of a
 *    live run counts from its last line, not from the 30-minute Monitor restart.
 * F4 Each stage-start and commit event also appends one line to commentary.md.
 * F5 One watch per journal: a newer watch takes the lock, and the older one emits
 *    watch-replaced and exits.
 * F6 A running agent is stale when its own transcript is silent for 15 minutes
 *    (AGENT_SILENT_MS); the journal rule applies only when no transcript is found.
 *
 * Self-contained (node: built-ins only), so it runs from the plugin cache and
 * from the dev tree without a bundle, like stage-yolo-driver.mjs.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  appendFileSync, closeSync, existsSync, fstatSync, mkdirSync, openSync, readdirSync,
  readFileSync, readSync, renameSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AGENT_SILENT_MS, STAGE_KINDS, STAGE_FILE, STALE_FLOOR_MS, applyLines, decisionSignalOf, frontmatterField, judgeSilence, liveLimitMs, stageOf,
} from '../lib/live-events.mjs';
import { RUN_DECISIONS_KEY, decisionsOf, delegatesDecisions, liveDecisions, runDelegatedIn } from '../lib/decisions.mjs';
import { readDoc } from '../lib/records.mjs';
import { clearStopRequest } from '../lib/stop-request.mjs';
import { STAGE_SUITES, readProfile, timeBox } from '../lib/test-profile.mjs';
import { undoGitBashPath } from '../lib/msys.mjs';
import { realPathOf, runDir, workflowDir } from '../lib/records-root.mjs';
import { ensureRunDir, findRunFile, oldRunFile } from '../lib/run-files.mjs';
import { stringify } from '../lib/yaml.mjs';

// The event rules live in lib/live-events.mjs, shared with the live view of the mod (WF-LIVE-VIEWS-PLAN M2).
export { STAGE_KINDS, frontmatterField, judgeSilence, liveLimitMs, stageOf };

export const STOP_AFTER = Object.freeze(['current', 'plan', 'implement', 'verify', 'review']);
export { STALE_FLOOR_MS };
export const DEFAULT_PROTECTED = Object.freeze(['PRODUCT.md', 'DESIGN.md']);
const STATE_FILE = '.watch-state.json';
const CONTROL_FILE = '.control.json';
// The events that are not news: they go to commentary.md, and a --once watch keeps polling
// after them. Every other event (stage-end, decision, stop, stale, protected-change,
// run-end, look-in) ends a --once watch.
export const NOT_NEWS_EVENTS = Object.freeze(['stage-start', 'commit']);
/** True when an event wakes the session: news, and not a look-in that goes to commentary.md only. */
export const isNews = (ev) => Boolean(ev) && !ev.quiet && !NOT_NEWS_EVENTS.includes(ev.event);
const STATE_VERSION = 1;

export const journalPath = (root, slug) => path.join(workflowDir(root, slug), '.driver-journal.jsonl');
// The watch offsets and the stop request are run files of this machine: <root>/.ai/run/<slug>/.
// A reader also reads the workflow folder, where an older plugin wrote them.
export const statePath = (root, slug) => path.join(runDir(root, slug), STATE_FILE);
export const controlPath = (root, slug) => path.join(runDir(root, slug), CONTROL_FILE);
const controlFiles = (root, slug) => [controlPath(root, slug), oldRunFile(root, slug, CONTROL_FILE)];
export const commentaryPath = (root, slug) => path.join(workflowDir(root, slug), 'commentary.md');

const iso = (ms) => new Date(ms).toISOString();

function readJson(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
}

function pause(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function writeJsonAtomic(file, value) {
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  // Windows refuses a rename onto a file that a scanner or an indexer holds open for a moment.
  for (let i = 0; ; i++) {
    try { renameSync(tmp, file); return; } catch (e) {
      if (i >= 5 || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) { rmSync(tmp, { force: true }); throw e; }
      pause(100 * (i + 1));
    }
  }
}

// raw: keep the leading spaces, which carry meaning in `git status --porcelain`.
function git(root, args, { raw = false } = {}) {
  try {
    const out = execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
    return raw ? out.replace(/\s+$/, '') : out.trim();
  } catch {
    return null;
  }
}

function hashFile(file) {
  try { return createHash('sha1').update(readFileSync(file)).digest('hex'); } catch { return null; }
}

// ---------------------------------------------------------------------------
// One watch per journal (F5 of WF-WATCH-MONITOR-PLAN). A watch writes a lock for
// each journal it reads. A newer watch takes the lock over, and the older watch
// stops with one `watch-replaced` line. The locks live in the temp folder: never in a workflow folder, which a slug
// commit stages and which local records copy.
// ---------------------------------------------------------------------------
export const lockFileOf = (journal, dir = null) => path.join(dir || path.join(os.tmpdir(), 'sdlc-watch-locks'),
  `${createHash('sha1').update(path.resolve(journal).toLowerCase()).digest('hex').slice(0, 16)}.json`);

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

function readLock(file) {
  const v = readJson(file);
  return v && typeof v.id === 'string' ? v : null;
}

// ---------------------------------------------------------------------------
// The running agent's own transcript (F6). A workflow agent writes
// <projects>/<project>/<session>/subagents/workflows/wf_*/agent-*.jsonl, with
// its label in the `description` of the sibling .meta.json. The label is the
// journal's `agent`. The project folder is the session's working folder with
// every character other than a letter or a digit replaced by a dash.
// ---------------------------------------------------------------------------
export const projectDirName = (root) => path.resolve(root).replace(/[^A-Za-z0-9]/g, '-');
const RECENT_WORKFLOW_MS = 48 * 60 * 60 * 1000;
const RELIST_MS = 60 * 1000;

export function createActivityFinder({ projectsDir, roots, now = () => Date.now() }) {
  const projects = [...new Set(roots.filter(Boolean).map(projectDirName))].map((n) => path.join(projectsDir, n));
  const labels = new Map();
  let files = [];
  let listedAt = -Infinity;
  const list = () => {
    const found = [];
    const dirs = (d) => { try { return readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => path.join(d, e.name)); } catch { return []; } };
    for (const project of projects) {
      for (const session of dirs(project)) {
        for (const wf of dirs(path.join(session, 'subagents', 'workflows'))) {
          let recent = false;
          try { recent = now() - statSync(wf).mtimeMs < RECENT_WORKFLOW_MS; } catch { /* gone */ }
          if (!recent) continue;
          let names = [];
          try { names = readdirSync(wf).filter((n) => n.endsWith('.meta.json')); } catch { continue; }
          for (const n of names) {
            const meta = path.join(wf, n);
            if (!labels.has(meta)) {
              const m = readJson(meta);
              labels.set(meta, m && typeof m.description === 'string' ? m.description : null);
            }
            const label = labels.get(meta);
            if (label) found.push({ label, file: meta.replace(/\.meta\.json$/, '.jsonl') });
          }
        }
      }
    }
    files = found;
  };
  const newest = (label, startMs) => {
    if (!label) return null;
    if (now() - listedAt >= RELIST_MS) { listedAt = now(); list(); }
    let best = null;
    for (const f of files) {
      if (f.label !== label) continue;
      let m;
      try { m = statSync(f.file).mtimeMs; } catch { continue; }
      if (best === null || m > best.m) best = { file: f.file, m };
    }
    // A transcript older than the agent's start belongs to an earlier agent with the same label.
    return best !== null && best.m >= startMs - 60 * 1000 ? best : null;
  };
  /** The newest write to the transcript of the agent with this label, started at `startMs`; null when none is found. */
  const find = (label, startMs) => { const b = newest(label, startMs); return b ? b.m : null; };
  /** The path of that transcript; null when none is found. */
  find.fileOf = (label, startMs) => { const b = newest(label, startMs); return b ? b.file : null; };
  /** The newest tool call of that transcript with no result yet; null when none waits. */
  find.pendingOf = (label, startMs) => { const b = newest(label, startMs); return b ? pendingToolOf(b.file) : null; };
  return find;
}

// A tool call with no result: the agent waits on the tool, most often for the
// person's approval of a prompt (Lantern, 2026-10-20: three Terminal tab calls held
// a verify agent for 2.5 hours, and the watch called the agent hung). The transcript
// tail is enough: a result always follows its call.
const PENDING_TAIL_BYTES = 512 * 1024;
export function pendingToolOf(file) {
  let text;
  try {
    const fd = openSync(file, 'r');
    try {
      const size = fstatSync(fd).size;
      const len = Math.min(size, PENDING_TAIL_BYTES);
      const buf = Buffer.alloc(len);
      readSync(fd, buf, 0, len, size - len);
      text = buf.toString('utf8');
    } finally { closeSync(fd); }
  } catch { return null; }
  const open = new Map();
  for (const raw of text.split('\n')) {
    let o;
    try { o = JSON.parse(raw); } catch { continue; }
    const content = o && o.message && Array.isArray(o.message.content) ? o.message.content : [];
    for (const b of content) {
      if (b && b.type === 'tool_use' && b.id) open.set(b.id, { tool: b.name || null, since: o.timestamp || null });
      else if (b && b.type === 'tool_result' && b.tool_use_id) open.delete(b.tool_use_id);
    }
  }
  const waiting = [...open.values()];
  return waiting.length ? waiting[waiting.length - 1] : null;
}

// ---------------------------------------------------------------------------
// The journal (S1): read the bytes after the saved offset. A last line with no
// newline is still being written: it stays unread until its newline lands.
// ---------------------------------------------------------------------------
export function readJournalFrom(file, offset) {
  let fd;
  try { fd = openSync(file, 'r'); } catch { return { lines: [], offset: 0, missing: true }; }
  try {
    const size = fstatSync(fd).size;
    // A shorter file was replaced or truncated: read it again from the start. The
    // caller treats the lines it read before as history (`reset`), so no event repeats.
    const reset = offset > size;
    const start = reset ? 0 : offset;
    if (size === start) return { lines: [], offset: start, ...(reset ? { reset } : {}) };
    const buf = Buffer.alloc(size - start);
    readSync(fd, buf, 0, buf.length, start);
    const lastNl = buf.lastIndexOf(0x0a);
    if (lastNl === -1) return { lines: [], offset: start, ...(reset ? { reset } : {}) };
    const text = buf.subarray(0, lastNl + 1).toString('utf8');
    const lines = [];
    for (const raw of text.split('\n')) {
      const t = raw.trim();
      if (!t) continue;
      try { lines.push(JSON.parse(t)); } catch { /* a torn or hand-edited line: skip it */ }
    }
    return { lines, offset: start + lastNl + 1, ...(reset ? { reset } : {}) };
  } finally {
    closeSync(fd);
  }
}

// The record a stage wrote, in either layout: 04-plan-<slice>.md first, then 04-plan.md.
// Returns { name, doc } or null.
export function stageArtifact(root, slug, stage, slice) {
  const prefix = STAGE_FILE[stage];
  if (!prefix) return null;
  const dir = workflowDir(root, slug);
  const names = slice ? [`${prefix}-${slice}.md`, `${prefix}.md`] : [`${prefix}.md`];
  for (const name of names) {
    const doc = readDoc(dir, name);
    if (doc?.frontmatter) return { name, doc };
  }
  return null;
}

// A decision that needs the person (3.2): the rule is decisionSignalOf; this gives it the record.
export function decisionSignal(doc) {
  return doc ? decisionSignalOf(`---\n${stringify(doc.frontmatter)}\n---\n${doc.body ?? ''}`) : null;
}

// ---------------------------------------------------------------------------
// Protected files (S5): the config list, PRODUCT.md and DESIGN.md, the paths a
// live steer entry of the decision store protects, and every file with
// uncommitted edits at run start.
// ---------------------------------------------------------------------------
const PROTECT_LINE = /\b(protect(?:ed)?|do not (?:touch|edit|change|modify)|don't (?:touch|edit|change|modify)|never (?:touch|edit|change|modify))\b/i;

export function steerProtectedPaths(text) {
  const out = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!PROTECT_LINE.test(line)) continue;
    for (const m of line.matchAll(/`([^`\s]+)`/g)) {
      const p = m[1].replace(/^\.\//, '');
      if (/[./]/.test(p) && !p.includes('*')) out.push(p);
    }
  }
  return out;
}

export function readConfig(root) {
  const cfg = readJson(path.join(root, '.ai', 'sdlc-config.json'));
  const y = (cfg && typeof cfg.yolo === 'object' && cfg.yolo) || {};
  return {
    protectedFiles: Array.isArray(y.protectedFiles) ? y.protectedFiles.filter((p) => typeof p === 'string' && p) : [],
  };
}

// ---------------------------------------------------------------------------
// The look-in clock: the expected time of a stage, and whether the person is away.
// ---------------------------------------------------------------------------
/** The expected minutes of a stage that runs no test suite, or whose suites have no time. */
export const DEFAULT_STAGE_MINUTES = 30;

/**
 * The expected time of a stage, in ms: the time box of the stage from the test profile
 * (the time box that the stage brief gives), or 30 minutes when the profile gives no time
 * for the suites that the stage runs.
 */
export function stageExpectedMs(profile, stage) {
  const suites = STAGE_SUITES[stage];
  if (suites) {
    const box = timeBox(profile || {}, suites);
    if (box.from.length) return box.seconds * 1000;
  }
  return DEFAULT_STAGE_MINUTES * 60 * 1000;
}

/**
 * The next look-in of a stage: once past its expected time, then each time it runs past
 * twice the time of the last one (T, 2T, 4T ...). `sent` counts the thresholds passed.
 * Returns the new count: higher than `sent` when a look-in is due now.
 */
export function lookInsPassed(elapsedMs, expectedMs, sent = 0) {
  let n = sent;
  while (elapsedMs >= expectedMs * 2 ** n) n++;
  return n;
}

export { RUN_DECISIONS_KEY, delegatesDecisions };

/**
 * True when the run of the slug decides for the person: the live `run-decisions` steer of
 * its decision store, which the launch reads to set `delegate`, takes the recommended option.
 */
export function runDelegated(root, slug) {
  try { return runDelegatedIn(workflowDir(root, slug)); } catch { return false; }
}

export function dirtyFiles(root) {
  const out = git(root, ['status', '--porcelain', '--untracked-files=no'], { raw: true });
  if (!out) return [];
  return out.split(/\r?\n/)
    .map((l) => l.slice(3).trim().replace(/^"|"$/g, ''))
    .map((p) => (p.includes(' -> ') ? p.split(' -> ').pop() : p))
    // The run's own records are not the person's edits.
    .filter((p) => p && !p.startsWith('.ai/') && !p.startsWith('.scratch/'));
}

/**
 * A linked worktree (git worktree add) is a drive's checkout, never the person's.
 * Its uncommitted files at a watch start are an earlier run's work.
 */
export function isLinkedWorktree(root) {
  const gitDir = git(root, ['rev-parse', '--git-dir']);
  const common = git(root, ['rev-parse', '--git-common-dir']);
  if (!gitDir || !common) return false;
  return path.resolve(root, gitDir).toLowerCase() !== path.resolve(root, common).toLowerCase();
}

export function protectedSet(root, slugs, cfg) {
  const set = new Set([...DEFAULT_PROTECTED, ...cfg.protectedFiles]);
  for (const slug of slugs) {
    let steer = [];
    try { steer = liveDecisions(decisionsOf(workflowDir(root, slug)), {}, { kind: 'steer' }); } catch { /* an unreadable store protects nothing */ }
    for (const p of steerProtectedPaths(steer.map((e) => e.answer).join('\n'))) set.add(p);
  }
  // In a linked worktree, a file that is dirty at the start is not the person's edit.
  const dirty = isLinkedWorktree(root) ? [] : dirtyFiles(root);
  for (const p of dirty) set.add(p);
  return { files: [...set].sort(), dirtyAtStart: dirty.sort() };
}

// ---------------------------------------------------------------------------
// State (S3).
// ---------------------------------------------------------------------------
function freshSlugState() {
  return {
    version: STATE_VERSION, offset: 0, run: null, lastLineAt: null, prevLineAt: null, longestGapMs: 0,
    newest: null, ended: false, endedRun: null, staleFor: null, decisionsSeen: [], openStages: {}, lookIns: {},
  };
}

export function loadState(root, slug) {
  const s = readJson(findRunFile(root, slug, STATE_FILE) ?? statePath(root, slug));
  return s && s.version === STATE_VERSION ? { ...freshSlugState(), ...s } : null;
}


// ---------------------------------------------------------------------------
// One poll of one slug's journal. Pure apart from the artifact reads.
// ---------------------------------------------------------------------------
export function applyJournalLines(root, slug, st, lines, { emitFrom = null } = {}) {
  const artifactOf = (stage, slice) => {
    const at = stageArtifact(root, slug, stage, slice);
    if (!at) return null;
    const { doc } = at;
    let mtime = 0;
    try { mtime = statSync(doc.path).mtimeMs; } catch { /* gone */ }
    const rel = path.relative(root, doc.path).split(path.sep).join('/') + (doc.section ? `#${doc.section}` : '');
    return { rel, status: doc.frontmatter.status ?? null, signal: decisionSignal(doc), mtime };
  };
  return applyLines(slug, st, lines, { emitFrom, artifactOf });
}

/**
 * The watch start that a restart keeps (F3 of WF-WATCH-MONITOR-PLAN). The
 * Monitor tool stops a watch after 30 minutes, and the session starts it again.
 * When the run wrote a line after the saved start and has not ended, the
 * restart watches the same run: its silence counts from the run's last line,
 * not from the restart. Otherwise the restart is a new launch, and it counts
 * from its own start.
 */
export function keptWatchFrom(saved, nowMs) {
  const from = Number(saved && saved.watchFrom);
  const live = Number.isFinite(from) && saved.lastLineAt !== null && saved.lastLineAt >= from
    && !(saved.newest && saved.newest.event === 'run-end');
  return live ? from : nowMs;
}

/** A saved HEAD older than this is from another launch, not from the watch that a re-arm replaces. */
export const REPO_STALE_MS = 2 * 60 * 60 * 1000;

/** B3 — one protected-change event per file in this window. */
export const PROTECTED_QUIET_MS = 10 * 60 * 1000;

// ---------------------------------------------------------------------------
// The watcher: one object, polled by a timer in main() and by tests directly.
// ---------------------------------------------------------------------------
export function createWatcher({
  projectRoot, slugs, since = null, now = () => Date.now(),
  projectsDir = null, lockDir = null, lockId = null, lookInMs = null,
}) {
  const root = path.resolve(projectRoot);
  const watchStartMs = now();
  const cfg = readConfig(root);
  let profile = {};
  try { profile = readProfile(root); } catch { /* an unreadable config gives every stage 30 minutes */ }
  const states = new Map();
  const activity = createActivityFinder({
    projectsDir: projectsDir || process.env.SDLC_CLAUDE_PROJECTS_DIR || path.join(os.homedir(), '.claude', 'projects'),
    roots: [root, process.cwd()], now,
  });
  const locks = lockDir || process.env.SDLC_WATCH_LOCK_DIR || null;
  const me = { id: lockId || `${process.pid}-${watchStartMs}`, pid: process.pid, kind: 'slug', at: iso(watchStartMs) };
  const held = new Set();

  // A state saved for another journal (a drive in a worktree that an older watch
  // followed, or another root) reads this journal from the start. Its lines older
  // than this moment are history.
  function setSource(slug, entry) {
    const source = journalPath(root, slug);
    const { st } = entry;
    // A state from before F2 read the journal of the root it was given.
    if (!st.source) st.source = source;
    if (st.source === source) return;
    st.source = source;
    st.offset = 0;
    entry.historyBefore = now();
  }

  for (const slug of slugs) {
    const saved = loadState(root, slug);
    const entry = saved
      // A new watch belongs to a new launch or a re-arm. The previous run's end
      // must not end this watch before the relaunched driver writes its first line.
      // A state from before `endedRun` that ended keeps its run as ended.
      ? { st: { ...saved, ended: false, endedRun: saved.endedRun || (saved.ended && saved.run ? saved.run : null), watchFrom: keptWatchFrom(saved, watchStartMs) }, first: false, historyBefore: null }
      : { st: { ...freshSlugState(), watchFrom: watchStartMs }, first: true, historyBefore: null };
    states.set(slug, entry);
    setSource(slug, entry);
  }

  const lead = states.get(slugs[0]).st;
  // The repo-wide parts (HEAD, protected files, usage) live in the first slug's state.
  // A saved HEAD carries over only to a re-arm, which comes minutes after the last poll.
  // An older one is another launch: the commits since then (a merge, for example) are history.
  const repoStale = !(Number(lead.repo?.polledAt) > now() - REPO_STALE_MS);
  if (!lead.repo || lead.repo.root !== root || states.get(slugs[0]).first || lead.repo.runEnded || repoStale) {
    const prot = protectedSet(root, slugs, cfg);
    const hashes = {};
    for (const f of prot.files) hashes[f] = hashFile(path.join(root, f));
    lead.repo = { root, head: git(root, ['rev-parse', 'HEAD']), hashes, dirtyAtStart: prot.dirtyAtStart, runEnded: false, polledAt: now() };
  }

  // F5 — one watch per journal.
  for (const slug of states.keys()) {
    const file = lockFileOf(journalPath(root, slug), locks);
    try {
      mkdirSync(path.dirname(file), { recursive: true });
      writeJsonAtomic(file, me);
      held.add(file);
    } catch (e) { process.stderr.write(`yolo-watch: cannot write the lock ${file}: ${e.message}\n`); }
  }

  /** A `watch-replaced` event when a newer live watch took one of this watch's locks; else null. */
  function checkLocks() {
    for (const file of held) {
      const cur = readLock(file);
      if (cur && cur.id !== me.id && pidAlive(cur.pid)) {
        return { event: 'watch-replaced', by: cur.kind, slugs: [...states.keys()], at: iso(now()) };
      }
      // A deleted lock, or one whose holder died: take it again.
      if (!cur || cur.id !== me.id) {
        try { writeJsonAtomic(file, me); } catch { /* the next poll tries again */ }
      }
    }
    return null;
  }

  function releaseLocks() {
    for (const file of held) {
      const cur = readLock(file);
      if (cur && cur.id === me.id) rmSync(file, { force: true });
    }
    held.clear();
  }

  function save() {
    for (const [slug, { st }] of states) {
      try {
        ensureRunDir(root, slug);
        writeJsonAtomic(statePath(root, slug), st);
      } catch (e) { process.stderr.write(`yolo-watch: cannot save state for ${slug}: ${e.message}\n`); }
    }
  }

  /** The newest write to the transcript of a run's running agent, once its journal is silent past AGENT_SILENT_MS (F6). */
  const activityOf = (s) => (s.newest && s.newest.event === 'agent-start' && s.lastLineAt !== null && now() - s.lastLineAt > AGENT_SILENT_MS
    ? activity(s.newest.agent, s.lastLineAt) : null);

  /** A stale agent whose transcript has a tool call with no result waits on that tool, not hangs. */
  const withPendingTool = (ev, s) => {
    if (ev.event !== 'stale' || !s.newest || s.newest.event !== 'agent-start') return ev;
    const p = activity.pendingOf(s.newest.agent, s.lastLineAt);
    return p ? { ...ev, signal: 'pending-tool', tool: p.tool, toolSince: p.since } : ev;
  };

  function pollJournals() {
    const events = [];
    for (const [slug, entry] of states) {
      const { st } = entry;
      const r = readJournalFrom(journalPath(root, slug), st.offset);
      // A replaced or truncated journal: the lines up to now are history.
      if (r.reset) entry.historyBefore = now() + 1;
      let emitFrom = null;
      if (entry.first) {
        // A first watch with no state: the history sets the cadence and emits nothing,
        // unless --since asks for the newest run's lines after that seq. The history is
        // the lines older than the watch start: a relaunched driver can write its first
        // line before the first poll, and that line is news (B4).
        if (since !== null) {
          const newestRun = r.lines.length ? r.lines[r.lines.length - 1].run : null;
          emitFrom = { run: newestRun, seq: since };
        // A line stamped at the watch start itself counts as history: the old run-end can share that second.
        } else if (entry.historyBefore === null) entry.historyBefore = watchStartMs + 1;
        entry.first = false;
      }
      let lines = r.lines;
      // K1 — a journal this watch never saw a line of can arrive with old lines, when a
      // merge or a checkout brings in a drive that ran elsewhere. So can the journal of
      // a state saved for another journal. Lines older than the cut are history.
      const cut = entry.historyBefore !== null ? entry.historyBefore : (st.lastLineAt === null ? watchStartMs : null);
      entry.historyBefore = null;
      if (!emitFrom && cut !== null && lines.length) {
        const old = lines.filter((l) => Date.parse(l.at || '') < cut);
        if (old.length) {
          applyJournalLines(root, slug, st, old, { emitFrom: { run: null, seq: Infinity } });
          st.ended = false;
        }
        lines = lines.filter((l) => !(Date.parse(l.at || '') < cut));
      }
      events.push(...applyJournalLines(root, slug, st, lines, { emitFrom }));
      // B1 — the history of a first watch is an earlier run. Its run-end must not end
      // a watch that the session started for a relaunch whose first line is still to come.
      if (emitFrom && emitFrom.seq === Infinity) st.ended = false;
      st.offset = r.offset;
      events.push(...judgeSilence(slug, st, now(), st.watchFrom ?? watchStartMs, activityOf(st)).map((ev) => withPendingTool(ev, st)));
    }
    // K2 — the number of slugs with a stage open right now. Above 1, the
    // commentary gives a stage end one line and keeps the full note for the run end.
    const running = [...states.values()].filter(({ st }) => Object.keys(st.openStages || {}).length).length;
    for (const ev of events) if (ev.event === 'stage-end') ev.parallel = Math.max(1, running + 1);
    return events;
  }

  function pollCommits() {
    lead.repo.polledAt = now();
    const head = git(root, ['rev-parse', 'HEAD']);
    if (!head || head === lead.repo.head) return [];
    const old = lead.repo.head;
    lead.repo.head = head;
    const range = old && git(root, ['merge-base', '--is-ancestor', old, head]) !== null ? `${old}..${head}` : null;
    const log = git(root, ['log', '--no-merges', '--format=%H%x1f%s%x1f%an%x1f%cI', '-n', '20', ...(range ? [range] : ['-1', head])]);
    if (!log) return [];
    return log.split(/\r?\n/).reverse().map((l) => {
      const [sha, subject, author, committedAt] = l.split('\x1f');
      const files = git(root, ['show', '--format=', '--name-only', sha]);
      return { event: 'commit', slugs: [...states.keys()], sha: sha.slice(0, 12), subject, author, committedAt, files: files ? files.split(/\r?\n/).filter(Boolean).length : null, at: iso(now()) };
    });
  }

  function pollProtected() {
    const events = [];
    const { hashes, dirtyAtStart } = lead.repo;
    const said = (lead.repo.protectedSaid ||= {});
    for (const [file, before] of Object.entries(hashes)) {
      const after = hashFile(path.join(root, file));
      if (after === before) continue;
      hashes[file] = after;
      // An agent that edits a file saves it many times. Say it once per quiet window.
      if (now() - (said[file] ?? -Infinity) < PROTECTED_QUIET_MS) continue;
      said[file] = now();
      events.push({
        event: 'protected-change', slugs: [...states.keys()], file,
        change: before === null ? 'created' : after === null ? 'deleted' : 'modified',
        dirtyAtStart: dirtyAtStart.includes(file), at: iso(now()),
      });
    }
    return events;
  }

  // F4 — the record of the facts: one commentary line per stage start and per
  // commit. The model still gives the chat reply and the full notes.
  function fact(slugList, text, atIso) {
    const parsed = Date.parse(atIso || '');
    const ms = Number.isFinite(parsed) ? parsed : now();
    for (const s of slugList) {
      try { writeFact(commentaryPath(root, s), s, text, ms); } catch (e) { process.stderr.write(`yolo-watch: cannot write the commentary of ${s}: ${e.message}\n`); }
    }
  }
  function recordFacts(events) {
    for (const ev of events) {
      if (ev.event === 'stage-start') fact([ev.slug], `stage start · ${ev.stage}${ev.slice ? ` · slice ${ev.slice}` : ''}`, ev.at);
      else if (ev.event === 'commit') fact(Array.isArray(ev.slugs) ? ev.slugs : [], `commit \`${ev.sha}\` · ${ev.subject}`, ev.committedAt);
      // A look-in of a delegated run wakes no session: its record is this line.
      else if (ev.event === 'look-in' && ev.quiet) {
        for (const r of ev.running || []) {
          if (!r.due) continue;
          fact([r.slug], `look-in · ${r.stage || r.agent}${r.slice ? ` · slice ${r.slice}` : ''} · ${r.minutes} min, expected ${r.expectedMinutes} min`, ev.at);
        }
      }
    }
  }

  // The look-in: when a stage runs past its expected time, the watch asks the session to
  // look in and tell the person what is happening. The expected time is the stage's time
  // box from the test profile, or 30 minutes; a given lookInMs replaces it for every stage,
  // and 0 turns the look-in off. A stage gives one look-in past its expected time, and the
  // next only past twice that time. The counts live in the saved state, so a watch
  // restart does not repeat a look-in. In a delegated run the look-in is quiet: it goes to
  // commentary.md, and the session is not woken.
  function pollLookIn() {
    if (lookInMs === 0) return [];
    const t = now();
    const running = [];
    const dueSlugs = new Set();
    for (const [slug, { st }] of states) {
      const before = st.lookIns || {};
      const after = {};
      // A run that ended runs nothing: an agent-start with no agent-end is a stopped agent.
      if (!(st.ended || (st.run && st.endedRun === st.run))) {
        for (const [agent, startedAt] of Object.entries(st.openStages || {})) {
          const { stage, slice } = stageOf({ agent });
          const startMs = Date.parse(startedAt || '');
          const expectedMs = lookInMs > 0 ? lookInMs : stageExpectedMs(profile, stage);
          // A count saved for an earlier agent with the same label starts again at 0.
          const sent = before[agent] && before[agent].startedAt === startedAt ? Number(before[agent].sent) || 0 : 0;
          const passed = Number.isFinite(startMs) ? lookInsPassed(t - startMs, expectedMs, sent) : sent;
          const due = passed > sent;
          after[agent] = { startedAt, sent: passed };
          if (due) dueSlugs.add(slug);
          // C7 — the look-in reader reads these paths and does not search for them.
          running.push({ slug, agent, stage: stage || null, slice: slice || null, startedAt: startedAt || null, minutes: Number.isFinite(startMs) ? Math.round((t - startMs) / 60000) : null,
            expectedMinutes: Math.round(expectedMs / 60000), due,
            root, journal: st.source || journalPath(root, slug), transcript: Number.isFinite(startMs) ? activity.fileOf(agent, startMs) : null });
        }
      }
      st.lookIns = after;
    }
    if (!dueSlugs.size) return [];
    const quiet = [...dueSlugs].every((slug) => runDelegated(root, slug));
    return [{ event: 'look-in', slugs: [...states.keys()], running, ...(quiet ? { quiet: true } : {}), at: iso(t) }];
  }

  const allEnded = () => [...states.values()].every(({ st }) => st.ended);

  function finish() {
    lead.repo.runEnded = allEnded();
    save();
  }

  return {
    root, states, pollJournals, pollCommits, pollProtected,
    pollLookIn, recordFacts, checkLocks, releaseLocks, allEnded, save: finish,
  };
}

// ---------------------------------------------------------------------------
// Subcommands.
// ---------------------------------------------------------------------------
export function appendNote(root, slug, text, kind = null, nowMs = Date.now()) {
  const body = String(text || '').trim();
  if (!body) throw new Error('note: empty text on stdin');
  if (!slug) throw new Error('note: name a slug');
  return writeNote(commentaryPath(root, slug), slug, body, kind, nowMs);
}

function ensureCommentary(file, name) {
  if (existsSync(file)) return;
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `# Commentary — ${name}\n\nThe running commentary of the yolo runs on this workflow, newest last. The watch appends one line for each stage start and each commit; the main session appends a note for the other events (reference/yolo/_commentary.md).\n`);
}

const stampOf = (nowMs) => iso(nowMs).replace('T', ' ').replace(/:\d\d\.\d+Z$/, ' UTC');

function writeNote(file, name, body, kind, nowMs) {
  ensureCommentary(file, name);
  appendFileSync(file, `\n## ${stampOf(nowMs)}${kind ? ` — ${kind}` : ''}\n\n${body}\n`);
  return file;
}

/** F4 — one fact line: a stage start or a commit. */
export function writeFact(file, name, text, nowMs) {
  ensureCommentary(file, name);
  appendFileSync(file, `\n- ${stampOf(nowMs)} · ${text}\n`);
  return file;
}

export function writeControl(root, slug, action, rest, nowMs = Date.now()) {
  const file = controlPath(root, slug);
  if (action === 'clear') {
    const kept = controlFiles(root, slug).map((f) => clearStopRequest(f, journalPath(root, slug), { force: rest.includes('force') }).kept).find(Boolean);
    return kept || null;
  }
  if (action === 'show') return readJson(findRunFile(root, slug, CONTROL_FILE) ?? file);
  let value;
  if (action === 'stop') {
    const after = rest[0] || 'current';
    if (!STOP_AFTER.includes(after)) throw new Error(`control stop: "after" must be one of ${STOP_AFTER.join(', ')}`);
    value = { action: 'stop', after, requestedAt: iso(nowMs) };
  } else {
    throw new Error('control: the action is stop, clear, or show');
  }
  ensureRunDir(root, slug);
  writeJsonAtomic(file, value);
  return value;
}

/**
 * The stop-request check of a driver agent. A request stops the agent when "after" is
 * "current", or when "after" names a stage and the journal has an agent-end of that stage
 * later than the request. A control file that does not parse is a stop after the current agent.
 * Returns `{ stop, reason?, request? }`.
 */
export function stopCheck(root, slug) {
  const file = findRunFile(root, slug, CONTROL_FILE);
  if (!file) return { stop: false };
  let request = readJson(file);
  if (!request || typeof request !== 'object') {
    pause(200);
    request = readJson(file);
    if (!request || typeof request !== 'object') return { stop: true, reason: 'the stop-request file does not parse', request: { action: 'stop', after: 'current' } };
  }
  if (request.action !== 'stop') return { stop: false, request };
  const after = request.after || 'current';
  if (after === 'current') return { stop: true, reason: 'stop after the current agent', request };
  const asked = Date.parse(request.requestedAt || '') || 0;
  const ended = readJournalFrom(journalPath(root, slug), 0).lines.some((l) => l && l.event === 'agent-end' &&
    (l.stage || String(l.agent || '').split(':')[0]) === after && (Date.parse(l.at || '') || 0) > asked);
  return ended ? { stop: true, reason: `stop after ${after}: the ${after} stage ended`, request } : { stop: false, request };
}

export function appendRunEnd(root, slug, stoppedAt = null, nowMs = Date.now(), opts = {}) {
  const file = journalPath(root, slug);
  let run = null;
  let lastEndRun;
  for (const l of readJournalFrom(file, 0).lines) {
    if (l && l.run) run = l.run;
    if (l && l.event === 'run-end') lastEndRun = l.run ?? null;
  }
  if (opts.run) run = opts.run;
  // A3: the driver's last step and the main session can both end one run. The
  // second end appends nothing.
  if (lastEndRun !== undefined && lastEndRun === run && run) return null;
  const line = {
    at: iso(nowMs), run, event: 'run-end', agent: opts.agent || 'main-session',
    ...(stoppedAt ? { stoppedAt } : {}), ...(opts.reason ? { reason: String(opts.reason) } : {}),
  };
  mkdirSync(path.dirname(file), { recursive: true });
  appendFileSync(file, `${JSON.stringify(line)}\n`);
  return line;
}

/**
 * A4: parse the JSON that a driver built for a journal line. The driver writes it
 * with JSON.stringify, so it parses as it is. A copy that lost the escape of a
 * backslash (a Windows path typed by hand) parses after the lone backslashes are
 * doubled.
 */
export function parseLineJson(text) {
  const s = String(text ?? '').trim();
  try { return JSON.parse(s); } catch { /* repaired below */ }
  return JSON.parse(s.replace(/\\(["\\/bfnrt]|u[0-9a-fA-F]{4})?/g, (m, g) => (g ? m : '\\\\')));
}

/** A4: append one journal line through JSON.stringify. Returns the line. */
export function appendJournalLine(file, json, flags = {}, nowMs = Date.now()) {
  const obj = parseLineJson(json);
  // --fields: the values only the agent knows, as a JSON object (numbers and short words).
  const extra = flags.fields ? parseLineJson(flags.fields) : {};
  const line = { at: iso(nowMs), ...obj, ...(extra && typeof extra === 'object' && !Array.isArray(extra) ? extra : {}) };
  if (flags.run) line.run = String(flags.run);
  if (flags.seq !== undefined && Number.isFinite(Number(flags.seq))) line.seq = Number(flags.seq);
  if (flags.status !== undefined) line.status = String(flags.status);
  if (flags.errors !== undefined) line.errors = Math.max(0, Number(flags.errors) || 0);
  if (flags.reason) line.reason = String(flags.reason);
  if (flags['hard-stop-reason']) line.hardStopReason = String(flags['hard-stop-reason']);
  if (flags['route-back']) line.routeBack = String(flags['route-back']);
  mkdirSync(path.dirname(file), { recursive: true });
  appendFileSync(file, `${JSON.stringify(line)}\n`);
  return line;
}

function parseArgs(argv) {
  const pos = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--once') flags.once = true;
    // Git Bash puts its install path in front of a value that starts with /wf; lib/msys.mjs undoes it.
    else if (a.startsWith('--')) { flags[a.slice(2)] = undoGitBashPath(argv[i + 1]).value; i++; } else pos.push(a);
  }
  return { pos, flags };
}

const out = (ev) => process.stdout.write(`${JSON.stringify(ev)}\n`);

/**
 * B2 — a Monitor watch lives 30 minutes, but on Windows the Monitor's stop can
 * leave the node process running. A watch therefore ends itself after its
 * lifetime: 31 minutes by default, 110 minutes with --once (inside the 2-hour
 * limit of a background shell task). --max-minutes or SDLC_WATCH_MAX_MINUTES sets it.
 */
export const DEFAULT_MAX_MINUTES = 31;
export const ONCE_MAX_MINUTES = 110;
export function lifetimeMs(flags, env = process.env) {
  const given = Number(flags['max-minutes'] ?? env.SDLC_WATCH_MAX_MINUTES);
  const minutes = Number.isFinite(given) && given > 0 ? given : (flags.once ? ONCE_MAX_MINUTES : DEFAULT_MAX_MINUTES);
  return minutes * 60 * 1000;
}

/**
 * The look-in: when a stage runs past this many minutes, the watch emits `look-in`, and
 * the session looks at the run and tells the person what is happening. --look-in or
 * SDLC_WATCH_LOOK_IN_MINUTES sets the minutes for every stage, and 0 turns it off.
 * Returns null when neither gives a number: each stage then has its own expected time
 * (stageExpectedMs).
 */
export function lookInMsOf(flags, env = process.env) {
  const raw = flags['look-in'] ?? env.SDLC_WATCH_LOOK_IN_MINUTES;
  const given = raw === undefined || raw === '' ? NaN : Number(raw);
  return Number.isFinite(given) && given >= 0 ? given * 60 * 1000 : null;
}

async function watch(root, slugs, flags) {
  const ms = (name, dflt) => Math.max(10, Number(process.env[name]) || dflt);
  const startedAt = Date.now();
  const maxMs = lifetimeMs(flags);
  // A reader that is gone (the Monitor stopped) ends the watch at the next write.
  process.stdout.on('error', () => process.exit(0));
  const journalMs = ms('SDLC_WATCH_JOURNAL_MS', 5000);
  const gitMs = ms('SDLC_WATCH_GIT_MS', 20000);
  const since = flags.since !== undefined ? Number(flags.since) : null;
  const w = createWatcher({ projectRoot: root, slugs, since: Number.isFinite(since) ? since : null, lookInMs: lookInMsOf(flags) });
  let lastGit = 0;
  let stopping = false;
  const stop = () => { stopping = true; };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  try {
    while (!stopping) {
      // F5 — a newer watch took over: say so once and stop, so no event comes twice.
      const replaced = w.checkLocks();
      if (replaced) { out(replaced); break; }
      const t = Date.now();
      const events = [];
      if (t - lastGit >= gitMs) { lastGit = t; events.push(...w.pollCommits(), ...w.pollProtected()); }
      // The journal goes last, so a run-end follows the commits the run made.
      events.push(...w.pollJournals());
      events.push(...w.pollLookIn());
      w.recordFacts(events);
      // A quiet look-in (a delegated run) is in commentary.md: on stdout it would wake the session.
      for (const ev of events) if (!ev.quiet) out(ev);
      w.save();
      if (w.allEnded()) break;
      // B4 — --once: the first poll with news ends the watch. The session reads the
      // lines, acts, and starts the watch again; the offsets keep every later event.
      // A commit or a stage start is not news: it is printed, and the watch polls on.
      if (flags.once && events.some(isNews)) break;
      if (Date.now() - startedAt >= maxMs) {
        // With --once, the session waits on this process: say why it ends.
        if (flags.once) out({ event: 'watch-timeout', minutes: Math.round(maxMs / 60000), slugs, at: new Date().toISOString() });
        break;
      }
      await new Promise((r) => setTimeout(r, journalMs));
    }
    w.save();
  } finally {
    w.releaseLocks();
  }
}

/** The forms of this script, from its header, so the help never drifts from it. */
export function watchHelp() {
  const src = readFileSync(fileURLToPath(import.meta.url), 'utf8');
  const head = src.slice(src.indexOf('/**'), src.indexOf('*/')).split(/\r?\n/);
  const out = [];
  let inForm = false;
  for (const line of head) {
    if (/^ \* {3}node yolo-watch\.mjs/.test(line)) { inForm = true; out.push(line.replace(/^ \* {3}/, '')); continue; }
    if (inForm && /^ \* {4,}\S/.test(line)) { out.push(line.replace(/^ \* {3}/, '')); continue; }
    inForm = false;
  }
  return out.join('\n');
}

export async function main(argv = process.argv.slice(2)) {
  if (!argv.length || argv[0] === 'help' || argv[0] === '--help' || argv[0] === '-h') {
    process.stdout.write(`${watchHelp()}\n`);
    return argv.length ? 0 : 2;
  }
  const { pos, flags } = parseArgs(argv);
  const [first] = pos;
  if (first === 'note') {
    const [, root, slug] = pos;
    const text = readFileSync(0, 'utf8');
    process.stderr.write(`yolo-watch: note appended to ${appendNote(path.resolve(root), slug, text, flags.event || null, Date.now())}\n`);
    return 0;
  }
  if (first === 'control') {
    const [, root, slug, action, ...rest] = pos;
    const v = writeControl(path.resolve(root), slug, action, rest, Date.now());
    process.stderr.write(action === 'clear'
      ? `yolo-watch: control clear: ${v ? `kept the request made after the run ended: ${JSON.stringify(v)}` : 'no stop request'}\n`
      : `yolo-watch: control ${action}: ${v ? JSON.stringify(v) : 'no control file'}\n`);
    return 0;
  }
  if (first === 'end') {
    const [, root, slug] = pos;
    appendRunEnd(path.resolve(root), slug, flags['stopped-at'] || null, Date.now(), { reason: flags.reason || null, run: flags.run || null, agent: flags.agent || null });
    return 0;
  }
  if (first === 'stop-check') {
    const [, root, slug] = pos;
    if (!root || !slug) { process.stderr.write('usage: yolo-watch.mjs stop-check <projectRoot> <slug>\n'); return 2; }
    process.stdout.write(`${JSON.stringify(stopCheck(path.resolve(root), slug))}\n`);
    return 0;
  }
  if (first === 'line') {
    // `line <projectRoot> <slug> '<json>'` names the journal of the workflow; `line <file> '<json>'`
    // names a file, and a local path of a linked project goes to the records home.
    const [, a, b, c] = pos;
    const file = c !== undefined ? journalPath(path.resolve(a), b) : a ? realPathOf(path.resolve(a)) : null;
    const json = c !== undefined ? c : b;
    if (!file || json === undefined) {
      process.stderr.write("usage: yolo-watch.mjs line <projectRoot> <slug> '<json>' [--status s] [--errors n] [--reason r] [--hard-stop-reason r] [--route-back x]\n");
      return 2;
    }
    try {
      appendJournalLine(file, json, flags);
    } catch (e) {
      // Diagnostic, never a gate: a bad line never fails the agent that writes it.
      process.stderr.write(`yolo-watch: line not appended: ${e.message}\n`);
    }
    return 0;
  }
  const [root, ...slugs] = pos;
  if (!root || !slugs.length) {
    process.stderr.write('usage: yolo-watch.mjs <projectRoot> <slug> [<slug> ...] [--since <seq>]\n');
    return 2;
  }
  for (const slug of slugs) {
    if (!existsSync(workflowDir(path.resolve(root), slug))) {
      process.stderr.write(`yolo-watch: no workflow folder for ${slug}\n`);
      return 2;
    }
  }
  await watch(path.resolve(root), slugs, flags);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => { process.exitCode = code; }, (e) => { process.stderr.write(`yolo-watch: ${e.message}\n`); process.exitCode = 1; });
}
