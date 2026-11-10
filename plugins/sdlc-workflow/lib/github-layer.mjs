// The GitHub layer: one issue per workflow on the private records repo, one Project board, and
// a "needs-me" label for the work that waits on the person.
//
// The records are the truth. The layer only mirrors them, so an agent never reads it for state.
// `wf.mjs` is its one writer: each change of a workflow's state puts one entry in an ordered
// outbox on this machine, and a flush sends the entries to GitHub in order. A machine that is
// offline keeps its entries, and the next flush catches up. A `/wf` call starts a flush, and so
// does a change, at most once a minute, so a driver that makes no `/wf` call keeps the issues
// current.
//
// One issue per workflow on every machine: the flush writes the issue number into the workflow
// folder (`layer.json`, which syncs with the records) and commits it. Before it makes an issue,
// it reads `layer.json`, then searches the repo for the issue whose body carries the hidden key
// `<!-- wf-key: <project>/<slug> -->`. An entry that fails three flushes moves to
// `outbox/github-parked.jsonl`, so it does not hold back the entries after it. A failure of the
// sign-in or a rate limit fails every entry alike, so it parks none: it stops the flush and puts the
// parked entries back at the head of the queue, and the next flush sends them. Each comment that
// the layer writes carries `<!-- wf-layer -->`, so the import of comments skips only those.
//
// The layer is on when the machine names the records repo (`records.repo` in ~/.sdlc/config.json)
// and the project names itself (`records.project` in .ai/sdlc-config.json). With either one
// missing, nothing is queued.
import { createHash, randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, openSync, closeSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { listOf } from './consent.mjs';
import { readMachineConfig, sdlcHomeDir } from './home.mjs';
import { defaultRun } from './last-mile.mjs';
import { INDEX_NAME, frontmatterOfDoc } from './records.mjs';
import { dropLock, refreshLock, takeLock as takeFileLock } from './file-lock.mjs';
import { projectConfigPath, workflowDir } from './records-root.mjs';
import { commitWorkflow, inBackground } from './records-sync.mjs';
import { TERMINAL_WORKFLOW_STATUSES } from './workflow-index.mjs';

export const STATUS_SCHEMA = 'wf-status/1';
export const NEEDS_ME = 'needs-me';
export const LAYER_MARK = '<!-- wf-layer -->';
export const LAYER_FILE = 'layer.json';
export const MAX_FAILS = 3;
const LOCK_STALE_MS = 10 * 60_000;
const STATE_LOCK_STALE_MS = 30_000;
const STATE_LOCK_WAIT_MS = 5_000;
const nowIso = (d = new Date()) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');

const outboxDir = () => join(sdlcHomeDir(), 'outbox');
export const outboxPath = () => join(outboxDir(), 'github.jsonl');
export const parkedPath = () => join(outboxDir(), 'github-parked.jsonl');
const statePath = () => join(outboxDir(), 'github-state.json');
const lockPath = () => join(outboxDir(), 'flush.lock');
const stateLockPath = () => join(outboxDir(), 'state.lock');

function readJson(file, fallback) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, value) {
  mkdirSync(outboxDir(), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(tmp, file);
}
const readState = () => ({ issues: {}, last: {}, labels: {}, fails: {}, error: null, ...readJson(statePath(), {}) });
const writeState = (s) => writeJson(statePath(), s);

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * Run `fn` while holding the short lock of the outbox and the state file, so a read and the
 * write that follows it never interleave with another process. The lock is held for one
 * read-then-write, never across a network call. After the wait, `fn` runs anyway: the layer
 * never blocks a change of the records.
 */
function withStateLock(fn) {
  mkdirSync(outboxDir(), { recursive: true });
  const held = takeFileLock(stateLockPath(), { waitMs: STATE_LOCK_WAIT_MS, staleMs: STATE_LOCK_STALE_MS, tornMs: STATE_LOCK_STALE_MS });
  try { return fn(); } finally { if (held) dropLock(stateLockPath()); }
}

const parseLines = (file) => (existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean).flatMap((l) => {
  try { return [JSON.parse(l)]; } catch { return []; }
}) : []);

/** The queued entries, oldest first. */
export const readOutbox = () => parseLines(outboxPath());
/** The entries that failed three flushes, oldest first. */
export const readParked = () => parseLines(parkedPath());

