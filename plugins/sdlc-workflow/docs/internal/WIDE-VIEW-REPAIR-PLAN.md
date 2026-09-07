# Wide-View Repair Plan — prose budget, capability shield, exact cost ledger, runtime repair

Status: **DRAFTED 2026-09-04, W11 added 2026-09-05. W0, W1 (line budgets; word targets
closed through §16 raises), W2 BUILT 2026-09-05, W3, W4, W7, W8, W9, W10, W11.1–W11.9 (step 1) BUILT 2026-09-07**; eval baseline run
pending (§16); W6 onward in progress — see the build ledger in §17. Source: a whole-tree survey of
`plugins/sdlc-workflow` on 2026-09-04 against v9.153.4 (`6465707f`). Another
session carried `_shell.mjs`, `nav.html`, and the root catalog to 9.153.5 while
this plan was written. Every count below is a v9.153.4 count. W0 re-measures
every count before the first edit.

Related: [CLAUDE5-PROMPTING-REPAIR-PLAN.md](CLAUDE5-PROMPTING-REPAIR-PLAN.md)
(BUILT v9.152.0 — the rubric strip this plan continues),
[SINGLE-SOURCE-PLAN.md](SINGLE-SOURCE-PLAN.md) (BUILT v9.153.0 — the
neutrality gate this plan copies as a pattern),
[PROGRESSIVE-DISCLOSURE-AUDIT.md](PROGRESSIVE-DISCLOSURE-AUDIT.md) (proposals
this plan supersedes in part).

Scope: items 1, 2, 3, 4, 6, 7, 8, 9, and 10 of the 2026-09-04 review. Item 5
(the view-layer split) is not a wave. §13 makes the case for it and asks for a
decision. §14 (W11) adds the 2026-09-05 runtime review: the runtime stays in
the plugin, and eleven in-place changes repair how it is installed, observed,
started, and bounded.

## 1. Goal

Cut the instruction volume the model loads per `/wf` invocation to one third,
merge the review rubrics, delete migration debt from the dispatcher, and make
every gate that guards the cut deterministic. Add an exact token ledger per
workflow. Freeze the surface. Do all of this with zero capability loss, proven
by an inventory diff and by behavior evals that run before and after.

### 1.1 Baseline — words the model loads per key

Measured 2026-09-05 by `scripts/measure-load.mjs` (W0) against the committed tree at `e0da4d4c`. One number cannot say
what is certain and what is optional, so the script reports three per key.

