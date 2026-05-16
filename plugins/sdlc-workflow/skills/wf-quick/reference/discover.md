---
description: Hypothesis-test workflow. Takes a code-level hypothesis ("X is the case", "feature A is implemented via Y", "module M handles concurrency by Z") and adjudicates it against the codebase using parallel sub-agents that argue FOR, AGAINST, and propose counter-hypotheses. Produces a verdict (`holds` / `partial` / `fails` / `inconclusive`) with confidence and cited evidence. Does NOT write application code, does NOT diagnose bugs, does NOT explain code (use `/wf-docs how` for that). Read-only.
argument-hint: <hypothesis-or-slug>
---

# External Output Boundary (MANDATORY)
Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.
- Internal context includes workflow artifact paths (`.ai/workflows/...`, `.claude/...`, `.ai/dep-updates/...`), stage names or numbers, slash-command names, task/sub-agent names, prompt/tooling details, control-file metadata, and private chain-of-thought or reasoning traces.
- External-facing outputs include commit messages, branch names, PR titles/bodies/comments, release notes, changelog entries, user documentation, README content, code comments/docstrings, issue comments, deployment notes, and any file outside the private workflow artifact directories.
- When producing external-facing output, translate workflow context into product/project language: user-visible change, rationale, affected areas, verification, risks, migration notes, and follow-up work. Do not say the work came from an SDLC workflow or cite private artifact files.
- Before writing, committing, pushing, opening a PR, updating docs/comments, or publishing anything, perform a leak check and remove internal workflow references unless the user explicitly asks for a private/internal artifact.

You are running `wf-discover`, a **hypothesis-test workflow** that adjudicates a code-level claim against the codebase and returns a verdict with cited evidence.

# Slug-mode (read before proceeding)

If `/wf-quick`'s dispatcher selected **slug-mode** in Step 0 (the first argument after the sub-command matched a non-closed slug in `.ai/workflows/INDEX.md`), the *Step 1 — Slug-mode contract* in `${CLAUDE_PLUGIN_ROOT}/skills/wf-quick/SKILL.md` overrides the standalone instructions below. Substantively:

- **One artifact, in the existing workflow.** Write `.ai/workflows/<slug>/03-slice-discover-<descriptor>.md` (collision suffix `-2`, `-3` if needed). Frontmatter: `type: slice`, `slice-slug: discover-<descriptor>`, `slice-type: discover`, `compressed: true`, `origin: wf-quick/discover`, `stage-number: 3`, `status: defined`, `complexity: xs` (discover produces a verdict, not implementation work).
- **Same content, different home.** Body carries the same sections the standalone discover would have written to `01-discover.md` (hypothesis restatement, evidence-for, evidence-against, counter-hypotheses, verdict, confidence), under a `# Compressed Slice: discover` heading with a one-line provenance preamble.
- **No new workflow, no new branch, no `01-discover.md`, no new top-level `00-index.md`.** The slug already owns those.
- **Index updates:** append the slice file to `00-index.md.workflow-files`, append `{slug: discover-<descriptor>, slice-type: discover, created-at: <iso>}` to `00-index.md.compressed-slices` (create the array if missing). If `.ai/workflows/<slug>/03-slice.md` exists, also append `{slug, status: defined, slice-type: discover, compressed: true}` to its `slices`, bump `total-slices`, update `updated-at`. Do not modify `current-stage`, `selected-slice`, `status`, `branch`, or `progress`. Also rewrite the `updated-at` column on `<slug>`'s row in `.ai/workflows/INDEX.md` (see SKILL.md Step 1 step 6).
- **Chat return:** one line — `wf-quick discover → compressed slice discover-<descriptor> on <slug>` — plus the verdict and (if `fails` or `inconclusive`) the recommended next step.

If slug-mode was not selected (first argument was not a known slug, or `INDEX.md` did not exist), ignore this section and proceed standalone per the instructions below.

# Pipeline
`1·hypothesis-intake` → `2·triangulate` → `3·adjudicate` → verdict (no required next command)

| | Detail |
|---|---|
| Requires | Nothing — starts fresh. Pass a hypothesis string or an existing slug to resume. |
| Produces | `01-discover.md` (verdict + evidence + counter-hypotheses), `00-index.md` |
| Skips | No fix, no plan, no implementation, no explanation of how code works (that is `/wf-docs how`). |
| Next | If `holds` → no required follow-up; act on the confirmed understanding however you originally intended. If `fails` or `inconclusive` → `/wf-quick rca <symptom>` (if the falsified hypothesis was about why something behaves badly) or `/wf-docs how <topic>` (if you need to actually learn how the code works rather than test a theory). |
| Escalate | If FOR and AGAINST evidence are roughly equal AND a definitive answer requires runtime data (not static code reading) → surface `needs-runtime-evidence` and list exactly what would resolve it (a test run, a profile, a log line). |

