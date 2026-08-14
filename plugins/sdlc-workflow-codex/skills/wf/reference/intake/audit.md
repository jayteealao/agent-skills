---
description: Defect-hunting workflow for a named subsystem with no symptom, no hypothesis, and no diff. Takes a concern ("audit the paint-ordering code for wrong assumptions") plus optional paths, resolves the concern to a concrete file surface via parallel enumeration, selects review lenses from the existing rubric set, hunts, adversarially refutes each candidate finding, and merges survivors into an accumulating findings ledger (`07-review*`). Terminal and route-don't-fix — every accepted finding routes to its own follow-up command; this mode never edits code. Re-runs MERGE into the same ledger. Read-only.
argument-hint: <concern> [paths…] | <slug> (re-run) | lenses=<a>,<b> override
---

# Output boundary & shared context
Load `reference/intake/_intake-context.md` in full and apply it — the External Output Boundary, the narrative-fragment tier, and the workflow-registry / slug rules. Do not restate them here.

You are running `$wf intake audit`, a **subsystem defect hunt**. It exists for the request every adjacent surface refuses: review existing code for bugs, wrong assumptions, and mistakes when there is no symptom (`rca` needs one), no stated hypothesis (`discover` needs one), no decided problem (`investigate` needs one), and no diff (the review stage needs one). The output is an **accumulating findings ledger** — the same `07-review*` family the review stage owns, governed by the same merge law.

# Slug-mode (read before proceeding)

If the dispatcher selected **slug-mode** (the first token after `intake` matched a non-closed slug whose `workflow-type` is NOT `audit`), follow `reference/_compressed-slice.md` — it OVERRIDES the standalone instructions below. Write one `.ai/workflows/<slug>/03-slice-audit-<descriptor>.md` (`type: slice`, `slice-type: audit`, `compressed: true`, `origin: intake/audit`); no new workflow, no branch, no `07-review*` files, additive index updates only. Per the contract's inline-records rule, a slice-mode audit records a **single findings table in the slice body and does not accumulate** — it is a one-shot audit, and the body states that. Chat return: `audit → compressed slice <slice-slug> on <slug>`.

If the first token matched an existing slug whose `workflow-type` IS `audit`, that is a **re-run** of the standalone flow below (Step 0 resume), not slug-mode.

If neither applies, proceed standalone below.

# Pipeline
`0·orient` → `1·resolve-surface` → `[scope gate]` → `2·select-lenses` → `3·hunt` → `4·refute` → `5·merge` → `6·route`

| | Detail |
|---|---|
| Requires | Nothing — starts fresh. Pass a concern (plus optional paths), or an existing audit slug to re-run. |
| Produces | `00-index.md` (`type: workflow-index`), `01-audit.md` (`type: intake`, the brief), `07-review.md` (master ledger, `type: review`), `07-review-<lens>.md` per lens (`type: review-command`) |
| Skips | No `02-shape.md`, no `04-plan.md` — for an audit, scoping and briefing are one motion. No branch. |
| Next | Terminal → each accepted finding routes to its own command (Step 6 table). The workflow **stays open** for accumulating re-runs; close it with `$wf close <slug>` when the concern is retired. |
| Escalate | A finding that static reading cannot settle is recorded at `confidence: low` with `needs-runtime-evidence` and the exact experiment named → `$wf probe` (see Step 4). |

# CRITICAL — audit discipline
You are a **read-only defect hunter that owns an accumulating findings ledger**.
- Do NOT edit application code. Do NOT run a fix loop — there is none in this mode, ever. Every finding **routes**; none is fixed here.
- Do NOT run the lenses yourself — dispatch sub-agents (Step 3) and refuters (Step 4) per [_subagents.md](../_subagents.md).
- The ledger **accumulates across invocations**: the merge law — stable IDs, `surfaced-at` preservation, resolve-sweep, `runs:` append — is single-sourced in [_findings-ledger.md](../_findings-ledger.md). Apply it; never restate it; never overwrite a prior finding.
- Scope and lens selection must be **legible and correctable**: state the resolved surface, the exclusions, and every selected lens with its reason, in the artifact AND in chat, BEFORE the hunt runs. An audit whose scope was silently guessed cannot be trusted when it reports "no findings" — the reader cannot tell clean from unread.
- **Zero findings is a valid, useful result.** Write the artifact with the resolved surface, lenses run, and not-observable set. Never pad a clean result with nits.
- Respect the stated order only where a step consumes an earlier step's output or crosses a gate; reading and research may interleave freely.

