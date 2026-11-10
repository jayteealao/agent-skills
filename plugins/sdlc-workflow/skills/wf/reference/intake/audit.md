# Output boundary & shared context
Apply `intake/_intake-context.md` — the External Output Boundary, and the workflow-registry / slug rules. Do not restate them here.

You are running `/wf intake audit`, a **subsystem defect hunt**. It serves the request that every nearby surface refuses: review existing code for bugs, wrong assumptions and mistakes when there is no symptom (`rca` needs one), no stated hypothesis (`discover` needs one), no decided problem (`investigate` needs one), and no diff (the review stage needs one). The output is the **findings ledger** `findings.yaml` with source `audit` (the same ledger that the review stage writes, under the same merge law) and one review file, `07-review.md`.

# Slug-mode

When the dispatcher selected slug-mode, follow [_compressed-slice.md](../_compressed-slice.md) with `<op>` = `audit`: it overrides the standalone steps below.

In slug-mode, write no entry of `findings.yaml` and no `07-review.md`.

# Pipeline
`0·orient` → `1·resolve-surface` → `[scope gate]` → `2·select-lenses` → `3·hunt` → `4·refute` → `5·merge` → `6·route`

| | Detail |
|---|---|
| Requires | See [## Requires](#requires). Pass a concern (plus optional paths), or an existing audit slug to re-run. |
| Produces | `00-index.md` (`type: workflow-index`), `01-audit.md` (`type: intake`, the brief), `findings.yaml` (the ledger, source `audit`), `07-review.md` (`type: review`, written whole from the ledger) |
| Skips | No `02-shape.md`, no `04-plan.md`: for an audit, the scope and the brief are one motion. No branch. |
| Next | Terminal: each accepted finding routes to its own command (the table of Step 6). The workflow **stays open** for re-runs that add to it. Close it with `/wf intake <slug> close` when the concern is retired. |
| Escalate | A finding that static reading cannot settle is recorded at `confidence: low` with `needs-runtime-evidence` and the exact experiment named → `/wf probe` (see Step 4). |

## Requires

Read every row before you write the stage artifact. [_requires.md](../_requires.md) defines the check.

| Input | Kind | When | Sections |
|---|---|---|---|
| `00-index.md` | artifact | on-resume | |
| `01-audit.md` | artifact | on-resume | |
| `07-review.md` | artifact | on-resume | |
| `findings.yaml` | artifact | on-resume | |
| `decisions.yaml` | artifact | if-present | |
| `intake/_intake-context.md` | procedure | always | |
| `_findings-ledger.md` | procedure | always | |
| `_subagents.md` | procedure | always | |
| `_compressed-slice.md` | procedure | mode:slug | |
| `01-audit.md` | writes | | |
| `07-review.md` | writes | | |

# Audit discipline
You hunt defects, read-only, and you own a findings ledger that grows across runs.
- Do not edit application code. Do not run a fix loop: this mode has none. Every finding routes; none is fixed here.
- Do not run the lenses yourself. Dispatch the sub-agents (Step 3) and the refuters (Step 4) per [_subagents.md](../_subagents.md).
- The ledger grows across runs: `wf.mjs findings add --source audit` applies the merge law of [_findings-ledger.md](../_findings-ledger.md) (stable IDs, `surfaced-at` kept, the resolve sweep, the `runs` append). Never edit `findings.yaml` by hand, and never restate the law.
- The scope and the lens selection are legible and correctable. State the resolved surface, the exclusions, and every selected lens with its reason, in the artifact and in chat, before the hunt runs. When an audit guessed its scope silently, its "no findings" cannot be trusted: the reader cannot tell clean from unread.
- **Zero findings is a valid, useful result.** Write the artifact with the resolved surface, the lenses run, and the set that could not be observed. Never pad a clean result with nits.
- Keep the stated order only where a step uses the output of an earlier step or crosses a gate. Reading and research may interleave freely.

# Step 0 — Orient
1. **Resolve the slug and the mode** from the instructions:
   - When the argument names an existing workflow whose index (`node "<skill-dir>/scripts/wf.mjs" record get "<root>" <slug> index`) has `workflow-type: audit`, this is **re-run mode**. This run merges into the existing ledger `findings.yaml`. The concern and the surface come from `01-audit.md`. New paths in the arguments extend the surface, recorded as a surface revision in `01-audit.md`.
   - Otherwise this is a **new audit**.
2. **New slug.** Name it per "New slug" of [_intake-context.md](_intake-context.md), with the form `audit-<short-concern>`.
3. **Branch posture.** This mode is read-only: do not create or switch branches. Record the current branch in the index.
4. **Lens override.** A `lenses=<a>,<b>` token replaces the inference of Step 2 entirely. Record that the person forced the selection.
5. **Project context, lightly:** read the top 100 lines of `README.md`, so that the concern uses the words of the codebase.

# Step 1 — Resolve the surface (two waves, because a subsystem is not a path)

A concern names a subsystem; a lens needs files. Do not guess the mapping: enumerate it.

1. **Wave 1 — enumerate.** Dispatch read-only sub-agents in parallel at **low** effort (bounded extraction; state the tier on every dispatch, per [_subagents.md](../_subagents.md)). Each maps the concern to concrete files by a **different search modality**, blind to the others:
   - **By entry point:** where does this subsystem start (routes, exported APIs, main loops)?
   - **By call graph:** what does the entry set call into, and what calls into it?
   - **By naming convention:** the files, directories and symbols whose names match the words of the concern.
   - **By test coverage:** which tests exercise this behavior, and which source files do they import?

   Each returns a file list with a one-line reason per file. Take the **union** of the results.
2. **Resolve the exclusions.** Drop vendored code, generated files, and anything that the person removed. Record each exclusion **with its reason**.
3. **A file that the person named is always in scope.** Inference adds files; it never removes one.
4. **A concern that names no surface at all** ("audit the codebase"): wave 1 cannot converge. `audit` is **not a whole-repo sweep**. List 3 to 6 candidate subsystems, and have the person pick one (tripwire, below).

**[Scope gate].** Present the resolved surface for confirmation before any lens runs: the file list (grouped, with counts), the exclusions with their reasons, and what will not be looked at. Ask through the gate-question ladder ([_gate-question.md](../_gate-question.md)) with the options Confirm / Adjust / Cancel. Without a person, the default is Confirm, with the assumption recorded. The question craft follows [_question-craft.md](../_question-craft.md). On a re-run with an unchanged surface, the earlier confirmation satisfies the gate: say so, and go on.

# Step 2 — Select lenses, and say why

The lenses are the existing review rubrics at `../review/<lens>.md`, or one alias section inside a rubric (the alias table in [review.md](../review.md); dispatch with `focus: <alias>`), and `design/audit.md` / `design/critique.md` for design surfaces. `audit` **owns no rubrics and adds no dimension**: it only uses them.

1. **Infer the lens set from the concern and the surface.** "Wrong assumptions between two paths" → `correctness` (focus testing), `architecture`. "Is this leaking memory" → `performance`, `correctness` (focus reliability). Concurrency words in the surface → `correctness` (focus backend-concurrency). Auth or credentials in the surface → `security` (focus privacy). Select 2 to 6 lenses, more only when the surface really spans domains.
2. **State the selection,** each lens with a one-line reason, in `01-audit.md` and in chat, before the dispatch. An inference that nobody can inspect is an opaque router.
3. **The `lenses=` override** (Step 0, item 4) replaces the inference. Still record one line per lens: "user-forced".
4. **When no rubric fits,** say so honestly. Write the draft of `01-audit.md` with the resolved surface and "no lens applies — <why>", put it, and ask the person to force a set or to accept the null result. Do not run a token lens to look busy.

# Step 3 — Hunt (parallel lens sub-agents)

For each selected lens, dispatch a sub-agent per [_subagents.md](../_subagents.md), in waves of at most 6 when the lens set is large. The effort tier per lens follows the rule of the ad-hoc review sweep ([review.md](../review.md)): **medium** for `architecture` and `security`, **low** otherwise. State it on every dispatch; never let it be inherited. Give each sub-agent:

- The path of the lens reference: `<skill-dir>/reference/review/<lens>.md`, resolved to an absolute path per [_host-invocation.md](../_host-invocation.md) before the dispatch. It reads the file and applies its rubric.
- **The scope: the confirmed file surface of Step 1.** It reads these files; there is no diff. Every finding is about existing code by construction, so there is no `pre-existing` split: set `preExisting: true` on every finding.
- The exact concern, so that the lens reads with intent.
- **Candidate findings only.** A finding enters the ledger only after Step 4 tries to refute it. Return each one with a severity (BLOCKER/HIGH/MED/LOW/NIT), a confidence (High/Med/Low), `file:line`, an evidence snippet, and the invariant it claims is violated.
- **The decidability boundary.** A candidate that static reading cannot settle (most sharply: "these two paths disagree at runtime") comes back with `needs-runtime-evidence: true` and **the exact experiment that would settle it** (a test run, a profile, a log line, a parity harness): named, never guessed. Do not under-report, and do not invent runtime facts.

# Step 4 — Adversarial refutation (before anything lands)

A plausible but wrong finding costs more here than in the review stage: no diff context catches it. Try to refute each candidate before it lands (the posture of `ship-plan audit`).

1. The number of refuters grows with the severity.
   - **BLOCKER/HIGH: three refuters with distinct lenses:** does it reproduce from the code as written; is the claimed invariant real; does a caller or a guard upstream prevent it. Their effort is **high** (causal reasoning).
   - **MED and below: one refuter,** at effort **low**.

   State the effort on each dispatch, per [_subagents.md](../_subagents.md).
2. Prompt each refuter to kill the finding: "prove this claim wrong; default to refuted when uncertain". It returns `refuted: true|false` with its reasoning.
3. A BLOCKER/HIGH candidate survives when at least two of its three refuters fail to kill it. A candidate at MED or below survives when its one refuter fails.
4. **The survivors and the refuted candidates both** enter the merge (Step 5). A refuted candidate carries the refutation that killed it as `refuted`, and the ledger keeps it with status `refuted`. It is never dropped silently: a refuted candidate is evidence that the lens looked.
5. A candidate with `needs-runtime-evidence` skips the refutation, because there is nothing static to refute. It enters the ledger at `confidence: low`, `status: open`, with the named experiment as `needsRuntimeEvidence`, and Step 6 routes it to `/wf probe`.

# Step 5 — Merge into the ledger

Timestamps per [_timestamp.md](../_timestamp.md). Write each record of this step (`07-review.md`, `01-audit.md`, `00-index.md`) as a draft `<wf-dir>/.draft/<name>`, then run `node "<skill-dir>/scripts/wf.mjs" record put "<root>" <slug>`.

1. **Merge.** Write every candidate (survivors and refuted) to `<wf-dir>/.draft/found.json` per [_findings-ledger.md](../_findings-ledger.md), with `dimensions` = every lens of this run. Run `node "<skill-dir>/scripts/wf.mjs" findings add "<root>" <slug> <wf-dir>/.draft/found.json --source audit --run <now>`.
2. **The review file.** Write `07-review.md` (`type: review`, `review-scope: slug-wide`) whole, from the ledger:
   - the frontmatter metrics from `wf.mjs findings metrics --source audit`;
   - `## Findings` from `wf.mjs findings table --source audit`, refuted rows included, with the refutation that killed them;
   - `## Triage Decisions`: the routes of Step 6;
   - a verdict line that states the ledger state, not shippability: `N open / N resolved / N refuted across <lenses>`.
3. **Edits of `01-audit.md` are additive,** per [_additive-write.md](../_additive-write.md). A re-run gets the record, appends to it, writes the draft and puts it. It never rewrites history.
4. **The content of `01-audit.md`** (`type: intake`). It satisfies the required set of intake: `status: complete`, `stage-number: 1`, `created-at`/`updated-at`, `tags`, `refs`, `next-command`, `next-invocation`, and `recommended-routes` from Step 6. It carries the brief under fixed headings: `## Concern` (exact), `## Surface` (with counts), `## Exclusions` (with reasons), `## Lenses` (with reasons), `## Not observable` (what static reading could not decide), and `## Surface revisions` (the log of re-runs).
5. **`00-index.md`** (`type: workflow-index`): `workflow-type: audit`, `status: active` (an audit stays open for re-runs that add to it), `current-stage: audit`, `review-scope: slug-wide`, `branch-strategy: none`, the progress map `{audit: complete}`, and `recommended-routes` from Step 6. The put registers the row ([_intake-context.md](_intake-context.md)).

# Step 6 — Route (terminal; route-don't-fix)

For each open finding, record its route with `wf.mjs findings set "<root>" <slug> <id> deferred --reason "route: <command>"`, so that the route survives the next run. `## Triage Decisions` of `07-review.md` lists the routes from the ledger:

| Finding shape | Route |
|---|---|
| Small, mechanical, root cause clear | `/wf intake fix <finding> from <slug>` |
| Cause unclear, symptom now known | `/wf intake rca <finding> from <slug>` |
| Needs restructuring; several viable approaches | `/wf intake investigate <problem> from <slug>` |
| Genuine feature-sized work | `/wf intake <scope> from <slug>` |
| Needs runtime proof to confirm at all (`needs-runtime-evidence`) | `/wf probe <slug> "<the named experiment>"` |
| Not a code change at all (rotate the leaked key, file the upstream issue) | `/wf intake task <outcome>` |

Do not fix anything. Do not open a fix loop. Each accepted finding seeds its own follow-up workflow through the `from <slug>` provenance token (`_intake-provenance.md`). The audit workflow itself stays open as the ledger of record until `/wf intake <slug> close`.

# Chat return

Return per [_chat-return.md](../_chat-return.md). Lead with the narrative per *The narrative* in that file, then:

```
wf intake audit complete: <slug>
Concern: <one line>
Surface: <N files confirmed, M excluded>
Lenses: <lens (reason) · lens (reason) …>
Findings: <O open / R resolved / X refuted>   (this run: A net-new, B re-confirmed, C cleared)
Not observable statically: <N — see 01-audit.md ## Not observable>
Routes: <top routes, one per open BLOCKER/HIGH>
Artifacts: <wf-dir>/01-audit.md, findings.yaml, 07-review.md
Next: <top route> | /wf intake audit <slug> (re-run) | /wf intake <slug> close (retire the concern)
```

# Crash-safe / resume

The ledger on disk is the state. A killed run resumes when you run `/wf intake audit <slug>` again. The orientation reads `01-audit.md` (the surface and the lenses) and the ledger `findings.yaml` again, and the merge law makes the re-run idempotent: nothing is lost, and nothing is duplicated.

# Boundary tripwires (warn-and-continue, never refuse)

- **The concern names a specific symptom** ("X is broken after Y"): this is `rca`. Offer to reroute before Step 1.
- **The concern is a yes/no question** about the system: `discover`. Offer to reroute.
- **The concern presumes the problem and wants approaches:** `investigate`. Offer to reroute.
- **The concern names no surface at all:** list candidate subsystems, and have the person pick (Step 1, item 4). `audit` is not a whole-repo sweep.
- **Zero findings:** a valid result. Write the artifact, so that the next audit knows what was covered.

# What this command is NOT

- **Not a fixer.** No fix loop exists here. A citation of `_fix-loop.md` in this file is the sign that the mode drifted into a second review stage.
- **Not a runner.** Audit reads source. Where reading reaches its limit, audit names the experiment and hands it to `probe`.
