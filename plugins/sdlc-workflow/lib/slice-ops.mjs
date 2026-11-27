// A slice leaves the roster (`wf.mjs slice drop`, `slice move`), joins it (`slice add`), or takes an
// issue into its scope (`slice carry`). A drop or a move changes the
// roster (03-slice.md), the slice record (03-slice-<slice>.md), the slice list of the index and
// the selected slice. The caller rebuilds INDEX.md. A dropped slice keeps its records, so its
// history stays readable; the drivers and the routes skip it.
import { INDEX_NAME, frontmatterOfDoc, readDoc, setFields, writeDoc } from './records.mjs';

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
  if (Object.keys(fields).length) setFields(dir, INDEX_NAME, fields);
  if (frontmatterOfDoc(dir, sliceRecord(slice))) setFields(dir, sliceRecord(slice), change);
}

/** Drop a slice from the roster with a reason. Returns `{ slice, status }`. */
export function dropSlice(dir, slice, { reason } = {}) {
  if (!reason || !String(reason).trim()) throw new Error('slice drop: --reason <why the slice leaves> is required');
  const { entry } = entryOf(dir, slice);
  if (entry.status === 'dropped') throw new Error(`${slice} is dropped already`);
  markSlice(dir, slice, { status: 'dropped', 'drop-reason': String(reason).trim() });
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
  markSlice(fromDir, slice, { status: 'dropped', 'drop-reason': String(reason).trim(), 'moved-to': toSlug });
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
  const complexity = ['xs', 's', 'm', 'l', 'xl'].includes(String(input.complexity)) ? String(input.complexity) : 's';
  const uxImpact = ['none', 'visual', 'flow', 'new-surface'].includes(String(input.uxImpact)) ? String(input.uxImpact) : 'none';
  const files = listOf(input.files);
  writeDoc(dir, sliceRecord(slice), {
    frontmatter: {
      schema: 'sdlc/v1', type: 'slice', slug: wfSlug, 'slice-slug': slice, status: 'defined', 'stage-number': 3,
      'created-at': at, 'updated-at': at, complexity, 'depends-on': after, tags: [], 'ux-impact': uxImpact,
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
      { slug: slice, status: 'defined', complexity, 'depends-on': after, ...(input.madeFor ? { 'made-for': String(input.madeFor) } : {}) },
    ],
  });
  for (const s of before) {
    const fm = frontmatterOfDoc(dir, sliceRecord(s));
    if (fm) setFields(dir, sliceRecord(s), { 'depends-on': [...new Set([...(fm['depends-on'] ?? []), slice])] });
  }
  if (Array.isArray(index.slices)) setFields(dir, INDEX_NAME, { slices: [...index.slices, { slug: slice, status: 'defined' }] });
  return { slice, added: true, after, before };
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
  return { slice, carried: true, at };
}