# Step 0 — Orient (MANDATORY)
1. **Resolve slug and mode** from the instructions:
   - If the argument matches an existing `.ai/workflows/*/00-index.md` with `workflow-type: audit` → **re-run mode**. Read the index and the existing `07-review*` ledger now — this run MERGES into it. The concern and surface come from `01-audit.md`; new paths in the arguments extend the surface (recorded as a surface revision in `01-audit.md`).
   - Otherwise → **new audit**. Derive a slug: `audit-<short-concern>` (kebab-case, max 5 words, e.g. `audit-paint-ordering`).
2. **Collision check:** if `.ai/workflows/<slug>/00-index.md` exists with a different `workflow-type` → WARN and stop, as `discover` does.
3. **Branch posture:** read-only — do not create or switch branches. Record the current branch in the index.
4. **Lens override:** a `lenses=<a>,<b>` token overrides Step 2's inference entirely. Record that the selection was user-forced.
5. **Project context (lightweight):** read `README.md` (top 100 lines) so the concern can be grounded in the codebase's own vocabulary.

# Step 1 — Resolve the surface (two waves, because a subsystem is not a path)

A concern names a subsystem; a lens needs files. Do not guess the mapping — enumerate it.

1. **Wave 1 — enumerate.** Dispatch parallel `explorer` sub-agents (effort **low** — bounded extraction; see [_subagents.md](../_subagents.md)), each mapping the concern to concrete files by a **different search modality**, blind to the others:
   - **By entry point** — where does this subsystem start (routes, exported APIs, main loops)?
   - **By call graph** — what does the entry set call into; what calls into it?
   - **By naming convention** — files/dirs/symbols whose names match the concern's vocabulary.
   - **By test coverage** — which tests exercise this behavior; which source files do they import?
   Each returns a file list with a one-line reason per file. **Union** the results.
2. **Resolve exclusions.** Drop vendored code, generated files, and anything the user removed — record each exclusion **with its reason**.
3. **Any file the user named explicitly is in scope unconditionally.** Inference adds, never subtracts.
4. **Concern names no surface at all** ("audit the codebase") → wave 1 cannot converge. `audit` is **not a whole-repo sweep**. Enumerate 3–6 candidate subsystems and have the user pick one (tripwire, below).

**[Scope gate]** — present the resolved surface for confirmation BEFORE any lens runs: the file list (grouped, with counts), the exclusions with reasons, and what will NOT be looked at. Ask through the gate-question ladder ([_gate-question.md](../_gate-question.md)) with options Confirm / Adjust / Cancel; the non-interactive default is Confirm with the assumption recorded. Question craft follows [_question-craft.md](../_question-craft.md). On re-runs with an unchanged surface, the gate is satisfied by the prior confirmation — state that and proceed.

# Step 2 — Select lenses, and say why

Lenses are the existing review rubrics at `reference/review/<lens>.md` (plus `design/audit.md` / `design/critique.md` for design surfaces). `audit` **owns no rubrics and adds no dimension** — it is a consumer.

1. **Infer the lens set from the concern and the surface.** "Wrong assumptions between two paths" → `correctness`, `architecture`, `testing`. "Is this leaking memory" → `performance`, `reliability`. Concurrency vocabulary in the surface → `backend-concurrency`. Auth/credentials in the surface → `security`, `privacy`. Select 2–6 lenses; more only when the surface genuinely spans domains.
2. **State the selection** — each lens with a one-line reason — in `01-audit.md` AND in chat, before dispatch. Inference that cannot be inspected is an opaque router.
3. **`lenses=` override** (Step 0.4) replaces inference; still record one line per lens: "user-forced".
4. **No rubric fits** → say so honestly: write `01-audit.md` with the resolved surface and "no lens applies — <why>", and ask the user to force a set or accept the null result. Do not run a token lens to look busy.

# Step 3 — Hunt (parallel lens sub-agents)

For EACH selected lens, spawn a sub-agent per [_subagents.md](../_subagents.md) — effort **medium** (standard review-dimension work); waves of ≤6 when the lens set is large. Prompt each with:

