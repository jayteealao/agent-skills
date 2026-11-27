// The fields of a record that are worked out from the same record: every write fills them, so a
// value written by hand never stays. The records keep them for their readers (the views, the
// agents, the schema); no writer has to keep them in step.
//
//   03-slice.md          total-slices      the slices of the roster that are not dropped
//                        best-first-slice  the stored value while it names an open slice, else
//                                          the first open slice whose open dependencies are none
//   04-plan*.md          metric-step-count the numbered steps of the plan body (given by the caller)
//   any record with revisions[] and revision-count:
//                        revision-count    the entries of revisions[]; it never goes down, since
//                                          it names the history snapshots: a count that was ahead
//                                          of its ledger moves up by the entries that a write adds
//
// No import of the record layer: records.mjs calls this on every write.

const DONE = new Set(['complete', 'deferred', 'skipped', 'dropped']);
const PLAN = /^04-plan(-[^.]+)?\.md$/;

const entryOf = (s) => (typeof s === 'string' ? { slug: s, status: 'defined' } : s && typeof s === 'object' ? s : null);

/** The best first slice of roster entries; null when no slice is open. */
export function bestFirstOf(slices, stored = null) {
  const entries = (Array.isArray(slices) ? slices : []).map(entryOf).filter((e) => e && e.slug);
  const open = entries.filter((e) => !DONE.has(String(e.status ?? 'defined')));
  if (stored && open.some((e) => e.slug === String(stored))) return String(stored);
  const openNames = new Set(open.map((e) => e.slug));
  const ready = open.find((e) => (Array.isArray(e['depends-on']) ? e['depends-on'] : []).every((d) => String(d) === e.slug || !openNames.has(String(d))));
  return (ready ?? open[0])?.slug ?? null;
}

/**
 * The frontmatter `fm` of the record `name` with its derived fields filled. `stepCount` is the
 * step count of a plan body, when the caller read it; without it, a plan keeps its count.
 * `prior` is the frontmatter that the record holds before this write.
 */
export function deriveFields(name, fm, { stepCount = null, prior = null } = {}) {
  if (!fm || typeof fm !== 'object') return fm;
  const out = { ...fm };
  if (Array.isArray(out.revisions) && (Object.hasOwn(out, 'revision-count') || PLAN.test(name))) {
    const n = out.revisions.length;
    const was = Number.isInteger(prior?.['revision-count']) ? prior['revision-count'] : null;
    const had = Array.isArray(prior?.revisions) ? prior.revisions.length : null;
    out['revision-count'] = was !== null && had !== null ? Math.max(n, was + Math.max(0, n - had)) : Math.max(n, Number.isInteger(fm['revision-count']) && prior ? fm['revision-count'] : n);
  }
  if (name === '03-slice.md' && Array.isArray(out.slices)) {
    out['total-slices'] = out.slices.map(entryOf).filter((e) => e && e.slug && String(e.status) !== 'dropped').length;
    const best = bestFirstOf(out.slices, out['best-first-slice'] ?? null);
    if (best) out['best-first-slice'] = best;
    else if (Object.hasOwn(out, 'best-first-slice')) out['best-first-slice'] = String(out['best-first-slice'] ?? '');
  }
  if (PLAN.test(name) && Number.isInteger(stepCount)) out['metric-step-count'] = stepCount;
  return out;
}
