---
description: Hypothesis-test workflow. Takes a code-level hypothesis ("X is the case", "feature A is implemented via Y", "module M handles concurrency by Z") and adjudicates it against the codebase using parallel sub-agents that argue FOR, AGAINST, and propose counter-hypotheses. Produces a verdict (`holds` / `partial` / `fails` / `inconclusive`) with confidence and cited evidence. Does NOT write application code, does NOT diagnose bugs, does NOT explain code (the `deep-research` skill owns that). Closes at write time — the verdict is the terminus. Read-only.
argument-hint: <hypothesis-or-slug>
---

# Output boundary & shared context
Load `${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/intake/_intake-context.md` in full and apply it — the External Output Boundary, the narrative-fragment tier, and the workflow-registry / slug rules. Do not restate them here.

You are running `/wf intake discover`, a **hypothesis-test workflow** that adjudicates a code-level claim against the codebase and returns a verdict with cited evidence.

# Slug-mode (read before proceeding)

If the dispatcher selected **slug-mode** (the first token after `intake` matched a non-closed slug in `.ai/workflows/INDEX.md`), follow `${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/_compressed-slice.md` — it OVERRIDES the standalone instructions below. In short: write one `.ai/workflows/<slug>/03-slice-discover-<descriptor>.md` (`type: slice`, `slice-type: discover`, `compressed: true`, `origin: intake/discover`); no new workflow, no new branch, no standalone artifact, no new top-level `00-index.md`; additive index updates only; chat return `discover → compressed slice <slice-slug> on <slug>`.

If slug-mode was not selected, ignore this section and proceed standalone below.

# Pipeline
`1·hypothesis-intake` → `2·triangulate` → `3·adjudicate` → verdict (no required next command)

| | Detail |
|---|---|
| Requires | Nothing — starts fresh. Pass a hypothesis string or an existing slug to resume. |
| Produces | `01-discover.md` (verdict + evidence + counter-hypotheses), `00-index.md` |
| Skips | No fix, no plan, no implementation, no explanation of how code works (that is the `deep-research` skill). |
| Next | If `holds` → no required follow-up; act on the confirmed understanding however you originally intended. If `fails` or `inconclusive` → `/wf intake rca "<symptom>" from <slug>` (if the falsified hypothesis was about why something behaves badly — the counter-hypotheses travel with it) or the `deep-research` skill (if you need to actually learn how the code works rather than test a theory). The workflow **closes at write time** — a verdict is terminal by construction; there is nothing left to pick. |
| Escalate | If FOR and AGAINST evidence are roughly equal AND a definitive answer requires runtime data (not static code reading) → surface `needs-runtime-evidence` with the executable rungs: `/wf probe <slug> "<the runtime question>"` for a runtime observation, the `study-sources` skill for a dependency/framework fact. List exactly what would resolve it (a test run, a profile, a log line). |

# CRITICAL — adjudication discipline
You are a **hypothesis adjudicator**, not a fixer, explainer, or planner.
- The **only** acceptable output is the discover artifact and index. Do NOT edit application code. Do NOT write a plan. Do NOT propose a fix. Do NOT produce a tutorial-style explanation of how the area works (that is the `deep-research` skill).
- Read-only investigation only: `git log`, `git blame`, `Read`, `Grep`, static code inspection.
- The verdict must be **convergent**: exactly one of `holds`, `partial`, `fails`, or `inconclusive`. Do not hedge across all four; pick one and justify it with cited evidence.
- The artifact must include both supporting AND contradicting evidence. A "holds" verdict with no AGAINST section is suspect — search until you find counter-evidence or explicitly record that none exists.
- Ask at most **3 questions** in chat. No `AskUserQuestion`, no separate `po-answers.md` — answers go inline into the artifact.
- Respect the stated order only where a step consumes an earlier step's output or crosses a gate; reading and research may interleave freely.

# Step 0 — Orient (MANDATORY)
1. **Resolve slug and mode** from `$ARGUMENTS`:
   - If the argument matches an existing `.ai/workflows/*/00-index.md` with `workflow-type: discover` → **resume mode**. Read that index. If `01-discover.md` is complete, tell the user and stop. If incomplete, pick up from the missing section.
   - Otherwise → **new discover**. Derive a slug: `discover-<short-hypothesis>` (kebab-case, max 5 words, e.g., `discover-auth-uses-jwt`).
2. **Collision check:** If `.ai/workflows/<slug>/00-index.md` exists and `workflow-type` is NOT `discover` → WARN: "Workflow `<slug>` already exists with type `<existing-type>`. Choose a different description, or run `/wf recap <slug>` to continue it." Stop.
3. **Branch posture (do NOT switch branches):**
   - This is read-only — do not create or switch branches.
   - Record the current branch in the index.
