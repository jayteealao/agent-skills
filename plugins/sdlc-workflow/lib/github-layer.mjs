// The GitHub layer: one issue per workflow on the private records repo, one Project board, and
// a "needs-me" label for the work that waits on the person.
//
// The records are the truth. The layer only mirrors them, so an agent never reads it for state.
// `wf.mjs` is its one writer: each change of a workflow's state puts one entry in an ordered
// outbox on this machine, and a flush sends the entries to GitHub in order. A machine that is
// offline keeps its entries, and the next flush catches up. The issue numbers are recorded at
// once, so a second flush never makes a second issue.
//
// The layer is on when the machine names the records repo (`records.repo` in ~/.sdlc/config.json)
// and the project names itself (`records.project` in .ai/sdlc-config.json). With either one
// missing, nothing is queued.
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, openSync, closeSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { listOf } from './consent.mjs';
import { readMachineConfig, sdlcHomeDir } from './home.mjs';
import { defaultRun } from './last-mile.mjs';
import { INDEX_NAME, frontmatterOfDoc } from './records.mjs';
import { workflowDir } from './records-root.mjs';
import { TERMINAL_WORKFLOW_STATUSES } from './workflow-index.mjs';

export const STATUS_SCHEMA = 'wf-status/1';
export const NEEDS_ME = 'needs-me';
const LOCK_STALE_MS = 10 * 60_000;
const nowIso = (d = new Date()) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');

const outboxDir = () => join(sdlcHomeDir(), 'outbox');
export const outboxPath = () => join(outboxDir(), 'github.jsonl');
const statePath = () => join(outboxDir(), 'github-state.json');
const lockPath = () => join(outboxDir(), 'flush.lock');

