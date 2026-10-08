#!/usr/bin/env node
/**
 * scripts/yolo-watch.mjs — the built-in watch for /wf yolo (YOLO-COMMENTARY-PLAN).
 *
 * The main session starts this script with the Monitor tool right after the
 * Workflow call. Every stdout line is one JSON event, and every stdout line
 * becomes a chat notification, so the script writes nothing else to stdout.
 * Diagnostics go to stderr.
 *
 *   node yolo-watch.mjs <projectRoot> <slug> [<slug> ...] [--since <seq>]
 *       Watch the runs. Exit after the run-end event of every slug.
 *   node yolo-watch.mjs note <projectRoot> <slug> [--event <kind>]   < text
 *       Append one commentary note (stdin) to .ai/workflows/<slug>/commentary.md.
 *   node yolo-watch.mjs control <projectRoot> <slug> stop <current|plan|implement|verify|review>
 *   node yolo-watch.mjs control <projectRoot> <slug> pause <until ISO> [reason ...]
 *   node yolo-watch.mjs control <projectRoot> <slug> clear|show
 *       Write, delete or print .ai/workflows/<slug>/.control.json (the stop request, G1).
 *   node yolo-watch.mjs end <projectRoot> <slug> [--stopped-at <where>]
 *       Append a run-end line to the driver journal. The main session runs it when
 *       the Workflow returns, so the watch ends at once.
 *
 * In a campaign (YOLO-COMMENTARY-PLAN section 4, K1-K6), add --campaign <brainstorm>:
 *   watch    one watch per wave over the wave's slugs and the campaign journal. It
 *            reads work/campaign/ledger.json every 20 s and follows each unit of a
 *            live wave into its worktree: journal, commits, protected files. A
 *            slug's run-end does not end it; the campaign journal's wave-end,
 *            campaign-end or run-end line does (`end <root> - --campaign <b>`).
 *   note     <slug> also writes to work/campaign/commentary.md; `-` writes there only.
 *   control  writes work/campaign/.control.json with --scope slug|wave|campaign.
 *
 * S1 Poll, never tail: the journal by byte offset every 5 s, git HEAD and the
 *    protected files every 20 s, the usage readings every 60 s. A poll needs no
 *    file-change events, so it works on Windows.
 * S3 The offsets persist in .ai/workflows/<slug>/.watch-state.json. A re-armed
 *    watch starts where the last watch stopped and misses no event.
 * S4 The script exits by itself after the run-end event: a run-end journal line,
 *    or a journal whose newest line is an agent-end and that stays silent past
 *    the liveness limit (_control-file-ownership.md, the staleness rule).
 *
 * WF-WATCH-MONITOR-PLAN:
 * F3 A restart keeps the first watch's start (keptWatchFrom), so the silence of a
 *    live run counts from its last line, not from the 30-minute Monitor restart.
 * F4 Each stage-start and commit event also appends one line to commentary.md.
 * F5 One watch per journal: a newer watch takes the lock, and the older one emits
 *    watch-replaced and exits; a slug watch under a live campaign watch emits
 *    watch-covered and exits.
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
import { LIVE_WAVE_STATES } from '../lib/campaign.mjs';

// The event rules live in lib/live-events.mjs, shared with the live view of the mod (WF-LIVE-VIEWS-PLAN M2).
export { STAGE_KINDS, frontmatterField, judgeSilence, liveLimitMs, stageOf };

export const STOP_AFTER = Object.freeze(['current', 'plan', 'implement', 'verify', 'review']);
export { STALE_FLOOR_MS };
// K1 — a first campaign watch still reports the campaign events of this window, because the
// wave start writes `wave-start` just before the session starts the watch.
export const CAMPAIGN_FIRST_WINDOW_MS = 5 * 60 * 1000;
export const DEFAULT_PROTECTED = Object.freeze(['PRODUCT.md', 'DESIGN.md']);
export const DEFAULT_BUDGET = Object.freeze({ fiveHourSlow: 75, fiveHourPause: 90, sevenDayReserve: 15 });
const STATE_FILE = '.watch-state.json';
// The campaign journal lines that become events (K3). Heartbeats and bookkeeping
// lines (agent-start, agent-end, unit-state, replan, wave-state) are not news.
export const CAMPAIGN_EVENTS = Object.freeze([
  'wave-start', 'merge', 'wave-verify', 'refuter', 'fidelity', 'wave-ready', 'drift', 'pr-opened', 'ci-result',
  'merged', 'released', 'asked', 'paused', 'resumed', 'wave-end', 'campaign-end',
]);
const CAMPAIGN_END_EVENTS = Object.freeze(['wave-end', 'campaign-end', 'run-end']);
const STATE_VERSION = 1;

const workflowDir = (root, slug) => path.join(root, '.ai', 'workflows', slug);
export const journalPath = (root, slug) => path.join(workflowDir(root, slug), '.driver-journal.jsonl');
export const statePath = (root, slug) => path.join(workflowDir(root, slug), STATE_FILE);
export const controlPath = (root, slug) => path.join(workflowDir(root, slug), '.control.json');
export const commentaryPath = (root, slug) => path.join(workflowDir(root, slug), 'commentary.md');
const campaignDir = (root, b) => path.join(workflowDir(root, b), 'work', 'campaign');
export const campaignJournalPath = (root, b) => path.join(campaignDir(root, b), '.campaign-journal.jsonl');
export const campaignStatePath = (root, b) => path.join(campaignDir(root, b), STATE_FILE);
export const campaignControlPath = (root, b) => path.join(campaignDir(root, b), '.control.json');
export const campaignCommentaryPath = (root, b) => path.join(campaignDir(root, b), 'commentary.md');
const workIndexPath = (root, b) => path.join(workflowDir(root, b), 'work', 'index.md');
const ledgerPath = (root, b) => path.join(campaignDir(root, b), 'ledger.json');

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
// stops with one `watch-replaced` line. A slug watch stops at once with one
// `watch-covered` line when a live campaign watch already reads its journal.
// The locks live in the temp folder: never in a workflow folder, which a slug
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
  /** The newest write to the transcript of the agent with this label, started at `startMs`; null when none is found. */
  return (label, startMs) => {
    if (!label) return null;
    if (now() - listedAt >= RELIST_MS) { listedAt = now(); list(); }
    let best = null;
    for (const f of files) {
      if (f.label !== label) continue;
      let m;
      try { m = statSync(f.file).mtimeMs; } catch { continue; }
      if (best === null || m > best) best = m;
    }
    // A transcript older than the agent's start belongs to an earlier agent with the same label.
    return best !== null && best >= startMs - 60 * 1000 ? best : null;
  };
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
    // A shorter file was replaced or truncated: read it again from the start.
    const start = offset > size ? 0 : offset;
    if (size === start) return { lines: [], offset: start };
    const buf = Buffer.alloc(size - start);
    readSync(fd, buf, 0, buf.length, start);
    const lastNl = buf.lastIndexOf(0x0a);
    if (lastNl === -1) return { lines: [], offset: start };
    const text = buf.subarray(0, lastNl + 1).toString('utf8');
    const lines = [];
    for (const raw of text.split('\n')) {
      const t = raw.trim();
      if (!t) continue;
      try { lines.push(JSON.parse(t)); } catch { /* a torn or hand-edited line: skip it */ }
    }
    return { lines, offset: start + lastNl + 1 };
  } finally {
    closeSync(fd);
  }
}