4. **Read project context (lightweight):**
   - Read `README.md` (top 100 lines) for project shape and vocabulary, so the hypothesis can be grounded in the same terms the codebase uses.

# Step 1 — Hypothesis clarification
Ask at most **3 questions** — stop as soon as the hypothesis is testable:

1. **What is the hypothesis?** — State as a falsifiable claim, not a question. Good: "the rate-limiter is implemented as a token bucket in `middleware/`". Bad: "how is the rate-limiter implemented?" (that is the `deep-research` skill). Required if not clear from `$ARGUMENTS`.
2. **Where to look?** — A starting file, directory, function, or area. Even "I'm not sure, somewhere in `src/auth`" is useful. If the user has no idea, the adjudication will be wider and confidence will likely be lower — note this.
3. **What would change if it holds vs. fails?** — The decision riding on this verdict. It sizes the adjudication effort AND is recorded in the artifact (`## 0. What this decides`): if the user is sanity-checking before a 1-line edit, a quick pass is enough; if a major refactor or a plan depends on the answer, dig harder — and on `fails`, the record of *which plan lost its premise* is the most valuable line in the artifact.

If `$ARGUMENTS` contains enough to answer all three, skip to Step 2.

Do NOT write the artifact yet. Hold answers in working memory and proceed.

# Step 2 — Parallel adjudication
Launch all three sub-agents simultaneously. Each is a separate `Explore` sub-agent dispatch. Do not proceed to synthesis until all three complete.

