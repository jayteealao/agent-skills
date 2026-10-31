// Where a workflow stands, as data: the list of workflows, the status of one workflow, and the
// brief block of `status --brief`. The CLI (scripts/wf.mjs) prints these; the library
// (lib/wf-api.mjs) returns them from `wf.status.summary()`.
import { join } from 'node:path';
import { aggregateCost, readCostRows } from './cost-ledger.mjs';
import { openDeferrals } from './deferrals.mjs';
import { progressOf, readDriverOutcome } from './progress.mjs';
import { INDEX_NAME, frontmatterOfDoc } from './records.mjs';
import { workflowsRoot as wfRoot } from './records-root.mjs';
import { SLICE_STAGES, SMALL_STAGE_FILES, STAGE_FILES } from './stage-done.mjs';
import { gitSteps, lastSlice, whereLine, whereOf } from './steps.mjs';
import { TERMINAL_WORKFLOW_STATUSES, scanWorkflowIndexes } from './workflow-index.mjs';

// A record by its old file name, in either layout.
const frontmatterOf = (dir, name) => frontmatterOfDoc(dir, name);

/** The git answers of the step record for a workflow: the branch of each row, its base for the patch search. */
export const stepGit = (projectRoot, dir) => gitSteps(projectRoot, { base: frontmatterOfDoc(dir, INDEX_NAME)?.['base-branch'] ?? null });

const STALE_DAYS = 7;
const DONE = new Set([...TERMINAL_WORKFLOW_STATUSES, 'shipped']);

// An index of an older workflow names a stage that is now a phase of another stage.
const OLD_STAGE_FILE = { shape: '02-shape.md', handoff: '08-handoff.md' };

export const count = (v) => (Array.isArray(v) ? v.length : v && typeof v === 'object' ? Object.keys(v).length : 0);

function groupOf(fm) {
  const status = String(fm.status ?? '');
  if (DONE.has(status)) return 'completed';
  if (status === 'awaiting-input' || count(fm['open-questions']) > 0) return 'blocked';
  return 'active';
}

function summaryOf(w, now) {
  const fm = w.frontmatter ?? {};
  const updated = Date.parse(fm['updated-at'] ?? '');
  return {
    slug: w.slug,
    title: fm.title ?? null,
    status: fm.status ?? null,
    group: w.classification === 'invalid' ? 'invalid' : groupOf(fm),
    invalid: w.invalidReason ?? null,
    stage: fm['current-stage'] ?? null,
    selectedSlice: fm['selected-slice'] ?? null,
    workflowType: fm['workflow-type'] ?? 'standard',
    branch: w.branch,
    updatedAt: fm['updated-at'] ?? null,
    stale: Number.isFinite(updated) && now - updated > STALE_DAYS * 86_400_000,
    openQuestions: count(fm['open-questions']),
    next: fm['recommended-next-invocation'] ?? fm['next-invocation'] ?? null,
    progress: w.workflowDir ? progressOf(w.workflowDir, w.directorySlug ?? w.slug, { now }) : null,
  };
}

export function costSummary(dir) {
  const rows = readCostRows(dir);
  return rows.length ? aggregateCost(rows) : null;
}

export async function statusOf(root, slug = null, now = Date.now()) {
  const workflows = await scanWorkflowIndexes({ projectRoot: root });
  if (!slug) return { workflows: workflows.map((w) => summaryOf(w, now)) };
  const w = workflows.find((x) => x.slug === slug || x.directorySlug === slug);
  if (!w) return { error: `Workflow ${slug} not found.` };
  const dir = w.workflowDir;
  const summary = summaryOf(w, now);
  const small = summary.workflowType === 'small';
  const stages = Object.entries(small ? SMALL_STAGE_FILES : STAGE_FILES).map(([stage, names]) => {
    const files = names(summary.selectedSlice);
    const fms = files.map((f) => frontmatterOf(dir, f));
    const at = fms.findLastIndex(Boolean);
    const fm = at < 0 ? null : fms[at];
    // A stage with a file still to write is in progress, whatever its first file says.
    const status = !fm ? null : at === files.length - 1 ? fm.status ?? null : 'in-progress';
    return { stage, file: at < 0 ? files[0] ?? null : files[at], files, present: !!fm, status, updatedAt: fm?.['updated-at'] ?? null };
  });
  const sliceFm = frontmatterOf(dir, '03-slice.md');
  const slices = (Array.isArray(sliceFm?.slices) ? sliceFm.slices : []).map((s) => {
    const name = typeof s === 'string' ? s : s?.slug;
    const row = { slice: name, roster: typeof s === 'string' ? null : s?.status ?? null };
    for (const [stage, prefix] of SLICE_STAGES) row[stage] = frontmatterOf(dir, `${prefix}-${name}.md`)?.status ?? null;
    // The verify result and its convergence, so a reader needs no loop over the verify records.
    const v = frontmatterOf(dir, `06-verify-${name}.md`);
    row.result = v?.result ?? null;
    row.convergence = v?.convergence ?? null;
    return row;
  });
  const current = small ? '01-small.md' : OLD_STAGE_FILE[summary.stage] ?? stages.find((x) => x.stage === summary.stage)?.file;
  const currentFm = current ? frontmatterOf(dir, current) : null;
  return {
    workflow: summary,
    stages,
    slices,
    cost: costSummary(dir),
    next: {
      file: current ?? null,
      invocation: currentFm?.['next-invocation'] ?? summary.next,
      routes: currentFm?.['recommended-routes'] ?? [],
    },
  };
}

