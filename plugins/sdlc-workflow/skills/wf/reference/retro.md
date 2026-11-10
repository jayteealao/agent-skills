---
description: Extract the reusable lessons of a workflow and turn them into concrete improvements to prompts, hooks, repo instructions, tests and automation. A first argument of `pr#N` or a branch name runs a batch retro over every slug on that branch, one 10-retro.md each, and adds the lessons that span the whole branch.
argument-hint: <slug|pr#N|branch>
---

You are running `/wf retro`, stage 9 of 9. You read the whole trail of a workflow, find what went well and what hurt, distill the lessons that will recur into the solutions corpus `.ai/solutions/`, and write `10-retro.md` with improvements that a person can copy and paste. With `pr#N` or a branch, you do this for every slug on the branch and add the lessons that span the branch. After the retro the workflow is complete; no stage follows.

Pipeline: 1·intake → 2·design → 3·slice → 4·plan → 5·implement → 6·verify → 7·review → 8·ship → 9·retro

## Card

- Extract the lessons of the workflow and propose concrete improvements that a person can copy and paste. Do not apply them.
- Do not reopen the implementation and do not start new work.
- Write each lesson honestly, with the evidence that supports it.

## Requires

Read every row that applies before you write the stage artifact. [_requires.md](_requires.md) defines the check.

| Input | Kind | When | Sections |
|---|---|---|---|
| `00-index.md` | artifact | always | |
| `decisions.yaml` | artifact | if-present | |
| `01-*.md` | artifact | if-present | |
| `02-shape.md` | artifact | if-present | |
| `02b-design.md` | artifact | if-present | |
| `02c-craft.md` | artifact | if-present | |
| `03-slice*.md` | artifact | if-present | |
| `04-plan*.md` | artifact | if-present | |
| `05-implement*.md` | artifact | if-present | |
| `06-verify*.md` | artifact | if-present | |
| `07-review*.md` | artifact | if-present | |
| `07-design-audit.md` | artifact | if-present | |
| `07-design-critique.md` | artifact | if-present | |
| `design-notes/*.md` | artifact | if-present | |
| `08-handoff.md` | artifact | if-present | |
| `09-ship-run-*.md` | artifact | if-present | |
| `09-ship.md` | artifact | if-present | |
| `optimize/results.jsonl` | artifact | if-present | |
| `retro/_artifact.md` | procedure | always | |
| `design/record.md` | procedure | mode:design | |
| `_host-surfaces.md` | procedure | mode:deep | Session transcripts |
| `10-retro.md` | writes | | |

The index holds every deferral in `runtime-evidence-deferrals`, the cleared entries too.

# Step 0 — Orient

1. Resolve the first argument: a slug, `pr#N`, or a branch name. With no argument, take the newest `shipped` workflow of `.ai/workflows/INDEX.md` that has no `10-retro.md` record, and use its slug; `target` with no argument takes only open workflows, so it never names a shipped one. Run `node "<skill-dir>/scripts/wf.mjs" target "<root>" <arg> --json`:

   | Result | Do |
   |---|---|
   | `scope: slug` | A single-slug retro (`retro-scope: slug`). Continue with items 2–5 for that slug. |
   | `scope: branch` | A batch retro (`retro-scope: branch`) over its `slugs`. Follow "Batch retro" below. |
   | `ambiguous: true` | Ask the person which of its `slugs`. |
   | `error` | Show it, and stop. |

   A `deep` token anywhere in the arguments sets `deep-retro: true` and adds the deep pass of "Deep retro" below. Without the token, the retro reads the artifacts only. With the token, pass `--mode deep` to the inputs check, so that the `mode:deep` row applies.
2. Read `00-index.md` with `node "<skill-dir>/scripts/wf.mjs" record get "<root>" <slug> index`. Take `current-stage`, `status`, `selected-slice` and `open-questions` from its frontmatter.
3. Check the prerequisites:
   - Run `node "<skill-dir>/scripts/wf.mjs" record list "<root>" <slug>`. It must list at least one implement record: `05-implement-<slice>.md`, or `05-implement.md` in change mode. When it lists nothing beyond intake, stop, and tell the person: "Not enough completed work to retrospect. Run more stages first."
   - A ship run (`09-ship-run-*.md`, or an older `09-ship.md`) is strongly recommended, but it does not block: a retro can run after a cancelled or abandoned effort.
   - When `current-stage` of the index shows the workflow complete, note the re-run in chat and go on. [_additive-write.md](_additive-write.md) snapshots the earlier revision and appends to the `revisions:` ledger, so you ask no permission question.
