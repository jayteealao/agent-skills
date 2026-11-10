// The person's document of a brainstorm, rendered from the board.
//
// The board (brainstorm-board.json) is the one source. This module writes the document from
// it: `01-brainstorm.md` of a brainstorm workflow, `design-notes/brainstorm-design.md` beside
// the design board of a feature, or the body of the compressed slice beside a slug-mode
// board. Every write of the board commands (lib/board-ops.mjs) renders the document in the
// same call, so the two files cannot drift.
//
// A document that this module did not write holds prose that an older board may lack: the
// summary, the area briefs, the session stories, and any section of its own. The first render
// adopts that prose into the board, after a snapshot to history/. Text that maps to no board
// field is kept word for word in the board's `carried` list, and the renderer prints it as it is.
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { writeFileAtomic } from './atomic-write.mjs';
import { SESSIONS_KEPT, SUMMARY_WORD_CAP } from './brainstorm-archive.mjs';
import { safeParseFrontmatter } from './frontmatter.mjs';
import { docText, readDoc, sectionsOf, writeDoc } from './records.mjs';
import { formatValidationErrors, validateFrontmatter } from './schema-validator.mjs';
import { stringify } from './yaml.mjs';

export const DEFAULT_BOARD = 'brainstorm-board.json';
export const LEAD_DOC = '01-brainstorm.md';
export const DESIGN_BOARD = 'brainstorm-board-design.json';
export const DESIGN_DOC = 'design-notes/brainstorm-design.md';
export const ARCHIVE_RECORD = 'archive/record.md';
/** The first line under the title of every rendered document: a document without it was written by hand. */
export const MARKER = '<!-- Written from the board by wf.mjs board render. Change the board; this text follows. -->';