# CRITICAL — adjudication discipline
You are a **hypothesis adjudicator**, not a fixer, explainer, or planner.
- The **only** acceptable output is the discover artifact and index. Do NOT edit application code. Do NOT write a plan. Do NOT propose a fix. Do NOT produce a tutorial-style explanation of how the area works (that is `/wf-docs how`).
- Read-only investigation only: `git log`, `git blame`, `Read`, `Grep`, static code inspection.
- The verdict must be **convergent**: exactly one of `holds`, `partial`, `fails`, or `inconclusive`. Do not hedge across all four; pick one and justify it with cited evidence.
- The artifact must include both supporting AND contradicting evidence. A "holds" verdict with no AGAINST section is suspect — search until you find counter-evidence or explicitly record that none exists.
- Ask at most **3 questions** in chat. No `AskUserQuestion`, no separate `po-answers.md` — answers go inline into the artifact.
- Follow the steps below exactly in order. Do not skip, reorder, or combine steps.

# Step 0 — Orient (MANDATORY)
1. **Resolve slug and mode** from `$ARGUMENTS`:
   - If the argument matches an existing `.ai/workflows/*/00-index.md` with `workflow-type: discover` → **resume mode**. Read that index. If `01-discover.md` is complete, tell the user and stop. If incomplete, pick up from the missing section.
   - Otherwise → **new discover**. Derive a slug: `discover-<short-hypothesis>` (kebab-case, max 5 words, e.g., `discover-auth-uses-jwt`).
2. **Collision check:** If `.ai/workflows/<slug>/00-index.md` exists and `workflow-type` is NOT `discover` → WARN: "Workflow `<slug>` already exists with type `<existing-type>`. Choose a different description, or run `/wf-meta resume <slug>` to continue it." Stop.
3. **Branch posture (do NOT switch branches):**
   - This is read-only — do not create or switch branches.
   - Record the current branch in the index.
4. **Read project context (lightweight):**
   - Read `README.md` (top 100 lines) for project shape and vocabulary, so the hypothesis can be grounded in the same terms the codebase uses.

# Step 1 — Hypothesis clarification
Ask at most **3 questions** — stop as soon as the hypothesis is testable:

1. **What is the hypothesis?** — State as a falsifiable claim, not a question. Good: "the rate-limiter is implemented as a token bucket in `middleware/`". Bad: "how is the rate-limiter implemented?" (that is `/wf-docs how`). Required if not clear from `$ARGUMENTS`.
2. **Where to look?** — A starting file, directory, function, or area. Even "I'm not sure, somewhere in `src/auth`" is useful. If the user has no idea, the adjudication will be wider and confidence will likely be lower — note this.
3. **What would change if it holds vs. fails?** — Used only to size the adjudication effort. If the user is sanity-checking before a 1-line edit, a quick pass is enough. If a major refactor depends on the answer, dig harder and accept lower confidence as a tripwire.

If `$ARGUMENTS` contains enough to answer all three, skip to Step 2.

Do NOT write the artifact yet. Hold answers in working memory and proceed.

# Step 2 — Parallel adjudication
Launch all three sub-agents simultaneously. Each is a separate `Explore` sub-agent dispatch. Do not proceed to synthesis until all three complete.

### Explore sub-agent 1 — Evidence FOR

Prompt with ALL of the following:
- The hypothesis: `<verbatim hypothesis from Step 1>`.
- The starting area from question 2.
- Your job is to find code that **supports** the hypothesis. Read implementations, follow call chains, look at tests that exercise the claimed behavior.
- For each piece of supporting evidence: cite `file:line` and quote a relevant snippet (≤5 lines). Note whether it is direct (the code literally does what the hypothesis claims) or indirect (it is consistent with the hypothesis but does not prove it).
- Do NOT search for contradicting evidence — that is sub-agent 2's job. Stay focused on building the strongest possible case FOR.

Return as structured text:
- `direct_support`: list of `{file:line, snippet, why_it_supports}` — code that literally enacts the hypothesis.
- `indirect_support`: list of `{file:line, snippet, why_consistent}` — code that is compatible with the hypothesis but does not prove it.
- `tests_that_pin_the_behavior`: list of `{file:line, test_name, what_it_asserts}` — passing tests that would break if the hypothesis were false.
- `strength_assessment`: one paragraph — how strong is the case FOR, in your own judgment?

### Explore sub-agent 2 — Evidence AGAINST

Prompt with ALL of the following:
- The hypothesis: `<verbatim hypothesis from Step 1>`.
- The starting area from question 2.
- Your job is to **falsify** the hypothesis. Actively search for code that contradicts it, paths that bypass it, comments that suggest historical drift, or git history showing the hypothesis was true but no longer is.
- For each piece of contradicting evidence: cite `file:line`, quote the snippet, and explain *why* it contradicts the hypothesis. Be precise — "this function does X instead of what the hypothesis claims".
- Look especially for: dead code that suggests an old implementation, configuration flags that change behavior at runtime, branches in logic that the hypothesis ignores, edge cases the hypothesis doesn't cover.
- Run `git log --oneline -20` on the relevant files — recent refactors may have invalidated assumptions the hypothesis relies on.

