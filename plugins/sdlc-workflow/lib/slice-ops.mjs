// A slice leaves the roster (`wf.mjs slice drop`, `slice move`), joins it (`slice add`), is cut in
// parts or joined (`slice split`, `slice merge`), or takes an
// issue into its scope (`slice carry`). A drop or a move changes the
// roster (03-slice.md), the slice record (03-slice-<slice>.md), the slice list of the index and
// the selected slice. The caller rebuilds INDEX.md. A dropped slice keeps its records, so its
// history stays readable; the drivers and the routes skip it.
import { INDEX_NAME, frontmatterOfDoc, readDoc, setFields, writeDoc } from './records.mjs';
import { rescopeDecisions } from './decisions.mjs';
import { bestFirstOf } from './derive.mjs';
import { syncRosterCopies } from './roster.mjs';
import { DEFAULT_MAX_STEPS } from './limits.mjs';
import { readSteps } from './steps.mjs';

const ROSTER = '03-slice.md';
const sliceRecord = (slice) => `03-slice-${slice}.md`;
const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

function rosterOf(dir) {
  const fm = frontmatterOfDoc(dir, ROSTER);
  if (!fm) throw new Error(`${dir} has no ${ROSTER}, so it has no roster`);
  return (Array.isArray(fm.slices) ? fm.slices : []).map((s) => (typeof s === 'string' ? { slug: s, status: 'defined' } : s));
}

function entryOf(dir, slice) {
  const roster = rosterOf(dir);
  const entry = roster.find((s) => s.slug === slice);
  if (!entry) throw new Error(`${slice} is not in the roster; its slices are: ${roster.map((s) => s.slug).join(', ') || 'none'}`);
  return { roster, entry };
}

/** The roster and the index with the entry of `slice` changed by `change`. */
function markSlice(dir, slice, change) {
  const { roster } = entryOf(dir, slice);
  setFields(dir, ROSTER, { slices: roster.map((s) => (s.slug === slice ? { ...s, ...change } : s)) });
  const index = frontmatterOfDoc(dir, INDEX_NAME) ?? {};
  const fields = {};
  if (Array.isArray(index.slices) && index.slices.some((s) => (s?.slug ?? s) === slice)) {
    fields.slices = index.slices.map((s) => ((s?.slug ?? s) === slice ? { ...(typeof s === 'string' ? { slug: s } : s), ...change } : s));
  }
  // The selected slice moves to the next open slice of the roster, or is cleared.
  if (index['selected-slice'] === slice) {
    const next = roster.find((s) => s.slug !== slice && !['complete', 'deferred', 'skipped', 'dropped'].includes(String(s.status)));
    fields['selected-slice'] = next?.slug ?? null;
  }
  // A route that names a slice that left the roster names the best open slice instead.
  if (RETIRED.has(String(change.status))) Object.assign(fields, routeRepair(index, slice, rosterOf(dir)));
  if (Object.keys(fields).length) setFields(dir, INDEX_NAME, fields);
  if (frontmatterOfDoc(dir, sliceRecord(slice))) setFields(dir, sliceRecord(slice), change);
  syncRosterCopies(dir);
}

// A slice name is lower-case words joined by `-`, so it is a plain word of an invocation.
const namesSlice = (text, slice) => String(text ?? '').split(/\s+/).includes(slice);

/** The index fields whose route names `slice`, pointed at the best open slice (or at the review when none is open). */
function routeRepair(index, slice, roster) {
  const best = bestFirstOf(roster.filter((s) => s.slug !== slice), null);
  const out = {};
  const next = index['next-invocation'];
  if (namesSlice(next, slice)) {
    const slug = index.slug ?? '';
    out['next-invocation'] = best ? String(next).split(/\s+/).map((w) => (w === slice ? best : w)).join(' ') : `/wf review ${slug}`;
    if (!best) out['next-command'] = 'wf-review';
  }
  if (Array.isArray(index['recommended-routes'])) {
    const kept = index['recommended-routes'].filter((r) => !namesSlice(r?.invocation ?? r, slice));
    if (kept.length !== index['recommended-routes'].length) out['recommended-routes'] = kept;
  }
  return out;
}

/** One entry of the revision ledger of the roster: `trigger` and why. */
export function rosterRevision(dir, trigger, because, changed = null) {
  const fm = frontmatterOfDoc(dir, ROSTER) ?? {};
  const revisions = Array.isArray(fm.revisions) ? fm.revisions : [];
  const entry = { rev: revisions.length + 1, at: nowIso(), trigger, because: String(because), ...(changed ? { changed: String(changed) } : {}) };
  setFields(dir, ROSTER, { revisions: [...revisions, entry] });
  return entry;
}

