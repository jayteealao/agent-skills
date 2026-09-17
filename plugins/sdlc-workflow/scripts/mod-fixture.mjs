#!/usr/bin/env node
// Writes a throwaway repository for live tests of the Claude Code mod
// (docs/internal/MOD-FEATURES.md §5): two workflows under .ai/workflows, a
// roster with one verified and one defined slice, a cost ledger, a review
// ledger pair, a driver journal whose newest beat is two minutes old, and a
// ship-plan audit with open and acknowledged findings. Nothing here reaches
// the hub or any real project.
//
//   node scripts/mod-fixture.mjs <dir>        create or refresh <dir>
//
// Then: cd <dir> && CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude --debug
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const dir = process.argv[2];
if (!dir) {
  console.error('usage: node scripts/mod-fixture.mjs <dir>');
  process.exit(2);
}
const root = resolve(dir);
const wf = join(root, '.ai', 'workflows');
const alpha = join(wf, 'alpha-flow');
const beta = join(wf, 'beta-closed');
for (const d of [alpha, beta, join(root, 'src')]) mkdirSync(d, { recursive: true });

const write = (path, text) => writeFileSync(path, text.replace(/^\n/, ''), 'utf8');
const at = (msAgo) => new Date(Date.now() - msAgo).toISOString();

write(join(root, 'README.md'), `
# mod fixture

A throwaway repository for the sdlc-workflow Claude Code mod. Delete it when done.
`);
write(join(root, '.gitignore'), `
.scratch/
node_modules/
`);
write(join(root, 'src', 'index.js'), `export const answer = 42;\n`);

write(join(wf, 'INDEX.md'), `
# Workflows

- alpha-flow — active, implement, slice auth
- beta-closed — closed
`);

write(join(alpha, '00-index.md'), `
---
slug: alpha-flow
title: Alpha flow
status: active
current-stage: implement
selected-slice: auth
next-invocation: /wf verify alpha-flow auth
---

# alpha-flow

A fixture workflow with two slices: auth (verified) and ui (defined).
`);
write(join(alpha, '01-intake.md'), `
---
slug: alpha-flow
type: intake
---

# Intake

Fixture intake record.
`);
write(join(alpha, '02-shape.md'), `
---
slug: alpha-flow
type: shape
---

# Shape

Fixture shape record.
`);
write(join(alpha, '03-slice.md'), `
---
slug: alpha-flow
type: slice
slices:
  - slug: auth
    status: complete
    complexity: s
  - slug: ui
    status: defined
    complexity: m
---

# Slices

- auth — complete
- ui — defined
`);
write(join(alpha, '04-plan-auth.md'), `---\nslug: alpha-flow\ntype: plan\nslice: auth\n---\n\n# Plan auth\n`);
write(join(alpha, '05-implement-auth.md'), `---\nslug: alpha-flow\ntype: implement\nslice: auth\n---\n\n# Implement auth\n`);
write(join(alpha, '06-verify-auth.md'), `---\nslug: alpha-flow\ntype: verify\nslice: auth\n---\n\n# Verify auth\n`);
write(join(alpha, '07-review-auth.md'), `
---
slug: alpha-flow
type: review
slice: auth
---

# Review auth

## All Findings

- [ ] r1 HIGH: token refresh races the logout handler
- [x] r2 LOW: unused import
- [ ] r3 MEDIUM: no test for the expired-token path
`);
write(join(alpha, '07-review-auth.yaml'), `
rev: 1
verdict: changes-requested
findings:
  - id: r1
    severity: HIGH
    dimension: correctness
    status: open
  - id: r3
    severity: MEDIUM
    dimension: testing
    status: deferred
  - id: r4
    severity: LOW
    dimension: maintainability
    status: could-not-fix
counts:
  open: 3
`);
write(join(alpha, 'cost.jsonl'), [
  JSON.stringify({ turn: 1, key: 'plan', slug: 'alpha-flow', main: { model: 'claude-opus-5', input_tokens: 120000, output_tokens: 8000, cache_read_input_tokens: 400000 }, subagents: [] }),
  JSON.stringify({ turn: 2, key: 'implement', slug: 'alpha-flow', main: { model: 'claude-opus-5', input_tokens: 200000, output_tokens: 20000, cache_read_input_tokens: 500000 }, subagents: [{ agent_id: 'a1', input_tokens: 30000, output_tokens: 4000 }] }),
].join('\n') + '\n');
const run = `${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z-alpha-flow`;
write(join(alpha, '.driver-journal.jsonl'), [
  JSON.stringify({ at: at(14 * 60_000), run, seq: 1, event: 'agent-start', agent: 'branch', phase: 'Orient', stage: 'branch' }),
  JSON.stringify({ at: at(13 * 60_000), run, seq: 1, event: 'agent-end', agent: 'branch', phase: 'Orient', stage: 'branch', status: 'complete', errors: 0 }),
  JSON.stringify({ at: at(12 * 60_000), run, seq: 2, event: 'agent-start', agent: 'implement:ui', phase: 'Drive', stage: 'implement', slice: 'ui' }),
  JSON.stringify({ at: at(2 * 60_000), run, seq: 2, event: 'agent-end', agent: 'implement:ui', phase: 'Drive', stage: 'implement', slice: 'ui', status: 'complete', errors: 0 }),
].join('\n') + '\n');

write(join(beta, '00-index.md'), `
---
slug: beta-closed
title: Beta
status: closed
current-stage: retro
---

# beta-closed

A closed fixture workflow.
`);

write(join(root, '.ai', 'ship-plan-audit.md'), `
---
kind: ship-plan-audit
last-run: 1
triage-status: pending
findings:
  - id: a1
    severity: BLOCKER
    status: open
    message: release notes name a version that is not tagged
  - id: a2
    severity: HIGH
    status: acknowledged
    message: no rollback note
  - id: a3
    severity: LOW
    status: open
    message: changelog wording
---

# Ship-plan audit

Fixture ledger: one open BLOCKER, one acknowledged HIGH, one open LOW.
`);

if (!existsSync(join(root, '.git'))) {
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  execFileSync('git', ['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-q', '-m', 'fixture'], { cwd: root });
}
console.log(`fixture ready: ${root}`);
console.log('expect: strip "wf alpha-flow · implement · slice auth (1 of 2 complete) · next: /wf verify alpha-flow auth"');
console.log('expect: detail row "1.3M tokens workflow · sdlc hub …"; dashboard "alpha-flow open findings 3 · ship-plan blockers 1"');
console.log('expect: /wf yolo alpha-flow status "yolo · run … · implement ui · agent implement:ui · 14 min · last beat 2 min ago"');
