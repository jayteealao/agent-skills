// lib/lifecycle-done.mjs — the stop rules of the lifecycle drivers as code.
//
// A driver stops before ship when every selected slice is clean: verify with
// `convergence` in {not-needed, converged} and `result: pass`, and review with
// `verdict` in {ship, ship-with-caveats} and `metric-findings-blocker == 0`
// This module is the one copy of that rule: `/wf status` and `goal.mjs check` read it.
//
// The verdict has three values:
//   met      every selected slice is clean, and the review that the scope needs is clean
//   not-met  a stage is still to run; `next` names it
//   blocked  the workflow waits for the person: a stage paused at its own gate, the
//            design is not settled, or the workflow type has no build lifecycle
//
// `judgeLifecycle` is pure: it takes the frontmatter that the caller read. The
// reader `lifecycleDone` reads the disk.

import { missingDesignFiles } from './design-surface.mjs';
import { designNeeded, designSettled } from './design-lane.mjs';
import { frontmatterOfDoc, hasDoc } from './records.mjs';
import { workflowDir } from './records-root.mjs';

/** The change modes: one slice, un-suffixed stage files. */
export const CHANGE_MODES = Object.freeze(['fix', 'hotfix', 'refactor']);

/**
 * Workflow types whose lifecycle a driver does not run: each one has its own key or
 * gate. The verdict is `blocked`, with the route.
 */
export const NOT_DRIVEN = Object.freeze({
  'update-deps': '/wf intake update-deps <slug>',
  task: '/wf intake task <slug>',
  // The small path runs implement and verify inside intake; review and ship run by hand.
  small: '/wf intake <slug>',
  audit: '/wf intake audit <slug>',
  brainstorm: '/wf intake brainstorm <slug>',
  investigate: 'the pick recorded in 01-investigate.md',
  discover: 'the verdict recorded in 01-discover.md',
  // A prototype is steered by the person, one round at a time (WF-PROTOTYPE-PLAN P4).
  prototype: '/wf loop prototype <slug> <request>, one round per request of the person',
});

export const VERIFY_CLEAN_CONVERGENCE = Object.freeze(['not-needed', 'converged']);
export const REVIEW_CLEAN_VERDICTS = Object.freeze(['ship', 'ship-with-caveats']);

const str = (v) => String(v ?? '').trim();

/** The verify gate: `clean`, `paused` (with the reason), or `open` (run verify). */
export function verifyGate(fm) {
  if (!fm) return { state: 'open', reason: 'no verify artifact' };
  if (str(fm.status) === 'awaiting-input') return { state: 'paused', reason: 'verify is awaiting input' };
  if (str(fm.convergence) === 'escalated') return { state: 'paused', reason: 'verify escalated' };
  if (str(fm.result) === 'blocked-runtime-evidence-missing') return { state: 'paused', reason: 'verify is blocked: runtime evidence is missing' };
  if (VERIFY_CLEAN_CONVERGENCE.includes(str(fm.convergence)) && str(fm.result) === 'pass') return { state: 'clean' };
  return { state: 'open', reason: `verify is not clean (convergence ${str(fm.convergence) || 'none'}, result ${str(fm.result) || 'none'})` };
}

/** The review gate: `clean`, `paused` (dont-ship or open blockers), or `open`. */
export function reviewGate(fm) {
  if (!fm) return { state: 'open', reason: 'no review artifact' };
  if (str(fm.status) === 'awaiting-input') return { state: 'paused', reason: 'review is awaiting input' };
  const blockers = Number(fm['metric-findings-blocker'] ?? 0);
  if (str(fm.verdict) === 'dont-ship') return { state: 'paused', reason: 'review verdict is dont-ship' };
  if (Number.isFinite(blockers) && blockers > 0) return { state: 'paused', reason: `review has ${blockers} open blocker(s)` };
  if (REVIEW_CLEAN_VERDICTS.includes(str(fm.verdict))) return { state: 'clean' };
  return { state: 'open', reason: `review is not clean (verdict ${str(fm.verdict) || 'none'})` };
}

/** A stage artifact that stopped at its own gate. */
const awaiting = (fm) => str(fm?.status) === 'awaiting-input';

/**
 * Judge the lifecycle of one workflow.
 *
 * @param {object} input
 * @param {object|null} input.index   00-index.md frontmatter
 * @param {Array<{slug:string,status?:string}>|null} input.roster  the 03-slice.md roster
 * @param {(name:string) => object|null} input.artifact  the frontmatter of a stage file, or null when absent
 * @param {{needed:boolean, settled:boolean}} [input.design]  the design lane, when the caller read it
 * @returns {{verdict:'met'|'not-met'|'blocked', reason:string, next:{stage:string,slice:string|null}|null, suffixed:boolean, slices:object[]}}
 */
