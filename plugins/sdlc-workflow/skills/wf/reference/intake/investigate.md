---
description: Solution-options sketcher. Takes a code-level problem ("checkout is slow", "auth flow is brittle", "we need to support multi-tenant data") and enumerates every genuinely distinct candidate engineering approach grounded in the existing architecture, with tradeoffs (scope, blast radius, effort, risk, reversibility) for each — up to 3 presented as full cards, surplus distinct options recorded as compressed entries. Does NOT pick a winner — the user does; re-invoked as `investigate <slug> <option>` it records that pick and closes the workflow. Does NOT write application code, does NOT diagnose bugs (use `/wf intake rca`), does NOT validate whether the problem is worth solving (it assumes the user already decided). Read-only except the pick bookkeeping.
argument-hint: <problem-statement-or-slug>
---

# Output boundary & shared context
Load `_intake-context.md` in full and apply it — the External Output Boundary, the narrative-fragment tier, and the workflow-registry / slug rules. Do not restate them here.

You are running `/wf intake investigate`, a **solution-options sketcher** that proposes multiple engineering approaches to a stated problem and characterizes their tradeoffs — without picking a winner.

# Slug-mode (read before proceeding)

If the dispatcher selected **slug-mode** (the first token after `intake` matched a non-closed slug in `.ai/workflows/INDEX.md`), follow `../_compressed-slice.md` — it OVERRIDES the standalone instructions below. In short: write one `.ai/workflows/<slug>/03-slice-investigate-<descriptor>.md` (`type: slice`, `slice-type: investigate`, `compressed: true`, `origin: intake/investigate`); no new workflow, no new branch, no standalone artifact, no new top-level `00-index.md`; additive index updates only; chat return `investigate → compressed slice <slice-slug> on <slug>`.

If slug-mode was not selected, ignore this section and proceed standalone below.

# Pipeline
`1·problem-intake` → `2·map-and-sketch` → `3·characterize-tradeoffs` → user picks (recorded via `# Pick`) → `/wf intake … from <slug>` | `/wf intake fix … from <slug>`

| | Detail |
|---|---|
| Requires | Nothing — starts fresh. Pass a problem statement or an existing slug to resume; pass `<slug> <option>` to record a pick. |
| Produces | `01-investigate.md` (problem + architecture map + every distinct option sketched with tradeoffs — ≤3 full cards, surplus as compressed entries — plus a status-quo baseline), `00-index.md`. **No `02-shape.md`** — the user chooses an option first; the downstream command (`/wf intake` or `/wf intake fix`) does the shape pass on the chosen option, seeded from this artifact via `_intake-provenance.md`. |
| Skips | No fix, no plan, no implementation, no recommendation. The option set *is* the output. |
| Next | User picks an option → record it (`/wf intake investigate <slug> <option> [reason]`), then `/wf intake fix "<option> — <one-line>" from <slug>` (`effort: small` per the effort rubric below) or `/wf intake "<option> — <one-line>" from <slug>` (medium+). |
| Escalate | If sub-agents agree no viable option exists within the current architecture → surface `architecture-blocking` and recommend a design pass via `/wf intake` with the problem framed as an architecture question. |