function writeOutbox(entries) {
  mkdirSync(outboxDir(), { recursive: true });
  const tmp = `${outboxPath()}.${process.pid}.tmp`;
  writeFileSync(tmp, entries.map((e) => `${JSON.stringify(e)}\n`).join(''));
  renameSync(tmp, outboxPath());
}
function enqueue(entry) {
  const line = `${JSON.stringify({ id: `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`, at: nowIso(), ...entry })}\n`;
  withStateLock(() => { mkdirSync(outboxDir(), { recursive: true }); appendFileSync(outboxPath(), line); });
}
const idOf = (e) => e.id ?? hashOf(e);

/**
 * The layer of a project: `{ repo, owner, project, board }`, or null when it is off. A worktree
 * with no config of its own uses the config of the main worktree, as the records do.
 */
export function layerOf(root) {
  const machine = readMachineConfig().records ?? {};
  const local = readJson(projectConfigPath(root), {}).records ?? {};
  if (!machine.repo || !local.project) return null;
  return { repo: machine.repo, owner: String(machine.repo).split('/')[0], project: local.project, board: machine.board ?? null };
}

// The issue stays open through ship: `shipped` work still has its retro and its close.
const isClosed = (fm) => TERMINAL_WORKFLOW_STATUSES.has(String(fm?.status ?? ''));

/** The status block of a workflow: the JSON at the end of its issue body, which other projects parse. */
export function statusBlock(project, slug, fm) {
  const tasks = Array.isArray(fm['person-tasks']) ? fm['person-tasks'].map((t) => String(t?.task ?? t)) : [];
  const questions = Array.isArray(fm['open-questions']) ? fm['open-questions'].map((q) => (q && typeof q === 'object' ? String(q.question ?? q.key) : String(q))) : [];
  return {
    schema: STATUS_SCHEMA,
    project,
    slug,
    title: fm.title ?? slug,
    status: fm.status ?? null,
    stage: fm['current-stage'] ?? null,
    progress: fm.progress && typeof fm.progress === 'object' ? fm.progress : {},
    next: fm['next-invocation'] ?? null,
    list: listOf(fm),
    branch: fm.branch ?? null,
    pr: fm['pr-url'] ?? null,
    needsMe: [...tasks, ...questions],
  };
}

const keyOf = (project, slug) => `${project}/${slug}`;
const keyMark = (key) => `<!-- wf-key: ${key} -->`;
const hashOf = (v) => createHash('sha1').update(JSON.stringify(v)).digest('hex');

/** The issue body: a short summary for a reader, the hidden key, then the status block. */
export function issueBody(block) {
  const stages = Object.entries(block.progress).map(([k, v]) => `- ${k}: ${v}`).join('\n') || '- none yet';
  const needs = block.needsMe.length
    ? `## Needs me\n\nAnswer these in the session, not here.\n\n${block.needsMe.map((n) => `- ${n}`).join('\n')}\n\n`
    : '';
  const facts = [
    `**Status:** ${block.status ?? 'unknown'}${block.stage ? ` · **Stage:** ${block.stage}` : ''}`,
    block.next ? `**Next:** \`${block.next}\`` : null,
    block.list ? `**List:** ${block.list}` : null,
    block.pr ? `**PR:** ${block.pr}` : null,
  ].filter(Boolean).join('\n');
  return `${facts}\n\n${needs}## Stages\n\n${stages}\n\n${keyMark(keyOf(block.project, block.slug))}\n<!-- wf-status -->\n\`\`\`json\n${JSON.stringify(block, null, 2)}\n\`\`\`\n`;
}

/** The issue of a workflow that its folder records (`layer.json`), or null. */
export function readLayerFile(root, slug) {
  return readJson(join(workflowDir(root, slug), LAYER_FILE), null);
}

/**
 * Queue one progress edit when the state of a workflow changed since the last one. Returns
 * `{ queued }`, or null when the layer is off. `force` queues it with no change (a backfill).
 */
