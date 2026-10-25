// The end of a stage in one call: `wf.mjs record stage-done <root> <slug> <stage> [<slice>]`.
// It writes `current-stage`, `progress.<stage>`, `next-command` and `next-invocation` into the
// index, sets `selected-slice`, and adds the stage files to `workflow-files`. The next route is
// the default route of the stage (below); `next` replaces it when the stage chose another one.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { INDEX_NAME, frontmatterOfDoc, setFields } from './records.mjs';

// The nine stages and the files each one writes, in order. Intake writes the brief and the
// shape; ship writes the PR package, then its runs.
export const STAGE_FILES = {
  intake: () => ['01-intake.md', '02-shape.md'],
  design: () => ['02c-craft.md'],
  slice: () => ['03-slice.md'],
  plan: (s) => (s ? [`04-plan-${s}.md`] : []),
  implement: (s) => (s ? [`05-implement-${s}.md`] : []),
  verify: (s) => (s ? [`06-verify-${s}.md`] : []),
  review: (s) => (s ? [`07-review-${s}.md`] : []),
  ship: () => ['08-handoff.md', '09-ship-runs.md'],
  retro: () => ['10-retro.md'],
};
// A small-path workflow keeps one note for intake, implement and verify.
export const SMALL_STAGE_FILES = {
  intake: () => ['01-small.md'],
  review: () => ['07-review.md'],
  ship: () => ['08-handoff.md', '09-ship-runs.md'],
};
export const SLICE_STAGES = [['plan', '04-plan'], ['implement', '05-implement'], ['verify', '06-verify'], ['review', '07-review']];
const PER_SLICE = new Set(SLICE_STAGES.map(([s]) => s));
const DESIGN_IMPACT = new Set(['visual', 'flow', 'new-surface']);
const SLICE_DONE = new Set(['complete', 'skipped', 'dropped']);

const sliceSlugs = (dir) => {
  const roster = frontmatterOfDoc(dir, '03-slice.md')?.slices;
  return (Array.isArray(roster) ? roster : [])
    .map((s) => (typeof s === 'string' ? { slug: s, status: 'defined' } : s))
    .filter((s) => s?.slug);
};

/** The first slice of the roster after `slice` (or from the start) that is not done or dropped. */
function nextOpenSlice(dir, slice = null) {
  const roster = sliceSlugs(dir);
  const from = slice ? roster.findIndex((s) => s.slug === slice) + 1 : 0;
  return [...roster.slice(from), ...roster.slice(0, from)].find((s) => s.slug !== slice && !SLICE_DONE.has(String(s.status)))?.slug ?? null;
}

/** The default route after a stage: `{ stage, slice }` of the next command, or null at the end. */
export function defaultRoute(dir, stage, slice = null) {
  const index = frontmatterOfDoc(dir, INDEX_NAME) ?? {};
  switch (stage) {
    case 'intake': {
      const design = DESIGN_IMPACT.has(String(index['ux-impact'] ?? '')) && !['complete', 'skipped'].includes(String(index.progress?.design ?? ''));
      return { stage: design ? 'design' : 'slice' };
    }
    case 'design': return { stage: 'slice' };
    case 'slice': {
      const best = frontmatterOfDoc(dir, '03-slice.md')?.['best-first-slice'];
      return { stage: 'plan', slice: best || nextOpenSlice(dir) };
    }
    case 'plan': return { stage: 'implement', slice: slice ?? frontmatterOfDoc(dir, '03-slice.md')?.['best-first-slice'] ?? nextOpenSlice(dir) };
    case 'implement': return { stage: 'verify', slice };
    case 'verify': return { stage: 'review', slice };
    case 'review': {
      const next = slice ? nextOpenSlice(dir, slice) : null;
      return next ? { stage: 'plan', slice: next } : { stage: 'ship' };
    }
    case 'ship': return { stage: 'retro' };
    default: return null;
  }
}

const invocationOf = (slug, route) => (route ? `/wf ${route.stage} ${slug}${route.slice ? ` ${route.slice}` : ''}` : 'none');

/**
 * Record the end of a stage in the index. `next` is an invocation (`/wf ship <slug>`) that
 * replaces the default route. `status` is the progress value (default `complete`; a per-slice
 * stage reads `in-progress` until each open slice of the roster has it). Returns the fields
 * that were written.
 */
export function stageDone(dir, slug, stage, slice = null, { next = null, status = null } = {}) {
  if (!Object.hasOwn(STAGE_FILES, stage)) throw new Error(`record stage-done: ${stage} is not a stage; the stages are: ${Object.keys(STAGE_FILES).join(', ')}`);
  if ((stage === 'implement' || stage === 'verify') && !slice) throw new Error(`record stage-done: ${stage} needs <slice>`);
  const index = frontmatterOfDoc(dir, INDEX_NAME);
  if (!index) throw new Error(`record stage-done: no index in ${dir}`);
  if (slice && !sliceSlugs(dir).some((s) => s.slug === slice) && frontmatterOfDoc(dir, '03-slice.md')) {
    throw new Error(`record stage-done: ${slice} is not in the roster; its slices are: ${sliceSlugs(dir).map((s) => s.slug).join(', ') || 'none'}`);
  }
  const small = index['workflow-type'] === 'small';
  const roster = sliceSlugs(dir).map((s) => s.slug);
  // A slug-wide review writes one review record for the whole packet; a plan of every slice
  // writes one plan record per slice; slice writes one record per slice besides the roster.
  const names = stage === 'review' && !slice ? ['07-review.md']
    : stage === 'plan' && !slice ? roster.map((x) => `04-plan-${x}.md`)
      : ((small ? SMALL_STAGE_FILES[stage] : null) ?? STAGE_FILES[stage])(slice);
  if (stage === 'slice') names.push(...roster.map((x) => `03-slice-${x}.md`));
  const files = names.filter((f) => frontmatterOfDoc(dir, f));
  if (stage === 'review' && existsSync(join(dir, 'findings.yaml'))) files.push('findings.yaml');
  let progress = status ?? 'complete';
  if (!status && PER_SLICE.has(stage) && slice) {
    const prefix = SLICE_STAGES.find(([s]) => s === stage)[1];
    const open = sliceSlugs(dir).filter((s) => !SLICE_DONE.has(String(s.status)) && s.slug !== slice);
    if (open.some((s) => !frontmatterOfDoc(dir, `${prefix}-${s.slug}.md`))) progress = 'in-progress';
  }
  const route = next ? null : defaultRoute(dir, stage, slice);
  const invocation = next ?? invocationOf(slug, route);
  const nextStage = next ? /^\/wf\s+(\S+)/.exec(next)?.[1] ?? null : route?.stage ?? null;
  const listed = Array.isArray(index['workflow-files']) ? index['workflow-files'] : [];
  const changes = {
    'current-stage': stage,
    [`progress.${stage}`]: progress,
    'next-command': nextStage ? `wf-${nextStage}` : 'none',
    'next-invocation': invocation,
    'workflow-files': [...listed, ...files.filter((f) => !listed.includes(f))],
    ...(slice ? { 'selected-slice': slice } : {}),
  };
  setFields(dir, INDEX_NAME, changes);
  return changes;
}
