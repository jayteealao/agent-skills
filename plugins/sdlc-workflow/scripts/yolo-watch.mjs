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
 *   watch    one watch per wave over the wave's slugs and the campaign journal. A
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

export const STAGE_KINDS = Object.freeze(['plan', 'implement', 'verify', 'review', 'update-deps-exec']);
export const STOP_AFTER = Object.freeze(['current', 'plan', 'implement', 'verify', 'review']);
const STAGE_FILE = Object.freeze({ plan: '04-plan', implement: '05-implement', verify: '06-verify', review: '07-review', 'update-deps-exec': '06-verify' });
export const STALE_FLOOR_MS = 20 * 60 * 1000;
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

const iso = (ms) => new Date(ms).toISOString();

function readJson(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
}

function writeJsonAtomic(file, value) {
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(tmp, file);
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

// The stage and slice of a heartbeat line. An agent-end line may carry no
// "stage" field, so the label ("verify:auth", "update-deps:exec") decides.
export function stageOf(line) {
  if (!line) return { stage: null, slice: null };
  const label = String(line.agent || '');
  const cut = label.indexOf(':');
  const head = cut === -1 ? label : label.slice(0, cut);
  const rest = cut === -1 ? null : label.slice(cut + 1) || null;
  let stage = line.stage || null;
  if (!stage) {
    if (head === 'update-deps' && rest === 'exec') stage = 'update-deps-exec';
    else if (STAGE_KINDS.includes(head)) stage = head;
  }
  if (!STAGE_KINDS.includes(stage)) return { stage: null, slice: null };
  // Only stage agents have a stage kind; a scout or a classifier is noise (3.2).
  if (!(STAGE_KINDS.includes(head) || label === 'update-deps:exec')) return { stage: null, slice: null };
  const slice = line.slice || (stage === 'update-deps-exec' ? null : rest);
  return { stage, slice };
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

export function frontmatterField(text, field) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text || '');
  if (!m) return null;
  const re = new RegExp(`^${field}:\\s*["']?([^"'\\r\\n#]*?)["']?\\s*(?:#.*)?$`, 'm');
  const f = re.exec(m[1]);
  return f ? f[1].trim() : null;
}