export function noteChange(root, slug, { force = false } = {}) {
  const layer = layerOf(root);
  if (!layer) return null;
  const fm = frontmatterOfDoc(workflowDir(root, slug), INDEX_NAME);
  if (!fm) return { queued: false, reason: `no workflow ${slug}` };
  const block = statusBlock(layer.project, slug, fm);
  const key = keyOf(layer.project, slug);
  const hash = hashOf(block);
  const queued = withStateLock(() => {
    const state = readState();
    if (state.last[key] === hash && !force) return false;
    mkdirSync(outboxDir(), { recursive: true });
    appendFileSync(outboxPath(), `${JSON.stringify({ id: `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`, at: nowIso(), op: 'sync', repo: layer.repo, board: layer.board, owner: layer.owner, project: layer.project, slug, root, block })}\n`);
    state.last[key] = hash;
    writeState(state);
    return true;
  });
  return { queued };
}

/** Queue an answer of the person as a comment on the workflow's issue. */
export function noteAnswer(root, slug, { question, answer, by = null }) {
  const layer = layerOf(root);
  if (!layer || !answer) return null;
  noteChange(root, slug);
  const body = `**Answer**${by ? ` (${by})` : ''}: ${question ? `${question}\n\n> ` : ''}${answer}\n\n${LAYER_MARK}\n`;
  enqueue({ op: 'comment', repo: layer.repo, project: layer.project, slug, root, body });
  return { queued: true };
}

/** Queue a message as a comment on the workflow's issue (the inbox mirror). */
export function noteMessage(root, slug, { kind, from, text }) {
  const layer = layerOf(root);
  if (!layer) return null;
  noteChange(root, slug);
  enqueue({ op: 'comment', repo: layer.repo, project: layer.project, slug, root, body: `**${kind}** from ${from}\n\n${text}\n\n${LAYER_MARK}\n` });
  return { queued: true };
}

/** Queue one sync entry for each workflow of the project: the issues of a project that has none. */
export function backfill(root, slugs) {
  if (!layerOf(root)) return null;
  return slugs.filter((s) => noteChange(root, s, { force: true })?.queued);
}

// ---------------------------------------------------------------- flush

const LABELS = [['wf', '0e8a16', 'A /wf workflow'], [NEEDS_ME, 'd93f0b', 'Waits on the person']];

/**
 * A GitHub label name has at most 50 characters. A longer name keeps its start and ends with a
 * short hash of the whole name, so two long names stay different.
 */
export const LABEL_MAX = 50;
export function labelName(name) {
  const s = String(name);
  if (s.length <= LABEL_MAX) return s;
  const hash = createHash('sha256').update(s).digest('hex').slice(0, 6);
  return `${s.slice(0, LABEL_MAX - hash.length - 1)}~${hash}`;
}

function ensureLabels(state, repo, extra, run) {
  const have = new Set(state.labels[repo] ?? []);
  for (const [name, color, about] of [...LABELS, ...extra.map((n) => [n, 'c5def5', 'A /wf project or list'])]) {
    if (have.has(name)) continue;
    const r = run('gh', ['label', 'create', name, '--repo', repo, '--color', color, '--description', about, '--force'], {});
    if (r.status !== 0) throw new Error(`gh label create ${name}: ${r.stderr.trim()}`);
    have.add(name);
  }
  state.labels[repo] = [...have];
}

/** The issue that another machine made for the workflow: from `layer.json`, else by its hidden key. */
function knownIssue(e, run) {
  const key = keyOf(e.project, e.slug);
  const file = e.root ? readLayerFile(e.root, e.slug) : null;
  // The label and the state come from the issue itself: another machine may have set them.
  if (file?.number && file.key === key) {
    const v = run('gh', ['issue', 'view', String(file.number), '--repo', e.repo, '--json', 'labels,state'], {});
    if (v.status !== 0) throw new Error(`gh issue view ${file.number}: ${v.stderr.trim()}`);
    let seen = {};
    try { seen = JSON.parse(v.stdout || '{}'); } catch { seen = {}; }
    return { number: file.number, url: file.url, boarded: Boolean(file.boarded), ...issueFlags(seen) };
  }
  const r = run('gh', ['issue', 'list', '--repo', e.repo, '--state', 'all', '--search', `"${key}" in:title,body`, '--json', 'number,url,title,body,labels,state', '--limit', '30'], {});
  if (r.status !== 0) throw new Error(`gh issue list: ${r.stderr.trim()}`);
  let found = [];
  try { found = JSON.parse(r.stdout || '[]'); } catch { found = []; }
  const hit = found.find((i) => String(i.body ?? '').includes(keyMark(key)) || String(i.title ?? '').startsWith(`${key}:`));
  return hit ? { number: hit.number, url: hit.url, boarded: false, ...issueFlags(hit) } : null;
}

