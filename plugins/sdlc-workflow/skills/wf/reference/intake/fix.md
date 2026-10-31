# Output boundary & shared context
Apply `intake/_intake-context.md` — the External Output Boundary and the workflow-registry / slug rules. Apply **the "Compressed-lifecycle change-modes" contract in `intake/_change-mode-tail.md` (the model, the authorship split, and the gate)**. Do not restate them here.

You are running `/wf intake fix`, a **compressed standard lifecycle** for small intentional changes.

# Slug-mode

When the dispatcher selected slug-mode, follow [_compressed-slice.md](../_compressed-slice.md) with `<op>` = `fix`: it overrides the standalone steps below.

# Pipeline
`01-fix`(intake) → `02-shape` → `03-slice` → `04-plan` → **[gate]** → `/wf implement` (→`05`) → `/wf verify` (→`06`) → `/wf review` (→`07`) → `/wf ship` → `/wf retro`

| | Detail |
|---|---|
| Requires | See [## Requires](#requires). |
| Produces (this command) | `01-fix.md` (`type: intake`), `02-shape.md`, `03-slice.md` (`type: slice-index`, one slice), `04-plan.md`, and a conformant `00-index.md` (`type: index`). |
| Compression | Each planning stage is single-pass/lightweight — **no stage is skipped**. One slice, written as a real `03-slice.md`. Design runs when `ux-impact` is not `none` (`_change-mode-tail.md` → UX impact and the design stage); the trailing token `design` forces it. |
| Gate | Stop-and-prompt before `05-implement` (see `_change-mode-tail.md` → Compressed-lifecycle change-modes; Adjust/Escalate handling in the same file). May run end-to-end if the change is judged low-risk. |
| Next | `/wf implement <slug>` — the standard execution chain takes over from stage 5. |
| Escalate | If during planning the work no longer fits the fix envelope, **warn and continue** — record the breach per `_change-mode-tail.md` and offer the gate's "Escalate" option, which closes this slug and restarts as `/wf intake "<description>" from <slug>`. Do not refuse. |

## Requires

Read every row before you write the stage artifact. [_requires.md](../_requires.md) defines the check.

| Input | Kind | When | Sections |
|---|---|---|---|
| `00-index.md` | artifact | on-resume | |
| `01-fix.md` | artifact | on-resume | |
| `decisions.yaml` | artifact | if-present | |
| `intake/_intake-context.md` | procedure | always | |
| `intake/_change-mode-tail.md` | procedure | always | |
| `intake/_intake-provenance.md` | procedure | always | |
| `intake/_intake-provenance-consume.md` | procedure | mode:from | |
| `design/_lane.md` | procedure | always | UX impact |
| `design/stage.md` | procedure | mode:design | |
| `_compressed-slice.md` | procedure | mode:slug | |
| `01-fix.md` | writes | | |
| `02-shape.md` | writes | | |
| `03-slice.md` | writes | | |
| `04-plan.md` | writes | | |

# Scope discipline
You are a **compressed-planning orchestrator**, not an incident responder and not a feature shaper.
- This command skips *ceremony*, not *stages* and not *thinking*. Every stage artifact must be real and schema-conformant.
- Ask at most **2 questions** in chat for planning. Record each answer with `decide add` per [_decisions.md](../_decisions.md), and also write it inline into `01-fix.md`.
- Set `ux-impact` and confirm it with the stack question. When design is needed, run the compressed design stage per `_change-mode-tail.md` before `03-slice.md`; the person confirms the drawing in this same run.
- Respect the stated order only where a step consumes an earlier step's output or crosses a gate; reading and research may interleave freely. The compression happens *within* a step, not by removing steps.

# Step 0 — Orient
1. **Resolve slug and mode** from `$ARGUMENTS`:
   - If the argument matches an existing workflow whose index (`node "<skill-dir>/scripts/wf.mjs" record get "<root>" <slug> index`) has `workflow-type: fix` (new) OR `workflow-type: quick` (legacy) → **resume mode**. Read that index and the lead with `record get` (`01-fix.md` new, or legacy `01-quick.md` / `01-fix.md` `type: fix-plan` pre-migration — check both). Pick up from the first unwritten planning artifact. If planning is complete, the user likely meant `/wf implement` — tell them and stop.
   - Otherwise → **new `/wf intake fix` workflow**.
2. **New slug:** name it per "New slug" of [_intake-context.md](_intake-context.md), with the form `fix-<short-description>` (legacy alias for fix: `quick`).
3. **Provenance check:** apply `_intake-provenance.md` — detect an inherited analysis decision (an explicit trailing `from <source-slug>` token, or an exact label match for an `investigate`, `ideate`, or `brainstorm` source), consume the matching Consume-table row (an `investigate` option card, an `rca` diagnosis, or an `ideate` idea card seeds `01-fix.md` and the Step 1 sub-agent prompts), and link back (record `origin-<type>` here, set `superseded-by` on the source index, and apply the implicit pick/route if the source is still open). No match → continue; that is the common case.
4. **Stack fingerprint:** apply the stack policy in `_change-mode-tail.md` — detect cheaply, then spend one of the two permitted questions on the one-line confirm and set `stack.user-confirmed: true`. In the same question, confirm `ux-impact` per `_change-mode-tail.md` → UX impact and the design stage.
5. **Branch check:**
   - Default `branch-strategy: dedicated`, branch `fix/<slug>`. Create off the current base if absent: run the base check first (`node "<skill-dir>/scripts/wf.mjs" base check "<root>" --base <base>`, [_workflow-rules.md](../_workflow-rules.md)); then `git checkout -b fix/<slug>`.
   - If the user passed `branch-strategy: none` or is mid-task on a branch they want to keep → record `branch-strategy: none`; do not switch branches.
6. **Read project context (lightweight):** `PRODUCT.md` and `DESIGN.md` when present (design context), `README.md` (top ~100 lines). Do not read the full codebase here — the Step 1 sub-agent does targeted exploration.
7. **Single slice.** This is a single-slice lifecycle: the workflow slug doubles as the one slice's `slice-slug` (use `<slug>` for `slice-slug`, `selected-slice`, and `best-first-slice`). Downstream stages write **un-suffixed** files (`04-plan.md`, `05-implement.md`, `06-verify.md`).

# Step 1 — Author the planning artifacts (single pass, parallel research)

Use parallel research sub-agents to gather what is needed before writing — do not write from memory.

### Parallel research (use sub-agents)
Launch in parallel before writing. Skip if the change is a one-line fix in a file the user has explicitly named.

**Effort tier for every dispatched agent:** **low** (per [_subagents.md](../_subagents.md)). REQUIRED on every dispatch — both agents do bounded targeted reads with structured-output extraction.

#### research sub-agent 1 — Codebase grounding
Prompt with ALL of the following:
- Identify the files most likely to be touched based on the user's description.
- For each candidate file note: current shape (~5 lines), nearby patterns the change should match, callers that may need updating.
- Run `git log --oneline -10` on the candidates — flag any touched in the last 7 days (the area is in flux).
- Search for existing utilities/helpers solving the same problem; flag reuse opportunities.

Return structured text: `files_in_scope`, `nearby_patterns` (1-3), `reuse_candidates` (`path:symbol — what it does`), `recent_churn`.

#### research sub-agent 2 — Web freshness (skip if pure internal change)
Skip if the change is purely internal (no new external dependency, no API integration, no platform/browser API, no security surface). Otherwise: search the relevant library/API docs for latest-stable syntax + known gotchas/deprecations in the last 12 months; return 2-3 source URLs, a 1-line takeaway each, and a **go/no-go** on whether the approach is current.

### Then write all four planning artifacts, each schema-conformant. Use real timestamps per [_timestamp.md](../_timestamp.md). Write each as a draft `.ai/workflows/<slug>/.draft/<name>`, then run `record put "<root>" <slug>`. Take the frontmatter of each record from the planning templates in [_change-mode-tail.md](_change-mode-tail.md), with the `fix` values.

**`01-fix.md` — `type: intake` (the compressed brief, replaces standalone intake):**
Body (tight): `## Restated Request` (what the user wants + why), `## Acceptance Criteria` (≤3, each objectively verifiable; embed any inline question answers as italic notes), `## Assumptions`, `## Open Questions` (if any → set `status: awaiting-input`).

**`02-shape.md` — `type: shape`:**
Body (tight): `## In Scope` (1-3 bullets), `## Out of Scope` (1-3), `## Known Unknowns` (0-2). When design is needed, add 3-5 design-note bullets here and point to `02b-design.md` and `02c-craft.md`, which the compressed design stage writes before `03-slice.md`.

**`03-slice.md` — `type: slice-index` (one slice — the lifecycle never skips slicing):**
Body (one line): "Single-slice lifecycle — the whole fix is one slice."

**`04-plan.md` — `type: plan`:**
Body: `## Steps` — a numbered list of **at most 5** implementation steps; each names the file(s) it touches, states the change in 1-2 lines, and lists its verification (lint? test? manual check? screenshot?). Then `## Verification` — **Tests to run** (specific commands) and **Manual checks** (specific URLs/flows/visual checks).

### Tripwires (warn-and-continue — never refuse)
The fix tripwires are: >3 files touched · >5 implementation steps · new external dependency · architectural change (new module, schema migration, public API surface, cross-cutting behavior change) · >2 unanswerable questions. Record every breach per the tripwire-breach mechanism in [_change-mode-tail.md](_change-mode-tail.md) (the `## Tripwire breaches` section in `04-plan.md` plus the mirrored `intent-risks` entry) — and still write a valid plan.

# Step 2 — Write `00-index.md` (conformant `type: index`)

Write the draft of `00-index.md` from the shared change-mode index template in [_change-mode-tail.md](_change-mode-tail.md) with the `fix` column values, including the Step 0 `stack:` block (`user-confirmed: true` after the confirm) and, when provenance attached, the `origin-<type>` key. Put it.

# Step 3 — Gate before implement (mandatory unless auto-proceeding)

Apply the gate and the family gate rules in [_change-mode-tail.md](_change-mode-tail.md): record the decision in `01-fix.md` on every branch; Adjust revises and re-gates; Escalate closes this slug (`close-reason: superseded`) and prints `/wf intake "<description>" from <slug>`. You MAY auto-proceed without pausing if the change is clearly low-risk (≤3 files, no tripwires, no open questions).

# Step 4 — Hand off

Lead with a short **narrative** paragraph (prose, no bullets) telling the story — what the fix is, the files in scope, the step count, any tripwire, and the gate decision — then the structured anchors:

```
wf intake fix complete: <slug>
Branch: <branch-name or "current branch">
Files in scope: <comma-separated, max 3 — say "+N more" if longer>
Plan: <N> steps · Slices: 1 · Tripwires: <none | names>
Gate: <proceeded | adjusted | escalated | auto-proceeded (low-risk)>
Next: /wf implement <slug>
```

If escalated, `Next:` is the successor invocation that the tail printed: `/wf intake "<description>" from <slug>`.

# Workflow rules
Apply the shared workflow rules in [_change-mode-tail.md](_change-mode-tail.md) (artifact home, frontmatter + real timestamps, drafts and puts, resume-from-first-unwritten). Resume mode (Step 0) picks up from the first unwritten planning artifact: if interrupted after `02-shape.md` but before `03-slice.md`, it writes slice + plan + index and gates.

# What this command is NOT

- **Not a way to skip review.** `/wf implement`, `/wf verify` and `/wf review` still run. The compression is in the planning, never in the stages or the quality gates.