4. Use the full trail of the workflow, every Requires row. The retro reflects on the design decisions and the augmentation outcomes too, not only the engineering ones. When the workflow needed a design, write back to the design record per [design/record.md](design/record.md) → Retro write-back: update `.ai/design/current.md`, and ask the person before any change to `.ai/design/direction.md`. In `## Surfaces` of `current.md`, set the Newest board of each surface that the workflow changed to its PNG in the last frozen revision (`workflows/<slug>/design/r<N>/boards/<key>.png`).
5. Carry forward the `open-questions` of the index.

# Step 1 — Analyse the trail

When the trail is large or spans several domains, dispatch the three analysis sub-agents below in parallel, and merge what they return. For a simple single-slice workflow, dispatch none, and do the same analysis yourself.

### Analysis sub-agent 1 — implementation and verification friction

Charter: read the plan, implement and verify records and the git log. Report where the build fought its plan:

- the drift from plan to implementation, with a cause for each deviation: a stale assumption, thin exploration, scope creep, or a legitimate discovery;
- how well verification worked: what the checks caught, what they should have caught earlier, and what could not be verified and why;
- the signs of rework in the commit history.

Every count names the artifact or the tool result that it came from. Pass this block to the sub-agent as it is written:

Deferred-debt harvest, of this workflow only:

- Collect every intentional-simplification marker that this workflow introduced. Grep its merged range for `sdlc-debt:`: `git log -p <merge-sha>^1..<merge-sha>` for a merge commit, or the commits of the PR (`gh pr view <pr-number> --json commits`) for a squash or a rebase merge. `merge-sha` and `pr-number` are in the ship run and the index. Also read `## Anything Deferred` and `## Known Risks / Caveats` of each `05-implement-<slice>.md`, with `node "<skill-dir>/scripts/wf.mjs" record get "<root>" <slug> 05-implement-<slice>.md`.
- For each marker, record the file and line, the ceiling, the upgrade path, and where it was recorded. Keep to the debt of this workflow. Do not grep the whole repo: that is the sweep of `/wf intake simplify codebase`.
- Classify each marker as `act-now` (worth its own follow-up workflow this sprint) or `accept` (a deliberate, acceptable ceiling that only needs to stay visible). The act-now items drive `## Deferred Debt` and Option B of Step 3.

### Analysis sub-agent 2 — review and handoff quality

Charter: read every `07-review-*.md` record (the record of each slice and each sub-review of a command; `node "<skill-dir>/scripts/wf.mjs" record list "<root>" <slug>` gives the names, and `record get` the content), `08-handoff.md`, the live entries of the decision store (`decide list`), and `02-shape.md`. Report:

- the quality of the findings: real bugs, nits and false positives; what stayed `open` at handoff; what tests or planning should have caught; what review missed that ship or production found later;
- the completeness of the handoff: the clarity of the PR, the accuracy of the migration and rollback notes, and whether the documentation plan of the shape was carried out;
- the friction of communication: questions over several rounds, wrong assumptions that nobody asked about, artifacts that the next stage could not use;
- the `USE` rows of the adoption matrix that never earned their install.

Every count names the artifact that it came from. Pass this block to the sub-agent as it is written:

Intent drift, the fidelity of the shipped code to the intake:

- Which intake directives did the shipped code narrow, and did the person ratify each narrowing? Compare the `## Intake Fidelity` table of `02-shape.md`, and the findings of any `07-review-*intent-fidelity*.md`, with what shipped.
- Which RIMs (the `intent-risks` ledger of `00-index.md`) were mis-adjudicated: the decision at shape looked right, but the shipped behaviour proved it wrong?
- Which limitation claims (the deferrals marked "known limitation — document at handoff") were later disproven: the wall cleared by itself, or was never a wall?

### Analysis sub-agent 3 — repo improvements

Charter: from the experience of this workflow, report the repo improvements that would make the next workflow cheaper:

- the undocumented conventions and the discovered patterns that belong in `AGENTS.md` or `CLAUDE.md`;
- the checks worth automating as hooks, given the review findings and the verification failures;
- the missing test categories, CI checks or test helpers that the verification results expose.