const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const list = (b, f) => (Array.isArray(b?.[f]) ? b[f] : []);
const clean = (s) => String(s ?? '').replace(/\r\n/g, '\n').trim();
const stop = (s) => { const t = clean(s); return !t || /[.!?:…)"'»`]$/.test(t) ? t : `${t}.`; };
const words = (s) => clean(s).split(/\s+/).filter(Boolean).length;
const stripComments = (s) => String(s ?? '').replace(/<!--[\s\S]*?-->/g, '');
const norm = (s) => stripComments(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// ---------------------------------------------------------------- where the document lives

/**
 * The document of a board file in `dir`:
 *   record  01-brainstorm.md, the lead record of a brainstorm workflow whose `board:` names the file
 *   file    design-notes/brainstorm-design.md, beside brainstorm-board-design.json of a feature
 *   slice   03-slice-brainstorm-<descriptor>.md, beside brainstorm-board-<descriptor>.json (slug-mode)
 *   none    no document yet: a slug-mode board whose slice record is not written
 */
export function docTarget(dir, file = DEFAULT_BOARD) {
  const lead = readDoc(dir, LEAD_DOC);
  if (lead?.frontmatter && (lead.frontmatter.board ?? DEFAULT_BOARD) === file) return { kind: 'record', name: LEAD_DOC, label: LEAD_DOC };
  if (file === DESIGN_BOARD) return { kind: 'file', name: DESIGN_DOC, path: join(dir, DESIGN_DOC), label: DESIGN_DOC };
  const m = /^brainstorm-board-([a-z0-9-]+)\.json$/.exec(file);
  if (m) {
    const name = `03-slice-brainstorm-${m[1]}.md`;
    return readDoc(dir, name)?.frontmatter ? { kind: 'slice', name, label: name } : { kind: 'none', label: name, reason: `no slice record ${name} yet: write the compressed slice first` };
  }
  if (file === DEFAULT_BOARD) return { kind: 'record', name: LEAD_DOC, label: LEAD_DOC };
  return { kind: 'none', label: null, reason: `no document is known for the board ${file}` };
}

function readTarget(dir, t) {
  if (t.kind === 'record' || t.kind === 'slice') {
    const d = readDoc(dir, t.name);
    return d?.frontmatter ? { frontmatter: d.frontmatter, body: d.body ?? '', text: docText(d) } : null;
  }
  if (t.kind === 'file') {
    if (!existsSync(t.path)) return null;
    const text = readFileSync(t.path, 'utf8');
    const p = safeParseFrontmatter(text, { filePath: t.path });
    return p.parseError ? { frontmatter: {}, body: text, text } : { frontmatter: p.data ?? {}, body: p.content ?? '', text };
  }
  return null;
}

function readArchive(dir) {
  try { return JSON.parse(readFileSync(join(dir, 'archive', 'board.json'), 'utf8')); } catch { return null; }
}

// ---------------------------------------------------------------- plain words

const SIDE = { problem: 'the problem side', solution: 'the solution side', both: 'both sides' };
const THREAD_STATE = { live: 'live', parked: 'parked', routed: 'in work', dropped: 'dropped' };
const AREA_SCOPE = { keep: 'Scope: kept.', cut: 'Scope: cut.', later: 'Scope: left for later.', mixed: 'Scope: partly kept.' };
const SOURCE = { person: 'you', agent: 'the agent', code: 'the code', data: 'the data', research: 'research', consult: 'a second opinion', history: 'an earlier workflow' };
const LEFT = { ask: 'Left to the build: the campaign asks you before it slices the work.', decide: 'Left to the build: the build decides, and records its choice.' };
const FORM = {
  intake: 'a feature to build', investigate: 'an investigation', discover: 'a yes-or-no check', rca: 'a search for a root cause',
  fix: 'a fix', hotfix: 'an urgent fix', task: 'a task', extension: 'new scope on a workflow', 'write-now': 'written in the session',
  design: 'a design stage', 'design-direction': 'a change to the design direction',
};
const DESIGN_FORM = { design: ' It adds a design stage.', 'design-direction': ' It changes the design direction.' };
const CHECK = { contradicted: ' The check contradicted it.', unverified: ' Not checked yet.' };
const ASSUMPTION = { named: 'Still open.', confirmed: 'Confirmed.', rejected: 'Rejected.' };
const KIND_LABEL = { decision: 'Decision', idea: 'Idea', finding: 'Finding', question: 'Question', assumption: 'Assumption', tension: 'Tension' };

const tail = (parts) => parts.filter(Boolean).join(' ');
const asCode = (s) => (/\s/.test(String(s)) ? String(s) : `\`${s}\``);

function scopeWords(i) {
  if (i.scope === 'keep') return i['first-version'] ? 'First version.' : 'Kept.';
  if (i.scope === 'later') return 'Left for later.';
  if (i.scope === 'cut') return i.reason ? `Cut: ${stop(i.reason)}` : 'Cut.';
  if (i.scope === 'pending-cut') return 'You cut it; the built work stays until you decide.';
  return '';
}

/** One plain line for an item, by its kind, with the number of the work packet that carries it. */
function itemLine(i, { replaced = [], work = null } = {}) {
  const line = kindLine(i, replaced);
  return work ? `${line} In work packet ${work}.` : line;
}

/** The line of an item without its work. `replaced` lists the older decisions it replaced. */
function kindLine(i, replaced) {
  const t = stop(i.text);
  switch (i.kind) {
    case 'decision':
      return tail([t, i.why && `Why: ${stop(i.why)}`, i.core && 'Core.', scopeWords(i), i['accepted-risk'] && `Accepted risk: ${stop(i['accepted-risk'])}`,
        replaced.length && `This replaced: ${replaced.map((r) => stop(r.text)).join(' ')}`]);
    case 'idea':
      return tail([t, i.source === 'person' ? 'You raised it.' : i.source === 'agent' || !i.source ? 'The agent raised it.' : `From ${SOURCE[i.source] ?? i.source}.`, scopeWords(i), LEFT[i['left-to-build']]]);
    case 'finding':
      return tail([t, `Source: ${i.evidence ? asCode(i.evidence) : SOURCE[i.source] ?? 'not given'}.`, CHECK[i.check] ?? '', scopeWords(i)]);
    case 'assumption':
      return tail([t, ASSUMPTION[i.state] ?? 'Still open.', LEFT[i['left-to-build']], scopeWords(i)]);
    case 'tension':
      return tail([t, i.state === 'resolved' ? 'Resolved.' : 'Still open.', LEFT[i['left-to-build']], scopeWords(i)]);
    case 'question':
      return tail([t, i.state === 'answered' ? 'Answered.' : '', LEFT[i['left-to-build']], scopeWords(i)]);
    default:
      return t;
  }
}

// ---------------------------------------------------------------- the renderer

/** The view of a board that every section reads: maps by key, and the replaced decisions. */
function viewOf(board) {
  const areas = list(board, 'areas');
  const threads = new Map(list(board, 'threads').map((t) => [t.key, t]));
  const items = list(board, 'items');
  const keys = new Set(items.map((i) => i.key));
  // A decision is hidden only when its successor is on the board: else it would vanish.
  const isReplaced = (i) => Boolean(i['replaced-by']) && keys.has(i['replaced-by']);
  const replacedBy = new Map();
  for (const i of items) if (isReplaced(i)) replacedBy.set(i['replaced-by'], [...(replacedBy.get(i['replaced-by']) ?? []), i]);
  const areaOf = (i) => threads.get(i.thread)?.area ?? null;
  // The work packet of each item, by its number in the Work list: no item text is printed twice.
  const workOf = new Map();
  sortedWork(board).forEach((w, n) => { for (const k of list(w, 'items')) if (!workOf.has(k)) workOf.set(k, n + 1); });
  return { areas, threads, items, isReplaced, replacedBy, areaOf, workOf };
}

const isOpenQuestion = (i) => i.kind === 'question' && (i.state == null || i.state === 'open') && i.scope !== 'cut';
const isOpenTension = (i) => i.kind === 'tension' && i.state !== 'resolved' && i.scope !== 'cut';
const isScoped = (board) => list(board, 'work').length > 0 || board.status === 'distilled';

/** Items grouped by area, in the order of the map; items of no known area come last. */
function byArea(v, items) {
  const groups = [];
  const known = new Set(v.areas.map((a) => a.key));
  for (const a of v.areas) {
    const xs = items.filter((i) => v.areaOf(i) === a.key);
    if (xs.length) groups.push({ name: a.name, items: xs });
  }
  const rest = items.filter((i) => !known.has(v.areaOf(i)));
  if (rest.length) groups.push({ name: 'Other', items: rest });
  return groups;
}

function bullets(lines, none) {
  return lines.length ? lines.map((l) => `- ${l}`) : [none];
}

function mapSection(board, v, { closedLink }) {
  const out = ['## Map', ''];
  if (!v.areas.length) out.push('No areas yet.', '');
  for (const a of v.areas) {
    out.push(`### ${[a.name, SIDE[a.side], a.state].filter(Boolean).join(' — ')}`);
    out.push(clean(a.brief) || 'No brief yet.');
    const ts = [...v.threads.values()].filter((t) => t.area === a.key);
    if (ts.length) out.push('', `Threads: ${ts.map((t) => `${t.name} (${THREAD_STATE[t.state] ?? t.state}${t.state === 'dropped' && t.reason ? `: ${clean(t.reason).replace(/\.$/, '')}` : ''})`).join('; ')}.`);
    if (AREA_SCOPE[a.scope]) out.push('', AREA_SCOPE[a.scope]);
    if (closedLink && ts.length && ts.every((t) => t.state === 'routed' || t.state === 'dropped')) out.push('', `The area is closed. Its earlier record is in [${ARCHIVE_RECORD}](${ARCHIVE_RECORD}).`);
    out.push('');
  }
  const loose = [...v.threads.values()].filter((t) => !t.area || !v.areas.some((a) => a.key === t.area));
  if (loose.length) out.push('### Threads with no area', ...loose.map((t) => `- ${t.name} (${THREAD_STATE[t.state] ?? t.state})`), '');
  return out;
}

function openNow(v) {
  const lines = [];
  for (const i of v.items) if (isOpenTension(i) && !v.isReplaced(i)) lines.push(tail([`Tension: ${stop(i.text)}`, LEFT[i['left-to-build']]]));
  for (const i of v.items) {
    if (i.kind === 'decision' && i['top-risk'] && i['accepted-risk'] && !v.isReplaced(i)) lines.push(`Risk: ${stop(i['accepted-risk'])} It comes with the decision: ${stop(i.text)}`);
  }
  for (const i of v.items) if (isOpenQuestion(i)) lines.push(tail([`Question: ${stop(i.text)}`, LEFT[i['left-to-build']]]));
  return ['## Open now', '', ...bullets(lines, 'Nothing is open.'), ''];
}

function briefsSection(board) {
  const lines = list(board, 'briefs').map((b) => {
    const c = list(b, 'criteria');
    const n = (s) => c.filter((x) => x.status === s).length;
    const gaps = c.filter((x) => x.status === 'open' || x.status === 'partial').map((x) => clean(x.text).replace(/\.$/, ''));
    return tail([`${b.name}: ${n('covered')} covered, ${n('partial')} partial, ${n('open')} open, ${n('out-of-scope')} out of scope.`, gaps.length && `Open gaps: ${gaps.join('; ')}.`]);
  });
  return ['## Briefs', '', ...bullets(lines, 'None.'), ''];
}

function sessionsSection(board, { older }) {
  const stories = [...list(board, 'stories')].sort((a, b) => b.session - a.session);
  const shown = stories.slice(0, SESSIONS_KEPT);
  const out = ['## Sessions', ''];
  if (!shown.length) out.push('No session story yet.', '');
  for (const s of shown) out.push(`### Session ${s.session}${s.date ? ` — ${s.date}` : ''}`, clean(s.text), '');
  if (older) out.push(`Older sessions are in [${ARCHIVE_RECORD}](${ARCHIVE_RECORD}).`, '');
  return out;
}

function recordSections(board, v) {
  const out = [];
  const decisions = v.items.filter((i) => i.kind === 'decision' && !v.isReplaced(i));
  out.push('## Decisions', '');
  if (!decisions.length) out.push('No decisions yet.', '');
  for (const g of byArea(v, decisions)) out.push(`### ${g.name}`, ...g.items.map((i) => `- ${itemLine(i, { replaced: v.replacedBy.get(i.key) ?? [], work: v.workOf.get(i.key) })}`), '');
  const of = (pred) => v.items.filter((i) => pred(i) && !v.isReplaced(i)).map((i) => itemLine(i, { work: v.workOf.get(i.key) }));
  out.push('## Ideas still open', '', ...bullets(of((i) => i.kind === 'idea' && i.scope !== 'cut'), 'None.'), '');
  out.push('## What we found', '', ...bullets(of((i) => i.kind === 'finding'), 'Nothing yet.'), '');
  out.push('## What we are assuming', '', ...bullets(of((i) => i.kind === 'assumption'), 'Nothing yet.'), '');
  out.push('## Tensions', '', ...bullets(of((i) => i.kind === 'tension'), 'None.'), '');
  const sketches = list(board, 'sketches');
  if (sketches.length || board.focus === 'design') {
    out.push('## Sketches', '', ...bullets(sketches.map((s) => tail([stop(s.caption), s.path && `File: \`${s.path}\`.`, `Link: ${s.link ?? s.canvas?.link ?? 'none'}.`, `State: ${s.state}.`])), 'None.'), '');
  }
  out.push('## Questions for the plan', '', ...bullets(of((i) => i.kind === 'question' && i.state === 'for-plan'), 'None.'), '');
  const answered = of((i) => i.kind === 'question' && i.state === 'answered');
  if (answered.length) out.push('## Questions we answered', '', ...bullets(answered, 'None.'), '');
  // A cut idea or a cut open question is in no section above; it stays readable here once.
  const cut = of((i) => (i.kind === 'idea' || isOpenQuestion({ ...i, scope: null })) && (i.scope === 'cut' || i.scope === 'pending-cut'));
  if (cut.length) out.push('## Ideas and questions you cut', '', ...bullets(cut, 'None.'), '');
  return out;
}

const sortedWork = (board) => [...list(board, 'work')].sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9));