/** The needs-me label and the closed state of an issue as gh shows it. */
const issueFlags = (i) => ({
  needsMe: (Array.isArray(i?.labels) ? i.labels : []).some((l) => (l?.name ?? l) === NEEDS_ME),
  closed: String(i?.state ?? '').toUpperCase() === 'CLOSED',
});

/** Write the issue into the workflow folder and commit it, so every machine uses the same issue. */
function recordIssue(e, issue) {
  if (!e.root) return;
  const dir = workflowDir(e.root, e.slug);
  if (!existsSync(dir)) return;
  const key = keyOf(e.project, e.slug);
  const old = readJson(join(dir, LAYER_FILE), null);
  if (old?.number === issue.number && old?.key === key && Boolean(old?.boarded) === Boolean(issue.boarded)) return;
  writeFileSync(join(dir, LAYER_FILE), `${JSON.stringify({ key, repo: e.repo, number: issue.number, url: issue.url, boarded: Boolean(issue.boarded) }, null, 2)}\n`);
  try { commitWorkflow(e.root, e.slug, `${key}: the GitHub issue`); } catch { /* the next records commit takes it */ }
}

function applySync(e, state, run, save) {
  const key = keyOf(e.project, e.slug);
  const b = e.block;
  const labels = [`project:${e.project}`, ...(b.list ? [`list:${b.list}`] : [])].map(labelName);
  ensureLabels(state, e.repo, labels, run);
  const title = `${e.project}/${e.slug}: ${b.title}`;
  let issue = state.issues[key] ?? knownIssue(e, run);
  if (!issue) {
    const r = run('gh', ['issue', 'create', '--repo', e.repo, '--title', title, '--body-file', '-', '--label', ['wf', ...labels].join(',')], { input: issueBody(b) });
    const url = r.stdout.trim().split('\n').at(-1);
    const number = Number(/\/issues\/(\d+)/.exec(url)?.[1]);
    if (r.status !== 0 || !number) throw new Error(`gh issue create: ${r.stderr.trim() || url || 'no issue URL'}`);
    issue = { number, url, boarded: false, closed: false };
    // The number is recorded before anything else, so a failed step never makes a second issue.
    state.issues[key] = issue;
    save();
    recordIssue(e, issue);
  } else {
    if (!state.issues[key]) { state.issues[key] = issue; save(); }
    const r = run('gh', ['issue', 'edit', String(issue.number), '--repo', e.repo, '--title', title, '--body-file', '-'], { input: issueBody(b) });
    if (r.status !== 0) throw new Error(`gh issue edit ${issue.number}: ${r.stderr.trim()}`);
  }
  const needs = b.needsMe.length > 0 && !isClosed(b);
  if (needs !== Boolean(issue.needsMe)) {
    const r = run('gh', ['issue', 'edit', String(issue.number), '--repo', e.repo, needs ? '--add-label' : '--remove-label', NEEDS_ME], {});
    if (r.status !== 0) throw new Error(`gh issue edit ${issue.number} label: ${r.stderr.trim()}`);
    issue.needsMe = needs;
  }
  if (e.board && !issue.boarded) {
    const r = run('gh', ['project', 'item-add', String(e.board), '--owner', e.owner, '--url', issue.url], {});
    if (r.status !== 0) throw new Error(`gh project item-add: ${r.stderr.trim()}`);
    issue.boarded = true;
  }
  const closed = isClosed(b);
  if (closed !== Boolean(issue.closed)) {
    const r = run('gh', ['issue', closed ? 'close' : 'reopen', String(issue.number), '--repo', e.repo], {});
    if (r.status !== 0) throw new Error(`gh issue ${closed ? 'close' : 'reopen'} ${issue.number}: ${r.stderr.trim()}`);
    issue.closed = closed;
  }
  recordIssue(e, issue);
}

function applyComment(e, state, run) {
  const key = keyOf(e.project, e.slug);
  const file = e.root ? readLayerFile(e.root, e.slug) : null;
  const issue = state.issues[key] ?? (file?.number && file.key === key ? file : null);
  if (!issue) throw new Error(`no issue yet for ${key}`);
  const r = run('gh', ['issue', 'comment', String(issue.number), '--repo', e.repo, '--body-file', '-'], { input: e.body });
  if (r.status !== 0) throw new Error(`gh issue comment ${issue.number}: ${r.stderr.trim()}`);
}

