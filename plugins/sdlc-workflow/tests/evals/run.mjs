#!/usr/bin/env node
// tests/evals/run.mjs — behavior evals for /wf (WIDE-VIEW-REPAIR-PLAN §8, wave W6;
// the harness is built inside W0 so the W0 baseline can be recorded, §3.6).
//
// Each case scaffolds a fixture repo, runs one headless `claude -p` turn with this
// plugin loaded, then applies DETERMINISTIC assertions: files exist, frontmatter
// validates against tests/frontmatter.schema.json, git state is as expected. No
// LLM grader. Cases that share a fixture run in `order` in ONE workspace, so
// `shape` sees the slug `intake` created (`<slug>` in a prompt is substituted).
//
// `claude plugin eval` is early access on the Claude Code this was written against
// (2.1.261: `init` refuses). When it opens, migrate the runner; keep cases/ and
// fixtures/ as they are.
//
// Usage:
//   node tests/evals/run.mjs                      # every case, results/<run-id>/
//   node tests/evals/run.mjs --case plan          # one case and the cases it requires
//   node tests/evals/run.mjs --compare baseline   # diff the newest run against baseline/
//   node tests/evals/run.mjs --write-baseline     # copy the newest run into baseline/
//   node tests/evals/run.mjs --dry-run            # scaffold + substitute, do not call claude
//
// Requires: `claude` on PATH and an authenticated headless session
// (`echo hi | claude -p --output-format json` must not return is_error).

import { spawnSync } from 'node:child_process';
import {
  cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateFrontmatterFile, validateSiblingYamlFile } from '../../lib/schema-validator.mjs';
import { aggregateCost, readCostRows } from '../../lib/cost-ledger.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(HERE, '..', '..');
const CASES_DIR = path.join(HERE, 'cases');
const FIXTURES_DIR = path.join(HERE, 'fixtures');
const RESULTS_DIR = path.join(HERE, 'results');
const BASELINE_DIR = path.join(HERE, 'baseline');
const SCHEMA_PATH = path.join(PLUGIN_ROOT, 'tests', 'frontmatter.schema.json');

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const opt = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

// ── cases ──────────────────────────────────────────────────────────────────────
export function loadCases() {
  return readdirSync(CASES_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ ...JSON.parse(readFileSync(path.join(CASES_DIR, f), 'utf8')), _file: f }))
    .sort((a, b) => a.order - b.order);
}

function selectCases(all, only) {
  if (!only) return all;
  const byName = new Map(all.map((c) => [c.name, c]));
  const picked = new Set();
  const visit = (name) => {
    const c = byName.get(name);
    if (!c) throw new Error(`no case named ${name}`);
    for (const r of c.requires ?? []) visit(r);
    picked.add(c);
  };
  visit(only);
  return all.filter((c) => picked.has(c));
}

// ── workspace ──────────────────────────────────────────────────────────────────
function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout;
}

function scaffold(fixture, runDir) {
  const src = path.join(FIXTURES_DIR, fixture);
  if (!existsSync(src)) throw new Error(`fixture missing: ${src}`);
  const ws = path.join(runDir, 'ws', fixture);
  mkdirSync(ws, { recursive: true });
  cpSync(src, ws, { recursive: true });
  git(ws, 'init', '-q', '-b', 'main');
  git(ws, 'config', 'user.email', 'evals@sdlc-workflow.local');
  git(ws, 'config', 'user.name', 'sdlc evals');
  git(ws, 'add', '-A');
  git(ws, 'commit', '-q', '-m', `fixture: ${fixture}`);
  return ws;
}