function scopeSections(board, v, { hasWorkFile }) {
  const work = sortedWork(board);
  // Each item of the record says its scope once: the number of its work packet, "Left for
  // later", or "Cut" with the reason. The scope section repeats no item text.
  const n = (pred) => v.items.some((i) => pred(i) && !v.isReplaced(i));
  const out = ['## Scope', '', 'Each item of the record above says its scope: the number of the work packet below that carries it, "Left for later", or "Cut" with your reason.'];
  if (n((i) => i.scope === 'keep' && !v.workOf.has(i.key))) out.push('Some kept items are in no work packet yet: they say "Kept" with no number.');
  out.push('');
  out.push('## Work', '');
  if (!work.length) out.push('No work yet.', '');
  work.forEach((w, n) => {
    const form = `${stop(FORM[w.shape] ?? w.shape)}${DESIGN_FORM[w['design-form']] ?? ''}`;
    let where;
    if (w.shape === 'write-now') {
      const files = list(w, 'written-files').map((f) => `\`${f.path}\`${f.section ? ` (${f.section})` : ''}`);
      where = files.length ? `Changed: ${files.join(', ')}.` : 'Not written yet.';
    } else if (w.slug && hasWorkFile(w.slug)) where = `The work packet file: [work packet](work/${w.slug}.md).`;
    else where = w.entry ? `\`${w.entry}\`` : '';
    const sources = [...list(w, 'research'), ...list(w, 'references')];
    if (sources.length) where = tail([where, `Sources: ${sources.join('; ')}.`]);
    out.push(`${n + 1}. ${tail([`${stop(w.title)}`, `Form: ${form}`, where, w.stale && `Out of date${w['stale-because'] ? `: ${stop(w['stale-because'])}` : '.'}`])}`);
  });
  if (work.length) out.push('');
  return out;
}