Return as structured text:
- `direct_contradictions`: list of `{file:line, snippet, why_it_contradicts}` — code that proves the hypothesis is wrong.
- `partial_contradictions`: list of `{file:line, snippet, what_part_fails}` — code that shows the hypothesis is wrong in some cases but holds in others.
- `historical_drift_signals`: list of `{commit_sha_or_file:line, observation}` — signs the hypothesis was true once but the code has moved on.
- `strength_assessment`: one paragraph — how strong is the case AGAINST, in your own judgment?

### Explore sub-agent 3 — Counter-hypotheses

Prompt with ALL of the following:
- The hypothesis: `<verbatim hypothesis from Step 1>`.
- The starting area from question 2.
- Your job is to propose **alternative explanations** that fit the same observable behavior. Not "the hypothesis is wrong because X" (that is sub-agent 2) — but "if the hypothesis were false, what would actually be happening instead?"
- Aim for 1 to 3 alternatives, ranked by how well each fits what you can read in the code.
- For each alternative: state it as a claim parallel to the original hypothesis, cite 1 to 3 supporting `file:line` references, and explain how it differs in observable behavior from the original.
- If you cannot find any plausible alternatives, say so explicitly — that itself is a useful signal that the hypothesis is likely correct.

Return as structured text:
- `alternative_hypotheses`: list of `{statement, supporting_evidence: [{file:line, snippet}], differs_from_original_by: <one line>, plausibility: high|medium|low}`.
- `no_alternatives_found`: boolean — if you genuinely couldn't think of any alternative, true; otherwise false.

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
| `holds` (any confidence) | None required. Your understanding is confirmed; proceed with whatever you intended to do. If acting on it requires code changes, the right next command depends on the size of the work (`/wf-quick quick` for small, `/wf intake` for medium+). |
| `partial` | Refine the hypothesis using the "which part holds / which part fails" finding, then re-run `/wf-quick discover <refined-hypothesis>` if precision matters. Otherwise, treat the partial verdict as the answer and proceed. |
| `fails` | If the original hypothesis was an explanation for an observed bad behavior → `/wf-quick rca <symptom>` to find the actual cause. If it was a guess about how some feature works → `/wf-docs how <topic>` to actually learn the code rather than guess again. |
| `inconclusive` | List the runtime signal needed. If it requires a profile → `/wf profile <area>`. If it requires a benchmark → `/wf benchmark <slug>`. If it requires more code reading at wider scope → re-run `/wf-quick discover` with a broader starting area. |

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

# Step 4 — Write `00-index.md`

```yaml
---
schema: sdlc/v1
type: workflow-index
slug: <slug>
workflow-type: discover
current-stage: routing
status: ready
selected-slice: <slug>
branch-strategy: none
branch: <current-branch>
base-branch: <current-branch>
next-command: <recommended-next or none>
next-invocation: <recommended-next-with-args or "none — verdict recorded">
verdict: <holds|partial|fails|inconclusive>
confidence: <high|medium|low>
open-questions: []
augmentations: []
progress:
  - discover: complete
created-at: <timestamp>
---
```

Body: one-line description of the hypothesis + pointer to `01-discover.md` and the verdict.

# Step 5 — Hand off to user

Emit a compact chat summary, no more than 10 lines:

```
wf-discover complete: <slug>
Hypothesis: <one-line hypothesis>
Verdict: holds | partial | fails | inconclusive
Confidence: <level>
Direct supporting evidence: <N file:line refs>
Direct contradicting evidence: <N file:line refs>
Counter-hypotheses considered: <N>
Tripwires: <none | comma-separated list>
Next: <command with args> | <"none — confirmed, proceed as you intended">
Artifact: .ai/workflows/<slug>/01-discover.md
```

If `fails`, prefix with:

> ✗ Hypothesis fails. The code does not work the way the claim asserts. See artifact for what is actually happening (or the most plausible alternative).

If `inconclusive`, prefix with:

> ⚠ Inconclusive — static code reading cannot adjudicate. See artifact for what runtime signal would resolve it.

# What this command is NOT

- **Not an explainer** — if the user wants to know *how* something works, that is `/wf-docs how <topic>`. `discover` answers "is my theory correct?", not "what is happening here?"
- **Not a diagnostician** — if there is an observed bug or symptom and the user wants to find the root cause, that is `/wf-quick rca <symptom>`. `discover` starts from a theory; `rca` starts from a symptom.
- **Not a planner** — even when the verdict is `holds`, this command does not write a plan or propose changes. Acting on the confirmed understanding is the user's call (and usually `/wf-quick quick` or `/wf intake`).
- **Not a substitute for running the code** — `inconclusive` is a valid verdict. When static reading cannot tell, say so rather than guessing.