/** Drop a slice from the roster with a reason. Returns `{ slice, status }`. */
export function dropSlice(dir, slice, { reason } = {}) {
  if (!reason || !String(reason).trim()) throw new Error('slice drop: --reason <why the slice leaves> is required');
  const { entry } = entryOf(dir, slice);
  if (entry.status === 'dropped') throw new Error(`${slice} is dropped already`);
  markSlice(dir, slice, { status: 'dropped', 'drop-reason': String(reason).trim() });
  rosterRevision(dir, 'scope-change', `slice drop: ${slice}: ${String(reason).trim()}`, slice);
  return { slice, status: 'dropped' };
}

/**
 * Move a slice to the roster of another workflow. The slice record is copied to the target with
 * `moved-from`, the target roster gets the slice as `defined`, and the source marks the slice
 * dropped with `moved-to`. The stage records of the slice stay in the source.
 */
export function moveSlice(fromDir, toDir, slice, { fromSlug, toSlug, reason } = {}) {
  if (!reason || !String(reason).trim()) throw new Error('slice move: --reason <why the slice moves> is required');
  if (!toSlug || fromSlug === toSlug) throw new Error('slice move: --to <another workflow> is required');
  const { entry } = entryOf(fromDir, slice);
  if (entry.status === 'dropped') throw new Error(`${slice} is dropped already`);
  if (!frontmatterOfDoc(toDir, INDEX_NAME)) throw new Error(`slice move: no workflow ${toSlug}`);
  const target = frontmatterOfDoc(toDir, ROSTER);
  if (!target) throw new Error(`slice move: ${toSlug} has no ${ROSTER}; run /wf slice ${toSlug} first`);
  const targetRoster = rosterOf(toDir);
  if (targetRoster.some((s) => s.slug === slice)) throw new Error(`slice move: ${toSlug} has a slice ${slice} already`);
  const rec = readDoc(fromDir, sliceRecord(slice));
  if (rec?.frontmatter) {
    writeDoc(toDir, sliceRecord(slice), { frontmatter: { ...rec.frontmatter, slug: toSlug, status: 'defined', 'moved-from': fromSlug, 'updated-at': nowIso() }, body: rec.body ?? '' });
  }
  const { status: _old, 'drop-reason': _r, 'moved-to': _m, ...rest } = entry;
  setFields(toDir, ROSTER, { slices: [...targetRoster, { ...rest, status: 'defined' }] });
  rosterRevision(toDir, 'new-slice', `slice move: ${slice} came from ${fromSlug}: ${String(reason).trim()}`, slice);
  syncRosterCopies(toDir);
  markSlice(fromDir, slice, { status: 'dropped', 'drop-reason': String(reason).trim(), 'moved-to': toSlug });
  rosterRevision(fromDir, 'scope-change', `slice move: ${slice} went to ${toSlug}: ${String(reason).trim()}`, slice);
  return { slice, from: fromSlug, to: toSlug };
}

// ---------------------------------------------------------------- a slice added or carried by a placement
//
// During a run, a slice is added (`slice add`) or takes an issue into its scope (`slice carry`)
// only by a placement of lib/issue-place.mjs, or by a decision of the person. The placement
// record (`05i-issue-<key>.md`) is the guard and the key: a call with no placement of the right
// rung is refused, and a second call with the same placement changes nothing.

const SLICE_NAME = /^[a-z0-9][a-z0-9-]*$/;
const FINISHED = new Set(['complete', 'deferred']);
const RETIRED = new Set(['skipped', 'dropped']);
const listOf = (v) => [...new Set((Array.isArray(v) ? v : String(v ?? '').split(',')).map((s) => String(s).trim()).filter(Boolean))];

/** The placement of a record, checked: its rung must be one of `rungs`, and it must name `target`. */
function placementOf(dir, record, rungs, target) {
  const fm = frontmatterOfDoc(dir, record);
  if (!fm) throw new Error(`no placement record ${record}; run wf.mjs issue place first`);
  const p = fm.placement;
  if (!p || !rungs.map(String).includes(String(p.rung))) throw new Error(`${record} holds no placement at rung ${rungs.join(' or ')}${p ? ` (it holds rung ${p.rung})` : ''}`);
  if (String(p.target) !== String(target)) throw new Error(`${record} places the issue into ${p.target}, not ${target}`);
  if (String(p.rung) === '5' && !p.gate?.pass) throw new Error(`${record}: the proof gate of a new slice did not pass: ${(p.gate?.failed ?? []).join('; ')}`);
  return p;
}