function carriedSections(board, place) {
  const out = [];
  for (const c of list(board, 'carried')) {
    if ((c.place ?? 'document') !== place) continue;
    out.push(`## ${c.heading}`, '', clean(c.text), '');
  }
  return out;
}

function continueSection(kind, slug) {
  const out = ['## How to continue', ''];
  if (kind === 'record') out.push(`- Resume: \`/wf intake brainstorm ${slug}\``);
  if (kind === 'file') out.push(`- Resume: \`/wf intake ${slug} brainstorm design\``);
  out.push('- Control words: `park <thread>` · `pull <thread>` · `drop <thread>` · `board` · `look it up` · `second opinion` · `cohere` · `pause` · `done`');
  if (kind === 'record') out.push(`- Retire when no thread is live: \`/wf intake ${slug} close\``);
  out.push('');
  return out;
}

// ---------------------------------------------------------------- no key in the text

/** The words that stand for each key: the name of an area or a thread, the words of any other key. */
function keyLabels(board, extra = []) {
  const m = new Map();
  for (const x of [...list(board, 'areas'), ...list(board, 'threads')]) if (x?.key && x.name) m.set(x.key, clean(x.name));
  for (const x of [...list(board, 'items'), ...list(board, 'work'), ...extra]) if (x?.key && !m.has(x.key)) m.set(x.key, x.key.replace(/-/g, ' '));
  return m;
}

