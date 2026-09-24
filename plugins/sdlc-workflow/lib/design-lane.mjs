// lib/design-lane.mjs — the design lane's human rule as code
// (skills/wf/reference/design/_lane.md; DESIGN-LANE-PLAN W-A4).
//
// A person confirms the design at the human-only `design` stage, before any
// stage a driver can run. These pure predicates decide, from frontmatter alone,
// whether a workflow needs design and whether that design is settled. The
// pre-write hook uses them to refuse a `04-plan*.md` write while a needed design
// is unsettled; the prose stages and the yolo driver state the same rule.

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
 */
export function designSettled(index, contract) {
  if (designReopened(index)) return false;
  const progress = index?.progress;
  if (progress && typeof progress === 'object' && progress.design === 'skipped'
      && String(index?.['design-skip-reason'] ?? '').trim()) {
    return true;
  }
  if (!contract) return false;
  return imageGateResolved(contract['image-gate'])
    && String(contract['direction-confirmed-by'] ?? '').trim() !== '';
}

/** Is `storageRel` (path inside `.ai/workflows/<slug>/`) a top-level plan file? */
export function isPlanArtifact(storageRel) {
  return /^04-plan(?:-[^/]+)?\.md$/.test(String(storageRel ?? ''));
}

/**
 * The refusal message for a plan write, or null when the write may proceed.
 * @param {{index: object|null, hasBrief: boolean, contract: object|null, slug: string}} args
 */
export function designGateRefusal({ index, hasBrief, contract, slug }) {
  if (!index) return null;
  if (!designNeeded(index, hasBrief)) return null;
  if (designSettled(index, contract)) return null;
  const reopened = designReopened(index) && contract;
  const why = reopened
    ? 'the design is reopened (progress.design: in-progress)'
    : contract
      ? '02c-craft.md exists but carries no resolved image-gate or no direction-confirmed-by'
      : '02c-craft.md is missing';
  const route = reopened ? `/wf design ${slug} amend` : `/wf design ${slug}`;
  return `Design is needed for '${slug}' (ux-impact: ${index['ux-impact'] ?? 'unset; 02b-design.md exists'}) but not settled: ${why}. A person confirms the design before planning. Run ${route}. (Opt out: hooks.designDirectionGate: false.)`;
}