// A decision that needs the person (3.2): the artifact waits for input, or a
// record in it (or its sibling .yaml) carries class: intent-bearing.
export function decisionSignal(file) {
  let text = '';
  try { text = readFileSync(file, 'utf8'); } catch { return null; }
  let yaml = '';
  try { yaml = readFileSync(file.replace(/\.md$/, '.yaml'), 'utf8'); } catch { /* no sibling */ }
  const reasons = [];
  if (frontmatterField(text, 'status') === 'awaiting-input') reasons.push('awaiting-input');
  const ib = /class:\s*["']?intent-bearing/g;
  const count = (text.match(ib) || []).length + (yaml.match(ib) || []).length;
  if (count) reasons.push('intent-bearing');
  return reasons.length ? { reasons, intentBearing: count } : null;
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
export function newestUsage(dir) {
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
  const win = (kind) => v.rateLimits.find((r) => r && r.kind === kind) || null;
  return { at: iso(best.mtime), fiveHour: win('five_hour'), sevenDay: win('seven_day') };
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

// The liveness limit: the run's own longest gap, never under the 20-minute floor.
export const liveLimitMs = (st) => Math.max(STALE_FLOOR_MS, st.longestGapMs || 0);

// ---------------------------------------------------------------------------
// One poll of one slug's journal. Pure apart from the artifact reads.
// ---------------------------------------------------------------------------
export function applyJournalLines(root, slug, st, lines, { emitFrom = null } = {}) {
  const events = [];
  for (const line of lines) {
    if (!line || typeof line !== 'object') continue;
    const at = Date.parse(line.at || '');
    if (line.run && line.run !== st.run) {
      // A new run: its gaps are its own, and the old run's end does not end it.
      st.run = line.run; st.longestGapMs = 0; st.prevLineAt = null; st.ended = false; st.openStages = {};
    }
    if (Number.isFinite(at)) {
      if (st.prevLineAt !== null) st.longestGapMs = Math.max(st.longestGapMs, at - st.prevLineAt);
      st.prevLineAt = at; st.lastLineAt = at;
    }
    st.newest = { event: line.event || null, agent: line.agent || null, status: line.status || null, at: line.at || null };
    st.staleFor = null;
    const emit = emitFrom === null || (line.run === emitFrom.run && Number(line.seq) > emitFrom.seq);
    if (line.event === 'run-end') {
      st.ended = true;
      if (emit) events.push({ event: 'run-end', slug, run: line.run || st.run, stoppedAt: line.stoppedAt || null, inferred: false, at: line.at || null });
      continue;
    }
    const { stage, slice } = stageOf(line);
    if (!stage) continue;
    if (line.event === 'agent-start') {
      st.openStages[line.agent] = line.at || null;
      if (emit) events.push({ event: 'stage-start', slug, run: line.run || st.run, stage, slice, agent: line.agent, at: line.at || null });
      continue;
    }
    if (line.event !== 'agent-end') continue;
    const startedAt = st.openStages[line.agent] || null;
    delete st.openStages[line.agent];
    if (!emit) continue;
    const file = stageArtifact(root, slug, stage, slice);
    let artifactStatus = null;
    try { artifactStatus = file ? frontmatterField(readFileSync(file, 'utf8'), 'status') : null; } catch { /* unreadable */ }
    const rel = file ? path.relative(root, file).split(path.sep).join('/') : null;
    events.push({
      event: 'stage-end', slug, run: line.run || st.run, stage, slice, agent: line.agent, parallel: 1,
      status: line.status || null, errors: Number.isFinite(Number(line.errors)) ? Number(line.errors) : null,
      startedAt, at: line.at || null, artifact: rel, artifactStatus,
    });
    if (line.status === 'hard-stop' || line.status === 'stopped') {
      events.push({
        event: 'stop', slug, run: line.run || st.run, stage, slice,
        kind: line.status === 'stopped' ? 'stop-request' : 'hard-stop', at: line.at || null,
        resume: `/wf yolo ${slug}`,
      });
    }
    if (file) {
      const sig = decisionSignal(file);
      let mtime = 0;
      try { mtime = statSync(file).mtimeMs; } catch { /* gone */ }
      const key = `${rel}@${mtime}`;
      if (sig && !st.decisionsSeen.includes(key)) {
        st.decisionsSeen = [...st.decisionsSeen, key].slice(-200);
        events.push({ event: 'decision', slug, run: line.run || st.run, stage, slice, artifact: rel, reasons: sig.reasons, intentBearing: sig.intentBearing, at: line.at || null });
      }
    }
  }
  return events;
}

// Silence (3.2 stale, S4): judged against the run's own cadence. A silence
// whose newest line is an agent-start is a stale driver; one whose newest line
// is an agent-end means every agent returned, so the run ended.
export function judgeSilence(slug, st, nowMs, watchStartMs) {
  if (st.ended || st.lastLineAt === null) return [];
  // A re-arm resets `ended` for a relaunch; a run whose newest line is its end is silent by design.
  if (st.newest && st.newest.event === 'run-end') return [];
  const since = Math.max(st.lastLineAt, watchStartMs);
  const silentMs = nowMs - since;
  const limit = liveLimitMs(st);
  if (silentMs <= limit) return [];
  if (st.newest && st.newest.event === 'agent-end') {
    st.ended = true;
    return [{ event: 'run-end', slug, run: st.run, stoppedAt: null, inferred: true, lastAgent: st.newest.agent, lastStatus: st.newest.status, at: iso(nowMs) }];
  }
  const key = String(st.lastLineAt);
  if (st.staleFor === key) return [];
  st.staleFor = key;
  return [{
    event: 'stale', slug, run: st.run, lastAgent: st.newest && st.newest.agent, lastLineAt: iso(st.lastLineAt),
    silentMinutes: Math.round(silentMs / 60000), limitMinutes: Math.round(limit / 60000), at: iso(nowMs),
  }];
}

export function readWorkRevision(root, b) {
  try {
    const n = Number(frontmatterField(readFileSync(workIndexPath(root, b), 'utf8'), 'work-revision'));
    return Number.isFinite(n) ? n : null;
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// The watcher: one object, polled by a timer in main() and by tests directly.
// ---------------------------------------------------------------------------
export function createWatcher({ projectRoot, slugs, since = null, usageDir = null, campaign = null, now = () => Date.now() }) {
  const root = path.resolve(projectRoot);
  const watchStartMs = now();
  const cfg = readConfig(root);
  const states = new Map();
  for (const slug of slugs) {
    const saved = loadState(root, slug);
    if (saved) {
      // A new watch belongs to a new launch or a re-arm. The previous run's end
      // must not end this watch before the relaunched driver writes its first line.
      saved.ended = false;
      states.set(slug, { st: saved, first: false });
    } else {
      states.set(slug, { st: freshSlugState(), first: true });
    }
  }
  const lead = states.get(slugs[0]).st;
  // The repo-wide parts (HEAD, protected files, usage) live in the first slug's state.
  if (!lead.repo || lead.repo.root !== root || states.get(slugs[0]).first || lead.repo.runEnded) {
    const prot = protectedSet(root, slugs, cfg);
    const hashes = {};
    for (const f of prot.files) hashes[f] = hashFile(path.join(root, f));
    lead.repo = { root, head: git(root, ['rev-parse', 'HEAD']), hashes, dirtyAtStart: prot.dirtyAtStart, usageLevel: null, usagePauseUntil: null, runEnded: false };
  }

  function save() {
    for (const [slug, { st }] of states) {
      try { writeJsonAtomic(statePath(root, slug), st); } catch (e) { process.stderr.write(`yolo-watch: cannot save state for ${slug}: ${e.message}\n`); }
    }
  }

  // K1/K3 — the campaign journal and the work revision, in a campaign only.
  let camp = null;
  if (campaign) {
    const saved = readJson(campaignStatePath(root, campaign));
    camp = saved && saved.version === STATE_VERSION
      ? { ...saved, ended: false, first: false }
      : { version: STATE_VERSION, offset: 0, ended: false, first: true, revision: readWorkRevision(root, campaign), open: {}, openWaves: [], lastLineAt: null, longestGapMs: 0, prevLineAt: null, newest: null, staleFor: null };
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
    // A boundary agent that started and went silent past the liveness limit.
    if (!camp.ended && camp.lastLineAt !== null && camp.newest && camp.newest.event === 'agent-start') {
      const silentMs = now() - Math.max(camp.lastLineAt, watchStartMs);
      const limit = Math.max(STALE_FLOOR_MS, camp.longestGapMs || 0);
      if (silentMs > limit && camp.staleFor !== String(camp.lastLineAt)) {
        camp.staleFor = String(camp.lastLineAt);
        events.push({ event: 'stale', campaign, lastAgent: camp.newest.agent, lastLineAt: iso(camp.lastLineAt), silentMinutes: Math.round(silentMs / 60000), limitMinutes: Math.round(limit / 60000), at: iso(now()) });
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
    const events = [];
    for (const [slug, entry] of states) {
      const { st } = entry;
      const r = readJournalFrom(journalPath(root, slug), st.offset);
      let emitFrom = null;
      if (entry.first) {
        // A first watch with no state: the history sets the cadence and emits nothing,
        // unless --since asks for the newest run's lines after that seq.
        const newestRun = r.lines.length ? r.lines[r.lines.length - 1].run : null;
        emitFrom = { run: newestRun, seq: since === null ? Infinity : since };
        entry.first = false;
      }
      let lines = r.lines;
      if (!emitFrom && st.lastLineAt === null && lines.length) {
        // K1 — a journal this watch never saw a line of can arrive with old lines, when a
        // wave merge brings in a drive that ran in a worktree. Lines older than the watch are history.
        const old = lines.filter((l) => Date.parse(l.at || '') < watchStartMs);
        if (old.length) applyJournalLines(root, slug, st, old, { emitFrom: { run: null, seq: Infinity } });
        lines = lines.filter((l) => !(Date.parse(l.at || '') < watchStartMs));
      }
      events.push(...applyJournalLines(root, slug, st, lines, { emitFrom }));
      st.offset = r.offset;
      events.push(...judgeSilence(slug, st, now(), watchStartMs));
    }
    // K2 — the number of slugs with a stage open right now. Above 1, the
    // commentary gives a stage end one line and keeps the full note for the run end.
    const running = [...states.values()].filter(({ st }) => Object.keys(st.openStages || {}).length).length;
    for (const ev of events) if (ev.event === 'stage-end') ev.parallel = Math.max(1, running + 1);
    return [...events, ...pollCampaign()];
  }

  function pollCommits() {
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
    for (const [file, before] of Object.entries(lead.repo.hashes)) {
      const after = hashFile(path.join(root, file));
      if (after === before) continue;
      lead.repo.hashes[file] = after;
      events.push({
        event: 'protected-change', slugs: [...states.keys()], file,
        change: before === null ? 'created' : after === null ? 'deleted' : 'modified',
        dirtyAtStart: lead.repo.dirtyAtStart.includes(file), at: iso(now()),
      });
    }
    return events;
  }

  function pollUsage() {
    const dir = usageDir || path.join(os.homedir(), '.claude', 'sdlc', 'usage');
    const reading = newestUsage(dir);
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

  return { root, states, pollJournals, pollCommits, pollProtected, pollUsage, pollUsageReset, pollWorkRevision, allEnded, save: finish };
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

function writeNote(file, name, body, kind, nowMs) {
  const slug = name;
  if (!existsSync(file)) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `# Commentary — ${slug}\n\nThe running commentary of the yolo runs on this workflow, newest last. The main session appends each note when a watch event arrives (reference/yolo/_commentary.md).\n`);
  }
  const stamp = iso(nowMs).replace('T', ' ').replace(/:\d\d\.\d+Z$/, ' UTC');
  appendFileSync(file, `\n## ${stamp}${kind ? ` — ${kind}` : ''}\n\n${body}\n`);
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
  let lastGit = 0;
  let lastUsage = 0;
  let stopping = false;
  const stop = () => { stopping = true; };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  while (!stopping) {
    const t = Date.now();
    const events = [];
    if (t - lastGit >= gitMs) { lastGit = t; events.push(...w.pollCommits(), ...w.pollProtected(), ...w.pollWorkRevision()); }
    if (t - lastUsage >= usageMs) { lastUsage = t; events.push(...w.pollUsage()); }
    events.push(...w.pollUsageReset());
    // The journal goes last, so a run-end follows the commits the run made.
    events.push(...w.pollJournals());
    for (const ev of events) out(ev);
    w.save();
    if (w.allEnded()) break;
    await new Promise((r) => setTimeout(r, journalMs));
  }
  w.save();
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