// The artifact a stage wrote: 04-plan-<slice>.md first, then 04-plan.md.
export function stageArtifact(root, slug, stage, slice) {
  const prefix = STAGE_FILE[stage];
  if (!prefix) return null;
  const dir = workflowDir(root, slug);
  const names = slice ? [`${prefix}-${slice}.md`, `${prefix}.md`] : [`${prefix}.md`];
  for (const n of names) {
    const file = path.join(dir, n);
    if (existsSync(file)) return file;
  }
  return null;
}

// A decision that needs the person (3.2): the rule is decisionSignalOf; this reads the files.
export function decisionSignal(file) {
  let text = '';
  try { text = readFileSync(file, 'utf8'); } catch { return null; }
  let yaml = '';
  try { yaml = readFileSync(file.replace(/\.md$/, '.yaml'), 'utf8'); } catch { /* no sibling */ }
  return decisionSignalOf(text, yaml);
}

// ---------------------------------------------------------------------------
// Protected files (S5): the config list, PRODUCT.md and DESIGN.md, the paths a
// steer.md line protects, and every file with uncommitted edits at run start.
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
    budget: { ...DEFAULT_BUDGET, ...((y.usageBudget && typeof y.usageBudget === 'object') ? y.usageBudget : {}) },
  };
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

export function protectedSet(root, slugs, cfg) {
  const set = new Set([...DEFAULT_PROTECTED, ...cfg.protectedFiles]);
  for (const slug of slugs) {
    try { for (const p of steerProtectedPaths(readFileSync(path.join(workflowDir(root, slug), 'steer.md'), 'utf8'))) set.add(p); } catch { /* no steer.md */ }
  }
  const dirty = dirtyFiles(root);
  for (const p of dirty) set.add(p);
  return { files: [...set].sort(), dirtyAtStart: dirty.sort() };
}

// ---------------------------------------------------------------------------
// Usage (3.2 usage / usage-reset): the newest reading the usage guard wrote to
// ~/.claude/sdlc/usage/<sessionId>.json, shape { rateLimits: [{ kind,
// percentUsed, resetsAt }] } (WF-CAMPAIGN-PLAN 17.1). No reading → no event.
// ---------------------------------------------------------------------------
/**
 * The newest usage reading. A window whose reset time has passed no longer
 * applies, so it is dropped. Without this rule, an old reading gives a pause
 * event and a reset event every minute. With no window left, there is no reading.
 */
