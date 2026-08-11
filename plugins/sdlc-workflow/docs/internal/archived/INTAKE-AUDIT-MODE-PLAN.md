# `/wf intake audit` — the defect-hunting audit mode — Implementation Plan

> **ARCHIVED 2026-08-08 — SUPERSEDED.** Merged into
> [`../WORK-WITHOUT-A-HOME-PLAN.md`](../WORK-WITHOUT-A-HOME-PLAN.md), which is the only live plan
> for this capability. **Do not build from this file.** Its Appendix C lists every claim here that
> was found wrong or stale when verified against v9.144.0 — including the overview artifact type, the lead's view directory, and the schema-enum blocking claim.

> Status: **PROPOSED** (drafted 2026-07-30, against v9.144.0).
> Provenance: a routing failure observed in conversation. A user asked how to review an existing
> subsystem — "all paint-ordering code, GPU and CPU" — for bugs, wrong assumptions, and mistakes.
> Every candidate surface refused it for a *different* reason, and the least-wrong answer
> (`/wf review sweep pre-merge <paths>`) throws its findings away when the session ends.
> Scope: additive, and deliberately small. One intake mode, one `workflow-type` enum value, one
> `_paths.mjs` line, one extracted shared reference. **No new key, no new artifact `type:`, no new
> renderer, no house-rule exception.**

## The one-paragraph version

`audit` is a **read-only terminal intake mode** that hunts unknown defects across a named
subsystem, using review's existing 35 dimension rubrics as lenses and review's existing
accumulating findings ledger as its artifact. It creates the slug that the ledger needs a home in,
scopes by *subsystem* rather than by diff, refutes each candidate finding before it lands, routes
every survivor to its sanctioned fixer, and never edits code. It is `ship-plan audit`'s shape
aimed at a code subsystem instead of at the release pipeline.

---

## The house-rule decision (read this first)

