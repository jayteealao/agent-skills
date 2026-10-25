// A slice leaves the roster: `wf.mjs slice drop` and `wf.mjs slice move`. One call changes the
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
    const next = roster.find((s) => s.slug !== slice && !['complete', 'skipped', 'dropped'].includes(String(s.status)));
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
