#!/usr/bin/env node
// Writes a throwaway repository for live tests of the Claude Code mod
// (docs/internal/MOD-FEATURES.md §5): two workflows under .ai/workflows, a
// roster with one verified and one defined slice, the stage artifacts the
// `/wf plan` and `/wf implement` Step 0 gates read (a confirmed `stack:`
// block, a shape with its augmentation plan and NFRs, one file per slice),
// a cost ledger, a review ledger pair, a driver journal whose newest beat is
// two minutes old, and a ship-plan audit with open and acknowledged
// findings. Nothing here reaches the hub or any real project.
//
//   node scripts/mod-fixture.mjs <dir>        create or refresh <dir>
//   node scripts/mod-fixture.mjs <dir> --dead  the same, with a driver journal
//                                              whose newest beat is 25 minutes
//                                              old (past the 20-minute floor)
//
// Then, in PowerShell:
//   cd <dir>; $env:CLAUDE_CODE_ENABLE_FUNCTION_HOOKS = "1"; claude --debug
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const dir = process.argv[2];
const isDead = process.argv.includes('--dead');
if (!dir) {
  console.error('usage: node scripts/mod-fixture.mjs <dir>');
  process.exit(2);
}
const root = resolve(dir);
const wf = join(root, '.ai', 'workflows');
const alpha = join(wf, 'alpha-flow');
const beta = join(wf, 'beta-closed');
for (const d of [alpha, beta, join(root, 'src'), join(root, 'test')]) mkdirSync(d, { recursive: true });

const write = (path, text) => writeFileSync(path, text.replace(/^\n/, ''), 'utf8');
const at = (msAgo) => new Date(Date.now() - msAgo).toISOString();
const DAY = 24 * 60 * 60_000;
const created = at(3 * DAY);

write(join(root, 'README.md'), `
# mod fixture

A throwaway repository for the sdlc-workflow Claude Code mod. Delete it when done.
`);
write(join(root, '.gitignore'), `
.scratch/
node_modules/
`);
write(join(root, 'package.json'), `
{
  "name": "wf-mod-fixture",
  "private": true,
  "type": "module",
  "scripts": { "test": "node --test test/index.test.js" }
}
`);
write(join(root, 'src', 'index.js'), `
export const answer = 42;

/** The session token store the auth slice landed. */
export const sessions = new Map();

export function signIn(user) {
  const token = \`t-\${user}-\${sessions.size + 1}\`;
  sessions.set(token, user);
  return token;
}
`);
write(join(root, 'test', 'index.test.js'), `
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { answer, sessions, signIn } from '../src/index.js';

test('the answer', () => assert.equal(answer, 42));
test('sign-in stores a token', () => {
  const token = signIn('ada');
  assert.equal(sessions.get(token), 'ada');
});
`);

write(join(wf, 'INDEX.md'), `
# Workflows

- alpha-flow — active, implement, slice auth
- beta-closed — closed
`);

// The closed workflow first, so the active one's index is the newer file.
write(join(beta, '00-index.md'), `
---
schema: sdlc/v1
type: index
slug: beta-closed
title: "Beta"
status: closed
current-stage: retro
stage-number: 9
created-at: "${at(10 * DAY)}"
updated-at: "${at(6 * DAY)}"
selected-slice: ""
branch-strategy: none
branch: ""
base-branch: "master"
review-scope: slug-wide
review-scope-confirmed: true
appetite: small
pr-url: ""
pr-number: 0
open-questions: []
tags: []
next-command: wf-status
next-invocation: "/wf status beta-closed"
workflow-files:
  - 00-index.md
progress:
  intake: complete
  shape: complete
  slice: skipped
  plan: complete
  implement: complete
  verify: complete
  review: complete
  handoff: complete
---

# beta-closed

A closed fixture workflow. It carries no roster and no ledger.
`);

