// The inbox of a project: everything that waits on the person, across every workflow, oldest
// first. `wf.mjs inbox` prints it, and `/wf status` with no slug shows it first.
//
// Each entry is { slug, kind, ask, since, answer }: the workflow, the kind of wait, one plain
// sentence of what is asked, since when (ISO 8601, or null), and the exact thing the person types
// to answer it. Every source is read from what is already on disk, through the record access, so
// a project linked to a records clone reads the clone. No source calls the network.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { answeredBy, decisionsOf } from './decisions.mjs';
import { OPEN_STATUSES, readLedger } from './findings.mjs';
import { safeParseFrontmatter } from './frontmatter.mjs';
import { nextAction, parseSpec } from './optimize.mjs';
import { progressOf, readDriverOutcome } from './progress.mjs';
import { INDEX_NAME, STATE_FILE, readDoc } from './records.mjs';
import { workflowsRoot } from './records-root.mjs';
import { lastSlice, planDocOf, whereOf } from './steps.mjs';
import { TERMINAL_WORKFLOW_STATUSES } from './workflow-index.mjs';

// The campaign walk loads only for a project that has a list, so other wf.mjs calls do not pay for it.
let campaignRun = null;
const loadCampaign = async () => { campaignRun ??= (await import('../scripts/campaign.mjs')).run; return campaignRun; };
const hasList = (dir) => existsSync(join(dir, 'work', 'index.md'));

/** The kinds of an entry, in the order of the sources. */
export const INBOX_KINDS = ['fidelity', 'try-out', 'digest', 'goal', 'run-gate', 'question', 'pick', 'design', 'ship', 'awaiting-input', 'optimize', 'finding'];

/**
 * The sources of the inbox, and what each reads. The result of `inboxOf` repeats them, so a
 * reader sees what was looked at and what is not on disk.
 */
export const INBOX_SOURCES = [
  { kinds: ['fidelity', 'try-out', 'digest'], reads: 'the campaign walk of each list (campaign.mjs status: ask and askLater)' },
  { kinds: ['goal'], reads: 'goal.md of each workflow: a parked gate' },
  { kinds: ['run-gate'], reads: 'progress.json and the driver outcome (a run waiting on the person), and the step record (a step stopped at a gate or a question)' },
  { kinds: ['question'], reads: 'open-questions of each index: a held question, and a question of a work packet that the walk asks before the slice' },
  { kinds: ['pick', 'design', 'ship', 'awaiting-input'], reads: 'next-command, next-invocation and status of each index: a step that only the person takes' },
  { kinds: ['optimize'], reads: 'optimize/state.json and 02-optimize-spec.md: a loop stopped for the person' },
  { kinds: ['finding'], reads: 'findings.yaml: an open finding that changes an acceptance criterion and has no answer (decision key finding:<id>)' },
];

/** What the inbox does not read, because the state is not on disk. */
export const INBOX_NOT_ON_DISK = [
  'kept-by-person findings: the status is the final answer of the person, so nothing waits',
  'a deferred finding: it waits for evidence, not for the person',
];

const DONE = new Set([...TERMINAL_WORKFLOW_STATUSES, 'shipped']);
const iso = (v) => {
  if (v == null || v === '') return null;
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z') : null;
};
const mtimeIso = (file) => { try { return new Date(statSync(file).mtimeMs).toISOString().replace(/\.\d{3}Z$/, 'Z'); } catch { return null; } };
const clip = (s, n = 160) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const firstCommand = (s) => /\/wf(?:\s+[^\s;,()]+)+/.exec(String(s ?? ''))?.[0] ?? null;
const sourceOfPacket = (origin) => /(?:^|\/)([^/]+)\/work\/[^/]+$/.exec(String(origin ?? '').replace(/\\/g, '/'))?.[1] ?? null;