export function newestUsage(dir, nowMs = Date.now()) {
  let best = null;
  let entries = [];
  try { entries = readdirSync(dir).filter((n) => n.endsWith('.json')); } catch { return null; }
  for (const n of entries) {
    const file = path.join(dir, n);
    let mtime = 0;
    try { mtime = statSync(file).mtimeMs; } catch { continue; }
    if (!best || mtime > best.mtime) best = { file, mtime };
  }
  if (!best) return null;
  const v = readJson(best.file);
  if (!v || !Array.isArray(v.rateLimits)) return null;
  const win = (kind) => {
    const w = v.rateLimits.find((r) => r && r.kind === kind) || null;
    const reset = Date.parse(w?.resetsAt ?? '');
    return w && !(Number.isFinite(reset) && reset <= nowMs) ? w : null;
  };
  const fiveHour = win('five_hour');
  const sevenDay = win('seven_day');
  if (!fiveHour && !sevenDay) return null;
  return { at: iso(best.mtime), fiveHour, sevenDay };
}

export function usageLevel(reading, budget) {
  if (!reading) return 'unknown';
  const five = reading.fiveHour ? Number(reading.fiveHour.percentUsed) : NaN;
  const seven = reading.sevenDay ? Number(reading.sevenDay.percentUsed) : NaN;
  if (five >= budget.fiveHourPause || seven >= 100 - budget.sevenDayReserve) return 'pause';
  if (five >= budget.fiveHourSlow) return 'slow';
  return 'ok';
}

// ---------------------------------------------------------------------------
// State (S3).
// ---------------------------------------------------------------------------
function freshSlugState() {
  return {
    version: STATE_VERSION, offset: 0, run: null, lastLineAt: null, prevLineAt: null, longestGapMs: 0,
    newest: null, ended: false, staleFor: null, decisionsSeen: [], openStages: {},
  };
}

export function loadState(root, slug) {
  const s = readJson(statePath(root, slug));
  return s && s.version === STATE_VERSION ? { ...freshSlugState(), ...s } : null;
}


// ---------------------------------------------------------------------------
// One poll of one slug's journal. Pure apart from the artifact reads.
// ---------------------------------------------------------------------------
export function applyJournalLines(root, slug, st, lines, { emitFrom = null } = {}) {
  const artifactOf = (stage, slice) => {
    const file = stageArtifact(root, slug, stage, slice);
    if (!file) return null;
    let status = null;
    try { status = frontmatterField(readFileSync(file, 'utf8'), 'status'); } catch { /* unreadable */ }
    let mtime = 0;
    try { mtime = statSync(file).mtimeMs; } catch { /* gone */ }
    return { rel: path.relative(root, file).split(path.sep).join('/'), status, signal: decisionSignal(file), mtime };
  };
  return applyLines(slug, st, lines, { emitFrom, artifactOf });
}