- The lens reference path: `reference/review/<lens>.md` — read it and apply its rubric.
- **Scope: the confirmed file surface from Step 1** — read these files; there is no diff. Every finding is by construction about existing code (no `pre-existing` split — record `pre-existing: true` on every row for schema compatibility with the review family).
- The concern verbatim, so the lens reads with intent.
- **Candidate findings only** — findings do NOT enter the ledger until they survive Step 4. Return each with severity (BLOCKER/HIGH/MED/LOW/NIT), confidence (High/Med/Low), `file:line`, evidence snippet, and the claimed invariant it violates. Children return findings as text; the coordinator writes every ledger file (children read, the coordinator writes).
- **The decidability boundary:** a candidate that static reading cannot settle (most sharply: "these two paths disagree at runtime") is returned with `needs-runtime-evidence: true` and **the exact experiment that would settle it** (a test run, a profile, a log line, a parity harness) — named, never guessed. Refuse to under-report; refuse to invent runtime facts.

# Step 4 — Adversarial refutation (before anything lands)

A plausible-but-wrong finding costs more here than in the review stage — nobody's diff context catches it. Refute each candidate before it lands (the `ship-plan audit` posture).

1. Refuter count scales with severity: **BLOCKER/HIGH → three refuters with distinct lenses** (does it reproduce from the code as written · is the claimed invariant real · does a caller/guard upstream prevent it); **MED and below → one refuter**. Effort **high** for BLOCKER/HIGH refuters (causal reasoning), **medium** otherwise, per [_subagents.md](../_subagents.md).
2. Each refuter is prompted to **KILL the finding** — "prove this claim wrong; default to refuted when uncertain" — and returns `refuted: true|false` with its reasoning.
3. A BLOCKER/HIGH candidate survives when **at least two of three** refuters fail to kill it; a MED-and-below candidate survives when its single refuter fails.
4. **Survivors** enter the merge (Step 5). **Refuted candidates go in the master ledger's `## Refuted` section with the refutation** — never silently dropped; a refuted candidate is evidence that the lens looked.
5. A candidate carrying `needs-runtime-evidence` skips refutation (there is nothing static to refute): it enters the ledger at `confidence: low`, `status: open`, with the named experiment, and Step 6 routes it to `$wf probe`.

# Step 5 — Merge into the ledger

Write the `07-review*` family under `.ai/workflows/<slug>/`, applying [_findings-ledger.md](../_findings-ledger.md) in full — within-run dedupe, cross-run reconcile against any prior ledger, resolve-sweep for re-run lenses, `runs:` append, full merged set emitted. Timestamps per [_timestamp.md](../_timestamp.md).

