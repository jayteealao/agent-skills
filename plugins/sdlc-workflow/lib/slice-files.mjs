// The files that each slice of a workflow is planned to change, and what two slices share.
//
// Two slices that change the same file cannot be built at the same time, and the later one is
// planned against the code of the earlier one. A `depends-on` edge between two slices that share
// no file is an order that the files do not explain, so it needs a stated reason.
//
// The list of a slice comes from its plan (`files:` of 04-plan-<slice>.md) when the plan has one,
// else from `## Likely Files / Areas to Touch` of its slice record.
import { sectionOf } from './brief.mjs';
import { readDoc } from './records.mjs';
import { rosterOf } from './roster-edit.mjs';
import { stageFileOf } from './stage-done.mjs';

export const FILES_SECTION = 'Likely Files / Areas to Touch';

const norm = (p) => String(p ?? '').trim().replace(/^`+|`+$/g, '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');

/** The paths of a `## Likely Files / Areas to Touch` section: the text before the first `: ` of each line. */
export function sectionFiles(body) {
  const section = sectionOf(String(body ?? ''), FILES_SECTION);
  if (!section) return [];
  const out = [];
  for (const raw of section.split(/\r?\n/)) {
    const line = raw.replace(/^\s*(?:[-*+]|\d+\.)\s+/, '').trim();
    if (!line || /^unknown\b/i.test(line) || /^#/.test(line)) continue;
    const ticked = /^`([^`]+)`/.exec(line);
    const path = norm(ticked ? ticked[1] : line.split(/:\s|\s+[—–-]\s+/)[0]);
    // A path has no space; a line of prose is not an entry.
    if (path && !/\s/.test(path)) out.push(path);
  }
  return [...new Set(out)];
}

/** The planned files of one slice: { files, source: 'plan' | 'slice' | null }. */
export function sliceFiles(dir, slice) {
  const plan = readDoc(dir, stageFileOf(dir, '04-plan', slice));
  const planned = Array.isArray(plan?.frontmatter?.files) ? plan.frontmatter.files.map(norm).filter(Boolean) : [];
  if (planned.length) return { files: [...new Set(planned)], source: 'plan' };
  const listed = sectionFiles(readDoc(dir, `03-slice-${slice}.md`)?.body);
  return listed.length ? { files: listed, source: 'slice' } : { files: [], source: null };
}

/** Whether two entries name the same file: the same path, or one is a folder that holds the other. */
export function samePlace(a, b) {
  if (a === b) return true;
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  return long.startsWith(`${short}/`);
}

/** The entries of `a` that `b` also changes. */
export function sharedFiles(a, b) {
  return a.filter((x) => b.some((y) => samePlace(x, y)));
}

/** What two slices share: { a, b, known, shared }. `known` is false when one of them has no list. */
export function pairOf(dir, a, b) {
  const fa = sliceFiles(dir, a);
  const fb = sliceFiles(dir, b);
  const known = fa.files.length > 0 && fb.files.length > 0;
  return { a, b, known, shared: known ? sharedFiles(fa.files, fb.files) : [] };
}

/**
 * The order of a roster against its files: { slices, noList, sharing, unexplained }.
 * - `sharing`: each pair that shares a file, with `ordered` true when a `depends-on` path joins them;
 * - `unexplained`: each `depends-on` edge whose two slices share no file;
 * - `noList`: the slices with no file list, which no check can judge.
 */
export function orderReport(dir) {
  const roster = rosterOf(dir).filter((s) => s.status !== 'skipped' && s.status !== 'dropped');
  const files = new Map(roster.map((s) => [s.slug, sliceFiles(dir, s.slug)]));
  const deps = new Map(roster.map((s) => [s.slug, new Set(s.dependsOn ?? [])]));
  const reaches = (from, to, seen = new Set()) => {
    if (seen.has(from)) return false;
    seen.add(from);
    for (const d of deps.get(from) ?? []) if (d === to || reaches(d, to, seen)) return true;
    return false;
  };
  const sharing = [];
  const unexplained = [];
  for (let i = 0; i < roster.length; i += 1) {
    for (let j = i + 1; j < roster.length; j += 1) {
      const a = roster[i].slug;
      const b = roster[j].slug;
      const fa = files.get(a).files;
      const fb = files.get(b).files;
      if (!fa.length || !fb.length) continue;
      const shared = sharedFiles(fa, fb);
      if (shared.length) sharing.push({ a, b, shared, ordered: reaches(a, b) || reaches(b, a) });
    }
  }
  for (const s of roster) {
    for (const d of s.dependsOn ?? []) {
      const fa = files.get(s.slug)?.files ?? [];
      const fb = files.get(d)?.files ?? [];
      if (fa.length && fb.length && !sharedFiles(fa, fb).length) unexplained.push({ slice: s.slug, after: d });
    }
  }
  return {
    slices: roster.map((s) => s.slug),
    noList: roster.filter((s) => !files.get(s.slug).files.length).map((s) => s.slug),
    sharing,
    unexplained,
  };
}

/** The report as lines for a person or an agent. */
export function orderText(r) {
  const lines = [];
  for (const p of r.sharing) lines.push(`${p.a} and ${p.b} share ${p.shared.length} file(s) (${p.shared.slice(0, 3).join(', ')}${p.shared.length > 3 ? ', …' : ''}): ${p.ordered ? 'ordered by depends-on' : 'they run in roster order, one after the other'}`);
  for (const e of r.unexplained) lines.push(`${e.slice} runs after ${e.after}, and they share no file: give the reason in the slice record of ${e.slice}, or remove the edge`);
  if (r.noList.length) lines.push(`no file list: ${r.noList.join(', ')}`);
  return lines.join('\n') || 'no two slices share a file, and each depends-on edge has a shared file';
}