The inherited house rule is [*"no new skills, no new top-level `/wf` keys. The surface stays at 20
keys"*](INTENT-FIDELITY-HARDENING-PLAN.md:11), already excepted twice — `observability` took the
21st, and [WF-TASK-KEY-PLAN.md](WF-TASK-KEY-PLAN.md:20) proposes `task` as the 22nd.

**This plan needs no exception.** It adds an intake mode, and the surface stays at 21 keys. That
matters beyond bookkeeping: the entire W5 doc-site sweep and W1.1 eleven-site SKILL.md sweep that
dominate the `task` plan's cost exist *because* it adds a key. A mode pays neither.

### Correcting the taxonomy test the `task` plan relies on

The `task` plan argues for a new key partly on this claim:

> "**It is not an intake mode.** Every intake mode is a *compressed standard lifecycle*… the mode
> authors the planning half, then routes into the standard execution chain."

That is not true of intake as a whole, and the shared contract says so itself. The relevant section
of [`_intake-context.md`](../../skills/wf/reference/intake/_intake-context.md) is headed
**"Compressed-lifecycle change-modes (fix / hotfix / refactor / update-deps)"** — it scopes the
promise to four named modes. Three other modes are something else entirely:

| Mode | Lead | Routes into execution chain? |
|---|---|---|
| `investigate` | `01-investigate.md` + `00-index.md`, no branch | No — [*"terminal → user picks"*](../../skills/wf/reference/intake.md:186); writes **no** `02-shape.md` |
| `discover` | `01-discover.md` + `00-index.md`, no branch | No — [*"terminal → verdict-dependent"*](../../skills/wf/reference/intake.md:187); Next column is literally *"verdict (no required next command)"* |
| `ideate` | `01-ideate.md` on a `type: workflow-index` slug | No — [*"terminal → user picks"*](../../skills/wf/reference/intake.md:191) |

So **the read-only terminal mode is an established pattern with three members**, a `_paths.mjs`
lane each, a shared `yolo` refusal class, and a `review/_stage.md` prerequisite arm. `audit` joins
as the fourth. This does not weaken the case for `task` — a task *does* work and reaches outside
the repo, which no read-only mode does — but it does remove the argument that intake cannot host a
terminal operation.

---

## The gap this fills

Five surfaces are adjacent to "audit this subsystem for defects." Every one refuses, and the
reasons are all different — which is the signature of a real hole rather than a missing alias.

| Surface | Why it refuses |
|---|---|
| `intake rca` | Pipeline starts at `1·symptom`; it consumes [*"an error description, stack trace"*](../../skills/wf/reference/intake/rca.md:22). An audit has **no symptom** — that is what it is looking for |
| `intake discover` | Adjudicates a *stated hypothesis* to `holds`/`fails`, and its own description says it [*"does NOT diagnose bugs"*](../../skills/wf/reference/intake/discover.md:2). An audit has no hypothesis |
| `intake investigate` | Sketches solution options and [*"does NOT diagnose bugs"*](../../skills/wf/reference/intake/investigate.md:2); it *assumes the user already decided* the problem is real |
| `probe` | Runtime-truth comparison against **AC text**. An un-shaped subsystem has no ACs to compare to |
| `review` ad-hoc | Actually finds unknown defects — and then discards them. [*"Ad-hoc runs write **no** `07-review*` artifact — findings return inline"*](../../skills/wf/reference/review.md:51) |
| `review <slug>` stage | Has the ledger, but Step 5 ends *"In all modes, an implement record (slice or master) must exist. If missing → STOP"*, and its diff basis is `git diff <base-branch>...HEAD` — a **change**, not a subsystem |
| `task` (proposed) | Tripwire D8 routes read-only investigation to `discover`/`investigate` — both of which refuse it. **The `task` plan routes this work into a dead end** |

### The cost of the gap is evidence, not ceremony

Borrowing the `task` plan's framing, which is the right one: work that runs outside `/wf` produces
no artifact saying what was intended, what was found, and how anyone knows. Ad-hoc review is
*inside* `/wf` and still produces none.

Concretely, for a multi-session subsystem audit that means: you re-run it next week, re-surface the
same twelve findings, re-triage them from scratch, and **cannot distinguish what you deliberately
deferred from what you never saw.** The accumulating-ledger machinery in
[`review/_stage.md`](../../skills/wf/reference/review/_stage.md:22) exists precisely to prevent
that — *"preserve prior IDs and `surfaced-at` stamps, and mark findings a re-run of a dimension no
longer surfaces as `resolved`"* — and it is unreachable for read-only work because it is welded to
slug mode, which demands an implement record.

**The gap is not routing. The gap is that the ledger has no read-only door.** Two earlier proposals
in the originating conversation — a comma-separated dimension list on `sweep`, and a
`path-parity` dimension — were both rejected for optimizing dispatch when the missing thing is
persistence. They are recorded in § Considered and rejected so they are not re-proposed.

---

## Design decisions

### D1 — Placement: a read-only terminal intake mode

`/wf intake audit <concern> [paths…]`. Fourth member of the `investigate` / `discover` / `ideate`
pattern: creates a slug workflow, writes its lead, routes nowhere, changes nothing.

Rejected placements, recorded so they are not revisited:

- **A `review` sub-mode** (`/wf review audit <paths>`). Tempting — it is review's ledger. But
  review has no workflow-creation machinery: no slug derivation, no collision prompt, no
  `INDEX.md` bootstrap, no `00-index.md` authorship. All four live in `intake`
  ([`_intake-context.md`](../../skills/wf/reference/intake/_intake-context.md) § Workflow registry
  & slug semantics). And `review.md` Step 00 already carries a four-branch first-token resolution
  that the file itself calls out as the reason review is *excluded* from the dispatcher's Step 0.5
  fuzzy-suggest. Adding a fifth branch to the most overloaded resolver on the surface, to obtain
  machinery that exists one key over, is the wrong trade.
- **A new top-level key.** Costs the house-rule exception plus everything in § The house-rule
  decision, and buys nothing a mode does not already get.
- **A project-level ledger with no slug** (`.ai/code-audit-<subsystem>.md`, the `ship-plan audit`
  and `probe sweep` shape). Cheapest of all, and genuinely viable — but it forfeits `/wf status`
  listing, `/wf close`, `/wf recap`, and slug-mode compressed slices. An audit that spans sessions
  is exactly the work that needs to be *findable*. See § Open questions Q1 for the case against
  this decision.

### D2 — Reuse review's artifact types wholesale (the blast-radius collapse)

This is the single most important scoping decision, and it is stronger than the equivalent in the
`task` plan. **No new artifact `type:`, and no new renderer.**

| Artifact | `type:` | Renderer | View path | Change needed |
|---|---|---|---|---|
| `00-index.md` | `workflow-index` | `workflow-index.mjs` | root | none — see D3 |
| `01-audit.md` | `intake` | `intake.mjs` | `audit/` | **one `_paths.mjs` line** |
| `07-review.md` | `review` | `review.mjs` | `review/` | none — `'07-review': ['review', null]` exists at [`_paths.mjs:66`](../../renderers/_paths.mjs) |
| `07-review-<lens>.md` | `review-command` | `review-dimension.mjs` | `review/` | none — `FLAT_REVIEW_RE = /^07-review-(.+)\.md$/` at [`_paths.mjs:20`](../../renderers/_paths.mjs) already resolves it |

The lead keeps `type: intake` while landing in its own `audit/` view dir, which is legal because
[`_paths.mjs`](../../renderers/_paths.mjs) states the two are independent: *"Renderer dispatch is by
frontmatter `type` → intake.mjs; view-path placement is by filename → here. Separate axes."* So the
lead reuses `intakeFrontmatter` and `intake.mjs` (as `01-fix.md` and `01-adopt.md` already do) while
sitting in the named directory every terminal analysis mode uses.

The per-lens findings page is the load-bearing reuse. `review-dimension.mjs` already imports
`verdictBlock`, `severityChip`, and `findingListItem` — **a rendered findings list with severity
chips and a verdict already exists**, keyed to a type the review command already emits. An audit
that emits those exact filenames renders correctly on the day the mode ships, with zero renderer
work, zero snapshot fixtures, and zero golden files.

**Why stage-7 filenames on a workflow with no stages 2–6.** Because four separate things key off
those exact names — the ledger merge rules, the sibling-`.yaml` open-only projection,
`resolveViewPath`'s two review regexes, and `review-dimension.mjs`'s dispatch. Choosing a prettier
`01-audit-<lens>.md` means re-implementing all four to gain a filename nobody reads. Reusing
standard numbered artifacts out of their organic order is established practice: `rca` synthesizes
`02-shape.md` it never interviewed for, and `adopt` reconstructs `05-implement.md` from a
working-tree diff without having run stages 1–4. `audit` reconstructs stage 7 without having run
stages 2–6. The rendered overview reads honestly: intake and review stations lit, the rest
`skipped`.

### D3 — `type: workflow-index`, not a ten-stage grid with seven holes

```
00-index.md (type: workflow-index)  →  01-audit.md (type: intake, view dir audit/)
     →  [scope gate]
     →  07-review.md + 07-review-<lens>.md ×N   (accumulating ledger)
```

The obvious design — a full `type: index` overview with seven of ten stages marked `skipped` — is
**wrong**, and [`workflow-index.mjs`](../../renderers/workflow-index.mjs) says why in its own header:

> *"These don't walk the 10-stage pipeline that index.mjs assumes… Rendering them through index.mjs
> produced a mostly-empty 10-stage grid, so they get their own renderer that surfaces the
> routing/progress model instead and links every sibling artifact."*

Seven skipped stages **is** a mostly-empty 10-stage grid. So `audit` uses `type: workflow-index`,
exactly as `investigate`, `discover`, and `ideate` do — [`intake.md:200`](../../skills/wf/reference/intake.md)
records that split, and the schema validates a `workflow-index` under
`quickMetaArtifactFrontmatter`, whose required set is only `["schema", "type", "slug"]` with a
free-form progress map. No heavy 22-field `indexFrontmatter`, and no `status: active`/`progress`
object to get wrong.

Consequence for the lead's view dir: every terminal analysis mode gets its **own named directory**
(`01-rca` → `rca/`, `01-investigate` → `investigate/`, `01-discover` → `discover/`, `01-ideate` →
`ideate/`) rather than the `intake/` landing the change-mode leads are forced into by the `type:
index` overview's fixed intake card. `audit` follows the terminal pattern: `01-audit` → `audit/`.
This is why W2.2's line goes in the terminal-analysis block of `_paths.mjs` and W7.1's assertion goes
in the terminal-analysis test — not the change-mode ones.

`01-audit.md` carries the whole brief inline — concern, resolved surface, selected lenses and why,
out-of-scope declarations, and the not-observable set. There is no `02-shape.md` and no
`04-plan.md`: for an audit, scoping and briefing are one motion, and inventing a shape would be
the "un-verifiable AC" failure the AC-verifiability work already cured elsewhere.

**Why the ledger keeps stage-7 filenames even on a non-pipeline workflow.** Not because stage 7 is
where it sits — there is no pipeline here — but because four separate mechanisms key off those exact
names (D2). `workflow-index.mjs` *"links every sibling artifact"* generically, so it surfaces them
without needing stage semantics. `review-scope: slug-wide` is still recorded on `00-index.md`, since
per-slice paths are meaningless without slices.

### D4 — The ledger is single-sourced, because CI will not permit anything else

`audit` cannot restate the accumulate/dedupe/resolve-sweep contract.
[`shared-reference-drift.test.mjs`](../../tests/unit/skills/shared-reference-drift.test.mjs) walks
both trees and hard-fails on a duplicated rule body — it is the guard that ended the EOB block's
drift into 21 divergent copies. So:

**Extract `reference/_findings-ledger.md`** as a new shared reference carrying the merge law that
today lives only in [`review/_stage.md`](../../skills/wf/reference/review/_stage.md) (the
`# ACCUMULATE — do not overwrite` block at L337–352, plus the resolve-sweep and `runs:`-append
rules at L14 and L76). Both `review/_stage.md` and `intake/audit.md` then **cite** it.

Register it in the test's `SHARED` array with a fingerprint and citation regex, exactly like the six
existing entries:

```js
{
  file: '_findings-ledger.md',
  fingerprint: 'absence means cleared',
  citation: /\[_findings-ledger\.md\]\(([^)]+)\)/,
},
```

Once registered the guard is automatic across both trees. This follows the v9.104.0 precedent that
produced `_fix-loop.md` / `_chat-return.md` / `_pr-ci-handoff.md` / `_additive-write.md`, and the
v9.141.0 precedent that produced `_control-file-ownership.md` — whose own registry comment states
the principle: rules read from several places *"get a single source and a guard from day one."*

**This extraction is a prerequisite, not a nicety.** Writing `audit.md` first and extracting later
means shipping a duplicated ledger body that the guard rejects.

### D5 — Scope resolution: two waves, because a subsystem is not a path

The originating failure. Ad-hoc review offers five scopes — `pr` / `worktree` / `diff` / `file` /
`repo` — and a subsystem is none of them. `repo` dilutes every reviewer; `file` is too narrow; and
"all paint-ordering code, GPU and CPU" cuts across directories that share no prefix.

So Step 1 is an explicit **enumerate-then-select** wave, the pattern the `investigate` restructure
already established (two-wave sub-agents, enumerate before choosing, no fixed quota):

1. **Wave 1 — enumerate.** Parallel sub-agents map the concern to a concrete file set by *different
   search modalities* (by entry point, by call graph, by naming convention, by test coverage), each
   blind to the others. Union the results.
2. **Present the surface for confirmation.** The resolved file set goes in `01-audit.md` and to the
   user before any lens runs. **This is the legibility requirement**: an audit whose scope was
   silently guessed cannot be trusted when it reports "no findings," because the reader cannot tell
   whether a file was clean or simply never read.
3. **Record what was excluded and why.** Vendored code, generated files, a path the user removed.
   An audit's silence must be attributable.

Any file the user names explicitly is in scope unconditionally — inference adds, never subtracts.

### D6 — Lens selection is inferred from the concern, and stated

The audit reads the concern in natural language and selects lenses from review's existing 35
rubrics under `reference/review/<key>.md`. It **owns no rubrics of its own** and adds no
dimension — the 35 stay canonical, and `audit` is a consumer.

Selection must be **legible and correctable**: `01-audit.md` and the chat return both state which
lenses were chosen and the one-line reason for each, before dispatch. Inference that cannot be
inspected is an opaque router, which is the failure the `_question-craft.md` legibility contract
exists to prevent.

Model tier per lens follows the rule already in
[`review.md:77`](../../skills/wf/reference/review.md) — `sonnet` for `architecture`,
`refactor-safety`, `security`; `haiku` otherwise; **passed explicitly**, never inherited from the
parent.

The user may override entirely: `/wf intake audit <concern> lenses=<a>,<b>` is honored verbatim
with no inference pass. (This is a *user-supplied override on a mode that otherwise infers*, not
the rejected free-form dimension list on `review` — see § Considered and rejected.)

### D7 — Adversarial refutation before a finding lands

Adopted wholesale from [`ship-plan/audit.md`](../../skills/wf/reference/ship-plan/audit.md:2),
which *"refutes each candidate finding before it lands, then merges survivors."*

Each candidate finding gets refuters prompted to **kill** it, defaulting to refuted when uncertain.
Survivors enter the ledger; refuted candidates are recorded in a `## Refuted` section with the
refutation, never silently dropped — a refuted candidate is evidence that the lens looked.

Refuter count scales with severity: BLOCKER/HIGH get three with *distinct* lenses (does it
reproduce · is the invariant real · is there a caller that prevents it); MED and below get one.
Perspective diversity beats redundancy when a finding can fail in more than one way.

This is a real difference from the review *stage*, which merges reviewer output without a
refutation wave. An audit produces claims about code nobody is currently changing, so a
plausible-but-wrong finding costs more than in review, where the author's own diff context catches
it.

### D8 — Terminal and route-don't-fix. No fix loop, ever

The review stage owns a triage→fix loop. `audit` owns **neither**. It classifies each surviving
finding and routes it:

| Finding shape | Route |
|---|---|
| Small, mechanical, root cause clear | `/wf intake fix <finding>` |
| Cause unclear, symptom now known | `/wf intake rca <finding>` |
| Needs restructuring; several approaches | `/wf intake investigate <problem>` |
| Genuine feature-sized work | `/wf intake <scope>` |
| **Needs runtime proof to confirm at all** | `/wf probe` — see D9 |

`audit.md` must **not** cite `_fix-loop.md`. Citing it is the tell that the mode drifted into being
a second review stage, and the shared-reference guard makes that citation visible in review.

### D9 — The runtime boundary: `needs-runtime-evidence`

An audit reads code. Some findings — most sharply, *"these two paths disagree"* — cannot be settled
statically at all. The idiom already exists in two places and `audit` adopts both:
`discover.md`'s escalation *"surface `needs-runtime-evidence` and list exactly what would resolve
it (a test run, a profile, a log line)"*, and `_surface-defects.md`'s § Decidability boundary with
its **"Refuse rather than under-report"** rule and standing not-observable set.

So a lens that reaches a static ceiling records the finding at `confidence: low` with
`needs-runtime-evidence` and **names the exact experiment** that would settle it, then routes to
`/wf probe`. It does **not** guess, and it does **not** quietly omit.

This is the honest home for the originating example. Whether the GPU and CPU paint paths actually
diverge is a runtime question; the audit's job is to identify that they *share a contract with no
parity test*, state what would prove divergence, and hand it to probe. A static reviewer asserting
divergence it never observed is precisely the plausible-but-wrong finding D7 exists to kill.

### D10 — Slug-mode: `/wf intake <slug> audit <concern>` attaches a compressed slice

`_compressed-slice.md` already generalizes across intake modes, `probe`, and `simplify`; `audit`
joins as another caller. First token an existing non-closed slug → one
`03-slice-audit-<descriptor>.md` (`slice-type: audit`, `origin: intake/audit`), no new workflow, no
branch, additive index updates only. This is the idiomatic answer to *"I'm mid-feature and want the
module I'm about to touch audited first."*

**Wrinkle to resolve in W3, not at runtime** (the same class of gap as the `task` plan's D7): a
compressed slice writes exactly one artifact, so a slice-mode audit has nowhere to put per-lens
ledger files. Decide in the contract, one of:

- **(a) Preferred** — the slice carries a single inline findings table, no per-lens files, no
  accumulation. Honest and simple: a slice-mode audit is a *one-shot* audit, and the artifact says
  so in its body.
- **(b)** Slice-mode audits are refused, routing the user to a standalone audit slug.

Do not leave this to the author's discretion. An accumulating ledger with no defined location is
worse than no ledger, because re-runs will invent divergent placements.

### D11 — `auto` and `yolo` drive nothing

`audit` joins yolo's existing fourth class verbatim — [*"Terminal-analysis, no decided build —
`investigate`, `discover`, `ideate`"*](../../skills/wf/reference/yolo.md:53). The class's own
reasoning covers `audit` exactly: the missing ingredient is a human decision about which findings
matter, *"exactly the intake+shape alignment `yolo` must not make."*

`auto.md` gets a pause-and-route arm mirroring the `update-deps` arm at
[`auto.md:60`](../../skills/wf/reference/auto.md). Neither driver ever routes an audit slug to
`/wf slice` or `/wf plan` — each accepted finding seeds its **own** new workflow, which is the same
rule the class already applies to `ideate`.

### D12 — Boundary tripwires (warn-and-continue, never refuse)

Standard idiom: record the breach, write a valid artifact, offer the escalation.

- Concern names a **specific symptom** ("checkout 500s on retry") → this is `rca`; offer to reroute.
- Concern is a **yes/no question** about the system → this is `discover`.
- Concern presumes the problem and wants **approaches** → this is `investigate`.
- Concern names **no surface at all** ("audit the codebase") → wave 1 cannot converge. Enumerate
  candidate subsystems and have the user pick one. **`audit` is not a whole-repo sweep**; that
  ambition is what `review sweep all` already serves badly and no lens set can serve well.
- Audit surfaces **zero** findings → that is a valid, useful result. Write the artifact with the
  resolved surface, the lenses run, and the not-observable set, so the *next* audit knows what was
  already covered. Never pad a clean result with nits to look productive.

---

## Work items

### Edit topology — what is "both trees" and what is not

The mirror is not a copy. `plugins/sdlc-workflow-codex` has `skills/`, `hooks/`, `references/`,
`tests/`, and `runtime/` — but **no `renderers/`, no `lib/`, no `dist/`**.

| Edit | Authored where | How it reaches Codex |
|---|---|---|
| `skills/wf/**` markdown | **Hand-edit both trees** | **`sync:codex` does not mirror `skills/` at all** — no script, no CI diff guard. The single most-missed step |
| `renderers/_paths.mjs`, `tests/frontmatter.schema.json` | Claude tree only | `npm run build` → `dist/` → `npm run sync:codex` → `runtime/dist/` (byte-for-byte) |
| Doc site | Claude tree only | Rides the codex sync payload — **regenerate/edit before `sync:codex`** |

Codex-specific constraints on the hand-mirror of `audit.md`:

- **`$wf intake audit`, never `/wf intake audit`** — enforced by
  `sdlc-workflow-codex/scripts/verify-claudisms.mjs`, which also blocks `AskUserQuestion`,
  Claude-tooling references, and Anthropic naming.
- Cite **`_gate-question.md`** for the D5 scope confirmation (the Claude version uses
  `AskUserQuestion`, unavailable there), **`_subagents.md`** for the wave-1 and lens fan-outs, and
  **`_timestamp.md`** in place of any inline `date -u`. All three exist in the Codex tree only.

### W1 — The shared ledger extraction (do this first)

| | |
|---|---|
| W1.1 | New `skills/wf/reference/_findings-ledger.md` (**both trees**) — the accumulate/dedupe/resolve-sweep/`runs:`-append law, lifted verbatim from `review/_stage.md` L337–352 + L14 + L76. Written host-neutral so both trees share one body |
| W1.2 | `review/_stage.md` (**both trees**) — replace the lifted body with a citation. Careful: `shared-reference-drift.test.mjs` L71–85 asserts specific headings still exist in `review.md` and `_stage.md` (`# TRIAGE MODE`, `# Step 0 — Orient`, `# Adaptive routing`). Do not disturb them |
| W1.3 | `tests/unit/skills/shared-reference-drift.test.mjs` — add the `SHARED` entry from D4. **Claude tree; the Codex tree has its own suite** — confirm which side owns this guard before assuming one edit covers both |
| W1.4 | Verify the extraction is behaviour-neutral for `review`: run the review-touching suites before writing a line of `audit.md`. A regression here breaks the shipped review stage, which is far more costly than a delayed mode |

### W2 — Schema, paths, lexicon

| | |
|---|---|
| W2.1 | `tests/frontmatter.schema.json:139–145` — add `"audit"` to the `workflow-type` enum (today: `feature, fix, quick, rca, investigate, rf, refactor, hotfix, dep-update, update-deps, docs, discover, standard, adopt`). **Correction to an inherited claim:** this is *not* a hard blocker on the D3 design. That strict enum lives on `indexFrontmatter`; a `type: workflow-index` index validates under `quickMetaArtifactFrontmatter`, which requires only `["schema", "type", "slug"]` and constrains no `workflow-type`. So the mode would write successfully without this edit. Do it anyway — it is the vocabulary `status.md`, `yolo` orientation, and `review/_stage.md` all read, and it is required the moment anything writes a `type: index` for an audit — but **verify the enum's actual reach before asserting a block**, which the `task` plan did not |
| W2.2 | `renderers/_paths.mjs` — `'01-audit': ['audit', null]`, in the **terminal-analysis block** at L47–56 beside `01-ideate`/`01-simplify`, *not* the change-mode block at L34–38 (D3). This map is an **explicit allowlist, not a fallback**; the file's own comment warns that without an entry `resolveViewPath` returns null and the orchestrator skips the artifact entirely — the lead is then never rendered and the overview has nothing to link to. **`dist/` rebuild trigger** |
| W2.3 | `lib/leak-lexicon.mjs` — add `audit` to `STAGE_NAMES` (L32–35) so the `01-audit.md` stem is recognized in artifact-filename detection. **`dist/` rebuild trigger.** **Fix the pre-existing drift while here** (independently real, verified at v9.144.0): `WF_KEYS` at L27–29 omits `observability`, and its comment still says *"The 20 live /wf keys"* — so `/wf observability` has never matched the leak guard. `STAGE_NAMES` separately omits `discover`, `ideate`, `adopt`, `probe`, `simplify`, and `update-deps`. Confirm each omission's blast radius before extending — the regex at L73 governs artifact-name detection, so a missing stem means those artifacts' filenames are not leak-checked |
| W2.4 | `skills/wf/reference/status.md:58` — add `audit` to the INDEX.md `workflow-type` column vocabulary. **Same drift note**: that list currently reads `compressed, fix, rca, investigate, discover, hotfix, update-deps, refactor, docs, standard` — it is already missing `ideate`, `adopt`, `quick`, `feature`, `rf`, and `dep-update` relative to the schema enum. Reconcile it against the schema rather than only appending |

### W3 — `reference/intake/audit.md` (both trees)

Pipeline: `0·orient` → `1·resolve-surface` → `[scope gate]` → `2·select-lenses` → `3·hunt` →
`4·refute` → `5·merge` → `6·route`.

| Step | Content |
|---|---|
| 0 | Slug derivation (`audit-<subsystem>`), collision check per `default.md` Step 0, **no branch** (`branch-strategy: none`), lightweight project-context read |
| 1 | D5 wave-1 enumeration; author `00-index.md` + `01-audit.md` with the resolved surface, exclusions, and the not-observable set |
| gate | Confirm the surface and the inferred lens set. `AskUserQuestion` (Proceed / Adjust surface / Adjust lenses / Cancel). Codex: `_gate-question.md` |
| 2 | D6 lens selection with the stated one-line reason per lens; explicit model tier per lens |
| 3 | Parallel lens sub-agents over the resolved paths, each reading its rubric from `reference/review/<key>.md` verbatim, returning the standard findings schema |
| 4 | D7 refutation wave; survivors only, refuted recorded |
| 5 | Merge into `07-review.md` + `07-review-<lens>.md` per the cited `_findings-ledger.md`. Sibling `.yaml` is open-only per the existing fragment contract |
| 6 | D8 routing table per finding; D9 `needs-runtime-evidence` escalations to `/wf probe`; narrative chat return per `_chat-return.md` |

Must **cite, never restate**: `_output-boundary.md`, `_narrative-voice.md`, `_chat-return.md`,
`_question-craft.md`, `_additive-write.md`, `_findings-ledger.md`, `_compressed-slice.md`,
`_steering.md`, `_ste-procedural.md`. Both `output-boundary.test.mjs` and
`shared-reference-drift.test.mjs` auto-discover new reference files across both trees and hard-fail
on a duplicated rule body — citation discipline is enforced for free, **but only if the Codex
mirror actually exists**.

Must **not** cite `_fix-loop.md` (D8).

Plus the standard sections every reference carries: the slug-mode block at the top (D10 — it
**overrides** the standalone flow), tripwires (D12), "what this command is NOT", crash-safe/resume
behaviour, and the free narrative-fragment tier.

W3.1 — `_compressed-slice.md` (**both trees**): add `audit` to the `<op>` enumeration at L14–16 and
to the `slice-type` comment enum at L36, and **resolve D10's placement wrinkle in the contract
itself** so every caller reads one rule.

### W4 — Dispatch and recognition surfaces

| | |
|---|---|
| W4.1 | `skills/wf/SKILL.md` — **three sites** (not eleven; a mode is not a key): L3 `description:` mode list; L28 the `intake` row's mode-keyword list; L67 the retired-`/wf-quick` error roster. The 21-key count, the key tables, the Step 0.5 lists, and the router lists are all **untouched** |
| W4.2 | `skills/wf/reference/intake.md` — **six sites**: L2 `description:`; L3 `argument-hint`; L9 and L36 the two mode-keyword-set enumerations; L184–192 the per-mode behaviour table (a new `audit` row: `01-audit.md` + `07-review*` + `00-index.md`, no branch, compressed slice, terminal → routes per finding); L214–222 the mode→file map (`audit` → `intake/audit.md`) |
| W4.3 | `intake.md` L140–156 — the **suggest-and-confirm routing table**, which decides what a bare description implies. Add the `audit` row ("review/scrutinize existing code for defects with no specific symptom") **and** the disambiguation bullets against its three nearest neighbours, mirroring the existing `refactor` vs `investigate`/`ideate` and `ideate` vs `investigate` bullets. Without this the mode exists but is never *proposed*, and users keep landing on `rca` or `discover` — the exact misrouting that motivated the plan |
| W4.4 | `review/_stage.md` Step 5 prerequisite table — add a `workflow-type: audit` arm. **Required even though the review stage is never the entry point for an audit slug**: without it, `/wf review <audit-slug>` falls through to standard mode, hunts for a `03-slice.md`/`04-plan.md` that will never exist, and dies on *"an implement record must exist. If missing → STOP"* — a confusing failure instead of a clean one. The arm states that an audit slug's `07-review*` files are the audit's own ledger and routes the user back to `/wf intake audit <slug>` to re-run |
| W4.5 | `auto.md` pause-and-route arm; `yolo.md` L53 terminal-analysis class gains `audit` (D11) |
| W4.6 | `close.md` / `recap.md` — confirm they handle a `type: workflow-index` slug with no implement record and no `04-plan.md`. Expected free (they already handle `investigate`/`discover`/`ideate` slugs of exactly this shape) but must be **exercised, not assumed** |

### W5 — Consult trigger

Per the v9.135–139 sweep the trigger must be an **objective** condition, never discretionary
vocabulary; `tests/unit/skills/consult-trigger-coverage.test.mjs` pins that and enumerates
reference files **by name** at L37–42, so `intake/audit.md` needs an entry there.

Auto-invoke `/consult codex <critique these findings and name what this audit missed>` when ANY of:
the audit surfaced **zero** findings on a surface above N files (a clean result on a large surface
is the cheapest thing to be wrong about); any finding is BLOCKER; any lens returned
`needs-runtime-evidence` (a second model is a cheap test of whether it is genuinely undecidable
statically); the surface spans security, auth, data migration, or money/billing.

### W6 — Doc site (**this is much smaller than the `task` plan implies**)

The `task` plan's W5 describes three authoring regimes and a `_build_pages.py` generator. **That is
stale.** Verified at v9.144.0: `_build_pages.py` **does not exist**, the site is 25 hand-authored
pages, and the version brand is **one line in `nav.html`** — `scripts/verify-doc-site.mjs` matches
`plugin docs · vX.Y.Z` there and nowhere else. The 51-file brand sweep is gone.

Six pages name intake modes and each is a hand edit:

| Page | What needs saying |
|---|---|
| `reference/intake-modes.html` | The canonical per-mode entry — the substantive write |
| `reference/commands.html` | Mode roster in the `intake` dispatch prose |
| `reference/artifacts.html` | `01-audit.md` row; `workflow-type: audit` if the enum is mirrored |
| `guides/choose-your-entry.html` | The decision content — **the page that fixes the misrouting**, and the highest-value edit in W6 |
| `guides/investigation.html` | `audit` alongside `rca` / `discover` / `investigate`; state the four-way distinction explicitly |
| `guides/autonomous-drivers.html` | `audit` in the "drivers refuse these" set (D11) |

`verify-doc-site.mjs` checks brand parity and pager/nav adjacency only — **there is no automated
drift guard on mode rosters anywhere.** Every page above is caught by review or not at all, which
is why the 2026-07-12 and 2026-07-13 audits found so much drift. Treat the table as the checklist.
If `audit` earns a sidebar entry, edit `nav.html` and fix every affected pager.

### W7 — Tests

**The `task` plan's W7 is entirely stale** and should not be carried forward. It reports three test
files "absent from the `npm test` script"; verified at v9.144.0, `npm test` is
`node tests/run-all.mjs` (automatic discovery, per the v9.140.0 change that retired the
hand-maintained list) and all three now live under `tests/unit/skills/`. Nothing to wire.

New guards this plan does need:

| | |
|---|---|
| W7.1 | **`tests/sunflower.test.mjs` L68–72** — `test('resolveViewPath: terminal analysis-mode leads land in their own named dirs')` asserts `01-ideate` → `ideate/INDEX.html` and `01-simplify` → `simplify/INDEX.html`. **Add `01-audit` → `audit/INDEX.html` here.** (Not to the change-mode test at L55–65, which asserts `intake/INDEX.html` for `01-fix`/`01-hotfix`/`01-refactor`/`01-update-deps`/`01-adopt` — per D3, `audit` is terminal, not a change mode.) This is the test that catches a W2.2 omission, and W2.2 is the one defect that produces no error — only an absent page. Highest-value single edit in W7 |
| W7.2 | Schema round-trip: a `type: workflow-index` + `workflow-type: audit` index validates, and a `07-review-<lens>.md` written by audit validates as `review-command` |
| W7.3 | Mode-roster drift guard: `intake/audit.md` exists in **both** trees, the `intake.md` mode table and file map both list it, the mode-keyword sets agree, and the SKILL.md roster names it |
| W7.4 | Ledger-extraction regression: assert `review/_stage.md` cites `_findings-ledger.md` rather than restating it, and that the review stage's own behaviour is unchanged (W1.4) |
| W7.5 | `tests/wf-fixtures.json` — add the `/wf intake audit` → `skills/wf/reference/intake/audit.md` fixture **with eyes open**. Verified at v9.144.0: the file still has **no consumer anywhere** in `tests/` or `scripts/`, so as a regression guard it is dead weight. Either wire a consumer as part of W7 or record in the commit that adding the fixture is documentation, not protection. Do not let it read as coverage it does not provide |

### W8 — Surface descriptions that enumerate modes

| File | What |
|---|---|
| `plugins/sdlc-workflow/README.md` | Command reference — intake mode list |
| `plugins/sdlc-workflow-codex/README.md` | Roster |
| `sdlc-workflow/.claude-plugin/plugin.json` | `description` (only if it enumerates modes — verify; it may name keys only) |
| `sdlc-workflow-codex/.codex-plugin/plugin.json` | `description` **and** `interface.longDescription` |
| `sdlc-workflow-codex/skills/wf/agents/openai.yaml` | Native Codex interface — `default_prompt` / `short_description`; no Claude-tree analogue |
| `.claude-plugin/marketplace.json:12` | Plugin-entry `description` |

---

## Sequencing

| Release | Contents | Rationale |
|---|---|---|
| **R1 `v9.145.0`** | W1 (ledger extraction) → W2 (schema + paths + lexicon) → W3–W8 | W1 must land first: writing `audit.md` before the extraction ships a duplicated ledger the drift guard rejects. W2.1 must land **first or in the same commit** — until the enum accepts `audit`, the hook hard-blocks every index the mode writes. Ship standalone audits fully; D10 slice-mode per whichever option W3.1 selects |
| **R2 (later)** | Cross-audit knowledge compounding: a repo-level index of what has been audited, when, and with which lenses, so a later audit knows its own coverage history | Needs R1 in real use to know whether per-slug ledgers are enough. Overlaps the `.ai/solutions/` corpus idea in [SDLC ← CE comparison] — design them together or not at all |
| **R3 (later)** | Differential/parity **execution** as a `probe` mode, closing the D9 escalation with a real destination | Currently D9 routes to `/wf probe`, which can compare against AC text but has no two-path diff harness. Deliberately out of scope: it is project-specific harness work, and conflating it with audit is what produced the rejected `path-parity` dimension |

**Per-release mechanics.** Version bump is **seven hand-edited spots**, all verified present at
9.144.0:

| # | File | Line |
|---|---|---|
| 1 | `sdlc-workflow/.claude-plugin/plugin.json` | 3 |
| 2 | `sdlc-workflow/package.json` | 3 |
| 3 | `sdlc-workflow/renderers/_shell.mjs` | 10 — `PLUGIN_VERSION`, the only hardcoded JS literal; v9.138.0 missed it |
| 4 | `sdlc-workflow-codex/.codex-plugin/plugin.json` | 3 |
| 5 | `sdlc-workflow-codex/package.json` | 3 |
| 6 | `.claude-plugin/marketplace.json` | 15 — plugin entry |
| 7 | `.claude-plugin/marketplace.json` | **4 — top-level marketplace version, bumped independently** (1.170.0 → 1.171.0) |

Repo-root `package.json` is **not** bumped. The doc-site brand is **one line in `nav.html`**, not 51
files (post-rebuild).

**`dist/` rebuild is unavoidable and double-triggered:** W2.2/W2.3 touch `renderers/` and `lib/`,
and separately `_shell.mjs` carrying `PLUGIN_VERSION` means *every* bump moves `renderers/`. That
changes `buildId`, forces the render version-gate, and mandates `npm run sync:codex`. `dist/` must
ride the same commit — the `sdlc-build-freshness` CI gate and the local pre-commit hook both
enforce it.

**And the release is not done until `origin/master` carries it.** The marketplace pins a commit SHA
(`installed_plugins.json` → `gitCommitSha`), so a committed-but-unpushed release is invisible to
every project. v9.137–140 sat unpushed for ten days and v9.138.0's hardening never ran once in the
field.

---

## Acceptance criteria (plan-level)

1. `/wf intake audit <concern> <paths>` writes a schema-valid `00-index.md` + `01-audit.md` that
   survives the `post-write-verify` hook, on a fresh repo, in **both** trees.
2. **A rendered audit slug shows its lead and its ledger.** `01-audit.md` resolves to `audit/`, the
   `workflow-index` overview links it and every `07-review*` sibling, and `07-review-<lens>.md`
   renders through `review-dimension.mjs` with severity chips and a verdict. This is the
   silent-failure criterion — the one defect that produces no error, only an absent page.
3. A second `/wf intake audit <slug>` run **merges** into the existing ledger: prior finding IDs and
   `surfaced-at` stamps preserved, a re-run lens that no longer surfaces a finding marks it
   `resolved`, nothing overwritten. Demonstrated by a test, not by inspection.
4. The review **stage** is behaviourally unchanged by the W1 ledger extraction — proven by the
   pre-existing review suites, run before and after.
5. `audit.md` cites `_findings-ledger.md` and does **not** cite `_fix-loop.md`;
   `shared-reference-drift.test.mjs` passes with the new `SHARED` entry registered.
6. `01-audit.md` states the resolved surface, the excluded paths with reasons, the selected lenses
   with a reason each, and the not-observable set. An audit reporting zero findings is legible
   enough to tell clean from unread.
7. `/wf status` lists an audit slug with `workflow-type: audit`; `/wf recap` and `/wf close` handle
   it. `/wf intake <slug> audit <concern>` writes exactly one compressed slice and creates no new
   workflow, branch, or top-level index.
8. `/wf auto <audit-slug>` and `/wf yolo <audit-slug>` both pause and route rather than driving.
9. `/wf review <audit-slug>` fails **cleanly** with the W4.4 arm's message, never with the
   standard-mode "implement record must exist" stop.
10. A bare description matching the audit shape is **proposed** as `audit` by the
    suggest-and-confirm table, and the disambiguation bullets distinguish it from `rca`,
    `discover`, and `investigate`.
11. All six doc-site pages in W6 name `audit`, and `npm run verify:docs` passes.

---

## Open questions

1. **Slug or no slug (revisiting D1).** `ship-plan audit` and `probe sweep` both write project-level
   ledgers with no slug at all, and they are the two closest precedents by *shape* even though
   `intake` is the right home by *taxonomy*. A slug buys `status`/`close`/`recap`/slice-attach; it
   costs the whole `00-index.md` + registry apparatus for work that produces no deliverable. R1
   takes the slug on the grounds that a cross-session audit must be findable. If that proves
   ceremonial in use, the retreat is a slug-less `.ai/code-audit-<subsystem>.md` — which would make
   `audit` a `probe` mode rather than an intake mode, so **the retreat is not cheap.** Worth a second
   opinion before W1.
2. **Is `audit` the right keyword?** `docs audit`, `observability audit`, `ship-plan audit`, and
   `design audit` already exist as router sub-keys. The qualifier always disambiguates in writing
   (`/wf intake audit` vs `/wf docs audit`) but not in speech — "run an audit" is now five-way
   ambiguous. Alternatives: `scrutinize`, `hunt`, `sweep` (taken by `probe`). Recommendation: keep
   `audit`, because the word is right and the namespace is the qualifier — but say so deliberately
   rather than by default.
3. **Does an audit ever want its own PR?** It produces no diff, so no. But an audit that routes six
   findings has created real coordination work with no home. R1 leaves that in the routing table's
   chat return. If it proves lossy, the answer is probably a `10-retro.md` on request rather than a
   structural change.
4. **Should lens inference be allowed to select zero lenses?** If wave 1 resolves a surface and no
   rubric fits the concern, the honest output is "no lens applies, here is why" — but that reads as
   a failure and users will re-run with a forced lens set. Decide whether that is a tripwire (D12)
   or a legitimate terminal result.

---

## Considered and rejected

Recorded because both were proposed in the originating conversation and are the obvious wrong
answers to reach for again.

| Proposal | Why rejected |
|---|---|
| **Comma-separated dimension list on `review sweep`** (`/wf review sweep correctness,architecture <paths>`) | It is a flag wearing a positional argument's clothes, against the user-validated convention-over-flags principle. Worse, it moves the routing decision onto the user: the value of an aggregate is that you name an **intent** and the system picks dimensions. It also opens unbounded input space where no combination is validated as coherent. D6 gets the same expressive power by inferring from the concern and *stating* the selection |
| **A `path-parity` review dimension** (dimension 36) | Wrong organ. Dimensions are rubrics a reader applies to source; parity between two live implementations cannot be read off source, only established by running both and diffing. A static "parity" rubric would manufacture exactly the plausible-but-wrong findings D7 exists to kill. The capability is real and belongs in `probe` (R3); the *static* half — "these two paths share a contract and no parity test exists" — is an ordinary `testing`/`architecture` finding with a D9 `needs-runtime-evidence` escalation, needing no new rubric |

---

## Appendix A — confirmed free (no edit needed)

Recorded so the next reader does not re-derive it. Each was checked against v9.144.0, not assumed.

| Surface | Why it needs nothing |
|---|---|
| `renderers/` — **no new module** | `00-index.md` → `workflow-index.mjs`; `01-audit.md` carries `type: intake` → `intake.mjs`; `07-review.md` → `review.mjs`; `07-review-<lens>.md` → `review-command.mjs` re-exporting `review-dimension.mjs`. All four exist and are load-bearing today |
| `renderers/_paths.mjs` `'07-review'` + `FLAT_REVIEW_RE` | L66 and L20 already resolve the whole ledger family. Only the `01-audit` lead needs a line (W2.2) |
| Artifact-`type:` schema blocks | `intake`, `workflow-index`, `review`, `review-command` all exist. We add **no** artifact type |
| `tests/frontmatter.schema.json` `indexFrontmatter` 22-field set | D3 uses `type: workflow-index`, validated by `quickMetaArtifactFrontmatter` (required set `["schema", "type", "slug"]`). The heavy index contract, its `status`/`progress`/`current-stage` requirements, and the `current-stage` enum are all inapplicable |
| `tests/unit/snapshots/_fixtures.mjs` `CASES` | One entry per **renderer**; no new renderer, so no new case and no new golden |
| `hooks/pre-write-validate.mjs` `type:` roster | No new artifact type (already stale by ~9 types regardless) |
| `hooks/post-write-verify.mjs` intake-ledger lint | Hardcodes `base !== '01-intake.md'`, so `01-audit.md` is silently exempt. **Correct** — an audit has no PO-interview ledger to lint — but stated, because that same hardcoding is what would silently exempt a *new default-intake mode* by accident |
| `mockEvidenceGate` | Gates `06-verify.md` `result: pass` against user-observable AC evidence rungs. An audit writes no `06-verify.md` and asserts no ACs, so the gate is inapplicable — **not** bypassed |
| `EVIDENCE-SCHEMA-CONTRACT.md` | Untouched. Unlike the `task` plan, `audit` needs **no new evidence rungs**: findings carry severity + confidence + `file:line` evidence, which is review's existing schema. The frozen contract stays frozen |
| `scripts/render-sunflower.mjs` `OFF_PIPELINE_BUCKET` | For analysis modes with their own off-pipeline root; `audit` is a normal slug workflow under `.ai/workflows/` |
| `lib/hook-utils.mjs` path→type map | For project-level files (`.ai/ship-plan.md` etc.); `audit` writes slug artifacts |
| `slice-type` schema enum | Does not exist — `slice-type` is free-form; D10's `audit` value needs only the prose comment edit |
| `codex/scripts/verify-claudisms.mjs:46` | Alternation of *retired* `$wf-<key>` spellings; `audit` has no retired form |
| Doc-site brand sweep | Post-rebuild it is **one line in `nav.html`**, not 51 files |
| `npm test` wiring | `node tests/run-all.mjs` auto-discovers; new suites are picked up with no script edit |

## Appendix B — ship order

1. **W1 first** — author `_findings-ledger.md` (both trees), cite it from `review/_stage.md` (both
   trees), register the `SHARED` entry, and prove the review stage is unchanged
2. `tests/frontmatter.schema.json` (`workflow-type` +`audit`), `renderers/_paths.mjs`,
   `lib/leak-lexicon.mjs` — Claude tree only
3. Author `skills/wf/reference/intake/audit.md` (Claude), then hand-mirror to Codex with `$wf`
   phrasing and `_gate-question.md` / `_subagents.md` / `_timestamp.md` citations
4. Remaining reference edits, **both trees**: `SKILL.md` ×3, `intake.md` ×6 + the
   suggest-and-confirm table, `status.md:58`, `review/_stage.md` prerequisite arm, `auto.md`,
   `yolo.md`, `_compressed-slice.md`
5. Tests: `sunflower.test.mjs` `01-audit` assertion, schema round-trip, mode-roster drift guard,
   ledger-extraction regression, `consult-trigger-coverage` roster entry
6. Surface descriptions (W8): both READMEs, both `plugin.json` descriptions, `marketplace.json:12`,
   `openai.yaml`
7. Doc site: the six hand-authored pages in W6
8. Version bump: 7 hand spots (+ `nav.html` brand)
9. `npm run build` → `npm run sync:codex` (**after** doc-site edits — the site rides the payload)
10. Gates: `npm test && npm run test:e2e && npm run verify:docs && npm run verify:legibility &&
    npm run verify:codex && npm run verify:runtime`, plus the Codex suite
11. `CHANGELOG.md` entry (Claude tree only)
12. Commit atomically — `dist/` must ride the same commit or the CI freshness gate fails
13. **Push.** `origin/master` must carry it or no project sees it

**Most likely to be missed**, in order: the W1 ledger extraction being skipped in favour of
restating the merge law inside `audit.md` (the drift guard catches it, but only after the work is
done twice); the Codex `skills/` hand-mirror (no script, no CI diff guard); the W4.3
suggest-and-confirm table, without which the mode exists but is never proposed;
`marketplace.json:4`, bumped independently of the plugin; and `_shell.mjs`'s `PLUGIN_VERSION`,
which v9.138.0 already missed once.
