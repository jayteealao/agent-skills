// Where a workflow stands, as data: the list of workflows, the status of one workflow, and the
// brief block of `status --brief`. The CLI (scripts/wf.mjs) prints these; the library
// (lib/wf-api.mjs) returns them from `wf.status.summary()`.
import { aggregateCost, readCostRows, rebookedEntries } from './cost-ledger.mjs';
import { openDeferrals } from './deferrals.mjs';
import { driveClass } from './drive-class.mjs';
import { progressOf, readDriverOutcome } from './progress.mjs';
import { INDEX_NAME, frontmatterOfDoc, listDocs } from './records.mjs';
import { limitsOf } from './limits.mjs';
import { packetSteps, rosterEntries } from './roster.mjs';
import { SLICE_STAGES, SMALL_STAGE_FILES, STAGE_FILES, stageFileOf } from './stage-done.mjs';
import { gitSteps, lastSlice, planDocOf, readSteps, whereLine, whereOf } from './steps.mjs';
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
    // One precedence everywhere: the next step of the stages first, then the readiness route.
    next: fm['next-invocation'] ?? fm['recommended-next-invocation'] ?? null,
    progress: w.workflowDir ? progressOf(w.workflowDir, w.directorySlug ?? w.slug, { now }) : null,
  };
}

/**
 * The cost of a workflow: the sum of its cost rows, or null when it has none. Rows of the old
 * hook book the same sub-agent usage again in every row; their sum is false, so a workflow with
 * such rows has no total, only a note that names the repair (the same detector as the cost
 * basis of the campaign plan).
 */
export function costSummary(dir) {
  const rows = readCostRows(dir);
  if (!rows.length) return null;
  const rebooked = rebookedEntries(rows);
  if (rebooked) {
    return {
      total: null, byKey: null, rebooked,
      note: `No cost total: ${rebooked} sub-agent entries of the cost rows book again a usage that an earlier row booked. The rows must be repaired: scripts/cost-rebuild.mjs rebuilds them from the transcripts.`,
    };
  }
  return aggregateCost(rows);
}

/**
 * The slices of the roster, each with its roster status, its depends-on, the status of each
 * stage record, the verify result and convergence, and what a driver needs to take a slice that
 * was added during its run: `uxImpact` and `complexity` of the slice record, `fresh` (no stage
 * record yet), and `carriedAt` / `planAt` (an issue carried into the slice after its plan).
 * A relaunched driver reads the build of each slice from it too: `implementAt` (the newest step or
 * implement write), and `firstStepSha` / `lastStepSha` of the newest run of its steps.
 */
export function sliceRows(dir) {
  const sliceFm = frontmatterOf(dir, '03-slice.md');
  let stepRows = [];
  try { stepRows = readSteps(dir); } catch { stepRows = []; }
  return (Array.isArray(sliceFm?.slices) ? sliceFm.slices : []).map((s) => {
    const name = typeof s === 'string' ? s : s?.slug;
    const row = { slice: name, roster: typeof s === 'string' ? null : s?.status ?? null };
    // The walk runs a slice after these. A driver reads them again between slices.
    row.dependsOn = (Array.isArray(s?.['depends-on']) ? s['depends-on'] : []).map(String);
    const fms = {};
    for (const [stage, prefix] of SLICE_STAGES) { fms[stage] = frontmatterOf(dir, stageFileOf(dir, prefix, name)); row[stage] = fms[stage]?.status ?? null; }
    // The verify result and its convergence, so a reader needs no loop over the verify records.
    const v = frontmatterOf(dir, stageFileOf(dir, '06-verify', name));
    row.result = v?.result ?? null;
    row.convergence = v?.convergence ?? null;
    const rec = frontmatterOf(dir, `03-slice-${name}.md`);
    row.uxImpact = rec?.['ux-impact'] ?? null;
    row.complexity = (typeof s === 'string' ? null : s?.complexity) ?? rec?.complexity ?? null;
    row.fresh = SLICE_STAGES.every(([stage]) => !fms[stage]) && !v;
    row.carriedAt = rec?.['carried-at'] ?? null;
    row.planAt = fms.plan?.['updated-at'] ?? null;
    Object.assign(row, buildOf(stepRows.filter((r) => r.slice === name), fms.implement));
    if (rec?.['made-for']) row.madeFor = rec['made-for'];
    return row;
  });
}

/**
 * The build of one slice from its step rows: the newest run of steps (the open run, else the run
 * that the last `complete` closed), its first and last commit, and the time of the newest write.
 */
function buildOf(rows, implementFm) {
  const ends = rows.map((r, i) => (r.event === 'complete' ? i : -1)).filter((i) => i >= 0);
  const last = ends.at(-1) ?? -1;
  const open = rows.slice(last + 1).some((r) => r.event === 'done' || r.event === 'start');
  const from = open ? last + 1 : (ends.at(-2) ?? -1) + 1;
  const to = open ? rows.length : last + 1;
  const shas = rows.slice(from, to).filter((r) => r.event === 'done' && !r.noChange && (r.sha || r.head)).map((r) => r.sha ?? r.head);
  const done = rows.filter((r) => (r.event === 'done' || r.event === 'complete') && r.at).map((r) => r.at);
  const times = [...done, implementFm?.['updated-at']].filter((t) => t && !Number.isNaN(Date.parse(t))).sort((a, b) => Date.parse(a) - Date.parse(b));
  return {
    implementAt: times.at(-1) ?? null,
    firstStepSha: shas[0] ?? null,
    lastStepSha: (!open && last >= 0 ? rows[last].sha : null) ?? shas.at(-1) ?? null,
  };
}