export function readWorkRevision(root, b) {
  try {
    const n = Number(frontmatterField(readFileSync(workIndexPath(root, b), 'utf8'), 'work-revision'));
    return Number.isFinite(n) ? n : null;
  } catch { return null; }
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

const UNITS_MS = 20 * 1000;

// ---------------------------------------------------------------------------
// The watcher: one object, polled by a timer in main() and by tests directly.
// ---------------------------------------------------------------------------
export function createWatcher({
  projectRoot, slugs, since = null, usageDir = null, campaign = null, now = () => Date.now(),
  projectsDir = null, lockDir = null, lockId = null,
}) {
  const root = path.resolve(projectRoot);
  const watchStartMs = now();
  const cfg = readConfig(root);
  const states = new Map();
  const activity = createActivityFinder({
    projectsDir: projectsDir || process.env.SDLC_CLAUDE_PROJECTS_DIR || path.join(os.homedir(), '.claude', 'projects'),
    roots: [root, process.cwd()], now,
  });
  const locks = lockDir || process.env.SDLC_WATCH_LOCK_DIR || null;
  const me = { id: lockId || `${process.pid}-${watchStartMs}`, pid: process.pid, kind: campaign ? 'campaign' : 'slug', ...(campaign ? { campaign } : {}), at: iso(watchStartMs) };
  const held = new Set();

  // F2 — a slug's journal is where its drive writes: in its worktree when it has one.
  function setSource(slug, entry) {
    const source = journalPath(entry.root, slug);
    const { st } = entry;
    // A state from before F2 read the journal of the root it was given.
    if (!st.source) st.source = source;
    if (st.source === source) return;
    // The drive moved: a worktree was added, or removed after the merge. The new
    // journal's lines older than this moment are history.
    st.source = source;
    st.offset = 0;
    entry.historyBefore = now();
  }

  function addSlug(slug, srcRoot, { fresh = 'first' } = {}) {
    const saved = loadState(root, slug);
    const entry = saved
      // A new watch belongs to a new launch or a re-arm. The previous run's end
      // must not end this watch before the relaunched driver writes its first line.
      ? { st: { ...saved, ended: false, watchFrom: keptWatchFrom(saved, watchStartMs) }, first: false, root: srcRoot, historyBefore: null }
      : { st: { ...freshSlugState(), watchFrom: watchStartMs }, first: fresh === 'first', root: srcRoot, historyBefore: fresh === 'first' ? null : watchStartMs };
    states.set(slug, entry);
    setSource(slug, entry);
    return entry;
  }
  for (const slug of slugs) addSlug(slug, root);

  // F2 — in a campaign, the ledger names the units of each live wave and their worktrees.
  let unitsReadAt = -Infinity;
  function refreshUnits() {
    if (!campaign || now() - unitsReadAt < UNITS_MS) return;
    unitsReadAt = now();
    const ledger = readJson(ledgerPath(root, campaign));
    const want = new Map();
    if (ledger && Array.isArray(ledger.waves) && ledger.units && typeof ledger.units === 'object') {
      for (const w of ledger.waves) {
        if (!w || !LIVE_WAVE_STATES.includes(w.state)) continue;
        for (const key of Array.isArray(w.units) ? w.units : []) {
          const u = ledger.units[key];
          if (!u || typeof u.slug !== 'string' || !u.slug) continue;
          const wt = u.worktree && typeof u.worktree.path === 'string' ? path.resolve(u.worktree.path) : null;
          want.set(u.slug, wt && existsSync(workflowDir(wt, u.slug)) ? wt : root);
        }
      }
    }
    for (const [slug, src] of want) {
      const entry = states.get(slug);
      if (!entry) {
        // A unit that a later wave start adds: its lines from before this watch are history.
        if (existsSync(workflowDir(src, slug))) addSlug(slug, src, { fresh: 'history' });
        continue;
      }
      if (entry.root !== src) { entry.root = src; setSource(slug, entry); }
    }
    // A unit whose worktree is gone reads the main checkout again.
    for (const [slug, entry] of states) {
      if (entry.root !== root && !want.has(slug) && !existsSync(workflowDir(entry.root, slug))) { entry.root = root; setSource(slug, entry); }
    }
  }
  refreshUnits();

  const lead = states.get(slugs[0]).st;
  // The repo-wide parts (HEAD, protected files, usage) live in the first slug's state.
  if (!lead.repo || lead.repo.root !== root || states.get(slugs[0]).first || lead.repo.runEnded) {
    const prot = protectedSet(root, slugs, cfg);
    const hashes = {};
    for (const f of prot.files) hashes[f] = hashFile(path.join(root, f));
    lead.repo = { root, head: git(root, ['rev-parse', 'HEAD']), hashes, dirtyAtStart: prot.dirtyAtStart, usageLevel: null, usagePauseUntil: null, runEnded: false };
  }

  // F5 — one watch per journal.
  const lockTargets = () => [
    ...(campaign ? [campaignJournalPath(root, campaign)] : []),
    ...[...states].map(([slug, e]) => journalPath(e.root, slug)),
  ].map((t) => lockFileOf(t, locks));
  function claimLocks() {
    for (const file of lockTargets()) {
      if (held.has(file)) continue;
      try {
        mkdirSync(path.dirname(file), { recursive: true });
        writeJsonAtomic(file, me);
        held.add(file);
      } catch (e) { process.stderr.write(`yolo-watch: cannot write the lock ${file}: ${e.message}\n`); }
    }
  }
  let covered = null;
  if (!campaign) {
    for (const file of lockTargets()) {
      const cur = readLock(file);
      if (cur && cur.id !== me.id && cur.kind === 'campaign' && pidAlive(cur.pid)) { covered = cur; break; }
    }
  }
  if (!covered) claimLocks();

  /** A `watch-replaced` event when a newer live watch took one of this watch's locks; else null. */
  function checkLocks() {
    for (const file of held) {
      const cur = readLock(file);
      if (cur && cur.id !== me.id && pidAlive(cur.pid)) {
        return { event: 'watch-replaced', by: cur.kind, ...(cur.campaign ? { campaign: cur.campaign } : {}), slugs: [...states.keys()], at: iso(now()) };
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
        mkdirSync(workflowDir(root, slug), { recursive: true });
        writeJsonAtomic(statePath(root, slug), st);
      } catch (e) { process.stderr.write(`yolo-watch: cannot save state for ${slug}: ${e.message}\n`); }
    }
  }

  /** The newest write to the transcript of a run's running agent, once its journal is silent past AGENT_SILENT_MS (F6). */
  const activityOf = (s) => (s.newest && s.newest.event === 'agent-start' && s.lastLineAt !== null && now() - s.lastLineAt > AGENT_SILENT_MS
    ? activity(s.newest.agent, s.lastLineAt) : null);

  // K1/K3 — the campaign journal and the work revision, in a campaign only.
  let camp = null;
  if (campaign) {
    const saved = readJson(campaignStatePath(root, campaign));
    camp = saved && saved.version === STATE_VERSION
      ? { ...saved, ended: false, first: false, watchFrom: keptWatchFrom(saved, watchStartMs) }
      : { version: STATE_VERSION, offset: 0, ended: false, first: true, revision: readWorkRevision(root, campaign), open: {}, openWaves: [], lastLineAt: null, longestGapMs: 0, prevLineAt: null, newest: null, staleFor: null, watchFrom: watchStartMs };
  }

  function pollCampaign() {
    if (!camp) return [];
    const events = [];
    const r = readJournalFrom(campaignJournalPath(root, campaign), camp.offset);
    const skip = camp.first;
    camp.first = false;
    for (const line of r.lines) {
      const at = Date.parse(line.at || '');
      if (Number.isFinite(at)) {
        if (camp.prevLineAt !== null) camp.longestGapMs = Math.max(camp.longestGapMs, at - camp.prevLineAt);
        camp.prevLineAt = at; camp.lastLineAt = at;
      }
      camp.newest = { event: line.event || null, agent: line.agent || null, status: line.status || null };
      camp.staleFor = null;
      if (line.event === 'agent-start') { camp.open[line.agent] = line.at || null; continue; }
      if (line.event === 'agent-end') { delete camp.open[line.agent]; continue; }
      // Waves overlap: wave n ships while wave n+1 runs. A wave-end ends the watch
      // only when no other started wave is still open.
      if (line.event === 'wave-start' && camp.openWaves && line.wave != null && !camp.openWaves.includes(line.wave)) camp.openWaves.push(line.wave);
      // A new wave reopens the watch. An earlier end line (a wave built before the
      // campaign, a finished run) is history and must not end this watch.
      if (line.event === 'wave-start') camp.ended = false;
      if (line.event === 'wave-end' && camp.openWaves) {
        camp.openWaves = camp.openWaves.filter((n) => n !== line.wave);
        if (!camp.openWaves.length) camp.ended = true;
      } else if (CAMPAIGN_END_EVENTS.includes(line.event)) camp.ended = true;
      if (skip && !(Number.isFinite(at) && at >= watchStartMs - CAMPAIGN_FIRST_WINDOW_MS)) continue;
      if (CAMPAIGN_EVENTS.includes(line.event)) {
        const { at: lineAt, event: name, ...rest } = line;
        events.push({ ...rest, event: name, campaign, at: lineAt || iso(now()) });
        // 9.3 step 6 — units that moved at a wave start wait for prepare.
        if (name === 'wave-start' && Array.isArray(line.moved) && line.moved.length) {
          events.push({ event: 'prepare-waiting', campaign, wave: line.wave, units: line.moved, at: lineAt || iso(now()) });
        }
      }
      if (line.event === 'run-end' && !skip) events.push({ event: 'run-end', campaign, inferred: false, at: line.at || iso(now()) });
    }
    camp.offset = r.offset;
    // A boundary agent that started and went silent: by its own transcript when
    // one is found (F6), else past the journal's liveness limit, counted from the
    // last line or from the first watch of this run (F3).
    if (!camp.ended && camp.lastLineAt !== null && camp.newest && camp.newest.event === 'agent-start') {
      const act = activityOf(camp);
      const silentMs = now() - (act !== null ? Math.max(camp.lastLineAt, act) : Math.max(camp.lastLineAt, camp.watchFrom ?? watchStartMs));
      const limit = act !== null ? AGENT_SILENT_MS : Math.max(STALE_FLOOR_MS, camp.longestGapMs || 0);
      if (silentMs > limit && camp.staleFor !== String(camp.lastLineAt)) {
        camp.staleFor = String(camp.lastLineAt);
        events.push({ event: 'stale', campaign, lastAgent: camp.newest.agent, lastLineAt: iso(camp.lastLineAt), silentMinutes: Math.round(silentMs / 60000), limitMinutes: Math.round(limit / 60000), signal: act !== null ? 'transcript' : 'journal', at: iso(now()) });
      }
    }
    return events;
  }

  // K3 work-changed — the brainstorm wrote a new work-revision.
  function pollWorkRevision() {
    if (!camp) return [];
    const rev = readWorkRevision(root, campaign);
    if (rev === null || rev === camp.revision) return [];
    const from = camp.revision;
    camp.revision = rev;
    return from === null ? [] : [{ event: 'work-changed', campaign, from, to: rev, at: iso(now()) }];
  }

  function pollJournals() {
    refreshUnits();
    if (campaign && !covered) claimLocks();
    const events = [];
    for (const [slug, entry] of states) {
      const { st } = entry;
      const r = readJournalFrom(journalPath(entry.root, slug), st.offset);
      let emitFrom = null;
      if (entry.first) {
        // A first watch with no state: the history sets the cadence and emits nothing,
        // unless --since asks for the newest run's lines after that seq.
        const newestRun = r.lines.length ? r.lines[r.lines.length - 1].run : null;
        emitFrom = { run: newestRun, seq: since === null ? Infinity : since };
        entry.first = false;
      }
      let lines = r.lines;
      // K1 — a journal this watch never saw a line of can arrive with old lines, when a
      // wave merge brings in a drive that ran in a worktree. F2 — so can the journal of
      // a drive that moved. Lines older than the cut are history.
      const cut = entry.historyBefore !== null ? entry.historyBefore : (st.lastLineAt === null ? watchStartMs : null);
      entry.historyBefore = null;
      if (!emitFrom && cut !== null && lines.length) {
        const old = lines.filter((l) => Date.parse(l.at || '') < cut);
        if (old.length) applyJournalLines(entry.root, slug, st, old, { emitFrom: { run: null, seq: Infinity } });
        lines = lines.filter((l) => !(Date.parse(l.at || '') < cut));
      }
      events.push(...applyJournalLines(entry.root, slug, st, lines, { emitFrom }));
      st.offset = r.offset;
      events.push(...judgeSilence(slug, st, now(), st.watchFrom ?? watchStartMs, activityOf(st)));
    }
    // K2 — the number of slugs with a stage open right now. Above 1, the
    // commentary gives a stage end one line and keeps the full note for the run end.
    const running = [...states.values()].filter(({ st }) => Object.keys(st.openStages || {}).length).length;
    for (const ev of events) if (ev.event === 'stage-end') ev.parallel = Math.max(1, running + 1);
    return [...events, ...pollCampaign()];
  }

  function commitsIn(dir, old, head, slugList) {
    const range = old && git(dir, ['merge-base', '--is-ancestor', old, head]) !== null ? `${old}..${head}` : null;
    const log = git(dir, ['log', '--no-merges', '--format=%H%x1f%s%x1f%an%x1f%cI', '-n', '20', ...(range ? [range] : ['-1', head])]);
    if (!log) return [];
    return log.split(/\r?\n/).reverse().map((l) => {
      const [sha, subject, author, committedAt] = l.split('\x1f');
      const files = git(dir, ['show', '--format=', '--name-only', sha]);
      return { event: 'commit', slugs: slugList, sha: sha.slice(0, 12), subject, author, committedAt, files: files ? files.split(/\r?\n/).filter(Boolean).length : null, at: iso(now()) };
    });
  }

  // F2 — the protected files of a worktree: the defaults, the config list, and the slug's steer.md paths.
  function worktreeHashes(dir, slug) {
    const list = new Set([...DEFAULT_PROTECTED, ...cfg.protectedFiles]);
    try { for (const p of steerProtectedPaths(readFileSync(path.join(workflowDir(dir, slug), 'steer.md'), 'utf8'))) list.add(p); } catch { /* no steer.md */ }
    const hashes = {};
    for (const f of list) hashes[f] = hashFile(path.join(dir, f));
    return hashes;
  }

  /** The worktree state of a unit in a worktree. The first look records it and gives no event. */
  function worktreeOf(slug, entry) {
    if (entry.root === root) return null;
    if (entry.st.wt && entry.st.wt.root === entry.root) return entry.st.wt;
    const head = git(entry.root, ['rev-parse', 'HEAD']);
    if (!head) return null;
    entry.st.wt = { root: entry.root, head, hashes: worktreeHashes(entry.root, slug) };
    return null;
  }

  const mainSlugs = () => [...states].filter(([, e]) => e.root === root).map(([slug]) => slug);

  function pollCommits() {
    const events = [];
    const head = git(root, ['rev-parse', 'HEAD']);
    if (head && head !== lead.repo.head) {
      const old = lead.repo.head;
      lead.repo.head = head;
      events.push(...commitsIn(root, old, head, mainSlugs()));
    }
    // F2 — a drive in a worktree commits on its slug branch there.
    for (const [slug, entry] of states) {
      const wt = worktreeOf(slug, entry);
      if (!wt) continue;
      const h = git(entry.root, ['rev-parse', 'HEAD']);
      if (!h || h === wt.head) continue;
      const old = wt.head;
      wt.head = h;
      events.push(...commitsIn(entry.root, old, h, [slug]));
    }
    return events;
  }

  function pollProtected() {
    const events = [];
    const check = (dir, hashes, slugList, dirty) => {
      for (const [file, before] of Object.entries(hashes)) {
        const after = hashFile(path.join(dir, file));
        if (after === before) continue;
        hashes[file] = after;
        events.push({
          event: 'protected-change', slugs: slugList, file,
          change: before === null ? 'created' : after === null ? 'deleted' : 'modified',
          dirtyAtStart: dirty.includes(file), ...(dir === root ? {} : { worktree: dir }), at: iso(now()),
        });
      }
    };
    check(root, lead.repo.hashes, [...states.keys()], lead.repo.dirtyAtStart);
    for (const [slug, entry] of states) {
      const wt = worktreeOf(slug, entry);
      if (wt) check(entry.root, wt.hashes, [slug], []);
    }
    return events;
  }

  function pollUsage() {
    const dir = usageDir || path.join(os.homedir(), '.claude', 'sdlc', 'usage');
    const reading = newestUsage(dir, now());
    if (!reading) return [];
    const level = usageLevel(reading, cfg.budget);
    const prev = lead.repo.usageLevel;
    lead.repo.usageLevel = level;
    const windows = { fiveHour: reading.fiveHour, sevenDay: reading.sevenDay };
    const rank = { ok: 0, slow: 1, pause: 2 };
    if (level === 'pause') {
      const w = (reading.fiveHour && Number(reading.fiveHour.percentUsed) >= cfg.budget.fiveHourPause) ? reading.fiveHour : reading.sevenDay;
      lead.repo.usagePauseUntil = (w && w.resetsAt) || null;
    }
    if (prev !== null && rank[level] > rank[prev]) return [{ event: 'usage', slugs: [...states.keys()], level, windows, readingAt: reading.at, at: iso(now()) }];
    if (prev === 'pause' && level !== 'pause') {
      lead.repo.usagePauseUntil = null;
      return [{ event: 'usage-reset', slugs: [...states.keys()], level, windows, readingAt: reading.at, at: iso(now()) }];
    }
    if (prev === null && level !== 'ok') return [{ event: 'usage', slugs: [...states.keys()], level, windows, readingAt: reading.at, at: iso(now()) }];
    return [];
  }

  function pollUsageReset() {
    const until = Date.parse(lead.repo.usagePauseUntil || '');
    if (!Number.isFinite(until) || now() < until) return [];
    lead.repo.usagePauseUntil = null;
    lead.repo.usageLevel = 'ok';
    return [{ event: 'usage-reset', slugs: [...states.keys()], level: 'ok', reason: 'reset time passed', at: iso(now()) }];
  }

  // F4 — the record of the facts: one commentary line per stage start and per
  // commit, written where the drive writes its records (its worktree when it has
  // one). The model still gives the chat reply and the full notes.
  const rootOf = (slug) => (states.get(slug) ? states.get(slug).root : root);
  function fact(slugList, text, atIso) {
    const parsed = Date.parse(atIso || '');
    const ms = Number.isFinite(parsed) ? parsed : now();
    for (const s of slugList) {
      try { writeFact(commentaryPath(rootOf(s), s), s, text, ms); } catch (e) { process.stderr.write(`yolo-watch: cannot write the commentary of ${s}: ${e.message}\n`); }
    }
    if (campaign) {
      try { writeFact(campaignCommentaryPath(root, campaign), `campaign ${campaign}`, slugList.length ? `${slugList.join(', ')} · ${text}` : text, ms); } catch (e) { process.stderr.write(`yolo-watch: cannot write the campaign commentary: ${e.message}\n`); }
    }
  }
  function recordFacts(events) {
    for (const ev of events) {
      if (ev.event === 'stage-start') fact([ev.slug], `stage start · ${ev.stage}${ev.slice ? ` · slice ${ev.slice}` : ''}`, ev.at);
      else if (ev.event === 'commit') fact(Array.isArray(ev.slugs) ? ev.slugs : [], `commit \`${ev.sha}\` · ${ev.subject}`, ev.committedAt);
    }
  }

  // In a campaign, a slug's run-end does not end the watch: the next slug of the
  // wave still runs. The campaign journal's wave-end or run-end does.
  const allEnded = () => (camp ? camp.ended : [...states.values()].every(({ st }) => st.ended));

  function finish() {
    lead.repo.runEnded = allEnded();
    save();
    if (camp) {
      const { first, ...keep } = camp;
      try { writeJsonAtomic(campaignStatePath(root, campaign), keep); } catch (e) { process.stderr.write(`yolo-watch: cannot save the campaign state: ${e.message}\n`); }
    }
  }

  return {
    root, states, covered, pollJournals, pollCommits, pollProtected, pollUsage, pollUsageReset, pollWorkRevision,
    recordFacts, checkLocks, releaseLocks, allEnded, save: finish,
  };
}

// ---------------------------------------------------------------------------
// Subcommands.
// ---------------------------------------------------------------------------
export function appendNote(root, slug, text, kind = null, nowMs = Date.now(), campaign = null) {
  const body = String(text || '').trim();
  if (!body) throw new Error('note: empty text on stdin');
  // K4 — a campaign note goes to work/campaign/commentary.md, and a slug's note
  // also to the slug's own commentary.md. Slug `-` means the campaign only.
  const files = [];
  if (campaign) files.push(writeNote(campaignCommentaryPath(root, campaign), `campaign ${campaign}`, body, kind, nowMs));
  if (slug && slug !== '-') files.push(writeNote(commentaryPath(root, slug), slug, body, kind, nowMs));
  if (!files.length) throw new Error('note: name a slug, or `-` with --campaign');
  return files[files.length - 1];
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

export function writeControl(root, slug, action, rest, nowMs = Date.now(), { campaign = null, scope = null } = {}) {
  // K5 — in a campaign, the request goes to the campaign's control file with a
  // scope: one slug, the wave ("stop after this wave"), or the campaign.
  if (campaign && !['slug', 'wave', 'campaign'].includes(scope || 'slug')) throw new Error('control: --scope is slug, wave, or campaign');
  if (campaign && (scope || 'slug') === 'slug' && (!slug || slug === '-')) throw new Error('control: a slug scope names the slug');
  const file = campaign ? campaignControlPath(root, campaign) : controlPath(root, slug);
  const tag = campaign ? { scope: scope || 'slug', ...((scope || 'slug') === 'slug' ? { slug } : {}) } : {};
  if (action === 'clear') { rmSync(file, { force: true }); return null; }
  if (action === 'show') return readJson(file);
  let value;
  if (action === 'stop') {
    const after = rest[0] || 'current';
    if (!STOP_AFTER.includes(after)) throw new Error(`control stop: "after" must be one of ${STOP_AFTER.join(', ')}`);
    value = { action: 'stop', ...tag, after, requestedAt: iso(nowMs) };
  } else if (action === 'pause') {
    const until = rest[0];
    if (!until || !Number.isFinite(Date.parse(until))) throw new Error('control pause: give the reset time as an ISO 8601 timestamp');
    value = { action: 'pause', ...tag, until: iso(Date.parse(until)), reason: rest.slice(1).join(' ') || 'usage limit', requestedAt: iso(nowMs) };
  } else {
    throw new Error('control: the action is stop, pause, clear, or show');
  }
  mkdirSync(path.dirname(file), { recursive: true });
  writeJsonAtomic(file, value);
  return value;
}

export function appendRunEnd(root, slug, stoppedAt = null, nowMs = Date.now(), campaign = null) {
  const file = campaign && (!slug || slug === '-') ? campaignJournalPath(root, campaign) : journalPath(root, slug);
  let run = null;
  for (const l of readJournalFrom(file, 0).lines) if (l && l.run) run = l.run;
  const line = { at: iso(nowMs), run, event: 'run-end', agent: 'main-session', ...(stoppedAt ? { stoppedAt } : {}) };
  mkdirSync(path.dirname(file), { recursive: true });
  appendFileSync(file, `${JSON.stringify(line)}\n`);
  return line;
}

function parseArgs(argv) {
  const pos = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) { flags[a.slice(2)] = argv[i + 1]; i++; } else pos.push(a);
  }
  return { pos, flags };
}

