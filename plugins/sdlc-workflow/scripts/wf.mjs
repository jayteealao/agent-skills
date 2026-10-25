#!/usr/bin/env node
/**
 * scripts/wf.mjs — the deterministic parts of /wf, in code. skills/wf/scripts/wf.mjs runs it.
 *
 *   dispatch <root> [--host claude|codex|pi] [--json] [--] <token>...
 *             Step 0 of SKILL.md: the key, the reference and where the key's arguments start.
 *             Pass a token that does not match ^[A-Za-z0-9#._/-]+$ as @.
 *   status   <root> [<slug>] [--json]
 *             every workflow with its group and next command; with a slug, its stage files,
 *             slices, cost and next routes
 *   index    <root> [--check]
 *             rebuild .ai/workflows/INDEX.md from the 00-index.md files
 *   cost     <root> <slug> [--json]
 *             the sums of the slug's cost.jsonl per key
 *   stamp    <type> [--slug s] [--slice x]
 *             the frontmatter template of an artifact type, with every required field
 *   decide   add <root> <slug> --answer a [--key k] [--question q] [--kind k] [--by b]
 *                [--packet p] [--slice s] [--files f,g] [--stage s] [--rewrote f,g] [--json]
 *             record a decision; a live entry with the same key and scope is superseded, and
 *             each record that names it gets superseded-decisions.<old id>: <new id>
 *   decide   list <root> <slug> [--packet p] [--slice s] [--files f,g] [--by b] [--kind k] [--all] [--json]
 *             the live entries in a scope (--all: every entry)
 *   decide   answered <root> <slug> --key k [--packet p] [--slice s] [--files f,g] [--json]
 *             exit 0 and the entry when a live entry answers the key, exit 1 when none does
 *   decide   drop <root> <slug> <questions.json> [--packet p] [--slice s] [--json]
 *             split a list of questions ({key, ...}) into the ones to ask and the answered ones
 *   decide   import <root> <slug>
 *             copy po-answers.md and steer.md into the store; a second run adds nothing
 *   step     start <root> <slug> <slice> <n> [--title t]
 *   step     done <root> <slug> <slice> <n> [--sha s|HEAD]
 *   step     stop|retry <root> <slug> <slice> [--reason r]
 *   step     complete <root> <slug> <slice> [--sha s|HEAD]
 *             record a plan step in steps.jsonl
 *   step     where <root> <slug> [<slice>] [--json]
 *             the done steps of the slice, the step that runs, the next open step, the hard-stops
 *   profile  show <root> [--json]
 *             the suites of the test profile with their commands and times
 *   profile  set <root> <suite> --command c --estimate seconds
 *             the command of a suite and the estimate of intake, with no run
 *   profile  record <root> <suite> <seconds>
 *             a real run of a suite: its time replaces the estimate
 *   profile  timebox <root> <stage> [--work seconds] [--json]
 *             the time box of a stage agent, from the suites that the stage runs
 *   progress set <root> <slug> [--stage s] [--slice x] [--status running|waiting|stopped|done]
 *                [--run id] [--driver d] [--reason r] [--resume cmd]
 *             write progress.json: where a run stands
 *   progress show <root> <slug> [--json]
 *             where the run stands, a dead run as stopped, with the ETA of the slice
 *   defer    check <root> <slug> [--next <slice>] [--json]
 *             run the clearing-probe of each open deferral; exit 1 when the next slice needs
 *             an open deferral now (a person task)
 *   brief    <root> <slug> <stage> [<slice>] [--json]
 *             the brief of a stage agent: the stage card, the slice and its acceptance criteria,
 *             the plan sections of the stage, and the live decisions in scope
 *   findings add <root> <slug> <found.json> [--source review|audit|pr-bot] [--slice x]
 *                [--dimensions a,b] [--run id] [--json]
 *             merge the findings of one run into findings.yaml by the merge law
 *   findings list <root> <slug> [--source s] [--slice x] [--open] [--json]
 *             the entries of the ledger (--open: open, deferred and could-not-fix only)
 *   findings set <root> <slug> <id> <status> [--reason r]
 *             the triage status of one entry
 *   findings table|metrics <root> <slug> [--source s] [--slice x] [--json]
 *             the verdict and the findings table, or the metric fields, of a review file
 *             (the source defaults to review, the scope to the whole packet)
 *   findings questions <root> <slug> [--json]
 *             the open findings whose fix changes an acceptance check, as questions
 *   record   put <root> <slug> [<draft>...] [--json]
 *             check each draft (.draft/<old name>.md, or every draft) and write it into its
 *             section of the record files; a draft with errors stays, and exit 1
 *   record   get <root> <slug> <name|index> [--json]
 *             one record, by its old file name, as Markdown with frontmatter (either layout)
 *   record   set <root> <slug> <name|index> <key=value>...
 *             merge fields into one record; a value reads as YAML, null deletes the field
 *   record   list|where|migrate <root> <slug> [<old path>]
 *             the records of a workflow; the new place of an old path; move a workflow of
 *             the old layout into the record files, with redirects.yaml
 *   record   evidence <root> <slug> [--check] [--json]
 *             the size of the evidence; delete the oldest runs over the 200 MB cap (put does
 *             this too), never the newest run (--check: say what it would delete)
 *   drive    <root> <slug> [<slice>] [--answered <file.json>] [--delegate] [--resume <run>]
 *            [--time-box <minutes>] [--json]
 *             run the yolo driver under Node, each agent as one `codex exec` call; prints the
 *             outcome, and keeps the run's records in .scratch/wf/drive/<run>/
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildBrief } from '../lib/brief.mjs';
import { driveScript, readRun } from '../lib/drive.mjs';
import { aggregateCost, readCostRows } from '../lib/cost-ledger.mjs';
import { addDecision, answeredBy, decisionLine, decisionsOf, dropAnswered, importLegacy, liveDecisions } from '../lib/decisions.mjs';
import { SAFE_TOKEN, UNSAFE, diskFacts, dispatch, dispatchLine } from '../lib/dispatch.mjs';
import { checkDeferrals, deferralLine } from '../lib/deferrals.mjs';
import { OPEN_STATUSES, findingsTable, mergeRun, metricsOf, questionsOf, readLedger, setStatus, verdictOf, writeLedger } from '../lib/findings.mjs';
import { progressLine, progressOf, writeProgress } from '../lib/progress.mjs';
import { pruneEvidence } from '../lib/evidence.mjs';
import { DRAFT_DIR, INDEX_NAME, draftPath, draftsOf, frontmatterOfDoc, listDocs, markSuperseded, migrateWorkflow, putDraft, readDoc, redirectOf, setFields } from '../lib/records.mjs';
import { parse as parseYaml, stringify as stringifyYaml } from '../lib/yaml.mjs';
import { appendStep, gitIsAncestor, gitRevParse, lastSlice, whereLine, whereOf } from '../lib/steps.mjs';
import { STAGE_SUITES, profileLines, readProfile, recordRun, setSuite, timeBox } from '../lib/test-profile.mjs';
import { loadRegistry, reservedWords } from '../lib/registry.mjs';
import { TERMINAL_WORKFLOW_STATUSES, scanWorkflowIndexes } from '../lib/workflow-index.mjs';
import { stageYoloDriver } from './stage-yolo-driver.mjs';
import { workflowDir, workflowsRoot } from '../lib/records-root.mjs';

// scripts/ sits one level under the plugin root.
const PLUGIN_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const USAGE = 'Usage: wf.mjs <dispatch|status|index|cost|stamp|decide|step|progress|profile|defer|brief|findings|record|drive> ...';
const REFERENCE_ROOT = join(PLUGIN_ROOT, 'skills', 'wf', 'reference');
const STALE_DAYS = 7;
const DONE = new Set([...TERMINAL_WORKFLOW_STATUSES, 'shipped']);

const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const wfRoot = workflowsRoot;
const out = (v) => process.stdout.write(`${typeof v === 'string' ? v : JSON.stringify(v, null, 2)}\n`);

function flags(argv) {
  const pos = [];
  const opt = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--') { pos.push(...argv.slice(i + 1)); break; }
    if (a.startsWith('--')) {
      const name = a.slice(2);
      if (['json', 'check', 'all', 'open', 'delegate'].includes(name)) opt[name] = true;
      else opt[name] = argv[(i += 1)];
    } else pos.push(a);
  }
  return { pos, opt };
}

// ---------------------------------------------------------------- drive

/** The yolo driver on Codex: the script runs here, and each agent runs as `codex exec`. */
async function runDrive(pos, opt) {
  const [root, slug, slice] = pos;
  if (!root || !slug) throw new Error('drive: <root> <slug> are required');
  const projectRoot = resolve(root);
  const staged = stageYoloDriver(projectRoot);
  const answered = opt.answered ? JSON.parse(readFileSync(resolve(opt.answered), 'utf8')) : null;
  if (answered && !Array.isArray(answered)) throw new Error('drive: --answered must name a JSON array of answers');
  const run = opt.resume || `${nowIso().replace(/[-:]/g, '')}-${slug}`;
  const runDir = join(projectRoot, '.scratch', 'wf', 'drive', run);
  if (opt.resume && !existsSync(runDir)) throw new Error(`drive: no earlier run ${run} in .scratch/wf/drive/`);
  const args = {
    projectRoot, referenceRoot: REFERENCE_ROOT, slug, host: 'codex', models: staged.models,
    ...(slice ? { slice } : {}), ...(answered ? { answered } : {}), ...(opt.delegate ? { delegate: true } : {}),
  };
  const r = await driveScript({
    source: readFileSync(staged.scriptPath, 'utf8'), args, cwd: projectRoot, runDir,
    resume: opt.resume ? readRun(runDir) : undefined,
    timeoutMs: opt['time-box'] ? Number(opt['time-box']) * 60_000 : undefined,
    say: (line) => process.stderr.write(`[drive ${run}] ${line}\n`),
  });
  out(opt.json ? { run, runDir, ...r } : { run, outcome: r.result, agents: r.totals.agents, failed: r.totals.failed, usage: r.totals.usage });
  return r.result && r.result.ok ? 0 : 3;
}

