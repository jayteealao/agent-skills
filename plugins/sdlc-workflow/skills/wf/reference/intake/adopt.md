# Output boundary & shared context
Apply `intake/_intake-context.md` — the External Output Boundary and the workflow-registry / slug rules. Apply **the "Compressed-lifecycle change-modes" contract in `intake/_change-mode-tail.md` (the model, the authorship split, and the gate)**. Do not restate them here.

You are running `/wf intake adopt`, the **reverse-entry** mode. Where `fix`/`hotfix`/`refactor` author a plan and then drive execution *forward*, adopt reconstructs the record *backward* from a diff that already exists, then hands the result to the standard verification chain.

# What adopt is (and is not)

- **Adopt is standalone-only and always creates a NEW workflow** from the current working-tree / branch state. There is no slug-mode: attaching already-done work to an *existing* slug as a slice is deliberately out of scope for this mode (the dispatcher never routes `<slug> adopt` here — see the dispatcher's Step 0). If the dispatcher somehow hands you a slug, STOP and tell the user adopt only roots new workflows.
- **Adopt does not write code and does not undo it.** The change already exists in the tree; adopt records it. The one thing adopt authors *forward* is the verification strategy — that is the entire point of adopting.
- **Adopt is not archaeology.** The adoptable surface is the *working tree plus the unpushed / unmerged branch delta* against the base branch. Work that is already pushed and merged has no quality tail left to gate — adopt refuses it (Step A0).
- **Every artifact adopt writes carries `provenance: adopted`** so no downstream stage, reader, or learnings-harvester mistakes reconstruction for forethought. This is load-bearing: retro's learnings distillation and any pattern-mining over `04-plan`/`05-implement` must be able to tell authored work from adopted work.

# Pipeline
`01-adopt`(intake) → `02-shape` → `03-slice` → `04-plan` → `05-implement` → **[confirm-before-write gate]** → `/wf verify` (→`06`) → `/wf review` (→`07`) → `/wf ship` → `/wf retro`

| | Detail |
|---|---|
| Requires | See [## Requires](#requires). Adopt refuses on a clean, fully-published tree (Step A0). |
| Produces (this command) | `01-adopt.md` (`type: intake`), `02-shape.md`, `03-slice.md` (`type: slice-index`, one slice), `04-plan.md`, `05-implement.md`, and a conformant `00-index.md` (`type: index`) — all `provenance: adopted`. |
| Reconstruction | `02`–`05` are inferred from the diff, not authored forward. `04-plan`'s ladder/reuse sections become *retrospective observations*; `04-plan`'s `## Verification Strategy` is authored *forward* — the real deliverable. |
| Gate | Stop-and-confirm the inferred shape (goal / scope / slice split / ACs) **before any artifact is written** (Step 2). Inference from a diff can be wrong, and a wrong adopted shape poisons every downstream stage. |
| Next | `/wf verify <slug>` — the standard verification chain takes over from stage 6. |
| Branch | Adopt **records** the current branch in `00-index.md`; it never creates or switches branches. The work already lives somewhere. |

## Requires

Read every row before you write the stage artifact. [_requires.md](../_requires.md) defines the check.

| Input | Kind | When | Sections |
|---|---|---|---|
| uncommitted changes or unmerged commits against the base branch | artifact | always | |
| `01-adopt.md` | artifact | on-resume | |
| `decisions.yaml` | artifact | if-present | |
| `intake/_intake-context.md` | procedure | always | |
| `intake/_change-mode-tail.md` | procedure | always | |
| `intake/_intake-provenance.md` | procedure | always | |
| `intake/_intake-provenance-consume.md` | procedure | mode:from | |
| `intake/adopt/_artifacts.md` | procedure | always | |
| `01-adopt.md` | writes | | |
| `02-shape.md` | writes | | |
| `03-slice.md` | writes | | |
| `04-plan.md` | writes | | |
| `05-implement.md` | writes | | |

# Scope discipline
You are a **reconstruction orchestrator**, not a coder and not a shaper inventing new scope.
- Infer scope from *what the diff actually does*, never from what it *could* have done. Scope-in is exactly the changed surface; scope-out is explicitly everything else.
- **Constraint forethought still applies.** An adopted AC with an environment dependency on its critical path is NOT exempt just because the code exists — resolve it to a prerequisite slice, a proxy AC + named clearing event, or explicit PO risk-acceptance, exactly as a forward plan would. Adopted work does not get to skip verification engineering.
- Ask at most **2 questions** in chat during reconstruction, plus the mandatory confirmation gate. Record each answer with `decide add` per [_decisions.md](../_decisions.md), and also write it inline into `01-adopt.md`.
- Respect the stated order only where a step consumes an earlier step's output or crosses a gate; reading and research may interleave freely.

# Step 0 — Orient (before anything else)

1. **New slug:** name it per "New slug" of [_intake-context.md](_intake-context.md), with the form `adopt-<short-description>`, from the optional `[description]` argument.
2. **No description:** derive the descriptor from the main concern of the diff after Step A0 collects it, and resolve the collision before any write.
3. **Same-branch active-workflow scan:** read `.ai/workflows/INDEX.md`; if any **active** workflow records `branch:` equal to the current branch, the diff on this branch probably belongs to that workflow — STOP and recommend the extension path (`/wf intake <that-slug> <scope>`) or that workflow's own next command. Adopting another workflow's in-flight branch work as a new workflow forks the record.
4. **Provenance check:** apply `_intake-provenance.md` — the investigated-then-patched path is adopt's most common lineage. On an explicit `from <source-slug>` token (or an exact investigate/ideate label match), consume the Consume-table row: the chosen option card seeds `## Restated Intent` and the AC derivation, and the link-back records `origin-<type>` here and `superseded-by` on the source. No match → continue.
5. **Stack fingerprint:** apply the stack policy in `_change-mode-tail.md` — detect cheaply, write the block with `user-confirmed: false` (adopt rides verify's caveat path; its two questions are spent on reconstruction).

# Step A0 — Gather the adoptable surface

1. **Resolve the base branch.** Use the same resolution the review stage uses: the tracked upstream of the current branch if set, else the repo default (`main`/`master`). Record it as `<base>`.
2. **Collect the surface** with the shell (use real output, never guess). The adoptable surface is one defined union:
   - committed-ahead: `git diff <base>...HEAD`;
   - staged: `git diff --cached`;
   - unstaged: `git diff`;
   - untracked: every path from `git status --porcelain` (`??` rows), each **enumerated explicitly and read in full** — never summarized as "notable ones".
   Exclusions: paths under `.ai/**` and `.scratch/**` are never part of the adoptable surface — workflow artifacts and scratch reads are records *about* work, not product changes (and may belong to another session).
3. **Refuse when there is nothing to adopt.** If the surface union is empty (clean tree AND zero commits ahead of `<base>`) → STOP with:
   > *"Nothing to adopt — the working tree matches `<base>` and no unmerged commits are ahead. Use `/wf intake <description>` to start new work, or make the change first and re-run adopt."*
4. **Refuse fully-published work — decidably.** `git fetch <remote>` first (skip on network failure with a one-line note), then check every commit ahead of `<base>` with `git branch -r --contains <sha>`: if **every** ahead-SHA is contained in the remote base branch AND the local diff (staged + unstaged + untracked) is empty → STOP: adoption's quality tail has nothing to gate; recommend `/wf intake <slug> <scope>` extension or a fresh workflow instead.
5. **Record the surface** — the changed-file list with per-file insertion/deletion counts (`git diff --stat`), the enumerated untracked list, the commit SHAs ahead of base, and the current branch name. This becomes the *provenance evidence* embedded in `01-adopt.md` and referenced by every reconstructed artifact.

# Step A1 — Reconstruct the shape (parallel grounding, then infer)

Use parallel research sub-agents to understand the diff before inferring intent — do not reconstruct from the diff text alone.

**Effort tier for every dispatched agent:** **low** (per [_subagents.md](../_subagents.md)). REQUIRED on every dispatch — both do bounded, targeted reads with structured-output extraction.

#### research sub-agent 1 — Diff comprehension
Prompt with ALL of the following:
- Given this changed-file set `<files>`, read each changed file around the changed hunks and summarize **what behavior the change introduces or alters** (observable effect, not line-by-line).
- Identify the entry points and callers touched; note anything the change *implies* should also have changed but did not (a smell the adoption should flag).
- Classify the change surface: is it one coherent concern, or clearly-separable concerns (disjoint file sets that are independently revertable)?
- Return structured text: `observed_behavior` (1–3 bullets), `entry_points`, `separable_concerns` (yes/no + grouping), `implied_gaps`.

#### research sub-agent 2 — Convention & risk grounding
Prompt with:
- For the changed area, report the nearby patterns the change should have matched (naming, error handling, test placement) and whether it did.
- Search for existing tests that already exercise the changed code paths (so verify knows what baseline exists).
- Run `git log --oneline -10` on the changed files; flag any also touched by *other* recent work (adoption may be racing a parallel change).
- Return: `convention_match` (matches/deviates + note), `existing_tests` (`path — what it covers`), `recent_churn`.

**Then infer the shape** from the diff + sub-agent findings:
- **Goal** — what the change accomplishes, in one sentence, phrased as intent.
- **Scope-in** — exactly the changed surface. **Scope-out** — explicitly everything else ("no changes to X, Y").
- **Acceptance criteria** — derived from the *observed behavior* of the change, each objectively verifiable, authored under the verifiability-first rules (an AC verify cannot evidence is a defect in the AC, not a fact to accept). Apply the force-scope rule of the plan stage (its `## Verification Strategy`) to each AC with an environment dependency.
- **Slice split** — a **single slice by default** (the workflow slug doubles as the one slice's `slice-slug`). Split into >1 slice **only** when sub-agent 1 reported clearly-separable concerns (disjoint file sets AND independently revertable); when in doubt, one slice.

# Step 2 — Confirmation gate (before any artifact is written)

Inference from a diff can be wrong, and a wrong adopted shape poisons every downstream stage. **Before writing any file**, present the inferred shape and confirm as a gate question per [_gate-question.md](../_gate-question.md):

```
question: "Adopting <N> changed files on branch `<branch>` as workflow `<slug>`. Inferred goal: “<goal>”. Scope, slice split (<M> slice(s)), and <K> acceptance criteria are drafted from the diff. Adopt this shape?"
options:
  - label: "Adopt"
    description: "Write the reconstructed artifacts (01-adopt → 05-implement) and route to /wf verify."
  - label: "Adjust"
    description: "Correct the goal / scope / slice split / ACs before writing — say what is wrong."
  - label: "Cancel"
    description: "Do not adopt. Nothing is written."
```

- On **Adjust**, revise the contested part and **re-present once**. On a second correction, fall back to interactive shape questions (the default-intake question style) for the still-contested part only, then proceed.
- On **Cancel**, STOP — write nothing.
- Show the AC list and the changed-file roster in the chat around the question so the user is confirming against real content, not a summary.

# Step 3 — Write the reconstructed artifacts (each schema-conformant, each `provenance: adopted`)

Write the five reconstructed artifacts per [intake/adopt/_artifacts.md](adopt/_artifacts.md): `01-adopt.md` (`type: intake`, the adoption record with the Step A0 surface evidence), `02-shape.md`, `03-slice.md` (`type: slice-index`, one slice unless separable concerns were confirmed), `04-plan.md` (retrospective observation plus the forward `## Verification Strategy`, whose `proxy+deferral` resolutions also land in the index's `runtime-evidence-deferrals`), and `05-implement.md` (synthesized from the diff; `next: 06-verify.md`). Every frontmatter block carries `provenance: adopted`. Use real timestamps per [_timestamp.md](../_timestamp.md). Write each artifact as a draft `.ai/workflows/<slug>/.draft/<name>`, then run `node "<skill-dir>/scripts/wf.mjs" record put "<root>" <slug>` per [_records.md](../_records.md).

# Step 4 — Write `00-index.md` (conformant `type: index`)

Write the full `type: index`, the same index as a standard feature workflow.

1. Run `node "<skill-dir>/scripts/wf.mjs" stamp index --slug <slug>`. It prints every field that the schema requires.
2. Write the output to the draft `.ai/workflows/<slug>/.draft/00-index.md`. Remove the `# one of:` comments.
3. Fill `title`, `branch` (the current branch name) and `base-branch`. Then set or add these adoption values:

```yaml
provenance: adopted
workflow-type: adopt
current-stage: implement
stage-number: 5
selected-slice: <slug>
branch-strategy: none
review-scope: slug-wide
review-scope-confirmed: true
appetite: small
stack: <the stack block, per intake/default/_artifact.md; user-confirmed: false>
runtime-evidence-deferrals: []
next-command: wf-verify
next-invocation: "/wf verify <slug>"
workflow-files: [00-index.md, 01-adopt.md, 02-shape.md, 03-slice.md, 04-plan.md, 05-implement.md]
slices:
  - slug: <slug>
    status: complete
    complexity: <xs|s|m>
progress: {intake: complete, slice: complete, plan: complete, implement: complete, verify: not-started, review: not-started, ship: not-started, retro: not-started}
```

4. Run `node "<skill-dir>/scripts/wf.mjs" record put "<root>" <slug>`.

Notes:
- Write no YAML comments in the index. `review-scope: slug-wide` gives one `07-review.md` for the single slice. `runtime-evidence-deferrals` receives the proxy and deferral resolutions from `04-plan`.
- `current-stage: implement` with `implement: complete` in `progress` — the reconstructed execution is done; `verify` is the first *not-started* stage, and `next-invocation` points there. (Use the standard `current-stage` enum — `implement` — never a bespoke `adopted` value; the adoption fact lives in `provenance` and `workflow-type`, not in `current-stage`.)
- `branch-strategy: none` is deliberate — adoption inherits whatever branch the work was done on.

# Step 5 — Hand off

Lead with a short **narrative** paragraph (prose, no bullets) — what change was adopted, from how many files on which branch, the inferred goal, the slice split, and the single most important thing verify should scrutinize (e.g. an AC whose evidence is deferred, or an `implied_gap` the diff left open) — then the anchors:

```
wf intake adopt complete: <slug>
Branch: <branch> (recorded, not created)
Adopted: <N> files (+<adds>/-<dels>) · <C> commits ahead of <base> · <U> uncommitted
Slices: <M> (status: implemented) · ACs: <K> (<D> with deferred/constraint-resolved evidence)
Provenance: adopted — every artifact stamped
Next: /wf verify <slug>
```

# Resume & crash-safety
- Adopt is resumable: if interrupted after some artifacts are written, re-running adopt on the same tree detects the partially-written `.ai/workflows/<slug>/` (by the recorded branch + adopted-surface match in `01-adopt.md`) and continues from the first unwritten artifact rather than re-confirming. If the surface has changed since (the diff moved), warn and re-run the gate.
- Write each artifact as a draft and put it; the put writes the record in one step, so a crash mid-write never leaves a half-written workflow.

# What this command is NOT

- **Not a way to skip verification.** Adopt rebuilds the record; it does not say that the code is correct. `/wf verify` still runs its full checks and the AC gate on the adopted change.
