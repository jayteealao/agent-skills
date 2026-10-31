---
description: The router of `/wf`. Step 0 of `SKILL.md` loads it when `/wf` has no arguments or the tokens do not resolve to a full command. It answers questions about `/wf`, or names one command, asks the person, and runs that command after the yes. It writes nothing.
argument-hint: "[text]"
---

# Role

You turn the person's words into one `/wf` command. You do not do the work of a key, and you write no artifact: the routed key writes. `route` is not a key. Step 0 of `SKILL.md` loads this file.

# Step 1 — Read the inputs

Step 0 gives you every token, the key candidate included, and the reason it did not dispatch:

- `empty`: `/wf` has no arguments (Step 2).
- `not a key`: the first token is not one of the 18 keys of the [key tables](#key-tables).
- `missing <position>`: a required position of the key is empty, for example the slug of `/wf implement`.
- `<token> does not fit <position>`: a token is not of the class that the Arguments cell names.
- `<token> does not fit the form`: tokens are left after the last position of every form.
- `<token> not on disk`: a slug, a slice or a branch that the disk check did not find.

Read the open workflows with `node "<skill-dir>/scripts/wf.mjs" status "<projectRoot>" --json`. Each workflow whose `group` is not `completed` is open; it carries its `slug`, `title`, `stage`, `selectedSlice`, `updatedAt` and `next`. When the reason is a slice miss, run `node "<skill-dir>/scripts/wf.mjs" status "<projectRoot>" <slug> --json` for that slug; its `slices` list is the roster. No workflow in the result means there are no open workflows.

Build the command from file paths only. Never put a word of the person's text into a shell command. Load no other reference before you classify.

# Step 2 — A bare `/wf`

When the reason is `empty`, ask one question per [_gate-question.md](_gate-question.md):

> What do you want to do? Pick a workflow to continue, or describe the work in your own words.
> - **Continue `<slug>` — next: `<next>`** — one option for each of the three open workflows with the newest `updatedAt`, newest first.
> - **Ask a question about /wf** — only when fewer than three Continue options exist.
> - **Show all keys** — print the key tables of this file.

The free-text answer describes the work or asks a question.

- When the person picks a Continue option, the pick is the yes. Go to Step 6 with that command.
- When the person picks **Show all keys**, render the [key tables](#key-tables) and end the run.
- When the person picks **Ask a question about /wf**, ask for the question in one chat message. Then go to Step 4.
- When the person writes free text, classify it at Step 3. This question counts as the first of the two questions that Step 5 allows.

# Step 3 — Classify

Use the first row that matches the text. A near match is a Levenshtein distance of 2 or less, or a substring in either direction. Match an open workflow by its slug, its title, or a near match of either.

| The text | Route |
|---|---|
| asks about `/wf` itself: how, what, which, why, or the difference between keys or modes | help (Step 4) |
| starts with a near match of a key (`implemnt`) | the corrected key with the same tokens |
| names a slug or a slice that Step 0 did not find | the same command with the near match; with no near match, the open workflows |
| leaves the required slug of a key empty (`/wf implement`) | that key with each of the three newest open workflows |
| names an open workflow and no stage or action ("keep going on export") | that workflow's `next` |
| names an open workflow and a stage or action ("review the export work", "ship the login PR") | `/wf <key> <slug>`, with the slice or the dimension when the text names one |
| asks about the state of all work ("what should I work on next") | `/wf status advise` |
| asks about the state of one workflow ("where is export") | `/wf status <slug>` |
| asks whether built work runs ("does it actually work") | `/wf probe <slug>`, or `/wf probe sweep` when the text names no workflow |
| names a loop, a project contract, documentation or design setup | the matching key or sub-key |
| asks for new work of any kind | `/wf intake <text>` |

A question about the code of the project is not help. "Why does the export fail" is new work, so its route is `/wf intake why does the export fail`.

**Intake keeps its classifier.** Never choose an intake mode from the text. When the text names an intake mode word of the `intake` row (`fix`, `rca`, `brainstorm`, and so on), the route is `/wf intake <mode> <the rest of the text>`. Otherwise the route is `/wf intake <text>`, and intake's own classifier chooses the mode.

When a closed workflow is the near match, add ` (closed)` to its option.

# Step 4 — Help

Help answers a question about `/wf` from these sources, in this order:

1. The [key tables](#key-tables) at the end of this file.
2. The `description` and `argument-hint` frontmatter of the key's reference file.
3. The section of the reference file that the question names. For an intake mode, read `reference/intake/<mode>.md`. For the difference between two intake modes, use the list "Not this mode" below first.

Never read a file under `docs/site/`. The reference files are what the keys run, so an answer from them matches the behaviour.

- Help is read-only. It writes nothing and asks no question, except for a task question.
- Name the source file of each fact in the answer.
- When the question asks how to do a task ("how do I ship a hotfix"), end the answer with the command and the confirm question of Step 5.
- End with the Step 2 summary of `SKILL.md`: the first line is `wf help: <topic>`, and `Artifacts:` is `none`.

## Not this mode

The contrasts between intake modes and the keys near them. The auto-route discriminators of [intake.md](intake.md) hold the contrasts between the modes that intake proposes.

- `rca` starts from a symptom and finds why it broke. `discover` starts from a theory and gives a verdict. `investigate` starts from a stated problem and sketches how to solve it.
- An explanation of how existing code or an artifact works is `/wf status recap <slug> [plan|shape|slice|review|findings]`, or a plain conversation outside `/wf`. It is not `rca`, `discover` or `investigate`.
- `hotfix` is for an active production incident. `refactor` keeps the behaviour, with a test baseline. `fix` is a small intentional change. `rca` decides whether the hotfix path fits; `hotfix` runs after it.
- `investigate` writes options with no winner. The shape phase of `/wf intake` writes one chosen design with acceptance criteria.
- `adopt` roots a new workflow from work that is already done. `fix`, `hotfix` and `refactor` build work that is not done yet. `/wf intake <slug> <scope>` adds new scope to an existing workflow.
- `audit` reads a subsystem and never fixes. The review stage checks a change against its acceptance criteria, with a fix loop. `probe` runs the built artifact.
- `task` does one bounded operation, with its own gate. `ship` releases built software through the ship-plan, with go/no-go gates. `project` holds the project-level contracts.
- `close` ends a workflow or a slice early. `retro` takes the lessons after a ship; run it first for a retro on cancelled work.
- `amend` changes recorded config only (branch, base, review scope, title, tags). New scope goes through `/wf intake <slug> <scope>` or a fix slice.
- `modernize` backfills the schema fields around the artifacts. Wrong content needs the stage that owns it.

# Step 5 — Ask

**The intake skip.** When the only route is `/wf intake <text>` with no mode word, ask no question. Go to Step 6. Intake asks its own questions before it writes. When the route names a mode word, or intake is one of two routes, ask the confirm question.

**The confirm question.** For every other route, ask one question per [_gate-question.md](_gate-question.md):

> I read this as: <one-line restatement>. Run `/wf <command>`?
> - **<the best route> (Recommended)** — one line: what the command does and what it writes.
> - **<the second route>** — only when a second route is close.
> - **Something else** — describe the work again.

- Show the full command in each option, so that the person learns the keys.
- When the command starts a driver (`yolo`, `campaign`) or an outward act (`ship`), say so in its option.
- Route to `yolo` on every host: Claude Code, Codex and pi.
- When the person answers **Something else** or with free text, classify the new text at Step 3.

**The clarifying question.** When no route is clear, ask one question with at most four options and the free-text answer. When the second answer is also unclear, render the [key tables](#key-tables) and end the run.

**Two questions at most.** Ask at most two questions before you run a route or end the run.

**No answer, no run.** The confirm question and the clarifying question are intent-bearing, so rung 3 of the gate ladder never settles them. In a headless run, print the question with its options, end with the Step 2 summary of `SKILL.md` (`wf route: <restatement>`, `Artifacts: none`, `Next:` the recommended command), and end the run.

# Step 6 — Run

After the yes, print the `wf dispatch:` line of `SKILL.md` Step 0 for the chosen command. Continue at Step 0.7 of `SKILL.md`, and load the chosen command's reference at Step 1. The routed key's Step 2 summary ends the run.

# Rules

- The router never runs a command without the person's yes. A Continue pick and the intake skip are the only exceptions.
- The router never writes an artifact.
- The router never chooses an intake mode that the person did not name.
- The router never creates or renames a slug.
- The router never puts the person's text into a shell command.

# Key tables

The dispatch reads the forms of these tables from `skills/wf/keys.json` and checks each `<slug>`, `<slice>` and `<branch>` on disk. So `/wf plan the migration` comes to the router, because `the` is not a slug.

<!-- generated from skills/wf/keys.json by npm run generate; edit keys.json -->
### Stages

| Key | Arguments | Does | Writes |
|---|---|---|---|
| `intake` | `[<slug>] [<mode>] [text]` | Entry dispatcher. A description starts stage 1: the brief, then the shape work in the same run, or the small path when the person chooses it (implement and verify now, one commit on the checked-out branch, one note). A mode (`fix`, `rca`, `investigate`, `discover`, `audit`, `hotfix`, `refactor`, `update-deps`, `ideate`, `brainstorm`, `adopt`, `optimize`, `simplify`, `task`) runs an entry flow. An existing slug plus a mode attaches a compressed slice; a slug plus free scope extends the workflow. A slug plus `amend`, `modernize` or `close` edits, backfills or closes the workflow or one slice. | per mode |
| `shape` | `<slug> [text]` | Alias of `intake` for this release: runs the shape phase of intake on a workflow whose brief is written. Use `/wf intake`. | `02-shape.md` |
| `design` | `[<slug>] [move\|amend\|import\|audit\|critique\|explore] [text]` · `explore [<slug>] [text]` · `setup\|teach\|extract\|direction\|sync [text]` | Human-only: the person approves the screens before drivers run. | `02c-craft.md` |
| `slice` | `<slug> [text]` | Decompose the shape into shippable slices. | `03-slice.md`, `03-slice-<slug>.md` |
| `plan` | `<slug> [<slice> [text]]` · `<slug> all` | Per-slice plan with a reuse scan. Applies the augmentation plan via `reference/augment/<type>.md`. | `04-plan-<slice>.md` |
| `implement` | `<slug> [<slice>\|reviews]` · `<slug> <slice> reviews` | Code the slice. `reviews` runs fix-blockers mode on the selected slice or on the named slice. | `05-implement-<slice>.md` |
| `verify` | `<slug> [<slice>]` | Tests, lints, typecheck, the user-observable AC gate, one user-gated fix loop, augmentation re-checks. | `06-verify-<slice>.md` |
| `review` | `<slug> [<slice>\|triage\|<dimension>]` · `<slug> triage [<slice>]` · `<dimension> [text]` · `sweep <aggregate> [text]` | With a slug: the workflow stage over the accumulating ledger. Without: ad-hoc review, one rubric or a fan-out. Resolves slug versus dimension itself. | review artifacts |
| `handoff` | `<slug> [<slice>]` · `pr#N` · `<branch>` | Alias of `ship` for this release: ship opens the PR first, then stops at the go/no-go gate. Use `/wf ship`. | `08-handoff.md` |
| `ship` | `<slug>\|pr#N\|<branch> [<env>\|announce\|rollback [<run-id>]]` | The last mile: packages the completed slices into a PR and watches CI, stops at the go/no-go gate, then merges and releases via `.ai/ship-plan.md`. Refuses while a required review has unresolved blockers. Batch mode over `pr#N` or a branch is all-or-nothing per PR. `announce` re-runs comms. `rollback [<run-id>]` runs the Go/No-Go reversal. | `08-handoff.md`, `09-ship-run-<run-id>.md`, `09-ship-runs.md`, `09-rollback-<run-id>.md` |
| `retro` | `<slug>\|pr#N\|<branch> [deep]` | Post-mortem. Batch mode retrospects every slug on the branch and the cross-slug lessons. | `10-retro.md` |

### Drivers and loops

| Key | Arguments | Does | Writes |
|---|---|---|---|
| `probe` | `<slug> [sweep\|text]` · `sweep [<path>]` | Runtime-truth verification of built work. Target mode compares to AC text. `sweep` enumerates the user surface against AC, charter, and `reference/_surface-defects.md`; as the first token it runs slug-less. Writes no code. | a compressed slice, or `.ai/surface-sweep-<date>.md` |
| `yolo` | `<slug> [<slice>]` | Autonomous driver. Resolves each gate by written policy. Stops before ship. | none |
| `campaign` | `<slug>` | Walk one work packet at a time: slice, yolo, fidelity, try-out. | `work/<packet>.md` |
| `loop` | `goal <slug> [resume\|status\|clear\|text]` · `optimize <slug>\|text` · `prototype text` · `prototype <slug>\|<branch> [text]` | `goal`: the host goal carries the slug, and `goal.mjs check` judges it. `optimize`: a metric loop that keeps or reverts. `prototype`: prove an idea by running code, one round per request of the person. | `goal.md`, `optimize/`, `prototype-ledger.json` |

### Navigation · routers

| Key | Arguments | Does | Writes |
|---|---|---|---|
| `status` | `[<slug>\|pr#N\|<branch>] [deep]` · `advise [<branch>\|pr#N\|fast]` · `recap <slug>\|pr#N\|<branch> [<slice>\|plan\|shape\|slice\|review\|findings]` | Dashboard; per-slug detail with the next command; `INDEX.md` reconciliation; `deep` drift check; `advise` cross-slug sequencing. `recap` tells a workflow's or a branch's story, or explains one artifact. | none; `recap` writes `90-recap.md` |
| `project` | `ship-plan init\|build\|edit\|audit [text]` · `observability init\|build\|audit [text]` | The project-level contracts: author, build, edit, or audit `.ai/ship-plan.md` and `.ai/observability.md`. | `.ai/ship-plan.md`, `.ai/observability.md`, and their audit files |
| `docs` | `[plan\|tutorial\|how-to\|reference\|explanation\|readme\|review [text]]` · `<slug>\|--audit-only\|<path>` | Documentation router: the orchestrator pipeline, or one Diátaxis primitive. | per primitive |

| Sub-key | Reference |
|---|---|
| `loop goal`, `loop optimize`, `loop prototype` | `reference/goal.md`, `reference/optimize.md`, `reference/prototype.md` |
| `status recap` | `reference/recap.md` |
| `project ship-plan`, `project observability` | `reference/ship-plan.md`, `reference/observability.md` |

Every key runs on Claude Code, Codex and pi in the same form, with these exceptions:

- `loop goal` on Claude Code: the mod puts the /goal line into the prompt box.
- `loop goal` on Codex: the agent calls create_goal.
- `loop goal` on pi: the person pastes the line that goal.mjs arm prints.
- `loop optimize` on Codex and pi: not available; the optimize driver runs only on Claude Code.
<!-- end generated -->
