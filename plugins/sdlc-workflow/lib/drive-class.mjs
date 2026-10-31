// lib/drive-class.mjs — what a driver may do with a workflow, from its workflow-type and its
// records. `/wf yolo` orients on this: `wf.mjs status <root> <slug> --json` returns it as
// `drive`, so the orient agent copies the class, the block and the route, and does not derive
// them from prose.
//
// The classes:
//   build              standard / feature / adopt / docs and any unknown type: the planning
//                      half is written; the driver runs from plan onward
//   change-mode        fix / hotfix / refactor (legacy quick): one slice, un-suffixed files
//   rca                a forwarded RCA: 01-rca.md and its synthesized 02-shape.md are the intake
//   self-managed       update-deps: the driver wraps the update-deps steps, not implement/verify
//   optimize           the metric loop runs under its own driver; the driver runs verify and review
//   terminal-analysis  investigate / discover / ideate / audit / brainstorm: no decided build
//   refused            prototype / task: the person steers every round or every gate
//   small              the small path runs implement and verify inside intake
//
// The design gate is not here: a person confirms the design, and the orient step reads it.

import { frontmatterOfDoc, listDocs } from './records.mjs';
import { CHANGE_MODES, readRoster, reviewScopeOf } from './lifecycle-done.mjs';

const str = (v) => String(v ?? '').trim();

/** The workflow-types of each class that is not `build`. */
export const DRIVE_CLASSES = Object.freeze({
  'change-mode': Object.freeze([...CHANGE_MODES, 'quick']),
  rca: Object.freeze(['rca']),
  'self-managed': Object.freeze(['update-deps']),
  optimize: Object.freeze(['optimize']),
  'terminal-analysis': Object.freeze(['investigate', 'discover', 'ideate', 'audit', 'brainstorm']),
  refused: Object.freeze(['prototype', 'task']),
  small: Object.freeze(['small']),
});

/** The class of a workflow-type. */
export function classOf(type) {
  const t = str(type) || 'standard';
  for (const [cls, types] of Object.entries(DRIVE_CLASSES)) if (types.includes(t)) return cls;
  return 'build';
}

// The intake lead that a type names: 01-fix.md for a fix. Other build types use 01-intake.md.
const NAMED_LEAD = new Set([...CHANGE_MODES, 'quick', 'adopt', 'update-deps', 'rca']);

/** The route and the reason of each type that a driver never drives. `<slug>` is filled in. */
const TERMINAL = {
  investigate: ['investigate emits option sketches that nobody has picked', 'pick an option in 01-investigate.md, then /wf intake fix <option> (or /wf intake <option>); /wf yolo drives it after its intake and shape'],
  discover: ['discover emits a verdict, and its follow-up is more analysis', 'act on the verdict in 01-discover.md (/wf intake rca <symptom> if it failed; no build if it holds)'],
  ideate: ['ideate emits a ranked menu, and each idea becomes its own workflow', '/wf intake <chosen-idea>'],
  audit: ['audit emits findings, and each finding has its own route', "each finding's route in 07-review.md (## Triage Decisions)"],
  brainstorm: ['brainstorm keeps an open board that the person continues', '/wf intake brainstorm <slug> to continue, or a candidate entry command from 01-brainstorm.md once distilled'],
};
const REFUSED = {
  prototype: ['a prototype is steered by the person, one round at a time', '/wf loop prototype <slug> <request>'],
  task: ['a task resolves its blast-radius gates with the person', '/wf intake task <slug>'],
};

/** The intake lead of a build or change-mode workflow: the named file, else any 01-*.md of type intake. */
function intakeLead(dir, type) {
  const named = NAMED_LEAD.has(type) ? `01-${type}.md` : '01-intake.md';
  if (frontmatterOfDoc(dir, named)) return named;
  return listDocs(dir).find((n) => /^01-.+\.md$/.test(n) && str(frontmatterOfDoc(dir, n)?.type) === 'intake') ?? named;
}

// The recommended next step of an RCA: 01-rca.md first, then the index.
function rcaNext(dir, index) {
  const own = str(frontmatterOfDoc(dir, '01-rca.md')?.['recommended-next']);
  if (own) return own;
  const routes = index?.['recommended-routes'];
  if (Array.isArray(routes)) {
    const def = routes.find((r) => r && typeof r === 'object' && r.default === true);
    if (def) return str(def.route ?? def.invocation ?? def.command ?? def.next ?? JSON.stringify(def));
  } else if (routes && typeof routes === 'object' && routes.primary) {
    return str(typeof routes.primary === 'object' ? routes.primary.route ?? routes.primary.invocation ?? JSON.stringify(routes.primary) : routes.primary);
  }
  return str(index?.['next-invocation']);
}

const isComplete = (fm) => str(fm?.status) === 'complete';
const awaiting = (fm) => str(fm?.status) === 'awaiting-input';

/**
 * What a driver may do with one workflow. `dir` is the workflow folder; `index` its 00-index.md
 * frontmatter (read from `dir` when not given).
 *
 * @returns {{class:string, workflowType:string, drivable:boolean, blockReason:string|null,
 *   route:string|null, singleScope:boolean, fileConvention:'suffixed'|'unsuffixed',
 *   reviewScope:'per-slice'|'slug-wide', reviewDimension:string|null, intakeLead:string|null}}
 */
