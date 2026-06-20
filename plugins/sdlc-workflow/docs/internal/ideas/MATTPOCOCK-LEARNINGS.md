# Learnings from `mattpocock-skills` for sdlc-workflow

A report on what is transferable from the `mattpocock-skills` plugin
(`.scratch/mattpocock-skills/`) into this `sdlc-workflow` plugin, based on
a complete read of the 12 published skills and a comparative read of the
relevant `wf-*` commands.

## Source plugin in one paragraph

`mattpocock-skills` is a small, deliberately un-opinionated plugin: 12
skills across two buckets (`engineering/`, `productivity/`), distributed
via `npx skills@latest add mattpocock/skills`. Its design philosophy is
the opposite of sdlc-workflow's — small composable skills that any model
can fork, rather than a strict artifact pipeline. Its README explicitly
contrasts itself with GSD/BMAD/Spec-Kit. Three skills (`misc/`,
`personal/`, `deprecated/`) live on disk but are not registered in
`plugin.json` — a deliberate selective-publishing pattern.

## Methodology

- Read all 12 published `SKILL.md` files end-to-end.
- Read `wf-shape.md`, `wf-rca.md`, `wf-verify.md`, `wf-retro.md`,
  `wf-implement.md` (partial) for comparison.
- Discarded ideas that already exist in sdlc-workflow under a different
  name (interview-first, vertical slicing, parallel sub-agent dispatch).
- Attached every recommendation to a specific file in this plugin so the
  change surface is unambiguous.

## What sdlc-workflow already has

For honesty and to prevent re-importing existing capabilities:

| mattpocock skill                 | sdlc-workflow equivalent                          |
| -------------------------------- | ------------------------------------------------- |
| `grill-me`                       | `wf-shape` interview via `AskUserQuestion`        |
| `grill-with-docs` (interview)    | `wf-shape` + `po-answers.md`                      |
| `to-issues`                      | `wf-slice` (vertical slicing is core)             |
| `to-prd`                         | `wf-shape` + `wf-handoff`                         |
| `triage` (state machine)         | `wf-intake` + `wf-skip` + `wf-close`              |
| `zoom-out`                       | `wf-how` "explain" mode                           |
| `improve-codebase-architecture`  | `wf-refactor` (overlap, see Tier 2 #6)            |
| Parallel sub-agent dispatch      | `wf-review`, `wf-rca`, `wf-plan`                  |
| Vertical slices / tracer bullets | `wf-slice`                                        |

These are convergent design decisions, not transferable content.

---

# Section A — Three meta-patterns worth importing

These operate at the *architecture* level, not inside any one command.

## A.1 — `CONTEXT.md` as a persistent domain glossary

**Source**: `grill-with-docs/SKILL.md:24-50`,
`improve-codebase-architecture/SKILL.md:11-30`.

**Gap**: sdlc-workflow has *workflow-scoped* artifacts
(`01-intake.md` → `10-retro.md`) but no *repo-scoped* shared vocabulary.
Every new workflow re-discovers terminology from scratch via Explore
sub-agents. Across many workflows, the same domain term gets named
three different ways in three different `02-shape.md` files. Token
spend on rediscovery is significant.

**Proposed change**:

1. Define an optional `CONTEXT.md` (or `CONTEXT-MAP.md` for multi-context
   repos) at the consuming repo's root.
2. `wf-shape` Step 0 reads it if present and writes new domain terms back
   to it inline as they crystallize during the interview (same
   "update on resolution, don't batch" rule from
   `grill-with-docs/SKILL.md:72-76`).
3. `wf-plan`, `wf-implement`, `wf-rca`, `wf-refactor` Step 0 read it for
   vocabulary alignment in their generated artifacts.

**Cost**: small — a Step 0 read + a writer in `wf-shape`.
**Benefit**: consistent vocabulary across workflows, smaller `02-shape.md`,
faster Explore sub-agent runs because the agent enters with vocabulary
loaded.

## A.2 — ADRs as a first-class artifact class with a strict admission filter

**Source**: `grill-with-docs/SKILL.md:80-86` — the three-criteria filter:
ADRs are written **only** when the decision is (a) hard to reverse,
(b) surprising without context, (c) the result of a real trade-off.

**Gap**: Look at v8.27/v8.28/v8.29/v8.30 in `plugin.json` `description`
— those are *architectural decisions* about the design subsystem
("collapsed 14 standalone design-* skills into one dispatcher";
"augmentations register and write design-notes/<sub>-<timestamp>.md").
They live in CHANGELOG prose. Six months from now, when something feels
weird about how design-notes glue into wf-implement, the *why* will be
hard to recover.

**Proposed change**:

1. Adopt a `docs/adr/NNNN-<slug>.md` convention in consuming repos and in
   this plugin itself.
2. `wf-retro` Step N adds: "Did this workflow surface a decision meeting
   all three of (hard-to-reverse, surprising-without-context, real
   trade-off)? If yes, draft an ADR." The three-criteria filter is the
   load-bearing part; without it, ADRs become a dumping ground.
3. `wf-shape`, `wf-plan` Step 0 read `docs/adr/*` so they don't
   re-litigate decided-and-recorded questions.

**Cost**: small — a checkpoint at retro + a read at shape/plan.
**Benefit**: prevents architectural decisions from evaporating into
CHANGELOG prose. Specifically helpful for sdlc-workflow's own internal
evolution.

## A.3 — Hard-vs-soft dependency split for setup commands

**Source**: `mattpocock-skills/docs/adr/0001-explicit-setup-pointer-only-for-hard-dependencies.md`.

**Gap**: sdlc-workflow has setup-flavored commands (`setup-wide-logging`,
`wf-profile`) and per-repo config implications scattered across many
commands. The contract is implicit — users don't know which `wf-*`
commands strictly require setup vs. which degrade gracefully.

**Proposed change**:

For each `wf-*` command that uses per-repo config, declare it as **hard**
or **soft** dependency:

- **Hard** (publishes to external trackers, applies specific labels,
  needs branch/PR conventions): emit an explicit
  "run `/setup-X` first" pointer.
- **Soft** (uses config to sharpen output, degrades to fuzzy without it):
  reference config in vague prose only — don't cargo-cult the setup
  pointer.

**Cost**: ten-line ADR + audit pass through commands.
**Benefit**: prevents commands like `wf-rca` (read-only diagnosis,
zero per-repo dependency) from gaining unnecessary "run setup first"
preambles as the plugin grows.

---

# Section B — Ten command-level improvements

These are *prompt deltas* inside existing `commands/*.md` files. None
require new commands.

## Tier 1 — biggest leverage, smallest cost

### B.1 — Add a feedback-loop step to `wf-rca` before parallel investigation

**Source**: `diagnose/SKILL.md:12-51`, Phase 1 — declared "**the** skill;
everything else is mechanical."

**Gap in `wf-rca`** (`commands/wf-rca.md`): Step 1 (symptom intake) →
Step 2 (3 parallel investigation sub-agents) → Step 3 (synthesis).
Nothing establishes a reproducible pass/fail signal. The
"Suggested fix shape" gets handed to `wf-plan` / `wf-quick` / `wf-hotfix`
without any guarantee that the eventual fix can be *verified* against
the actual symptom rather than masking it.

**Proposed insertion** as Step 1.5, between current Step 1 and Step 2:

> **Step 1.5 — Construct a feedback loop (read-only).**
> Before investigating *why*, establish *how you'll know it's actually
> fixed*. Try in this order — stop at the first that gives a fast
> deterministic pass/fail signal:
>
> 1. Failing test at the seam reaching the bug
> 2. `curl`/HTTP script against a running dev server
> 3. CLI invocation diffing stdout against known-good
> 4. Headless browser script (Playwright/Puppeteer)
> 5. Replay a captured trace (HAR, payload, event log)
> 6. Throwaway harness — minimal subset exercising the path
> 7. Property/fuzz loop (1000 random inputs)
> 8. Bisection harness (`git bisect run`)
> 9. Differential loop (old vs new version output diff)
> 10. HITL bash loop — last resort
>
> Record the chosen loop in `01-rca.md` under `## Reproduction loop`.
> If you genuinely cannot construct one, stop and ask the user for
> environment access, captured artifact, or permission to add temporary
> instrumentation. **Do not proceed to investigation without a loop or
> an explicit "no loop possible" finding.**

**Downstream benefit**: the loop is captured in `01-rca.md` and consumed
by `wf-implement`'s TDD discipline as a regression-test target.

### B.2 — Add 3-falsifiable-hypotheses checkpoint to `wf-rca`

**Source**: `diagnose/SKILL.md:65-75`.

**Gap in `wf-rca`**: the three sub-agents return a single
`most_likely_mechanism` each plus `confidence`. There's no enumeration
of *competing* hypotheses, no falsifiability requirement, no
checkpoint with the user before synthesis collapses to one cause.

**Proposed insertion** as Step 2.5, after sub-agent results return:

> **Step 2.5 — Hypothesis re-rank with user.**
> Synthesize 3-5 distinct hypotheses across the sub-agent findings.
> Each must be **falsifiable** in the form: "If <X> is the cause, then
> <changing Y> makes the bug disappear / <changing Z> makes it worse."
> Discard hypotheses you can't state this way — they're vibes, not
> hypotheses.
>
> Present the ranked list in chat (use `AskUserQuestion`). The user
> often re-ranks instantly based on knowledge you don't have ("we just
> deployed a change to #3"). Then run the top-ranked hypothesis against
> the Step 1.5 feedback loop. If falsified, move to #2.
>
> **Do not proceed to synthesis on a single anchored hypothesis.**

**Why this matters**: anchoring on the first plausible cause is the
dominant failure mode of static-reasoning RCA. This is the highest-value
behavioral nudge in mattpocock's whole repo.

### B.3 — Make `wf-verify` and `wf-retro` recognize "no correct seam" as a finding

**Source**: `diagnose/SKILL.md:91-97` — "If no correct seam exists, that
itself is the finding. Note it. The codebase architecture is preventing
the bug from being locked down."

**Gap in `wf-verify`** (`commands/wf-verify.md:60-73`): unverifiable
acceptance criteria are treated as a verification *failure* and routed
back to `wf-implement`. But sometimes an AC is unverifiable *because the
architecture has no seam where it can be tested* — bouncing back to
`wf-implement` won't help; it needs `wf-refactor`.

**Proposed change to `wf-verify.md`**: in verification-results
aggregation, add a finding-class:

> **Class — "No correct seam" finding**: An acceptance criterion or
> augmentation re-check that cannot be verified at any current seam in
> the codebase. Record as `architectural-friction: <description>` in
> `06-verify-<slice>.md` frontmatter. Do not route to `wf-implement` for
> these — route to `wf-refactor` with the friction logged, *then*
> re-verify. False seams give false confidence.

**Mirror change in `wf-retro.md`**: Analysis sub-agent 1 already counts
"acceptance criteria couldn't be verified — why?" but doesn't separate
"architectural friction" from "test was lazy". Add the dimension:

> Of unverifiable ACs, classify each as: (a) test author didn't try
> hard enough, (b) the seam exists but wasn't used, or (c) **no correct
> seam exists** — flag (c) as a candidate for a `wf-refactor`
> follow-up workflow and link it in `## Recommended follow-ups`.

## Tier 2 — clear wins, simple to add

### B.4 — Tagged DEBUG-log hygiene in `wf-implement`

**Source**: `diagnose/SKILL.md:84-87` — `[DEBUG-a4f2]` prefix; cleanup
is a single grep. Untagged logs survive; tagged logs die.

**Attachment**: `commands/wf-implement.md` — add to implementation
discipline preamble:

> Any temporary diagnostic logging added during implementation MUST use a
> per-slice unique prefix, e.g. `[DEBUG-<slice-slug>]`. Cleanup before
> commit is a single grep. Untagged logs are presumed permanent;
> tagged logs are presumed temporary.

**Pair with `wf-verify`**: grep for `[DEBUG-<slice-slug>]` and *fail
verification* if any remain. Free architectural property.

### B.5 — Module-checkpoint dialog in `wf-shape` (or `wf-plan`)

**Source**: `to-prd/SKILL.md:14-19`.

**Gap**: `wf-shape` (`commands/wf-shape.md:36-58`) interviews on
requirements and edge cases but doesn't enumerate the module surface
and ask "do these match your mental model?"

**Proposed sub-step**:

> List the modules you intend to build or modify with one-sentence
> purpose statements. Mark each as *deep* (hides nontrivial behavior
> behind a small stable interface) or *shallow* (interface complexity ≈
> implementation complexity). Ask the user via `AskUserQuestion`: do
> these modules match your mental model? Which need test coverage?

Cheapest upfront alignment gate available — catches misalignment before
plan/implement cycles burn time.

### B.6 — "Deepening opportunities" vocabulary for `wf-refactor`

**Source**: `improve-codebase-architecture/SKILL.md:11-30`.

The discriminating vocabulary: **Module / Interface / Implementation /
Depth / Seam / Adapter / Leverage / Locality**, plus two filters:

- **Deletion test**: "Imagine deleting the module. If complexity
  vanishes, it was a pass-through. If complexity reappears across N
  callers, it was earning its keep."
- **Two-adapter rule**: "One adapter = hypothetical seam. Two adapters
  = real seam." Prevents speculative interfaces for hypothetical future
  adapters that never materialize.

**Proposed change to `wf-refactor`**: add a `## Refactor admission
filter` section that requires candidates to pass both filters before
proceeding. Reject candidates that fail either.

### B.7 — `.ai/out-of-scope/` knowledge base

**Source**: `triage/SKILL.md:75-76` and the referenced `OUT-OF-SCOPE.md`.

**Gap**: `wf-discover`, `wf-investigate`, `wf-ideate` generate candidate
ideas. Some get rejected mid-workflow. They evaporate when the workflow
closes. The next discovery run six weeks later may surface and
re-litigate the same idea.

**Attachment**: introduce a `.ai/out-of-scope/<slug>.md` convention,
written by `wf-close` / `wf-skip` when the close reason includes a
rejected scope. Read by `wf-discover` / `wf-ideate` Step 0 to surface
"we previously rejected this for reason X — still valid?"

## Tier 3 — small surgical improvements

### B.8 — `to-issues` "publish in dependency order" rule

**Source**: `to-issues/SKILL.md:55`.

**Attachment**: if `wf-slice` ever files slices as GitHub issues, adopt
the rule "publish blockers first so the `Blocked by` field can reference
real IDs." Tiny rule, prevents "blocked by TBD" placeholders.

### B.9 — `tdd`'s named "horizontal slicing" anti-pattern in `wf-implement`

**Source**: `tdd/SKILL.md:18-41` — visual diagram of WRONG vs RIGHT,
with the named anti-pattern.

**Gap**: `wf-implement` enforces vertical slicing *across* features (via
`wf-slice`) but not vertical slicing *within* a slice's implementation.

**Attachment**: a single mention in `wf-implement.md`:

> Within this slice, do test1→impl1, test2→impl2. Do not write all
> tests then all code (the "horizontal slicing" anti-pattern) — tests
> written in bulk test imagined behavior, not actual behavior.

### B.10 — `caveman` as a `--terse` modifier on read-mostly commands

**Source**: `caveman/SKILL.md`.

**Attachment**: a `--terse` flag on `wf-status`, `wf-resume`, `wf-next`,
`wf-how quick` — read-mostly commands where verbose conversational
output adds little. Artifacts stay precise (machine-readable contracts
demand it); only the chat surface changes.

**Critical exclusion**: do NOT apply to commands that produce
external-facing output (`wf-handoff`, `wf-ship`, `wf-announce`). The
External Output Boundary preamble is load-bearing in those commands;
caveman would risk dropping safety language. mattpocock's caveman has
an "Auto-Clarity Exception" for exactly this case
(`caveman/SKILL.md:37-50`).

---

# Section C — What was deliberately skipped

| Item                                          | Reason                                                                  |
| --------------------------------------------- | ----------------------------------------------------------------------- |
| Import `grill-me` / `grill-with-docs` as commands | `wf-shape` already runs interviews via `AskUserQuestion`              |
| Import `zoom-out` as a command                | `wf-how` "explain" mode covers it                                       |
| Import full `triage` state machine            | `wf-intake` / `wf-skip` / `wf-close` already cover lifecycle (only the `.out-of-scope/` idea transfers — B.7) |
| Selective publishing buckets (`personal/`, `deprecated/`) | sdlc-workflow doesn't yet have the size pain that justifies hidden buckets |
| `setup-matt-pocock-skills` file structure     | Would conflict with existing `wf-profile` / `setup-wide-logging` setup story |
| The "small composable, fork-and-modify" philosophy | Opposite to sdlc-workflow's strict pipeline value; importing it would dilute the discipline |

---

# Section D — Suggested execution order

If implementing some-but-not-all, sequence by leverage/cost ratio:

1. **B.1** — feedback loop in `wf-rca` (biggest quality leap; one new step in one command)
2. **B.2** — 3 falsifiable hypotheses in `wf-rca` (pairs with B.1; prevents anchoring)
3. **B.4** — tagged DEBUG logs in `wf-implement` + `wf-verify` (5-line prompt addition; verify becomes free quality gate)
4. **B.3** — "no correct seam = finding" in `wf-verify` + `wf-retro` (pairs the architectural framing with verify/retro)
5. **B.5** — module checkpoint in `wf-shape` (cheapest upfront alignment gate)
6. **A.1** — `CONTEXT.md` as persistent glossary (highest-leverage meta-pattern; affects many commands)
7. **A.2** — ADRs with three-criteria filter (compounds with A.1)
8. **B.6** — depth/leverage vocabulary in `wf-refactor`
9. **B.7** — `.ai/out-of-scope/` knowledge base
10. **A.3** — hard-vs-soft setup ADR (cleanup pass; do after the rest land)
11. **B.9** — horizontal-slicing warning in `wf-implement` (one-liner)
12. **B.8** — dependency-order publishing rule (one-liner if applicable)
13. **B.10** — `--terse` flag on read-mostly commands (lowest-priority polish)

Items 1-5 together are a meaningful version bump (think v8.31 territory)
and don't require any new commands — only prompt deltas inside existing
files.

---

# Appendix — File map of source skills

| Skill                          | Bucket       | Published | Key idea borrowed                                     |
| ------------------------------ | ------------ | --------- | ----------------------------------------------------- |
| `diagnose`                     | engineering  | yes       | Phase 1 feedback loop; ranked hypotheses; tagged logs (B.1, B.2, B.3, B.4) |
| `grill-with-docs`              | engineering  | yes       | `CONTEXT.md` + ADR three-criteria filter (A.1, A.2)   |
| `triage`                       | engineering  | yes       | `.out-of-scope/` knowledge base (B.7)                 |
| `improve-codebase-architecture`| engineering  | yes       | Depth/leverage vocabulary; deletion test; two-adapter rule (B.6) |
| `setup-matt-pocock-skills`     | engineering  | yes       | Hard-vs-soft setup pattern (A.3 — pattern only)       |
| `tdd`                          | engineering  | yes       | Horizontal slicing anti-pattern (B.9)                 |
| `to-issues`                    | engineering  | yes       | Dependency-order publishing (B.8)                     |
| `to-prd`                       | engineering  | yes       | Module-checkpoint dialog (B.5)                        |
| `zoom-out`                     | engineering  | yes       | (skipped — covered by `wf-how`)                       |
| `caveman`                      | productivity | yes       | `--terse` modifier (B.10)                             |
| `grill-me`                     | productivity | yes       | (skipped — covered by `wf-shape`)                     |
| `write-a-skill`                | productivity | yes       | Description format guidance (note for skill authors)  |