Each recommendation names the finding or the failure that motivates it.

Merge the findings of every sub-agent, and remove the duplicates. Write them into `## What Went Well`, `## Friction / Failure Points`, `## Root Causes`, `## Recommended Improvements` and `## Deferred Debt`.

# Step 2 — Distill the durable learnings

From the merged findings, distill 0 to 3 pattern-level learnings into the solutions corpus. Writing these files is part of the output of retro; it is not applying an improvement. Each learning passes all three tests:

1. It recurs: it would plausibly bite a future workflow, not only this one.
2. It is not obvious: the repo, its durable guidance (`AGENTS.md`, `CLAUDE.md`) and the stage references do not already give it.
3. It is actionable: a future plan or implement run could change a decision because of it.

Zero learnings is a valid outcome. Do not pad.

Strong candidates:

- A runtime-evidence deferral that repeats ("<wall> blocks all interactive ACs; the one-time harness that retires it = …"), category `testing` or `gotcha`.
- A standing steering entry that recurs across workflows (the live `steer` entries of this slug or earlier ones; see [_decisions.md](_decisions.md)), usually category `process` or the category of its subject. The three tests still apply.
- For an optimize slug: read `optimize/results.jsonl`, the trials of deleted round branches included. Record which hypotheses moved the metric and which did not as one learning tagged `optimize`, with `status: active`. The next optimize loop reads it.

Write each learning:

1. Dedupe first. Read `.ai/solutions/INDEX.md` when it exists, and look for overlapping tags and titles. On an overlap, update the file that exists: refresh its evidence, and make `source-workflow` a list. Do not write a near-duplicate.
2. Otherwise write `.ai/solutions/<category>/<learning-slug>.md`. The categories are a small closed set: `architecture`, `testing`, `build-tooling`, `process`, `domain`, `gotcha`, and `misc`. When `misc` overflows again and again, the set needs a review. The frontmatter has the schema type `solution`:

   ```yaml
   ---
   schema: sdlc/v1
   type: solution
   category: <one of the closed set>
   source-workflow: <slug>            # or [<slug>, ...] once later workflows refresh it
   created-at: "<iso-8601>"
   tags: [<free keywords for the consumer grep>]
   status: active
   ---
   ```

   The body has three short sections: Problem, Learning, How to apply.
3. Append one line for each new learning to `.ai/solutions/INDEX.md`: `- [title](<category>/<file>.md) — <hook>`. When the index is missing, create it with a `# Solutions` heading. Writers append; readers read the index first and load only the matching files.
4. Stamp `learnings-written: [<paths>]` in the retro frontmatter. An empty list is allowed.

Classify each learning as `about-the-project` or `about-the-workflow`. A project lesson is about this repo: its code, stack and domain. A workflow lesson is about `/wf` itself: a stage prompt that misfired, a wrong gate, a reference that misled.

| Lesson | `solutions.globalDir` of `.ai/sdlc-config.json` is set | It is `null` (the default, off) |
|---|---|---|
| about the project | Offer to copy it to the global dir, as a gate question per [_gate-question.md](_gate-question.md). Copy it only on an explicit yes: the promotion is a privacy decision of the person. Do not promote it silently or by policy; on an autonomous run it is a stop condition. | Keep it in the repo corpus. |
| about the workflow | Append it to `plugin-feedback.md` in that dir, for the person to review. Append only. Do not edit `/wf` itself. | Keep it in the repo corpus, and note it in the retro body. |

# Step 3 — Adaptive routing

Decide whether the workflow is truly done. Write every viable option into `recommended-routes`, so the person can choose:

| Option | Route | When |
|---|---|---|
| A (default): complete | the workflow is finished | Every slice shipped, and no follow-up work is warranted. |
| B: open a follow-up workflow | `/wf intake <new-task-description>` | The retro found follow-up work big enough for its own workflow, or the `## Deferred Debt` harvest found an `act-now` item. Route each act-now item to `/wf intake fix` (one file) or `/wf intake refactor` (across files). |
| C: next slice | `/wf plan <slug> <next-slice>` or `/wf implement <slug> <next-slice>` | The retro runs in the middle of the workflow, and more slices remain. |
| D: apply the retro improvements | specific file edits, as suggestions | The retro found quick wins in repo instructions, hooks or CI that the person may want to apply now. List them as suggestions you can act on, and do not apply them. |

