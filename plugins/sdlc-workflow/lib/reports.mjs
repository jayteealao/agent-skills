// Reports about wf itself: a bug of a command, a feature it lacks, a doc that says one thing while
// the code does another, a step that cost time for no gain. An agent that uses wf files one; the
// code triages it when it is filed; the person decides which to build.
//
// The reports live on this computer, in <sdlc home>/reports/, and each file has one writer:
//   reports/<id>.json            a report and its triage, written once by `report add`
//   reports/decisions/<id>.json  the choice of the person: build, later or reject
//   reports/built/<id>.json      the commit that built it, written by the session that built it
// A report that repeats an earlier one is a sighting of it (`triage.duplicateOf`): the group is the
// unit the person decides on, and its size raises its priority.
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

import { sdlcHomeDir } from './home.mjs';
import { writeFileAtomic } from './atomic-write.mjs';

export const KINDS = ['bug', 'feature', 'docs', 'friction'];
export const SEVERITIES = ['high', 'medium', 'low'];
export const DECISIONS = ['build', 'later', 'reject'];
const WEIGHT = { high: 3, medium: 2, low: 1 };

export const reportsDir = (home = sdlcHomeDir()) => join(home, 'reports');

const nowIso = () => new Date().toISOString();
const readJson = (file) => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; } };
const jsonFiles = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')) : []);

