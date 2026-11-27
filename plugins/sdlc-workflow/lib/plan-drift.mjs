// What changed after the plan of a slice was written: a design that the person approved again, and
// a project rule that was added. A plan answers the design and the rules of its time; a slice that
// is not built yet takes up what came later, so the implement brief names it, and the implement
// brings the plan to it before it builds.
import { readManifest } from './design-surface.mjs';
import { listVersions } from './design-versions.mjs';
import { readRules, ruleLine } from './project-rules.mjs';
import { frontmatterOfDoc } from './records.mjs';
import { workflowDir } from './records-root.mjs';

/** The time of the plan of a slice: when it was last written, or NaN when it has none. */
function planTime(root, slug, slice) {
  const fm = frontmatterOfDoc(workflowDir(root, slug), `04-plan-${slice}.md`);
  return Date.parse(String(fm?.['updated-at'] ?? fm?.['created-at'] ?? ''));
}

/** The screen keys of one slice of a workflow, from the manifest of the design surface. */
function sliceScreens(root, slug, slice) {
  try {
    const { screens = {} } = readManifest(root);
    return Object.entries(screens).filter(([, s]) => (s.slices ?? []).includes(slice) && (s.workflows ?? []).includes(slug)).map(([k]) => k);
  } catch { return []; }
}

/**
 * What came after the plan of `slice`: `{ planAt, design, rules }`, or null when the slice has no
 * plan or nothing came after it. `design` holds the approved versions after the plan and the pages
 * they changed (only those of the slice, when the slice names its screens), `rules` the project
 * rules added after the plan.
 */
export function planDrift(root, slug, slice) {
  if (!slice) return null;
  const at = planTime(root, slug, slice);
  if (!Number.isFinite(at)) return null;
  const after = (t) => Date.parse(String(t ?? '')) > at;
  let versions = [];
  try { versions = listVersions(root, slug).approved.filter((v) => after(v.at)); } catch { versions = []; }
  const mine = sliceScreens(root, slug, slice);
  const changed = [...new Set(versions.flatMap((v) => v.changed ?? []))]
    .filter((k) => !mine.length || mine.includes(k) || /\.css$/.test(k));
  const design = versions.length ? { versions: versions.map((v) => v.id), changed } : null;
  let rules = [];
  try { rules = readRules(root).filter((r) => after(r.at)); } catch { rules = []; }
  if (!design && !rules.length) return null;
  return { planAt: new Date(at).toISOString().replace(/\.\d{3}Z$/, 'Z'), design, rules };
}

/** The lines of the implement brief for a drift: what came after the plan, and what to do. */
export function planDriftLines(drift) {
  if (!drift) return [];
  const out = [];
  if (drift.design) {
    const what = drift.design.changed.length ? `; changed: ${drift.design.changed.join(', ')}` : '';
    out.push(`- The person approved the design again after this plan (${drift.design.versions.join(', ')})${what}. Build to the newest approved pages that \`design approved\` prints, and first bring the steps of the plan to them.`);
  }
  for (const r of drift.rules) out.push(`- The project rule ${ruleLine(r)} was added after this plan. Check each step of the plan against it, and change the plan where it breaks the rule, before you build.`);
  return out;
}
