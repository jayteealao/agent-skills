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
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { aggregateCost, readCostRows } from '../lib/cost-ledger.mjs';
import { SAFE_TOKEN, UNSAFE, diskFacts, dispatch, dispatchLine } from '../lib/dispatch.mjs';
import { safeParseFrontmatter } from '../lib/frontmatter.mjs';
import { loadRegistry, reservedWords } from '../lib/registry.mjs';
import { TERMINAL_WORKFLOW_STATUSES, scanWorkflowIndexes } from '../lib/workflow-index.mjs';

// scripts/ sits one level under the plugin root.
const PLUGIN_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const USAGE = 'Usage: wf.mjs <dispatch|status|index|cost|stamp> ...';
const STALE_DAYS = 7;
const DONE = new Set([...TERMINAL_WORKFLOW_STATUSES, 'shipped']);

const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const wfRoot = (root) => join(root, '.ai', 'workflows');
const out = (v) => process.stdout.write(`${typeof v === 'string' ? v : JSON.stringify(v, null, 2)}\n`);

function flags(argv) {
  const pos = [];
  const opt = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--') { pos.push(...argv.slice(i + 1)); break; }
    if (a.startsWith('--')) {
      const name = a.slice(2);
      if (['json', 'check'].includes(name)) opt[name] = true;
      else opt[name] = argv[(i += 1)];
    } else pos.push(a);
  }
  return { pos, opt };
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
  for (const s of r.subkeys ?? []) lines.push(`sub-key: ${r.key} ${s.name} → ${s.reference}`);
  out(lines.join('\n'));
  return 0;
}

// ---------------------------------------------------------------- status

const STAGE_FILES = {
  intake: () => '01-intake.md',
  shape: () => '02-shape.md',
  design: () => '02c-craft.md',
  slice: () => '03-slice.md',
  plan: (s) => (s ? `04-plan-${s}.md` : null),
  implement: (s) => (s ? `05-implement-${s}.md` : null),
  verify: (s) => (s ? `06-verify-${s}.md` : null),
  review: (s) => (s ? `07-review-${s}.md` : null),
  handoff: () => '08-handoff.md',
  ship: () => '09-ship-runs.md',
  retro: () => '10-retro.md',
};
const SLICE_STAGES = [['plan', '04-plan'], ['implement', '05-implement'], ['verify', '06-verify'], ['review', '07-review']];

function frontmatterOf(file) {
  if (!existsSync(file)) return null;
  return safeParseFrontmatter(readFileSync(file, 'utf8')).data ?? {};
}

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
  const stages = Object.entries(STAGE_FILES).map(([stage, name]) => {
    const file = name(summary.selectedSlice);
    const fm = file ? frontmatterOf(join(dir, file)) : null;
    return { stage, file, present: !!fm, status: fm?.status ?? null, updatedAt: fm?.['updated-at'] ?? null };
  });
  const sliceFm = frontmatterOf(join(dir, '03-slice.md'));
  const slices = (Array.isArray(sliceFm?.slices) ? sliceFm.slices : []).map((s) => {
    const name = typeof s === 'string' ? s : s?.slug;
    const row = { slice: name };
    for (const [stage, prefix] of SLICE_STAGES) row[stage] = frontmatterOf(join(dir, `${prefix}-${name}.md`))?.status ?? null;
    return row;
  });
  const current = STAGE_FILES[summary.stage]?.(summary.selectedSlice);
  const currentFm = current ? frontmatterOf(join(dir, current)) : null;
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
    return ['slug\tgroup\tstatus\tstage\tnext', ...rows].join('\n');
  }
  const lines = [`${s.workflow.slug}: ${s.workflow.status} at ${s.workflow.stage ?? '-'}`];
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
    const fm = tree ? frontmatterOf(join(tree, '.ai', 'workflows', slug, '00-index.md')) : null;
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