**Model for every dispatched agent:** `haiku` — each agent does targeted code reading + structured-output extraction (FOR / AGAINST / counter-hypotheses), the bounded-rubric profile Haiku handles cleanly. **Exception:** when Step 1 question 3 says a large decision rides on the verdict (a major refactor, an architecture choice, a plan's premise), pin `sonnet` instead — "dig harder" is a judgment instruction, and the model tier must match it. State the chosen model on every `Task` call.

Each sub-agent receives the same two inputs: the verbatim hypothesis from Step 1 and the starting
area from Step 1 question 2. Every returned item cites `file:line` with a snippet of 5 lines or
fewer.

### Explore sub-agent 1 — Evidence FOR

Charter: build the strongest possible case that the hypothesis holds — read implementations,
follow call chains, and find tests that pin the claimed behavior. Do not search for contradicting
evidence; that is sub-agent 2's job. Return structured text with four keys: `direct_support`,
`indirect_support`, `tests_that_pin_the_behavior`, and a one-paragraph `strength_assessment`.
Label each item direct (the code enacts the claim) or indirect (consistent but not proof).

### Explore sub-agent 2 — Evidence AGAINST

Charter: falsify the hypothesis — search for contradicting code, bypass paths, runtime flags and
branches the claim ignores, and recent git history that invalidated it. Return structured text
with four keys: `direct_contradictions`, `partial_contradictions`, `historical_drift_signals`
(cite a commit sha or `file:line`), and a one-paragraph `strength_assessment`. For each item,
state precisely why it contradicts the claim ("this function does X instead").

### Explore sub-agent 3 — Counter-hypotheses

Charter: propose 1 to 3 alternative explanations that fit the same observable behavior, ranked by
plausibility — not "the claim is wrong" (sub-agent 2's job) but "what is happening instead".
Return structured text with two keys: `alternative_hypotheses` (each entry: statement, supporting
`file:line` evidence, how it differs observably from the original, plausibility high|medium|low)
and boolean `no_alternatives_found`. When no plausible alternative exists, set
`no_alternatives_found: true` — that absence is itself a signal the hypothesis is likely correct.

# Step 3 — Synthesize and write `01-discover.md`

Merge findings from the three sub-agents. **Do not invent evidence the agents did not surface.** If the FOR and AGAINST agents cite the same file:line with opposite interpretations, read it yourself and decide.

Pick exactly one verdict:

| Verdict | When to pick |
|---|---|
| `holds` | Direct supporting evidence exists; contradicting evidence is weak or absent; no alternative hypothesis is more plausible. |
| `partial` | Hypothesis is correct for some paths/configurations but not others. Be specific about *which* part holds and which doesn't. |
| `fails` | Direct contradicting evidence exists, OR an alternative hypothesis is clearly more plausible than the original. |
| `inconclusive` | Static code reading cannot adjudicate — the answer depends on runtime behavior, configuration, or data not visible in the repo. |

**`01-discover.md` frontmatter:**
```yaml
---
schema: sdlc/v1
type: discover
slug: <slug>
workflow-type: discover
hypothesis: <one-line hypothesis verbatim>
verdict: holds | partial | fails | inconclusive
confidence: high | medium | low
recommended-next: <command-if-any or "none">
status: ready-for-routing
created-at: <run `date -u +"%Y-%m-%dT%H:%M:%SZ"` to get the real timestamp>
---
```

**Body sections (in order):**

## The Discovery
<!-- STORY SECTION — first, and self-sufficient. MUST follow `../_story-arc.md`: three beats in order — the state this stage inherited, the load-bearing decisions with reasons and counts, then what this stage enables next plus the top open risk. Language MUST follow `../_ste-procedural.md` sections 1 and 3. No "This <stage> implements…" opening. 1–3 short paragraphs. -->

## 0. What this decides

The Step 1 question 3 answer, verbatim: the decision that rides on this verdict. On `fails`,
name explicitly which plan, assumption, or in-flight work lost its premise — a falsified
hypothesis with no record of what it falsified helps nobody. On `holds`, one line: what now
proceeds on confirmed ground.

## 1. Hypothesis

The hypothesis verbatim, as a falsifiable claim. Add 1–2 sentences of restatement that clarify what would have to be true for it to hold, and what would have to be true for it to fail.

## 2. Evidence FOR

List every piece of direct and indirect supporting evidence from sub-agent 1. Each item: `file:line` — one-line description — relevance (direct | indirect). Group direct evidence first.

## 3. Evidence AGAINST

List every piece of contradicting evidence from sub-agent 2. Each item: `file:line` — one-line description — severity (direct contradiction | partial contradiction | drift signal). If sub-agent 2 found nothing, say so explicitly: "No contradicting evidence found. Note: this is a meaningful signal only if sub-agent 2 actually searched — confirm it did before treating absence as confirmation."

## 4. Counter-hypotheses

List sub-agent 3's alternatives, ranked by plausibility. For each: the alternative statement, key supporting `file:line` references, and how it differs in observable behavior from the original. If `no_alternatives_found` was true, record that.

## 5. Verdict

State the verdict plainly: **holds**, **partial**, **fails**, or **inconclusive**.

Then one paragraph of rationale — justify the choice by referencing the sections above. Be specific about which evidence was decisive.

For `partial` verdicts, also state precisely: *which* part of the hypothesis holds, and *which* part fails. Treat this like a refined hypothesis the user can take forward.

For `fails` verdicts, name the counter-hypothesis (if any) that is more plausible.

For `inconclusive` verdicts, list exactly what runtime data or external information would resolve it.

## 6. Routing

| Verdict | Suggested next step |
|---|---|
| `holds` (any confidence) | None required. Your understanding is confirmed; proceed with whatever you intended to do. If acting on it requires code changes, the right next command depends on the size of the work (`/wf intake fix "<change>" from <slug>` for small, `/wf intake "<change>" from <slug>` for medium+ — the `from <slug>` token carries the verdict and evidence per `_intake-provenance.md`). |
| `partial` | Refine the hypothesis using the "which part holds / which part fails" finding, then re-run `/wf intake discover <refined-hypothesis>` if precision matters. Otherwise, treat the partial verdict as the answer and proceed. |
| `fails` | If the original hypothesis was an explanation for an observed bad behavior → `/wf intake rca "<symptom>" from <slug>` to find the actual cause — the ranked counter-hypotheses in section 4 are candidate root causes, and the `from <slug>` token hands them to the rca's sub-agents instead of discarding them. If it was a guess about how some feature works → the `deep-research` skill, to actually learn the code rather than guess again. |
| `inconclusive` | List the runtime signal needed. If it requires runtime observation, profiling, or a perf measurement → `/wf probe <slug> "<the runtime question section 5 named>"` (the finding lands as a compressed slice on this slug). If the unknown is a dependency/framework behavior → the `study-sources` skill against the installed source. If a repeatable perf baseline is warranted, flag it so `shape` records a benchmark augmentation. If it requires more code reading at wider scope → re-run `/wf intake discover` with a broader starting area. |

## 7. Confidence & limits

- **Confidence:** high | medium | low — one sentence justifying. High confidence requires direct evidence on the chosen verdict and weak counter-evidence.
- **What this verdict assumes:** any unstated assumptions in the hypothesis (e.g., "assuming the default config", "assuming current main branch") — list them explicitly so a future reader knows what would invalidate the verdict.
- **What was out of scope:** areas the sub-agents did not look at and why — so the user can ask for a follow-up if the scope was too narrow.

## 8. Tripwire warnings (only if any fired)

Tripwires are **warn-and-continue** — record them, do NOT refuse to write the verdict.

- **evidence-thin:** Sub-agents collectively cited fewer than 3 file:line references. The verdict is likely undersupported regardless of which way it leans.
- **counter-evidence-stronger-than-verdict:** The AGAINST agent found stronger evidence than the FOR agent but the verdict was still `holds`. Re-read sub-agent 2's findings — a `fails` or `partial` verdict may be more honest.
- **multiple-equal-hypotheses:** Two or more alternatives from sub-agent 3 are roughly as plausible as the original. The verdict should probably be `inconclusive` or `partial` rather than `holds`.
- **out-of-scope-claim:** The hypothesis is about external systems (third-party APIs, infrastructure, runtime environment), not code in this repo. Static code adjudication is the wrong tool — note this and recommend a runtime check instead.
- **needs-runtime-evidence:** A definitive answer requires running code, reading logs, or measuring behavior — not reading files. Verdict was forced to `inconclusive`.

For each fired tripwire: `[tripwire-name]: <what specifically tripped it>`. Closing line:

> One or more wf-discover tripwires fired. The verdict is still recorded, but review the warnings before acting on it.

## Step — Write free narrative fragments

Author free narrative fragments for this artifact as described in the narrative-fragment tier of `_intake-context.md` — `<stem>.<NN-label>.html.fragment` siblings of unrestricted raw HTML, as many as the story needs, ordered with an `NN-` prefix, rendered raw-inline below the page.

# Step 4 — Write `00-index.md` (closed at write time)

A verdict is terminal by construction — nothing is left to choose, so the workflow closes
the moment its index is written. No re-invocation, no parked Active row:

```yaml
---
schema: sdlc/v1
type: workflow-index
slug: <slug>
title: "Discover: <one-line hypothesis>"
workflow-type: discover
current-stage: routing
status: closed
close-reason: verdict-recorded
closed-at: <timestamp>
branch-strategy: none
branch: <current-branch>
base-branch: <current-branch>
next-command: none
next-invocation: "none — verdict recorded; see recommended-routes"
recommended-routes:
  primary: "<the section 6 route for this verdict, with its from <slug> form>"
  alternates: ["<other viable routes>"]
verdict: <holds|partial|fails|inconclusive>
confidence: <high|medium|low>
open-questions: []
augmentations: []
progress:
  discover: complete
created-at: <timestamp>
updated-at: <timestamp>
---
```

Register the slug's row in `.ai/workflows/INDEX.md` as `closed`. Body: one-line description
of the hypothesis + pointer to `01-discover.md` and the verdict. (`progress` is the object
form — the renderer silently drops a YAML list. No `selected-slice` — a discover has no
slice roster. A successor invoked with `from <slug>` reads the closed artifact via
`_intake-provenance.md`; closure hides nothing.)

# Step 5 — Hand off to user

Return per [_chat-return.md](../_chat-return.md) — narrative lead (what was found, built, or measured, and what it means for the user), then the structured anchors below.

Emit a compact chat summary:

```
wf-discover complete: <slug>
Hypothesis: <one-line hypothesis>
Verdict: holds | partial | fails | inconclusive
Confidence: <level>
Direct supporting evidence: <N file:line refs>
Direct contradicting evidence: <N file:line refs>
Counter-hypotheses considered: <N>
Tripwires: <none | comma-separated list>
Workflow: closed (verdict-recorded)
Next: <the section 6 route with its from <slug> form> | <"none — confirmed, proceed as you intended">
Artifact: .ai/workflows/<slug>/01-discover.md
```

If `fails`, prefix with:

> ✗ Hypothesis fails. The code does not work the way the claim asserts. See artifact for what is actually happening (or the most plausible alternative).

If `inconclusive`, prefix with:

> ⚠ Inconclusive — static code reading cannot adjudicate. See artifact for what runtime signal would resolve it.

# What this command is NOT

- **Not an explainer** — if the user wants to know *how* something works, that is the `deep-research` skill. `discover` answers "is my theory correct?", not "what is happening here?"
- **Not a diagnostician** — if there is an observed bug or symptom and the user wants to find the root cause, that is `/wf intake rca <symptom>`. `discover` starts from a theory; `rca` starts from a symptom.
- **Not a planner** — even when the verdict is `holds`, this command does not write a plan or propose changes. Acting on the confirmed understanding is the user's call (and usually `/wf intake fix` or `/wf intake`).
- **Not a substitute for running the code** — `inconclusive` is a valid verdict. When static reading cannot tell, say so rather than guessing.