write(join(alpha, '00-index.md'), `
---
schema: sdlc/v1
type: index
slug: alpha-flow
title: "Alpha flow"
status: active
current-stage: implement
stage-number: 5
created-at: "${created}"
updated-at: "${at(30 * 60_000)}"
selected-slice: auth
branch-strategy: dedicated
branch: "feat/alpha-flow"
base-branch: "master"
review-scope: per-slice
review-scope-confirmed: true
appetite: small
pr-url: ""
pr-number: 0
open-questions: []
tags: [fixture]
stack:
  detected-at: "${created}"
  platforms: [node]
  languages: [javascript]
  ui: []
  build: []
  package-managers: [npm]
  testing: [node-test]
  observability: []
  integrations: []
  available-skills: []
  available-mcp: []
  user-confirmed: true
charter:
  - id: C1
    commitment: "Sign-in never stores a password; only a session token."
    status: honored
next-command: wf-verify
next-invocation: "/wf verify alpha-flow auth"
workflow-files:
  - 00-index.md
  - 01-intake.md
  - 02-shape.md
  - 03-slice.md
  - 03-slice-auth.md
  - 03-slice-ui.md
  - 04-plan-auth.md
  - 05-implement-auth.md
  - 06-verify-auth.md
  - 07-review-auth.md
progress:
  intake: complete
  shape: complete
  slice: complete
  plan: complete
  implement: in-progress
  verify: not-started
  review: not-started
  handoff: not-started
---

# alpha-flow

A fixture workflow with two slices: auth (verified) and ui (defined).
`);
write(join(alpha, 'po-answers.md'), `
---
schema: sdlc/v1
type: po-answers
slug: alpha-flow
---

# PO answers

- stage: intake — appetite small; the stack block is confirmed as detected.
- stage: slice — review scope per-slice.
`);
write(join(alpha, '01-intake.md'), `
---
schema: sdlc/v1
type: intake
slug: alpha-flow
status: complete
stage-number: 1
created-at: "${created}"
updated-at: "${created}"
tags: []
refs:
  index: 00-index.md
  next: 02-shape.md
next-command: wf-shape
next-invocation: "/wf shape alpha-flow"
---

# Intake

## The Intake

The fixture repository has one module and one test. The PO wants a sign-in
that stores a session token, and a small status view over the tokens. The
stack is Node with the built-in test runner; the PO confirmed it.

## Problem

Nothing signs a user in.

## Desired outcome

A sign-in function and a status view, each with a test.
`);
write(join(alpha, '02-shape.md'), `
---
schema: sdlc/v1
type: shape
slug: alpha-flow
status: complete
stage-number: 2
created-at: "${at(2 * DAY)}"
updated-at: "${at(2 * DAY)}"
docs-needed: false
docs-types: []
augmentations-needed: []
charter-scenario: "none — fixture"
tags: []
refs:
  index: 00-index.md
  intake: 01-intake.md
  next: 03-slice.md
next-command: wf-slice
next-invocation: "/wf slice alpha-flow"
---

# Shape

## The Shape

Intake handed over one problem: nothing signs a user in. Shape keeps two
outcomes, a sign-in function and a status view, and drops password storage
per charter commitment C1. The next stage cuts the two outcomes into slices.

## Problem Statement

Nothing signs a user in.

## Primary Actor / User

A developer of the fixture.

## Desired Behavior

\`signIn(user)\` returns a token and stores it; a status view lists the tokens.

## Ambiguity Inventory

- **AMB-1** — where tokens live — source: 01-intake.md#Desired outcome — state: closed (round 1: in memory)

## Acceptance Criteria

- Given a user name, When \`signIn\` runs, Then a token is returned and stored. (automated)
- Given two stored tokens, When the status view renders, Then both are listed. (automated)

## Non-Functional Requirements

- Sign-in completes in under 5 ms in the test runner. yields-to: C1

## Edge Cases / Failure Modes

- An empty user name is refused.

## Affected Areas

- src/index.js, test/index.test.js

## Dependencies / Sequencing Notes

- The status view reads the token store the auth slice lands.

## Questions Asked This Stage

- Round 1: where do tokens live? (closed AMB-1)

## Answers Captured This Stage

- In memory.

## Out of Scope

- Password storage — charter C1.

## Intake Fidelity

| Intake directive | Disposition | How | Authority |
|---|---|---|---|
| sign-in stores a token | honored | signIn | quoted PO answer |

## Definition of Done

Both acceptance criteria pass under \`npm test\`.

## Verification Strategy

Automated only — no interactive verification needed. The fixture has no UI runtime.

## Documentation Plan

None required — fixture.

## Augmentation Plan

None required — the fixture has no dark path and no perf budget. \`augmentations-needed: []\`.

## Freshness Research

- Source: node:test docs / Why it matters: the runner / Takeaway: \`node --test\` needs no dependency.

## Recommended Next Stage

- Option A (default): \`/wf slice alpha-flow\`.
`);
write(join(alpha, '03-slice.md'), `
---
schema: sdlc/v1
type: slice-index
slug: alpha-flow
status: complete
stage-number: 3
created-at: "${at(2 * DAY)}"
updated-at: "${at(2 * DAY)}"
total-slices: 2
best-first-slice: auth
tags: []
slices:
  - slug: auth
    status: complete
    complexity: s
    depends-on: []
  - slug: ui
    status: defined
    complexity: m
    depends-on: [auth]
refs:
  index: 00-index.md
  shape: 02-shape.md
next-command: wf-plan
next-invocation: "/wf plan alpha-flow auth"
---

# Slice Index

## The Slices

Shape handed over two outcomes. Two slices carry them: auth first, because
the status view reads the store auth lands. The next stage plans auth.

## Slice Strategy

One slice per outcome; one surface each.

## Recommended Order

1. auth — the store the second slice reads.
2. ui — the status view over the store.

## Cross-Cutting Concerns

None.

## Dependencies Between Slices

ui depends on auth.

## Deferred / Optional Slices

None.

## Freshness Research

None.

## Recommended Next Stage

- Option A (default): \`/wf plan alpha-flow auth\`.
`);
const sliceFile = (slice, status, complexity, dependsOn, goal, ac) => `
---
schema: sdlc/v1
type: slice
slug: alpha-flow
slice-slug: ${slice}
status: ${status}
stage-number: 3
created-at: "${at(2 * DAY)}"
updated-at: "${at(2 * DAY)}"
complexity: ${complexity}
depends-on: [${dependsOn}]
tags: []
refs:
  index: 00-index.md
  slice-index: 03-slice.md
  siblings: [03-slice-${slice === 'auth' ? 'ui' : 'auth'}.md]
  plan: 04-plan-${slice}.md
  implement: 05-implement-${slice}.md
---

# Slice: ${slice}

## The Slice

${goal}

## Goal

${goal}

## Why This Slice Exists

Shape named it as one outcome.

## Scope

In: ${slice === 'auth' ? 'signIn and the store' : 'the status view'}. Out: ${slice === 'auth' ? 'the status view (ui)' : 'the store (auth)'}.

## Acceptance Criteria

${ac}

## Dependencies on Other Slices

${dependsOn === '' ? 'None.' : `${dependsOn}: the token store.`}

## Risks

None.
`;
write(join(alpha, '03-slice-auth.md'), sliceFile('auth', 'complete', 's', '',
  'A sign-in function that returns a token and stores it.',
  `- Given a user name, When \`signIn\` runs, Then a token is returned and stored.
  <!-- observable: true — a unit test reads the store -->
  verify: { method: node --test, env: node 20+, fixture: none, rung: 1 }`));