// The flush lock names its process and its host. The running flush refreshes its stamp after
// each entry, so a long flush is not taken over; a lock of an ended process is taken over at once.
function takeLock() {
  mkdirSync(outboxDir(), { recursive: true });
  return takeFileLock(lockPath(), { waitMs: 0, staleMs: LOCK_STALE_MS, tornMs: LOCK_STALE_MS });
}

/** The state on disk with the changes of the flush laid over it. */
function mergeState(disk, mine) {
  return {
    ...disk,
    issues: { ...disk.issues, ...mine.issues },
    labels: Object.fromEntries([...new Set([...Object.keys(disk.labels), ...Object.keys(mine.labels)])].map((r) => [r, [...new Set([...(disk.labels[r] ?? []), ...(mine.labels[r] ?? [])])]])),
    fails: mine.fails,
    error: mine.error,
  };
}

/** A gh failure that the network caused: the entry gets one more try after NET_RETRY_MS. */
export const NET_ERROR = /timeout|timed out|tls|handshake|connect|connection|could not resolve|no such host|network|unreachable|\beof\b|econnreset|etimedout|enotfound|eai_again|offline|http 5\d\d|\b50[234]\b/i;
export const NET_RETRY_MS = 5_000;

/** A gh failure of the sign-in or of a rate limit: no entry is to blame, so none counts it or is parked. */
export const AUTH_ERROR = /not logged in|gh auth login|authenticat|unauthori[sz]ed|bad credentials|requires? (?:a )?token|http 40[13]\b|forbidden|rate.?limit|http 429\b|too many requests|abuse detection/i;

const markPath = () => join(outboxDir(), 'flush.again');
const writeMark = () => { try { mkdirSync(outboxDir(), { recursive: true }); writeFileSync(markPath(), nowIso()); } catch { /* the next trigger flushes */ } };

/**
 * Send the queued entries to GitHub, in order, until the queue is empty. An entry that fails
 * stops the flush and stays at the head of the outbox with every entry after it, until it has
 * failed MAX_FAILS flushes: then it moves to the parked file and the flush goes on. A network
 * error gets one more try after `retryMs` before it counts as a fail. A sign-in failure or a rate
 * limit (AUTH_ERROR) stops the flush with no count, and moves the parked entries back to the head
 * of the outbox, so the flush after the person signs in, or after the limit resets, sends them.
 *
 * One flush runs at a time. A trigger that finds a flush running writes the mark `flush.again`
 * beside the outbox, and the running flush reads the queue again before it exits, so an entry
 * that came during the flush goes out with it. Returns `{ sent, left, error, parked, requeued }`, or
 * `busy: true` when another flush runs.
 */
export function flushOutbox({ run = defaultRun, retryMs = NET_RETRY_MS, wait = sleep } = {}) {
  if (!takeLock()) {
    writeMark();
    // The running flush may have ended between the two steps: then this trigger flushes.
    if (!takeLock()) return { sent: 0, left: readOutbox().length, error: null, busy: true, parked: 0, requeued: 0 };
  }
  const total = { sent: 0, left: 0, error: null, parked: 0, requeued: 0 };
  for (;;) {
    let pass;
    try {
      rmSync(markPath(), { force: true });
      pass = flushPass(run, retryMs, wait);
    } finally {
      dropLock(lockPath());
    }
    total.sent += pass.sent;
    total.parked += pass.parked;
    total.requeued += pass.requeued;
    total.left = pass.left;
    total.error = pass.error;
    if (pass.error || (!pass.left && !existsSync(markPath()))) break;
    // Another flush took the lock between the passes: it reads the queue itself.
    if (!takeLock()) break;
  }
  return total;
}

const flushStartPath = () => join(outboxDir(), 'flush.started');
export const FLUSH_GAP_MS = 60_000;
// Each failed flush counts toward parking an entry, so an offline machine tries less often.
export const FLUSH_FAILED_GAP_MS = 30 * 60_000;

/** True when a change may start a flush: the queue holds an entry and the last start is old enough. */
export function flushDue({ now = Date.now() } = {}) {
  if (!readOutbox().length) return false;
  const gap = readState().error ? FLUSH_FAILED_GAP_MS : FLUSH_GAP_MS;
  try { return now - statSync(flushStartPath()).mtimeMs >= gap; } catch { return true; }
}

