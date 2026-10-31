#!/usr/bin/env node
/**
 * scripts/cost-rebuild.mjs — rebuild the inflated cost ledgers (`cost.jsonl` and
 * the monthly `cost-<yyyy-mm>.jsonl`) of one
 * project from the Claude Code transcripts.
 *
 *   node scripts/cost-rebuild.mjs <projectRoot> [--apply] [--projects-dir <dir>] [--force]
 *
 * Before the cursor fix, a sub-agent whose transcript also had a copy in
 * `subagents/` was read again from its first byte on every Stop, so its usage
 * was booked again in every row. This script reads each such agent's
 * transcripts in full, and keeps one entry with its true total, in the earliest
 * row that held it (lib/cost-ledger.mjs `rebuildLedgerRows`).
 *
 * - With no `--apply`, it changes nothing and prints what it would change.
 * - With `--apply`, it keeps each old file as `<name>.bak`, and refuses when
 *   a `.bak` exists already (`--force` replaces it). Run it while no session
 *   writes to the project: the Stop hook appends to these files.
 * - `--projects-dir` is the Claude Code projects folder (default ~/.claude/projects).
 * Prints one JSON object.
 */

import { copyFileSync, existsSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

import { agentTotalsFromFiles, costFiles, listClaudeAgentFiles, readCostFile, rebuildLedgerRows } from '../lib/cost-ledger.mjs';
import { workflowsRoot } from '../lib/records-root.mjs';

function argsOf(argv) {
  const out = { root: null, apply: false, force: false, projectsDir: join(homedir(), '.claude', 'projects') };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--apply') out.apply = true;
    else if (argv[i] === '--force') out.force = true;
    else if (argv[i] === '--projects-dir') out.projectsDir = argv[++i];
    else if (!out.root) out.root = argv[i];
  }
  return out;
}

/** The `subagents` folder of each session id, in any project folder of Claude Code. */
function sessionDirs(projectsDir, sessions) {
  const out = new Map();
  let projects = [];
  try { projects = readdirSync(projectsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { return out; }
  for (const s of sessions) {
    for (const p of projects) {
      const dir = join(projectsDir, p, s, 'subagents');
      if (existsSync(dir)) { out.set(s, dir); break; }
    }
  }
  return out;
}

export function costRebuild({ root, apply = false, force = false, projectsDir }) {
  const wf = workflowsRoot(resolve(root));
  if (!existsSync(wf)) return { ok: false, error: `no .ai/workflows in ${root}` };
  const files = [];
  for (const d of readdirSync(wf, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    for (const f of costFiles(join(wf, d.name))) files.push({ path: f, rows: readCostFile(f) });
  }
  const ids = new Set();
  const sessions = new Set();
  for (const f of files) {
    for (const r of f.rows) {
      if (r.session) sessions.add(r.session);
      for (const s of Array.isArray(r.subagents) ? r.subagents : []) if (s?.agent_id) ids.add(s.agent_id);
    }
  }
  const dirs = sessionDirs(projectsDir, sessions);
  const transcripts = [...dirs.values()].flatMap((d) => listClaudeAgentFiles(d)).filter((f) => ids.has(f.id));
  const truth = agentTotalsFromFiles(transcripts);
  const res = rebuildLedgerRows(files, truth);
  const report = res.files.filter((f) => f.changed).map((f) => {
    const was = files.find((x) => x.path === f.path).rows;
    const w = (rows) => rows.reduce((n, r) => n + (r.subagents ?? []).reduce((m, s) => m + (s.input_tokens ?? 0) + (s.output_tokens ?? 0) + (s.cache_read_input_tokens ?? 0) + (s.cache_creation_input_tokens ?? 0), 0), 0);
    return { path: f.path, rows: [was.length, f.rows.length], subagentTokens: [w(was), w(f.rows)] };
  });
  const out = { ok: true, apply, sessions: sessions.size, sessionsFound: dirs.size, agents: ids.size, agentsWithTranscript: truth.size, inflated: res.agents.length, files: report };
  if (!apply) return out;
  for (const f of res.files.filter((x) => x.changed)) {
    const bak = `${f.path}.bak`;
    if (existsSync(bak) && !force) return { ...out, ok: false, error: `${bak} exists: delete it, or run again with --force` };
  }
  for (const f of res.files.filter((x) => x.changed)) {
    copyFileSync(f.path, `${f.path}.bak`);
    const tmp = `${f.path}.${process.pid}.tmp`;
    writeFileSync(tmp, f.rows.map((r) => `${JSON.stringify(r)}\n`).join(''), 'utf-8');
    renameSync(tmp, f.path);
  }
  return { ...out, written: res.files.filter((x) => x.changed).length };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
if (isMain) {
  const a = argsOf(process.argv.slice(2));
  if (!a.root) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: 'usage: cost-rebuild.mjs <projectRoot> [--apply] [--projects-dir <dir>] [--force]' })}\n`);
    process.exitCode = 1;
  } else {
    const r = costRebuild(a);
    process.stdout.write(`${JSON.stringify(r, null, 2)}\n`);
    if (!r.ok) process.exitCode = 1;
  }
}