const STOP = new Set('the and for with that this from when what does not into are was were has have its it but can cannot then than they them one all any out run runs ran wf'.split(' '));
/** The words of a text that tell reports apart: lower case, three letters or more, no stop words. */
export function words(text) {
  return new Set(String(text ?? '').toLowerCase().replace(/[`'"]/g, '').split(/[^a-z0-9-]+/).filter((w) => w.length >= 3 && !STOP.has(w)));
}
function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let both = 0;
  for (const w of a) if (b.has(w)) both += 1;
  return both / (a.size + b.size - both);
}

/** The area of a report: the op or stage it names, the longest name first. */
export function guessArea(text, names = []) {
  const t = ` ${String(text ?? '').toLowerCase().replace(/\s+/g, ' ')} `;
  const hit = [...names].sort((a, b) => b.length - a.length).find((n) => t.includes(` ${n.toLowerCase()} `) || t.includes(`\`${n.toLowerCase()}\``) || t.includes(`"${n.toLowerCase()}"`));
  return hit ?? 'general';
}

const HIGH = /\b(crash(es|ed)?|data loss|lost|corrupt\w*|deleted?|wip(e|ed)|hangs?|stuck|blocks? (the|every)|cannot (go on|continue|resume)|every run|half[- ]applied)\b/i;
/** The severity of a report when the agent gives none. */
export function guessSeverity(kind, text) {
  if (kind === 'bug') return HIGH.test(String(text ?? '')) ? 'high' : 'medium';
  return 'low';
}

/** Read every report, decision and build of this computer. */
export function readAll(home = sdlcHomeDir()) {
  const dir = reportsDir(home);
  const reports = jsonFiles(dir).map((f) => readJson(join(dir, f))).filter((r) => r && r.id);
  const decisions = new Map(jsonFiles(join(dir, 'decisions')).map((f) => readJson(join(dir, 'decisions', f))).filter((d) => d && d.id).map((d) => [d.id, d]));
  const built = new Map(jsonFiles(join(dir, 'built')).map((f) => readJson(join(dir, 'built', f))).filter((d) => d && d.id).map((d) => [d.id, d]));
  return { reports: reports.sort((a, b) => String(a.at).localeCompare(String(b.at))), decisions, built };
}

/** The groups of reports: a first report and its sightings, with the choice of the person and the priority. */
export function groups({ reports, decisions, built }) {
  const byId = new Map(reports.map((r) => [r.id, r]));
  const rootOf = (r) => { let x = r; const seen = new Set(); while (x?.triage?.duplicateOf && byId.has(x.triage.duplicateOf) && !seen.has(x.id)) { seen.add(x.id); x = byId.get(x.triage.duplicateOf); } return x; };
  const out = new Map();
  for (const r of reports) {
    const root = rootOf(r);
    if (!out.has(root.id)) out.set(root.id, { id: root.id, report: root, sightings: [] });
    if (r.id !== root.id) out.get(root.id).sightings.push(r);
  }
  return [...out.values()].map((g) => {
    const all = [g.report, ...g.sightings];
    const severity = all.map((r) => r.triage?.severity ?? 'low').sort((a, b) => WEIGHT[b] - WEIGHT[a])[0];
    const count = all.length;
    const priority = Math.round((WEIGHT[severity] * (1 + Math.log2(count)) + (g.report.kind === 'bug' ? 1 : 0)) * 10) / 10;
    const projects = [...new Set(all.map((r) => r.context?.project).filter(Boolean))];
    const decision = decisions.get(g.id) ?? null;
    const build = built.get(g.id) ?? null;
    const state = build ? 'built' : decision ? decision.decision : 'new';
    return { ...g, kind: g.report.kind, title: g.report.title, area: g.report.triage?.area ?? 'general', severity, count, priority, projects, decision, built: build, state, last: all.at(-1).at };
  }).sort((a, b) => b.priority - a.priority || String(b.last).localeCompare(String(a.last)));
}

const MATCH = 0.5;
/** The group that a new report repeats, or null: the same kind, and close words in the title. */
export function findDuplicate(input, all) {
  const t = words(input.title);
  const b = words(`${input.title} ${input.body ?? ''}`);
  let best = null;
  for (const g of groups(all)) {
    if (g.kind !== input.kind) continue;
    const titles = [g.report, ...g.sightings].map((r) => jaccard(t, words(r.title)));
    const bodies = jaccard(b, words(`${g.report.title} ${g.report.body ?? ''}`));
    const score = Math.max(...titles, (titles[0] >= 0.3 && g.area === input.area) ? bodies + 0.2 : 0);
    if (score >= MATCH && (!best || score > best.score)) best = { group: g, score };
  }
  return best;
}

const newId = (now) => `R-${now.slice(0, 10).replace(/-/g, '')}-${randomBytes(3).toString('hex')}`;

/**
 * File a report. `input` holds kind, title, body, and optionally severity, area, command, error and
 * context. Returns the report as written, with the group it joined and what the person decided of
 * that group already.
 */
export function addReport(input, { home = sdlcHomeDir(), areas = [], now = nowIso() } = {}) {
  const kind = String(input.kind ?? '').trim();
  if (!KINDS.includes(kind)) throw new Error(`--kind must be one of ${KINDS.join(', ')}`);
  const title = String(input.title ?? '').trim();
  if (title.length < 8) throw new Error('--title is required: one line that names what is wrong or missing');
  const body = String(input.body ?? '').trim();
  if (!body) throw new Error('--body is required: what you did, what happened, what you expected, and the workaround you used');
  if (input.severity && !SEVERITIES.includes(input.severity)) throw new Error(`--severity must be one of ${SEVERITIES.join(', ')}`);
  const text = `${title}\n${body}\n${input.command ?? ''}\n${input.error ?? ''}`;
  const area = String(input.area ?? '').trim() || guessArea(text, areas);
  const severity = input.severity || guessSeverity(kind, text);
  const all = readAll(home);
  const dup = findDuplicate({ kind, title, body, area }, all);
  const report = {
    id: newId(now), at: now, kind, title, body,
    ...(input.command ? { command: String(input.command) } : {}),
    ...(input.error ? { error: String(input.error).slice(0, 4000) } : {}),
    context: input.context ?? {},
    triage: { area, severity, ...(input.severity ? {} : { severityGuessed: true }), ...(dup ? { duplicateOf: dup.group.id, match: Math.round(dup.score * 100) / 100 } : {}), at: now },
  };
  const dir = reportsDir(home);
  mkdirSync(dir, { recursive: true });
  writeFileAtomic(join(dir, `${report.id}.json`), `${JSON.stringify(report, null, 2)}\n`);
  const g = groups(readAll(home)).find((x) => x.id === (dup ? dup.group.id : report.id));
  return { report, group: g };
}

/** Record the choice of the person on a group. */
export function decideReport(id, decision, { note = '', home = sdlcHomeDir(), now = nowIso() } = {}) {
  if (!DECISIONS.includes(decision)) throw new Error(`the decision must be one of ${DECISIONS.join(', ')}`);
  const g = groups(readAll(home)).find((x) => x.id === id || x.sightings.some((s) => s.id === id));
  if (!g) throw new Error(`no report ${id}`);
  const entry = { id: g.id, decision, note: String(note ?? ''), at: now, by: 'person' };
  writeFileAtomic(join(reportsDir(home), 'decisions', `${g.id}.json`), `${JSON.stringify(entry, null, 2)}\n`);
  return entry;
}

/** Record that a group was built, by the commit that built it. */
export function builtReport(id, { commit, release = null, note = '', home = sdlcHomeDir(), now = nowIso() } = {}) {
  if (!commit) throw new Error('--commit <sha> is required: the commit that built the report');
  const g = groups(readAll(home)).find((x) => x.id === id || x.sightings.some((s) => s.id === id));
  if (!g) throw new Error(`no report ${id}`);
  const entry = { id: g.id, commit: String(commit), ...(release ? { release: String(release) } : {}), note: String(note ?? ''), at: now };
  writeFileAtomic(join(reportsDir(home), 'built', `${g.id}.json`), `${JSON.stringify(entry, null, 2)}\n`);
  return entry;
}

/** One line of a group. */
export function groupLine(g) {
  const seen = g.count > 1 ? ` ×${g.count}` : '';
  const state = g.state === 'new' ? '' : ` [${g.state}${g.built ? ` ${g.built.commit.slice(0, 8)}` : ''}]`;
  return `${g.id} ${g.priority.toFixed(1)} ${g.kind}/${g.severity} ${g.area}${seen}${state}: ${g.title}`;
}
