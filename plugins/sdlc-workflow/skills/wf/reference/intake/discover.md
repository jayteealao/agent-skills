# Output boundary & shared context
Apply `intake/_intake-context.md` — the External Output Boundary, and the workflow-registry / slug rules. Do not restate them here.

You are running `/wf intake discover`, a **hypothesis-test workflow**. It judges a code-level claim against the codebase, and returns a verdict with cited evidence.

# Slug-mode

When the dispatcher selected slug-mode, follow [_compressed-slice.md](../_compressed-slice.md) with `<op>` = `discover`: it overrides the standalone steps below.

# Pipeline
`1·hypothesis-intake` → `2·triangulate` → `3·adjudicate` → verdict (no required next command)

| | Detail |
|---|---|
| Requires | See [## Requires](#requires). Pass a hypothesis string, or an existing slug to resume. |
| Produces | `01-discover.md` (verdict + evidence + counter-hypotheses), `00-index.md` |
| Skips | No fix, no plan, no implementation, no explanation of how code works (that is a plain research conversation outside `/wf`). |
| Next | On `holds`, no follow-up is required: act on the confirmed understanding as you intended. On `fails` or `inconclusive`, run `/wf intake rca "<symptom>" from <slug>` when the falsified hypothesis was about why something behaves badly (the counter-hypotheses travel with it), or have a plain research conversation outside `/wf` when you need to learn how the code works rather than test a theory. The workflow **closes at write time**: a verdict is terminal, and there is nothing left to pick. |
| Escalate | When the FOR and AGAINST evidence are about equal, and a definitive answer needs runtime data (not static code reading), raise `needs-runtime-evidence` with the rungs that can run: `/wf probe <slug> "<the runtime question>"` for a runtime observation, the `study-sources` skill for a fact of a dependency or framework. List exactly what would resolve it (a test run, a profile, a log line). |

## Requires

Read every row before you write the stage artifact. [_requires.md](../_requires.md) defines the check.

| Input | Kind | When | Sections |
|---|---|---|---|
| `00-index.md` | artifact | on-resume | |
| `01-discover.md` | artifact | on-resume | |
| `decisions.yaml` | artifact | if-present | |
| `intake/_intake-context.md` | procedure | always | |
| `intake/_intake-provenance.md` | procedure | always | |
| `intake/_intake-provenance-consume.md` | procedure | mode:from | |
| `intake/_light-index.md` | procedure | always | |
| `intake/discover/_research.md` | procedure | always | |
| `_compressed-slice.md` | procedure | mode:slug | |
| `01-discover.md` | writes | | |

# Adjudication discipline
You judge a hypothesis. You do not fix, explain or plan.
- The only acceptable output is the discover artifact and the index. Do not edit application code. Do not write a plan. Do not propose a fix. Do not write a tutorial on how the area works: that is a plain research conversation outside `/wf`.
- Investigate read-only: `git log`, `git blame`, your native file-reading and search tools, static code inspection.
- The verdict is **convergent**: exactly one of `holds`, `partial`, `fails` or `inconclusive`. Do not hedge across all four: pick one, and justify it with cited evidence.
- The artifact includes both the supporting and the contradicting evidence. A "holds" verdict with no AGAINST section is suspect: search until you find counter-evidence, or record that none exists.
- Ask at most 3 questions in chat, and no structured gate question. Record each answer with `decide add` per [_decisions.md](../_decisions.md), and also write it inline into the artifact.
- Keep the stated order only where a step uses the output of an earlier step or crosses a gate. Reading and research may interleave freely.

# Step 0 — Orient
1. **Resolve the slug and the mode** from `$ARGUMENTS`:
   - When the argument names an existing workflow whose index (`node "<skill-dir>/scripts/wf.mjs" record get "<root>" <slug> index`) has `workflow-type: discover`, this is **resume mode**. Read that index. When `01-discover.md` is complete, tell the person, and stop. When it is incomplete, continue from the missing section.
   - Otherwise this is a **new discover**.
2. **New slug.** Name it per "New slug" of [_intake-context.md](_intake-context.md), with the form `discover-<short-hypothesis>`.

2b. **Provenance check.** Apply `intake/_intake-provenance.md`:
   - Detect an inherited analysis decision: a trailing `from <source-slug>` token. It is implied when this discovery runs from a work packet ([../intake.md](../intake.md), "List work packet").
   - Use the matching row of the Consume table.
   - Link back: record `origin-<type>` here, and `origin-packet` when the source is a work packet.

   With no match, go on. That is the common case.
3. **Branch posture.** This mode is read-only: do not create or switch branches. Record the current branch in the index.
4. **Read the project context, lightly:**
   - Read the top 100 lines of `README.md` for the shape and the words of the project, so that the hypothesis uses the same terms as the codebase.
   - Read `AGENTS.md`, when present, for the conventions of the project.

# Step 1 — Hypothesis clarification
Ask at most 3 questions, and stop as soon as the hypothesis can be tested:

1. **What is the hypothesis?** State it as a falsifiable claim, not a question. Good: "the rate-limiter is implemented as a token bucket in `middleware/`". Bad: "how is the rate-limiter implemented?" (that is a plain research conversation outside `/wf`). Ask it when `$ARGUMENTS` does not make it clear.
2. **Where to look?** A starting file, directory, function or area. Even "I'm not sure, somewhere in `src/auth`" helps. When the person has no idea, the search is wider and the confidence is likely lower: note this.
3. **What would change if it holds vs. fails?** The decision that rides on this verdict. It sizes the effort, and the artifact records it (`## What this decides`).
   - A sanity check before a one-line edit needs a quick pass.
   - When a major refactor or a plan depends on the answer, dig harder.
   - On `fails`, the record of *which plan lost its premise* is the most valuable line of the artifact.

When `$ARGUMENTS` answers all three, go to Step 2.

Do not write the artifact yet. Hold the answers in working memory, and go on.

# Step 2 — Parallel adjudication
Launch all three sub-agents at once. Each is a separate read-only sub-agent dispatch ([_subagents.md](../_subagents.md)). Do not start the synthesis until all three are done.

[intake/discover/_research.md](discover/_research.md) holds the effort tier (low, raised to medium when a large decision rides on the verdict), the shared inputs, and the three charters (Evidence FOR, Evidence AGAINST, Counter-hypotheses).

# Step 3 — Synthesize and write `01-discover.md`

Merge the findings of the three sub-agents. Do not invent evidence that the agents did not surface. When the FOR and AGAINST agents cite the same file:line with opposite readings, read it yourself, and decide.

Pick exactly one verdict:

| Verdict | When to pick |
|---|---|
| `holds` | Direct supporting evidence exists; contradicting evidence is weak or absent; no alternative hypothesis is more plausible. |
| `partial` | Hypothesis is correct for some paths/configurations but not others. Be specific about *which* part holds and which doesn't. |
| `fails` | Direct contradicting evidence exists, or an alternative hypothesis is clearly more plausible than the original. |
| `inconclusive` | Static code reading cannot adjudicate — the answer depends on runtime behavior, configuration, or data not visible in the repo. |

Write the record to the draft `<wf-dir>/.draft/01-discover.md`, then run `node "<skill-dir>/scripts/wf.mjs" record put "<root>" <slug>`.

**`01-discover.md` frontmatter:**
```yaml
---
schema: sdlc/v1
type: discover
slug: <slug>
workflow-type: discover
hypothesis: <one-line hypothesis, exact>
verdict: holds | partial | fails | inconclusive
confidence: high | medium | low
recommended-next: <command-if-any or "none">
status: ready-for-routing
created-at: <real UTC timestamp per _timestamp.md>
next-command: none
next-invocation: "none — verdict recorded"
recommended-routes: [{invocation: "<the ## Routing route, with its from <slug> form>", reason: "<one phrase>", default: true}]
---
```

**Body sections (in order):**

The section headings below are fixed anchors: do not number them.

## What this decides

The answer to question 3 of Step 1, exact: the decision that rides on this verdict. On `fails`, name the plan, the assumption or the work in flight that lost its premise: a falsified hypothesis with no record of what it falsified helps nobody. On `holds`, one line: what now goes on, on confirmed ground.

## Hypothesis

The exact hypothesis, as a falsifiable claim. Add 1 or 2 sentences of restatement: what would have to be true for it to hold, and what would have to be true for it to fail.

## Evidence FOR

List every piece of direct and indirect supporting evidence of sub-agent 1. Each item: `file:line` — one-line description — relevance (direct | indirect). Put the direct evidence first.

## Evidence AGAINST

List every piece of contradicting evidence of sub-agent 2. Each item: `file:line` — one-line description — severity (direct contradiction | partial contradiction | drift signal). When sub-agent 2 found nothing, say so: "No contradicting evidence found. Note: this is a meaningful signal only if sub-agent 2 actually searched — confirm it did before treating absence as confirmation."

## Counter-hypotheses

List the alternatives of sub-agent 3, ranked by plausibility. For each: the alternative statement, its key supporting `file:line` references, and how its observable behavior differs from the original. When `no_alternatives_found` was true, record that.

## Verdict

State the verdict plainly: **holds**, **partial**, **fails**, or **inconclusive**.

Then one paragraph of rationale: justify the choice from the sections above. Name the evidence that decided it.

For a `partial` verdict, also state precisely *which* part of the hypothesis holds, and *which* part fails. Treat it as a refined hypothesis that the person can take forward.

For a `fails` verdict, name the counter-hypothesis that is more plausible, when there is one. For an `inconclusive` verdict, list exactly what runtime data or outside information would resolve it.

## Routing

| Verdict | Suggested next step |
|---|---|
| `holds` (any confidence) | None required. Your understanding is confirmed; proceed with whatever you intended to do. When acting on it needs code changes, the next command depends on the size of the work: `/wf intake fix "<change>" from <slug>` for small, `/wf intake "<change>" from <slug>` for medium+. The `from <slug>` token carries the verdict and the evidence per `_intake-provenance.md`. |
| `partial` | Refine the hypothesis using the "which part holds / which part fails" finding, then re-run `/wf intake discover <refined-hypothesis>` if precision matters. Otherwise, treat the partial verdict as the answer and proceed. |
| `fails` | When the original hypothesis explained an observed bad behavior: `/wf intake rca "<symptom>" from <slug>` to find the actual cause. The ranked counter-hypotheses in `## Counter-hypotheses` are candidate root causes, and the `from <slug>` token hands them to the sub-agents of the rca instead of discarding them. When it was a guess about how a feature works: a plain research conversation outside `/wf`, to learn the code rather than guess again. |
| `inconclusive` | List the runtime signal needed. For a runtime observation, profiling or a perf measurement: `/wf probe <slug> "<the runtime question that ## Verdict named>"` (the finding lands as a compressed slice on this slug). For a behavior of a dependency or framework: the `study-sources` skill against the installed source. When a repeatable perf baseline is warranted, flag it, so that `shape` records a benchmark augmentation. For more code reading at a wider scope: run `/wf intake discover` again with a broader starting area. |

## Confidence & limits

- **Confidence:** high | medium | low, with one sentence of justification. High confidence needs direct evidence for the chosen verdict, and weak counter-evidence.
- **What this verdict assumes:** each unstated assumption of the hypothesis (for example "assuming the default config", "assuming current main branch"). List them, so that a later reader knows what would invalidate the verdict.
- **What was out of scope:** the areas that the sub-agents did not look at, and why, so that the person can ask for a follow-up when the scope was too narrow.

## Tripwire warnings

Write this section only when a tripwire fired. A tripwire warns and continues: record it, and still write the verdict.

- **evidence-thin:** The sub-agents together cited fewer than 3 file:line references. The verdict is likely undersupported, whichever way it leans.
- **counter-evidence-stronger-than-verdict:** The AGAINST agent found stronger evidence than the FOR agent, but the verdict is still `holds`. Read the findings of sub-agent 2 again: a `fails` or `partial` verdict may be more honest.
- **multiple-equal-hypotheses:** Two or more alternatives of sub-agent 3 are about as plausible as the original. The verdict should probably be `inconclusive` or `partial`, not `holds`.
- **out-of-scope-claim:** The hypothesis is about outside systems (third-party APIs, infrastructure, the runtime environment), not code in this repo. Static reading is the wrong tool: note this, and recommend a runtime check instead.
- **needs-runtime-evidence:** A definitive answer needs running code, reading logs or measuring behavior, not reading files. The verdict was forced to `inconclusive`.

For each fired tripwire: `[tripwire-name]: <what specifically tripped it>`. Closing line:

> One or more discover tripwires fired. The verdict is still recorded, but review the warnings before acting on it.

# Step 4 — Write `00-index.md` (closed at write time)

A verdict is terminal: nothing is left to choose, so the workflow closes as soon as its index is written. There is no second run, and no row parks in the Active list.

Write the draft of `00-index.md` from [_light-index.md](_light-index.md), the `discover` row, and put it. Add these keys:

```yaml
close-reason: verdict-recorded
closed-at: "<ISO 8601>"
branch: <current-branch>
base-branch: <current-branch>
recommended-routes:
  - {invocation: "<the ## Routing route for this verdict, with its from <slug> form>", reason: "<one phrase>", default: true}
  - {invocation: "<another viable route>", reason: "<one phrase>"}
verdict: <holds|partial|fails|inconclusive>
confidence: <high|medium|low>
augmentations: []
```

Body: a one-line description of the hypothesis, and a pointer to `01-discover.md` and the verdict. A successor started with `from <slug>` reads the closed artifact through `_intake-provenance-consume.md`: the close hides nothing.

# Step 5 — Hand off to user

Return per [_chat-return.md](../_chat-return.md): lead with the narrative (section *The narrative*), then the structured anchors below.

Write a compact chat summary:

```
wf intake discover complete: <slug>
Hypothesis: <one-line hypothesis>
Verdict: holds | partial | fails | inconclusive
Confidence: <level>
Direct supporting evidence: <N file:line refs>
Direct contradicting evidence: <N file:line refs>
Counter-hypotheses considered: <N>
Tripwires: <none | comma-separated list>
Workflow: closed (verdict-recorded)
Next: <the ## Routing route with its from <slug> form> | <"none — confirmed, proceed as you intended">
Artifact: <wf-dir>/01-discover.md
```

On `fails`, put this first:

> ✗ Hypothesis fails. The code does not work the way the claim asserts. See artifact for what is actually happening (or the most plausible alternative).

On `inconclusive`, put this first:

> ⚠ Inconclusive — static code reading cannot adjudicate. See artifact for what runtime signal would resolve it.

# What this command is NOT

- **Not a planner.** Also when the verdict is `holds`, discover writes no plan and proposes no change.
- **Not a substitute for running the code.** `inconclusive` is a valid verdict. When static reading cannot tell, say so.