/** The steps of the workflow against the limits of the project: { maxSteps, maxSlices, budgetSteps, steps, open, unknown }. */
function sizeOf(root, dir) {
  const limits = limitsOf(root);
  const entries = rosterEntries(dir);
  if (!entries) return { ...limits, steps: null, open: null, unknown: [] };
  const s = packetSteps(dir, entries, limits);
  return { maxSteps: limits.maxSteps, maxSlices: limits.maxSlices, budgetSteps: limits.budgetSteps, steps: s.steps, open: entries.filter((e) => !['complete', 'deferred', 'skipped', 'dropped'].includes(String(e.status))).length, unknown: s.unknown };
}

/** The slug-wide review (its verdict and the commit it reviewed) and the issues already investigated. */
function reviewAndIssues(dir) {
  const r = frontmatterOf(dir, '07-review.md');
  let names = [];
  try { names = listDocs(dir); } catch { names = []; }
  const issueRecords = names.map((n) => /^05i-issue-(.+)\.md$/.exec(n)?.[1]).filter(Boolean).sort();
  return { review: r ? { verdict: r.verdict ?? null, reviewedHead: r['reviewed-head'] ?? null, at: r['updated-at'] ?? null, fixSteps: Number.isInteger(r['fix-steps']) ? r['fix-steps'] : null } : null, issueRecords };
}

export async function statusOf(root, slug = null, now = Date.now()) {
  const workflows = await scanWorkflowIndexes({ projectRoot: root });
  if (!slug) return { workflows: workflows.map((w) => summaryOf(w, now)) };
  const w = workflows.find((x) => x.slug === slug || x.directorySlug === slug);
  if (!w) return { error: `Workflow ${slug} not found.` };
  const dir = w.workflowDir;
  const summary = summaryOf(w, now);
  const small = summary.workflowType === 'small';
  const perSlice = Object.fromEntries(SLICE_STAGES);
  const stages = Object.entries(small ? SMALL_STAGE_FILES : STAGE_FILES).map(([stage, names]) => {
    const files = !small && perSlice[stage] && summary.selectedSlice ? [stageFileOf(dir, perSlice[stage], summary.selectedSlice)] : names(summary.selectedSlice);
    const fms = files.map((f) => frontmatterOf(dir, f));
    const at = fms.findLastIndex(Boolean);
    const fm = at < 0 ? null : fms[at];
    // A stage with a file still to write is in progress, whatever its first file says.
    const status = !fm ? null : at === files.length - 1 ? fm.status ?? null : 'in-progress';
    return { stage, file: at < 0 ? files[0] ?? null : files[at], files, present: !!fm, status, updatedAt: fm?.['updated-at'] ?? null };
  });
  const slices = sliceRows(dir);
  const current = small ? '01-small.md' : OLD_STAGE_FILE[summary.stage] ?? stages.find((x) => x.stage === summary.stage)?.file;
  const currentFm = current ? frontmatterOf(dir, current) : null;
  const out = {
    workflow: summary,
    stages,
    slices,
    ...reviewAndIssues(dir),
    // The limits of the project, and the steps that this workflow holds against them.
    size: sizeOf(root, dir),
    cost: costSummary(dir),
    // What a driver may do with the workflow: its class, the block and the route (lib/drive-class.mjs).
    drive: driveClass(dir, w.frontmatter ?? frontmatterOf(dir, INDEX_NAME)),
    // The last driver run on this machine: where it stopped, why, and how to resume.
    lastRun: lastRunOf(dir, root, summary.progress),
    next: {
      file: current ?? null,
      invocation: currentFm?.['next-invocation'] ?? summary.next,
      routes: currentFm?.['recommended-routes'] ?? [],
    },
  };
  // The folder of the workflow, for the brief: the index slug can differ from the folder name.
  // It is not part of the printed status.
  Object.defineProperty(out, 'dir', { value: dir, enumerable: false });
  return out;
}

/** The last driver run: its outcome on this machine, else the progress record of the run. */
function lastRunOf(dir, root, progress) {
  const outcome = readDriverOutcome(dir, { root });
  if (outcome) return outcome;
  return progress ? { run: progress.run ?? null, driver: progress.driver ?? null, status: progress.state ?? progress.status ?? null, reason: progress.reason ?? null, resume: progress.resume ?? null } : null;
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
  const dir = s.dir;
  const index = frontmatterOf(dir, INDEX_NAME) ?? {};
  const slice = s.workflow.selectedSlice ?? lastSlice(dir);
  let step = null;
  if (slice && planDocOf(dir, slice)) {
    const w = whereOf(dir, slice, stepGit(root, dir));
    step = { slice, done: w.done.length, total: w.total, next: w.next?.n ?? null, current: w.current?.n ?? null, complete: w.complete, line: whereLine(w) };
  }
  const questions = (Array.isArray(index['open-questions']) ? index['open-questions'] : []).map((q) => (typeof q === 'string' ? q : q?.key && q?.question ? `${q.key}: ${q.question}` : q?.key ?? q?.question ?? JSON.stringify(q)));
  const deferrals = openDeferrals(dir).map((d) => d.id ?? d.ac ?? d.slice ?? 'deferral');
  return {
    slug: s.workflow.slug,
    status: s.workflow.status,
    stage: s.workflow.stage,
    slice,
    step,
    slices: s.slices.map((x) => ({ slice: x.slice, roster: x.roster, result: x.result, convergence: x.convergence })),
    openQuestions: questions,
    openDeferrals: deferrals,
    lastRun: s.lastRun,
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


