// lib/design-lane.mjs — the design lane's human rule as code
// (skills/wf/reference/design/_lane.md; DESIGN-LANE-PLAN W-A4).
//
// A person confirms the design at the human-only `design` stage, before any
// stage a driver can run. These pure predicates decide, from frontmatter alone,
// whether a workflow needs design and whether that design is settled. The
// pre-write hook uses them to refuse a `04-plan*.md` write while a needed design
// is unsettled; the prose stages and the yolo driver state the same rule.
//
// Screens: when `02c-craft.md` names the approved screens in `screens:`, the design is
// settled only when a script recorded the approval from the answer event
// (`direction-confirmed-by: answer-event` and `approval-commit`), and every screen page
// exists on the surface. A contract from before the surface names its frozen boards in
// `boards:` instead, and every listed board file must exist. The caller reads the disk
// (lib/design-surface.mjs missingDesignFiles) and passes the missing list in.

import { needsPictures } from './design-boards.mjs';

export const UX_IMPACT_VALUES = Object.freeze(['none', 'visual', 'flow', 'new-surface']);
const NEEDS_DESIGN = new Set(['visual', 'flow', 'new-surface']);

/**
 * Does this workflow need the design stage?
 * @param {object} index  - `00-index.md` frontmatter
 * @param {boolean} hasBrief - whether `02b-design.md` exists (legacy trigger)
 */
export function designNeeded(index, hasBrief) {
  const impact = index?.['ux-impact'];
  if (impact !== undefined && impact !== null && impact !== '') {
    return NEEDS_DESIGN.has(String(impact).trim());
  }
  // A workflow from before the design lane: the brief's presence is the trigger.
  return Boolean(hasBrief);
}

/** Is `image-gate` resolved (`pass` or `skipped:<reason>` with a non-empty reason)? */
export function imageGateResolved(value) {
  const v = String(value ?? '').trim();
  if (v === 'pass') return true;
  return /^skipped:\s*\S/.test(v);
}

/**
 * Is the design reopened? `progress.design: in-progress` means the design
 * stage has not finished: an extension added surfaces, or a later stage found
 * that the confirmed design cannot be built as drawn. Step 6 of the design
 * stage sets `complete` again.
 * @param {object} index - `00-index.md` frontmatter
 */
export function designReopened(index) {
  const progress = index?.progress;
  return Boolean(progress && typeof progress === 'object' && progress.design === 'in-progress');
}

/**
 * Is the design settled?
 * @param {object} index    - `00-index.md` frontmatter
 * @param {object|null} contract - `02c-craft.md` frontmatter, or null when absent
 * @param {string[]|null} [missingBoards] - the board files that `boards:` lists but
 *   that are not on disk; null when the caller did not read the disk. A contract
 *   without `boards:` (written before the boards release) keeps the old rule.
 */
export function designSettled(index, contract, missingBoards = null) {
  if (designReopened(index)) return false;
  const progress = index?.progress;
  if (progress && typeof progress === 'object' && progress.design === 'skipped'
      && String(index?.['design-skip-reason'] ?? '').trim()) {
    return true;
  }
  if (!contract) return false;
  if (!imageGateResolved(contract['image-gate'])) return false;
  if (String(contract['direction-confirmed-by'] ?? '').trim() === '') return false;
  if (namesScreens(contract) && !approvedByAnswer(contract)) return false;
  return !boardsMissing(index, contract, missingBoards);
}

/** Does the contract name approved screens (`screens:`)? */
export function namesScreens(contract) {
  return Array.isArray(contract?.screens) && contract.screens.length > 0;
}

/**
 * Did a script record the approval from the answer event of the person? A contract that
 * `wf.mjs design migrate` moved from confirmed boards (`migrated`, with `migrated-from`) counts.
 */
export function approvedByAnswer(contract) {
  const by = String(contract?.['direction-confirmed-by'] ?? '').trim();
  const from = by === 'answer-event' || (by === 'migrated' && String(contract?.['migrated-from'] ?? '').trim() !== '');
  return from && String(contract?.['approval-commit'] ?? '').trim() !== '';
}

/** True when a screen page or a board file that the contract names is missing. */
export function boardsMissing(index, contract, missingBoards) {
  if (namesScreens(contract)) return Array.isArray(missingBoards) && missingBoards.length > 0;
  if (!String(contract?.boards ?? '').trim()) return false;
  if (!needsPictures(index)) return false;
  return Array.isArray(missingBoards) && missingBoards.length > 0;
}

/** Is `storageRel` (path inside `.ai/workflows/<slug>/`) a top-level plan file? */
export function isPlanArtifact(storageRel) {
  return /^04-plan(?:-[^/]+)?\.md$/.test(String(storageRel ?? ''));
}

/** The slice a per-slice plan file names (`04-plan-<slice>.md`), or null for `04-plan.md`. */
export function planSliceOf(storageRel) {
  const m = /^04-plan-([^/]+)\.md$/.exec(String(storageRel ?? ''));
  return m ? m[1] : null;
}

/**
 * Does this slice declare that it changes nothing a person sees? Only an
 * explicit `ux-impact: none` in `03-slice-<slice>.md` counts. A slice without
 * the field (one from before the per-slice value) keeps the slug rule.
 * @param {object|null} slice - `03-slice-<slice>.md` frontmatter, or null
 */
export function sliceHasNoUx(slice) {
  return String(slice?.['ux-impact'] ?? '').trim() === 'none';
}

/**
 * The refusal message for a plan write, or null when the write may proceed.
 * @param {{index: object|null, hasBrief: boolean, contract: object|null, slug: string, slice?: object|null, sliceSlug?: string|null, missingBoards?: string[]|null}} args
 */
export function designGateRefusal({ index, hasBrief, contract, slug, slice = null, sliceSlug = null, missingBoards = null }) {
  if (!index) return null;
  if (!designNeeded(index, hasBrief)) return null;
  if (sliceHasNoUx(slice)) return null;
  if (designSettled(index, contract, missingBoards)) return null;
  const reopened = designReopened(index) && contract;
  const shown = (missingBoards ?? []).slice(0, 5).join(', ');
  const more = (missingBoards?.length ?? 0) > 5 ? ` and ${missingBoards.length - 5} more` : '';
  const why = reopened
    ? 'the design is reopened (progress.design: in-progress)'
    : !contract
      ? '02c-craft.md is missing'
      : boardsMissing(index, contract, missingBoards)
        ? namesScreens(contract)
          ? `the approved screens are not on the design surface: ${shown}${more}`
          : `the confirmed boards of this older contract are not on disk: ${shown}${more}. Run the board check (design-boards check ${slug}), or wf.mjs design migrate`
        : namesScreens(contract) && !approvedByAnswer(contract)
          ? '02c-craft.md names screens, but no approval is recorded from the answer of the person (wf.mjs design approve)'
          : '02c-craft.md exists but carries no resolved image-gate or no direction-confirmed-by';
  const route = reopened ? `/wf design ${slug} amend` : `/wf design ${slug}`;
  const sliceHint = sliceSlug
    ? ` When slice '${sliceSlug}' changes nothing a person sees, set \`ux-impact: none\` in 03-slice-${sliceSlug}.md instead.`
    : '';
  return `Design is needed for '${slug}' (ux-impact: ${index['ux-impact'] ?? 'unset; 02b-design.md exists'}) but not settled: ${why}. A person confirms the design before planning. Run ${route}.${sliceHint}`;
}