export function driveClass(dir, index = null) {
  const idx = index ?? frontmatterOfDoc(dir, '00-index.md');
  const slug = str(idx?.slug) || dir.split(/[\\/]/).filter(Boolean).at(-1);
  const type = str(idx?.['workflow-type']) || 'standard';
  const cls = classOf(type);
  const fill = (s) => (s == null ? null : s.replaceAll('<slug>', slug));
  const base = { class: cls, workflowType: type, drivable: false, blockReason: null, route: null, singleScope: false, fileConvention: 'unsuffixed', reviewScope: 'slug-wide', reviewDimension: null, intakeLead: null };
  const block = (blockReason, route, extra = {}) => ({ ...base, ...extra, drivable: false, blockReason, route: fill(route) });
  const drive = (extra = {}) => ({ ...base, ...extra, drivable: true });

  if (!idx) return block('the workflow has no index', '/wf intake <description>');

  if (cls === 'terminal-analysis') {
    const [why, route] = TERMINAL[type];
    // An ideate keeps the intake of the chosen idea as its own next step.
    const recorded = str(idx['next-invocation']);
    const own = type === 'ideate' && /^\/wf intake /.test(recorded) ? recorded : route;
    return block(`${type} is terminal analysis with no decided build: ${why}`, own);
  }
  if (cls === 'refused') return block(REFUSED[type][0], REFUSED[type][1]);
  if (cls === 'small') return block('the small path runs implement and verify inside intake; review and ship run by hand', '/wf intake <slug>');

  const has03 = frontmatterOfDoc(dir, '03-slice.md') !== null;
  const roster = (readRoster(dir) ?? []).map((s) => s.slug).filter(Boolean);
  const perSliceFiles = roster.some((s) => frontmatterOfDoc(dir, `03-slice-${s}.md`) || frontmatterOfDoc(dir, `04-plan-${s}.md`));

  if (cls === 'self-managed') {
    const need = ['01-update-deps.md', '02-shape.md', '03-slice.md', '04-plan.md'];
    const gaps = need.filter((n) => !isComplete(frontmatterOfDoc(dir, n)));
    const extra = { intakeLead: '01-update-deps.md' };
    if (gaps.length) {
      const route = gaps.length === 1 && gaps[0] === '04-plan.md' ? '/wf plan <slug>' : '/wf intake update-deps <slug>';
      return block(`update-deps is not ready to drive: ${gaps.join(', ')} ${gaps.length === 1 ? 'is' : 'are'} missing or not complete`, route, extra);
    }
    return drive(extra);
  }

  if (cls === 'optimize') {
    const extra = { fileConvention: 'suffixed', reviewScope: reviewScopeOf(idx, dir) };
    if (!isComplete(frontmatterOfDoc(dir, '05-implement-optimize.md'))) return block('the optimize loop has not finished', '/wf loop optimize <slug>', extra);
    return drive(extra);
  }

  if (cls === 'rca') {
    const extra = { singleScope: !has03, intakeLead: '01-rca.md', reviewScope: !has03 ? 'slug-wide' : reviewScopeOf(idx, dir) };
    const rca = frontmatterOfDoc(dir, '01-rca.md');
    const next = rcaNext(dir, idx);
    const lowHigh = str(rca?.['root-cause-confidence']) === 'low' && str(rca?.['blast-radius']) === 'high';
    if (/human-triage/.test(next) || lowHigh) {
      return block('RCA recommends human triage (low confidence + high blast radius)', 'read the record 01-rca.md of <slug> and choose the build route by hand, then /wf yolo <slug>', extra);
    }
    if (!rca) return block('the RCA record 01-rca.md is missing', '/wf intake rca <slug>', extra);
    if (!frontmatterOfDoc(dir, '02-shape.md')) return block('the RCA has no synthesized 02-shape.md', '/wf intake rca <slug>', extra);
    return drive({ ...extra, reviewDimension: /hotfix/.test(next) ? 'security' : null });
  }

  // build and change-mode
  const lead = intakeLead(dir, type);
  const changeMode = cls === 'change-mode';
  const singleScope = !has03 && Boolean(str(idx['selected-slice']));
  const suffixed = !changeMode && !singleScope && (perSliceFiles || roster.length > 1);
  const extra = {
    intakeLead: lead,
    singleScope,
    fileConvention: suffixed ? 'suffixed' : 'unsuffixed',
    reviewScope: singleScope ? 'slug-wide' : reviewScopeOf(idx, dir),
  };
  const intakeRoute = changeMode && type !== 'quick' ? `/wf intake ${type} <slug>` : changeMode ? '/wf intake fix <slug>' : '/wf intake <slug>';
  const leadFm = frontmatterOfDoc(dir, lead);
  if (!leadFm) return block(`the intake lead ${lead} is missing`, intakeRoute, extra);
  if (awaiting(leadFm)) return block(`the intake lead ${lead} is awaiting input`, intakeRoute, extra);
  const shape = frontmatterOfDoc(dir, '02-shape.md');
  if (!shape) return block('02-shape.md is missing: the shape phase of intake has not run', intakeRoute, extra);
  if (awaiting(shape)) return block('02-shape.md is awaiting input', intakeRoute, extra);
  if (!has03 && !singleScope) return block('03-slice.md is missing', '/wf slice <slug>', extra);
  if (has03 && awaiting(frontmatterOfDoc(dir, '03-slice.md'))) return block('03-slice.md is awaiting input', '/wf slice <slug>', extra);
  return drive(extra);
}
