// The roster of a workflow, `03-slice.md` `slices:`, is the one stored copy of the facts of its
// slices: status, order, depends-on and estimated steps. Every count and list that other records
// and commands show is worked out here from it, when it is read: the live and open slices, the
// slice total, the walk order, the best first slice, the step size of the packet and the
// progress of each slice stage.
import { readPlan } from './steps.mjs';
import { INDEX_NAME, frontmatterOfDoc, readDoc, setFields } from './records.mjs';
import { SLICE_STAGES, stageFileOf } from './stage-done.mjs';
import { rosterWalkOrder } from './roster-edit.mjs';
import { limitsOr } from './limits.mjs';
import { deriveFields } from './derive.mjs';

export const ROSTER = '03-slice.md';
/** A slice whose roster status is one of these is done: no stage of it is left to run. */
export const SLICE_DONE = Object.freeze(new Set(['complete', 'deferred', 'skipped', 'dropped']));

const entryOf = (s) => (typeof s === 'string' ? { slug: s, status: 'defined' } : s && typeof s === 'object' ? { ...s, status: s.status ?? 'defined' } : null);

/** The roster entries of a workflow, each `{ slug, status, ... }`; null when the workflow has no roster. */
export function rosterEntries(dir) {
  const fm = frontmatterOfDoc(dir, ROSTER);
  if (!fm) return null;
  return (Array.isArray(fm.slices) ? fm.slices : []).map(entryOf).filter((e) => e && e.slug);
}

export const isLive = (e) => String(e?.status) !== 'dropped';
export const isOpen = (e) => !SLICE_DONE.has(String(e?.status));

/** The entries that are not dropped. */
export const liveSlices = (entries) => (entries ?? []).filter(isLive);
/** The entries that still have a stage to run. */
export const openSlices = (entries) => (entries ?? []).filter(isOpen);
/** The slice total of a workflow: its slices that are not dropped. */
export const totalSlices = (entries) => liveSlices(entries).length;

/** The live entries in walk order: each after the slices it depends on, else in roster order. */
export function walkOrder(entries) {
  const live = liveSlices(entries).map((e) => ({ ...e, dependsOn: (Array.isArray(e['depends-on']) ? e['depends-on'] : []).map(String) }));
  return rosterWalkOrder(live);
}

/**
 * The best first slice: the stored `best-first-slice` while it names an open slice, else the first
 * open slice in walk order, else null. A stored name of a dropped or done slice is never returned.
 */
export function bestFirst(entries, stored = null) {
  const open = openSlices(entries);
  if (stored && open.some((e) => e.slug === String(stored))) return String(stored);
  return walkOrder(open)[0]?.slug ?? null;
}

/** The step count of the plan of a slice, or null when it has no plan with steps. */
export function planStepCount(dir, slice) {
  const doc = readDoc(dir, stageFileOf(dir, '04-plan', slice));
  if (!doc) return null;
  const n = readPlan(doc.body ?? '').steps.length;
  return n > 0 ? n : null;
}

const posInt = (v) => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : null);

/**
 * The step size of a workflow, slice by slice: the plan's step count once a slice has a plan,
 * else its `estimated-steps`, else the step limit (a slice of unknown size counts as full).
 * Dropped slices count nothing. `unknown` names the slices that have neither a plan nor an estimate.
 */
export function packetSteps(dir, entries, limits = null) {
  const { maxSteps } = limitsOr(limits);
  const bySlice = {};
  const unknown = [];
  let steps = 0;
  for (const e of liveSlices(entries)) {
    const planned = planStepCount(dir, e.slug);
    const est = posInt(e['estimated-steps']);
    const n = planned ?? est ?? maxSteps;
    if (planned === null && est === null) unknown.push(e.slug);
    bySlice[e.slug] = { steps: n, from: planned !== null ? 'plan' : est !== null ? 'estimate' : 'limit', open: isOpen(e) };
    steps += n;
  }
  return { steps, bySlice, unknown };
}

/**
 * The progress of each slice stage, from the roster and the stage records: `complete` when
 * every open slice has a complete record of the stage (or no slice is open and one ran),
 * `in-progress` when some slice has one, else null.
 */