write(join(alpha, '03-slice-ui.md'), sliceFile('ui', 'defined', 'm', 'auth',
  'A status view that lists the stored tokens.',
  `- Given two stored tokens, When the status view renders, Then both are listed.
  <!-- observable: true — a unit test renders to a string -->
  verify: { method: node --test, env: node 20+, fixture: two signIn calls, rung: 1 }`));
write(join(alpha, '04-plan-auth.md'), `
---
schema: sdlc/v1
type: plan
slug: alpha-flow
slice-slug: auth
status: complete
stage-number: 4
created-at: "${at(DAY)}"
updated-at: "${at(DAY)}"
metric-files-to-touch: 2
metric-step-count: 2
has-blockers: false
revision-count: 1
tags: []
refs:
  index: 00-index.md
  slice: 03-slice-auth.md
next-command: wf-implement
next-invocation: "/wf implement alpha-flow auth"
---

# Plan: auth

## The Plan

1. Add \`sessions\` and \`signIn\` to src/index.js.
2. Add the sign-in test.
`);
write(join(alpha, '05-implement-auth.md'), `
---
schema: sdlc/v1
type: implement
slug: alpha-flow
slice-slug: auth
status: complete
stage-number: 5
created-at: "${at(DAY)}"
updated-at: "${at(DAY)}"
metric-files-changed: 2
metric-lines-added: 12
metric-lines-removed: 0
metric-deviations-from-plan: 0
metric-review-fixes-applied: 0
commit-sha: ""
tags: []
refs:
  index: 00-index.md
  plan: 04-plan-auth.md
next-command: wf-verify
next-invocation: "/wf verify alpha-flow auth"
---

# Implement: auth

Both plan steps landed; \`npm test\` passes.
`);
write(join(alpha, '06-verify-auth.md'), `
---
schema: sdlc/v1
type: verify
slug: alpha-flow
slice-slug: auth
status: complete
stage-number: 6
created-at: "${at(DAY)}"
updated-at: "${at(DAY)}"
result: pass
metric-checks-run: 2
metric-checks-passed: 2
metric-acceptance-met: 1
metric-acceptance-total: 1
metric-interactive-checks-run: 0
metric-interactive-checks-passed: 0
metric-issues-found: 0
evidence-dir: ""
tags: []
refs:
  index: 00-index.md
  implement: 05-implement-auth.md
next-command: wf-review
next-invocation: "/wf review alpha-flow auth"
---

# Verify: auth

\`npm test\`: 2 passed.
`);
write(join(alpha, '07-review-auth.md'), `
---
schema: sdlc/v1
type: review
slug: alpha-flow
review-scope: per-slice
slice-slug: auth
status: complete
stage-number: 7
created-at: "${at(12 * 60 * 60_000)}"
updated-at: "${at(12 * 60 * 60_000)}"
verdict: ship-with-caveats
commands-run: [test]
metric-commands-run: 1
metric-findings-total: 3
metric-findings-raw: 3
metric-findings-blocker: 0
metric-findings-high: 1
metric-findings-med: 1
metric-findings-low: 1
metric-findings-nit: 0
tags: []
refs:
  index: 00-index.md
  verify: 06-verify-auth.md
next-command: wf-implement
next-invocation: "/wf implement alpha-flow reviews"
---

# Review auth

## All Findings

- [ ] r1 HIGH: token refresh races the logout handler
- [x] r2 LOW: unused import
- [ ] r3 MEDIUM: no test for the expired-token path
`);
write(join(alpha, '07-review-auth.yaml'), `
rev: 1
verdict: ship-with-caveats
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
// The newest beat is two minutes old; with --dead, 25 minutes old.
const beat = (minutesAgo) => at((minutesAgo + (isDead ? 23 : 0)) * 60_000);
write(join(alpha, '.driver-journal.jsonl'), [
  JSON.stringify({ at: beat(14), run, seq: 1, event: 'agent-start', agent: 'branch', phase: 'Orient', stage: 'branch' }),
  JSON.stringify({ at: beat(13), run, seq: 1, event: 'agent-end', agent: 'branch', phase: 'Orient', stage: 'branch', status: 'complete', errors: 0 }),
  JSON.stringify({ at: beat(12), run, seq: 2, event: 'agent-start', agent: 'implement:ui', phase: 'Drive', stage: 'implement', slice: 'ui' }),
  JSON.stringify({ at: beat(2), run, seq: 2, event: 'agent-end', agent: 'implement:ui', phase: 'Drive', stage: 'implement', slice: 'ui', status: 'complete', errors: 0 }),
].join('\n') + '\n');

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
console.log('expect: strip "wf alpha-flow · implement · slice auth (1 of 2 complete) · next: /wf verify alpha-flow auth" with "⇄ 1 more"');
console.log('expect: detail row "1.3M tokens workflow"; status line "next /wf verify alpha-flow auth · hub …"');
console.log('expect: dashboard "alpha-flow open findings 3 · ship-plan blockers 1"');
console.log(isDead
  ? 'expect: /wf yolo alpha-flow ui, interrupted at once, status "yolo · presumed dead since HH:MM · last: implement ui" and one toast'
  : 'expect: /wf yolo alpha-flow ui, interrupted at once, status "yolo · run … · implement ui · agent implement:ui · 14 min · last beat 2 min ago"');