# Step 4 — Write and close

Apply [_workflow-rules.md](_workflow-rules.md). Then, in this order:

1. Order the improvements by impact and effort.
2. Check that Step 2 wrote its learnings and stamped `learnings-written:`.
3. Write the options of Step 3 into the `recommended-routes` frontmatter.
4. Mark the workflow complete with `node "<skill-dir>/scripts/wf.mjs" record set "<root>" <slug> index status=complete next-command=none "next-invocation=none — complete"`, unless follow-up work opens.
5. Write the draft `<wf-dir>/.draft/10-retro.md` with the frontmatter and body sections of [retro/_artifact.md](retro/_artifact.md). On a re-run over a `10-retro.md` that exists, follow the additive-write contract of the same file. Run `node "<skill-dir>/scripts/wf.mjs" record put "<root>" <slug>` per [_records.md](_records.md). Then run `node "<skill-dir>/scripts/wf.mjs" record stage-done "<root>" <slug> retro`.

# Batch retro (`pr#N` or a branch)

This runs when Step 0 resolved a branch: the slugs that shipped together on one branch get their retros together.

1. Build the roster. The roster is the `slugs` of the `target` output: every slug whose `branch` is the resolved branch. When the output has the error "No workflows are on branch", show it and stop. Record the roster as `branch-slugs:`.
2. Run the retro of each slug of the roster: Step 0 items 2–5, then Steps 1–4, with `retro-scope: branch`, `branch:` and `branch-slugs:` added to the retro frontmatter of that slug. A slug with nothing beyond intake (no `05-implement*.md`) does not stop the batch: mark it "nothing to retro" in the roster, and skip it. Mark each retrospected slug complete with `node "<skill-dir>/scripts/wf.mjs" record set "<root>" <roster-slug> index status=complete`.
3. Then look across the whole branch for the patterns that no single retro can see: friction that recurred across slugs, a root cause that several slugs share, a plan assumption that broke the same way twice, sequencing pain between slugs. This is the value that a batch retro adds. Distill them into `.ai/solutions/` by the three tests and the dedupe of Step 2, with `source-workflow` set to the list of the roster slugs that contributed. Zero cross-slug learnings is a valid outcome. Do not pad.
4. Return in chat per "Chat return" below.

# Deep retro (the `deep` token)

This runs only when Step 0 set `deep-retro: true`. The deep pass finds the decision moments that the stage files did not record, and gives that evidence to the analysis of Step 1.

- Transcript reading depends on the host. Session transcripts exist only under a host that keeps a transcript folder for each repo ([_host-surfaces.md](_host-surfaces.md), row "Session transcripts"). When this host has one, scan the transcripts of the slug. Otherwise the deep pass reads the artifacts only: a deeper, more adversarial re-read of the stage trail, the decision store (`decide list`) and the git history, for the same decision moments. The retro then notes that transcript reading was skipped because of the host. Do not read a transcript path that this host lacks.
- The deep pass looks for decision moments: points where an approach was chosen, an assumption locked in, or an instruction of the person interpreted, above all "mirror or match exactly", "just like X", and narrowings that nobody stated. Extract the moment, what was decided, and whether the artifacts recorded it. An unrecorded decision is strong input for `## Root Causes` and for a durable learning.
- Fold what you find into the analysis of Step 1, intent drift above all. The deep pass gives evidence; the analysis and the distillation still own the write.

# Chat return

Apply [_grounded-progress.md](_grounded-progress.md): every count you report (checks run and passed, commits, findings) names the artifact or the tool result that it came from. After you write the files, return per [_chat-return.md](_chat-return.md). Lead with the narrative (its section *The narrative*), then give this receipt:

- `slug: <slug>`
- `wrote: <path>`
- `next: workflow complete`, or the options when follow-up work is warranted
- at most 3 short blocker bullets, when there are blockers

In a batch retro (`retro-scope: branch`), lead with the narrative of the whole branch: what went well and what hurt across the branch, the root causes that slugs share, and the top improvements. Then give the receipt as a roster: one `wrote:` line for each retrospected slug, each skipped slug with its reason, and one `cross-slug learnings:` line that names the `.ai/solutions/` files of the synthesis.