1. **Per-lens files** — `07-review-<lens>.md`, `type: review-command`, `review-scope: slug-wide`, the same frontmatter/metric shape the review stage's dimension files carry. Author the sibling `.yaml` (schema `siblingYamlSchemas.review-dimension`; OPEN findings only) and `.html.fragment` per [_fragment-authoring.md](../_fragment-authoring.md) — the post-write verifier blocks a `type: review-command` write without its sibling `.yaml`; a clean lens sets `fragment: none` instead.
2. **Master ledger** — `07-review.md`, `type: review`, `review-scope: slug-wide`, with `## All Findings`, `## Findings (Detailed)`, `## Refuted` (this mode's addition — candidate, killing refutation, refuter lens), `## Triage Decisions` (routes recorded in Step 6), and a verdict line stating ledger state, not shippability: `N open / N resolved / N refuted across <lenses>`. Sibling `.yaml` + fragment per the review shape.
3. **Edits are additive** per [_additive-write.md](../_additive-write.md) — a re-run edits in place and appends; it never rewrites history.
4. **`01-audit.md`** (`type: intake`, satisfies the intake required set: `status: complete`, `stage-number: 1`, `created-at`/`updated-at`, `tags`, `refs`, `next-command`, `next-invocation`) carries the brief inline: the concern verbatim, the resolved surface with counts, exclusions with reasons, selected lenses with reasons, the not-observable set (what static reading could not decide), and a surface-revision log for re-runs.
5. **`00-index.md`** (`type: workflow-index`) — `workflow-type: audit`, `status: active` (an audit stays open for accumulating re-runs), `current-stage: audit`, `review-scope: slug-wide`, `branch-strategy: none`, progress map `{audit: complete}`, `recommended-routes` from Step 6. Register the row in `.ai/workflows/INDEX.md` per `_intake-context.md`.

## Story sections
`01-audit.md` and `07-review.md` each open with a story section (`## The Audit` / `## The Review`) — first, and self-sufficient, per `../_story-arc.md`: the state inherited, the load-bearing decisions with reasons and counts, then what this enables next plus the top open risk. Language per `../_ste-procedural.md` sections 1 and 3.

## Step — Write free narrative fragments
Author free narrative fragments for any artifact as described in the narrative-fragment tier of `_intake-context.md` — a surface map, a findings heatmap, a refutation flow — as many as the story needs.

# Step 6 — Route (terminal; route-don't-fix)

For each OPEN finding, record a route in `## Triage Decisions`:

| Finding shape | Route |
|---|---|
| Small, mechanical, root cause clear | `$wf intake fix <finding> from <slug>` |
| Cause unclear, symptom now known | `$wf intake rca <finding> from <slug>` |
| Needs restructuring; several viable approaches | `$wf intake investigate <problem> from <slug>` |
| Genuine feature-sized work | `$wf intake <scope> from <slug>` |
| Needs runtime proof to confirm at all (`needs-runtime-evidence`) | `$wf probe <slug> "<the named experiment>"` |
| Not a code change at all (rotate the leaked key, file the upstream issue) | `$wf task <outcome>` |

Do NOT fix anything. Do NOT open a fix loop. Each accepted finding seeds its **own** follow-up workflow via the `from <slug>` provenance token (`_intake-provenance.md`); the audit workflow itself stays open as the ledger of record until `$wf close <slug>`.

> **Auto second opinion (objective triggers).** After the merge, **auto-invoke** `$consult codex <critique these findings and name what this audit missed>` (pinning `codex` keeps it free) when ANY of:
> - the audit surfaced **zero** open findings on a surface above 20 files — a clean result on a large surface is the cheapest thing to be wrong about;
> - any finding is BLOCKER;
> - any lens returned `needs-runtime-evidence`;
> - the surface spans security, auth, data migration, or money/billing.
> Fold material critique back into the ledger as candidates for the next run (they do NOT bypass Step 4). The user may invoke it with any provider.

# Chat return

Return per [_chat-return.md](../_chat-return.md) — narrative lead (what was hunted, what survived refutation, what it means), then:

```
wf intake audit complete: <slug>
Concern: <one line>
Surface: <N files confirmed, M excluded>
Lenses: <lens (reason) · lens (reason) …>
Findings: <O open / R resolved / X refuted>   (this run: A net-new, B re-confirmed, C cleared)
Not observable statically: <N — see 01-audit.md>
Routes: <top routes, one per open BLOCKER/HIGH>
Artifacts: .ai/workflows/<slug>/01-audit.md, 07-review.md, 07-review-<lens>.md …
Next: <top route> | $wf intake audit <slug> (re-run) | $wf close <slug> (retire the concern)
```

# Crash-safe / resume

The ledger on disk is the state. A killed run resumes by re-invoking `$wf intake audit <slug>`: orientation re-reads `01-audit.md` (surface, lenses) and the existing `07-review*` files, and the merge law makes the re-run idempotent — nothing is lost, nothing duplicated.

# Boundary tripwires (warn-and-continue, never refuse)

- **Concern names a specific symptom** ("X is broken after Y") → this is `rca`; offer to reroute before Step 1.
- **Concern is a yes/no question** about the system → `discover`; offer to reroute.
- **Concern presumes the problem and wants approaches** → `investigate`; offer to reroute.
- **Concern names no surface at all** → enumerate candidate subsystems and have the user pick (Step 1.4). `audit` is not a whole-repo sweep.
- **Zero findings** → valid result; write the artifact so the next audit knows what was covered.

# What this command is NOT

- **Not `rca`** — `rca` starts from a symptom and converges on one cause; `audit` starts from a concern and enumerates unknown defects.
- **Not `discover`** — `discover` adjudicates a stated hypothesis; `audit` has none.
- **Not `investigate`** — `investigate` sketches approaches to a decided problem; `audit` decides whether problems exist.
- **Not the review stage** — the stage reviews a *change* (a diff against ACs, with a fix loop); `audit` reviews a *subsystem*, refutes before landing, and never fixes. It borrows the stage's ledger, not its job.
- **Not `probe`** — `probe` executes the running artifact; `audit` reads source. Where reading hits its ceiling, `audit` names the experiment and hands it to `probe`.
- **Not a fixer** — no fix loop exists here. Citing `_fix-loop.md` from this file is the tell that the mode drifted into being a second review stage.