/** The complexity of a slice from its step estimate: s up to 8 steps, m up to 14, l above; s when unknown. */
export function complexityOf(steps) {
  if (!Number.isInteger(steps)) return 's';
  return steps <= 3 ? 'xs' : steps <= 8 ? 's' : steps <= 14 ? 'm' : steps <= 20 ? 'l' : 'xl';
}

/** The guard of a write by the person: a decision id that the store holds. */
function personGuard(decisions, decision) {
  if (!decision || !decisions.some((e) => e.id === decision)) throw new Error(`--by person needs --decision <id> of a recorded decision${decision ? `; ${decision} is not in the store` : ''}`);
}

/** The guard of both writes: a placement of the right rung, or a decision of the person. */
function guard(dir, input, rungs, target, decisions, what) {
  if (input.by === 'person') { personGuard(decisions, input.decision); return null; }
  if (!input.placement) throw new Error(`${what}: --placement <05i-issue-<key>.md> is required (or --by person --decision <id>)`);
  placementOf(dir, String(input.placement), rungs, target);
  return String(input.placement);
}

/**
 * Add a slice to the roster during a run: the slice record and the roster row in one call.
 * `after` are the slices it depends on; `before` the slices that now depend on it (none may have started).
 */
export function addSlice(dir, input, { decisions = [] } = {}) {
  const slice = String(input.slice ?? '').trim();
  if (!SLICE_NAME.test(slice)) throw new Error('slice add: <slice> must be lower-case words joined by -');
  const scope = String(input.scope ?? '').trim();
  const ac = (Array.isArray(input.ac) ? input.ac : String(input.ac ?? '').split('\n')).map((s) => String(s).trim()).filter(Boolean);
  if (!scope || !ac.length) throw new Error('slice add: --scope and at least one --ac are required');
  const placement = guard(dir, input, [5], slice, decisions, 'slice add');
  const roster = rosterOf(dir);
  if (roster.some((s) => s.slug === slice)) {
    const fm = frontmatterOfDoc(dir, sliceRecord(slice)) ?? {};
    if ((placement && fm.placement === placement) || (!placement && fm.decision === input.decision)) return { slice, added: false, already: true };
    throw new Error(`slice add: the roster has a slice ${slice} already`);
  }
  const names = new Set(roster.map((s) => s.slug));
  const after = listOf(input.after);
  const before = listOf(input.before);
  for (const s of [...after, ...before]) if (!names.has(s)) throw new Error(`slice add: ${s} is not in the roster`);
  for (const s of before) {
    const e = roster.find((x) => x.slug === s);
    if (FINISHED.has(String(e.status)) || frontmatterOfDoc(dir, `05-implement-${s}.md`)) throw new Error(`slice add: ${s} has started or is finished, so it cannot wait for ${slice}; leave it out of --before`);
  }
  const index = frontmatterOfDoc(dir, INDEX_NAME) ?? {};
  const wfSlug = index.slug ?? null;
  const at = nowIso();
  const estimate = Number.isInteger(Number(input.estimatedSteps)) && Number(input.estimatedSteps) > 0 ? Number(input.estimatedSteps) : null;
  // The size comes from the investigation; with no size given, a step estimate sets it.
  const complexity = ['xs', 's', 'm', 'l', 'xl'].includes(String(input.complexity)) ? String(input.complexity) : complexityOf(estimate);
  // The ux-impact comes from the investigation; one it does not give is unknown and is left out, so
  // the driver reads it as not settled and does not drive the slice past an open design.
  const uxImpact = ['none', 'visual', 'flow', 'new-surface'].includes(String(input.uxImpact)) ? String(input.uxImpact) : null;
  const files = listOf(input.files);
  writeDoc(dir, sliceRecord(slice), {
    frontmatter: {
      schema: 'sdlc/v1', type: 'slice', slug: wfSlug, 'slice-slug': slice, status: 'defined', 'stage-number': 3,
      'created-at': at, 'updated-at': at, complexity, 'depends-on': after, tags: [], ...(uxImpact ? { 'ux-impact': uxImpact } : {}),
      ...(estimate ? { 'estimated-steps': estimate } : {}),
      ...(input.madeFor ? { 'made-for': String(input.madeFor) } : {}),
      ...(placement ? { placement } : { decision: String(input.decision) }),
      refs: { index: INDEX_NAME, 'slice-index': ROSTER, plan: `04-plan-${slice}.md`, implement: `05-implement-${slice}.md` },
      'next-command': 'wf-plan', 'next-invocation': `/wf plan ${wfSlug ?? '<slug>'} ${slice}`,
    },
    body: [
      `# Slice: ${String(input.title ?? slice).trim()}`, '',
      '## Goal', '', scope, '',
      '## Why This Slice Exists', '', placement ? `Added during a run by the placement ${placement}${input.madeFor ? ` of the issue ${input.madeFor}` : ''}: no open slice could take the issue.` : `Added during a run by the decision ${input.decision} of the person.`, '',
      '## Scope', '', scope, '',
      '## Likely Files / Areas to Touch', '', ...(files.length ? files.map((f) => `${f}: named by the investigation`) : ['Unknown — plan research locates the files']), '',
      '## Acceptance Criteria', '', ...ac.map((a) => `- ${a}`), '',
      '## Dependencies on Other Slices', '', ...(after.length ? after.map((s) => `- ${s}`) : ['None']), '',
    ].join('\n'),
  });
  setFields(dir, ROSTER, {
    slices: [
      ...roster.map((s) => (before.includes(s.slug) ? { ...s, 'depends-on': [...new Set([...(s['depends-on'] ?? []), slice])] } : s)),
      { slug: slice, status: 'defined', complexity, 'depends-on': after, ...(estimate ? { 'estimated-steps': estimate } : {}), ...(input.madeFor ? { 'made-for': String(input.madeFor) } : {}) },
    ],
  });
  rosterRevision(dir, 'new-slice', placement ? `slice add: ${slice}, by the placement ${placement}` : `slice add: ${slice}, by the decision ${input.decision} of the person`, slice);
  for (const s of before) {
    const fm = frontmatterOfDoc(dir, sliceRecord(s));
    if (fm) setFields(dir, sliceRecord(s), { 'depends-on': [...new Set([...(fm['depends-on'] ?? []), slice])] });
  }
  const listed = Array.isArray(index['workflow-files']) ? index['workflow-files'] : null;
  if (listed && !listed.includes(sliceRecord(slice))) setFields(dir, INDEX_NAME, { 'workflow-files': [...listed, sliceRecord(slice)] });
  syncRosterCopies(dir);
  return { slice, added: true, after, before, ...(estimate ? { estimatedSteps: estimate } : {}) };
}