export function stageProgress(dir, entries) {
  const live = liveSlices(entries);
  const open = openSlices(live);
  const out = {};
  for (const [stage, prefix] of SLICE_STAGES) {
    const status = (slug) => frontmatterOfDoc(dir, stageFileOf(dir, prefix, slug))?.status ?? null;
    const any = live.some((e) => status(e.slug) !== null);
    if (!any) { out[stage] = null; continue; }
    out[stage] = open.every((e) => status(e.slug) === 'complete') ? 'complete' : 'in-progress';
  }
  return out;
}

const sameJson = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const depsOf = (e) => (Array.isArray(e?.['depends-on']) ? e['depends-on'].map(String) : []);

/**
 * Bring every read-only copy of the roster in step with it: the `slices[]` of the index (when it
 * keeps one) and the per-stage `progress` of the index, the `status` and `depends-on` of each
 * slice record, and the `implementation-order` of `04-plan.md`. A copy that agrees is not
 * written. Returns the names of the records that changed.
 */
// A copy or a count kept in step is not a write of the record: its `updated-at` stays, so a reader
// that dates the record by it (the plan of a slice against the code built after it) is not misled.
const keepTime = (fm, fields) => (fm && Object.hasOwn(fm, 'updated-at') ? { ...fields, 'updated-at': fm['updated-at'] } : fields);

export function syncRosterCopies(dir) {
  const entries = rosterEntries(dir);
  if (!entries) return [];
  const changed = [];
  const index = frontmatterOfDoc(dir, INDEX_NAME);
  if (index) {
    const fields = {};
    if (Array.isArray(index.slices)) {
      const old = new Map(index.slices.map((s) => [typeof s === 'string' ? s : s?.slug, s]));
      const next = entries.map((e) => {
        const o = old.get(e.slug);
        const base = o && typeof o === 'object' ? o : { slug: e.slug };
        const row = { ...base, slug: e.slug, status: e.status };
        if (depsOf(e).length) row['depends-on'] = depsOf(e); else delete row['depends-on'];
        return row;
      });
      if (!sameJson(next, index.slices)) fields.slices = next;
    }
    const progress = stageProgress(dir, entries);
    for (const [stage, value] of Object.entries(progress)) {
      if (value && index.progress?.[stage] !== undefined && index.progress[stage] !== value && index.progress[stage] !== 'skipped') fields[`progress.${stage}`] = value;
    }
    if (Object.keys(fields).length) { setFields(dir, INDEX_NAME, fields); changed.push(INDEX_NAME); }
  }
  for (const e of entries) {
    const name = `03-slice-${e.slug}.md`;
    const rec = frontmatterOfDoc(dir, name);
    if (!rec) continue;
    const fields = {};
    if (rec.status !== e.status) fields.status = e.status;
    if (Object.hasOwn(rec, 'depends-on') || depsOf(e).length) { if (!sameJson(depsOf(rec), depsOf(e))) fields['depends-on'] = depsOf(e); }
    if (posInt(e['estimated-steps']) && rec['estimated-steps'] !== posInt(e['estimated-steps'])) fields['estimated-steps'] = posInt(e['estimated-steps']);
    if (Object.keys(fields).length) { setFields(dir, name, keepTime(rec, fields)); changed.push(name); }
  }
  // The slice counts of the master records of plan, implement and verify.
  const live = liveSlices(entries);
  const has = (prefix, slug, ok) => { const fm = frontmatterOfDoc(dir, stageFileOf(dir, prefix, slug)); return Boolean(fm) && ok(fm); };
  const masters = [
    ['04-plan.md', 'plan-index', { 'slices-planned': live.filter((e) => has('04-plan', e.slug, () => true)).length }],
    ['05-implement.md', 'implement-index', { 'slices-implemented': live.filter((e) => has('05-implement', e.slug, (fm) => fm.status === 'complete')).length }],
    ['06-verify.md', 'verify-index', { 'slices-verified': live.filter((e) => ['complete', 'deferred'].includes(String(e.status))).length }],
  ];
  for (const [name, type, counts] of masters) {
    const fm = frontmatterOfDoc(dir, name);
    if (!fm || fm.type !== type) continue;
    const fields = { ...counts, 'slices-total': live.length };
    if (type === 'plan-index' && Array.isArray(fm['implementation-order'])) fields['implementation-order'] = walkOrder(entries).map((e) => e.slug);
    const diff = Object.fromEntries(Object.entries(fields).filter(([k, v]) => !sameJson(fm[k], v)));
    if (Object.keys(diff).length) { setFields(dir, name, keepTime(fm, diff)); changed.push(name); }
  }
  return changed;
}