> **Auto second opinion (objective triggers).** At the terminus, once the option set is
> synthesized (after Step 3 has written `01-investigate.md` and before Step 4 writes the index —
> folding the panel's output in therefore edits the just-written artifact), **auto-invoke** `/consult codex <critique these
> candidate approaches and name what this analysis missed>` (pinning `codex`/`claude` keeps it
> free) when ANY of: (a) any tripwire fired (`single-viable-option` especially — a second model
> is the cheapest test of whether the option space is genuinely that narrow); (b) any option is
> `effort: large` or requires a schema change or an architecture violation; (c) the options span
> security, auth, data migration, or money/billing. Fold distinct options or refutations into the
> artifact (an option the panel kills moves to "considered and rejected" with the reason). Skip
> only when none of the triggers hold; the user may invoke it explicitly with any provider.

> **Ground options in real source.** When a candidate approach hinges on what a
> library, framework, or SDK *actually* supports — an extension point, a config
> surface, a limit, whether an API even exists in the installed version — invoke the
> `study-sources` skill to read its installed source (or clone it into `.scratch/`)
> before characterizing feasibility, effort, and risk. An option's tradeoffs are only
> as sound as the API facts behind them; reading the real source keeps a sketch from
> resting on an API that doesn't exist. Read-only — reads land in `.scratch/`, no repo
> or application-code changes.

# Effort rubric (single source)

The one definition of effort for this command. Every other mention in this file — sub-agent prompts, option sections, routing — cites this rubric instead of restating thresholds; pass it unchanged into any sub-agent prompt that needs it.

- **small** — ≤3 files, ≤5 steps, no new dependency, no schema change.
- **medium** — 4–10 files, or a new dependency, or a config change.
- **large** — >10 files, or an architecture change, migration, or cross-team coordination.

# Sketching discipline
You are an **options sketcher**, not a chooser, planner, or implementer.
- The **only** acceptable output is the investigate artifact and index. Do not edit application code. Do not write a plan. Do not pick a winning option (the user picks).
- Read-only investigation only: `git log`, `git blame`, your native file-reading and search tools, static code inspection.
- Each option must be **distinct**: option B is not "option A but with a twist" — it should embody a meaningfully different design choice (different layer, different abstraction, different mechanism). If you cannot find 2 genuinely distinct options, say so (a tripwire) rather than padding with near-duplicates.
- Each option's "Sketch" section is **direction, not a plan** — 2 to 5 lines naming the technique, the area, and the rough boundary. Do not enumerate implementation steps.
- Ask at most **3 questions** in chat. No structured gate question, no separate `po-answers.md` — answers go inline into the artifact.
- Respect the stated order only where a step consumes an earlier step's output or crosses a gate; reading and research may interleave freely.

# Step 0 — Orient
1. **Resolve slug and mode** from `$ARGUMENTS`:
   - If the first token matches an existing `.ai/workflows/*/00-index.md` with `workflow-type: investigate` → the workflow exists. Read that index, then split on three sub-cases:
     - **A token after the slug matches an option id (`A`, `B`, …) or an option label** from `01-investigate.md` → **pick mode**. Jump to `# Pick — decision closure` below; any trailing prose after the option token is the decision note. If the token matches more than one label, ask one question to disambiguate. If the index is already `status: closed`, WARN: "Workflow `<slug>` is closed (chosen-option: `<value>`)." and stop.
     - **`01-investigate.md` is complete and no pick token is present** → tell the user the option set is ready and how to record a pick — `/wf intake investigate <slug> <option-id-or-label> [one-line reason]` — and stop.
     - **`01-investigate.md` is incomplete** → **resume mode**: pick up from the missing section.
   - Otherwise → **new investigate**. Derive a slug: `investigate-<short-problem>` (kebab-case, max 5 words, e.g., `investigate-checkout-latency`).
2. **Collision check:** If `.ai/workflows/<slug>/00-index.md` exists and `workflow-type` is NOT `investigate` → WARN: "Workflow `<slug>` already exists with type `<existing-type>`. Choose a different description, or run `/wf recap <slug>` to continue it." Stop.
3. **Branch posture (do NOT switch branches):**
   - This is read-only — do not create or switch branches.
   - Record the current branch in the index.
4. **Read project context (lightweight):**
   - Read `README.md` (top 100 lines) for project shape and conventions, so option sketches use vocabulary that fits the codebase.
   - Read `AGENTS.md` if present for project conventions.

# Step 1 — Problem clarification
Ask at most **3 questions** — stop as soon as the problem is sketchable:

1. **What is the problem?** — State as a code-level problem the user wants to solve, not a feature ask. Good: "checkout p99 latency is 2s and the bottleneck is unknown". Bad: "we need a faster checkout" (no constraint), "should we rewrite checkout?" (that is `/wf intake discover`). Required if not clear from `$ARGUMENTS`.
2. **Where in the codebase?** — A starting file, module, or area. The sketches will be scoped to options that touch this area; if the user truly doesn't know, the cartographer sub-agent will widen the search and that will be flagged.
3. **Constraints?** — Anything off-limits (no schema change, no new dependency, must work without a rebuild, ≤1 week of work, no breaking API change). Constraints prune the option space; without them, the sketches will lean wider than the user may want.

If `$ARGUMENTS` contains enough to answer all three, skip to Step 2.

Do not write the artifact yet. Hold answers in working memory and proceed.

# Step 2 — Map and sketch (two waves)
Three sub-agents, dispatched in two waves: the cartographer and the option generator are independent and launch **in parallel**; the tradeoff characterizer launches **after both return**, because it consumes their output — launched blind it can only produce an empty template. Each is a separate read-only sub-agent dispatch (per [_subagents.md](../_subagents.md)). Do not proceed to synthesis until all three complete.

Charters, effort tier, and return shapes for the three sub-agents are in [intake/investigate/_research.md](investigate/_research.md).

# Step 3 — Synthesize and write `01-investigate.md`

Merge findings from the three sub-agents. **Do not invent options the agents did not surface; do not silently drop options that survived the agents' filtering.** If sub-agent 2 returned only one option and `options_considered_and_rejected` shows nothing was rejected, that's a tripwire — surface it.

**Constraint cross-check:** before writing, verify every surviving option against sub-agent 1's `architectural_constraints` and `integration_boundaries` — start from sub-agent 3's `constraint_collisions` and add any collision it missed. A collision does not drop the option: set or extend that option's `requires_architecture_violation` and add the collision to its top risks, with the `file:line` evidence from the map. If every option collides, that is the `architecture-blocking` tripwire. Extend the same check to the **user's stated constraints** from Step 1 question 3: start from sub-agent 3's `honors_stated_constraints`, correct it where the map contradicts it, and add any violation to that option's top risks — a violating option loses ties in the presentation-cap selection but is not dropped (the user may relax a constraint once they see the price of keeping it).

**Select for presentation (cap = 3 full cards):** if more than 3 viable options survived, pick the 3 that maximize spread across mechanism, effort, and risk profile (preferring options that honor the user's constraints) for full option sections. Demote the surplus to compressed entries under "Demoted by presentation cap" in the rejected section — `<label> — <mechanism, one phrase> — effort:<X> — <why it lost the differentiation cut>` — taking the effort value from sub-agent 3's cards. Demotion by cap is NOT rejection on merit: fire the `option-space-truncated` tripwire so the reader knows the option space was wider than the full cards.

**`01-investigate.md` frontmatter:**
```yaml
---
schema: sdlc/v1
type: investigate
slug: <slug>
workflow-type: investigate
problem-statement: <one-line problem, exact>
option-count: <N: total distinct viable options found>
presented-count: <min(N, 3)>
option-ids: [A, B, C, …]   # all found; the first `presented-count` are full cards
constraints: [<from-question-3>]
recommended-next: user-picks   # this command never picks
status: ready-for-routing
created-at: <real UTC timestamp per _timestamp.md>
---
```

Write the body per [intake/investigate/_artifact.md](investigate/_artifact.md): the story section, then sections 1–6 (problem, architecture map, option cards, side-by-side comparison with the status-quo column, routing table, tripwires).

## Step — Write free narrative fragments

Author free narrative fragments for this artifact as described in the narrative-fragment tier of `_intake-context.md` — `<stem>.<NN-label>.html.fragment` siblings of unrestricted raw HTML, as many as the story needs, ordered with an `NN-` prefix, rendered raw-inline below the page.

# Step 4 — Write `00-index.md`

```yaml
---
schema: sdlc/v1
type: workflow-index
slug: <slug>
title: "Investigate: <one-line problem>"
workflow-type: investigate
current-stage: routing
status: ready
branch-strategy: none
branch: <current-branch>
base-branch: <current-branch>
next-command: user-picks
next-invocation: "user-picks — record via /wf intake investigate <slug> <option>; see 01-investigate.md section 5"
option-count: <N: total distinct viable options found>
presented-count: <min(N, 3)>
option-labels: [<A label>, <B label>, <C label>]   # full-card options only
demoted-labels: []   # labels demoted by the presentation cap; empty if none
open-questions: []
augmentations: []
progress:
  investigate: complete
created-at: <timestamp>
updated-at: <timestamp>
---
```

Body: one-line description of the problem + pointer to `01-investigate.md` and the option labels.

The workflow stays open until the user picks. The pick (`# Pick — decision closure` below, or the
implicit pick in `_intake-provenance.md`) later flips this index to `closed` with
`chosen-option` provenance and `superseded-by` pointing at the successor workflow.

# Step 5 — Hand off to user

Return per [_chat-return.md](../_chat-return.md) — narrative lead (what was found, built, or measured, and what it means for the user), then the structured anchors below.

Emit a compact chat summary:

```
wf-investigate complete: <slug>
Problem: <one-line problem>
Options found: <N> (<presented-count> full cards)
  A — <label> — effort:<X> radius:<Y> reversibility:<Z>
  B — <label> — effort:<X> radius:<Y> reversibility:<Z>
  C — <label> — effort:<X> radius:<Y> reversibility:<Z>   # if present
  Demoted by cap: <N−3> — see "Options considered and rejected"   # only if option-space-truncated fired
Cross-option observation: <one line from section 4>
Tripwires: <none | comma-separated list>
Next: pick an option — record it via /wf intake investigate <slug> <option> [reason],
      then route per section 5 (the routed invocation carries `from <slug>`)
Artifact: .ai/workflows/<slug>/01-investigate.md
```

If `single-viable-option` tripped, prefix with:

> ⓘ Only one viable option found. There isn't really a choice here — the next step is to execute the single option.

If `architecture-blocking` tripped, prefix with:

> ⚠ All sketched options require an architecture violation. The right next step is probably a design pass, not picking from these options. See artifact for details.

# Pick — decision closure

Runs only from Step 0 pick mode (`/wf intake investigate <slug> <option-id-or-label> [one-line reason]`).
The pick is the workflow's terminus: it records the decision and closes the workflow. It never
starts the successor — it prints the invocation and stops.

1. **Stamp the artifact.** Add to `01-investigate.md` frontmatter: `chosen-option: <id> — <label>`;
   `chosen-at:` set to the real UTC timestamp (per [_timestamp.md](../_timestamp.md)); and
   `decision-note: <the trailing prose>` if the user supplied any (omit the key otherwise).
2. **Append a `## Decision` section** to the artifact body: which option was picked; why (the
   user's reason exactly, else "user picked without a stated reason"); which tripwires were live
   at pick time (from section 6, or "none").
3. **Close the workflow.** Update `00-index.md`: `status: closed`, `close-reason: option-picked`,
   `superseded-by: pending`, `closed-at: <timestamp>`, `next-command: none`,
   `next-invocation: "none — decision recorded"`. Update the slug's row in `.ai/workflows/INDEX.md`
   to `closed`. `superseded-by: pending` is corrected to the successor slug by the downstream
   mode's link-back (`_intake-provenance.md`); updating that one field on a closed index is
   additive and safe.
4. **Print the next invocation** with provenance, per the effort routing in artifact section 5 —
   `/wf intake fix "<label> — <one-line mechanism>" from <slug>` (small) or
   `/wf intake "<label> — <one-line mechanism>" from <slug>` (medium+) — and stop. Do not run it.

A `discover` compressed slice landing on this slug (section 5's escalation ladder) is NOT a pick
and re-opens nothing: it is drill-down on a still-open decision, and its answer stays in the
slice — no option-card write-back.

# What this command is NOT

- **Not a chooser** — this command sketches options; the user picks. Recording the pick (`# Pick — decision closure`) is bookkeeping so the decision has provenance, not choosing. If you want a single recommended approach with acceptance criteria, that is `/wf shape <slug>` after `/wf intake`.
- **Not a problem validator** — this command assumes the problem is real and worth solving. If you're not sure whether the problem is genuine, that requires runtime data, telemetry, or user signal that this command doesn't gather. Run a measurement step first.
- **Not a diagnostician** — if there is a specific symptom (error, crash, slow request) and you want to know *why*, that is `/wf intake rca <symptom>`. Investigate proposes *how to solve*; rca finds *why it's broken*.
- **Not an explainer** — if you want to understand how the area works before forming options yourself, that is `/wf recap <slug> <focus>` or a plain research conversation outside `/wf`. Investigate already does a light architecture map, but it is in service of options, not as a standalone explanation.
- **Not a substitute for `/wf shape`** — `/wf shape` produces a chosen design with acceptance criteria, attached to a workflow. `investigate` produces an option set with no chosen winner, attached to nothing yet. After you pick, `/wf intake` → `/wf shape` deepens the chosen option into an implementable spec.