// ---------------------------------------------------------------- dispatch

function runDispatch(pos, opt) {
  const [root, ...tokens] = pos;
  if (!root) throw new Error('dispatch: <root> is required');
  const safe = tokens.map((t) => (t === UNSAFE || SAFE_TOKEN.test(t) ? t : UNSAFE));
  const r = dispatch(loadRegistry(PLUGIN_ROOT), safe, diskFacts(resolve(root)), { host: opt.host ?? null });
  if (opt.json) { out({ ...r, line: dispatchLine(r, safe) }); return 0; }
  const lines = [dispatchLine(r, safe)];
  if (r.reason) lines.push(`reason: ${r.reason}`);
  if (r.firstInput) lines.push(`first-input: ${r.firstInput}`);
  if (r.hostNote) lines.push(`host-note: ${r.hostNote}`);
  if (r.aliasOf) lines.push(`alias-of: ${r.aliasOf}`);
  for (const s of r.subkeys ?? []) lines.push(`sub-key: ${r.key} ${s.name} → ${s.reference}`);
  out(lines.join('\n'));
  return 0;
}

// ---------------------------------------------------------------- status

// The nine stages and the files each one writes, in order. Intake writes the brief and the
// shape; ship writes the PR package, then its runs.
const STAGE_FILES = {
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
const SMALL_STAGE_FILES = {
  intake: () => ['01-small.md'],
  review: () => ['07-review.md'],
  ship: () => ['08-handoff.md', '09-ship-runs.md'],
};
// An index of an older workflow names a stage that is now a phase of another stage.
const OLD_STAGE_FILE = { shape: '02-shape.md', handoff: '08-handoff.md' };
const SLICE_STAGES = [['plan', '04-plan'], ['implement', '05-implement'], ['verify', '06-verify'], ['review', '07-review']];

// A record by its old file name, in either layout.
const frontmatterOf = (dir, name) => frontmatterOfDoc(dir, name);

const count = (v) => (Array.isArray(v) ? v.length : v && typeof v === 'object' ? Object.keys(v).length : 0);

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

function costSummary(dir) {
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
    const row = { slice: name };
    for (const [stage, prefix] of SLICE_STAGES) row[stage] = frontmatterOf(dir, `${prefix}-${name}.md`)?.status ?? null;
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

function statusText(s) {
  if (s.error) return s.error;
  if (s.workflows) {
    if (!s.workflows.length) return 'No workflows found. Start one with `/wf intake <description>`.';
    const rows = s.workflows.map((w) => [w.slug, w.group, `${w.status ?? '?'}${w.stale ? ' (stale)' : ''}`, w.stage ?? '-', w.next ?? '-'].join('\t'));
    const runs = s.workflows.filter((w) => w.progress && w.progress.state !== 'done').map((w) => `${w.slug}: ${progressLine(w.progress)}`);
    return ['slug\tgroup\tstatus\tstage\tnext', ...rows, ...(runs.length ? ['', ...runs] : [])].join('\n');
  }
  const lines = [`${s.workflow.slug}: ${s.workflow.status} at ${s.workflow.stage ?? '-'}`];
  if (s.workflow.progress) lines.push(`run: ${progressLine(s.workflow.progress)}`);
  for (const st of s.stages) if (st.present) lines.push(`  ${st.file}\t${st.status ?? '-'}`);
  for (const sl of s.slices) lines.push(`  slice ${sl.slice}\t${SLICE_STAGES.map(([k]) => `${k}=${sl[k] ?? '-'}`).join(' ')}`);
  lines.push(`next: ${s.next.invocation ?? '-'}`);
  return lines.join('\n');
}

// ---------------------------------------------------------------- index

export const INDEX_HEADER = '# .ai/workflows/INDEX.md — global workflow registry. Reconciled by /wf status (bootstrap+refresh) and additively touched by slug-mode compressed-slice writes from /wf intake/probe/simplify (updated-at only) and by /wf intake (append self if absent). Columns: slug<TAB>status<TAB>workflow-type<TAB>branch<TAB>updated-at. Sorted alphabetically by slug. Closed workflows are retained.';

const rowOf = (fm, slug) => [slug, fm.status ?? '', fm['workflow-type'] ?? 'standard', fm.branch ?? '', fm['updated-at'] ?? ''].join('\t');

function parseIndex(text) {
  const rows = new Map();
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim() || line.startsWith('#')) continue;
    rows.set(line.split('\t')[0], line);
  }
  return rows;
}