export function judgeLifecycle({ index, roster, artifact, design = { needed: false, settled: true } }) {
  const out = (verdict, reason, next = null, extra = {}) => ({ verdict, reason, next, suffixed: false, slices: [], ...extra });
  if (!index) return out('blocked', 'no 00-index.md: start the workflow with /wf intake');
  const type = str(index['workflow-type']) || 'standard';
  if (NOT_DRIVEN[type]) return out('blocked', `workflow-type ${type} has no build lifecycle to drive: ${NOT_DRIVEN[type]}`);
  // The optimize lifecycle replaces shape and plan with the spec (WF-OPTIMIZE-PLAN section 3).
  // Its lead is 01-optimize.md, as 01-fix.md is the lead of a fix.
  const optimize = type === 'optimize';
  const intake = artifact(optimize ? '01-optimize.md' : '01-intake.md');
  if (intake && awaiting(intake)) return out('blocked', 'intake is awaiting input');
  if (optimize) {
    const spec = artifact('02-optimize-spec.md');
    if (!spec) return out('not-met', 'no metric spec yet', { stage: 'intake', slice: null });
    if (awaiting(spec) || str(spec['confirmed-by']) === '') return out('blocked', 'the metric spec waits for the person to confirm it');
  } else {
    const shape = artifact('02-shape.md');
    // Intake writes the brief, then the shape: a missing shape is intake still to finish.
    if (!shape) return out('not-met', 'the shape phase of intake has not run', { stage: 'intake', slice: null });
    if (awaiting(shape)) return out('blocked', 'the shape phase of intake is awaiting input');
    if (design.needed && !design.settled) return out('blocked', 'the design is not settled: a person confirms it with /wf design <slug>');
  }
  const slices = (roster ?? []).filter((s) => s && str(s.slug) && str(s.status) !== 'skipped' && str(s.status) !== 'dropped').map((s) => str(s.slug));
  if (!slices.length) {
    return optimize
      ? out('not-met', 'the optimize loop has not finished', { stage: 'optimize', slice: null })
      : out('not-met', 'no slice roster yet', { stage: 'slice', slice: null });
  }
  const scope = str(index['review-scope']) === 'slug-wide' ? 'slug-wide' : 'per-slice';
  // Multi-slice standard work has per-slice files; a change mode and single-scope work do not.
  const suffixed = !CHANGE_MODES.includes(type) && slices.some((s) => artifact(`03-slice-${s}.md`) !== null || artifact(`04-plan-${s}.md`) !== null);
  const file = (num, stage, s) => (suffixed ? `${num}-${stage}-${s}.md` : `${num}-${stage}.md`);
  const rows = [];
  for (const s of slices) {
    const row = { slice: s, verify: null, review: null };
    rows.push(row);
    const plan = artifact(file('04', 'plan', s));
    const impl = artifact(file('05', 'implement', s));
    if (!optimize) {
      if (!plan) return out('not-met', `slice ${s} has no plan`, { stage: 'plan', slice: s }, { suffixed, slices: rows });
      if (awaiting(plan)) return out('blocked', `the plan of slice ${s} is awaiting input`, null, { suffixed, slices: rows });
    }
    if (!impl) return out('not-met', `slice ${s} is not implemented`, { stage: optimize ? 'optimize' : 'implement', slice: s }, { suffixed, slices: rows });
    if (awaiting(impl)) return out('blocked', `the implement of slice ${s} is awaiting input`, null, { suffixed, slices: rows });
    const v = verifyGate(artifact(file('06', 'verify', s)));
    row.verify = v.state;
    if (v.state === 'paused') return out('blocked', `slice ${s}: ${v.reason}`, null, { suffixed, slices: rows });
    if (v.state === 'open') return out('not-met', `slice ${s}: ${v.reason}`, { stage: 'verify', slice: s }, { suffixed, slices: rows });
    if (scope === 'per-slice') {
      const r = reviewGate(artifact(file('07', 'review', s)));
      row.review = r.state;
      if (r.state === 'paused') return out('blocked', `slice ${s}: ${r.reason}`, null, { suffixed, slices: rows });
      if (r.state === 'open') return out('not-met', `slice ${s}: ${r.reason}`, { stage: 'review', slice: s }, { suffixed, slices: rows });
    }
  }
  if (scope === 'slug-wide') {
    const r = reviewGate(artifact('07-review.md'));
    if (r.state === 'paused') return out('blocked', `slug-wide ${r.reason}`, null, { suffixed, slices: rows });
    if (r.state === 'open') return out('not-met', `slug-wide ${r.reason}`, { stage: 'review', slice: null }, { suffixed, slices: rows });
  }
  return out('met', `every slice is clean (${slices.length}); the next step is /wf ship <slug>`, null, { suffixed, slices: rows });
}

/** The `slices:` roster of 03-slice.md, or null when the file is absent. */
export function readRoster(workflowDir) {
  const fm = frontmatterOfDoc(workflowDir, '03-slice.md');
  if (!fm) return null;
  const list = Array.isArray(fm?.slices) ? fm.slices : [];
  return list.map((s) => (typeof s === 'string' ? { slug: s } : { slug: str(s?.slug), status: str(s?.status) }));
}

/** Read the disk and judge. `root` is the project root; `slug` the workflow. */
export function lifecycleDone(root, slug) {
  const dir = workflowDir(root, slug);
  const read = (name) => frontmatterOfDoc(dir, name);
  const index = read('00-index.md');
  const contract = read('02c-craft.md');
  let design = { needed: false, settled: true };
  if (index) {
    const needed = designNeeded(index, hasDoc(dir, '02b-design.md'));
    design = { needed, settled: !needed || designSettled(index, contract, missingDesignFiles(root, dir, contract)) };
  }
  return judgeLifecycle({ index, roster: readRoster(dir), artifact: read, design });
}