/**
 * Start the background flush after a change, when one is due. An entry that comes inside the gap
 * goes with the next change or the next `/wf` call. SDLC_RECORDS_PUSH=off leaves the flush out, as
 * it leaves out the push.
 */
export function startFlush(root) {
  if (process.env.SDLC_RECORDS_PUSH === 'off' || !layerOf(root) || !flushDue()) return false;
  mkdirSync(outboxDir(), { recursive: true });
  writeFileSync(flushStartPath(), nowIso());
  inBackground(['gh', 'flush', '--background']);
  return true;
}

/** One pass over the entries that the outbox holds now. */
function flushPass(run, retryMs, wait) {
  const entries = readOutbox();
  const state = readState();
  const save = () => withStateLock(() => writeState(mergeState(readState(), state)));
  const done = new Set();
  const parked = [];
  let sent = 0;
  let error = null;
  let requeue = false;
  const apply = (e) => {
    if (e.op === 'sync') applySync(e, state, run, save);
    else if (e.op === 'comment') applyComment(e, state, run);
  };
  for (const e of entries) {
    const id = idOf(e);
    try {
      try { apply(e); } catch (first) {
        if (AUTH_ERROR.test(first.message) || !NET_ERROR.test(first.message)) throw first;
        wait(retryMs);
        apply(e);
      }
      delete state.fails[id];
      done.add(id);
      sent += 1;
      refreshLock(lockPath());
    } catch (err) {
      if (AUTH_ERROR.test(err.message)) {
        error = err.message;
        requeue = true;
        break;
      }
      const fails = (state.fails[id] ?? 0) + 1;
      if (fails >= MAX_FAILS) {
        delete state.fails[id];
        parked.push({ ...e, parkedAt: nowIso(), error: err.message });
        done.add(id);
        continue;
      }
      state.fails[id] = fails;
      error = err.message;
      break;
    }
  }
  state.error = error ? { at: nowIso(), message: error } : null;
  // An entry queued during the flush is kept: only the sent and the parked entries leave.
  // After a sign-in failure or a rate limit, every parked entry goes back to the head of the
  // queue, oldest first, without the marks of its parking.
  let requeued = 0;
  const left = withStateLock(() => {
    writeState(mergeState(readState(), state));
    const back = requeue ? [...readParked(), ...parked].map(({ parkedAt, error: why, ...e }) => e) : [];
    if (requeue) rmSync(parkedPath(), { force: true });
    else if (parked.length) appendFileSync(parkedPath(), parked.map((p) => `${JSON.stringify(p)}\n`).join(''));
    requeued = back.length;
    const now = readOutbox();
    const keep = [...back, ...now.filter((e) => !done.has(idOf(e)))];
    writeOutbox(keep);
    return keep.length;
  });
  return { sent, left, error, parked: requeue ? 0 : parked.length, requeued };
}

/** The comments of a workflow's issue, or null when the layer is off or gh failed. */
export function issueComments(root, slug, { run = defaultRun } = {}) {
  const layer = layerOf(root);
  if (!layer) return null;
  const key = keyOf(layer.project, slug);
  const file = readLayerFile(root, slug);
  const issue = readState().issues[key] ?? (file?.number && file.key === key ? file : null);
  if (!issue) return [];
  const r = run('gh', ['issue', 'view', String(issue.number), '--repo', layer.repo, '--json', 'comments'], {});
  if (r.status !== 0) return null;
  try { return JSON.parse(r.stdout).comments ?? []; } catch { return null; }
}

/** What the layer of a project holds on this machine. */
export function layerStatus(root) {
  const layer = root ? layerOf(root) : null;
  const state = readState();
  const queued = readOutbox();
  const issues = Object.entries(state.issues)
    .filter(([k]) => !layer || k.startsWith(`${layer.project}/`))
    .map(([k, v]) => ({ workflow: k, ...v }));
  const parked = readParked().filter((p) => !layer || p.project === layer.project)
    .map((p) => ({ workflow: keyOf(p.project, p.slug), op: p.op, at: p.parkedAt, error: p.error }));
  return { layer, queued: queued.length, error: state.error, issues, parked };
}