function readJson(file, fallback) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, value) {
  mkdirSync(outboxDir(), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(tmp, file);
}
const readState = () => ({ issues: {}, last: {}, labels: {}, error: null, ...readJson(statePath(), {}) });
const writeState = (s) => writeJson(statePath(), s);

/** The queued entries, oldest first. */
export function readOutbox() {
  if (!existsSync(outboxPath())) return [];
  return readFileSync(outboxPath(), 'utf8').split('\n').filter(Boolean).flatMap((l) => {
    try { return [JSON.parse(l)]; } catch { return []; }
  });
}
function writeOutbox(entries) {
  mkdirSync(outboxDir(), { recursive: true });
  const tmp = `${outboxPath()}.${process.pid}.tmp`;
  writeFileSync(tmp, entries.map((e) => `${JSON.stringify(e)}\n`).join(''));
  renameSync(tmp, outboxPath());
}
function enqueue(entry) {
  mkdirSync(outboxDir(), { recursive: true });
  appendFileSync(outboxPath(), `${JSON.stringify({ at: nowIso(), ...entry })}\n`);
}

/** The layer of a project: `{ repo, owner, project, board }`, or null when it is off. */
export function layerOf(root) {
  const machine = readMachineConfig().records ?? {};
  const local = readJson(join(root, '.ai', 'sdlc-config.json'), {}).records ?? {};
  if (!machine.repo || !local.project) return null;
  return { repo: machine.repo, owner: String(machine.repo).split('/')[0], project: local.project, board: machine.board ?? null };
}

const isClosed = (fm) => TERMINAL_WORKFLOW_STATUSES.has(String(fm?.status ?? '')) || fm?.status === 'shipped';

/** The status block of a workflow: the JSON at the end of its issue body, which other projects parse. */
export function statusBlock(project, slug, fm) {
  const tasks = Array.isArray(fm['person-tasks']) ? fm['person-tasks'].map((t) => String(t?.task ?? t)) : [];
  const questions = Array.isArray(fm['open-questions']) ? fm['open-questions'].map(String) : [];
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

/** The issue body: a short summary for a reader, then the status block. */
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
  return `${facts}\n\n${needs}## Stages\n\n${stages}\n\n<!-- wf-status -->\n\`\`\`json\n${JSON.stringify(block, null, 2)}\n\`\`\`\n`;
}

const keyOf = (project, slug) => `${project}/${slug}`;
const hashOf = (v) => createHash('sha1').update(JSON.stringify(v)).digest('hex');

/**
 * Queue one progress edit when the state of a workflow changed since the last one. Returns
 * `{ queued }`, or null when the layer is off.
 */
export function noteChange(root, slug) {
  const layer = layerOf(root);
  if (!layer) return null;
  const fm = frontmatterOfDoc(workflowDir(root, slug), INDEX_NAME);
  if (!fm) return { queued: false, reason: `no workflow ${slug}` };
  const block = statusBlock(layer.project, slug, fm);
  const key = keyOf(layer.project, slug);
  const state = readState();
  const hash = hashOf(block);
  if (state.last[key] === hash) return { queued: false };
  enqueue({ op: 'sync', repo: layer.repo, board: layer.board, owner: layer.owner, project: layer.project, slug, block });
  state.last[key] = hash;
  writeState(state);
  return { queued: true };
}

/** Queue an answer of the person as a comment on the workflow's issue. */
export function noteAnswer(root, slug, { question, answer, by = null }) {
  const layer = layerOf(root);
  if (!layer || !answer) return null;
  noteChange(root, slug);
  const body = `**Answer**${by ? ` (${by})` : ''}: ${question ? `${question}\n\n> ` : ''}${answer}\n`;
  enqueue({ op: 'comment', repo: layer.repo, project: layer.project, slug, body });
  return { queued: true };
}

/** Queue a message as a comment on the workflow's issue (the inbox mirror). */
export function noteMessage(root, slug, { kind, from, text }) {
  const layer = layerOf(root);
  if (!layer) return null;
  noteChange(root, slug);
  enqueue({ op: 'comment', repo: layer.repo, project: layer.project, slug, body: `**${kind}** from ${from}\n\n${text}\n` });
  return { queued: true };
}

// ---------------------------------------------------------------- flush

const LABELS = [['wf', '0e8a16', 'A /wf workflow'], [NEEDS_ME, 'd93f0b', 'Waits on the person']];

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

function applySync(e, state, run) {
  const key = keyOf(e.project, e.slug);
  const b = e.block;
  const labels = [`project:${e.project}`, ...(b.list ? [`list:${b.list}`] : [])];
  ensureLabels(state, e.repo, labels, run);
  const title = `${e.project}/${e.slug}: ${b.title}`;
  let issue = state.issues[key];
  if (!issue) {
    const r = run('gh', ['issue', 'create', '--repo', e.repo, '--title', title, '--body-file', '-', '--label', ['wf', ...labels].join(',')], { input: issueBody(b) });
    const url = r.stdout.trim().split('\n').at(-1);
    const number = Number(/\/issues\/(\d+)/.exec(url)?.[1]);
    if (r.status !== 0 || !number) throw new Error(`gh issue create: ${r.stderr.trim() || url || 'no issue URL'}`);
    issue = { number, url, boarded: false, closed: false };
    // The number is recorded before anything else, so a failed step never makes a second issue.
    state.issues[key] = issue;
    writeState(state);
  } else {
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
}

function applyComment(e, state, run) {
  const issue = state.issues[keyOf(e.project, e.slug)];
  if (!issue) throw new Error(`no issue yet for ${e.project}/${e.slug}`);
  const r = run('gh', ['issue', 'comment', String(issue.number), '--repo', e.repo, '--body-file', '-'], { input: e.body });
  if (r.status !== 0) throw new Error(`gh issue comment ${issue.number}: ${r.stderr.trim()}`);
}

function takeLock() {
  mkdirSync(outboxDir(), { recursive: true });
  try {
    if (existsSync(lockPath()) && Date.now() - statSync(lockPath()).mtimeMs > LOCK_STALE_MS) rmSync(lockPath(), { force: true });
    closeSync(openSync(lockPath(), 'wx'));
    return true;
  } catch { return false; }
}

/**
 * Send the queued entries to GitHub, in order. The first entry that fails stops the flush and
 * stays at the head of the outbox with every entry after it. Returns `{ sent, left, error }`.
 */
export function flushOutbox({ run = defaultRun } = {}) {
  if (!takeLock()) return { sent: 0, left: readOutbox().length, error: null, busy: true };
  try {
    const entries = readOutbox();
    const state = readState();
    let sent = 0;
    let error = null;
    for (const e of entries) {
      try {
        if (e.op === 'sync') applySync(e, state, run);
        else if (e.op === 'comment') applyComment(e, state, run);
        sent += 1;
      } catch (err) {
        error = err.message;
        break;
      }
    }
    state.error = error ? { at: nowIso(), message: error } : null;
    writeState(state);
    // An entry queued during the flush is kept: only the sent head is removed.
    const now = readOutbox();
    writeOutbox(now.slice(sent));
    return { sent, left: now.length - sent, error };
  } finally {
    rmSync(lockPath(), { force: true });
  }
}

/** The comments of a workflow's issue, or null when the layer is off or gh failed. */
export function issueComments(root, slug, { run = defaultRun } = {}) {
  const layer = layerOf(root);
  if (!layer) return null;
  const issue = readState().issues[keyOf(layer.project, slug)];
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
  return { layer, queued: queued.length, error: state.error, issues };
}
