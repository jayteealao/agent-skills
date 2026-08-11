# `/wf task` + `/wf intake audit` — the work-that-has-no-home release — Implementation Plan

> Status: **BUILT — shipped as v9.150.0, 2026-08-11** (R1+R2 merged into one release, as § Sequencing
> allows when the house-rule exception is granted up front; R3/R4 remain future work). Built-time
> corrections: `_narrative-voice.md` (cited in W1.2) was deleted in v9.146.0 — the citations went to
> `_story-arc.md` + `_ste-procedural.md`; the schema has NO `evidence-rung` enum (W2.3 landed as the
> `metric-acceptance-mock-rung` projection-description edit); `reference/wf.html` and a roster in
> `skills.html` (W5) do not exist post-rebuild — the roster lives in `commands.html`; SKILL.md's
> chat-return lists (W3.1 tail) enumerate keys only, so `audit` needed no entry there. The e2e gate
> also surfaced a pre-existing v9.132.0 gap (observability-plan/build types with no renderer), now
> excluded with a tracked follow-up.
> Plan below preserved as merged 2026-08-08 (verified against v9.144.0).
> Supersedes and merges `WF-TASK-KEY-PLAN.md` (drafted 2026-07-24) and
> `INTAKE-AUDIT-MODE-PLAN.md` (drafted 2026-07-30). Both are archived under `archived/`; this
> document is the only live plan for either capability. § Appendix C records every place the merge
> **corrected** a source plan — read it before trusting a recollection of either original.
> Scope: additive. One new top-level key (`task`, the 22nd), one new intake mode (`audit`), two
> `workflow-type` enum values, two evidence rungs on a frozen contract, one extracted shared
> reference, and one surface/doc-site sweep covering both.

## Why these two ship together

They are not related by feature. They are related by **cost structure and by a shared gap family**,
and building them separately pays the expensive half twice.

| Shared cost | Separately | Merged |
|---|---|---|
| Version bump (7 hand-edited spots) | ×2 | ×1 |
| `dist/` rebuild + `buildId` churn + render version-gate | ×2 | ×1 |
| `npm run sync:codex` + Codex `skills/` hand-mirror (no script, no CI guard) | ×2 | ×1 |
| `SKILL.md` + `intake.md` surface sweep | ×2 | ×1 |
| Doc-site pass over overlapping pages | ×2 | ×1 |
| `_compressed-slice.md` contract edit | ×2 | ×1 |
| `_paths.mjs` + `frontmatter.schema.json` + `leak-lexicon.mjs` | ×2 | ×1 |
| Release verification gauntlet (6 npm gates + Codex suite) | ×2 | ×1 |

There is also one **substantive** reason, not merely economic: `task`'s boundary tripwire routes
read-only investigation to `discover`/`investigate`, and both of those explicitly refuse to diagnose
defects. **Shipping `task` alone ships a documented dead end.** `audit` is its destination. The two
plans were each other's missing half and neither knew it.

## The unifying principle

Both capabilities exist to close the same hole in different rooms: **a claim without independent
observation closes nothing.**

- `task` enforces it with a **rung**: an action the agent asserts but never reads back lands at
  `asserted`, and `asserted` cannot close an acceptance criterion — enforced by the same hook that
  already blocks a mock-backed code pass.
- `audit` enforces it with a **refutation wave**: a candidate finding no refuter can kill enters the
  ledger; one that cannot be settled by reading source is recorded at `needs-runtime-evidence` with
  the exact experiment named, never guessed.

The mechanisms stay separate — findings carry severity and confidence, acceptance criteria carry
rungs, and conflating the two axes would be a schema mistake (see § S3). But the principle is one,
and it is why both belong in one release note.

---

## Two capabilities, one gap family

### `task` — work whose deliverable is not a code change

Every one of the ten lifecycle stages, nine intake modes, and three routers assumes the deliverable
is a code change in this repository, verified by executing software and shipped through a PR. Five
classes of real work have nowhere to go:

| Class | Example | What breaks today |
|---|---|---|
| Repo chore, no behavior change | Archive `docs/internal/*-PLAN.md` into `archived/` | `verify`'s AC gate wants runtime evidence; there is no runtime |
| Environment / infra op | Rotate an API key, add a CI secret, set a DNS record | Nothing in `/wf` except `ship` reaches outside the repo — no authorization model exists |
| Non-code deliverable | Write an RFC, produce a license audit, draft a runbook | `build must-stay-green` and the 35 review dimensions do not apply |
| Coordination | File an upstream issue, get legal signoff | No evidence vocabulary for "a human confirmed it" |
| Throwaway execution | Run a one-shot data backfill | The script never merges, so `handoff`/`ship` are meaningless |

### `audit` — defect-hunting with no symptom, no hypothesis, and no diff

Provenance: a routing failure observed in conversation. A user asked how to review an existing
subsystem — "all paint-ordering code, GPU and CPU" — for bugs, wrong assumptions, and mistakes.
Every adjacent surface refuses, and the reasons are all different, which is the signature of a real
hole rather than a missing alias:

| Surface | Why it refuses |
|---|---|
| `intake rca` | Pipeline starts at `1·symptom`; consumes [*"an error description, stack trace"*](../../skills/wf/reference/intake/rca.md:22). An audit has **no symptom** — that is what it is looking for |
| `intake discover` | Adjudicates a *stated hypothesis*; its description says it [*"does NOT diagnose bugs"*](../../skills/wf/reference/intake/discover.md:2) |
| `intake investigate` | Sketches solution options; [*"does NOT diagnose bugs"*](../../skills/wf/reference/intake/investigate.md:2) and *assumes the user already decided* the problem is real |
| `probe` | Runtime-truth comparison against **AC text**. An un-shaped subsystem has no ACs |
| `review` ad-hoc | Finds unknown defects, then discards them: [*"Ad-hoc runs write **no** `07-review*` artifact — findings return inline"*](../../skills/wf/reference/review.md:51) |
| `review <slug>` stage | Has the ledger, but Step 5 ends *"an implement record (slice or master) must exist. If missing → STOP"*, and its basis is `git diff <base>...HEAD` — a **change**, not a subsystem |
| `task` | Tripwire T8 routes read-only investigation away — **to the two modes above that refuse it** |

### The cost of both gaps is evidence, not ceremony

Work that runs outside `/wf` produces no artifact saying what was intended, what was done, and how
anyone knows it worked. That is the exact failure the evidence-rung machinery was built to prevent
for code, and it is unprotected everywhere else.

Ad-hoc review is *inside* `/wf` and still produces none. Concretely, for a multi-session subsystem
audit: you re-run it next week, re-surface the same twelve findings, re-triage them from scratch,
and **cannot distinguish what you deliberately deferred from what you never saw.** The accumulating
ledger in [`review/_stage.md`](../../skills/wf/reference/review/_stage.md:22) exists to prevent
exactly that — *"preserve prior IDs and `surfaced-at` stamps, and mark findings a re-run of a
dimension no longer surfaces as `resolved`"* — and it is unreachable for read-only work because it
is welded to slug mode, which demands an implement record.

**The audit gap is not routing. It is that the ledger has no read-only door.**

---

## The house-rule decision (corrected)