/** The worktree checkout of each local branch: a prototype's workflow lives in its worktree. */
function worktreesByBranch(root) {
  const r = spawnSync('git', ['worktree', 'list', '--porcelain'], { cwd: root, encoding: 'utf8' });
  const map = new Map();
  if (r.status !== 0) return map;
  let path = null;
  for (const line of r.stdout.split(/\r?\n/)) {
    if (line.startsWith('worktree ')) path = line.slice(9);
    else if (line.startsWith('branch refs/heads/') && path) map.set(line.slice(18), path);
  }
  return map;
}

/** Rebuild INDEX.md. Pure apart from its reads; `write` writes the file when it changed. */
export async function reconcileIndex(root, { write = true } = {}) {
  const file = join(wfRoot(root), 'INDEX.md');
  const existed = existsSync(file);
  const before = existed ? readFileSync(file, 'utf8') : '';
  const old = parseIndex(before);
  const rows = new Map();
  const reserved = reservedWords(loadRegistry(PLUGIN_ROOT));
  const invalid = [];
  for (const w of await scanWorkflowIndexes({ projectRoot: root })) {
    if (w.classification !== 'invalid') { rows.set(w.directorySlug, rowOf(w.frontmatter, w.directorySlug)); continue; }
    // A folder whose 00-index.md does not parse keeps the row it had: only a missing folder loses its row.
    invalid.push({ slug: w.directorySlug, reason: w.invalidReason });
    if (old.has(w.directorySlug)) rows.set(w.directorySlug, old.get(w.directorySlug));
  }
  // A prototype row stays while its branch has a worktree that holds the workflow.
  const trees = worktreesByBranch(root);
  for (const [slug, line] of old) {
    if (rows.has(slug)) continue;
    const [, , type, branch] = line.split('\t');
    const tree = type === 'prototype' && branch ? trees.get(branch) : null;
    const fm = tree ? frontmatterOf(workflowDir(tree, slug), INDEX_NAME) : null;
    if (fm) rows.set(slug, rowOf(fm, slug));
  }
  const sorted = [...rows.keys()].sort((a, b) => a.localeCompare(b));
  const text = `${[INDEX_HEADER, ...sorted.map((s) => rows.get(s))].join('\n')}\n`;
  const added = sorted.filter((s) => !old.has(s));
  const removed = [...old.keys()].filter((s) => !rows.has(s));
  const updated = sorted.filter((s) => old.has(s) && old.get(s) !== rows.get(s));
  const changed = text !== before.replace(/\r\n/g, '\n');
  if (write && changed && (rows.size || existed)) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  return {
    bootstrapped: !existed && rows.size > 0, changed, count: rows.size, added, removed, updated, invalid,
    reserved: sorted.filter((s) => reserved.has(s)),
  };
}