const out = (ev) => process.stdout.write(`${JSON.stringify(ev)}\n`);

async function watch(root, slugs, flags) {
  const ms = (name, dflt) => Math.max(10, Number(process.env[name]) || dflt);
  const journalMs = ms('SDLC_WATCH_JOURNAL_MS', 5000);
  const gitMs = ms('SDLC_WATCH_GIT_MS', 20000);
  const usageMs = ms('SDLC_WATCH_USAGE_MS', 60000);
  const since = flags.since !== undefined ? Number(flags.since) : null;
  const w = createWatcher({ projectRoot: root, slugs, since: Number.isFinite(since) ? since : null, usageDir: process.env.SDLC_USAGE_DIR || null, campaign: flags.campaign || null });
  // F5 — a live campaign watch already reads these journals: say so once and stop.
  if (w.covered) {
    out({ event: 'watch-covered', by: 'campaign', campaign: w.covered.campaign || null, slugs, at: new Date().toISOString() });
    return;
  }
  let lastGit = 0;
  let lastUsage = 0;
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
      if (t - lastGit >= gitMs) { lastGit = t; events.push(...w.pollCommits(), ...w.pollProtected(), ...w.pollWorkRevision()); }
      if (t - lastUsage >= usageMs) { lastUsage = t; events.push(...w.pollUsage()); }
      events.push(...w.pollUsageReset());
      // The journal goes last, so a run-end follows the commits the run made.
      events.push(...w.pollJournals());
      w.recordFacts(events);
      for (const ev of events) out(ev);
      w.save();
      if (w.allEnded()) break;
      await new Promise((r) => setTimeout(r, journalMs));
    }
    w.save();
  } finally {
    w.releaseLocks();
  }
}