/**
 * Work out again every derived field of a workflow: the fields that a record determines itself
 * (lib/derive.mjs) on the roster and the plan records, then the read-only copies of the roster.
 * A record that agrees is not written. Returns `[{ record, fields: { <key>: [old, new] } }]`.
 */
export function deriveWorkflow(dir) {
  const out = [];
  const entries = rosterEntries(dir) ?? [];
  const names = ['03-slice.md', '04-plan.md', ...entries.map((e) => stageFileOf(dir, '04-plan', e.slug))];
  for (const name of [...new Set(names)]) {
    const doc = readDoc(dir, name);
    if (!doc?.frontmatter) continue;
    const plan = /^04-plan/.test(name) ? readPlan(doc.body ?? '') : null;
    const stepCount = plan?.found && plan.steps.length ? plan.steps.length : null;
    const next = deriveFields(name, doc.frontmatter, { stepCount, prior: doc.frontmatter });
    const fields = Object.fromEntries(Object.keys(next).filter((k) => !sameJson(next[k], doc.frontmatter[k])).map((k) => [k, [doc.frontmatter[k] ?? null, next[k]]]));
    if (!Object.keys(fields).length) continue;
    setFields(dir, name, keepTime(doc.frontmatter, Object.fromEntries(Object.entries(fields).map(([k, [, v]]) => [k, v]))));
    out.push({ record: name, fields });
  }
  for (const record of syncRosterCopies(dir)) out.push({ record, fields: null });
  return out;
}

/**
 * The limits that a roster `slices` breaks, each as a line of a refusal; [] when none:
 * - an open slice whose `estimated-steps` is over the step limit: split it;
 * - more open slices than `slices.maxPerPacket`, or a packet over its step budget: split the
 *   packet (`campaign split`).
 * A roster that broke a limit before may be written while it breaks it less, or no more: the cut of
 * an over-full roster is itself a write. `stored` is the roster before the write. `override` is the id
 * of a decision of the person that accepts the roster as it is: it clears every line. `decisions`
 * are the live decisions of the workflow.
 */
export function rosterLimitProblems(dir, slices, limits, { stored = null, decisions = [], override = null } = {}) {
  const lim = limitsOr(limits);
  const entries = (Array.isArray(slices) ? slices : []).map(entryOf).filter((e) => e && e.slug);
  const before = Array.isArray(stored) ? stored.map(entryOf).filter((e) => e && e.slug) : null;
  const now = packetSteps(dir, entries, lim);
  const was = before ? packetSteps(dir, before, lim) : null;
  const out = [];
  for (const e of openSlices(entries)) {
    const n = now.bySlice[e.slug];
    if (!n || n.from !== 'estimate' || n.steps <= lim.maxSteps) continue;
    const old = was?.bySlice[e.slug];
    if (old && old.from === 'estimate' && old.steps >= n.steps) continue;
    out.push(`slice ${e.slug} has estimated-steps ${n.steps}; a slice has ${lim.maxSteps} steps or fewer (slices.maxSteps): split it`);
  }
  const open = openSlices(entries).length;
  const openWas = before ? openSlices(before).length : 0;
  if (open > lim.maxSlices && open > openWas) out.push(`the roster has ${open} open slices; a packet has ${lim.maxSlices} or fewer (slices.maxPerPacket): split the packet (campaign split)`);
  if (now.steps > lim.budgetSteps && (!was || now.steps > was.steps)) out.push(`the packet comes to ${now.steps} steps; its budget is ${lim.budgetSteps} (packets.maxSteps): split the packet (campaign split)`);
  if (!out.length || !override) return out;
  const hit = (decisions ?? []).find((d) => d && d.id === String(override));
  if (hit && hit.by === 'person') return [];
  return [...out, `limit-override ${override} is not a live decision of the person`];
}