const BRIEF_MAX = 2000;
export const clip = (s, n = 200) => (String(s).length > n ? `${String(s).slice(0, n - 1)}…` : String(s));
export const few = (list, n = 5) => `${list.slice(0, n).join(', ')}${list.length > n ? ` and ${list.length - n} more` : ''}`;

/**
 * Where a workflow stands, in one block: the stage and the slice, step n of N, the open
 * questions, the open deferrals, the last driver run on this machine, and the next command.
 * `status --brief` prints it, and `wf.status.summary()` of the library returns it.
 */
export async function statusBrief(root, slug) {
  const s = await statusOf(root, slug);
  if (s.error) return { error: s.error };
  const dir = join(wfRoot(root), s.workflow.slug);
  const index = frontmatterOf(dir, INDEX_NAME) ?? {};
  const slice = s.workflow.selectedSlice ?? lastSlice(dir);
  let step = null;
  if (slice && frontmatterOf(dir, `04-plan-${slice}.md`)) {
    const w = whereOf(dir, slice, stepGit(root, dir));
    step = { slice, done: w.done.length, total: w.total, next: w.next?.n ?? null, current: w.current?.n ?? null, complete: w.complete, line: whereLine(w) };
  }
  const questions = (Array.isArray(index['open-questions']) ? index['open-questions'] : []).map((q) => (typeof q === 'string' ? q : q?.key && q?.question ? `${q.key}: ${q.question}` : q?.key ?? q?.question ?? JSON.stringify(q)));
  const deferrals = openDeferrals(dir).map((d) => d.id ?? d.ac ?? d.slice ?? 'deferral');
  const outcome = readDriverOutcome(dir, { root });
  const progress = s.workflow.progress;
  return {
    slug: s.workflow.slug,
    status: s.workflow.status,
    stage: s.workflow.stage,
    slice,
    step,
    slices: s.slices.map((x) => ({ slice: x.slice, roster: x.roster, result: x.result, convergence: x.convergence })),
    openQuestions: questions,
    openDeferrals: deferrals,
    lastRun: outcome ?? (progress ? { run: progress.run ?? null, driver: progress.driver ?? null, status: progress.state ?? progress.status ?? null, reason: progress.reason ?? null, resume: progress.resume ?? null } : null),
    next: s.next.invocation ?? null,
  };
}

export function briefText(b) {
  if (b.error) return b.error;
  const lines = [`${b.slug}: ${b.status ?? '?'} at ${b.stage ?? '-'}${b.slice ? `, slice ${b.slice}` : ''}`];
  if (b.step) lines.push(`step: ${b.step.done} of ${b.step.total} done; ${clip(b.step.line)}`);
  if (b.slices.length) lines.push(`slices: ${few(b.slices.map((x) => `${x.slice}=${x.result ?? x.roster ?? '-'}`), 8)}`);
  if (b.openQuestions.length) lines.push(clip(`questions: ${b.openQuestions.length} open: ${few(b.openQuestions)}`));
  if (b.openDeferrals.length) lines.push(clip(`deferrals: ${b.openDeferrals.length} open: ${few(b.openDeferrals)}`));
  if (b.lastRun) lines.push(clip(`last run: ${b.lastRun.driver ?? 'run'} ${b.lastRun.run ?? ''} ${b.lastRun.status ?? ''}${b.lastRun.stoppedAt ? ` at ${b.lastRun.stoppedAt}` : ''}${b.lastRun.reason ? `: ${b.lastRun.reason}` : ''}${b.lastRun.resume ? `; resume: ${b.lastRun.resume}` : ''}`.replace(/\s+/g, ' ')));
  lines.push(clip(`next: ${b.next ?? '-'}`));
  const text = lines.join('\n');
  return text.length > BRIEF_MAX ? `${text.slice(0, BRIEF_MAX - 1)}…` : text;
}