/** The workflow folders of a project: every folder of the records root, with its index or null. */
function folders(root) {
  const base = workflowsRoot(root);
  if (!existsSync(base)) return [];
  return readdirSync(base, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_'))
    .map((e) => {
      const dir = join(base, e.name);
      const has = existsSync(join(dir, INDEX_NAME)) || existsSync(join(dir, STATE_FILE));
      const doc = has ? readDoc(dir, INDEX_NAME) : null;
      return { slug: e.name, dir, index: doc?.frontmatter ?? null };
    })
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

// ---------------------------------------------------------------- the campaign walk

function campaignEntries(root, f, notes) {
  const listIndex = join(f.dir, 'work', 'index.md');
  if (!hasList(f.dir) || !campaignRun) return [];
  let type = null;
  try { type = safeParseFrontmatter(readFileSync(listIndex, 'utf8')).data?.type ?? null; } catch { type = null; }
  if (type !== 'list') return [];
  const s = campaignRun(['status', root, f.slug]);
  if (!s || s.ok === false) { notes.push(`campaign ${f.slug}: ${s?.error ?? 'no status'}`); return []; }
  if (s.migrate) { notes.push(`campaign ${f.slug}: ${s.reason}`); return []; }
  const answer = `/wf campaign ${f.slug}`;
  const out = [];
  const add = (e, when) => {
    const slug = e.slug ?? f.slug;
    const dir = join(workflowsRoot(root), slug);
    const indexAt = iso(readDoc(dir, INDEX_NAME)?.frontmatter?.['updated-at']);
    const later = when === 'later' ? { later: true, why: e.why ?? 'the campaign walk asks it later' } : {};
    if (e.kind === 'fidelity') {
      // The ask quotes each decision in words; the decision keys stay in `keys`.
      const rows = Array.isArray(e.rows) ? e.rows : [];
      const reviewAt = iso(readDoc(dir, '07-review.md')?.frontmatter?.['updated-at']);
      out.push({ slug, kind: 'fidelity', keys: rows.map((r) => String(r.key)), ask: clip(`Approve or reject ${rows.length} decision(s) that the review of ${slug} did not find honored: ${rows.map((r) => `"${String(r.decision ?? r.key).trim()}" (${r.verdict})`).join(', ')}.`), since: reviewAt ?? indexAt, answer, list: f.slug, ...later });
    } else if (e.kind === 'try-out') {
      out.push({ slug, kind: 'try-out', ask: clip(`Try out ${e.title ?? slug} and say whether it works.`), since: indexAt ?? mtimeIso(join(root, e.file ?? '')), answer, list: f.slug, ...later });
    } else if (e.kind === 'digest') {
      const ids = new Set((e.entries ?? []).map((x) => x.id));
      const ats = decisionsOf(dir).filter((d) => ids.has(d.id)).map((d) => iso(d.at)).filter(Boolean).sort();
      out.push({ slug, kind: 'digest', ask: clip(`Read the ${ids.size} decision(s) that the run of ${slug} took for you, and keep or reverse each.`), since: ats[0] ?? indexAt, answer, list: f.slug, ...later });
    }
  };
  for (const e of s.ask ?? []) add(e, 'now');
  // The walk holds a question back so that it does not stop its own run. The person who reads the
  // inbox can answer it now: only a question whose own run has not ended waits.
  for (const e of s.askLater ?? []) add(e, /^the run of /.test(e.why ?? '') ? 'later' : 'now');
  return out;
}

// ---------------------------------------------------------------- one workflow

function goalEntry(f) {
  const file = join(f.dir, 'goal.md');
  if (!existsSync(file)) return null;
  const fm = safeParseFrontmatter(readFileSync(file, 'utf8')).data;
  const gate = fm?.parked && typeof fm.parked === 'object' ? String(fm.parked.gate ?? '').trim() : '';
  if (!gate || fm.state === 'cleared') return null;
  const reason = String(fm.parked.reason ?? '').trim();
  return { slug: f.slug, kind: 'goal', ask: clip(`The goal of ${f.slug} is parked at a gate: ${gate}${reason ? `: ${reason}` : ''}. Answer the gate, then resume the goal.`), since: iso(fm.parked.at) ?? mtimeIso(file), answer: `/wf loop goal ${f.slug} resume` };
}

function runGateEntry(root, f) {
  const p = progressOf(f.dir, f.slug);
  const where = (x) => [x?.stage, x?.slice].filter(Boolean).join(' ');
  if (p && p.state === 'waiting') {
    return { slug: f.slug, kind: 'run-gate', ask: clip(`The ${p.driver ?? 'driver'} run waits on you${where(p) ? ` at ${where(p)}` : ''}${p.reason ? `: ${p.reason}` : ''}.`), since: iso(p.updatedAt), answer: p.resume };
  }
  const o = readDriverOutcome(f.dir, { root });
  if (o && o.status === 'waiting' && (!p || p.state !== 'running')) {
    return { slug: f.slug, kind: 'run-gate', ask: clip(`The ${o.driver ?? 'driver'} run ${o.run ?? ''} stopped with ${o.questions ?? 'some'} question(s) for you${o.stoppedAt ? ` at ${o.stoppedAt}` : ''}${o.reason ? `: ${o.reason}` : ''}.`), since: iso(o.at), answer: o.resume ?? `/wf yolo ${f.slug}` };
  }
  if (p && p.state === 'running') return null;
  const slice = lastSlice(f.dir);
  if (!slice || !planDocOf(f.dir, slice)) return null;
  let w = null;
  try { w = whereOf(f.dir, slice); } catch { return null; }
  if (!w.stopped || !['gate', 'question'].includes(w.stopped.kind)) return null;
  return { slug: f.slug, kind: 'run-gate', ask: clip(`Step ${w.stopped.n} of slice ${slice} stopped at a ${w.stopped.kind}${w.stopped.reason ? `: ${w.stopped.reason}` : ''}.`), since: iso(w.stopped.at), answer: p?.resume ?? `/wf implement ${f.slug} ${slice}` };
}

// ---------------------------------------------------------------- open questions
//
// A stage carries `open-questions` of the index forward, and the stage that a question names asks
// it when that stage runs. So a question waits on the person now only when the workflow's next
// step is one the person takes (a pick, a design, a ship, an awaiting-input), and the question
// names that stage or no stage; or when a run holds it (`decide hold`) while the run goes on.
// Every other question comes back with `later: true` and the stage that asks it.

/** The stages in their order, for the test of a question that the workflow has passed. */
export const STAGE_ORDER = ['intake', 'shape', 'design', 'slice', 'plan', 'implement', 'verify', 'review', 'handoff', 'ship', 'retro'];
const STAGE_WORD = new RegExp(`\\b(${STAGE_ORDER.join('|')})\\b`, 'i');

// An internal id or a marker in front of the text: letters and a number, with an optional
// stage in brackets and a colon, or a marker word such as DEFERRED or ESCALATED.
const ID_PREFIX = /^((?:[A-Z]{1,6}-?\d+(?:-[A-Z0-9]+)*|[A-Z]\d+(?:-[A-Z])?))(?=[\s:(])\s*/;
const MARKER = /^(DEFERRED|ESCALATED|BLOCKED|PARKED|HOLD|TODO|NOTE)\b(?:\s+to\s+([a-z]+))?\s*:?\s*/i;
const STAGE_PAREN = /^\(([^)]*)\)\s*:?\s*/;

/** The text of an internal record as a person reads it: no id and no marker in front, and a capital first letter. */
export function plainText(text) {
  let t = String(text ?? '').replace(/\s+/g, ' ').trim();
  t = t.replace(ID_PREFIX, '').replace(MARKER, '').replace(STAGE_PAREN, '').replace(/^[:\-—–\s]+/, '');
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

/** One open question as data: { key, stage, text, note, held }. */
export function parseOpenQuestion(q) {
  const obj = q && typeof q === 'object' ? q : { question: String(q ?? '') };
  const raw = String(obj.question ?? obj.key ?? '').replace(/\s+/g, ' ').trim();
  let key = obj.key ? String(obj.key) : null;
  // The stage that asks it: a `receiving-stage` (or `for-stage`) wins over the stage that held it.
  const asker = obj['receiving-stage'] ?? obj['for-stage'] ?? obj.stage;
  let stage = asker ? String(asker).toLowerCase() : null;
  const id = ID_PREFIX.exec(raw);
  if (id && !key) key = id[1];
  const rest = id ? raw.slice(id[0].length) : raw;
  const marker = MARKER.exec(rest);
  if (marker?.[2] && !stage && STAGE_ORDER.includes(marker[2].toLowerCase())) stage = marker[2].toLowerCase();
  const paren = STAGE_PAREN.exec(marker ? rest.slice(marker[0].length) : rest);
  if (paren && !stage) stage = STAGE_WORD.exec(paren[1])?.[1]?.toLowerCase() ?? null;
  const text = plainText(raw);
  // A question asks something; a note records a finding, a result or a deferral.
  // A question mark that ends a sentence; `id=?` in a quoted query is not one.
  const asks = /\?(?=\s|$)/.test(raw) || /^(confirm|decide|choose|pick|approve|answer|tell|say)\b/i.test(text);
  return { key, stage: STAGE_ORDER.includes(stage) ? stage : null, text, note: !asks || Boolean(marker), held: Boolean(obj['held-at'] && obj.key), heldAt: obj['held-at'] ?? null };
}

/** The next step of a workflow: { stage, person } — the stage of next-invocation or next-command, and whether the person takes it. */
export function nextStepOf(index = {}) {
  const inv = String(index['next-invocation'] ?? '');
  const cmd = String(index['next-command'] ?? '');
  if (cmd === 'user-picks' || /^user-picks\b/.test(inv)) return { stage: 'pick', person: true };
  const stage = /^\/wf\s+([a-z-]+)/.exec(firstCommand(inv) ?? '')?.[1] ?? /^wf-([a-z]+)/.exec(cmd)?.[1] ?? null;
  const person = index.status === 'awaiting-input' || ['design', 'ship'].includes(stage);
  return { stage, person };
}

const STALE_STATUSES = new Set(['superseded']);

/** The open questions of a workflow: { entries, stale }. A stale question is dropped and counted. */
function questionEntries(f, progress) {
  const ix = f.index ?? {};
  const open = Array.isArray(ix['open-questions']) ? ix['open-questions'] : [];
  if (!open.length) return { entries: [], stale: 0 };
  if (STALE_STATUSES.has(String(ix.status ?? '')) || ix['superseded-by']) return { entries: [], stale: open.length };
  const src = sourceOfPacket(ix['origin-packet']);
  const next = nextStepOf(ix);
  const at = STAGE_ORDER.indexOf(next.stage);
  const command = firstCommand(ix['next-invocation']) ?? `/wf status ${f.slug}`;
  const running = progress && ['running', 'waiting'].includes(progress.state) ? String(progress.stage ?? '') : null;
  const entries = [];
  let stale = 0;
  for (const q of open) {
    const p = parseOpenQuestion(q);
    // The workflow is past the stage of the question: the stage that asked it has run.
    if (p.stage && at >= 0 && STAGE_ORDER.indexOf(p.stage) < at) { stale += 1; continue; }
    const packetAsk = p.stage === 'slice' && src;
    const base = {
      slug: f.slug, kind: 'question', ...(p.key ? { key: p.key } : {}), ...(p.stage ? { stage: p.stage } : {}),
      ask: clip(p.text || 'An open question.'),
      since: iso(p.heldAt) ?? iso(ix['updated-at']),
      answer: packetAsk ? `/wf campaign ${src}` : command,
      ...(packetAsk ? { list: src } : {}),
    };
    let why = null;
    if (p.held && running && (!p.stage || p.stage === running)) why = null;
    else if (p.note) why = 'a note of the workflow, not a question: the stage that carries it reads it';
    else if (packetAsk) why = next.stage === 'slice' ? null : `the campaign walk asks it before the slice of ${f.slug}`;
    else if (p.stage && p.stage !== next.stage) why = `the ${p.stage} stage asks it when it runs`;
    else if (!next.person) why = next.stage ? `the ${next.stage} stage asks it when it runs` : 'the next stage asks it when it runs';
    entries.push(why ? { ...base, later: true, why } : base);
  }
  return { entries, stale };
}

function personStepEntry(f) {
  const ix = f.index ?? {};
  const inv = String(ix['next-invocation'] ?? '');
  const since = iso(ix['updated-at']);
  const title = ix.title ? `${ix.title}` : f.slug;
  if (ix['next-command'] === 'user-picks' || /^user-picks\b/.test(inv)) {
    return { slug: f.slug, kind: 'pick', ask: clip(`Pick the next route of ${title}: the workflow does not pick for you.`), since, answer: firstCommand(inv) ?? `/wf status ${f.slug}` };
  }
  if (/^\/wf design\b/.test(inv)) return { slug: f.slug, kind: 'design', ask: clip(`Run the design of ${title} with the agent: only you settle the design.`), since, answer: firstCommand(inv) };
  // A work packet of a list ships with the list: the campaign walk owns its ship.
  if (/^\/wf ship\b/.test(inv) && !ix['origin-packet']) return { slug: f.slug, kind: 'ship', ask: clip(`Decide go or no-go for the ship of ${title}.`), since, answer: firstCommand(inv) };
  const open = Array.isArray(ix['open-questions']) ? ix['open-questions'].length : 0;
  if (ix.status === 'awaiting-input' && !open) {
    return { slug: f.slug, kind: 'awaiting-input', ask: clip(`${title} waits on your input${ix['current-stage'] ? ` at ${ix['current-stage']}` : ''}.`), since, answer: firstCommand(inv) ?? `/wf status ${f.slug}` };
  }
  return null;
}

function optimizeEntry(f, notes) {
  const file = join(f.dir, 'optimize', 'state.json');
  if (!existsSync(file)) return null;
  try {
    const state = JSON.parse(readFileSync(file, 'utf8'));
    if (!state || state.finished) return null;
    // A stored stop needs no spec; a stop of the budget or the plateau is computed from it.
    let spec = null;
    if (!state.stopped) {
      const parsed = parseSpec(readDoc(f.dir, '02-optimize-spec.md')?.frontmatter);
      if (!parsed.spec || parsed.errors.length) { notes.push(`optimize ${f.slug}: the spec does not parse`); return null; }
      spec = parsed.spec;
    }
    const st = nextAction({ state, spec });
    if (st.state !== 'stopped' || st.next?.action !== 'person') return null;
    return { slug: f.slug, kind: 'optimize', ask: clip(`The optimize loop of ${f.slug} stopped (${st.reason}${st.detail ? `: ${st.detail}` : ''}): ${st.next.why}.`), since: iso(state.stopped?.at) ?? mtimeIso(file), answer: `/wf loop optimize ${f.slug}` };
  } catch (e) {
    notes.push(`optimize ${f.slug}: ${e.message}`);
    return null;
  }
}

function findingEntries(f) {
  let ledger;
  try { ledger = readLedger(f.dir); } catch { return []; }
  const pending = ledger.findings.filter((x) => x['changes-acceptance'] && OPEN_STATUSES.has(x.status) && x.status !== 'deferred');
  if (!pending.length) return [];
  const decisions = decisionsOf(f.dir);
  return pending.filter((x) => !answeredBy(decisions, `finding:${x.id}`, x.slice ? { slice: x.slice } : {})).map((x) => ({
    slug: f.slug, kind: 'finding', key: `finding:${x.id}`,
    ask: clip(`A review finding changes an acceptance criterion: ${String(x.issue ?? '').trim()}. Accept the change, or keep the criterion.`),
    since: iso(x['surfaced-at']), answer: `/wf review ${f.slug} triage`,
  }));
}

// ---------------------------------------------------------------- the inbox

/**
 * Everything that waits on the person, oldest first: { count, now, later, byWorkflow, laterGroups,
 * entries, sources, notOnDisk, notes }. An entry with `later: true` waits for a stage or a run, and
 * its `why` says which; `byWorkflow` counts the `now` and `later` entries of each workflow, and
 * `laterGroups` gives one line per workflow and reason for the later entries.
 */
export async function inboxOf(root) {
  const notes = [];
  const entries = [];
  const all = folders(root);
  if (all.some((f) => hasList(f.dir))) await loadCampaign();
  const stale = { closed: 0, passed: 0, workflows: new Set() };
  for (const f of all) {
    try { entries.push(...campaignEntries(root, f, notes)); } catch (e) { notes.push(`campaign ${f.slug}: ${e.message}`); }
    if (!f.index) continue;
    const status = String(f.index.status ?? '');
    if (DONE.has(status) || status === 'superseded' || f.index['superseded-by']) {
      const n = Array.isArray(f.index['open-questions']) ? f.index['open-questions'].length : 0;
      if (n) { stale.closed += n; stale.workflows.add(f.slug); }
      continue;
    }
    const one = [goalEntry(f), runGateEntry(root, f), personStepEntry(f), optimizeEntry(f, notes)];
    const q = questionEntries(f, progressOf(f.dir, f.slug));
    if (q.stale) { stale.passed += q.stale; stale.workflows.add(f.slug); }
    entries.push(...one.filter(Boolean), ...q.entries, ...findingEntries(f));
  }
  if (stale.closed) notes.push(`left out ${stale.closed} open question(s) of closed or superseded workflows`);
  if (stale.passed) notes.push(`left out ${stale.passed} open question(s) of a stage that the workflow has passed`);
  // Oldest first; an entry with no time comes last, then by workflow and kind.
  entries.sort((a, b) => (a.since === null) - (b.since === null) || String(a.since ?? '').localeCompare(String(b.since ?? ''))
    || a.slug.localeCompare(b.slug) || INBOX_KINDS.indexOf(a.kind) - INBOX_KINDS.indexOf(b.kind));
  const byWorkflow = {};
  for (const e of entries) {
    byWorkflow[e.slug] ??= { now: 0, later: 0 };
    byWorkflow[e.slug][e.later ? 'later' : 'now'] += 1;
  }
  const later = entries.filter((e) => e.later).length;
  const groups = laterGroups({ entries }).map(({ slug, why, count, kinds, line }) => ({ slug, why, count, kinds, line }));
  return { count: entries.length, now: entries.length - later, later, byWorkflow, laterGroups: groups, entries, sources: INBOX_SOURCES, notOnDisk: INBOX_NOT_ON_DISK, notes };
}

/** The later entries, one group per workflow and reason: [{ slug, why, count, kinds }], in the order of their first entry. */
export function laterGroups(r) {
  const groups = new Map();
  for (const e of r.entries.filter((x) => x.later)) {
    const k = `${e.slug}\u0000${e.why}`;
    if (!groups.has(k)) groups.set(k, { slug: e.slug, why: e.why, count: 0, kinds: new Set(), answer: e.answer });
    const g = groups.get(k);
    g.count += 1;
    g.kinds.add(e.kind);
  }
  return [...groups.values()].map((g) => {
    const kinds = [...g.kinds];
    const stage = /^the ([a-z-]+) stage asks it/.exec(g.why)?.[1];
    const s = g.count === 1 ? '' : 's';
    const line = kinds.length === 1 && kinds[0] === 'question' && stage ? `${g.count} question${s} wait${g.count === 1 ? 's' : ''} for the ${stage} stage of ${g.slug}.`
      : /^a note of the workflow/.test(g.why) ? `${g.count} note${s} of ${g.slug} wait${g.count === 1 ? 's' : ''} for the stage that carries ${g.count === 1 ? 'it' : 'them'}.`
        : `${g.count} ${kinds.join(' and ')} entr${g.count === 1 ? 'y' : 'ies'} of ${g.slug} wait${g.count === 1 ? 's' : ''}: ${g.why}.`;
    return { ...g, kinds, line };
  });
}

/** The inbox for a person: the entries that wait now, one line each, then one line per workflow for the rest. */
export function inboxText(r) {
  if (!r.count) return ['Nothing waits on you.', ...r.notes.map((n) => `note: ${n}`)].join('\n');
  const lines = [`${r.now} thing(s) wait on you now, oldest first:`];
  r.entries.filter((e) => !e.later).forEach((e, i) => lines.push(`${i + 1}. ${e.slug} (${e.kind}${e.since ? `, since ${e.since.slice(0, 10)}` : ''}): ${e.ask} Type: ${e.answer}`));
  const groups = laterGroups(r);
  if (groups.length) lines.push(`Later (${r.later}):`);
  for (const g of groups) lines.push(`- ${g.line}`);
  for (const n of r.notes) lines.push(`note: ${n}`);
  return lines.join('\n');
}
