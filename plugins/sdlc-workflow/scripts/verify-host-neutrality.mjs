#!/usr/bin/env node
// scripts/verify-host-neutrality.mjs — the host-neutrality gate over the single-source
// skill tree (SINGLE-SOURCE-PLAN W6; the inverted successor of the deleted codex
// tree's verify-claudisms.mjs).
//
// One tree serves Claude Code and Codex. Skill prose is written once, host-neutral,
// and cites a small set of host-contract files for anything a host spells
// differently. This gate makes that budget real: host MECHANICS wording (a
// question tool, a dispatch tool, a model name, an isolation flag, a shell time
// command, a plugin-root variable, the other host's invocation sigil) fails
// anywhere under skills/ and reference/ EXCEPT in the permanent exception list
// below — which IS the §3.3 budget, verbatim. Growing the list means editing this
// file, so the exception is visible in review instead of silent in a diff.
//
// Two lists, deliberately separate:
//   PERMANENT — the design. The ≤5 host-contract files plus the enumerated data
//               exceptions (availability annotations, the imagery provider table).
//   BURNDOWN  — scripts/host-neutrality-allowlist.json, the temporary per-file list
//               seeded at the W3 baseline. It may only SHRINK: this gate compares it
//               against the merge base and fails on any added path, on any entry
//               whose file no longer matches a family (stale), and on any entry whose
//               file no longer exists. At cutover it is empty, and it stays empty.
//
// Usage:
//   node scripts/verify-host-neutrality.mjs           # gate (exit 1 on findings)
//   node scripts/verify-host-neutrality.mjs --json    # machine-readable
//   node scripts/verify-host-neutrality.mjs --list    # print families + exception list

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ALLOWLIST_PATH = join(ROOT, 'scripts', 'host-neutrality-allowlist.json');
const argv = process.argv.slice(2);
const asJson = argv.includes('--json');
const list = argv.includes('--list');

// Scanned: skill prose and the root reference docs the skills cite. NOT scanned:
// the per-host wiring (hooks/*.json, agents/openai.yaml), code, docs/site (its own
// gate: verify-doc-site.mjs), docs/internal.
const SCAN_DIRS = ['skills', 'reference'];
const TEXT = /\.md$/i;

// ── The permanent exception list — the §3.3 budget, verbatim ────────────────────
export const CONTRACT_FILES = [
  'skills/wf/reference/_host-invocation.md',
  'skills/wf/reference/_gate-question.md',
  'skills/wf/reference/_subagents.md',
  'skills/wf/reference/_timestamp.md',
  'skills/wf/reference/yolo.md', // the reserve slot: a Claude Code-only key's own reference
];
export const DATA_EXCEPTIONS = {
  // The dispatch table's availability line + the Hosts paragraph that points at
  // the contract. Availability is data ("where a key runs"), not mechanics.
  'skills/wf/SKILL.md': ['host-names'],
  // The imagery provider table names Codex's built-in `image_gen` provider in a
  // Hosts column — availability data for a provider, not an explanation of it.
  'skills/imagery/SKILL.md': ['codex-tools', 'host-names'],
  // consult dispatches EXTERNAL CLIs named codex / claude / gemini as oracle
  // providers. Product names in the provider role are not host mechanics.
  'skills/consult/SKILL.md': ['host-names', 'claude-model-pins'],
  // The moved cross-host docs describe both hosts by name on purpose.
  'reference/shared-hub.md': ['host-names'],
  'reference/artifact-interop.md': ['host-names'],
  // The external-dispatch design doc documents the oracle PROVIDERS (the codex /
  // claude / gemini CLIs and the built-in image tool) — product names in the
  // provider role, not host mechanics.
  'reference/external-model-dispatch.md': ['host-names', 'codex-tools'],
};