- **Core** is `SKILL.md` plus the key body. It is always in context.
- **Instructed** is core plus every file a sentence orders the model to read
  ("Load `intake/default.md`", "Read `review/_stage.md` in full", "Apply the
  rule in `_output-boundary.md`"), followed transitively. A load verb whose
  object is the citation makes the order; "per X" and "see X" do not. Sibling
  alternatives in one directory (an intake mode, a design home, an
  augmentation) are one branch, and the largest counts once.
- **Referenced** is instructed plus every "per X" and "see X" citation,
  followed transitively. It is the upper bound if the model opens everything.
  It carries no target.

Targets derive from the W1 budget classes in §4.1 at 11 words per line. Core
≤ dispatcher (120 lines) + stage body (250 lines) = 4,050 words for every key.
Instructed ≤ the sum of the class budgets of the files in the chosen branch,
so a key that orders three shared contracts and one sub-procedure gets a
higher target than a key that orders none. `load-baseline.json` records the
file list behind every number.

| Key | Core files | Core words | Instructed files | Instructed words | Referenced files | Referenced words | Target core | Target instructed |
|---|---|---|---|---|---|---|---|---|
| handoff | 2 | 13,260 | 16 | 33,568 | 22 | 38,104 | ≤ 4,050 | ≤ 19,700 |
| ship | 2 | 10,665 | 12 | 28,748 | 20 | 34,819 | ≤ 4,050 | ≤ 18,600 |
| probe | 2 | 8,591 | 12 | 24,816 | 17 | 28,610 | ≤ 4,050 | ≤ 14,200 |
| plan | 2 | 12,537 | 12 | 23,100 | 23 | 38,726 | ≤ 4,050 | ≤ 21,000 |
| verify | 2 | 16,445 | 12 | 22,879 | 19 | 28,139 | ≤ 4,050 | ≤ 13,750 |
| intake | 2 | 7,207 | 15 | 21,281 | 28 | 42,396 | ≤ 4,050 | ≤ 23,100 |
| implement | 2 | 9,122 | 15 | 20,437 | 23 | 25,891 | ≤ 4,050 | ≤ 26,050 |
| review | 2 | 4,809 | 13 | 19,826 | 20 | 25,086 | ≤ 4,050 | ≤ 16,500 |
| shape | 2 | 10,268 | 11 | 16,614 | 22 | 34,419 | ≤ 4,050 | ≤ 12,850 |
| slice | 2 | 7,251 | 12 | 15,116 | 21 | 29,838 | ≤ 4,050 | ≤ 18,600 |
| design | 2 | 6,235 | 12 | 14,875 | 21 | 21,456 | ≤ 4,050 | ≤ 21,000 |
| yolo | 2 | 10,111 | 9 | 14,374 | 18 | 21,205 | ≤ 4,050 | ≤ 11,100 |
| simplify | 2 | 7,783 | 10 | 13,552 | 22 | 30,517 | ≤ 4,050 | ≤ 12,000 |
| retro | 2 | 7,498 | 11 | 13,259 | 18 | 18,606 | ≤ 4,050 | ≤ 12,850 |
| status | 2 | 8,008 | 9 | 12,971 | 17 | 18,922 | ≤ 4,050 | ≤ 11,100 |
| docs | 2 | 6,527 | 9 | 11,586 | 18 | 18,116 | ≤ 4,050 | ≤ 13,550 |
| auto | 2 | 6,813 | 10 | 11,270 | 16 | 15,824 | ≤ 4,050 | ≤ 12,000 |
| task | 2 | 5,748 | 9 | 10,757 | 18 | 17,588 | ≤ 4,050 | ≤ 11,100 |
| recap | 2 | 6,215 | 8 | 10,298 | 14 | 14,852 | ≤ 4,050 | ≤ 10,250 |
| close | 2 | 5,342 | 8 | 9,425 | 14 | 13,979 | ≤ 4,050 | ≤ 10,250 |
| observability | 2 | 4,169 | 7 | 7,742 | 19 | 21,605 | ≤ 4,050 | ≤ 9,350 |
| ship-plan | 2 | 4,045 | 7 | 7,618 | 23 | 38,427 | ≤ 4,050 | ≤ 9,350 |

The first draft of this table (2026-09-04) counted markdown links to depth one.
That number mixed optional references with ordered loads and missed every
backticked load, so its "one third" targets are withdrawn. The true load per
stage is a runtime fact: the Read calls in the host transcript. The eval
harness records the session id per case, and W8 reads the same transcript, so
the instructed number is calibrated against real Read lists once headless auth
is available.

### 1.2 Baseline — the other counts this plan changes

| Measure | v9.153.4 | Target |
|---|---|---|
| Lines of prose under `skills/wf` | 43,434 in 152 files | ≤ 16,000 |
| Review rubric files | 35 (17,696 lines with `_stage.md`) | 11 (≤ 1,100 lines) |
| Code fences inside rubrics | 590 | ≤ 11 (one output-shape fence each) |
| `MANDATORY` | 205 | 0 |
| `CRITICAL` | 41 | 0 |
| `STOP` | 212 | one per real terminal condition (W0 counts them) |
| `MUST` (upper case) | 157 | 0 outside `_ste-procedural.md` |
| `NEVER` (upper case) | 21 | 0 outside `_ste-procedural.md` |
| `Do NOT` | 155 | 0 (lower-case imperative instead) |
| `verbatim` | 87 | 2 |
| Version strings (`v9.x`) in prose | 34 | 0 |
| Redirect lines for retired surfaces in `SKILL.md` | 7 lines, 2 callouts | 0 |
| Version carriers edited by hand per release | 8 | 1 |
| README lines | 1,085 (11 release blockquotes, 9 retired names) | ≤ 150 |
| Sentence-match assertions in skill tests | 339 `assert.match` | 0 that assert wording |

## 2. Design principles

- **A capability is what the prose makes the model do.** A capability is a
  gate, a STOP condition, an artifact written, a frontmatter field, a sub-agent
  dispatch, an invocation, a hook interaction, or a check. Wording is not a
  capability. Emphasis is not a capability.
- **Subtract, then compress.** Delete rationale, history, examples, and
  duplicates of a shared contract first. Compress what remains. Never delete a
  sentence that names a capability unless the inventory shows it elsewhere.
- **Every cut passes a machine gate before a human reads it.** The inventory
  diff (W0) runs on every commit. A reviewer pass reads only what the gate let
  through.
- **Ratchets, not cliffs.** A budget file records the current size of every
  over-budget file. A file may shrink. A file may not grow. The budget lowers
  per wave until it meets the target.
- **Hooks compute numbers. Prose never estimates them.** The cost ledger reads
  the host's transcript. No stage writes a token figure from memory.
- **One release per wave, in the order below.** W0 ships first and alone.

## 3. W0 — Regression shield (before any prose edit)

W0 produces three things: the capability inventory, the load metric, and the
eval baseline. Nothing in W1–W4 starts until W0 is on `origin/master`.

### 3.1 `scripts/extract-capabilities.mjs`

Walk every `skills/**/*.md`. For each file, extract these categories with the
stated rule. Output one JSON object per file.

| Category | Extraction rule | Compared |
|---|---|---|
| `artifacts` | every token matching `\b\d{2}[a-z]?-[a-z-]+(?:<[^>]+>)?\.(md\|yaml\|html\.fragment)\b`, placeholders normalized to `X` | per file |
| `fields` | every backticked token matching `` `[a-z][a-z0-9-]*:` `` (frontmatter keys) | tree-wide union |
| `gates` | every paragraph that cites `_gate-question.md`: record the first sentence of the paragraph, lower-cased, first eight words | per file |
| `stops` | every sentence containing `STOP`: record the sentence, lower-cased, first eight words | per file |
| `dispatches` | every heading matching `sub-agent \d` or `research sub-agent` or `reviewer`, and every sentence containing `dispatch` or `launch` with `sub-agent` | per file |
| `invocations` | every `/wf <key>[ <token>]` and every `/consult`, `/study-sources`, `/imagery`, `/uiproto`, `/diataxis` | tree-wide union |
| `config` | every `hooks.*`, `view.*`, `semantic.*`, `solutions.*`, `memory.*` key and every `SDLC_*` env var | tree-wide union |
| `citations` | every `[…](…​.md)` target, resolved to a path | tree-wide union |
| `rubric-checks` | inside `reference/review/*.md` only: every bullet under a heading matching `What to look for` or `Checks`, normalized to the first six words | per rubric group (see W4) |

Commit the output as `docs/internal/capability-inventory/baseline.json`.
Never edit the baseline by hand.

### 3.2 `scripts/verify-capabilities.mjs`

1. Re-extract the inventory from the working tree.
2. For every per-file category, every baseline entry must exist in the same
   file, or in a file named for it in `capability-inventory/moved.json`
   (`{from, to, entry}`), or in `capability-inventory/retired.json`
   (`{entry, reason, release}`).
3. For every tree-wide category, every baseline entry must exist somewhere in
   the tree, or in `retired.json`.
4. Exit 1 on any unexplained absence. Print the file, the category, and the
   entry.
5. Wire it as `npm run verify:capabilities`. Add it to `npm test` and to the CI
   `gates` job beside `verify:neutrality`.

`retired.json` is the audit trail. Every retirement names a reason. A reviewer
reads `retired.json` in every W1–W4 pull request.

### 3.3 Residual risk and its mitigation

The extractor cannot see a condition that has no marker, for example
"if the branch is behind base, rebase first" inside a step. Two mitigations
cover this gap.

- The cut rules in §4.3 forbid deleting any sentence with an imperative verb
  and a concrete object unless the same instruction exists in a cited shared
  contract. The reviewer pass reads for exactly this class.
- The behavior evals (W6) run the same fixture through the same stage before
  and after. A lost condition that changes the artifact shows in the diff.

### 3.4 `scripts/measure-load.mjs`

Report core, instructed, and referenced per key as §1.1 defines them, with the
derived targets. Commit the baseline as
`capability-inventory/load-baseline.json`. `verify:prose` (W1) fails when a
key's core or instructed load exceeds its target after the wave that owns
that file. Referenced is reported and never gated.

### 3.5 Sentence-test migration rule

The 339 `assert.match` calls in `tests/unit/skills/*.test.mjs` fail on
rewording. Apply one of three outcomes to each, in the same commit as the
rewrite that breaks it. Record the outcome in the commit body.

1. **Re-point.** The capability survived in new words. Update the pattern to
   the new sentence.
2. **Convert.** The capability is in the inventory. Replace the sentence match
   with an inventory lookup (`hasCapability(file, category, entry)` helper in
   `tests/helpers/`).
3. **Delete.** The assertion guards wording only. Delete it and name the test
   in the commit body.

Blanket deletion of a test file is not an outcome.

### 3.6 Eval baseline

Run the W6 harness once against v9.153.4 prose and store the results under
`tests/evals/baseline/`. W6 builds the harness; W0 runs it. Build W6's harness
inside the W0 release for this reason. The cost ledger (W8) is not yet built at
W0, so the baseline records the `--output-format json` usage block the harness
already receives per run.

## 4. W1 — Line budgets

### 4.1 Budget classes

| Class | Files | Budget (lines) | Largest today |
|---|---|---|---|
| dispatcher | `SKILL.md` | 120 | 175 |
| stage body | `reference/<key>.md` for the 22 keys, `review/_stage.md`, `intake/<mode>.md` | 250 | `verify.md` 899, `_stage.md` 784, `plan.md` 744 |
| shared contract | `reference/_*.md` | 80 | `_ship-plan-readiness.md` 260, `_pr-ci-handoff.md` 227, `_surface-defects.md` 225 |
| rule set | `_ste-procedural.md`, `_story-arc.md` | 120 | 118, 53 |
| rubric | `review/<dimension>.md` | 100 | `dx.md` 1,083 |
| sub-procedure | `design/*.md`, `augment/*.md`, `ship/*.md`, `ship-plan/*.md`, `observability/*.md`, `docs/*.md` | 300 | `ship-plan/build.md` 1,146, `augment/wide-event-observability.md` 918 |
| template | `ship-plan/ship-plan-templates/*.md` | 150 | 147 |
| adapter | `runtime-adapters/<stack>.md` (split from `runtime-adapters.md`) | 120 each | 745 as one file |

### 4.2 `scripts/verify-prose-budget.mjs` and `prose-budget.json`

1. `prose-budget.json` holds the class budgets above and an `exceptions` map:
   `{ "<path>": <current line count> }` for every file over its class budget
   at W1 start.
2. The gate fails when a file exceeds its class budget and is not in
   `exceptions`, or when a file in `exceptions` exceeds its recorded count.
3. When a file shrinks, the commit lowers its `exceptions` entry to the new
   count. When a file meets its budget, the commit removes the entry.
4. The gate also fails on: any `\bv9\.\d+` in `skills/**/*.md`; any code fence
   in a rubric other than one fence tagged `yaml`; any file in `skills/` over
   1,200 lines regardless of class.
5. Wire it as `npm run verify:prose` (this gate plus §6's emphasis gate plus
   §3.4's load gate). Add it to `npm test` and the CI `gates` job.

### 4.3 Cut rules

A paragraph or sentence may be deleted when it is one of:

- rationale ("because", "the reason", "this exists so that");
- history (a version string, "formerly", "the old", "absorbs the former");
- an example of an output the schema section already defines;
- a duplicate of a rule in a cited shared contract;
- a restatement of an earlier step in the same file.

A sentence must survive, in the same file, when it names a capability (§2) or
contains an imperative verb with a concrete object that no cited contract
carries. Compress it. Do not delete it.

### 4.4 Progressive-disclosure splits

These splits move words out of the default load without deleting them.

- `runtime-adapters.md` (745) → `runtime-adapters/<stack>.md`, one per stack
  fingerprint the file already sections. `verify.md` loads only the file
  matching `stack:` in `00-index.md`.
- `ship-plan/build.md` (1,146) → `ship-plan/build.md` (the sequence, ≤ 150)
  plus `ship-plan/build/<block>.md`, one per Block A–K. The sequence loads a
  block only when the plan enables it.
- `augment/wide-event-observability.md` (918) → loaded only when
  `augmentations-needed` names it. Confirm this is already true; if not, make
  it true.
- `_surface-defects.md` (225) → keep the taxonomy table (≤ 80), move the
  worked descriptions to `docs/site/reference/`.

### 4.5 Order of work

Cut the largest loads first, one file per commit, each commit green on
`verify:capabilities`, `verify:prose`, and `npm test`.

1. `SKILL.md` (with W2).
2. `plan.md`, `shape.md`, `handoff.md`, `verify.md`, `slice.md`, `ship.md`,
   `implement.md`.
3. The shared contracts over budget.
4. The intake modes, then the remaining keys.
5. The sub-procedures and the splits in §4.4.

### 4.6 Exit criteria

- `measure-load` shows every key within its §1.1 core target and instructed target.
- `prose-budget.json` has no `exceptions` entry for a stage body or shared
  contract.
- `verify:capabilities` passes with every retirement explained.
- W6 evals produce the same artifact set with valid frontmatter on every case.

## 5. W2 — Delete the retired-surface redirects

### 5.1 What goes

- `SKILL.md` Step 0 resolution rule 3, the six redirect bullets (lines 93–98
  at v9.153.4): `quick`, the `wf-meta` members, `wf-docs`, the augmentation
  keys, `setup-wide-logging`.
- The callout "**The dissolve.**" and the paragraph "**`/wf review` is the
  whole review surface.**" (both restate history).
- The parenthetical "(absorbs the old `next`)", "(renamed from `resume`)",
  "(the former `/wf-docs`)", "(the former `amend ship-plan`)" and every
  sibling inside the key table.

Rule 3 becomes one sentence: name the token, list the 22 keys, stop.

### 5.2 Where the mapping lives instead

Add a "Renamed commands" table to `docs/site/reference/commands.html` with the
six groups and their current spellings. `verify:docs` asserts the table
exists and names each retired surface once. No capability is lost. The
mapping moves out of the hot path into documentation.

### 5.3 Regression check

The `invocations` category of the inventory holds every `/wf …` form. The
redirect text contains no invocation that the key table lacks. `retired.json`
records the six redirect entries with reason `migration text older than five
months`.

## 6. W3 — Emphasis vocabulary

### 6.1 Rules

| Token | Rule after W3 | Allowed count |
|---|---|---|
| `MANDATORY` | Delete the word. A heading is a step. Steps are done. | 0 |
| `CRITICAL — execution discipline` | Rename the block `# Role`. Keep at most five lines. | 0 |
| `MUST`, `NEVER` (upper case) | Rewrite as a lower-case imperative per STE I1. | 0 outside `_ste-procedural.md` |
| `Do NOT` | Rewrite as `Do not`. | 0 |
| `STOP` | Allowed only as the first word of a sentence that ends the procedure and names what to tell the user. | one per terminal condition in the W0 `stops` inventory |
| `verbatim` | Allowed in `SKILL.md` ("follow the reference verbatim") and in `review/_stage.md` ("quote the criterion verbatim"). | 2 |
| `WARNING`, `CAUTION` | Unchanged. STE S1 grades. | as needed |

### 6.2 Gate

`verify-prose-budget.mjs` counts each token across `skills/**/*.md` and fails
above the allowed count. STOP is a per-sentence rule (`tokens.STOP.sentences:
"stops"`): every sentence carrying STOP must key a W0 `stops` entry, resolved
through `moved.json`, `reworded.json`, and `retired.json`, or an
`allowedSentences` entry with a reason; one sentence carries one STOP. A
per-file count could not express this: two files hold two terminal conditions
with identical wording, which the inventory deduplicates to one key (W3 build
note, 2026-09-07). Two allowances stand: trivy's `--severity HIGH,CRITICAL` in
the container-image template (tool vocabulary), and three quoted example
strings inside rubric code fences, ratcheted until W4 deletes the fences.

### 6.3 Regression argument

The word carries no capability. The sentence does. The `gates` and `stops`
categories of the inventory are keyed on the sentence, not the token, so a
rewrite from "MUST read `02c-craft.md`" to "Read `02c-craft.md`" keeps the
entry.

## 7. W4 — Merge the review rubrics 35 → 11

### 7.1 Mapping

Every surviving name is an existing dimension name, so no artifact on disk
changes type and no renderer changes.

| Merged rubric | Absorbs |
|---|---|
| `correctness` | correctness, testing, data-integrity, backend-concurrency, reliability |
| `security` | security, infra-security, supply-chain, privacy |
| `performance` | performance, frontend-performance, scalability, cost |
| `architecture` | architecture, maintainability, overengineering, code-simplification, style-consistency, refactor-safety |
| `api-contracts` | api-contracts, migrations |
| `accessibility` | accessibility, frontend-accessibility |
| `interface-craft` | interface-craft, motion |
| `docs` | docs, ux-copy, ste-compliance |
| `observability` | observability, logging |
| `infra` | infra, ci, release, dx |
| `intent-fidelity` | intent-fidelity |

`design-audit` and `design-critique` stay where they are (`design/audit.md`,
`design/critique.md`).

### 7.2 Aliases and focus

1. Every absorbed name stays a valid key. `review.md` carries an alias table:
   alias → merged rubric + `focus` section name.
2. Each merged rubric sections its "What to look for" list with one `###`
   heading per absorbed name.
3. When a user or a selection rule names an alias, the dispatched reviewer
   receives `focus: <alias>` and reads only that section plus the shared
   severity calibration. `/wf review logging` stays as narrow as today.
4. Aggregates re-compose over merged names: `all` → 11 reviewers (was 35);
   `pre-merge` → correctness, security, architecture; `architecture` →
   architecture, performance, api-contracts; `infra` → infra, observability,
   api-contracts; `ux` → accessibility, interface-craft, docs,
   performance(focus frontend-performance); `quick` → correctness,
   architecture, docs. The `security` aggregate becomes the `security`
   rubric; `sweep security` resolves to it.

### 7.3 Selection rules in `_stage.md` Step 2

Rewrite each trigger to name the merged rubric and, where the trigger was an
absorbed name, the focus: for example "adds async behaviour →
`correctness` (focus backend-concurrency)". The floor stays four
(correctness, security, architecture, intent-fidelity for lifecycle slugs).
The maximum becomes 11.

### 7.4 Rubric shape (≤ 100 lines)

1. Role, three lines.
2. What to look for, one `###` per absorbed name, bullets only, no code.
3. Severity calibration, ≤ 10 lines, shared wording across all 11.
4. Output shape, one `yaml` fence.

### 7.5 Regression gate

Build note (2026-09-07): the extractor keyed checks under `PRIMARY QUESTIONS` /
`NON-NEGOTIABLES` only; the §7.4 shape has neither, so the check headings now
include `What to look for` and `Severity calibration`, and a `###` alias section
stays inside the block. Dropping the rubric `args:` frontmatter retired the
tree-wide `args:` field; the 24 `/wf review <alias>` invocations survive through
the alias list in review.md.

The W0 `rubric-checks` category is keyed per merged group: the union of
bullets from the absorbed files must appear in the merged file, by
six-word fingerprint, or in `retired.json` with reason `duplicate` naming the
surviving bullet. The eval case `review-adhoc` (W6) runs `/wf review
security` and `/wf review logging` before and after and diffs the finding
categories.

### 7.6 Other edits

- `docs/site/reference/review-dimensions.html`: rewrite for 11 rubrics with
  the alias table.
- `tests/unit/skills/surface-sweep.test.mjs`: names dimensions; migrate per
  §3.5.
- `_subagents.md`: "the 35-dimension review `all` aggregate" → 11.
- `intake/audit.md`, `intake/refactor.md`, `implement.md`: name absorbed
  rubrics; rewrite to merged name + focus.

## 8. W6 — Behavior evals

`claude plugin eval` is early access on Claude Code 2.1.201; `init` refuses.
Build the harness on `claude -p --output-format json --plugin-dir`, the
pattern `skills/consult/scripts/dispatch.mjs` already uses. Migrate to
`claude plugin eval` when it opens; keep the fixtures and assertions.

### 8.1 Layout

```
tests/evals/
  run.mjs                 harness: scaffold fixture → run case → assert → report
  fixtures/node-cli/      small TypeScript CLI with tests (stack: node)
  fixtures/web-app/       minimal Vite + React page with a form (stack: node+ui)
  fixtures/docs-repo/     markdown-only repo (stack: none)
  cases/<name>.json       { fixture, prompt, maxTurns, assertions[] }
  baseline/               W0 results, committed
  results/                gitignored
```

### 8.2 Cases

| Case | Fixture | Prompt | Deterministic assertions |
|---|---|---|---|
| intake-default | node-cli | `/wf intake add a --json flag to the list command` | `01-intake.md` exists; frontmatter valid; `INDEX.md` row added; no file outside `.ai/` written |
| shape-headless | node-cli | `/wf shape <slug>` after intake, non-interactive | `02-shape.md` valid; gate rung 3 recorded in `po-answers.md`; `augmentations-needed` present |
| slice | node-cli | `/wf slice <slug>` | `03-slice.md` + one `03-slice-*.md`; `review-scope-confirmed` set |
| plan | node-cli | `/wf plan <slug>` | `04-plan-*.md` valid; `stack-source` recorded; no source file changed |
| implement | node-cli | `/wf implement <slug>` | `05-implement-*.md` valid; tests still pass; commit exists on the workflow branch |
| verify | node-cli | `/wf verify <slug>` | `06-verify-*.md` valid; AC gate fields present; evidence dir exists |
| review-stage | node-cli | `/wf review <slug>` | `07-review.md` + sibling `.yaml`; ledger `runs:` length 1; verdict present |
| review-rerun | node-cli | `/wf review <slug>` again | `runs:` length 2; no finding id lost |
| review-adhoc | web-app | `/wf review security`, `/wf review logging` | inline findings; categories recorded for W4 diff |
| fix-mode | node-cli | `/wf intake fix the list command crashes on empty dir` | `01-fix.md`, `03-slice.md`, `04-plan.md`, `05-implement.md` valid |
| task | docs-repo | `/wf task rename the docs folder` | `01-task.md` valid; `blast-radius` present; AC evidence rung recorded |
| status | node-cli | `/wf status` | prints every slug in `INDEX.md`; writes nothing |

Assertions use `tests/frontmatter.schema.json` through
`lib/schema-validator.mjs`, plus file-existence and git checks. No LLM
grader.

### 8.3 Run rules

- `npm run evals` runs every case once. `npm run evals -- --case plan` runs
  one.
- Evals do not run per pull request. They run at W0 (baseline), at the end
  of W1, W3, and W4, and before every release of this plan. `RELEASE-DISCIPLINE.md`
  gains this step.
- Each run records the `usage` block from `--output-format json` per case.
  After W8, each run also reads `cost.jsonl` from the fixture's `.ai/`.
- A case that needs a gate answer runs non-interactive, so rung 3 fires and
  the recorded default is asserted.

### 8.4 Before/after comparison

`run.mjs --compare baseline` prints, per case: artifact set equal (yes/no),
schema valid (yes/no), input tokens before/after, output tokens before/after.
The W1 exit criterion (§4.6) reads this report.

## 9. W7 — One version carrier

### 9.1 Carriers today

| Carrier | Today | After W7 |
|---|---|---|
| `package.json` | hand-edited | the source |
| `.claude-plugin/plugin.json` | hand-edited | stamped |
| `.codex-plugin/plugin.json` | hand-edited | stamped |
| `package-lock.json` (root `version`, `packages[""].version`) | hand-edited | stamped |
| `runtime-manifest.json` `runtimeVersion` | build derives | unchanged |
| `renderers/_shell.mjs` `PLUGIN_VERSION` | hand-edited literal | imports `runtimeVersion` from `runtime-manifest.json`; literal removed |
| `docs/site/nav.html` brand line | hand-edited | stamped |
| root `.claude-plugin/marketplace.json` `version` | hand-edited | stamped |

### 9.2 Mechanism

1. Add `scripts/stamp-version.mjs`: read `package.json` version, write every
   stamped carrier, idempotent.
2. Add `"version": "node scripts/stamp-version.mjs && npm run build && npm run verify:versions && git add -A -- <the carrier paths>"`
   to `package.json` scripts, so `npm version patch|minor` performs the whole
   bump. The `git add` names each carrier path; it never uses a bare `-A`.
3. `verify:versions` stays as the gate. After W7 it never fails on a bump made
   through `npm version`.
4. `RELEASE-DISCIPLINE.md`: the bump step becomes `npm version <level>`.

### 9.3 Render gate keyed on renderer bytes

1. `scripts/build.mjs` computes `rendererBuildId` = sha256 over `renderers/`,
   `view-src/`, `components/`, and writes it into `runtime-manifest.json`.
2. `lib/heal-render.mjs` `renderIdentityMatches` compares the recorded
   `rendererBuildId`; it falls back to `runtimeVersion` for markers that
   predate the field.
3. Hub adoption in `lib/hub-lifecycle.mjs` stays keyed on `runtimeVersion`.
   Unchanged.
4. Effect: a prose-only release does not force a clean re-render. A CSS change
   forces one without a version bump. The memory rule "bump REQUIRED for
   template/CSS changes" retires.

Tests to update: `tests/unit/lib/multi-repo-hub.test.mjs`,
`tests/unit/lib/render-queue.test.mjs`, the heal-render cases, and
`scripts/verify-release-versions.mjs` (drop the `_shell.mjs` literal check,
add the `rendererBuildId` presence check). `tests/e2e/acceptance.mjs` must
stay green.

Build note (2026-09-07): built as specified with three additions. (1) The
comparison keeps `buildId` as a middle rung: `rendererBuildId` when both sides
carry one, then `buildId`, then `runtimeVersion` — a 9.75–9.153 marker has a
`buildId` but no `rendererBuildId`, and comparing the whole-runtime hash is
still more precise than the version for that one transition. (2) The shell's
`?v=` cache-buster on `sdlc.css`/`sdlc.js` is the 12-character `rendererBuildId`
prefix (version fallback on an unbuilt tree), so a stylesheet edit reaches the
browser without a bump. (3) The gate requires `runtime-manifest.json` to exist
(it was optional) and fails when `_shell.mjs` carries a version literal again.
The stamp does not touch the marketplace catalog's own top-level `version`
(1.179.x): that is the catalog's release line, not a plugin carrier; the
operator bumps it. `npm version` refuses a dirty tree and commits + tags by
default; RELEASE-DISCIPLINE step 1 says so. The memory rule "a bump is required
to ship a template/CSS change" is retired by this wave.

## 10. W8 — Exact cost ledger

### 10.1 What "exact" means

Every integer in the ledger is copied from a record the host wrote. No
figure is estimated, sampled, or priced. The ledger records tokens, never
currency.

### 10.2 Sources, verified on this machine 2026-09-04

| Host | Record | Fields | Verified |
|---|---|---|---|
| Claude Code 2.1.201, main session | `transcript_path` (every hook receives it): one JSON line per message; `type: "assistant"` lines carry `message.usage.{input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens}`, `message.model`, `requestId`, `timestamp` | yes, 43 transcripts inspected |
| Claude Code 2.1.201, sub-agents | `<dirname(transcript_path)>/<session_id>/subagents/agent-<agent_id>.jsonl`, same line shape, `isSidechain: true`, `agentId` | yes, 75 files present; `agent_id` is a documented `SubagentStop` field |
| Codex | `~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<thread>.jsonl`; `event_msg` lines with `type: "token_count"` carry `total_token_usage.{input_tokens, cached_input_tokens, cache_write_input_tokens, output_tokens, reasoning_output_tokens, total_tokens}` (cumulative) and `last_token_usage` | yes, today's file inspected |
| pi 0.85.0, main session | `transcript_path` from every pi-code hook payload points to Pi's session JSONL; `type: "message"` entries carry `message.role`, `message.model`, `message.provider`, and `message.usage.{input, output, cacheRead, cacheWrite}` | yes, 2026-09-05: the one session file on this machine holds 188 assistant entries; 186 carry nonzero `input` and `output`. The 2 zero entries are `stopReason: "error"` (an OAuth refresh failure and a WebSocket error). The parser skips `stopReason: "error"` entries |
| pi, `@tintinweb/pi-subagents` | pi-unified listens to `subagents:completed` and `subagents:failed` and appends a `type: "custom"`, `customType: "sdlc:subagent-usage"` entry whose `data` carries `id`, `type`, `status`, `toolUses`, `durationMs`, and the event's unchanged `usage` object | event contract verified in pi-subagents; synthetic persistence to session JSONL verified with nonzero input/output/cache/cost data and a no-usage event; one real nonzero agent run remains |

Phase 0 of W8 (one day) still confirms the Codex hook payload field that
names the rollout file and where a `/wf yolo` Workflow run stores its agent
transcripts. Pi's transcript location and entry shapes are now known; the two
remaining live checks are the nonzero normal-turn usage entry and ordering
between pi-unified's subagent append and pi-code's `agent_end` Stop hook.

### 10.3 Mechanism

1. Add a `Stop` hook to `hooks/hooks.json` (Claude Code has none today) and
   extend the existing Codex `Stop` adapter. The hook runs
   `dist/cost-ledger.mjs`.
2. The hook keeps a cursor per session in the plugin data dir:
   `cost-cursor/<session_id>.json` = `{ mainOffset, agents: { <agent_id>: offset } }`.
3. On each Stop, read the main transcript from `mainOffset`. Collect every
   `assistant` line. Dedupe by `requestId` (last line wins). Sum the four
   usage fields per `model`.
4. Read every file under `<session>/subagents/` from its cursor. Sum the same
   way, per `agent_id`, per `model`.
5. For pi, add a second parser in `lib/cost-ledger.mjs`. Read normal
   `type: "message"` assistant entries from the main transcript, using Pi's
   `message.model`, `message.provider`, and `message.usage` field names. Read
   sub-agent spend only from `type: "custom"` entries whose `customType` is
   `sdlc:subagent-usage`; map the unchanged `data.usage` object into the
   ledger. Skip assistant entries whose `message.stopReason` is `"error"`;
   they carry all-zero usage and no content. The custom entry has no model field because the pi-subagents event
   has none, so omit the model value on that row. Do not read tool-result
   usage: with pi-subagents `reportUsage` enabled, that is the same child
   spend copied into the parent session for `/session` totals and would count
   each child twice.
6. Attribute the turn. Scan the same span for `tool_use` blocks named
   `Write`, `Edit`, `MultiEdit`, or `NotebookEdit` (Codex: `apply_patch`;
   pi: Pi's tool-call content blocks) whose path matches
   `.ai/workflows/<slug>/`. `slug` is the directory. `key` derives from the
   artifact stem written (`04-plan` → `plan`, `07-review` → `review`,
   `01-<mode>` → `intake`, and so on; the table lives in
   `lib/cost-ledger.mjs`). A turn that wrote nothing under `.ai/` inherits
   the last `(slug, key)` of the session, which is how a gate-question turn is
   attributed. A turn with no slug in the session writes no row.
7. Append one row to `.ai/workflows/<slug>/cost.jsonl`:

```json
{"ts":"2026-09-04T12:00:00Z","host":"claude","session":"<id>","turn":7,"key":"plan","slice":"cli-json",
 "main":{"model":"claude-fable-5-1","input_tokens":2,"output_tokens":517,"cache_read_input_tokens":30153,"cache_creation_input_tokens":29691},
 "subagents":[{"agent_id":"af8e…","model":"claude-opus-5","input_tokens":2,"output_tokens":1,"cache_read_input_tokens":0,"cache_creation_input_tokens":26072}],
 "external":[{"provider":"codex","input_tokens":18176,"output_tokens":142}]}
```

8. The hook writes only `cost.jsonl`. It never edits `00-index.md`. The
   append is atomic (write to a temp file, then rename). Two sessions on one
   slug cannot corrupt it.
9. `external` rows come from `skills/consult/scripts/dispatch.mjs`, which
   already parses `--output-format json`; extend the parse to the `usage`
   block and write the row through the same append function.
10. The stage's normal commit of `.ai/workflows/<slug>/` carries `cost.jsonl`.
    The row for the final turn of a stage lands in the next commit that touches
    the slug. Document this in `_additive-write.md`.

### 10.4 Readers

- `/wf status <slug>` and `/wf status` aggregate `cost.jsonl` on read and
  show, per slug and per key: turns, sub-agent count, input tokens, output
  tokens, cache read tokens, cache write tokens. Exact integers, in a table.
- `renderers/dashboard.mjs` and `renderers/workflow-index.mjs` add the same
  table. No new artifact type.
- `tests/evals/run.mjs --compare` reads it (§8.4).

### 10.5 Consult triggers become recorded and exclusive

1. A stage fires `/consult` only when a listed trigger holds. The list is the
   union already in prose: `unknowns-present`, `touches-concurrency`,
   `touches-auth`, `touches-migration`, `touches-billing`, `touches-external-api`,
   `intent-risk-carried`, `appetite-medium-or-larger`,
   `verdict-ship-with-caveats`, `blocker-fixed-in-loop`, `user-invoked`.
   The default-ON clause in `plan.md` ("skip only when trivial") is replaced
   by this list.
2. The stage writes `consult-runs: [{trigger, provider, at}]` into its
   artifact frontmatter. `tests/frontmatter.schema.json` gains the field on
   `planFrontmatter`, `reviewFrontmatter`, `verifyFrontmatter`,
   `handoffFrontmatter`, and `shipRunFrontmatter`.
3. `tests/unit/skills/consult-trigger-coverage.test.mjs` asserts every trigger
   name in prose is in the list.

### 10.6 Host notes

- Adding a `Stop` hook changes `hooks/hooks.json`. Under Codex, the hook set
  grows from 7 to 8 and needs one more interactive trust (see
  `SINGLE-SOURCE-CUTOVER.md`).
- pi-unified owns exactly one integration: listen to `subagents:completed`
  and `subagents:failed`, and call
  `pi.appendEntry("sdlc:subagent-usage", data)` only when `usage` is present.
  `data` carries `id`, `type`, `status`, `toolUses`, `durationMs`, and the
  unchanged `usage`; it carries neither the display-only `tokens` object nor
  a model name.
- Pi-subagents lifecycle events cover top-level agents only. A nested child's
  usage rolls into its owning top-level agent's entry.
- A background agent may finish after the current turn's `Stop`. Its custom
  entry then lands after that Stop and the cursor collects it on the next
  Stop, matching the rule that the row is committed with the next commit that
  touches the slug.
- Pi-subagents `reportUsage` is safe to enable for Pi's own `/session` totals.
  The ledger parser ignores tool-result usage and reads only
  `sdlc:subagent-usage`, preventing duplicate child spend.
- One fact requires a live probe before W8 ships: the ordering between
  pi-unified's append and pi-code's `agent_end` Stop hook must be observed on
  a foreground agent completing in the same turn. The nonzero-usage probe is
  closed (§10.2).
- The listener is not live on this machine until the operator runs
  `pi install .` in `~/Documents/dev/pi-unified` after `pi remove
  npm:pi-web-access`. On 2026-09-05 `~/.pi/agent/settings.json` lists only
  `npm:pi-web-access` in `packages`, and no session file holds a
  `sdlc:subagent-usage` entry.
- The hook fails open. Any parse error logs through `lib/error-log.mjs` and
  writes no row. A missing row is visible in `/wf status` as a turn gap; a
  wrong number never is, so the hook prefers no row to a guessed row.

Build note (2026-09-07): built as specified with these departures. (1) The Codex
side is a separate thin adapter, `hooks/stop-cost.mjs`, not an extension of
`stop-verify.mjs`: the adapter contract test allows only `./_adapter.mjs` and
`node:` imports, and the policy lives in the bundle. The adapter passes
`PLUGIN_DATA` to the bundle as `sdlc_plugin_data` in the payload. (2) The cursor
records `turn` and the last attribution (`slug`, `key`, `slice`, `root`) beside the
offsets, so a turn with no artifact write inherits the session's last slug and
key; a turn with no known slug writes no row. (3) Under Claude Code and pi the
cursor lives under `sdlcHomeDir()/cost-cursor` (SDLC_HOME-relocatable), not the
plugin data dir; under Codex it lives under `PLUGIN_DATA/cost-cursor`. (4) Codex
usage is the delta of the cumulative `total_token_usage` between two Stops, kept
under the verbatim Codex names with `fields: "codex"`; a Codex payload with no
`transcript_path` is resolved to the rollout by session id under
`$CODEX_HOME/sessions/`. (5) The cost table also renders on the pipeline slug page
(`renderers/index.mjs`); §10.4 named only the dashboard and `workflow-index.mjs`.
(6) The consult dispatcher writes a standalone `external` row (`turn: null`,
`main: null`) keyed by `SDLC_COST_SLUG` / `SDLC_COST_KEY`; without the variable it
writes nothing, so a consult with no slug is never mis-charged. (7) The trigger
list grew from the eleven names in §10.5 to twenty-nine — the union of every
stage's prose — in `skills/wf/reference/_consult-triggers.md`; the coverage test
checks the names each consult block cites against that table rather than against
a list in the test. (8) The rewritten consult paragraphs would have grown five
ratcheted prose budgets; the paragraphs name a trigger and the table defines it,
so the definitions were removed from the stages. (9) The evals baseline stays
unregenerated until release (§8.4); `--compare` prints the two ledger columns as
`—` for a baseline without them.

## 11. W9 — Freeze the surface

### 11.1 `docs/internal/SURFACE-POLICY.md` and `surface-policy.json`

```json
{ "keys": 22, "intakeModes": 12, "reviewRubrics": 11, "aggregates": 6, "artifactStems": 52, "frontmatterTypes": 65 }
```

`scripts/verify-surface.mjs` counts each from the tree (the key table in
`SKILL.md`, `intake.md`'s mode list, `review/*.md`, the aggregate table, the
inventory's `artifacts` union, the schema's `oneOf`) and fails when a count
exceeds the file. Raising a number is a one-line commit that a reviewer sees.

### 11.2 The earn rule

A new key, mode, rubric, aggregate, or artifact type requires, in its pull
request:

1. a named user job that no existing key covers, in one sentence;
2. three real invocations of the workaround, cited from `cost.jsonl` rows or
   from transcripts;
3. a file within its class budget;
4. an eval case;
5. the `surface-policy.json` bump.

The freeze holds until `measure-load` meets every §1.1 target for two
consecutive releases.

### 11.3 Router extraction — decision requested, recommendation: no

The review proposed moving `ship-plan`, `docs`, and `observability` into
separate skills. Three facts argue against it. `docs` was a separate skill
(`/wf-docs`) and was dissolved into `/wf` in v9.4.0; extraction reverses a
settled decision. Extraction re-creates the redirect text W2 deletes. A
separate skill has its own version carrier, which W7 is removing. The freeze
and the earn rule deliver the value without the churn. This plan proceeds
without extraction unless the PO overrides.

Build note (2026-09-07): built as specified with two departures. (1) The pins
record the tree, not §11.1's estimates: the tree has 7 aggregates (`all` is a
row of the aggregate table), 93 distinct artifact names (the W0 baseline held
91; `01-rca.yaml` and `01-rca.html.fragment` were named since), and 66 distinct
`type` values across the schema's 52 `oneOf` branches. (2) The gate treats a pin
as a ceiling — a count under its pin is reported as slack, not failed — while
the unit test pins equality, so a deleted surface also requires the one-line
policy edit and the file always states the tree. §11.3 stands: no router
extraction; the PO may override by a plan edit.

## 12. W10 — README

1. Rewrite `README.md` to ≤ 150 lines: what the plugin is, the three hosts,
   install pointer, first-workflow pointer, the 22-key table, links to the
   site pages.
2. Delete the 11 release blockquotes and every retired name.
3. Extend `scripts/verify-doc-site.mjs`: README ≤ 150 lines; README contains
   none of `wf-meta`, `wf-quick`, `wf-design`, `wf-docs`, `two hosts`; README
   names Claude Code, Codex, and pi.

Build note (2026-09-07): built as specified. The README landed at 90 lines.
No site page linked a README anchor, so no link had to move; the site map in
the README links every one of the 24 content pages. The gate's host check
matches `\bpi\b`, so a README that names only the `pi-code` extension fails
until it names the host.

## 13. Item 5 — why the view layer should leave the plugin

This is not a wave. It is the case, with the counts, for a decision.

### 13.1 The counts

| Measure | Value |
|---|---|
| Runtime code (lib, renderers, scripts, hooks) | 21,693 lines |
| Lifecycle code | 0 lines (the lifecycle is prose) |
| Unit-test lines that test the runtime (hub, tray, render, browser, hooks, walker, snapshots) | 7,624 of 13,714 (56%) |
| CHANGELOG entries naming hub, tray, daemon, registry, sunflower, or code browser | 31 of 127 |
| Fix-type commits naming the runtime | 16 of 47 |
| Memory files about the runtime | 19 of 91 |
| Prose files that name a view concept (`html.fragment`, `renderer`, `sunflower`) | 66 of 152 |
| Prose sites where the view BLOCKS a lifecycle write (sibling `.yaml` hard block) | 7 |
| Detached processes a session start may spawn in every repo | 3 (bootstrap render, hub ensure, tray heal) |

### 13.2 The dependency runs one way

The view reads `.ai/`. The lifecycle never reads the view. Yet the view has
leaked into the lifecycle in three places: every artifact write carries a
fragment-authoring step (37 files cite `_fragment-authoring.md`); a `.md`
write is blocked when its render sibling is missing; and the cross-host story
broke in v9.153.1–2 on hub reaping, a view concern, not a lifecycle one.
Under W1, the fragment step alone is 112 lines loaded by 37 stage files for a
feature the lifecycle does not need to produce a correct artifact.

### 13.3 What a split is and is not

A split is a packaging change, not a fork. The repository already holds a
marketplace with several plugins. `plugins/sdlc-view/` would hold `lib/hub-*`,
`lib/tray-*`, `lib/render-*`, `lib/code-browser.mjs`, `lib/registry.mjs`,
`renderers/`, `view-src/`, `components/`, the tray and hub scripts, the
`render-on-artifact-write` and `session-start-orient` hooks, and their tests.
`plugins/sdlc-workflow/` would keep the prose, the schema, the validate,
leak-guard, auto-stage, memory-seed, and cost hooks, and their tests. The
schema stays in the workflow plugin; the view plugin vendors it at build and
checks `artifactSchema: sdlc/v1` at startup. Both plugins hook `PostToolUse`;
validation is `PreToolUse`, so order is preserved. The sibling-`.yaml` block
moves to the view plugin's own `PreToolUse` hook, still able to block, opt-out
in its own config.

### 13.4 What it buys

- A `/wf` user who wants no dashboard installs one plugin and starts no
  daemon. Today that user cannot opt out of the hub ensure at session start
  without editing config.
- A renderer or tray defect no longer ships a lifecycle release, and a prose
  fix no longer rebuilds 2.4 MB of `dist/`.
- The lifecycle's cross-host contract shrinks to prose plus five hooks. The
  hub adoption rules leave its surface.
- 56% of the unit-test lines and 19 memory files move behind a boundary the
  lifecycle does not cross.

### 13.5 What it costs

- Two installs and two trust prompts per host. Under Codex, hooks are trusted
  per plugin.
- One version pairing: the view plugin declares the schema version it reads.
  A schema bump becomes a two-plugin release.
- One more marketplace entry and one more CI job.

### 13.6 The decision

Approve the split as its own plan after this one, or decline it and accept
that every W1 budget carries the fragment step and the sibling block as
lifecycle prose. Either answer is workable. The recommendation stands.

## 14. W11 — Runtime repair, in place

The runtime stays in the plugin. This wave repairs how the runtime is
installed, observed, started, and bounded. Source: an inspection of the
operator machine on 2026-09-05 against the repository at v9.153.4/5. Every
count in this section is from that machine. W11 re-measures each count with
the `doctor` command (§14.2.1) before the first edit and records the output
beside the capability baseline.

### 14.1 Concerns, with the evidence

Installed state on the operator machine:

| Surface | Installed | Repository |
|---|---|---|
| Claude Code plugin `sdlc-workflow` | 9.144.0 (marketplace clone HEAD `203dfa4f`, 2026-07-29) | 9.153.4 |
| Codex plugin | the deleted Codex mirror plugin at 9.152.1, 8 trusted hooks | merged tree, not installed |
| Hub process | 9.144.0, started by the Claude host | 9.153.4 |
| Runtime store `~/.sdlc/runtime` | 28 build directories, 124 MB | GC runs only in `hub:upgrade` |
| Plugin cache | 120 MB, of which 97 MB is a `node_modules` installed into the cache | not a shipped artifact |

Both installed versions predate the adopt-newer rule from v9.153.2. Each
host still reaps the other host's hub. The release process ends at `git push`.
Installation is nobody's step.

| # | Concern | Evidence |
|---|---|---|
| C1 | The hub writes no log | `logHub()` in `scripts/hub-serve.mjs:889` is `console.log`; `lib/detach.mjs` spawns with `stdio: 'ignore'` |
| C2 | Errors are scattered per repository | `lib/error-log.mjs` writes `.ai/_view/.hook-errors.log` per repo; 41 identical "invalid hook JSON on stdin: Bad escaped character" lines, Jul–Aug, no payload captured |
| C3 | SessionStart acts unconditionally | `hooks/session-start-orient.mjs:103` `startBootstrap` mkdirs `.ai/_view` and enqueues on every start; no `source` check, no `.ai/workflows` check |
| C4 | View litter | 18 directories hold `.ai/_view`; 8 have no workflows, including `~/Documents/dev` (not a git repo, 2 queue records stuck since 2026-07-07) |
| C5 | Registry accepts ephemeral roots | a scratchpad preflight repo and a `.claude/worktrees/agent-*` worktree are registered; 3 entries have 0 slugs |
| C6 | Prune log unbounded | `registry.prune.log` 304 KB, 1,179 `skip-not-git` Temp lines (`lib/registry.mjs:621`), no rotation |
| C7 | Tests write into the real state dir | `tests/sunflower.test.mjs`, `tests/e2e/acceptance.mjs`, and helpers never set `SDLC_HOME`; 961 prune lines in July came from tests |
| C8 | Port 4173 is the Vite preview default | foreign owner → probe `isHub:false, pid:null` → pid file removed → 2 s wait → spawn → bind fails → `started-unconfirmed`; no EADDRINUSE handler in `hub-serve.mjs` |
| C9 | Tailnet exposure wider than configured | `hub-config.json` `tailscale.enabled: true`; `tailscale serve` maps `/` → 4173 tailnet-wide; code browser on for 11 repos, `denyGlobs: []`; `/__sdlc/health` and `/__sdlc/registry` GETs need no token and list absolute repo paths |
| C10 | Tray ships as unsigned binaries | 3 Go helpers in `bin/tray/`, 11 MB, copied to `~/.sdlc/bin`, started by a Startup `.vbs`; no committed hash manifest; every detached spawn on Windows goes through `wscript.exe` |
| C11 | Per-tool overhead | Write = 5 node spawns ≈ 0.62 s; Edit = 4 ≈ 0.47 s; Bash = 1 ≈ 0.11 s; SessionStart = 0.25 s foreground + 2 detached spawns (dist, warm) |
| C12 | Dead paths ship | `renderDispatch: 'inline'`, `perRepoServe`, `lib/serve-lifecycle.mjs` (237 lines), `scripts/render-sunflower-serve.mjs` (423 lines), per-repo `liveReload`; 29 per-repo config keys + 15 hub keys |
| C13 | Startup catch-up renders everything | one hub start re-rendered all 11 registered repos in 16 s |
| C14 | Codex SessionStart blocks | `hooks/session-start.mjs:88` `HUB_CONFIRM_TIMEOUT_MS = 20000`; under C8 every Codex session pays the full wait |
| C15 | Storage without a ceiling | one view dir is 25 MB; `_assets` (940 KB) is copied into every repo's view; `dist/` (2.4 MB) is committed on 122 releases |
| C16 | Stale comments | `hooks/session-start-orient.mjs:7` still says it emits `{systemMessage}`; that behavior left in v9.97.0 |

### 14.2 Changes

Each change names its mechanism, its files, and its gate. The gate is what
must be green before the change is pushed.

#### 14.2.1 W11.1 — Close the install gap

1. Add `scripts/doctor.mjs`, exposed as `npm run doctor` and as a tray menu
   item. It reports, as one JSON object and one text table: the installed
   plugin version per host (Claude plugin list, Codex plugin cache), the hub
   version from `/__sdlc/health`, the runtime store count and size, registry
   entries under Temp, the scratchpad, or `.claude/worktrees`, the
   `tailscale serve` state, and the owner pid of the hub port.
2. Add an `installed` check to `scripts/verify-release-pushed.mjs`. Compare
   each host's installed version to `package.json`. Print red on mismatch.
   The check is advisory on CI and blocking on the operator machine.
3. Record the cutover as a step in `docs/internal/SINGLE-SOURCE-CUTOVER.md`
   with the `doctor` output before and after.

Files: `scripts/doctor.mjs`, `scripts/verify-release-pushed.mjs`,
`scripts/tray.mjs`, `docs/internal/SINGLE-SOURCE-CUTOVER.md`.
Gate: `doctor` runs green on a machine where installed equals shipped.

#### 14.2.2 W11.2 — One log for the runtime

1. Write hub output to `~/.sdlc/hub.log`. Rotate at 1 MB, keep 2 generations.
   `logHub()` writes to the file and to stdout.
2. Write every lifecycle decision to `~/.sdlc/lifecycle.log` from
   `lib/hub-lifecycle.mjs`: adopt, reap, recover, start, unconfirmed, with
   host, version, buildId, and reason.
3. Route `lib/error-log.mjs` to `~/.sdlc/errors.log`, keyed by repository
   root, with the same rotation. Keep the per-repo file only when the repo
   has `.ai/workflows`.
4. On a JSON parse failure in `lib/stdin.mjs`, record the first 200 bytes of
   the payload as hex in the error line.
5. Persist a restart count in `~/.sdlc/hub-history.jsonl`. Show the count and
   the last reason in `/__sdlc/health` and in the tray tooltip.

Files: `scripts/hub-serve.mjs`, `lib/hub-lifecycle.mjs`, `lib/error-log.mjs`,
`lib/stdin.mjs`, `scripts/tray.mjs`.
Gate: unit tests for rotation and for the lifecycle line format; e2e reads
one lifecycle line after a start.

#### 14.2.3 W11.3 — Conditional SessionStart

1. In `startBootstrap`, return early when the root has no `.ai/workflows`
   directory. Do not create `.ai/_view`.
2. Return early when the root is not a git toplevel.
3. Skip the bootstrap enqueue when the payload `source` is `compact`. Keep
   the hub-ensure spawn on `resume` and `startup` only.
4. In `lib/registry.mjs` `validateEntry`, refuse roots under the OS temp dir,
   the Claude scratchpad, and any `.claude/worktrees` path.
5. Delete the 8 litter `.ai/_view` directories and the 2 stuck queue records
   on the operator machine. Record the list in the CHANGELOG.
6. Fix the header comment in `hooks/session-start-orient.mjs`.

Files: `hooks/session-start-orient.mjs`, `lib/registry.mjs`.
Gate: guard tests, red first, for the three early returns and the three
refused prefixes.

#### 14.2.4 W11.4 — Honest port handling

1. When the probe finds a foreign owner on the port, do not spawn. Return
   `port-held` with the owner pid, and write it to the lifecycle log.
2. Show `port-held` in the tray tooltip with the pid and the text "another
   process holds port N".
3. Add an `EADDRINUSE` handler in `scripts/hub-serve.mjs` that writes the
   reason to `hub.log` and exits with code 2.
4. Move the default port off 4173. Migrate an existing `hub-config.json`
   that carries the old default with a one-line rewrite and a lifecycle log
   line. Update `tailscale serve` when `tailscale.enabled` is true.

Files: `lib/hub-lifecycle.mjs`, `lib/hub-config.mjs`, `scripts/hub-serve.mjs`,
`lib/tailscale.mjs`, `scripts/tray.mjs`.
Gate: a unit test binds a dummy server on the port and asserts `port-held`
with no spawn; the migration test rewrites a fixture config.

#### 14.2.5 W11.5 — Runtime store GC on every start

1. After every confirmed start or adopt in `ensureHubLifecycle`, call
   `gcRuntimes` with the active build, the previous build, and the bundled
   build in `keepBuildIds`.
2. Keep the existing never-remove rules in `lib/runtime-store.mjs`.

Files: `lib/hub-lifecycle.mjs`.
Gate: `tests/unit/lib/runtime-store.test.mjs` asserts 3 directories remain
from a fixture of 6.

#### 14.2.6 W11.6 — Fold the hooks per event

1. Add `hooks/pre-tool-use-all.mjs`. It runs validate and leak-guard in one
   process and returns the first blocking result.
2. Add `hooks/post-tool-use-all.mjs`. It runs auto-stage, verify, and render
   enqueue in one process, in that order.
3. Point `hooks/hooks.json` and `hooks/codex.hooks.json` at the two files.
   Keep the matcher per event unchanged.
4. Keep the single-purpose scripts as importable modules. Delete their
   `main()` entry points after one release.

Files: `hooks/*.mjs`, `hooks/hooks.json`, `hooks/codex.hooks.json`.
Gate: `tests/unit/hooks/hooks.test.mjs` passes unchanged against the folded
entry points; the Write path measures ≤ 0.30 s warm on the operator machine.

#### 14.2.7 W11.7 — Isolate the tests

1. In `tests/run-all.mjs`, set `SDLC_HOME` to a fresh temp directory for the
   whole run when it is unset.
2. Add `tests/unit/state-dir-guard.test.mjs`. It records the mtime of the
   real `~/.sdlc` before the run and fails when the mtime changed.

Files: `tests/run-all.mjs`, `tests/unit/state-dir-guard.test.mjs`.
Gate: the guard is green; the operator's `registry.prune.log` gains no test
lines for one week.

#### 14.2.8 W11.8 — Narrow the exposure defaults

1. Return repository basenames, not absolute paths, from `/__sdlc/health`
   and `/__sdlc/registry` when the request carries no token.
2. When `tailscale.enabled` is true and `codeBrowser.acknowledgedTailnet` is
   not true, serve the code browser as disabled with a one-line reason.
3. Commit `bin/tray/SHA256SUMS`. Verify each helper against it in
   `lib/tray-autostart.mjs` before copying to `~/.sdlc/bin`. Refuse on
   mismatch and log the reason.
4. Record the upstream project, version, and build date of the three helpers
   in `bin/tray/README.md`.

Files: `scripts/hub-serve.mjs`, `lib/hub-config.mjs`, `lib/code-browser.mjs`,
`lib/tray-autostart.mjs`, `bin/tray/`.
Gate: unit tests for the redacted payload and the hash refusal; the docs page
for hub config names the tailnet scope.

#### 14.2.9 W11.9 — Delete the dead paths

1. Release N: mark `renderDispatch: 'inline'`, `perRepoServe`, and per-repo
   `liveReload` as deprecated in `lib/config.mjs`, `lib/hub-config.mjs`, and
   the docs page. Log one warning per session when set.
2. Release N+1: delete `lib/serve-lifecycle.mjs`,
   `scripts/render-sunflower-serve.mjs`, the two config keys, their tests,
   and their docs rows. Update `verify:runtime`.

Files: as listed. About 660 lines and 2 config keys leave.
Gate: `verify:capabilities` config category shows the two keys under
`retired.json` with the reason; `npm test` green.

#### 14.2.10 W11.10 — Bound the catch-up and the wait

1. On hub start, render only repositories whose view fails the version gate
   or has a non-empty queue. Skip the rest.
2. Cut `HUB_CONFIRM_TIMEOUT_MS` in `hooks/session-start.mjs` to 5000. When
   the wait expires, return `started-unconfirmed` with a one-line message.

Files: `scripts/hub-serve.mjs`, `hooks/session-start.mjs`.
Gate: e2e start on a fixture of 3 fresh repos renders 0; unit test asserts
the timeout value and the message.

#### 14.2.11 W11.11 — Share the assets, bound the logs

1. Serve `_assets` from the hub at `/__sdlc/assets/<buildId>/`. Stop copying
   it into each repository's view. Rewrite the asset base in the renderer.
2. Rotate `registry.prune.log` with the 1 MB rule from W11.2.

Files: `renderers/`, `scripts/hub-serve.mjs`, `lib/registry.mjs`.
Gate: rendered pages load with 0 failed asset requests in the e2e browser
check; the render version gate bumps for the template change.

### 14.3 Regression rules for W11

- Every lifecycle change lands with a guard test that is red first.
- No config key is deleted in the release that deprecates it.
- `verify:capabilities` treats `lib/config.mjs` defaults and
  `lib/hub-config.mjs` defaults as the `config` category. A removed key must
  appear in `retired.json`.
- The operator machine is the acceptance environment for W11.1, W11.3,
  W11.4, and W11.7. Record `doctor` output before and after each.

### 14.4 Exit criteria

| Measure | Before | After |
|---|---|---|
| Hosts running the shipped version | 0 of 2 | 2 of 2 |
| Hub log lines available after a restart | 0 | ≥ 1 per lifecycle decision |
| `.ai/_view` directories in repos with no workflows | 8 | 0 |
| Registry entries under Temp, scratchpad, or worktrees | 2 | 0 |
| Runtime store build directories | 28 | ≤ 3 |
| Node spawns per Write | 5 | 2 |
| Codex SessionStart worst-case wait | 20 s | 5 s |
| Unauthenticated routes that list absolute paths | 2 | 0 |
| Per-repo config keys | 29 | 27 |

Build note (2026-09-07) — W11.1 built as specified, with one correction to the
premise. The before-record (`SINGLE-SOURCE-CUTOVER.md` §5) shows the user-scope
Claude Code install and the Codex cache both at 9.153.5 with all seven hook
events trusted: the cutover of §2 is done on the operator machine, and the "0
of 2" in §14.4 was wrong when written. The one install gap is the Isometric
project-local scope at 9.144.0, so the doctor exits 1 until the operator
updates that scope; the plan's "2 of 2" reads every install scope as a host.
The doctor also counted the W11.3 and W11.5 inputs on the day: 2 ephemeral
registry roots (one `.claude/worktrees`, one scratchpad `preflight-repo`), 4
registry entries with no slugs, 30 runtime builds at 118.8 MB (the plan said
28), and 13 registry entries. `doctor` grades a Codex cache by its newest
enabled version, because the cache keeps superseded versions beside the current
one. The "after" record is the operator's, after step 6 runs in the Isometric
repository.

Build note (2026-09-07) — W11.2 built as specified, with three additions. The
lifecycle log records eight events, not five: `refused-host`,
`protocol-incompatible`, and `lock-timeout` are decisions too, and
`port-held` is reserved for W11.4. The start reason travels to the hub in
`SDLC_HUB_START_REASON` (fresh, reap: <reason>, recover: stale pid file,
upgrade), so `hub-history.jsonl` answers "why did the hub restart" and not
only "how often". The hub-history record is written by the server's own
`listening` handler, so an in-process test hub and the detached hub record the
same way. The gate's e2e is a live start in an `SDLC_HOME` sandbox on port
41987 inside the unit suite (`runtime-log.test.mjs`), because the repository
has no separate e2e lane for the hub.

Build note (2026-09-07) — W11.3 built with two departures. (1) The git gate is
"inside a git checkout", not "is the git toplevel": `lib/project-root.mjs`
anchors a monorepo sub-project with its own `.ai/workflows` below the
toplevel on purpose, and a toplevel gate would stop its bootstrap. The
`Documents/dev` case the item targets is outside any checkout, so the gate
still covers it. (2) The litter deletion (item 5) did not run: the operator
declined the `rm -rf` in this session, so the eight directories and their
eight pending queue records stay, and the CHANGELOG lists them as the
operator's step. The plan counted two stuck records; the machine held eight.
The registry refusal needed a suite-wide escape, `SDLC_ALLOW_TEMP_ROOTS=1`,
set once in `tests/run-all.mjs`, because every test repository is under the
OS temp dir; a single test file therefore runs through `npm test -- <filter>`.
`lib/doctor.mjs` `classifyRoot` now delegates to the registry's rule, so the
doctor and the registry cannot disagree about what "ephemeral" means.

Build note (2026-09-07) — W11.4 built as specified, plus a marker. The new
default is 48173. `migrateHubConfig` writes `portMigratedFrom: 4173` when it
moves a config, so an operator who later sets 4173 on purpose is not moved
again; the plan's "one-line rewrite" is two lines for that reason. The
`tailscale serve` update needs no new code: `maybeConfigureTailscale` runs on
every start and adopt with the configured port, so the first hub start after
the migration re-targets the proxy. `start/installation.html` still names
4173; that file is another session's uncommitted work and was not touched.
Two test-suite facts surfaced while gating: a `net.Server` fixture must
destroy its accepted sockets before `close()`, or a probe's half-closed
socket leaves the close pending after the event loop drains and node:test
cancels the file; and a live-hub test on a FIXED port meets the zombie hub of
an earlier aborted run (its pid file died with that run's sandbox) and reaps
it as "untracked" — the runtime-log live test now takes a free port and
stops its hub by the pid the hub's own health reports.

Build note (2026-09-07) — W11.5 built as specified, with one fact the
exit criterion does not survive. The plan says the operator machine's
runtime store must hold at most 3 builds after the release. The kept
never-remove rule protects every build whose `runtimeVersion` equals the
active, live, or bundled version, and the 30 builds on that machine are
dev builds of one version (9.153.5). The new GC removes none of them. The
gate holds only because the fixture gives each build its own version. Two
ways to reach "≤3" exist: narrow the same-version rule to the newest N
builds per version, or accept that a developer machine keeps its
same-version builds and re-word the criterion. That is a PO decision; the
GC as built is safe for every install that upgrades through releases.
`previousBuildId` is a new field, not a new file; an older
`active-runtime.json` reads as `previousBuildId: null` until the next
upgrade writes one.

Build note (2026-09-07) — W11.6 built with two readings and one departure.
Reading 1: "keep the matcher per event unchanged" became one group per event
whose matcher is the union of the old groups (`Write|Edit|MultiEdit|Bash`);
three groups pointing at one file would run it twice on a Write. The payload
shape selects the checks inside the process. Reading 2: `codex.hooks.json`
was not re-pointed. Codex needs its adapter layer (event parsing,
apply_patch, the Stop ledger), so the adapters now spawn the folded bundle
once; the wiring file is byte-identical and no re-trust is needed.
Departure: under Codex the order changes from verify-first (skip the rest on
a block) to auto-stage, verify, render with the render request queued after
a block — the Claude Code behaviour, now identical on both hosts. The
standalone entries are guarded by process.argv basename (`isEntry`), not by
`import.meta.url`: esbuild gives every inlined module the bundle URL, so a
URL guard would have run each single-purpose main() inside the fold. Warm
timing on the operator machine: 97 ms (post) / 91 ms (pre) against 245 ms for
the three PostToolUse processes summed; the 0.30 s gate holds.

Build note (2026-09-07) — W11.7 built with one substitution. The plan's guard
compares the mtime of `~/.sdlc`. That directory's mtime moves on every atomic
write inside it (temp file + rename): the live hub rewriting `registry.json`
or `active-runtime.json` during a two-minute suite would fail the guard on a
healthy machine. The guard instead fingerprints the state a leaking test
changes — registry roots and shard names, `registry.prune.log` size,
`hub.pid`, the runtime build list, the active build — and reports the
changed keys. The first full run under the guard left the real state dir
unchanged, which also shows the pre-W11.7 leaks came from tests that now
inherit the temp `SDLC_HOME`. The one-week prune-log observation is the
operator's; the baseline size stands in the doctor record.

Build note (2026-09-07) — W11.8 built with two placements the plan did not
name. The tailnet gate lives in the supervisors, not the daemon: hub-serve
never reads hub-config.json (it gets its code-browser block through
`SDLC_CODE_BROWSER`), so `effectiveCodeBrowserConfig(hubConfig)` runs once
at each spawn site and the daemon receives a config that already carries
`enabled:false` and the one-line reason. The hash check lives in
`lib/tray-autostart.mjs` as the plan says, but the call site is
`scripts/tray.mjs` `ensureRuntimeBinary`, which is where the copy to
`~/.sdlc/bin` happens; `tray-autostart.mjs` itself only writes the logon
launcher. The helper README records what is knowable: the upstream project
and the vendoring commit. The upstream version and build date were never
recorded and cannot be recovered from the binaries; the README says so and
asks for both on the next refresh.

Build note (2026-09-07) — W11.9 step 1 built; step 2 is not in this release
by the §14.3 rule (no key is deleted in the release that deprecates it), so
the row stays partly open until release N+1 (R11). "Set" means the value
that selects a dead path: `renderDispatch: 'inline'`, `perRepoServe: true`,
`liveReload: false`. A default-valued key is not a deprecation, because the
merged hub config carries every default and the defaults are the surviving
paths. The one-per-session mechanism is a `--session-start` flag on
`hub-ensure`, which both hosts run once at SessionStart; the write hook's
`ensureHubOnWrite` spawn omits it. The warning goes to `lifecycle.log` and to
hub-ensure's stderr, which neither host shows the user: the plan asked for a
logged warning and got one, and a user-visible surface (`/wf status`, the
tray) is a PO call for N+1. No `retired.json` entry is written in this
release; the keys are still present and the inventory gate would count a
retired entry for a live key as a lie.

## 15. Releases and order

| Release | Waves | Gate before push |
|---|---|---|
| R1 | W0 (inventory, load metric, eval harness + baseline) | `npm test`, `verify:capabilities` green on an unchanged tree, baseline committed |
| R2 | W2, W3, W1 part 1 (`SKILL.md` + the seven largest stage bodies) | `verify:prose` ratchet, `verify:capabilities`, evals compare = same artifacts |
| R3 | W1 part 2 (shared contracts, intake modes, remaining keys, splits) | same |
| R4 | W4 | `rubric-checks` category, `review-adhoc` eval diff, docs page |
| R5 | W7 | `verify:versions` after `npm version patch`, e2e, hub tests |
| R6 | W8 | Phase 0 answers recorded; ledger rows on a real slug under both hosts |
| R7 | W9, W10 | `verify:surface`, `verify:docs` |
| R8 | W11.1, W11.2, W11.3, W11.7 (doctor, logs, conditional start, test isolation) | `doctor` green after the cutover; guard tests; state-dir guard; hub tests |
| R9 | W11.4, W11.5, W11.6, W11.10 (port, GC, folded hooks, bounded start) | port-held test; runtime-store test; hooks test on folded entry points; Write ≤ 0.30 s |
| R10 | W11.8, W11.9 step 1, W11.11 (exposure, deprecations, shared assets) | redaction + hash tests; render gate bump; e2e asset check |
| R11 | W11.9 step 2 (delete dead paths) | `retired.json` carries both keys; `npm test`, `verify:runtime` |

R8 can ship before R1. It touches no prose and no capability the inventory
guards, and it fixes the machine the other releases are tested on.

Every release: version bump per the current rule (W7 changes the rule from R5
on), `dist/` rebuilt in the same commit when `lib/`, `hooks/`, `scripts/`, or
`renderers/` changed, push to `origin/master`, then the fresh-eyes pass that
v9.152.1 and v9.153.2 used.

## 16. Assumptions and known departures

W0 build notes (2026-09-05), where the build departed from the draft above:

- §3.1 `rubric-checks`: the rubrics carry no "What to look for" or "Checks"
  heading. The extractor reads list items under `PRIMARY QUESTIONS` and
  `NON-NEGOTIABLES`, the two headings every rubric uses.
- §3.1 `invocations`: the extractor keeps `/wf <key>` plus at most one extra
  token (a mode or a `<X>` placeholder). Example arguments after it are
  wording. 104 invocations at baseline, not 225.
- §3.4 load metric: the draft measured markdown links to depth one. That
  reproduced the 2026-09-04 table but counted "per X" references as loads and
  missed every backticked "Load `X`". W0 replaced it with core / instructed /
  referenced (§1.1) and reset the targets from the §4.1 budgets. Following
  every backticked `.md` name joins all 22 keys into one 154-file component,
  because key bodies mention each other by name without loading each other;
  a backticked path outside the key's own directory counts only when a load
  verb takes it as object. `intake` instructed = one mode (the largest,
  `default.md`), not all 17.
- §3.6 eval baseline: the harness (`tests/evals/run.mjs`), three fixtures, and
  twelve cases are built. The baseline run did not happen: headless `claude -p`
  on the build machine returned "OAuth session expired and could not be
  refreshed". Run `npm run evals && node tests/evals/run.mjs --write-baseline`
  from an authenticated shell before the first W1 edit.
- The inventory gate runs inside `npm test`
  (`tests/unit/capability-inventory.test.mjs`) and in the CI `gates` job.

- Counts are v9.153.4. The 9.153.5 release in flight may move them. W0
  re-measures.
- The §1.1 targets derive from the §4.1 class budgets at 11 words per line.
  If the reviewer pass finds a stage that cannot meet its target without
  deleting a capability, raise that one file's budget in `prose-budget.json`
  in a one-line commit and say why in the commit body. Do not delete the
  capability. The load target follows the budget, never the other way.
- The 20-question shape floor and the intake ambiguity inventory are recorded
  PO decisions. W1 compresses their wording and keeps their counts.
- W1 words (2026-09-05): the 4,050-word core target was unreachable for ten
  files without deleting a capability. Each carries a `wordBudgets` raise with
  its reason: `SKILL.md` 1,719; `yolo` 3,758; `handoff` 5,069; `plan` 5,138;
  `shape` 4,932; `ship` 4,104; `intake` 3,092; `probe` 3,461; `implement` 3,249;
  `verify` 4,073. `retro` (2,723) and `auto` (2,631) fit their share. The load
  target rounds up to the next 50 (`003ced92`), so a raise never fails the file
  it exists for. The §4.1 table's 4,050 column is superseded by the raised
  targets `measure-load` prints. Zero keys are over the load target.
- `claude plugin eval` may open during this plan. Migrate the harness then;
  keep the cases.
- Pi main and sub-agent transcript shapes are known, and nonzero main-session
  usage is confirmed. W8 stays gated on one live check in §10.6, foreground
  sub-agent append-versus-Stop ordering, and on the pi-unified install.
- W11 counts are from the operator machine on 2026-09-05. Another machine
  differs. `doctor` re-measures before the first W11 edit.
- W11.4 changes the default port. A user with a hand-edited `hub-config.json`
  keeps the port they set; only the old default migrates.
- W11.6 folds hooks per event. If a host's hook contract cannot run two
  checks in one process with distinct exit semantics, keep separate entries
  for that host only and record the exception in the host contract file.

## 17. Build ledger

One row per wave or sub-item. `State` is one of `built`, `in progress`, `blocked`, `open`.
A row is `built` only when its gate in §15 is green on a commit. The commit column names
the commit that closed the row. Every commit is local until the operator pushes.

| Item | Scope | State | Commit | Note |
|---|---|---|---|---|
| W0 | Capability inventory, load metric, eval harness | built | `4a554592` | eval baseline not recorded: headless `claude -p` returns "OAuth session expired" |
| W1 lines | Every stage body ≤ 250, shared contract ≤ 80, dispatchers under budget, §4.4 splits | built | `c30e5b30`…`7e212b16` | 46 commits, one file each |
| W1 frontmatter | Delimiters restored in `intake.md`, `intake/extend.md`; gate added | built | `f462b6b2` | regression from the W1 unwrap passes |
| W1 words | 16 key bodies ≤ 2,331 words so core ≤ 4,050; 3 keys within instructed | built | `f2e8f0bd`…`a158fd6a` | 12 commits; 0 keys over the load target. retro (2,723) and auto (2,631) fit; 10 files carry §16 `wordBudgets` raises with reasons (see §16). §4.3 cuts only; 3 false invocations retired, 1 gate key moved |
| W2 | Retired-surface migration text deleted; doc-site table + assertion | built | `f5be5bf2` | 21 sentences, 13 files |
| W3 | Emphasis vocabulary rewrite + token gate | built | `e418df1c`, `6cd8ee94`, `4ccae1ed` | MANDATORY 151→0, CRITICAL 31→4 (3 rubric code-example strings for W4 + trivy's `--severity HIGH,CRITICAL`, allowed), MUST 72→0 outside `_ste-procedural.md`, NEVER 14→0, Do NOT 74→0, verbatim 56→1 (SKILL.md), v9.x 7→0; STOP is a per-sentence rule keyed on the W0 `stops` inventory (`tokens.STOP.sentences`), no ratchet; 5 keys reworded, 2 pins converted; 14 Role blocks trimmed to five lines, the shared order sentence moved into `_workflow-rules.md` |
| W4 | Review rubrics 35 → 11 with aliases, focus, aggregates, docs page | built | `4fb5bb5e` | 35 files / 17,648 lines → 11 files / 1,482 lines, every rubric ≤ 100; 24 aliases via `focus:`; groups.json carries the 34→11 map; extractor check headings gained `What to look for` + `Severity calibration` (nested `###` stay inside); 17 duplicate generic bullets + 11 tree-wide keys retired; 6 sentence tests migrated; the `review-adhoc` before/after diff waits on W6 auth |
| W6 | Eval baseline + `--compare` | blocked | — | needs an authenticated `claude`; cases and fixtures exist |
| W7 | One version carrier + render gate on renderer bytes | built | `7e755fbf` | `scripts/stamp-version.mjs` + the package.json `version` lifecycle script (`npm version <level>` stamps 5 carriers, builds, verifies, stages by path); `_shell.mjs` literal removed (reads `runtimeVersion` from the manifest); `rendererBuildId` = sha256 over renderers/, view-src/, components/ decides render freshness before buildId and version; CSS/JS cache-buster is its 12-char prefix; `verify:versions` requires the manifest + a 64-hex `rendererBuildId` and fails on a shell literal; dist rebuilt; 7 sentence tests migrated + 5 new stamp tests; e2e 50 types green |
| W8 | Exact cost ledger: Stop hook, parsers, readers, consult triggers | built | `4b1e7dae` | `lib/cost-ledger.mjs` (incremental byte reads, host detection, Claude / Codex / pi parsers, attribution, atomic append, `aggregateCost`) + `hooks/cost-ledger.mjs` → `dist/cost-ledger.mjs` on the new Claude `Stop` event and the Codex `Stop` group via the thin `hooks/stop-cost.mjs`; `hooks.costLedger` toggle; cost tables on the slug pages (`index.mjs`, `workflow-index.mjs`), the dashboard, `/wf status` (both modes), and two evals `--compare` columns; `_consult-triggers.md` (29 recorded, exclusive names), 10 stage paragraphs name their triggers, `consult-runs` on 5 frontmatter types + schema, dispatcher `usage` + `external` rows keyed by `SDLC_COST_SLUG`; 17 new tests + 3 migrated; e2e 50 types green |
| W9 | Surface policy file + `verify:surface` + earn rule | built | `d84bbce9` | `docs/internal/surface-policy.json` pins keys 22 · intakeModes 12 · reviewRubrics 11 · aggregates 7 · artifactStems 93 · frontmatterTypes 66 (tree counts, not the plan's estimates); `scripts/verify-surface.mjs` counts from the tree, fails over the pin, reports slack; `docs/internal/SURFACE-POLICY.md` carries the earn rule, the hold condition, and the router-extraction decision (no); `verify:surface` in package.json + CI; 5 tests |
| W10 | README ≤ 150 lines + `verify:docs` extension | built | `19a67f29` | README rewritten to 90 lines (hosts table, install + first-workflow pointers, ten-stage sequence, 22-key table, hooks pointer, full site map, develop commands); the 11 release blockquotes and every retired name deleted; `verify-doc-site.mjs` check (h): ≤ 150 lines, no `wf-meta`/`wf-quick`/`wf-design`/`wf-docs`/"two hosts", names Claude Code + Codex + pi |
| W11.1 | `doctor` + installed check + cutover record | built | `3228b18f` | `lib/doctor.mjs` + `scripts/doctor.mjs` (`npm run doctor`, tray "Run doctor…", bundled to `dist/`); `verify-release-pushed.mjs` `installed` check (blocking off CI, advisory on CI, `--skip-installed`); SINGLE-SOURCE-CUTOVER.md §2 steps 0 + 7 and §5 before-record; 9 tests |
| W11.2 | One runtime log, lifecycle log, error log routing, hex payload, restart count | built | `d4759aa6` | `lib/runtime-log.mjs` (1 MB, 2 generations); hub.log via `logHub()`; lifecycle.log from every supervisor decision (8 events); errors.log keyed by repoRoot, per-repo file only with `.ai/workflows`; `describeInvalidJson` hex head; hub-history.jsonl → `health.history` + tray tooltip; 7 tests incl. a live start |
| W11.3 | Conditional SessionStart, registry refusals, litter deletion, comment fix | built | `8da11530` | `lib/session-start-policy.mjs` decision (compact / no `.ai/workflows` / outside git → nothing; hub-ensure on startup+resume); Codex `session-start` returns on compact; `ephemeralRootReason` + `validateEntry` refusal (temp, worktree, scratchpad; `SDLC_ALLOW_TEMP_ROOTS=1` in run-all); header comment fixed; 4 + 3 + 1 tests. Litter deletion NOT done (declined) — the operator's step, list in CHANGELOG |
| W11.4 | Port-held handling, EADDRINUSE, default port move + migration | built | `0b771478` | `lib/port-owner.mjs` (`portHeld`, `portOwner`); supervisor returns `port-held` + lifecycle line, no spawn; hub-serve EADDRINUSE → hub.log + exit 2; tray tooltip names the holder; default port 4173 → 48173 with one-shot `migrateHubConfig` (marker `portMigratedFrom`) + `port-migrated` lifecycle line; docs updated (installation.html left: another session's file); 6 tests incl. live port-held + live EADDRINUSE |
| W11.5 | Runtime store GC on every start | built | `c9654108` | `gcRuntimes` runs after every confirmed start and both adopt paths (try/catch, `gc` lifecycle line on removal); `active-runtime.json` records `previousBuildId` and GC keeps it; never-remove rules unchanged; gate test 6 → 3 |
| W11.6 | Folded hooks per event | built | `ff303546` | `hooks/pre-tool-use-all.mjs` + `hooks/post-tool-use-all.mjs`; every check exports `run(input)`; `lib/hook-runner.mjs` (`runStandalone`/`runFolded`/`blockToolCall`/`isEntry`); one systemMessage line per process; Codex adapters call the folded bundles, codex.hooks.json unchanged; warm Write path 97 ms (was 245 ms summed); 6 tests red-first |
| W11.7 | Test isolation via `SDLC_HOME` + state-dir guard | built | `dd64fb31` | run-all sets a temp `SDLC_HOME` per run, records the real `~/.sdlc` fingerprint, runs `state-dir-guard.test.mjs` last; fingerprint = registry roots/shards, prune-log size, hub.pid, runtime builds, active build (not the dir mtime); red-first; full suite 960 pass + guard green, real state untouched |
| W11.8 | Exposure defaults: basenames, code browser gate, tray hash manifest | built | `d8330cf5` | health/registry basenames + no viewDir without `x-sdlc-token`; `codeBrowser.acknowledgedTailnet` + `effectiveCodeBrowserConfig` at both spawn sites, 404 with reason, health `codeBrowser.reason`; `bin/tray/SHA256SUMS` + `verifyTrayHelper` refusal in tray.mjs; `bin/tray/README.md`; 5 tests red-first |
| W11.9 | Dead paths: deprecate (N), delete (N+1) | step 1 built; step 2 waits for release N+1 | `60a714ab` | `lib/deprecations.mjs` (`deprecatedConfigWarnings`, `logDeprecatedConfig`); `hub-ensure --session-start` from both SessionStart spawns → one `deprecated-config` lifecycle line per setting per session; comments + 3 docs rows + CHANGELOG Deprecated; 4 tests red-first. Step 2 = R11 (delete `serve-lifecycle.mjs`, `render-sunflower-serve.mjs`, the keys; `retired.json` entries) |
| W11.10 | Bounded catch-up render + 5 s Codex wait | open | — | |
| W11.11 | Shared `_assets` from the hub + prune-log rotation | open | — | |
