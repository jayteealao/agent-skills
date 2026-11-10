---
description: The one review surface, for a workflow and without one; the first token decides which. `/wf review <slug>` runs the review stage, stage 7 of 9. It reads the workflow records and the diff, dispatches one scout for each selected dimension and one refuter for every finding, merges the findings into the ledger `findings.yaml` (a re-run keeps the IDs, marks a cleared finding resolved, and deletes no row), and writes the review file whole. `/wf review <dimension>` runs one rubric inline, and `/wf review sweep <aggregate>` dispatches one reviewer for each dimension; these ad-hoc runs need no slug. `/wf review <slug> triage` revisits the deferred findings.
argument-hint: "<slug> [slice | triage] | <dimension> | sweep <aggregate>"
---

You are running `/wf review`. With a slug it is the review stage, stage 7 of 9: it finds the defects in the work packet, fixes each one itself, and writes `07-review.md` (or `07-review-<slice>.md`) from the findings ledger. With a dimension or `sweep` it is an ad-hoc review that returns its findings in chat and writes no stage artifact. Step 00 decides which.

Before you assert that code misuses a dependency, read its source per [_source-study.md](_source-study.md), in the stage and in an ad-hoc review.

## Card

- Look for issues only in the work packet: the changed files, and the files that call, import or test the changed code.
- Ask the person nothing about a finding. Fix every finding, at every severity, or dismiss it: dismiss a false positive with the reason, and a finding that goes against a decision of the person with `--decision <id>`.
- Fix the findings yourself, one after another, in your own session: one step and one commit for each finding. Dispatch no fix sub-agent. A finding never becomes a new slice or a route back.
- When a fix changes an acceptance check, an approved screen or a `02c-craft.md` line, rewrite the check and the plan step in the same step.
- When the tests of a fix step fail twice, revert the step, set the finding `could-not-fix`, and continue.
- Every finding gets a refuter before it enters the ledger. Merge the findings with `wf.mjs findings add`. Do not edit `findings.yaml` by hand.
- After the fix steps, run the full and heavy suites of the test profile once for the packet, and each check that a plan, implement or verify record names under `## Packet Checks`. Run each suite with `wf.mjs profile run "<root>" <suite>`: it runs the command of the suite and records its time and the HEAD that it passed at. When you fix code after a packet suite passed, run again only the suites that read the files of the fix.
- A command longer than the longest check of your brief is a long run. Follow [_long-runs.md](_long-runs.md): measure it first with a pilot, check that a later change does not make its result stale, take the fastest path that gives a valid answer, and run it in the background.
- Take the verdict and the counts from `wf.mjs findings metrics`. The verdict counts the open findings only.
- Stop only on a BLOCKER that is `could-not-fix`.
- To change the body of a record that exists, run `wf.mjs record draft "<root>" <slug> <name>`, edit the draft that it names, then run `wf.mjs record put "<root>" <slug>`.
- To change several records or several list items, write a script for `wf.mjs run`, per [_api.md](_api.md).

## Requires

Read every row that applies before you write the stage artifact. [_requires.md](_requires.md) defines the check. The check runs in stage mode only: an ad-hoc review writes no stage artifact.

| Input | Kind | When | Sections |
|---|---|---|---|
| `00-index.md` | artifact | always | |
| `02-shape.md` | artifact | always | |
| `decisions.yaml` | artifact | if-present | |
| `03-slice.md` | artifact | if-present | |
| `03-slice-<slice>.md` | artifact | always | |
| `04-plan-<slice>.md` | artifact | always | |
| `05-implement-<slice>.md` | artifact | always | |
| `06-verify-<slice>.md` | artifact | if-present | |
| `01-intake.md` | artifact | mode:slug-wide | Success Criteria |
| `04-plan-*.md` | artifact | mode:slug-wide | |
| `05-implement-*.md` | artifact | mode:slug-wide | |
| `06-verify-*.md` | artifact | mode:slug-wide | |
| `01-<mode>.md` | artifact | mode:change | |
| `04-plan.md` | artifact | mode:change | |
| `05-implement.md` | artifact | mode:change | |
| `06-verify.md` | artifact | mode:change | |
| `02b-design.md` | artifact | if-present | |
| `02c-craft.md` | artifact | if-present | |
| `04b-instrument.md` | artifact | if-present | |
| `04c-experiment.md` | artifact | if-present | |
| `05c-benchmark.md` | artifact | if-present | |
| `07-design-audit.md` | artifact | if-present | |
| `07-design-critique.md` | artifact | if-present | |
| `07-review-<slice>.md` | artifact | on-resume | |
| `findings.yaml` | artifact | if-present | |
| `review/_stage.md` | procedure | always | |
| `_source-modes.md` | procedure | always | |
| `review/_triage.md` | procedure | mode:triage | |
| `review/_select.md` | procedure | mode:select | |
| `review/_dispatch.md` | procedure | mode:select | |
| `review/_ad-hoc.md` | procedure | mode:ad-hoc | |
| `review/_artifact.md` | procedure | always | |
| `_findings-ledger.md` | procedure | always | |
| `07-review-<slice>.md` | writes | | |
| `07-review.md` | writes | | |

The modes of this table:

| Mode | Applies when |
|---|---|
| `triage` | The second argument is `triage`. |
| `select` | You select the rubrics and dispatch the reviewers yourself (`review/_stage.md` Steps 2 and 3). A driver run that passes the findings of its own scan does not apply `select`. |
| `ad-hoc` | The first token is a dimension or `sweep`. |
| `slug-wide`, `change` | Its disk fact in [_requires.md](_requires.md) is true, or `modes:` lists it. |

Declare each mode that applies in `modes:` of the stage artifact, for example `modes: [select]`. Slug-wide is the default scope. In slug-wide mode the rows with `<slice>` do not apply, and a re-run reads `07-review.md` and the ledger `findings.yaml`.

# Step 00 — Resolve the first token: stage or ad-hoc

Resolve the first token before any stage logic. Check in this order, and take the first case that matches:

| First token | Mode | Do |
|---|---|---|
| A slug: `node "<skill-dir>/scripts/wf.mjs" record get "<root>" <token> index` exits 0 | stage | Read `review/_stage.md` in full and follow it. The optional second token is a `<slice>`, `triage`, or a rubric or alias key of [review/_ad-hoc.md](review/_ad-hoc.md). When a slice has the same name as a key, the slice wins. |
| `sweep`, or a rubric, alias or aggregate key that [review/_ad-hoc.md](review/_ad-hoc.md) lists | ad-hoc | Read [review/_ad-hoc.md](review/_ad-hoc.md) in full and follow it. An ad-hoc run does not load the stage body. |
| Anything else | none | Load [route.md](route.md) with every token of `/wf review`, and the reason `<token> does not fit <dimension>`. The router offers the nearest slug or dimension first. |

A dimension name that is also a slug resolves to the slug, because the slug check comes first. To reach the dimension, type `/wf review sweep <name>`, or run the ad-hoc review in a repo with no such slug.

`SKILL.md` Step 0 checks the slug on the disk. This step checks the dimension, because the list of dimensions lives in `review/_ad-hoc.md`.