// ── Scan families ─────────────────────────────────────────────────────────────────
// Each family: a regex, an optional per-line exclusion, and the polarity note.
export const FAMILIES = [
  {
    name: 'claude-tools',
    // `Explore` is a Claude Code agent type; the neutral name is "research sub-agent".
    // `deep-research` was a Claude Code built-in workflow, never a plugin skill; the
    // neutral phrasing is "a plain research conversation outside `/wf`" (v9.153.3).
    pattern: /AskUserQuestion|\bTaskGet\b|\bTaskUpdate\b|\bTaskCreate\b|`Task`|\bTask tool\b|\bAgent tool\b|subagent_type|isolation:\s*worktree|run_in_background|\bWorkflow tool\b|mcp__|\bExplore (sub-agents?|pass|findings)\b|\bdeep-research\b/,
  },
  {
    name: 'claude-model-pins',
    pattern: /model:\s*`?(haiku|sonnet|opus)\b|\b(Haiku|Sonnet|Opus)\b/,
  },
  {
    name: 'codex-tools',
    pattern: /request_user_input|spawn_agent|wait_agent|\bmax_threads\b|\bmax_depth\b|\bcodex exec\b|\bimage_gen\b/,
  },
  {
    // One canonical spelling: `/wf`. The `$` sigil maps ONLY in _host-invocation.md.
    name: 'invocation-sigil',
    pattern: /\$(wf|consult|imagery|uiproto|diataxis|study-sources|review)\b/,
  },
  {
    // Plugin-root variables live only in the hook wiring. Executables use <skill-dir>.
    name: 'plugin-root',
    pattern: /\$\{CLAUDE_PLUGIN_ROOT\}|\$\{PLUGIN_ROOT\}|\$\{PLUGIN_DATA\}|\.claude\/skills\//,
  },
  {
    // Any shell clock read is a leak: prose cites _timestamp.md. The old pattern
    // matched only `date -u +` and `$(date +`, so a bare local-time `date +"…"`
    // passed (v9.153.1).
    name: 'timestamp-mandate',
    pattern: /via Bash|\bdate(\s+-u)?\s+\+|\$\(date\s|Get-Date/,
  },
  {
    // Claude Code's hook entrypoints by name. Prose says "managed-artifact
    // enforcement" and cites _host-invocation.md; the Codex adapters wire
    // different scripts and block at Stop (v9.153.1).
    name: 'claude-hook-names',
    pattern: /`(pre-write-validate|post-write-verify|post-write-auto-stage|post-write-render|pre-tool-use-all|post-tool-use-all|session-start-orient|leak-guard-(bash|write))(\.mjs)?`|\bhooks\/hooks\.json\b/,
  },
  {
    // Host names in skill prose. Availability annotations are permitted data:
    // "<host> only" and "both hosts" phrasings are excluded per line.
    name: 'host-names',
    pattern: /\bClaude Code\b|\bCodex\b|\bpi-code\b|\bpi\b/,
    lineExclude: /(Claude Code|Codex|pi)[- ]only|both hosts|either host|every host|Codex (and|or) pi/,
  },
  {
    // Prose that describes the deleted two-tree layout.
    name: 'stale-tree',
    pattern: /sdlc-workflow-codex|\.\.\/references\/|native-operating-model|the Codex build|the Claude build|handwritten for Codex|mirrored (in)?to the (Codex|Claude|codex|claude)/,
  },
  {
    name: 'retired-router',
    pattern: /\$wf-(intake|shape|slice|plan|implement|verify|review|handoff|ship|retro|hotfix|quick|design|meta|docs)\b/,
  },
];

function* walk(dir) {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const name of entries) {
    const p = join(dir, name);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) yield* walk(p);
    else if (TEXT.test(name)) yield p;
  }
}

function inFence(lines) {
  // Mark lines inside ``` fences: a literal shell command block may name `date -u`.
  const fenced = new Array(lines.length).fill(false);
  let open = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*```/.test(lines[i])) { open = !open; fenced[i] = true; continue; }
    fenced[i] = open;
  }
  return fenced;
}

export function scan(root = ROOT) {
  const findings = [];
  const contract = new Set(CONTRACT_FILES);
  for (const dir of SCAN_DIRS) {
    for (const file of walk(join(root, dir))) {
      const rel = relative(root, file).replace(/\\/g, '/');
      if (contract.has(rel)) continue;
      const exempt = new Set(DATA_EXCEPTIONS[rel] ?? []);
      const lines = readFileSync(file, 'utf-8').split(/\r?\n/);
      const fenced = inFence(lines);
      for (const family of FAMILIES) {
        if (exempt.has(family.name)) continue;
        for (let i = 0; i < lines.length; i++) {
          if (!family.pattern.test(lines[i])) continue;
          if (family.lineExclude && family.lineExclude.test(lines[i])) continue;
          // A fenced code block is a literal command or data sample, not prose —
          // except for the sigil and plugin-root families, which are wrong anywhere.
          if (fenced[i] && !['invocation-sigil', 'plugin-root', 'stale-tree'].includes(family.name)) continue;
          findings.push({ family: family.name, file: rel, line: i + 1, text: lines[i].trim() });
        }
      }
    }
  }
  return findings;
}

// ── Burndown allowlist: monotone, merge-base checked ──────────────────────────────
function readAllowlist() {
  try { return JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf-8')); } catch { return { files: [] }; }
}

function mergeBaseAllowlist() {
  // The list at the merge base with the remote default branch. Outside a git
  // checkout with that ref (a fresh clone, an offline box, a marketplace
  // snapshot) this degrades to baseline-only and SAYS so.
  let base;
  try {
    base = execFileSync('git', ['-C', ROOT, 'merge-base', 'origin/master', 'HEAD'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (err) {
    return { ok: false, reason: 'no origin/master merge base in this checkout' };
  }
  const rel = 'plugins/sdlc-workflow/scripts/host-neutrality-allowlist.json';
  try {
    const text = execFileSync('git', ['-C', ROOT, 'show', `${base}:${rel}`], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
    return { ok: true, files: JSON.parse(text).files ?? [] };
  } catch {
    // The list does not exist at the merge base: this branch carries the initial
    // baseline commit — the one privileged write. Everything after it only shrinks.
    return { ok: true, files: [], baseline: true };
  }
}

export function checkAllowlist(findings) {
  const problems = [];
  const allow = readAllowlist();
  const files = Array.isArray(allow.files) ? allow.files : [];
  const matched = new Set(findings.map((f) => f.file));
  for (const rel of files) {
    if (!existsSync(join(ROOT, rel))) problems.push(`stale allowlist entry (file missing): ${rel}`);
    else if (!matched.has(rel)) problems.push(`stale allowlist entry (no longer matches any family): ${rel}`);
  }
  const base = mergeBaseAllowlist();
  let note = null;
  if (base.ok) {
    const baseSet = new Set(base.files);
    for (const rel of files) if (!baseSet.has(rel)) problems.push(`allowlist grew: ${rel} was not in the merge-base list — the burndown list only shrinks`);
  } else {
    note = `allowlist monotonicity: merge-base comparison unavailable (${base.reason}); checked the baseline only`;
  }
  return { problems, allowed: new Set(files), note };
}

function main() {
  if (list) {
    console.log('families:');
    for (const f of FAMILIES) console.log(`  ${f.name.padEnd(18)} ${f.pattern}`);
    console.log('permanent exceptions:');
    for (const f of CONTRACT_FILES) console.log(`  ${f}  (all families)`);
    for (const [f, fams] of Object.entries(DATA_EXCEPTIONS)) console.log(`  ${f}  (${fams.join(', ')})`);
    return;
  }
  const findings = scan();
  const { problems, allowed, note } = checkAllowlist(findings);
  const live = findings.filter((f) => !allowed.has(f.file));
  if (asJson) {
    console.log(JSON.stringify({ findings: live, allowlisted: findings.length - live.length, problems, note }, null, 2));
    process.exit(live.length || problems.length ? 1 : 0);
  }
  if (note) console.error(`[host-neutrality] NOTE: ${note}`);
  if (problems.length) {
    console.error(`[host-neutrality] allowlist problems (${problems.length}):`);
    for (const p of problems) console.error(`  - ${p}`);
  }
  if (live.length) {
    console.error(`[host-neutrality] ${live.length} finding(s)\n`);
    for (const f of live) console.error(`  [${f.family}] ${f.file}:${f.line}\n    ${f.text.slice(0, 160)}`);
    console.error('\nSkill prose is host-neutral. State the intent and cite _host-invocation.md,');
    console.error('_gate-question.md, _subagents.md, or _timestamp.md. A genuinely new host mechanic');
    console.error('belongs in one of those files; growing the exception list means editing this gate.');
  }
  if (live.length || problems.length) process.exit(1);
  console.log(`[host-neutrality] clean — ${FAMILIES.length} families, ${findings.length - live.length} allowlisted hit(s), ${CONTRACT_FILES.length} contract files`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1].replace(/\\/g, '/').replace(/^([a-z]):/i, (m) => m.toUpperCase()) ||
    process.argv[1] && fileURLToPath(import.meta.url).toLowerCase() === process.argv[1].toLowerCase()) {
  main();
}