const KEYLIKE = /(?<![A-Za-z0-9_/.#-])[a-z0-9]+(?:-[a-z0-9]+)+(?![A-Za-z0-9_/-]|\.[A-Za-z0-9])/g;
const PROTECTED = /(`[^`\n]*`|\]\([^)]*\)|<!--[\s\S]*?-->|https?:\/\/[^\s)]+)/;

/**
 * The text with each board key that it names replaced by words. A key reaches the text from
 * prose that names other items (an evidence such as "items a-b, c-d") or from an old carried
 * section. A code span, a link address, a comment and a web address stay as they are.
 */
export function scrubKeys(text, board, { extra = [] } = {}) {
  const labels = keyLabels(board, extra);
  if (!labels.size) return text;
  // A key of two words ("deadline-day") reads as an English word, and prose uses such words on
  // purpose: only a key of three words or more is a key in the text.
  const swap = (k) => (k.split('-').length >= 3 ? labels.get(k) ?? k : k);
  return String(text).split(PROTECTED).map((seg, n) => (n % 2 ? seg : seg.replace(KEYLIKE, swap))).join('');
}

/**
 * The body of the document of `board`: the front (summary, map, open now, briefs), the
 * session stories newest first, the full record, and after `done` the scope and the work.
 * It names every thing in words; no board key appears in it.
 */
export function renderBody(board, { slug = board?.slug ?? '', kind = 'record', top = null, older = false, closedLink = false, hasWorkFile = () => false } = {}) {
  const v = viewOf(board);
  const out = [];
  if (kind === 'slice') out.push(...(clean(top) ? [clean(top), ''] : ['# Compressed Slice: brainstorm', '']), MARKER, '');
  else out.push(`# Brainstorm: ${clean(board.topic) || slug}`, '', MARKER, '');
  out.push('## The Brainstorm', '', clean(board.summary) || 'Not summed up yet.', '');
  out.push(...mapSection(board, v, { closedLink }));
  out.push(...openNow(v));
  out.push(...briefsSection(board));
  out.push(...sessionsSection(board, { older }));
  out.push(...recordSections(board, v));
  if (isScoped(board)) out.push(...scopeSections(board, v, { hasWorkFile }));
  out.push(...carriedSections(board, 'document'));
  out.push(...continueSection(kind, slug));
  return scrubKeys(`${out.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`, board);
}

/** The archive record: the older session stories and the archived items, or null when there are none. */
export function renderArchive(board, archive) {
  const kept = [...list(board, 'stories')].sort((a, b) => b.session - a.session).slice(0, SESSIONS_KEPT).map((s) => s.session);
  const seen = new Set();
  const stories = [...list(board, 'stories').filter((s) => !kept.includes(s.session)), ...list(archive, 'stories')]
    .filter((s) => !kept.includes(s.session) && !seen.has(s.session) && seen.add(s.session))
    .sort((a, b) => b.session - a.session);
  const items = list(archive, 'items');
  const carried = carriedSections(board, 'archive');
  if (!stories.length && !items.length && !carried.length) return null;
  const v = viewOf({ ...board, items: [...list(board, 'items'), ...items] });
  const out = [`# Brainstorm record archive: ${clean(board.topic) || board.slug || ''}`, '', MARKER, ''];
  out.push('## Older sessions', '');
  if (!stories.length) out.push('None.', '');
  for (const s of stories) out.push(`### Session ${s.session}${s.date ? ` — ${s.date}` : ''}`, clean(s.text), '');
  out.push('## Archived record', '');
  if (!items.length) out.push('None.', '');
  for (const g of byArea(v, items)) out.push(`### ${g.name}`, ...g.items.map((i) => `- ${KIND_LABEL[i.kind] ?? 'Item'}: ${itemLine(i)}`), '');
  out.push(...carried);
  return scrubKeys(`${out.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`, board, { extra: items });
}

// ---------------------------------------------------------------- adopt a hand-written document

export const DERIVED = new Set(['open now', 'briefs', 'decisions', 'ideas still open', 'what we found', 'what we are assuming', 'tensions', 'sketches',
  'questions for the plan', 'questions we answered', 'ideas and questions you cut', 'how to continue']);
const PLACEHOLDER = /^(none|nothing( yet| is open)?|no (decisions|areas|brief|work|session story) yet|not (summed up|scoped) yet|empty until)/;

/** The `##` sections of a body: [{ heading, text }], and the text before the first. */
function splitSections(body) {
  const { lines, sections } = sectionsOf(body);
  const top = lines.slice(0, sections[0]?.start ?? lines.length).join('\n');
  return { top, sections: sections.map((s) => ({ heading: s.heading.trim(), text: lines.slice(s.start + 1, s.end).join('\n') })) };
}

/** The `###` parts of a section: [{ heading, text }], with the text before the first as heading null. */
function subsections(text) {
  const out = [{ heading: null, lines: [] }];
  let fence = false;
  for (const l of String(text).split('\n')) {
    if (/^\s*(```|~~~)/.test(l)) fence = !fence;
    const h = !fence && /^###\s+(.*?)\s*$/.exec(l);
    if (h) out.push({ heading: h[1], lines: [] });
    else out.at(-1).lines.push(l);
  }
  return out.map((s) => ({ heading: s.heading, text: s.lines.join('\n').trim() }));
}

const hasText = (s) => clean(stripComments(s)).length > 0;
export const isPlaceholder = (s) => PLACEHOLDER.test(norm(s));

/** True when a hand-written body holds text that a render would replace. */
export function hasProse(body) {
  return splitSections(body).sections.some((s) => !/^how to continue$/i.test(s.heading) && hasText(s.text) && !isPlaceholder(s.text));
}

// ---------------------------------------------------------------- the cover check of a sentence

// Words that carry no content of their own: the common function words, and the labels that a
// rendered line adds (Why:, Accepted risk:, Source:, the scope words).
const STOP = new Set(('the and for with that this from into are was were has have had not but its our your you they their them then than when what '
  + 'which who will would can could should a an of to in on at by or is it be as we one each also only all any same so no yes there here '
  + 'why question risk tension source accepted replaced core kept first version later left cut reason still open resolved confirmed rejected raised agent '
  + 'answered state comes decision decides build ask').split(' '));
const URL_RE = /https?:\/\/[^\s)\]>`'"]+/g;
const trimUrl = (u) => u.replace(/[.,;:]+$/, '');
const tokensOf = (s) => [...new Set(norm(s).split(' ').filter((t) => t && (t.length >= 3 || /\d/.test(t)) && !STOP.has(t)))];

/**
 * An index of texts for the cover check: every line of each text is one candidate. A sentence
 * is covered when one candidate line holds `threshold` of its content words (all of them for a
 * sentence of three words or fewer). Links count by their address.
 */
export function coverIndex(texts) {
  const cands = [];
  const index = new Map();
  const urls = new Set();
  for (const t of texts) {
    for (const line of String(t ?? '').split('\n')) {
      for (const u of line.match(URL_RE) ?? []) urls.add(trimUrl(u));
      const toks = new Set(tokensOf(line.replace(URL_RE, ' ')));
      if (!toks.size) continue;
      const id = cands.length;
      cands.push(toks);
      for (const tk of toks) { let a = index.get(tk); if (!a) index.set(tk, (a = [])); a.push(id); }
    }
  }
  return { cands, index, urls };
}

/** True when the content of `sentence` is in one line of the index. */
export function isCovered(sentence, idx, { threshold = 0.8 } = {}) {
  let s = stripComments(sentence);
  const links = (s.match(URL_RE) ?? []).map(trimUrl);
  if (links.some((u) => !idx.urls.has(u))) return false;
  // A link the board holds is covered by its address; its label is the person's name for it.
  s = s.replace(/\[[^\]]*\]\([^)]*\)/g, ' ').replace(URL_RE, ' ');
  const toks = tokensOf(s);
  if (!toks.length) return true;
  if (links.length && toks.length <= 2) return true;
  // A short sentence needs all its words but one of three; a longer one `threshold` of them.
  const need = toks.length <= 2 ? toks.length : toks.length === 3 ? 2 : Math.ceil(toks.length * threshold);
  // A candidate with `need` of the tokens holds at least one of the `toks.length - need + 1` rarest.
  const lists = toks.map((t) => idx.index.get(t) ?? []).sort((a, b) => a.length - b.length);
  const seeds = new Set(lists.slice(0, toks.length - need + 1).flat());
  for (const id of seeds) {
    const c = idx.cands[id];
    let hits = 0;
    for (const t of toks) if (c.has(t)) hits += 1;
    if (hits >= need) return true;
  }
  return false;
}

/** The sentences of one line, without its list marker. */
export function sentencesOf(line) {
  const body = String(line).replace(/^\s*([-*]|\d+\.)\s+/, '');
  return body.split(/(?<=[.!?])\s+(?=[A-Z0-9"“(`*[])/).map((x) => x.trim()).filter(Boolean);
}

/**
 * The text of `text` that `idx` does not cover: each line keeps its list marker and only its
 * sentences that are not covered. A `###` heading stays as context before a kept line under it.
 */
export function uncoveredText(text, idx) {
  const out = [];
  let heading = null;
  for (const raw of stripComments(text).split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    if (/^#{3,}\s/.test(line.trim())) {
      const h = line.trim();
      if (isCovered(h.replace(/^#+\s*/, ''), idx)) heading = h;
      else { out.push(h); heading = null; }
      continue;
    }
    const kept = sentencesOf(line).filter((s) => !isPlaceholder(s) && !isCovered(s, idx));
    if (!kept.length) continue;
    if (heading) { out.push(heading); heading = null; }
    const marker = /^\s*([-*]|\d+\.)\s+/.exec(line)?.[0] ?? '';
    out.push(`${marker}${kept.join(' ')}`);
  }
  return out.join('\n');
}

/**
 * Read the prose of a hand-written document into the board. Returns the new board, what was
 * taken into which field, and the headings of the text kept word for word in `carried`.
 *
 * First the fields the board lacks are taken: the summary, each area brief, each session story,
 * the status, and the higher session and batch counts. Then `render` renders that board, and
 * each sentence of the document that the render does not cover is kept in `carried`, under the
 * heading of its section: so the person reads each decision once, and nothing is lost.
 */
export function adoptBody(board, body, { frontmatter = {}, slice = false, render = (b) => renderBody(b) } = {}) {
  const next = structuredClone(board);
  const taken = [];
  const { top, sections } = splitSections(body);
  for (const s of sections) {
    const h = s.heading.toLowerCase();
    const text = clean(stripComments(s.text));
    if (h === 'the brainstorm') {
      if (text && !isPlaceholder(text) && !clean(next.summary)) { next.summary = text; taken.push('summary'); }
    } else if (h === 'map') {
      for (const sub of subsections(s.text)) {
        if (sub.heading === null) continue;
        const name = sub.heading.split(' — ')[0].trim().toLowerCase();
        const area = list(next, 'areas').find((a) => clean(a.name).toLowerCase() === name);
        const brief = clean(stripComments(sub.text));
        if (area && brief && !isPlaceholder(brief) && !clean(area.brief)) { area.brief = brief; taken.push(`brief of ${area.name}`); }
      }
    } else if (h === 'sessions') {
      for (const sub of subsections(s.text)) {
        const m = sub.heading && /^Session\s+(\d+)(?:\s*[—–-]+\s*(.+))?$/i.exec(sub.heading);
        if (!m) continue;
        const n = Number(m[1]);
        const date = /^\d{4}-\d{2}-\d{2}$/.test(clean(m[2])) ? clean(m[2]) : null;
        const story = clean(stripComments(sub.text));
        const stories = list(next, 'stories');
        const have = stories.find((x) => x.session === n);
        if (!have) { if (story) { next.stories = [...stories, { session: n, text: story, ...(date ? { date } : {}) }]; taken.push(`story of session ${n}`); } continue; }
        if (date && !have.date) have.date = date;
      }
    }
  }
  if (!next.status && ['open', 'distilled'].includes(frontmatter.status)) { next.status = frontmatter.status; taken.push('status'); }
  for (const f of ['sessions', 'batches']) {
    const n = Number(frontmatter[f]);
    if (Number.isInteger(n) && n > (Number(next[f]) || 0)) { next[f] = n; taken.push(f); }
  }
  // What the render shows now; a sentence it covers is not carried.
  const idx = coverIndex([render(next)]);
  const carried = [];
  const carry = (heading, text) => {
    const t = clean(text);
    if (!t) return;
    const all = list(next, 'carried');
    const same = all.find((c) => c.heading === heading && (c.place ?? 'document') === 'document');
    if (same) { if (!clean(same.text).includes(t)) same.text = `${clean(same.text)}\n${t}`; } else next.carried = [...all, { heading, text: t }];
    carried.push(heading);
  };
  if (!slice) carry('Earlier notes', uncoveredText(stripComments(top).split('\n').filter((l) => !/^#\s+/.test(l.trim())).join('\n'), idx));
  const HEADING = { 'the brainstorm': 'Earlier summary', map: 'Earlier map notes', sessions: 'Earlier sessions' };
  for (const s of sections) {
    const h = s.heading.toLowerCase();
    if (h === 'how to continue') continue;
    const text = s.text;
    const heading = HEADING[h] ?? (DERIVED.has(h) || h === 'scope' || h === 'work' ? `Earlier notes: ${s.heading}` : s.heading);
    // A map or session heading line stays with its text, so the carried text keeps its context.
    const rest = uncoveredText(text, idx);
    // A section of its own whose items the record shows keeps its heading, with a note.
    if (!rest && heading === s.heading && hasText(text) && !isCovered(s.heading, idx)) carry(heading, 'Its items are in the record above.');
    else carry(heading, rest);
  }
  return { board: next, taken, carried: [...new Set(carried)] };
}

// ---------------------------------------------------------------- the frontmatter

const LEGACY_FIELDS = ['threads', 'claims', 'assumptions', 'contradictions', 'candidates', 'selected'];

/**
 * The frontmatter of the lead document. The board owns slug, topic, status, board, focus,
 * sessions, batches, page and updated-at. The document keeps created-at, revisions, the
 * next-* routing fields, modes, and every other field it already holds.
 */
export function leadFrontmatter(prior, board, { file, slug, kind, now = nowIso() }) {
  const p = prior ?? {};
  const resume = kind === 'file' ? `/wf intake ${slug} brainstorm design` : `/wf intake brainstorm ${slug}`;
  const fm = {
    ...p,
    schema: 'sdlc/v1',
    type: 'brainstorm',
    slug,
    topic: clean(board.topic) || p.topic || slug,
    status: board.status ?? p.status ?? 'open',
    board: file,
    'created-at': p['created-at'] ?? now,
    'updated-at': board['updated-at'] ?? now,
    sessions: board.sessions ?? p.sessions ?? 1,
    batches: board.batches ?? p.batches ?? 0,
    revisions: p.revisions ?? [],
    'next-command': p['next-command'] ?? 'intake',
    'next-invocation': p['next-invocation'] ?? resume,
    'recommended-routes': p['recommended-routes'] ?? [{ invocation: resume, reason: 'resume the board', default: true }],
  };
  // A legacy board kept its threads and claims in this frontmatter; the JSON board holds them now.
  for (const k of LEGACY_FIELDS) delete fm[k];
  const focus = board.focus ?? p.focus;
  if (focus) fm.focus = focus;
  const page = board.page ?? p.page;
  if (page !== undefined) fm.page = page;
  return fm;
}

// ---------------------------------------------------------------- the render of a board

const stamp = (iso) => String(iso).replace(/[-:]/g, '').replace(/\.\d+/, '');

/**
 * Plan the render of the document of `board` (the board file `file` in `dir`). Nothing is
 * written until `commit()`. When the document was written by hand, its prose is adopted into
 * the returned board first (`adopted`), and `commit()` snapshots both files to history/.
 * Throws when the new frontmatter would not validate.
 */
export function prepareDocument(dir, file, board, { now = nowIso(), original = board, forceAdopt = false } = {}) {
  const target = docTarget(dir, file);
  if (target.kind === 'none') return { board, target, adopted: null, warnings: [target.reason], document: null, body: null, commit: () => null };
  const slug = basename(dir);
  const current = readTarget(dir, target);
  const archive = readArchive(dir);
  let next = board;
  let adopted = null;
  const snapshots = [];
  const top = target.kind === 'slice' && current ? stripComments(splitSections(current.body).top) : null;
  const ctxOf = (b) => {
    const archiveBody = renderArchive(b, archive);
    return {
      archiveBody,
      opts: {
        slug, kind: target.kind, top, closedLink: Boolean(archiveBody),
        older: list(b, 'stories').length > SESSIONS_KEPT || list(archive, 'stories').length > 0,
        hasWorkFile: (s) => existsSync(join(dir, 'work', `${s}.md`)),
      },
    };
  };
  // A hand-written archive record is kept word for word in the archive part of `carried`.
  const archivePath = join(dir, ARCHIVE_RECORD);
  let archiveAdopted = false;
  if (existsSync(archivePath)) {
    const text = readFileSync(archivePath, 'utf8');
    if (!text.includes(MARKER) && hasText(text)) {
      const body = text.split('\n').filter((l) => !/^#\s+/.test(l.trim())).join('\n');
      next = structuredClone(next);
      if (!list(next, 'carried').some((c) => c.place === 'archive' && c.heading === 'Earlier archive')) {
        next.carried = [...list(next, 'carried'), { heading: 'Earlier archive', text: clean(body), place: 'archive' }];
      }
      snapshots.push({ path: join(dir, 'history', `archive-record-adopt-${stamp(now)}.md`), text });
      archiveAdopted = true;
    }
  }
  if (current && (forceAdopt || !current.body.includes(MARKER)) && (forceAdopt || hasProse(current.body))) {
    const render = (b) => { const c = ctxOf(b); return `${renderBody(b, c.opts)}\n${c.archiveBody ?? ''}`; };
    adopted = adoptBody(next, current.body, { frontmatter: current.frontmatter, slice: target.kind === 'slice', render });
    next = adopted.board;
    const t = stamp(now);
    snapshots.push({ path: join(dir, 'history', `${basename(target.name, '.md')}-adopt-${t}.md`), text: current.text });
    snapshots.push({ path: join(dir, 'history', `${basename(file, '.json')}-adopt-${t}.json`), text: `${JSON.stringify(original, null, 2)}\n` });
  }
  if (archiveAdopted) {
    adopted = adopted ?? { board: next, taken: [], carried: [] };
    adopted.carried = [...new Set([...adopted.carried, 'Earlier archive'])];
  }
  const { archiveBody, opts } = ctxOf(next);
  const body = renderBody(next, opts);
  let frontmatter;
  if (target.kind === 'slice') {
    frontmatter = { ...current.frontmatter, ...(Object.hasOwn(current.frontmatter, 'updated-at') ? { 'updated-at': next['updated-at'] ?? now } : {}) };
  } else {
    frontmatter = leadFrontmatter(current?.frontmatter, next, { file, slug, kind: target.kind, now });
    const v = validateFrontmatter(frontmatter);
    if (!v.valid) throw new Error(`the document ${target.label} would not validate:\n${formatValidationErrors(v.errors)}`);
  }
  const warnings = [];
  if (words(next.summary) > SUMMARY_WORD_CAP) warnings.push(`the summary has ${words(next.summary)} words, more than ${SUMMARY_WORD_CAP}: write it shorter`);
  const current_ = current ? { body: current.body.replace(/\r\n/g, '\n').replace(/\n+$/, '\n') } : null;
  return {
    board: next,
    target,
    adopted,
    warnings,
    document: target.label,
    body,
    stale: !current_ || current_.body !== body,
    commit() {
      for (const s of snapshots) writeFileAtomic(s.path, s.text);
      if (target.kind === 'file') writeFileAtomic(target.path, `---\n${stringify(frontmatter)}\n---\n${body}`);
      else writeDoc(dir, target.name, { frontmatter, body });
      if (archiveBody) { mkdirSync(join(dir, 'archive'), { recursive: true }); writeFileAtomic(archivePath, archiveBody); }
      return { document: target.label, snapshots: snapshots.map((s) => s.path) };
    },
  };
}