/**
 * Carry an issue into the scope of a slice whose implement has not started: the slice record
 * gets the issue under `carried-issues` and in its body, and `carried-at`, so a plan that was
 * written before it is refreshed before the implement.
 */
export function carrySlice(dir, slice, input, { decisions = [] } = {}) {
  const issue = String(input.issue ?? '').trim();
  const text = String(input.text ?? '').trim();
  if (!issue || !text) throw new Error('slice carry: --issue <talk id> and --text <the issue> are required');
  const placement = guard(dir, input, [3, 4], slice, decisions, 'slice carry');
  const { entry } = entryOf(dir, slice);
  if (RETIRED.has(String(entry.status)) || FINISHED.has(String(entry.status))) throw new Error(`slice carry: ${slice} is ${entry.status}`);
  const rec = readDoc(dir, sliceRecord(slice));
  if (!rec?.frontmatter) throw new Error(`slice carry: ${slice} has no slice record`);
  const carried = Array.isArray(rec.frontmatter['carried-issues']) ? rec.frontmatter['carried-issues'] : [];
  const key = placement ?? String(input.decision);
  if (carried.some((c) => c && (c.placement === key || c.decision === key))) return { slice, carried: false, already: true };
  if (frontmatterOfDoc(dir, `05-implement-${slice}.md`)) throw new Error(`slice carry: ${slice} has started its implement; place the issue again`);
  // A carry adds its steps to the estimate of the slice; a carry that would pass the step limit is
  // refused, so the ladder never widens a slice past it.
  const steps = Number.isInteger(Number(input.steps)) && Number(input.steps) > 0 ? Number(input.steps) : null;
  const max = Number(input.maxSteps) > 0 ? Number(input.maxSteps) : DEFAULT_MAX_STEPS;
  const est = Number.isInteger(Number(entry['estimated-steps'])) && Number(entry['estimated-steps']) > 0 ? Number(entry['estimated-steps']) : null;
  if (steps && est && est + steps > max) throw new Error(`slice carry: ${slice} has an estimate of ${est} steps; ${steps} more would pass the step limit of ${max} (slices.maxSteps): place the issue again`);
  const at = nowIso();
  const line = `- ${issue}: ${text}${placement ? ` (${placement})` : ` (decision ${input.decision})`}`;
  const body = String(rec.body ?? '').replace(/\n*$/, '\n');
  const next = /\n## Carried Issues\n/.test(body)
    ? body.replace(/\n## Carried Issues\n\n([^\n]*\n)/, (m, first) => `\n## Carried Issues\n\n${first}${line}\n`)
    : `${body}\n## Carried Issues\n\nIssues that a run placed into this slice. They are part of its scope, and its plan covers each one.\n\n${line}\n`;
  writeDoc(dir, sliceRecord(slice), {
    frontmatter: { ...rec.frontmatter, 'carried-issues': [...carried, { issue, text, at, ...(placement ? { placement } : { decision: String(input.decision) }) }], 'carried-at': at, 'updated-at': at },
    body: next,
  });
  if (steps && est) {
    const roster = frontmatterOfDoc(dir, ROSTER)?.slices ?? [];
    setFields(dir, ROSTER, { slices: roster.map((s) => (s && typeof s === 'object' && s.slug === slice ? { ...s, 'estimated-steps': est + steps } : s)) });
  }
  syncRosterCopies(dir);
  return { slice, carried: true, at, ...(steps && est ? { estimatedSteps: est + steps } : {}) };
}

// ---------------------------------------------------------------- a slice split in parts, or two merged
//
// A slice over the step limit is split (`slice split`), and two small slices that share their
// files are merged (`slice merge`). Both need a decision (`--decision <id>`): the person, or the
// run that the person delegated to, chose the cut. Neither touches a slice whose implement has
// started. The kept part holds the first slug, so the talk and the records of the slice still reach it.

const AC_HEADING = /^##\s+Acceptance Criteria\s*$/m;

/** The acceptance criteria of a slice body: each top-level `- ` item with the lines under it. */
export function acBlocks(body) {
  const text = String(body ?? '');
  const m = AC_HEADING.exec(text);
  if (!m) return { before: text, blocks: [], after: '' };
  const start = m.index + m[0].length;
  const next = /^##\s+\S/m.exec(text.slice(start));
  const end = next ? start + next.index : text.length;
  const blocks = [];
  for (const line of text.slice(start, end).split('\n')) {
    if (/^[-*]\s+\S/.test(line)) blocks.push([line]);
    else if (blocks.length && line.trim()) blocks.at(-1).push(line);
  }
  return { before: text.slice(0, m.index), blocks: blocks.map((b) => b.join('\n')), after: text.slice(end) };
}

function withAcs(body, blocks) {
  const text = String(body ?? '');
  if (!AC_HEADING.test(text)) return `${text.replace(/\n*$/, '\n')}\n## Acceptance Criteria\n\n${blocks.join('\n')}\n`;
  const { before, after } = acBlocks(text);
  return `${before}## Acceptance Criteria\n\n${blocks.join('\n')}\n\n${after.replace(/^\n+/, '')}`.replace(/\n{3,}/g, '\n\n');
}

/** The body with its `## <heading>` section replaced by `lines` (added at the end when it has none). */
function withSection(body, heading, lines) {
  const text = String(body ?? '');
  const re = new RegExp(`\\n## ${heading}\\n[\\s\\S]*?(?=\\n## |$)`);
  const section = `\n## ${heading}\n\n${lines.join('\n')}\n`;
  return re.test(text) ? text.replace(re, section) : `${text.replace(/\n*$/, '\n')}${section}`;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The criteria that `ids` name: 1-based positions, or `AC-<n>` labels that the text of a criterion carries. */
function pickAcs(blocks, ids, part) {
  return ids.map((id) => {
    const i = /^\d+$/.test(id) ? Number(id) - 1 : blocks.findIndex((b) => new RegExp(`\\b${escapeRe(id)}\\b`, 'i').test(b));
    if (i < 0 || i >= blocks.length) throw new Error(`slice split: ${part}:${id} names no acceptance criterion; the slice has ${blocks.length} (give 1 to ${blocks.length}, or an AC-<n> label)`);
    return i;
  });
}

const estimateOf = (e) => (Number.isInteger(Number(e?.['estimated-steps'])) && Number(e['estimated-steps']) > 0 ? Number(e['estimated-steps']) : null);
const dependsOf = (s) => (Array.isArray(s?.['depends-on']) ? s['depends-on'] : []);

function notStarted(dir, slice, entry, what, { stoppedOk = false } = {}) {
  if (RETIRED.has(String(entry.status)) || FINISHED.has(String(entry.status))) throw new Error(`${what}: ${slice} is ${entry.status}`);
  if (!frontmatterOfDoc(dir, `05-implement-${slice}.md`) && String(entry.status) !== 'in-progress') return;
  if (stoppedOk && stoppedRun(dir, slice)) return;
  throw new Error(`${what}: ${slice} has started its implement; a started slice is cut only when its run of steps is stopped (a hard stop)`);
}

/** True when the last run of steps of `slice` ended in a hard stop: no step runs, and the run is not complete. */
export function stoppedRun(dir, slice) {
  let rows;
  try { rows = readSteps(dir).filter((r) => r.slice === slice); } catch { return false; }
  const start = rows.findLastIndex((r) => r.event === 'start');
  if (start < 0) return false;
  const after = rows.slice(start + 1);
  return after.some((r) => r.event === 'hard-stop') && !after.some((r) => r.event === 'complete' || r.event === 'start');
}

/** Point the `depends-on` of each slice record that names a slice of `map` at its new slice. */
function repointRecords(dir, roster, map) {
  for (const s of roster) {
    if (map.has(s.slug) || !dependsOf(s).some((x) => map.has(x))) continue;
    const fm = frontmatterOfDoc(dir, sliceRecord(s.slug));
    if (fm) setFields(dir, sliceRecord(s.slug), { 'depends-on': [...new Set(dependsOf(fm).map((x) => map.get(x) ?? x))] });
  }
}

/**
 * Split `slice` into parts. `parts` is `[{ slice, acs: [ids] }]`: the part named `slice` keeps
 * its slug, and each criterion goes to one part. Each part depends on the part before it, so
 * the slices that depended on `slice` depend on the last part. The estimate is divided by the
 * share of criteria. Decisions scoped to the slice go to the part whose criteria they name
 * (`AC-<n>`), else to every part.
 */
export function splitSlice(dir, slice, input, { decisions = [] } = {}) {
  personGuard(decisions, input.decision);
  const { roster, entry } = entryOf(dir, slice);
  // A stopped slice is cut too: the part named after it keeps what is built, the new parts start fresh.
  notStarted(dir, slice, entry, 'slice split', { stoppedOk: true });
  const rec = readDoc(dir, sliceRecord(slice));
  if (!rec?.frontmatter) throw new Error(`slice split: ${slice} has no slice record`);
  const specs = (Array.isArray(input.parts) ? input.parts : []).map((p) => ({ slice: String(p.slice ?? '').trim(), acs: listOf(p.acs) }));
  if (specs.length < 2) throw new Error('slice split: give two parts or more, as --part "<slice>:<ac>,<ac>;<new>:<ac>"');
  const kept = specs.findIndex((p) => p.slice === slice);
  if (kept < 0) throw new Error(`slice split: one part keeps the slug ${slice}: give --part ${slice}:<its criteria>`);
  specs.unshift(...specs.splice(kept, 1));
  const names = new Set(roster.map((s) => s.slug));
  for (const p of specs.slice(1)) {
    if (!SLICE_NAME.test(p.slice)) throw new Error(`slice split: ${p.slice} must be lower-case words joined by -`);
    if (names.has(p.slice)) throw new Error(`slice split: the roster has a slice ${p.slice} already`);
  }
  if (new Set(specs.map((p) => p.slice)).size !== specs.length) throw new Error('slice split: two parts have the same slug');
  const { blocks } = acBlocks(rec.body);
  if (!blocks.length) throw new Error(`slice split: ${slice} has no ## Acceptance Criteria to divide`);
  const owner = new Map();
  for (const p of specs) {
    if (!p.acs.length) throw new Error(`slice split: the part ${p.slice} has no criteria; give it as <slice>:<ac>,<ac>`);
    for (const i of pickAcs(blocks, p.acs, p.slice)) {
      if (owner.has(i)) throw new Error(`slice split: criterion ${i + 1} is in ${owner.get(i)} and in ${p.slice}; each criterion goes to one part`);
      owner.set(i, p.slice);
    }
  }
  const missing = blocks.map((_, i) => i).filter((i) => !owner.has(i));
  if (missing.length) throw new Error(`slice split: criteria ${missing.map((i) => i + 1).join(', ')} are in no part; each criterion goes to one part`);
  const reason = String(input.reason ?? '').trim() || `by the decision ${input.decision}`;
  const at = nowIso();
  const est = estimateOf(entry);
  const acsOf = (p) => blocks.filter((_, i) => owner.get(i) === p.slice);
  const estOf = (p) => (est ? Math.max(1, Math.round((est * acsOf(p).length) / blocks.length)) : null);
  const deps = dependsOf(entry);
  const partNames = specs.map((p) => p.slice);
  const last = partNames.at(-1);
  const depsOf = (k) => (k === 0 ? deps : [partNames[k - 1]]);
  specs.forEach((p, k) => {
    const e = estOf(p);
    const fm = {
      ...rec.frontmatter, 'slice-slug': p.slice, status: 'defined', 'depends-on': depsOf(k), 'updated-at': at, 'scope-at': at,
      ...(e ? { 'estimated-steps': e, complexity: complexityOf(e) } : {}),
      ...(k === 0 ? { 'split-into': partNames.slice(1) } : { 'split-from': slice, 'created-at': at }),
      refs: { ...(rec.frontmatter.refs ?? {}), plan: `04-plan-${p.slice}.md`, implement: `05-implement-${p.slice}.md` },
      'next-command': 'wf-plan', 'next-invocation': `/wf plan ${rec.frontmatter.slug ?? '<slug>'} ${p.slice}`,
    };
    let body = withAcs(rec.body, acsOf(p));
    if (k > 0) {
      for (const f of ['carried-issues', 'carried-at', 'split-into', 'placement', 'decision', 'merged-from']) delete fm[f];
      body = body.replace(/^# Slice: .*$/m, `# Slice: ${p.slice}`).replace(/\n## Carried Issues\n[\s\S]*?(?=\n## |$)/, '\n');
    }
    body = withSection(body, 'Dependencies on Other Slices', depsOf(k).length ? depsOf(k).map((s) => `- ${s}`) : ['None']);
    writeDoc(dir, sliceRecord(p.slice), { frontmatter: fm, body });
  });
  const rows = [];
  for (const s of roster) {
    if (s.slug !== slice) {
      rows.push(dependsOf(s).includes(slice) ? { ...s, 'depends-on': [...new Set(dependsOf(s).map((x) => (x === slice ? last : x)))] } : s);
      continue;
    }
    specs.forEach((p, k) => {
      const e = estOf(p);
      const base = k === 0 ? s : { slug: p.slice, status: 'defined', 'split-from': slice };
      rows.push({ ...base, 'depends-on': depsOf(k), ...(e ? { 'estimated-steps': e, complexity: complexityOf(e) } : {}) });
    });
  }
  setFields(dir, ROSTER, { slices: rows });
  repointRecords(dir, roster, new Map([[slice, last]]));
  rosterRevision(dir, 'split', `slice split: ${slice} into ${partNames.join(', ')}: ${reason}`, partNames.join(','));
  const index = frontmatterOfDoc(dir, INDEX_NAME) ?? {};
  const listed = Array.isArray(index['workflow-files']) ? index['workflow-files'] : null;
  const more = listed ? partNames.slice(1).map(sliceRecord).filter((n) => !listed.includes(n)) : [];
  if (more.length) setFields(dir, INDEX_NAME, { 'workflow-files': [...listed, ...more] });
  const labels = (e) => [...String(`${e.question ?? ''} ${e.answer ?? ''}`).matchAll(/\bAC-\d+\b/gi)].map((m) => m[0]);
  const rescoped = rescopeDecisions(dir, slice, (e) => {
    const named = labels(e);
    const hits = named.length ? specs.filter((p) => named.some((l) => new RegExp(`\\b${l}\\b`, 'i').test(acsOf(p).join('\n')))) : [];
    return (hits.length ? hits : specs).map((p) => p.slice);
  }, `slice split: ${slice} into ${partNames.join(', ')}`);
  syncRosterCopies(dir);
  return { slice, parts: specs.map((p) => ({ slice: p.slice, acs: acsOf(p).length, ...(estOf(p) ? { estimatedSteps: estOf(p) } : {}) })), decisions: rescoped };
}

/**
 * Merge the slices `from` into `into`: the criteria, the carried issues and the estimates join in
 * `into`; each slice of `from` is dropped with "merged into <into>"; the slices that depended on
 * them depend on `into`; their decisions move to it. Refused when the joined estimate passes
 * the step limit.
 */
export function mergeSlices(dir, into, from, input, { decisions = [] } = {}) {
  personGuard(decisions, input.decision);
  const others = listOf(from).filter((s) => s !== into);
  if (!others.length) throw new Error('slice merge: give the slices to merge with --from, other than the one they merge into');
  const roster = rosterOf(dir);
  const all = [into, ...others];
  const entries = all.map((s) => {
    const e = roster.find((x) => x.slug === s);
    if (!e) throw new Error(`slice merge: ${s} is not in the roster`);
    notStarted(dir, s, e, 'slice merge');
    return e;
  });
  const recs = all.map((s) => {
    const r = readDoc(dir, sliceRecord(s));
    if (!r?.frontmatter) throw new Error(`slice merge: ${s} has no slice record`);
    return r;
  });
  const max = Number(input.maxSteps) > 0 ? Number(input.maxSteps) : DEFAULT_MAX_STEPS;
  const ests = entries.map(estimateOf);
  const est = ests.every(Boolean) ? ests.reduce((a, b) => a + b, 0) : null;
  if (est && est > max) throw new Error(`slice merge: the merged slice comes to ${est} steps; a slice has ${max} steps or fewer (slices.maxSteps)`);
  const reason = String(input.reason ?? '').trim() || `by the decision ${input.decision}`;
  const at = nowIso();
  const gone = new Map(others.map((s) => [s, into]));
  const deps = [...new Set(entries.flatMap(dependsOf).filter((s) => s !== into && !gone.has(s)))];
  const carried = recs.flatMap((r) => (Array.isArray(r.frontmatter['carried-issues']) ? r.frontmatter['carried-issues'] : []));
  const [main] = recs;
  let body = withAcs(main.body, recs.flatMap((r) => acBlocks(r.body).blocks));
  body = withSection(body, 'Dependencies on Other Slices', deps.length ? deps.map((s) => `- ${s}`) : ['None']);
  if (carried.length) body = withSection(body, 'Carried Issues', ['Issues that a run placed into this slice. They are part of its scope, and its plan covers each one.', '', ...carried.map((c) => `- ${c.issue}: ${c.text}`)]);
  writeDoc(dir, sliceRecord(into), {
    frontmatter: {
      ...main.frontmatter, 'depends-on': deps, 'updated-at': at, 'scope-at': at, 'merged-from': [...(main.frontmatter['merged-from'] ?? []), ...others],
      ...(carried.length ? { 'carried-issues': carried, 'carried-at': at } : {}),
      ...(est ? { 'estimated-steps': est, complexity: complexityOf(est) } : {}),
    },
    body,
  });
  const rows = roster.map((s) => {
    if (s.slug === into) return { ...s, 'depends-on': deps, ...(est ? { 'estimated-steps': est, complexity: complexityOf(est) } : {}) };
    if (gone.has(s.slug)) return { ...s, status: 'dropped', 'drop-reason': `merged into ${into}`, 'merged-into': into };
    return dependsOf(s).some((x) => gone.has(x)) ? { ...s, 'depends-on': [...new Set(dependsOf(s).map((x) => gone.get(x) ?? x))] } : s;
  });
  setFields(dir, ROSTER, { slices: rows });
  for (const s of others) setFields(dir, sliceRecord(s), { status: 'dropped', 'drop-reason': `merged into ${into}`, 'merged-into': into });
  repointRecords(dir, roster.filter((s) => s.slug !== into), gone);
  const index = frontmatterOfDoc(dir, INDEX_NAME) ?? {};
  const fields = {};
  if (gone.has(index['selected-slice'])) fields['selected-slice'] = into;
  for (const s of others) Object.assign(fields, routeRepair({ ...index, ...fields }, s, rosterOf(dir)));
  if (Object.keys(fields).length) setFields(dir, INDEX_NAME, fields);
  rosterRevision(dir, 'merge', `slice merge: ${others.join(', ')} into ${into}: ${reason}`, all.join(','));
  const moved = [];
  for (const s of others) moved.push(...rescopeDecisions(dir, s, () => [into], `slice merge: ${s} into ${into}`).moved);
  syncRosterCopies(dir);
  return { slice: into, merged: others, ...(est ? { estimatedSteps: est } : {}), decisions: { moved } };
}