export async function main(argv = process.argv.slice(2)) {
  const { pos, flags } = parseArgs(argv);
  const [first] = pos;
  if (first === 'note') {
    const [, root, slug] = pos;
    const text = readFileSync(0, 'utf8');
    process.stderr.write(`yolo-watch: note appended to ${appendNote(path.resolve(root), slug, text, flags.event || null, Date.now(), flags.campaign || null)}\n`);
    return 0;
  }
  if (first === 'control') {
    const [, root, slug, action, ...rest] = pos;
    const v = writeControl(path.resolve(root), slug, action, rest, Date.now(), { campaign: flags.campaign || null, scope: flags.scope || null });
    process.stderr.write(`yolo-watch: control ${action}: ${v ? JSON.stringify(v) : 'no control file'}\n`);
    return 0;
  }
  if (first === 'end') {
    const [, root, slug] = pos;
    appendRunEnd(path.resolve(root), slug, flags['stopped-at'] || null, Date.now(), flags.campaign || null);
    return 0;
  }
  const [root, ...slugs] = pos;
  if (!root || !slugs.length) {
    process.stderr.write('usage: yolo-watch.mjs <projectRoot> <slug> [<slug> ...] [--since <seq>]\n');
    return 2;
  }
  if (flags.campaign && !existsSync(workflowDir(path.resolve(root), flags.campaign))) {
    process.stderr.write(`yolo-watch: no workflow folder for the campaign ${flags.campaign}\n`);
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
