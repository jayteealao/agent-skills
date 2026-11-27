// The put of one draft with the checks that span records: a plan draft must give the step
// record steps that it can read. `wf.mjs record put` and the wf library both put through here.
import { basename } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

import { safeParseFrontmatter } from './frontmatter.mjs';
import { putDraft, readDoc } from './records.mjs';
import { limitsOf } from './limits.mjs';
import { rosterLimitProblems, syncRosterCopies } from './roster.mjs';
import { decisionsOf, liveDecisions } from './decisions.mjs';
import { planProblems, planRuleProblems, readPlan } from './steps.mjs';

const PLAN_DRAFT = /^04-plan(-[^.]+)?\.md$/;
const ROSTER_COPIES = /^(03-slice(-[^.]+)?|04-plan|00-index)\.md$/;

/** The step count of a plan draft, for its `metric-step-count`; null for any other draft or a plan with no step section. */
function planStepCountOf(path) {
  if (!PLAN_DRAFT.test(basename(path)) || !existsSync(path)) return null;
  const p = readPlan(safeParseFrontmatter(readFileSync(path, 'utf8'), { filePath: path }).content ?? '');
  return p.found ? p.steps.length : null;
}

/** The refusals of a draft that `putDraft` does not check, each naming its line; [] when none. */
export function draftProblems(path, dir = null, { root = null } = {}) {
  const name = basename(path);
  if (name === '03-slice.md' && existsSync(path)) return rosterDraftProblems(path, dir, root);
  if (!PLAN_DRAFT.test(name) || !existsSync(path)) return [];
  const text = readFileSync(path, 'utf8');
  if (safeParseFrontmatter(text, { filePath: path }).parseError) return [];
  // The whole file, so that each problem names the line of the draft.
  // A slice rule that the stored plan already breaks does not stop a new write of that plan:
  // a plan in flight keeps its shape, and only a new problem is refused.
  let stored = '';
  try { stored = dir ? (readDoc(dir, name)?.body ?? '') : ''; } catch { stored = ''; }
  const { maxSteps } = limitsOf(root);
  // The step limit holds for every write: a plan over it goes back to slice, even when the stored one was over too.
  const had = new Set(planRuleProblems(stored, { maxSteps }).map((p) => p.kind).filter((k) => k !== 'limit'));
  const rules = planRuleProblems(text, { maxSteps }).filter((p) => !had.has(p.kind)).map((p) => p.text);
  return [...planProblems(text), ...rules].map((p) => `the plan: ${p}`);
}

/** The size of a fix or a task: past it, the plan is still written, and the person sees the breach. */
export const TRIPWIRE = Object.freeze({ steps: 5, files: 3 });

/**
 * The tripwires that a plan of a fix or a task breaks: more than 5 steps, or more than 3 files to
 * touch. A warning, never a refusal (intake/_change-mode-tail.md): the plan records the breach as
 * an intent risk, and ship judges it.
 */
export function tripwireWarnings(path, dir) {
  if (!PLAN_DRAFT.test(basename(path)) || !dir || !existsSync(path)) return [];
  let type = null;
  try { type = readDoc(dir, '00-index.md')?.frontmatter?.['workflow-type'] ?? null; } catch { type = null; }
  if (!['fix', 'task'].includes(String(type))) return [];
  const parsed = safeParseFrontmatter(readFileSync(path, 'utf8'), { filePath: path });
  const steps = readPlan(parsed.content ?? '').steps.length;
  const files = Number(parsed.data?.['metric-files-to-touch']);
  const out = [];
  if (steps > TRIPWIRE.steps) out.push(`a ${type} plan has ${steps} steps, more than ${TRIPWIRE.steps}: record the breach under ## Tripwire breaches and as an intent risk`);
  if (Number.isFinite(files) && files > TRIPWIRE.files) out.push(`a ${type} plan touches ${files} files, more than ${TRIPWIRE.files}: record the breach under ## Tripwire breaches and as an intent risk`);
  return out;
}

/** The limits that a roster draft breaks (lib/roster.mjs); a draft with `limit-override` names the decision of the person that accepts it. */
function rosterDraftProblems(path, dir, root) {
  const parsed = safeParseFrontmatter(readFileSync(path, 'utf8'), { filePath: path });
  if (parsed.parseError || !Array.isArray(parsed.data?.slices)) return [];
  let stored = null;
  let decisions = [];
  try { stored = dir ? readDoc(dir, '03-slice.md')?.frontmatter?.slices ?? null : null; } catch { stored = null; }
  try { decisions = dir ? liveDecisions(decisionsOf(dir)) : []; } catch { decisions = []; }
  return rosterLimitProblems(dir, parsed.data.slices, limitsOf(root), { stored, decisions, override: parsed.data['limit-override'] ?? null }).map((p) => `the roster: ${p}`);
}

/**
 * Put one draft: the cross-record checks first, then the checks and the write of `putDraft`.
 * `root` is the project root: its config sets the limits that the checks use.
 */
export function putChecked(dir, path, { root = null } = {}) {
  const problems = draftProblems(path, dir, { root });
  if (problems.length) return { name: basename(path), file: null, section: null, errors: problems };
  const r = putDraft(dir, path, { stepCount: planStepCountOf(path) });
  if (!r.errors.length) {
    const warnings = tripwireWarnings(path, dir);
    if (warnings.length) r.warnings = warnings;
  }
  // The roster is the one stored copy of the slice facts: a put of it, of a slice record or of the
  // plan index brings the read-only copies in step (lib/roster.mjs).
  if (!r.errors.length && ROSTER_COPIES.test(basename(path))) syncRosterCopies(dir);
  return r;
}