The inherited house rule is [*"no new skills, no new top-level `/wf` keys. The surface stays at 20
keys"*](archived/INTENT-FIDELITY-HARDENING-PLAN.md:11), consciously excepted once already —
[OBSERVABILITY-ROUTER-PLAN.md](archived/OBSERVABILITY-ROUTER-PLAN.md:14) added the 21st and argued the
exception on the grounds that the capability *genuinely could not* live inside an existing key.

This release takes the exception **once**, for `task` (the 22nd; Codex 20→21). `audit` needs no
exception — it is a mode, and the surface stays at 22 after both land.

### The correction

The archived `task` plan justified its key partly on this claim, which is **false**:

> "**It is not an intake mode.** Every intake mode is a *compressed standard lifecycle*… the mode
> authors the planning half, then routes into the standard execution chain."

The shared contract scopes that promise to four named modes. The relevant section of
[`_intake-context.md`](../../skills/wf/reference/intake/_intake-context.md) is headed
**"Compressed-lifecycle change-modes (fix / hotfix / refactor / update-deps)"**. Three other modes
are read-only terminals that route nowhere:

| Mode | Routes into execution chain? |
|---|---|
| `investigate` | No — [*"terminal → user picks"*](../../skills/wf/reference/intake.md:186); writes **no** `02-shape.md` |
| `discover` | No — [*"terminal → verdict-dependent"*](../../skills/wf/reference/intake.md:187); Next column reads *"verdict (no required next command)"* |
| `ideate` | No — [*"terminal → user picks"*](../../skills/wf/reference/intake.md:191) |

So "intake cannot host a terminal operation" is not a valid argument, and `audit` joins that pattern
as its fourth member. **`task` still earns the key**, on the two grounds that survive:

- **It is not a router.** `ship-plan`, `docs`, and `observability` are project-level contracts with
  `init`/`build`/`audit` sub-keys. A task is a *unit of work with a slug*.
- **It is not read-only.** Every terminal intake mode observes; a task *acts*, and — uniquely on the
  whole surface except `ship` — acts **outside the repository**. That external reach is what
  requires the T5 authorization gate, and no intake mode carries an authorization model.

If the exception is declined, the honest fallback is *not* to make `task` an intake mode; it is to
drop `task` and ship `audit` alone, which R1 already does. § Sequencing is built so that is a clean
stop rather than a rework.

---

## Part I — Shared design decisions

### S1 — One `_findings-ledger.md`, extracted before either capability is written

`audit` cannot restate the accumulate/dedupe/resolve-sweep contract.
[`shared-reference-drift.test.mjs`](../../tests/unit/skills/shared-reference-drift.test.mjs) walks
both trees and hard-fails on a duplicated rule body — the guard that ended the EOB block's drift
into 21 divergent copies.

Extract `reference/_findings-ledger.md` carrying the merge law that today lives only in
[`review/_stage.md`](../../skills/wf/reference/review/_stage.md) (the `# ACCUMULATE — do not
overwrite` block at L337–352, plus the resolve-sweep and `runs:`-append rules at L14 and L76).
`review/_stage.md` and `intake/audit.md` then **cite** it. Register it in the test's `SHARED` array:

```js
{
  file: '_findings-ledger.md',
  fingerprint: 'absence means cleared',
  citation: /\[_findings-ledger\.md\]\(([^)]+)\)/,
},
```

Follows the v9.104.0 precedent (`_fix-loop.md` / `_chat-return.md` / `_pr-ci-handoff.md` /
`_additive-write.md`) and v9.141.0's `_control-file-ownership.md`, whose registry comment states the
principle: rules read from several places *"get a single source and a guard from day one."*

**This extraction is a prerequisite, not a nicety.** Writing `audit.md` first means shipping a
duplicated ledger body the guard rejects — the work done twice.

### S2 — The compressed-slice wrinkle is ONE wrinkle, resolved once

Both source plans hit the identical unresolved problem and neither noticed it was shared:

- `task` D7: a compressed slice writes no `06-verify.md`, so a task slice has nowhere to record
  per-AC `evidence-rung` rows.
- `audit` D10: a compressed slice writes exactly one artifact, so an audit slice has nowhere to put
  per-lens ledger files.

Same shape, same fix, and it belongs in the contract rather than in two mode files. **Resolution:
a compressed slice carries its records INLINE in the artifact body and spawns no children.** A
slice-mode task records its per-AC rungs in a body table; a slice-mode audit records a single
findings table and **does not accumulate** — a slice-mode audit is a one-shot audit and its body
says so.

Rationale: `_compressed-slice.md` already promises *exactly one artifact*, and both alternatives
(letting a slice spawn children, or refusing slice mode for these two callers) break a contract four
callers currently rely on. An accumulating ledger with no defined location is worse than no ledger,
because re-runs invent divergent placements.

Edit `_compressed-slice.md` once, both trees: add `task` and `audit` to the `<op>` enumeration
(L14–16) and the `slice-type` comment enum (L36), and state the inline-records rule so all six
callers read one contract.

### S3 — Findings and rungs are different axes. Do not unify them

Tempting, since both land in the same release and both express § The unifying principle. Rejected.

An **evidence rung** answers *"how do we know this acceptance criterion is met?"* — a property of a
verification. A **finding** answers *"here is a defect, and here is my confidence in it"* — a
property of a claim about code. An audit finding has no AC to close, and a task AC has no severity.
Forcing one vocabulary onto both would give every audit finding a meaningless `n-a` rung and every
task AC a meaningless severity.

They stay separate. `audit` writes **no** `06-verify.md` and touches
[`EVIDENCE-SCHEMA-CONTRACT.md`](EVIDENCE-SCHEMA-CONTRACT.md) not at all; the contract revision in
§ T4 is `task`'s alone.

### S4 — Neither capability is driven by `auto` or `yolo` — for two different reasons

Do not collapse these into one arm. The refusals are not the same refusal:

- **`audit`** joins yolo's existing fourth class verbatim — [*"Terminal-analysis, no decided build —
  `investigate`, `discover`, `ideate`"*](../../skills/wf/reference/yolo.md:53). The class's own
  reasoning applies unchanged: the missing ingredient is a human decision about which findings
  matter, *"exactly the intake+shape alignment `yolo` must not make."* Each accepted finding seeds
  its **own** new workflow, the same rule the class already applies to `ideate`.
- **`task`** needs a **fifth class and a second genuine refusal** (joining
  `recommended-next: human-triage`). Its reason is T5: the `shared-env` / `external-party` /
  `irreversible` gates exist precisely because no written policy should resolve them unattended.

`auto.md` gets one pause-and-route arm each, mirroring the `update-deps` arm at
[`auto.md:60`](../../skills/wf/reference/auto.md).

### S5 — Two leads, two different view directories. Do not copy-paste

The single easiest mistake in this release, because the two leads look alike and are not:

| Lead | Overview type | View dir | Why |
|---|---|---|---|
| `01-task.md` | `index` (minimal lifecycle) | **`intake/`** | A `type: index` overview's intake card, jump-rail, and stripe all link to the fixed `STAGE_NAV.intake.dir` — so every lead on a `type: index` workflow MUST land at `intake/` or the card 404s |
| `01-audit.md` | `workflow-index` (terminal) | **`audit/`** | Terminal analysis modes get their own named dir (`01-rca` → `rca/`, `01-investigate` → `investigate/`, `01-discover` → `discover/`, `01-ideate` → `ideate/`) because a `workflow-index` overview has no fixed intake card |

Both leads carry `type: intake` and render through `intake.mjs`. That is legal for `audit` because
[`_paths.mjs`](../../renderers/_paths.mjs) states the axes are independent: *"Renderer dispatch is by
frontmatter `type` → intake.mjs; view-path placement is by filename → here. Separate axes."*

Consequence for the tests: the two `_paths.mjs` lines go in **different blocks**, and the two
assertions go in **different test cases** (§ W6.1).

---

## Part II — `audit` design decisions

### A1 — Placement: a read-only terminal intake mode

`/wf intake audit <concern> [paths…]`. Fourth member of the `investigate`/`discover`/`ideate`
pattern: creates a slug workflow, writes its lead, routes nowhere, changes nothing.

Rejected placements:

- **A `review` sub-mode** (`/wf review audit <paths>`). Tempting — it is review's ledger. But review
  has no workflow-creation machinery: no slug derivation, no collision prompt, no `INDEX.md`
  bootstrap, no `00-index.md` authorship. All four live in `intake`. And `review.md` Step 00 already
  carries a four-branch first-token resolution that the file itself cites as the reason review is
  *excluded* from the dispatcher's Step 0.5 fuzzy-suggest. Adding a fifth branch to the most
  overloaded resolver on the surface, to obtain machinery one key over, is the wrong trade.
- **A new top-level key.** Costs a second house-rule exception and buys nothing.
- **A project-level slug-less ledger** (`.ai/code-audit-<subsystem>.md`, the `ship-plan audit` and
  `probe sweep` shape). Cheapest, and genuinely viable — but forfeits `/wf status`, `/wf close`,
  `/wf recap`, and slice-attach. See § Open questions Q1.

### A2 — Reuse review's artifact types wholesale (the blast-radius collapse)

**No new artifact `type:`, and no new renderer.**

| Artifact | `type:` | Renderer | View path | Change needed |
|---|---|---|---|---|
| `00-index.md` | `workflow-index` | `workflow-index.mjs` | root | none — see A3 |
| `01-audit.md` | `intake` | `intake.mjs` | `audit/` | **one `_paths.mjs` line** (S5) |
| `07-review.md` | `review` | `review.mjs` | `review/` | none — `'07-review': ['review', null]` at [`_paths.mjs:66`](../../renderers/_paths.mjs) |
| `07-review-<lens>.md` | `review-command` | `review-dimension.mjs` | `review/` | none — `FLAT_REVIEW_RE = /^07-review-(.+)\.md$/` at [`_paths.mjs:20`](../../renderers/_paths.mjs) already resolves it |

The per-lens page is the load-bearing reuse. `review-dimension.mjs` already imports `verdictBlock`,
`severityChip`, and `findingListItem` — **a rendered findings list with severity chips and a verdict
already exists**, keyed to a type the review command already emits. Zero renderer work, zero
snapshot fixtures, zero goldens.

**Why stage-7 filenames on a workflow with no pipeline.** Not because stage 7 is where it sits —
there is no pipeline here — but because four mechanisms key off those exact names: the ledger merge
rules, the sibling-`.yaml` open-only projection, `resolveViewPath`'s two review regexes, and
`review-dimension.mjs`'s dispatch. A prettier `01-audit-<lens>.md` means re-implementing all four to
gain a filename nobody reads. `workflow-index.mjs` *"links every sibling artifact"* generically, so
it surfaces them without needing stage semantics. Precedent for reusing standard numbered artifacts
out of organic order: `rca` synthesizes an `02-shape.md` it never interviewed for, and `adopt`
reconstructs `05-implement.md` from a working-tree diff.

### A3 — `type: workflow-index`, not a ten-stage grid with seven holes

The obvious design — a full `type: index` with seven of ten stages `skipped` — is **wrong**, and
[`workflow-index.mjs`](../../renderers/workflow-index.mjs) says why in its own header:

> *"These don't walk the 10-stage pipeline that index.mjs assumes… Rendering them through index.mjs
> produced a mostly-empty 10-stage grid, so they get their own renderer that surfaces the
> routing/progress model instead and links every sibling artifact."*

Seven skipped stages **is** that grid. So `audit` uses `type: workflow-index`, as `investigate`,
`discover`, and `ideate` do ([`intake.md:200`](../../skills/wf/reference/intake.md)). The schema
validates it under `quickMetaArtifactFrontmatter`, required set `["schema", "type", "slug"]`, with a
free-form progress map — no heavy 22-field `indexFrontmatter`, no `status`/`progress`/`current-stage`
contract to get wrong.

`01-audit.md` carries the brief inline: concern, resolved surface, exclusions with reasons, selected
lenses with reasons, and the not-observable set. No `02-shape.md`, no `04-plan.md` — for an audit,
scoping and briefing are one motion, and inventing a shape would be the un-verifiable-AC failure the
AC-verifiability work already cured. `review-scope: slug-wide` always; per-slice is meaningless
without slices.

### A4 — Scope resolution: two waves, because a subsystem is not a path

The originating failure. Ad-hoc review offers five scopes — `pr`/`worktree`/`diff`/`file`/`repo` —
and a subsystem is none of them.

1. **Wave 1 — enumerate.** Parallel sub-agents map the concern to a concrete file set by *different
   search modalities* (by entry point, by call graph, by naming convention, by test coverage), each
   blind to the others. Union the results. (Pattern precedent: the `investigate` two-wave
   enumerate-then-select restructure.)
2. **Present the surface for confirmation** in `01-audit.md` and in chat, before any lens runs.
   **This is the legibility requirement**: an audit whose scope was silently guessed cannot be
   trusted when it reports "no findings," because the reader cannot tell clean from unread.
3. **Record exclusions and why** — vendored code, generated files, a path the user removed.

Any file the user names explicitly is in scope unconditionally. Inference adds, never subtracts.

### A5 — Lens selection is inferred from the concern, and stated

Lenses come from review's existing 35 rubrics at `reference/review/<key>.md`. `audit` **owns no
rubrics** and adds no dimension — it is a consumer.

Selection must be **legible and correctable**: `01-audit.md` and the chat return both state which
lenses were chosen and the one-line reason for each, before dispatch. Inference that cannot be
inspected is an opaque router, the failure the `_question-craft.md` legibility contract prevents.

Model tier per lens follows [`review.md:77`](../../skills/wf/reference/review.md) — `sonnet` for
`architecture`, `refactor-safety`, `security`; `haiku` otherwise; **passed explicitly**, never
inherited from the parent. `lenses=<a>,<b>` overrides inference entirely.

### A6 — Adversarial refutation before a finding lands

Adopted from [`ship-plan/audit.md`](../../skills/wf/reference/ship-plan/audit.md:2), which *"refutes
each candidate finding before it lands, then merges survivors."*

Refuters are prompted to **kill** the finding, defaulting to refuted when uncertain. Survivors enter
the ledger; refuted candidates go in a `## Refuted` section with the refutation, never silently
dropped — a refuted candidate is evidence that the lens looked. Count scales with severity:
BLOCKER/HIGH get three refuters with *distinct* lenses (does it reproduce · is the invariant real ·
is there a caller that prevents it); MED and below get one. Perspective diversity beats redundancy
when a finding can fail more than one way.

This is a real difference from the review *stage*, which merges reviewer output without refutation.
An audit produces claims about code nobody is currently changing, so a plausible-but-wrong finding
costs more than in review, where the author's diff context catches it.

### A7 — Terminal and route-don't-fix. No fix loop, ever

| Finding shape | Route |
|---|---|
| Small, mechanical, root cause clear | `/wf intake fix <finding>` |
| Cause unclear, symptom now known | `/wf intake rca <finding>` |
| Needs restructuring; several approaches | `/wf intake investigate <problem>` |
| Genuine feature-sized work | `/wf intake <scope>` |
| Needs runtime proof to confirm at all | `/wf probe` — see A8 |
| **Not a code change at all** (rotate the leaked key, file the upstream issue) | **`/wf task <outcome>`** — the merge's own synergy |

`audit.md` must **not** cite `_fix-loop.md`. Citing it is the tell that the mode drifted into being
a second review stage, and the shared-reference guard makes that citation visible in review.

### A8 — The runtime boundary: `needs-runtime-evidence`

An audit reads code. Some findings — most sharply *"these two paths disagree"* — cannot be settled
statically. Two existing idioms are adopted: `discover.md`'s escalation *"surface
`needs-runtime-evidence` and list exactly what would resolve it (a test run, a profile, a log
line)"*, and `_surface-defects.md`'s § Decidability boundary with its **"Refuse rather than
under-report"** rule and standing not-observable set.

A lens at its static ceiling records the finding at `confidence: low` with `needs-runtime-evidence`,
**names the exact experiment** that would settle it, and routes to `/wf probe`. It does not guess and
does not quietly omit.

This is the honest home for the originating example: whether the GPU and CPU paint paths actually
diverge is a runtime question. The audit's job is to establish that they *share a contract with no
parity test*, state what would prove divergence, and hand it on.

### A9 — Slug-mode compressed slice

First token an existing non-closed slug → one `03-slice-audit-<descriptor>.md`
(`slice-type: audit`, `origin: intake/audit`), no new workflow, no branch, additive index updates
only. Records inline per S2 — a slice-mode audit is one-shot and says so. The idiomatic answer to
*"I'm mid-feature and want the module I'm about to touch audited first."*

### A10 — Boundary tripwires (warn-and-continue, never refuse)

- Concern names a **specific symptom** → this is `rca`; offer to reroute.
- Concern is a **yes/no question** about the system → `discover`.
- Concern presumes the problem and wants **approaches** → `investigate`.
- Concern names **no surface at all** ("audit the codebase") → wave 1 cannot converge. Enumerate
  candidate subsystems and have the user pick. **`audit` is not a whole-repo sweep.**
- **Zero findings** is a valid, useful result. Write the artifact with the resolved surface, lenses
  run, and not-observable set, so the next audit knows what was covered. Never pad a clean result
  with nits to look productive.

---

## Part III — `task` design decisions

### T1 — A top-level key with a minimal lifecycle

`/wf task <description|slug>`. It self-authors its whole lifecycle rather than routing into the
standard execution chain — precedent: `update-deps` is the noted exception that self-authors
`05-implement`/`06-verify` because its execution is specialized
([`_intake-context.md`](../../skills/wf/reference/intake/_intake-context.md) L82–83). It is the
**fourth category** on the roster, alongside stages, standalone/drivers, and routers: a *minimal
lifecycle*.

### T2 — Reuse every artifact `type:`; add exactly one `workflow-type`

**No new artifact type.** `01-task.md` carries `type: intake` — the same trick `01-fix.md` uses,
where the filename carries the mode and the renderer dispatches on the type. `06-verify.md` carries
`type: verify`. `00-index.md` is a fully-conformant `type: index` plus `workflow-type: task`.

Consequence: no new renderer module, no new sibling-YAML schema, no snapshot churn. Two edits remain
and both are load-bearing — the `workflow-type` enum (else the wired `post-write-verify` hook
hard-blocks every write) and the `_paths.mjs` line, which is an **explicit allowlist, not a
fallback**: without it `resolveViewPath` returns null, the orchestrator skips the artifact, the lead
never renders, and the overview's intake card 404s.

`01-task` lands at **`intake/`**, not its own dir — see S5 for why it differs from `01-audit`.

### T3 — Four artifacts; skipped stages marked honestly

```
00-index.md  →  01-task.md (type: intake)  →  [gate]  →  do the work
             →  05-implement.md  →  06-verify.md  →  (10-retro.md, on request)
```

`progress:` marks `shape`, `slice`, and `plan` as `skipped`; `review`, `handoff`, and `ship` are
`skipped` unless the task produced a repo diff worth reviewing or merging. `current-stage` stays
inside the standard enum (`implement` while working, `verify` while checking) — never a bespoke
label. `01-task.md` carries its steps inline rather than minting a `04-plan.md`, because for a task,
planning and briefing are one motion.

**Why `task` keeps `type: index` where `audit` does not (A3).** A task genuinely walks a lifecycle —
it plans, implements, and verifies, and only skips three to six stages. Seven-plus skipped is the
mostly-empty grid `workflow-index.mjs` exists for; three is a normal compressed lifecycle. The line
is drawn at *does it execute and verify*, and a task does.

### T4 — The evidence contract: two new rungs on the frozen enum

[EVIDENCE-SCHEMA-CONTRACT.md](EVIDENCE-SCHEMA-CONTRACT.md) is **FROZEN 2026-07-12** and its ladder —
`live | headless | emulator-or-container | cited-mock | uncited-mock | static | n-a` — is entirely
about *executing software*. Task acceptance criteria are about *observed outcomes*:

- **`live` already covers most of it**, with a gloss: re-reading the real system of record after
  acting *is* live observation. `ls` the directory, `curl` the DNS record, query the API, read the
  file back. No new rung — just an explicit statement that non-runtime systems of record count.
- **New: `attested`** — a named external party or human confirmed the outcome, recorded with a
  citation (vendor email, signoff comment, ticket URL). Weaker than `live`, but honest, and the only
  rung available for the coordination class.
- **New: `asserted`** — the agent claims success with **no independent read-back**. Task-land's
  `uncited-mock`: presumptively fictional, and it **cannot close an AC**.

That last rule is the point, and it extends a proven hook-enforced principle rather than inventing a
parallel ladder. The shipped `mockEvidenceGate` (in [`hooks/post-write-verify.mjs`](../../hooks/post-write-verify.mjs),
around L275–298) already hard-blocks `result: pass` while a user-observable AC sits at
`cited-mock`/`uncited-mock`/`static`. Adding `asserted` to that blocking set means **"I moved the
files" without an `ls` afterward fails the gate** — same mechanism, same code path.

Because the contract is frozen, this lands as a **contract revision: a new §7** (not §6 — §6 *"What
each plan still owns alone"* already exists; the archived plan said §6 and was wrong), inherited by
both plans that write the field.

### T5 — Blast radius and a scaled authorization gate

Genuinely new risk surface: nothing in `/wf` except `ship` reaches outside the repository, and `ship`
is protected by a ship-plan, Go/No-Go gates, and a rollback runbook. `task` can rotate a key or email
a vendor with none of that. So `01-task.md` carries a mandatory classification and the pre-execution
gate scales to it:

| `blast-radius` | Gate |
|---|---|
| `repo-local` | May auto-proceed; decision recorded either way |
| `local-env` | Proceed with a recorded note |
| `shared-env` | **Stop for explicit human authorization.** No auto-proceed, ever |
| `external-party` | **Stop for explicit human authorization.** No auto-proceed, ever |
| `irreversible` | Named confirmation echoing exactly what will happen, plus a `rollback:` line per step or an explicit "no rollback exists" acknowledgement |

The bottom three rows are what an autonomous driver must not resolve by written policy (S4).

### T6 — Pipeline

`0·orient` → `1·brief` → `[gate]` → `2·execute` → `3·evidence` → `4·hand off`.

| Step | Content |
|---|---|
| 0 | Slug resolution (`task-<short-description>`), collision check, branch decision (default `branch-strategy: none` — most tasks do not warrant a branch, inverting the `fix` default), lightweight project-context read |
| 1 | Author `00-index.md` + `01-task.md`: restated request, **blast radius**, ≤5 steps each with its own outcome check, ACs each naming *how it will be observed*, rollback line per step above `repo-local`, assumptions, open questions. At most 2 chat questions, answered inline |
| gate | The T5 table. `AskUserQuestion` (Proceed / Adjust / Escalate). Codex: `_gate-question.md` |
| 2 | Do the work. Write `05-implement.md` recording what actually happened per step, including deviations |
| 3 | Write `06-verify.md`: per-AC evidence with `evidence-rung`. **Re-observe; never assert.** Any AC at `asserted` blocks `result: pass` via the hook |
| 4 | Narrative chat return per `_chat-return.md`, then the structured anchors |

### T7 — Slug-mode compressed slice

First token an existing non-closed slug → one `03-slice-task-<descriptor>.md` (`slice-type: task`,
`origin: wf/task`). Per-AC rungs recorded **inline** per S2. The idiomatic answer to *"I'm
mid-feature and need to rotate a key first."*

### T8 — Boundary tripwires (warn-and-continue, never refuse)

- Deliverable turns out to be a behavior change in product code → escalate to `/wf intake fix`
- Work needs more than one slice → it is a feature; escalate to `/wf intake`
- **Work is read-only investigation → `/wf intake audit` (defect hunt), `/wf intake discover`
  (hypothesis), or `/wf intake investigate` (options).** *This arm is the merge's substantive
  synergy: the archived `task` plan routed all read-only work to `discover`/`investigate`, both of
  which explicitly refuse to diagnose defects. Shipping `task` without `audit` ships a dead end.*
- Request contains more than one independent outcome → **`task` is not a todo list.** Enumerate the
  outcomes and have the user pick one, or escalate to a feature.

---

## Work items

### Edit topology — what is "both trees" and what is not

The mirror is not a copy. `plugins/sdlc-workflow-codex` has `skills/`, `hooks/`, `references/`,
`tests/`, and `runtime/` — but **no `renderers/`, no `lib/`, no `dist/`**. Its hooks are thin
adapters over the shared bundle in `runtime/dist/`, and the frontmatter schema is bundled there
rather than mirrored as a file.

| Edit | Authored where | How it reaches Codex |
|---|---|---|
| `skills/wf/**` markdown | **Hand-edit both trees** | **`sync:codex` does not mirror `skills/` at all** — no script, no CI diff guard. The single most-missed step |
| `renderers/`, `hooks/`, `lib/`, `tests/frontmatter.schema.json` | Claude tree only | `npm run build` → `dist/` → `npm run sync:codex` → `runtime/dist/` (byte-for-byte) |
| Doc site | Claude tree only | Rides the codex sync payload — edit **before** `sync:codex` |

Codex-specific constraints on the hand-mirrors of `task.md` and `intake/audit.md`:

- **`$wf task` / `$wf intake audit`, never `/wf …`** — enforced by
  `sdlc-workflow-codex/scripts/verify-claudisms.mjs`, which also blocks `AskUserQuestion`,
  Claude-tooling references, and Anthropic naming.
- Codex has three shared references the Claude tree lacks. Cite **`_gate-question.md`** for the T5
  authorization gate and the A4 scope gate (both use `AskUserQuestion` on the Claude side),
  **`_subagents.md`** for audit's wave-1 and lens fan-outs, and **`_timestamp.md`** in place of any
  inline `date -u`.

### W0 — Shared foundation (blocks everything; land first)

| | |
|---|---|
| W0.1 | New `skills/wf/reference/_findings-ledger.md` (**both trees**) — the accumulate/dedupe/resolve-sweep/`runs:`-append law, lifted verbatim from `review/_stage.md` L337–352 + L14 + L76, written host-neutral (S1) |
| W0.2 | `review/_stage.md` (**both trees**) — replace the lifted body with a citation. **Careful:** `shared-reference-drift.test.mjs` L71–85 asserts specific headings still exist in `review.md` and `_stage.md` (`# TRIAGE MODE`, `# Step 0 — Orient`, `# Adaptive routing`). Do not disturb them |
| W0.3 | `tests/unit/skills/shared-reference-drift.test.mjs` — add the `SHARED` entry (S1). Confirm whether the Codex tree owns a parallel guard before assuming one edit covers both |
| W0.4 | **Prove the extraction is behaviour-neutral for `review`** — run the review-touching suites before and after. A regression here breaks the shipped review stage, far costlier than a delayed feature |
| W0.5 | `tests/frontmatter.schema.json` — add **both** `"task"` and `"audit"` to the `workflow-type` enum at L139–145 (today: `feature, fix, quick, rca, investigate, rf, refactor, hotfix, dep-update, update-deps, docs, discover, standard, adopt`). **For `task` this is a hard blocker** — until the enum accepts it and `dist/` is rebuilt, the hook hard-blocks every write. **For `audit` it is not**, because a `type: workflow-index` index validates under `quickMetaArtifactFrontmatter` (required set `["schema","type","slug"]`, no `workflow-type` constraint) — do it anyway as the vocabulary `status.md`, yolo orientation, and `review/_stage.md` all read |
| W0.6 | `renderers/_paths.mjs` — **two lines in two different blocks** (S5): `'01-task': ['intake', null]` beside the change-mode leads at L34–38, and `'01-audit': ['audit', null]` in the terminal-analysis block at L47–56. **`dist/` rebuild trigger** |
| W0.7 | `lib/leak-lexicon.mjs` — add `task` to `WF_KEYS` (L27–29) so `/wf task` matches the leak-guard command pattern, and `task` + `audit` to `STAGE_NAMES` (L32–35) so the `01-task.md` / `01-audit.md` stems are recognized. **`dist/` rebuild trigger.** **Fix the pre-existing drift while here** (verified live at v9.144.0): `WF_KEYS` omits `observability` and its comment still says *"The 20 live /wf keys"*, so `/wf observability` has never matched the guard; `STAGE_NAMES` separately omits `discover`, `ideate`, `adopt`, `probe`, `simplify`, and `update-deps`. Confirm each omission's blast radius against the regex at L73 before extending |
| W0.8 | `_compressed-slice.md` (**both trees**) — add `task` and `audit` to the `<op>` enumeration (L14–16) and the `slice-type` comment enum (L36), **and write the S2 inline-records rule into the contract** so all six callers read one rule |

### W1 — `audit`

| | |
|---|---|
| W1.1 | New `skills/wf/reference/intake/audit.md` (**both trees**). Pipeline `0·orient` → `1·resolve-surface` → `[scope gate]` → `2·select-lenses` → `3·hunt` → `4·refute` → `5·merge` → `6·route`, per A1–A10 |
| W1.2 | Must **cite, never restate**: `_output-boundary.md`, `_narrative-voice.md`, `_chat-return.md`, `_question-craft.md`, `_additive-write.md`, `_findings-ledger.md`, `_compressed-slice.md`, `_steering.md`, `_ste-procedural.md`. Must **not** cite `_fix-loop.md` (A7). `output-boundary.test.mjs` and `shared-reference-drift.test.mjs` auto-discover new reference files across both trees and hard-fail on a duplicated rule body — citation discipline is enforced for free, **but only if the Codex mirror exists** |
| W1.3 | Plus the standard sections every reference carries: slug-mode block at the top (A9 — it **overrides** the standalone flow), tripwires (A10), "what this command is NOT", crash-safe/resume behaviour, free narrative-fragment tier |

### W2 — `task`

| | |
|---|---|
| W2.1 | New `skills/wf/reference/task.md` (**both trees**), per T1–T8. Same citation discipline as W1.2 |
| W2.2 | `EVIDENCE-SCHEMA-CONTRACT.md` — **new §7** adding `attested` and `asserted` to the `evidence-rung` enum plus the `live` gloss for non-runtime systems of record. Mark the contract revision explicitly; the header says any change here is inherited by both writing plans. **§6 already exists** — do not overwrite it |
| W2.3 | `tests/frontmatter.schema.json` — extend the `evidence-rung` enum with `attested` and `asserted` (the `workflow-type` half is W0.5) |
| W2.4 | `hooks/post-write-verify.mjs` (~L275–298) — add `asserted` to the `mockEvidenceGate` blocking set and to its operator-facing message. **`dist/` rebuild trigger** |
| W2.5 | `verify.md` (**both trees**) — one paragraph placing the two new rungs on the existing ladder. Cite the contract; do not restate it |

**Deliberately unchanged, recorded as a decision rather than an oversight:**
`hooks/post-write-verify.mjs` (~L390–401, the intake-ledger lint) hardcodes `base !== '01-intake.md'`,
so `01-task.md` and `01-audit.md` are both silently exempt. That is **correct** — neither has a
PO-interview ledger to lint — but it must be stated, because the same hardcoding is what would
silently exempt a *new default-intake mode* by accident.

### W3 — Shared surface and dispatch sweep (one pass, both capabilities)

| | |
|---|---|
| W3.1 | `skills/wf/SKILL.md` — **`task` needs eleven sites; `audit` needs three of the same file, so do them together.** Claude line numbers (Codex offset by one, no `yolo`): L3 `description:`; L5 `argument-hint` pipe-alternation; L12 roster sentence with category counts (gains a sixth category for `task`); L20 "one of the 21 known keys" → 22; the dispatch tables at L28–37 / L43–47 / L53–58 (a new **Minimal lifecycle** section for `task`; the `intake` row's mode list gains `audit`); L64 resolution rule 1 (count **and** the slug-resolving key list); **L66/L67 the not-a-known-key error roster and the retired-`/wf-quick` roster**; L79 + L82–87 the Step 0.5 applies-to / does-not-apply lists; L89 the literal instruction *"Keep this list in sync with the 21-key table"*; L122 router-key list (**no change** — `task` is not a router); L144/146 chat-return read-only and terminal key lists (`audit` is read-only **and** terminal; `task` is neither) |
| W3.2 | `skills/wf/reference/intake.md` — **six sites, `audit` only**: L2 `description:`; L3 `argument-hint`; L9 and L36 the two mode-keyword-set enumerations; L184–192 the per-mode behaviour table (new `audit` row: `01-audit.md` + `07-review*` + `00-index.md`, no branch, compressed slice, terminal → routes per finding); L214–222 the mode→file map |
| W3.3 | `intake.md` L140–156 — the **suggest-and-confirm routing table** that decides what a bare description implies. Add the `audit` row ("review/scrutinize existing code for defects with no specific symptom") **and** disambiguation bullets against `rca`, `discover`, and `investigate`, mirroring the existing `refactor` vs `investigate`/`ideate` bullets. **Without this the mode exists but is never proposed**, and users keep landing on `rca` — the exact misrouting that motivated the plan |
| W3.4 | `status.md:58` — add `task` and `audit` to the INDEX.md `workflow-type` column vocabulary. That list currently reads `compressed, fix, rca, investigate, discover, hotfix, update-deps, refactor, docs, standard` and is **already** missing `ideate`, `adopt`, `quick`, `feature`, `rf`, `dep-update` relative to the schema enum. Reconcile against the schema rather than only appending |
| W3.5 | `auto.md` — two pause-and-route arms (S4), mirroring the `update-deps` arm at L60. `yolo.md` — `audit` joins the terminal-analysis class at L53; `task` becomes a **fifth** class and a second genuine refusal |
| W3.6 | `review/_stage.md` Step 5 prerequisite table — arms for **both** `workflow-type: task` and `workflow-type: audit`. **Required for both even though neither is normally reviewed**: without them, `/wf review <slug>` falls through to standard mode, hunts for a `03-slice.md`/`04-plan.md` that will never exist, and dies on *"an implement record must exist. If missing → STOP"* — a confusing failure instead of a clean one. The `task` arm routes to `/wf task <slug>` or, if the task left a reviewable diff, to ad-hoc `/wf review <dimension>`; the `audit` arm states that `07-review*` **is** the audit's own ledger and routes back to `/wf intake audit <slug>` |
| W3.7 | `close.md` / `recap.md` — confirm they handle a `type: index` slug with six `skipped` stages (`task`) **and** a `type: workflow-index` slug with no implement record (`audit`). The audit case is expected free (they already handle `investigate`/`discover`/`ideate` of exactly that shape); the task case is new. **Exercise, do not assume** |

### W4 — Consult triggers

Triggers must be **objective** conditions, never discretionary vocabulary — the v9.135–139 sweep,
pinned by `tests/unit/skills/consult-trigger-coverage.test.mjs`, which enumerates reference files
**by name** at L37–42. Both `task.md` and `intake/audit.md` need entries there.

- **`task`** — auto-invoke `/consult codex` at the gate when ANY of: `blast-radius` is `shared-env`,
  `external-party`, or `irreversible`; the task touches credentials, billing, or production data; no
  rollback exists for any step.
- **`audit`** — auto-invoke `/consult codex <critique these findings and name what this audit
  missed>` when ANY of: the audit surfaced **zero** findings on a surface above N files (a clean
  result on a large surface is the cheapest thing to be wrong about); any finding is BLOCKER; any
  lens returned `needs-runtime-evidence`; the surface spans security, auth, data migration, or
  money/billing.

### W5 — Doc site (one pass; **far smaller than the archived `task` plan claims**)

The archived plan describes three authoring regimes, a `_build_pages.py` generator, and a 51-file
brand sweep. **All stale.** Verified at v9.144.0: `_build_pages.py` **does not exist**, the site is
**25 hand-authored pages**, and the version brand is **one line in `nav.html`** —
`scripts/verify-doc-site.mjs` matches `plugin docs · vX.Y.Z` there and nowhere else.

| Page | `task` | `audit` |
|---|---|---|
| `reference/wf.html` | Canonical roster, per-key table, lede category breakdown, TOC entry | — |
| `reference/commands.html` | Dispatch prose + key tables | Mode roster in the `intake` prose |
| `reference/intake-modes.html` | — | **The canonical per-mode entry — the substantive write** |
| `reference/artifacts.html` | `01-task.md` / `06-verify.md` rows; `workflow-type` enum | `01-audit.md` row |
| `reference/skills.html` | One-line key roster | — |
| `guides/choose-your-entry.html` | When a task, not a fix | **The decision content — the page that fixes the misrouting** |
| `guides/investigation.html` | — | `audit` alongside `rca`/`discover`/`investigate`; state the four-way distinction |
| `guides/autonomous-drivers.html` | New refusal class (S4) | In the "drivers refuse these" set |

`verify-doc-site.mjs` checks brand parity and pager/nav adjacency **only — there is no automated
drift guard on key counts or mode rosters anywhere.** Every page above is caught by review or not at
all, which is why the 2026-07-12 and 2026-07-13 audits found so much drift. Treat the table as the
checklist. If either capability earns a sidebar entry, edit `nav.html` and fix every affected pager.

### W6 — Tests

**The archived `task` plan's W7 is entirely stale** — it reports three test files "absent from the
`npm test` script." Verified at v9.144.0: `npm test` is `node tests/run-all.mjs` (automatic
discovery, since v9.140.0 retired the hand-maintained list) and all three live under
`tests/unit/skills/`. Nothing to wire.

| | |
|---|---|
| W6.1 | **`tests/sunflower.test.mjs` — two assertions in two different tests** (S5). `01-task` → `intake/INDEX.html` goes in `test('resolveViewPath: compressed change-mode leads all land at intake/')` at L55–65. `01-audit` → `audit/INDEX.html` goes in `test('resolveViewPath: terminal analysis-mode leads land in their own named dirs')` at L68–72. **Putting either in the other's test is the single most likely mistake in this release.** These are the tests that catch a W0.6 omission, and W0.6 is the one defect that produces no error — only an absent page |
| W6.2 | Evidence gate: a task whose AC is evidenced only by `asserted` **cannot** reach `result: pass`. Demonstrated by a test, not by inspection |
| W6.3 | Ledger accumulation: a second `/wf intake audit <slug>` run merges — prior IDs and `surfaced-at` preserved, a re-run lens that no longer surfaces a finding marks it `resolved`, nothing overwritten |
| W6.4 | Schema round-trips: `type: index` + `workflow-type: task` validates; `type: workflow-index` + `workflow-type: audit` validates; a `07-review-<lens>.md` written by audit validates as `review-command` |
| W6.5 | Roster drift guards: both references exist in **both** trees, the dispatch tables list them, the mode-keyword sets agree, and the not-a-known-key error roster names `task` |
| W6.6 | Ledger-extraction regression: `review/_stage.md` cites `_findings-ledger.md` rather than restating it, and the review stage's behaviour is unchanged (W0.4) |
| W6.7 | `tests/wf-fixtures.json` — add both fixtures **with eyes open**. Verified at v9.144.0: this file still has **no consumer anywhere** in `tests/` or `scripts/`, so as a regression guard it is dead weight. Either wire a consumer here or record in the commit that the fixtures are documentation, not protection. Do not let them read as coverage they do not provide |

### W7 — Surface descriptions that enumerate the roster

| File | What |
|---|---|
| `plugins/sdlc-workflow/README.md` (~L716–780) | Command reference — key roster **and** intake mode list |
| `plugins/sdlc-workflow-codex/README.md` (L19) | Roster + count |
| `sdlc-workflow/.claude-plugin/plugin.json` | `description` states the key count |
| `.claude-plugin/marketplace.json:12` | Plugin-entry `description` |
| `sdlc-workflow-codex/.codex-plugin/plugin.json` | `description` **and** `interface.longDescription` both enumerate the roster |
| `sdlc-workflow-codex/skills/wf/agents/openai.yaml` | Native Codex interface — `display_name` / `short_description` / `default_prompt`; no Claude-tree analogue |
| `tests/wf-fixtures.json` | Routing fixtures; its `description` field hardcodes "21-key surface" → 22 |

---

## Sequencing

Split by risk. **R1 is a clean stop**: if the house-rule exception for `task` is declined, R1 ships
`audit` alone and nothing is wasted.

| Release | Contents | Rationale |
|---|---|---|
| **R1 `v9.145.0`** | W0 (shared foundation) → W1 (`audit`) → the `audit` half of W3–W7 | Cheapest and lowest-risk half: no new key, no contract revision, no external reach. W0.1–W0.4 must precede W1 or `audit.md` ships a duplicated ledger the drift guard rejects |
| **R2 `v9.146.0`** | W2 (`task` core) + the `task` half of W3–W7 | W0.5's `workflow-type: task` and W2.2–W2.4 (contract + schema + hook) **must land first or in the same commit** — until the enum accepts `task`, the hook hard-blocks every artifact the key writes. Ship `repo-local` and `local-env` tasks fully; `shared-env`/`external-party`/`irreversible` are classified and gated, and the gate simply stops for a human |
| **R3 (later)** | Richer authorization: per-class credentials policy, rollback verification, an audit trail for external-party actions | The genuinely risky surface, iterable one class at a time without blocking the core |
| **R4 (later)** | `yolo` drives `repo-local` tasks only; cross-audit coverage index | Both need real use first — R3's gate classification must prove reliable, and per-slug audit ledgers must prove insufficient. The audit half overlaps the `.ai/solutions/` corpus idea; design them together or not at all |

**Doing R1 and R2 as one release is defensible** if the exception is granted up front — it collapses
the shared cost table to a single pass. The split exists to make declining `task` cheap, not because
the work conflicts.

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
files.

**`dist/` rebuild is unavoidable and double-triggered:** W0.6/W0.7/W2.4 touch `renderers/`, `lib/`,
and `hooks/`, and separately `_shell.mjs` carrying `PLUGIN_VERSION` means *every* bump moves
`renderers/` — so even a prose-only release rebuilds. That changes `buildId`, forces the render
version-gate, and mandates `npm run sync:codex`. `dist/` must ride the same commit; the
`sdlc-build-freshness` CI gate and the local pre-commit hook both enforce it.

**And the release is not done until `origin/master` carries it.** The marketplace pins a commit SHA,
so a committed-but-unpushed release is invisible to every project. v9.137–140 sat unpushed for ten
days and v9.138.0's hardening never ran once in the field.

---

## Acceptance criteria (plan-level)

**Shared**

1. `_findings-ledger.md` exists in both trees, `review/_stage.md` cites it rather than restating it,
   and `shared-reference-drift.test.mjs` passes with the new `SHARED` entry registered.
2. The review **stage** is behaviourally unchanged by the W0 extraction — proven by the pre-existing
   review suites, run before and after.
3. `/wf status` lists both a task slug and an audit slug with the right `workflow-type`; `/wf recap`
   and `/wf close` handle both.
4. `/wf auto` and `/wf yolo` pause and route for both, via **two distinct arms with two distinct
   stated reasons** (S4).
5. `/wf review <task-slug>` and `/wf review <audit-slug>` each fail **cleanly** with their own W3.6
   arm, never with the standard-mode "implement record must exist" stop.
6. A compressed slice from either capability writes exactly **one** artifact with its records inline
   (S2), and creates no new workflow, branch, or top-level index.

**`audit`**

7. **A rendered audit slug shows its lead and its ledger.** `01-audit.md` resolves to `audit/`, the
   `workflow-index` overview links it and every `07-review*` sibling, and `07-review-<lens>.md`
   renders through `review-dimension.mjs` with severity chips and a verdict. Silent-failure
   criterion — the one defect that produces no error, only an absent page.
8. A second audit run **merges** into the existing ledger (W6.3), demonstrated by a test.
9. `01-audit.md` states the resolved surface, exclusions with reasons, selected lenses with a reason
   each, and the not-observable set. A zero-finding audit is legible enough to tell clean from unread.
10. A bare description matching the audit shape is **proposed** as `audit` by the suggest-and-confirm
    table, distinguished from `rca`, `discover`, and `investigate`.

**`task`**

11. `/wf task <description>` writes a schema-valid `00-index.md` + `01-task.md` that survives the
    `post-write-verify` hook, on a fresh repo, in both trees.
12. A task whose AC is evidenced only by `asserted` **cannot** reach `result: pass` — the hook blocks
    it, demonstrated by a test, not by inspection.
13. A `shared-env` task stops for human authorization even when every other signal says proceed.
14. **`/wf task`'s read-only tripwire routes to `/wf intake audit`** and the route resolves to a
    command that exists. The dead end the archived plan would have shipped is closed.
15. **A rendered task slug shows its lead.** `01-task.md` resolves to `intake/`, and the overview's
    intake card links to a page that exists.

**Release**

16. Doc-site key count reads 22 on every live roster site, both capabilities appear on all eight
    pages in W5, `npm run verify:docs` passes, and the v9.98–9.102 history entries are left
    untouched (they say "20 keys" **wrong by design** — match on the live roster sentence, never sed
    the digit).

---

## Open questions

1. **Audit: slug or no slug?** `ship-plan audit` and `probe sweep` both write project-level ledgers
   with no slug, and they are the closest precedents by *shape* even though `intake` is the right
   home by *taxonomy*. A slug buys `status`/`close`/`recap`/slice-attach; it costs the whole
   `00-index.md` + registry apparatus for work with no deliverable. R1 takes the slug on the grounds
   that a cross-session audit must be findable. The retreat — a slug-less
   `.ai/code-audit-<subsystem>.md` — would make `audit` a `probe` mode rather than an intake mode,
   so **the retreat is not cheap.** Worth a second opinion before W0.
2. **Is `audit` the right keyword?** `docs audit`, `observability audit`, `ship-plan audit`, and
   `design audit` already exist as router sub-keys. The qualifier disambiguates in writing
   (`/wf intake audit` vs `/wf docs audit`) but not in speech — "run an audit" becomes five-way
   ambiguous. Alternatives: `scrutinize`, `hunt`, `sweep` (taken by `probe`). Recommendation: keep
   `audit`, deliberately rather than by default.
3. **Does a task ever want a PR?** A repo-local task produces a diff that arguably deserves `review`
   + `handoff`. R2 marks them `skipped` and leaves the diff on the branch. If that proves wrong, the
   fix is an opt-in `→ /wf review <slug>` hand-off at step 4, not a structural change.
4. **Should `attested` require a machine-checkable citation?** A URL can be verified to exist; an
   email quote cannot. R2 requires a citation string but does not validate it. Revisit if `attested`
   becomes a laundering route around `asserted`.
5. **Task vs the research gap.** A task whose *work* is investigation ("find out whether vendor X
   supports SSO") wants an external-evidence source that does not exist. `audit` does not cover it —
   `audit` reads *this* codebase. That is a separate proposal (a `research` skill completing the
   `consult` / `study-sources` oracle triad); `task` should cite it if it lands and use `attested`
   meanwhile.
6. **Should audit lens inference be allowed to select zero lenses?** If wave 1 resolves a surface and
   no rubric fits, the honest output is "no lens applies, here is why" — but that reads as failure
   and users will re-run with a forced set. Decide whether that is a tripwire or a legitimate
   terminal result.

---

## Considered and rejected

| Proposal | Why rejected |
|---|---|
| **Comma-separated dimension list on `review sweep`** (`/wf review sweep correctness,architecture <paths>`) | A flag wearing a positional argument's clothes, against the user-validated convention-over-flags principle. It moves the routing decision onto the user, when the value of an aggregate is that you name an **intent** and the system picks dimensions. It also opens unbounded input space where no combination is validated as coherent. A5 gets the same expressive power by inferring from the concern and *stating* the selection |
| **A `path-parity` review dimension** (a 36th) | Wrong organ. Dimensions are rubrics a reader applies to source; parity between two live implementations cannot be read off source, only established by running both and diffing. A static "parity" rubric would manufacture exactly the plausible-but-wrong findings A6 exists to kill. The capability is real and belongs in `probe`; the *static* half — "these two paths share a contract and no parity test exists" — is an ordinary `testing`/`architecture` finding with an A8 escalation, needing no new rubric |
| **Making `audit` a `task` mode** (or vice versa) | They differ on the one axis that matters: `task` acts, including outside the repository, which is why it needs the T5 authorization gate; `audit` observes and cannot mutate anything. One authorization model cannot serve both without either over-gating audits or under-gating tasks |
| **Unifying findings and evidence rungs into one vocabulary** | Different axes — see S3 |
| **Letting a compressed slice spawn child artifacts** to hold task rungs / audit lens files | Breaks `_compressed-slice.md`'s *exactly one artifact* promise, which four callers already rely on. S2 records inline instead |

---

## Appendix A — confirmed free (no edit needed)

Each checked against v9.144.0, not assumed.

| Surface | Why it needs nothing |
|---|---|
| `renderers/` — **no new module for either capability** | `00-index.md` → `index.mjs` (task) / `workflow-index.mjs` (audit); both leads carry `type: intake` → `intake.mjs`; `07-review.md` → `review.mjs`; `07-review-<lens>.md` → `review-command.mjs` re-exporting `review-dimension.mjs`. All exist and are load-bearing today |
| `renderers/_paths.mjs` `'07-review'` + `FLAT_REVIEW_RE` | L66 and L20 already resolve the whole ledger family. Only the two leads need lines (W0.6) |
| Artifact-`type:` schema blocks | `intake`, `index`, `workflow-index`, `verify`, `review`, `review-command` all exist. We add **no** artifact type |
| `renderers/index.mjs` `STAGE_NAV` | Maps stage → artifact `type`s + view dir. `01-task.md` carries `type: intake` and lands at `intake/`, an existing entry |
| `renderers/index.mjs` / `dashboard.mjs` `STAGES` | The ten canonical stages are unchanged; a task index marks six `skipped`, an existing `progress` enum value |
| `frontmatter.schema.json` `current-stage` enum | T3 keeps `current-stage` inside the existing enum; A3 uses `workflow-index`, where the field is inapplicable |
| `frontmatter.schema.json` `indexFrontmatter` 22-field set | Applies to `task` (which conforms) and not to `audit`, validated under `quickMetaArtifactFrontmatter` |
| `tests/e2e/acceptance.mjs` `NOT_RENDERED` | Schema-driven over artifact `type`s; we add none |
| `tests/unit/snapshots/_fixtures.mjs` `CASES` | One entry per *renderer*; no new renderer, so no new case and no golden |
| `hooks/pre-write-validate.mjs` `type:` roster | No new artifact type (already stale by ~9 types regardless) |
| `hooks/post-write-verify.mjs` intake-ledger lint | Hardcodes `base !== '01-intake.md'`, so both new leads are silently exempt — **correct**, and stated in W2 |
| `mockEvidenceGate` for `audit` | Gates `06-verify.md` `result: pass` against AC evidence rungs. `audit` writes no `06-verify.md` and asserts no ACs, so the gate is **inapplicable, not bypassed** |
| `EVIDENCE-SCHEMA-CONTRACT.md` for `audit` | Untouched by `audit` (S3). The §7 revision is `task`'s alone |
| `scripts/render-sunflower.mjs` `OFF_PIPELINE_BUCKET` | For analysis modes with their own off-pipeline root; both are normal slug workflows under `.ai/workflows/` |
| `lib/hook-utils.mjs` path→type map | For project-level files (`.ai/ship-plan.md` etc.); both write slug artifacts |
| `slice-type` schema enum | Does not exist — `slice-type` is free-form; S2's two values need only the prose comment edit |
| `codex/scripts/verify-claudisms.mjs:46` | Alternation of *retired* `$wf-<key>` spellings; neither has a retired form |
| Doc-site brand sweep | Post-rebuild it is **one line in `nav.html`**, not 51 files |
| `npm test` wiring | `node tests/run-all.mjs` auto-discovers; new suites are picked up with no script edit |

## Appendix B — ship order

Per release. R1 runs steps 1–12 for `audit`; R2 repeats 4–12 for `task`. Merging the releases runs
each step once with both capabilities in scope.

1. **W0.1–W0.4 first** — author `_findings-ledger.md` (both trees), cite it from `review/_stage.md`
   (both trees), register the `SHARED` entry, and prove the review stage is unchanged
2. `tests/frontmatter.schema.json` enums, `renderers/_paths.mjs` (**two lines, two blocks** — S5),
   `lib/leak-lexicon.mjs`, `hooks/post-write-verify.mjs` — Claude tree only
3. `EVIDENCE-SCHEMA-CONTRACT.md` **§7** revision (R2 only)
4. Author the reference(s) in the Claude tree, then hand-mirror to Codex with `$wf` phrasing and
   `_gate-question.md` / `_subagents.md` / `_timestamp.md` citations
5. `skills/wf/SKILL.md` — all affected sites, both trees (W3.1)
6. Remaining reference edits, both trees: `intake.md` (incl. the suggest-and-confirm table),
   `status.md:58`, `review/_stage.md` arms, `auto.md`, `yolo.md`, `verify.md`,
   `_compressed-slice.md`
7. Tests: the **two** `sunflower.test.mjs` assertions in their **two** different tests, evidence
   gate, ledger accumulation, schema round-trips, roster drift, consult-trigger roster entries
8. Surface descriptions (W7): both READMEs, both `plugin.json` descriptions, `marketplace.json:12`,
   `openai.yaml`, `wf-fixtures.json`
9. Doc site: the eight hand-authored pages in W5
10. Version bump: 7 hand spots (+ the single `nav.html` brand line)
11. `npm run build` → `npm run sync:codex` (**after** doc-site edits — the site rides the payload)
12. Gates: `npm test && npm run test:e2e && npm run verify:docs && npm run verify:legibility &&
    npm run verify:codex && npm run verify:runtime`, plus the Codex suite
13. `CHANGELOG.md` entry (Claude tree only)
14. Commit atomically — `dist/` must ride the same commit or the CI freshness gate fails
15. **Push.** `origin/master` must carry it or no project sees it

**Most likely to be missed**, in order: putting the `01-task` / `01-audit` path entries or test
assertions in each other's block (S5 — they look alike and are not); skipping W0 and restating the
ledger inside `audit.md` (the drift guard catches it, but only after the work is done twice); the
Codex `skills/` hand-mirror (no script, no CI diff guard); W3.3's suggest-and-confirm row, without
which `audit` exists but is never proposed; `marketplace.json:4`, bumped independently of the
plugin; and `_shell.mjs`'s `PLUGIN_VERSION`, which v9.138.0 already missed once.

---

## Appendix C — what the merge corrected

Recorded so a reader who remembers either source plan knows what changed. Every item verified
against v9.144.0.

**Corrections to `WF-TASK-KEY-PLAN.md`:**

| Claim in the archived plan | Reality |
|---|---|
| "Every intake mode is a compressed standard lifecycle" — the primary argument for a new key | False. `_intake-context.md` scopes that heading to fix/hotfix/refactor/update-deps; `investigate`/`discover`/`ideate` are read-only terminals. The key is still earned, on the not-a-router and acts-outside-the-repo grounds (§ House-rule decision) |
| D8 routes read-only investigation to `discover`/`investigate` | Both explicitly refuse to diagnose bugs. Shipping `task` alone ships a dead end; T8 now routes to `audit` |
| New contract section is **§6** | §6 (*"What each plan still owns alone"*) already exists. It is **§7** |
| W5: three doc-site regimes, `_build_pages.py`, 51 brand files, ~13 pages | `_build_pages.py` does not exist. 25 hand-authored pages, **one** brand line in `nav.html` |
| W7: three test files absent from `npm test`; wire them in | `npm test` is `node tests/run-all.mjs` (auto-discovery since v9.140.0); all three live under `tests/unit/skills/`. Nothing to wire |
| `mockEvidenceGate` at L266–289; intake-ledger lint at L380–420 | Line drift — approximately L275–298 and L390–401 |
| "the 34 code review dimensions" | 35 |

**Corrections to `INTAKE-AUDIT-MODE-PLAN.md`:**

| Claim in the archived plan | Reality |
|---|---|
| `00-index.md` is `type: index` with seven `skipped` stages; `01-audit` lands at `intake/` | Wrong renderer. `workflow-index.mjs`'s header says index.mjs on a non-pipeline workflow *"produced a mostly-empty 10-stage grid"* — which seven skipped stages is. Corrected to `type: workflow-index` with the lead at `audit/`, cascading into the `_paths.mjs` block and the `sunflower.test.mjs` case (S5, A3, W6.1) |
| The `workflow-type` enum hard-blocks every index the mode writes | Only for `type: index`. A `workflow-index` validates under `quickMetaArtifactFrontmatter`, which constrains no `workflow-type`. Still do the edit — as vocabulary, not as a blocker (W0.5) |
| The slug-mode records wrinkle is audit's to resolve | It is shared with `task`'s identical wrinkle. Resolved once in `_compressed-slice.md` (S2) |

**Verified-live findings folded into the work items, belonging to neither original plan:**

- `lib/leak-lexicon.mjs` `WF_KEYS` omits `observability` (comment still says "the 20 live /wf keys"),
  so `/wf observability` has never matched the leak guard. `STAGE_NAMES` separately omits `discover`,
  `ideate`, `adopt`, `probe`, `simplify`, and `update-deps`. → W0.7
- `tests/wf-fixtures.json` still has **no consumer** anywhere in `tests/` or `scripts/`. → W6.7
- `status.md:58`'s `workflow-type` vocabulary is already missing six values relative to the schema
  enum. → W3.4