function indexText(r) {
  const lines = [];
  if (r.bootstrapped) lines.push(`Bootstrapped .ai/workflows/INDEX.md with ${r.count} workflows.`);
  else if (r.changed) lines.push(`Reconciled INDEX.md: ${r.added.length} added, ${r.removed.length} removed, ${r.updated.length} updated.`);
  for (const s of r.removed) lines.push(`Removed stale row: ${s} (directory missing).`);
  for (const w of r.invalid) lines.push(`Workflow ${w.slug} has an unreadable 00-index.md (${w.reason}); its row is kept as it was.`);
  for (const s of r.reserved) lines.push(`Slug ${s} is a /wf command word, so a /wf form that names it as a command does not reach it.`);
  return lines.join('\n') || 'INDEX.md is in sync.';
}

// ---------------------------------------------------------------- cost

function costText(agg) {
  if (!agg) return 'No cost ledger.';
  const head = 'key\tturns\tsubagents\tinput\toutput\tcache-read\tcache-write\texternal-in\texternal-out';
  const line = (k, a) => [k, a.turns, a.subagents, a.input, a.output, a.cacheRead, a.cacheWrite, a.externalInput, a.externalOutput].join('\t');
  return [head, ...Object.entries(agg.byKey).map(([k, a]) => line(k, a)), line('total', agg.total)].join('\n');
}

// ---------------------------------------------------------------- stamp

function schemaOf() {
  return JSON.parse(readFileSync(join(PLUGIN_ROOT, 'schemas', 'frontmatter.schema.json'), 'utf8'));
}

function resolveRef(schema, node) {
  let n = node;
  while (n?.$ref) n = schema.$defs[n.$ref.split('/').pop()];
  return n ?? {};
}