function discoverSlug(ws) {
  const dir = path.join(ws, '.ai', 'workflows');
  if (!existsSync(dir)) return null;
  const slugs = readdirSync(dir)
    .filter((d) => statSync(path.join(dir, d)).isDirectory() && !d.startsWith('_') && !d.startsWith('.'))
    .map((d) => ({ d, t: statSync(path.join(dir, d)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  return slugs[0]?.d ?? null;
}

// ── claude -p ──────────────────────────────────────────────────────────────────
function headlessEnv() {
  const env = { ...process.env };
  // A nested Claude Code session refuses or misroutes when the parent's markers leak.
  for (const k of Object.keys(env)) if (k === 'CLAUDECODE' || k.startsWith('CLAUDE_CODE_')) delete env[k];
  return env;
}

function runClaude({ cwd, prompt, maxTurns }) {
  const args = [
    '-p',
    '--output-format', 'json',
    '--plugin-dir', PLUGIN_ROOT,
    '--permission-mode', 'bypassPermissions',
    '--max-turns', String(maxTurns ?? 60),
  ];
  const started = Date.now();
  const r = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', ['claude', ...args].join(' ')], { cwd, input: prompt, encoding: 'utf8', env: headlessEnv(), maxBuffer: 64 * 1024 * 1024 })
    : spawnSync('claude', args, { cwd, input: prompt, encoding: 'utf8', env: headlessEnv(), maxBuffer: 64 * 1024 * 1024 });
  const wallMs = Date.now() - started;
  let parsed = null;
  try {
    parsed = JSON.parse(r.stdout);
  } catch {
    parsed = null;
  }
  return {
    exitCode: r.status,
    wallMs,
    isError: parsed ? Boolean(parsed.is_error) : true,
    result: parsed?.result ?? (r.stderr || r.stdout || '').slice(0, 2000),
    usage: parsed?.usage ?? null,
    totalCostUsd: parsed?.total_cost_usd ?? null,
    numTurns: parsed?.num_turns ?? null,
    sessionId: parsed?.session_id ?? null,
  };
}

// ── assertions ─────────────────────────────────────────────────────────────────
function globToRegExp(glob) {
  const esc = glob
    .split('/')
    .map((seg) => (seg === '**' ? '(?:.*)' : seg.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]')))
    .join('/')
    .replace(/\(\?:\.\*\)\//g, '(?:.*/)?');
  return new RegExp(`^${esc}$`);
}

function walk(root, rel = '') {
  const out = [];
  const abs = path.join(root, rel);
  for (const e of readdirSync(abs)) {
    if (e === '.git' || e === 'node_modules') continue;
    const r = rel ? `${rel}/${e}` : e;
    if (statSync(path.join(root, r)).isDirectory()) out.push(...walk(root, r));
    else out.push(r);
  }
  return out;
}

function matchGlob(ws, glob) {
  const re = globToRegExp(glob);
  return walk(ws).filter((f) => re.test(f)).sort();
}

// Paths the plugin's own hooks create in any repository a session opens: the
// registry seeds `.ai/.gitignore` beside the view directory and SessionStart
// renders `.ai/_view/`. Neither is the model's doing, so `no-changes` and
// `changes-only-under` ignore them.
const HOST_LITTER = [/^\.ai\/\.gitignore$/, /^\.ai\/_view\//];

function changedPaths(ws) {
  return git(ws, 'status', '--porcelain', '--untracked-files=all')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => l.slice(3).replace(/^"|"$/g, '').replace(/\\/g, '/'))
    .filter((p) => !HOST_LITTER.some((re) => re.test(p)));
}

async function runAssertion(a, ws, run) {
  const files = a.glob ? matchGlob(ws, a.glob) : [];
  switch (a.type) {
    case 'exists':
      return { ok: files.length >= (a.min ?? 1) && files.length <= (a.max ?? Infinity), detail: files.join(', ') || '(none)' };
    case 'absent':
      return { ok: files.length === 0, detail: files.join(', ') || '(none)' };
    case 'frontmatter-valid': {
      if (files.length === 0) return { ok: false, detail: 'no file matched' };
      const bad = [];
      for (const f of files) {
        const r = await validateFrontmatterFile(path.join(ws, f), { schemaPath: SCHEMA_PATH });
        if (!r.valid) bad.push(`${f}: ${(r.errors ?? []).map((e) => e.message ?? JSON.stringify(e)).join('; ')}`);
      }
      return { ok: bad.length === 0, detail: bad.join(' | ') || files.join(', ') };
    }
    case 'sibling-yaml-valid': {
      if (files.length === 0) return { ok: false, detail: 'no file matched' };
      const bad = [];
      for (const f of files) {
        const r = await validateSiblingYamlFile(path.join(ws, f), { schemaPath: SCHEMA_PATH });
        if (!r.valid) bad.push(`${f}: ${(r.errors ?? []).map((e) => e.message ?? JSON.stringify(e)).join('; ')}`);
      }
      return { ok: bad.length === 0, detail: bad.join(' | ') || files.join(', ') };
    }
    case 'frontmatter-has': {
      if (files.length === 0) return { ok: false, detail: 'no file matched' };
      const missing = files.filter((f) => {
        const text = readFileSync(path.join(ws, f), 'utf8');
        const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        return !(fm && new RegExp(`^${a.field}\\s*:`, 'm').test(fm[1]));
      });
      return { ok: missing.length === 0, detail: missing.length ? `missing ${a.field} in ${missing.join(', ')}` : files.join(', ') };
    }
    case 'file-contains': {
      const p = path.join(ws, a.path);
      if (!existsSync(p)) return { ok: false, detail: `${a.path} missing` };
      const text = readFileSync(p, 'utf8');
      const ok = a.pattern ? new RegExp(a.pattern, 'm').test(text) : text.includes(a.text);
      return { ok, detail: a.pattern ?? a.text };
    }
    case 'yaml-list-length': {
      if (files.length === 0) return { ok: false, detail: 'no file matched' };
      const text = readFileSync(path.join(ws, files[0]), 'utf8');
      const block = text.match(new RegExp(`^${a.field}\\s*:\\s*\\r?\\n((?:[ \\t]+-.*\\r?\\n?)+)`, 'm'));
      const n = block ? block[1].split(/\r?\n/).filter((l) => /^\s+-\s/.test(l)).length : 0;
      const ok = a.equals != null ? n === a.equals : n >= (a.min ?? 0);
      return { ok, detail: `${a.field}: ${n} items in ${files[0]}` };
    }
    case 'changes-only-under': {
      const outside = changedPaths(ws).filter((p) => !p.startsWith(a.prefix));
      return { ok: outside.length === 0, detail: outside.join(', ') || `all changes under ${a.prefix}` };
    }
    case 'no-changes': {
      const c = changedPaths(ws);
      return { ok: c.length === 0, detail: c.join(', ') || 'clean' };
    }
    case 'git-branch-matching': {
      const branches = git(ws, 'branch', '--format=%(refname:short)').split(/\r?\n/).filter(Boolean);
      const hit = branches.filter((b) => new RegExp(a.pattern).test(b));
      return { ok: hit.length >= (a.min ?? 1), detail: branches.join(', ') };
    }
    case 'result-contains': {
      // Asserts on the model's final reply text (the headless run's `result`), for
      // cases whose contract is a chat STOP rather than an artifact.
      const text = String(run?.result ?? '');
      const ok = a.pattern ? new RegExp(a.pattern, 'm').test(text) : text.includes(a.text);
      return { ok, detail: ok ? (a.pattern ?? a.text) : `reply lacks ${a.pattern ?? a.text}: ${text.slice(0, 200)}` };
    }
    case 'shell': {
      const r = spawnSync(a.cmd, { cwd: ws, shell: true, encoding: 'utf8' });
      return { ok: r.status === 0, detail: (r.stdout + r.stderr).trim().split(/\r?\n/).slice(-3).join(' / ') };
    }
    default:
      return { ok: false, detail: `unknown assertion type ${a.type}` };
  }
}

// ── run ────────────────────────────────────────────────────────────────────────
async function runAll({ only, dryRun }) {
  const cases = selectCases(loadCases(), only);
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const runDir = path.join(RESULTS_DIR, runId);
  mkdirSync(runDir, { recursive: true });
  const workspaces = new Map();
  const ctx = new Map(); // fixture → { slug }
  const report = { runId, pluginRoot: PLUGIN_ROOT, dryRun, startedAt: new Date().toISOString(), cases: [] };

  for (const c of cases) {
    if (!workspaces.has(c.fixture)) {
      workspaces.set(c.fixture, scaffold(c.fixture, runDir));
      ctx.set(c.fixture, { slug: null });
    }
    const ws = workspaces.get(c.fixture);
    const slug = ctx.get(c.fixture).slug ?? discoverSlug(ws);
    const prompt = c.prompt.replace(/<slug>/g, slug ?? '<slug>');
    process.stderr.write(`[evals] ${c.name} (${c.fixture}) … `);
    const run = dryRun
      ? { exitCode: null, wallMs: 0, isError: false, result: '(dry run)', usage: null, totalCostUsd: 0, numTurns: 0, sessionId: null }
      : runClaude({ cwd: ws, prompt, maxTurns: c.maxTurns });
    const found = discoverSlug(ws);
    if (found) ctx.get(c.fixture).slug = found;

    const assertions = [];
    for (const a of c.assertions) {
      const r = await runAssertion(a, ws, run);
      assertions.push({ ...a, ...r });
    }
    const passed = assertions.filter((a) => a.ok).length;
    const entry = {
      name: c.name,
      fixture: c.fixture,
      prompt,
      slug: ctx.get(c.fixture).slug,
      run,
      assertions,
      passed,
      total: assertions.length,
      ok: !run.isError && passed === assertions.length,
      artifacts: existsSync(path.join(ws, '.ai')) ? matchGlob(ws, '.ai/**') : [],
      // Exact ledger totals (WIDE-VIEW-REPAIR-PLAN §10.4): what the Stop hook
      // recorded across every slug the case wrote; null when no ledger exists.
      costLedger: costLedgerTotals(ws),
    };
    report.cases.push(entry);
    writeFileSync(path.join(runDir, `${c.name}.json`), JSON.stringify(entry, null, 2) + '\n');
    process.stderr.write(`${entry.ok ? 'ok' : 'FAIL'} ${passed}/${assertions.length}${run.isError ? ` — ${String(run.result).slice(0, 120)}` : ''}\n`);
  }
  report.finishedAt = new Date().toISOString();
  report.ok = report.cases.every((c) => c.ok);
  writeFileSync(path.join(runDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  writeFileSync(path.join(RESULTS_DIR, 'latest.txt'), runId + '\n');
  // Workspaces are large and reproducible; keep only the reports.
  rmSync(path.join(runDir, 'ws'), { recursive: true, force: true });
  return report;
}

function costLedgerTotals(ws) {
  const root = path.join(ws, '.ai', 'workflows');
  if (!existsSync(root)) return null;
  const rows = [];
  for (const d of readdirSync(root, { withFileTypes: true })) {
    if (d.isDirectory()) rows.push(...readCostRows(path.join(root, d.name)));
  }
  return rows.length ? aggregateCost(rows).total : null;
}

function newestReport() {
  const latest = path.join(RESULTS_DIR, 'latest.txt');
  if (!existsSync(latest)) throw new Error('no run yet — run the evals first');
  const runId = readFileSync(latest, 'utf8').trim();
  return JSON.parse(readFileSync(path.join(RESULTS_DIR, runId, 'report.json'), 'utf8'));
}

function compare(baselineDir) {
  const basePath = path.join(baselineDir, 'report.json');
  if (!existsSync(basePath)) {
    console.error(`[evals] no baseline report at ${basePath} — run once and pass --write-baseline`);
    process.exit(2);
  }
  const base = JSON.parse(readFileSync(basePath, 'utf8'));
  const now = newestReport();
  console.log('| Case | Artifact set equal | Schema valid | Input tokens before/after | Output tokens before/after | Ledger in before/after | Ledger out before/after |');
  console.log('|---|---|---|---|---|---|---|');
  let same = true;
  for (const c of now.cases) {
    const b = base.cases.find((x) => x.name === c.name);
    const art = b ? JSON.stringify(b.artifacts.map((p) => p.replace(b.slug ?? '', '<slug>'))) === JSON.stringify(c.artifacts.map((p) => p.replace(c.slug ?? '', '<slug>'))) : null;
    const schemaOk = c.assertions.filter((a) => a.type.startsWith('frontmatter') || a.type === 'sibling-yaml-valid').every((a) => a.ok);
    const tok = (r, k) => (r?.usage ? (r.usage[k] ?? 0) + (k === 'input_tokens' ? (r.usage.cache_read_input_tokens ?? 0) + (r.usage.cache_creation_input_tokens ?? 0) : 0) : '—');
    // Ledger columns are the exact `cost.jsonl` sums (input = input + cache read + cache write).
    const led = (e, k) => (e?.costLedger ? (k === 'in' ? e.costLedger.input + e.costLedger.cacheRead + e.costLedger.cacheWrite : e.costLedger.output) : '—');
    console.log(`| ${c.name} | ${art == null ? 'no baseline' : art ? 'yes' : 'NO'} | ${schemaOk ? 'yes' : 'NO'} | ${tok(b?.run, 'input_tokens')} / ${tok(c.run, 'input_tokens')} | ${tok(b?.run, 'output_tokens')} / ${tok(c.run, 'output_tokens')} | ${led(b, 'in')} / ${led(c, 'in')} | ${led(b, 'out')} / ${led(c, 'out')} |`);
    if (art === false || !schemaOk) same = false;
  }
  process.exit(same ? 0 : 1);
}

function writeBaseline() {
  const now = newestReport();
  mkdirSync(BASELINE_DIR, { recursive: true });
  writeFileSync(path.join(BASELINE_DIR, 'report.json'), JSON.stringify(now, null, 2) + '\n');
  console.log(`[evals] baseline written from run ${now.runId} (${now.cases.length} cases, ok=${now.ok})`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (opt('--compare')) {
    compare(opt('--compare') === 'baseline' ? BASELINE_DIR : path.resolve(opt('--compare')));
  } else if (flag('--write-baseline')) {
    writeBaseline();
  } else {
    const report = await runAll({ only: opt('--case'), dryRun: flag('--dry-run') });
    console.log(`[evals] ${report.cases.filter((c) => c.ok).length}/${report.cases.length} cases ok — results/${report.runId}/report.json`);
    process.exit(report.ok ? 0 : 1);
  }
}
