#!/usr/bin/env node
// scripts/verify-claudisms.mjs — regression gate for host-wording drift.
//
// The Codex tree is handwritten against the Codex platform contract; prose that
// names Claude-only tools, slash-command syntax, retired router spellings, or
// Bash-mandated mechanics is a "claudism" (see docs/internal/CLAUDISM-AUDIT.md).
// This gate re-runs the audit's scan families so fixed categories cannot regrow.
// Wired into `npm test`; exits 1 with a per-finding listing on any hit.
//
// Intentional-interop prose is NOT a claudism: historical-mapping lines
// ("the former `$wf-meta`"), host-mapping lines ("`AskUserQuestion` in Claude
// Code"), and the consult skill's `claude` provider are excluded by the
// per-family line filters / allowlist below rather than by weakening a pattern.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolveRoot();
function resolveRoot() {
  return join(dirname(fileURLToPath(import.meta.url)), '..');
}

const TEXT_EXT = /\.(md|json|ya?ml|mjs|js|txt)$/i;

// Files where a family match is intentional interop, keyed by family name.
// Paths are ROOT-relative with forward slashes.
const ALLOWLIST = {
  'ask-user-question': [
    // _gate-question.md's host-mapping line is excluded by the line filter;
    // nothing else may mention the Claude tool.
  ],
  'slash-command': [],
  'retired-router': [],
  'claude-tooling': [],
  'timestamp-mandate': [
    'skills/wf/reference/_timestamp.md', // the single source itself
  ],
  anthropic: [],
};

const FAMILIES = [
  {
    name: 'retired-router',
    dirs: ['skills', 'references', '.codex-plugin'],
    pattern: /\$wf-(intake|shape|slice|plan|implement|verify|review|handoff|ship|retro|hotfix|quick|design|meta|docs)\b/,
    // Historical-mapping prose is intentional (audit classification rule).
    lineExclude: /former|retired|absorbs|absorbed|replaces|is now|no longer/i,
  },
  {
    name: 'slash-command',
    dirs: ['skills', 'references', '.codex-plugin'],
    pattern: /\/compact\b|slash[ -]command/i,
  },
  {
    name: 'ask-user-question',
    dirs: ['skills', 'references', '.codex-plugin'],
    pattern: /AskUserQuestion/,
    // The gate-question ladder may name the Claude tool in host-mapping prose.
    lineExclude: /in Claude Code/,
  },
  {
    name: 'claude-tooling',
    dirs: ['skills', 'references', '.codex-plugin'],
    pattern: /mcp__claude|claude-api|claude-code-guide/i,
  },
  {
    name: 'timestamp-mandate',
    dirs: ['skills', 'references'],
    pattern: /via Bash|date -u \+|\$\(date \+/i,
  },
  {
    // Claude model tiers / Task-tool dispatch prose — Codex children are tiered
    // by reasoning effort (see skills/wf/reference/_subagents.md), not by
    // Anthropic model name.
    name: 'claude-model-pins',
    dirs: ['skills', 'references'],
    pattern: /\b(haiku|sonnet|opus)\b|`Task` (call|tool)|\bTask tool\b/i,
  },
  {
    name: 'anthropic',
    dirs: ['.codex-plugin', join('runtime', 'tests'), join('runtime', 'schemas')],
    pattern: /anthropic\.com/i,
  },
];

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) yield* walk(p);
    else if (TEXT_EXT.test(name)) yield p;
  }
}

const findings = [];
for (const family of FAMILIES) {
  const allow = new Set(ALLOWLIST[family.name] ?? []);
  for (const dir of family.dirs) {
    for (const file of walk(join(ROOT, dir))) {
      const rel = relative(ROOT, file).replace(/\\/g, '/');
      if (allow.has(rel)) continue;
      const lines = readFileSync(file, 'utf-8').split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (!family.pattern.test(lines[i])) continue;
        if (family.lineExclude && family.lineExclude.test(lines[i])) continue;
        findings.push({ family: family.name, file: rel, line: i + 1, text: lines[i].trim() });
      }
    }
  }
}

if (findings.length) {
  console.error(`verify-claudisms: ${findings.length} finding(s)\n`);
  for (const f of findings) {
    console.error(`  [${f.family}] ${f.file}:${f.line}\n    ${f.text.slice(0, 160)}`);
  }
  console.error(
    '\nFix the wording (see docs/internal/CLAUDISM-AUDIT.md), or — for genuine',
  );
  console.error(
    'interop prose — extend the line filter/allowlist in scripts/verify-claudisms.mjs.',
  );
  process.exit(1);
}

console.log('verify-claudisms: clean');