/** The definition whose `type` property accepts the given artifact type. */
export function defOfType(schema, type) {
  for (const branch of (schema.allOf ?? []).flatMap((a) => a.oneOf ?? [])) {
    const def = resolveRef(schema, branch);
    const t = def.properties?.type;
    if (t?.const === type || t?.enum?.includes(type)) return def;
  }
  return null;
}

const yamlScalar = (v) => (typeof v === 'string' ? (v === '' || /[:#\-[\]{},&*!|>'"%@`]|^\s|\s$|^(true|false|null|\d)/.test(v) ? JSON.stringify(v) : v) : JSON.stringify(v));

export function stampOf(type, { slug = '<slug>', slice = null, now = nowIso() } = {}) {
  const schema = schemaOf();
  const def = defOfType(schema, type);
  if (!def) throw new Error(`stamp: no artifact type ${type} in the schema`);
  const lines = ['---'];
  for (const key of def.required ?? []) {
    const p = resolveRef(schema, def.properties?.[key] ?? {});
    const ptype = Array.isArray(p.type) ? p.type[0] : p.type;
    let value;
    let note = '';
    if (key === 'schema') value = 'sdlc/v1';
    else if (key === 'type') value = type;
    else if (key === 'slug') value = slug;
    else if ((key === 'slice-slug' || key === 'slice') && slice) value = slice;
    else if (/-at$/.test(key)) value = now;
    else if (p.const !== undefined) value = p.const;
    else if (p.enum) { value = p.enum[0]; note = `  # one of: ${p.enum.join(' | ')}`; }
    else if (ptype === 'array') value = [];
    else if (ptype === 'integer' || ptype === 'number') value = 0;
    else if (ptype === 'boolean') value = false;
    else if (ptype === 'object') value = {};
    else value = '';
    const text = Array.isArray(value) ? '[]' : value && typeof value === 'object' ? '{}' : yamlScalar(value);
    lines.push(`${key}: ${text}${note}`);
  }
  lines.push('---');
  return lines.join('\n');
}

// ---------------------------------------------------------------- decide

const scopeOf = (opt) => ({ packet: opt.packet, slice: opt.slice, files: opt.files });

export function runDecide(pos, opt) {
  const [verb, root, slug, arg] = pos;
  if (!verb || !root || !slug) throw new Error('decide: <add|list|answered|drop|import> <root> <slug> are required');
  const dir = join(wfRoot(resolve(root)), slug);
  if (!existsSync(dir)) throw new Error(`decide: no workflow folder ${dir}`);
  switch (verb) {
    case 'add': {
      const r = addDecision(dir, {
        kind: opt.kind, key: opt.key, question: opt.question, answer: opt.answer, by: opt.by,
        scope: scopeOf(opt), stage: opt.stage, source: opt.source,
        rewrote: opt.rewrote ? String(opt.rewrote).split(',').map((s) => s.trim()).filter(Boolean) : [],
      });
      // Each record that names a superseded entry gets a marker that names the new one.
      const marked = markSuperseded(dir, r.superseded, r.entry.id);
      out(opt.json ? { ...r, marked } : [decisionLine(r.entry), ...r.superseded.map((id) => `supersedes ${id}`), ...marked.map((n) => `marked ${n}`)].join('\n'));
      return 0;
    }
    case 'list': {
      const all = decisionsOf(dir);
      const rows = opt.all ? all : liveDecisions(all, scopeOf(opt), { by: opt.by, kind: opt.kind });
      out(opt.json ? rows : rows.length ? rows.map(decisionLine).join('\n') : 'no decisions');
      return 0;
    }
    case 'answered': {
      if (!opt.key) throw new Error('decide answered: --key is required');
      const hit = answeredBy(decisionsOf(dir), opt.key, scopeOf(opt));
      out(opt.json ? { answered: Boolean(hit), entry: hit } : hit ? decisionLine(hit) : `not answered: ${opt.key}`);
      return hit ? 0 : 1;
    }
    case 'drop': {
      if (!arg) throw new Error('decide drop: <questions.json> is required');
      const doc = JSON.parse(readFileSync(resolve(arg), 'utf8'));
      const questions = Array.isArray(doc) ? doc : doc.questions ?? [];
      const r = dropAnswered(decisionsOf(dir), questions, scopeOf(opt));
      out(opt.json ? r : [`ask: ${r.ask.length}`, ...r.answered.map((q) => `answered: ${q.key} by ${q.decision}`)].join('\n'));
      return 0;
    }
    case 'import': {
      const r = importLegacy(dir);
      out(opt.json ? r : `imported ${r.added}, already held ${r.skipped}`);
      return 0;
    }
    default:
      throw new Error(`decide: unknown verb ${verb}`);
  }
}

// ---------------------------------------------------------------- step

export function runStep(pos, opt) {
  const [verb, root, slug, slice, n] = pos;
  if (!verb || !root || !slug) throw new Error('step: <start|done|stop|retry|complete|where> <root> <slug> are required');
  const projectRoot = resolve(root);
  const dir = join(wfRoot(projectRoot), slug);
  if (!existsSync(dir)) throw new Error(`step: no workflow folder ${dir}`);
  const sha = () => {
    if (!opt.sha) return null;
    const s = gitRevParse(projectRoot, opt.sha);
    if (!s) throw new Error(`step: ${opt.sha} is not a commit of ${projectRoot}`);
    return s;
  };
  if (verb === 'where') {
    const target = slice ?? lastSlice(dir);
    if (!target) { out(opt.json ? { slice: null } : 'no steps recorded'); return 0; }
    const w = whereOf(dir, target, { isAncestor: gitIsAncestor(projectRoot) });
    out(opt.json ? w : whereLine(w));
    return 0;
  }
  if (!slice) throw new Error(`step ${verb}: <slice> is required`);
  const step = n == null ? null : Number(n);
  const rows = {
    start: () => ({ slice, event: 'start', step, title: opt.title ?? null }),
    done: () => ({ slice, event: 'done', step, sha: sha() }),
    stop: () => ({ slice, event: 'hard-stop', reason: opt.reason ?? null }),
    retry: () => ({ slice, event: 'retry' }),
    complete: () => ({ slice, event: 'complete', sha: sha() }),
  };
  if (!rows[verb]) throw new Error(`step: unknown verb ${verb}`);
  const line = appendStep(dir, rows[verb]());
  // The progress record follows the step of the slice.
  if (verb === 'start') {
    const total = whereOf(dir, slice).total;
    writeProgress(dir, { stage: 'implement', slice, step: { n: step, of: total || null, title: opt.title ?? null } });
  } else if (verb === 'complete') writeProgress(dir, { slice, step: null });
  out(opt.json ? line : `${line.event} ${slice}${line.step ? ` step ${line.step}` : ''}${line.sha ? ` ${line.sha.slice(0, 8)}` : ''}`);
  return 0;
}

// ---------------------------------------------------------------- profile

export function runProfile(pos, opt) {
  const [verb, root, a, b] = pos;
  if (!verb || !root) throw new Error('profile: <show|set|record|timebox> <root> are required');
  const projectRoot = resolve(root);
  if (verb === 'show') {
    const p = readProfile(projectRoot);
    const lines = profileLines(p);
    out(opt.json ? p : lines.length ? lines.join('\n') : 'no test profile');
    return 0;
  }
  if (verb === 'set') {
    if (!a || !opt.command || opt.estimate == null) throw new Error('profile set: <suite> --command c --estimate seconds are required');
    const s = setSuite(projectRoot, a, { command: opt.command, estimateSeconds: Number(opt.estimate) });
    out(opt.json ? s : `${a}: \`${s.command}\` (${s.estimateSeconds}s estimated)`);
    return 0;
  }
  if (verb === 'record') {
    if (!a || b == null) throw new Error('profile record: <suite> <seconds> are required');
    const s = recordRun(projectRoot, a, Number(b));
    out(opt.json ? s : `${a}: ${s.measuredSeconds}s measured`);
    return 0;
  }
  if (verb === 'timebox') {
    if (!a) throw new Error('profile timebox: <stage> is required');
    const suites = STAGE_SUITES[a] ?? [];
    const box = timeBox(readProfile(projectRoot), suites, { workSeconds: Number(opt.work ?? 0) || 0 });
    out(opt.json ? { stage: a, suites, ...box } : `${a}: ${Math.round(box.seconds / 60)} minutes${box.from.length ? ` (${box.from.join(', ')})` : ' (no suite time; the floor)'}`);
    return 0;
  }
  throw new Error(`profile: unknown verb ${verb}`);
}

// ---------------------------------------------------------------- findings

export function runFindings(pos, opt) {
  const [verb, root, slug, a, b] = pos;
  if (!verb || !root || !slug) throw new Error('findings: <add|list|set|table|metrics|questions> <root> <slug> are required');
  const dir = join(wfRoot(resolve(root)), slug);
  if (!existsSync(dir)) throw new Error(`findings: no workflow folder ${dir}`);
  const ledger = readLedger(dir);
  const source = opt.source ?? null;
  // A review file shows one source and one scope: the packet (no slice) unless --slice names one.
  const scope = { source: source ?? 'review', slice: opt.slice ?? null };
  switch (verb) {
    case 'add': {
      if (!a) throw new Error('findings add: <found.json> is required');
      const doc = JSON.parse(readFileSync(resolve(a), 'utf8'));
      const found = Array.isArray(doc) ? doc : doc.findings ?? [];
      const dimensions = opt.dimensions ? String(opt.dimensions).split(',').map((d) => d.trim()).filter(Boolean) : (doc.dimensions ?? []);
      const r = mergeRun(ledger, found, { ...scope, dimensions, run: opt.run ?? null });
      writeLedger(dir, r.ledger);
      out(opt.json ? { added: r.added, resurfaced: r.resurfaced, resolved: r.resolved, verdict: r.verdict } : `added ${r.added.length}, seen again ${r.resurfaced.length}, resolved ${r.resolved.length}: ${r.verdict}`);
      return 0;
    }
    case 'metrics': {
      const m = metricsOf(ledger, scope);
      out(opt.json ? m : Object.entries(m).map(([k, v]) => `${k}: ${Array.isArray(v) ? `[${v.join(', ')}]` : v}`).join('\n'));
      return 0;
    }
    case 'list': {
      const rows = ledger.findings.filter((f) => (!source || f.source === source) && (opt.slice == null || f.slice === opt.slice) && (!opt.open || OPEN_STATUSES.has(f.status)));
      out(opt.json ? rows : rows.length ? rows.map((f) => `${f.id} ${f.severity} ${f.status}${f.file ? ` ${f.file}${f.line ? `:${f.line}` : ''}` : ''}: ${f.issue}`).join('\n') : 'no findings');
      return 0;
    }
    case 'set': {
      if (!a || !b) throw new Error('findings set: <id> <status> are required');
      const e = setStatus(ledger, a, b, opt.reason ?? null);
      writeLedger(dir, ledger);
      out(opt.json ? e : `${e.id} ${e.status}`);
      return 0;
    }
    case 'table': {
      process.stdout.write(`Verdict: ${verdictOf(ledger, scope)}\n\n${findingsTable(ledger, scope)}\n`);
      return 0;
    }
    case 'questions': {
      const q = questionsOf(ledger);
      out(opt.json ? { questions: q } : q.length ? q.map((x) => `${x.key}: ${x.question}`).join('\n') : 'no questions');
      return 0;
    }
    default:
      throw new Error(`findings: unknown verb ${verb}`);
  }
}

// ---------------------------------------------------------------- record

// The short names of a record for `record get` and `record set`.
const RECORD_ALIASES = { index: INDEX_NAME, state: INDEX_NAME, meta: INDEX_NAME };
const recordName = (n) => RECORD_ALIASES[n] ?? n;

/** `key=value` → [key, value], the value read as a YAML scalar or flow collection. */
function fieldOf(arg) {
  const at = arg.indexOf('=');
  if (at < 1) throw new Error(`record set: ${arg} is not key=value`);
  const raw = arg.slice(at + 1);
  let value;
  try { value = raw === '' ? '' : parseYaml(raw); } catch { value = raw; }
  return [arg.slice(0, at), value];
}

function runRecord(pos, opt) {
  const [verb, root, slug, ...rest] = pos;
  if (!['put', 'get', 'set', 'list', 'where', 'migrate', 'evidence'].includes(verb) || !root || !slug) {
    throw new Error('record: <put|get|set|list|where|migrate|evidence> <root> <slug> are required');
  }
  const dir = join(wfRoot(resolve(root)), slug);
  if (!existsSync(dir)) throw new Error(`record: no workflow folder ${dir}`);
  switch (verb) {
    case 'put': {
      const drafts = rest.length ? rest.map((p) => (existsSync(resolve(p)) ? resolve(p) : draftPath(dir, p))) : draftsOf(dir);
      if (!drafts.length) throw new Error(`record put: no draft in ${join(dir, DRAFT_DIR)}`);
      const results = drafts.map((p) => putDraft(dir, p));
      const ev = pruneEvidence(dir);
      out(opt.json ? { results, pruned: ev.pruned } : results.map((r) => (r.errors.length
        ? `refused ${r.name}: ${r.errors.join('; ')}`
        : `put ${r.name} → ${r.file}${r.section ? `#${r.section}` : ''}`)).concat(ev.pruned.map((p) => `pruned evidence ${p}`)).join('\n'));
      return results.some((r) => r.errors.length) ? 1 : 0;
    }
    case 'get': {
      const [name] = rest;
      if (!name) throw new Error('record get: <name> is required');
      const doc = readDoc(dir, recordName(name));
      if (!doc) { process.stderr.write(`wf.mjs: no record ${name} in ${slug}\n`); return 1; }
      if (opt.json) out(doc);
      else process.stdout.write(`---\n${stringifyYaml(doc.frontmatter ?? {})}\n---\n${doc.body ?? ''}`);
      return 0;
    }
    case 'set': {
      const [name, ...fields] = rest;
      if (!name || !fields.length) throw new Error('record set: <name> <key=value>... are required');
      const fm = setFields(dir, recordName(name), Object.fromEntries(fields.map(fieldOf)));
      out(opt.json ? fm : `set ${fields.map((f) => f.split('=')[0]).join(', ')} in ${recordName(name)}`);
      return 0;
    }
    case 'list': {
      const names = listDocs(dir);
      out(opt.json ? names : names.join('\n'));
      return 0;
    }
    case 'where': {
      const [name] = rest;
      if (!name) throw new Error('record where: <old path> is required');
      const to = redirectOf(name);
      out(to ?? `${name} keeps its place`);
      return 0;
    }
    case 'evidence': {
      const r = pruneEvidence(dir, { dryRun: Boolean(opt.check) });
      const mb = (b) => `${(b / 1048576).toFixed(1)} MB`;
      out(opt.json ? r : [`evidence ${mb(r.bytes)} of ${mb(r.cap)}, ${r.kept} run(s)`, ...r.pruned.map((p) => `${opt.check ? 'would prune' : 'pruned'} ${p}`)].join('\n'));
      return 0;
    }
    case 'migrate': {
      const r = migrateWorkflow(dir);
      out(opt.json ? r : [...r.moved.map((m) => `moved ${m.from} → ${m.to}`), ...r.kept.map((k) => `kept ${k}`)].join('\n') || 'nothing to move');
      return 0;
    }
    default: return 2;
  }
}

// ---------------------------------------------------------------- main

export async function main(argv = process.argv.slice(2)) {
  const [cmd, ...rest] = argv;
  const { pos, opt } = flags(rest);
  try {
    switch (cmd) {
      case 'dispatch': return runDispatch(pos, opt);
      case 'status': {
        const [root, slug] = pos;
        if (!root) throw new Error('status: <root> is required');
        const s = await statusOf(resolve(root), slug ?? null);
        out(opt.json ? s : statusText(s));
        return s.error ? 1 : 0;
      }
      case 'index': {
        const [root] = pos;
        if (!root) throw new Error('index: <root> is required');
        const r = await reconcileIndex(resolve(root), { write: !opt.check });
        out(opt.json ? r : indexText(r));
        return opt.check && r.changed ? 1 : 0;
      }
      case 'cost': {
        const [root, slug] = pos;
        if (!root || !slug) throw new Error('cost: <root> <slug> are required');
        const agg = costSummary(join(wfRoot(resolve(root)), slug));
        out(opt.json ? agg : costText(agg));
        return 0;
      }
      case 'stamp': {
        const [type] = pos;
        if (!type) throw new Error('stamp: <type> is required');
        out(stampOf(type, { slug: opt.slug, slice: opt.slice ?? null }));
        return 0;
      }
      case 'decide': return runDecide(pos, opt);
      case 'step': return runStep(pos, opt);
      case 'profile': return runProfile(pos, opt);
      case 'findings': return runFindings(pos, opt);
      case 'record': return runRecord(pos, opt);
      case 'drive': return await runDrive(pos, opt);
      case 'progress': {
        const [verb, root, slug] = pos;
        if (!['set', 'show'].includes(verb) || !root || !slug) throw new Error('progress: <set|show> <root> <slug> are required');
        const dir = join(wfRoot(resolve(root)), slug);
        if (!existsSync(dir)) throw new Error(`progress: no workflow folder ${dir}`);
        if (verb === 'set') {
          const change = Object.fromEntries(['stage', 'slice', 'status', 'run', 'driver', 'reason', 'resume'].filter((k) => opt[k] != null).map((k) => [k, opt[k]]));
          writeProgress(dir, change);
        }
        const p = progressOf(dir, slug);
        out(opt.json ? p : progressLine(p));
        return 0;
      }
      case 'defer': {
        const [verb, root, slug] = pos;
        if (verb !== 'check' || !root || !slug) throw new Error('defer: check <root> <slug> is required');
        const r = checkDeferrals(resolve(root), slug, { next: opt.next ?? null });
        out(opt.json ? r : r.entries.length ? r.entries.map(deferralLine).join('\n') : 'no open deferrals');
        return r.stop.length ? 1 : 0;
      }
      case 'brief': {
        const [root, slug, stage, slice] = pos;
        if (!root || !slug || !stage) throw new Error('brief: <root> <slug> <stage> are required');
        const b = buildBrief({ projectRoot: resolve(root), referenceRoot: REFERENCE_ROOT, slug, stage, slice: slice ?? null, wfCli: join(PLUGIN_ROOT, 'skills', 'wf', 'scripts', 'wf.mjs') });
        if (opt.json) out(b); else process.stdout.write(b.text);
        return 0;
      }
      default:
        process.stderr.write(`${USAGE}\n`);
        return 2;
    }
  } catch (e) {
    process.stderr.write(`wf.mjs: ${e.message}\n`);
    return 1;
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) process.exitCode = await main();
