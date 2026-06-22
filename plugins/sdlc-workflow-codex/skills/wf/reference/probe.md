---
description: Runtime-truth verification — drives a running artifact through acceptance criteria (or a free-form target), captures observable output, reads it, compares against AC text, and writes findings as a compressed slice. Slug-mode only. Sibling of rca (static diagnosis); probe is runtime detection. Does NOT write a fix.
argument-hint: <slug> [target]
---

# External Output Boundary (MANDATORY)
Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.
- Internal context includes workflow artifact paths (`.ai/workflows/...`, `.codex/...`, `.ai/dep-updates/...`), stage names or numbers, skill names, task/sub-agent names, prompt/tooling details, control-file metadata, and private chain-of-thought or reasoning traces.
- External-facing outputs include commit messages, branch names, PR titles/bodies/comments, release notes, changelog entries, user documentation, README content, code comments/docstrings, issue comments, deployment notes, and any file outside the private workflow artifact directories.
- When producing external-facing output, translate workflow context into product/project language: user-visible change, rationale, affected areas, verification, risks, migration notes, and follow-up work. Do not say the work came from an SDLC workflow or cite private artifact files.
- Before writing, committing, pushing, opening a PR, updating docs/comments, or publishing anything, perform a leak check and remove internal workflow references unless the user explicitly asks for a private/internal artifact.

You are running `$wf probe`, a **runtime-truth verification workflow** that drives the running artifact and reports findings, without writing a fix.

# Slug-mode contract (read before proceeding)

`probe` is **slug-mode only.** It always operates on an existing slug from `.ai/workflows/INDEX.md`. There is no fresh-workflow form — runtime-truth verification only makes sense against work that has already been implemented.

The `$wf` dispatcher handles slug detection. If you reach this reference, slug-mode has been confirmed:

- **One artifact, in the existing workflow.** Write `.ai/workflows/<slug>/03-slice-probe-<descriptor>.md` (collision suffix `-2`, `-3` if needed). Frontmatter shape is below; full template later in this file.
- **Same content discipline as the standalone sub-commands** (research depth, evidence quality, recommendation logic) — only the output destination is a compressed slice rather than a fresh workflow.
- **No new workflow, no new branch, no `01-probe.md`, no new top-level `00-index.md`.** The slug already owns those.
- **Index updates** are the standard slug-mode updates (workflow-files, compressed-slices, INDEX.md row touch) — see `reference/_compressed-slice.md` for the exact bookkeeping.

# Position in the wf family

`probe` fills the missing cell in this 2x2:

| | Forward gate (per-slice) | Backward re-entry (slug-wide) |
|---|---|---|
| **Static** | lint/types/tests in `$wf verify` | `rca` (read-only static diagnosis of a reported symptom) |
| **Runtime** | interactive sub-agent in `$wf verify` (gated, refuses pass without runtime evidence) | **`probe` (this skill — runtime detection of reported or unreported symptoms)** |

`probe` is to `rca` what runtime is to static. `rca` reads code and git history; `probe` runs the artifact and observes it. Where `rca` is a diagnostician, `probe` is an observer.

# CRITICAL — execution discipline
You are a **runtime observer**, not a fixer.
- The **only** acceptable output is the compressed probe slice artifact and the index bookkeeping. Do NOT edit application code. Do NOT propose a patch. Do NOT run mutating commands beyond what the adapter's bootstrap section authorizes (start dev server, boot emulator, build + install, etc. — these are authorized side effects).
- You may drive the running artifact (clicks, taps, HTTP requests, CLI invocations). You may NOT edit source files.
- The "Suggested fix shape" section in the slice body is **direction, not a plan** — 1 to 3 lines naming the area and approach.
- Follow the steps below exactly in order. Do not skip, reorder, or combine steps.

# Argument grammar

The dispatcher has consumed the first positional argument (the slug). What remains:

| Form | Meaning |
|---|---|
| `(empty)` | Slug-wide sweep — probe every AC across every slice in the slug. |
| `<target>` (single positional) | Focused probe on the target string (see Step 2 — Target resolution). |

There are no flags — probe takes a slug and an optional target string. It always surfaces incidental defects it observes (focus behavior) and drives every adapter the repo matches (intersected with the confirmed stack).

# Step 0 — Orient (MANDATORY)

1. **Read `.ai/workflows/<slug>/00-index.md`.** Parse `branch`, `selected-slice`, `current-stage`, `status`, `workflow-files`, `runtime-evidence-deferrals` (if present), `compressed-slices` (if present), and the **`stack:` block** (written by `$wf intake` Step 0.5 and confirmed in Batch B). The `stack:` block — when `user-confirmed: true` — narrows adapter selection in Step 3 and tooling choice during drive/observe.
2. **Read the slice index `03-slice.md`** (or the compressed-mode equivalent — `01-quick.md` for `workflow-type: quick`). Note every slice slug and the slug's source-mode (standard / compressed / forwarded / change-mode). The compressed-lifecycle change-modes (`workflow-type: fix` / `hotfix` / `refactor` / `update-deps`) write a STANDARD `03-slice.md` (`type: slice-index`, usually one slice), so this step is unchanged for them — but their lead is `01-<mode>.md` (`01-fix.md` / `01-hotfix.md` / `01-refactor.md` / `01-update-deps.md`), not `01-quick.md`.
3. **Read every per-slice file** referenced from the slice index. These carry the AC that the slug-wide sweep partitions against. For compressed and forwarded modes, the AC lives in the single source artifact (`01-quick.md`, `01-rca.md`, `01-investigate.md`). For change-mode the AC lives in the lead `01-<mode>.md` plus the standard `03-slice.md` / `04-plan.md`.
4. **Read `../../wf/reference/runtime-adapters.md`** for the adapter registry — bootstrap, drive, observe, teardown recipes per platform.
5. **Stack awareness (advisory — probe is observational by nature).** Probe's job is to drive the running artifact, so it cannot refuse to run when `stack:` is missing. But it MUST be honest about provenance:
   - **If `stack:` is missing entirely** → emit a one-line chat warning: *"`stack:` is not set on `<slug>`. Probe will run adapter detection cold; consider running `$wf intake <slug>` to capture stack so future runs respect PO intent."* Set `stack-source: probe-detected-from-repo` in the slice frontmatter. Proceed.
   - **If `stack.user-confirmed: false`** → emit the same warning text but referencing unconfirmed-auto-detect; set `stack-source: unconfirmed-auto-detect` in the slice frontmatter. Proceed.
   - **If `stack.user-confirmed: true`** → set `stack-source: confirmed` in the slice frontmatter. Step 3 below will intersect probe's matched adapters with `stack.platforms` and surface any divergence as an artifact-level signal (not a stop).
   - In all cases, record the `stack:` block (verbatim or just the keys consulted) under `## Stack context` in the probe slice body so a reader can reconcile what probe saw against what intake confirmed.
6. **Capture the target** from `$ARGUMENTS` per the argument grammar above: `target` = the single positional target string, or `slug-wide` if none was given.

# Step 1 — Branch posture (MANDATORY before bootstrap)

`probe` is the one `$wf` skill that intentionally breaks the "one-line invocation" ergonomic when the working tree is not on the slug's branch. Probe runs cold more often than verify does — the user may have moved branches days ago and forgotten — and silently switching can clobber uncommitted work.

1. Run `git branch --show-current`. Call the result `current-branch`.
2. Compare against `00-index.md.branch`. Call that `slug-branch`.
3. **If `current-branch == slug-branch`** → proceed to Step 2.
4. **If `current-branch != slug-branch`** → ask the user directly in chat, presenting the options as a short numbered list:

```
Working tree is on `<current-branch>`, but workflow `<slug>` is on `<slug-branch>`. How should probe proceed?

1. Switch to <slug-branch> — Run `git switch <slug-branch>`. Refuses if uncommitted changes would be lost.
2. Run on <current-branch>, record in artifact (Recommended when you know why you're here) — Probe runs against whatever is checked out. Slice records `probed-on-branch: <current-branch>` so a future reader knows the artifact under test was not the slug's.
3. Abort — Stop the probe. No artifact written. User decides whether to switch branches or invoke probe later.
```

If the user chose **switch**: attempt `git switch <slug-branch>`. If git refuses due to uncommitted changes, surface the git error and stop — do not try to stash or force-switch.

If the user chose **run-and-record**: proceed to Step 2 with `probed-on-branch: <current-branch>` reserved for frontmatter.

If the user chose **abort**: write no artifact; emit a single chat line: `wf probe aborted: branch mismatch (<slug> on <slug-branch>, working tree on <current-branch>).`

# Step 2 — Target resolution (four layers, all run)

When `probe` receives a target string (a single positional, or default `slug-wide`), it does NOT pick a single interpretation. All four layers run; their results compose into the `target-resolution` block of the slice frontmatter.

For `slug-wide` invocations, layer 1 expands to "every AC in every slice file" — the other three layers do not apply.

For the non-empty target string `T`:

### Layer 1 — AC text match

Fuzzy-match `T` against the AC text of every `03-slice-*.md` (or compressed equivalent) read in Step 0. Use token-level overlap, ignoring case and stopwords. Threshold: at least 50% of `T`'s content words appear in the AC text.

- For every match, record `{slice: <slice-slug>, ac-id-or-quote: <text>, score: <0..1>}` in `target-resolution.matched-ac`.
- Observation phase will compare the captured runtime evidence to each matched AC's exact text.

### Layer 2 — Slice match

Match `T` against slice slugs and slice titles. Case-insensitive substring match.

- For every match, record the slice slug in `target-resolution.matched-slices`.
- Observation phase will scope the drive plan to only those slices' surfaces.

### Layer 3 — Surface inference

Extract surface hints from `T` using these heuristics:

- **Route hints** — strings starting with `/` (e.g., `/checkout`, `/api/users`). Record as `inferred-surfaces[].kind: route`.
- **Screen / page hints** — capitalized words paired with "screen", "page", "view", "panel", "drawer", "dialog" (e.g., "Login screen", "Settings page"). Record as `inferred-surfaces[].kind: screen`.
- **Command hints** — words preceded by a CLI prompt indicator (`$ `, `> `, `> npm`, `cargo run`, etc.) or bare command names that match `package.json` `bin` keys. Record as `inferred-surfaces[].kind: command`.
- **Endpoint hints** — `GET /...`, `POST /...`, `<METHOD> /<path>`. Record as `inferred-surfaces[].kind: endpoint`.

Each inferred surface narrows which adapter entry points to drive in Step 4. A route hint points the `web` adapter at that route; a screen hint points `android`/`ios` adapters at a navigation flow targeting that screen; etc.

### Layer 4 — Ad-hoc criterion

If Layers 1–3 produced no usable results (no matched AC, no matched slice, no inferred surfaces), the target is treated as a new criterion declared at probe time:

- Set `target-resolution.ad-hoc: true`.
- The criterion text used for comparison during observation is `T` verbatim.

Ad-hoc targets are not failures — they are data. The slice records them and the user can decide later whether to promote an ad-hoc target to a formal AC on the original slice (via `$wf-meta amend`).

# Step 3 — Adapter selection

1. **Match adapters.** Run every adapter's detection signal (from `runtime-adapters.md`) against the repo. Collect every match into `matched-adapters: [<key>, ...]`.
2. **Stack intersection (when `stack-source: confirmed`).** If Step 0 set `stack-source: confirmed`, compute `stack-intersected-adapters = matched-adapters ∩ stack.platforms` from `00-index.md`.
   - **Divergence handling** — record both sets in the slice frontmatter as `matched-adapters` and `stack-intersected-adapters`. If they differ, set `stack-adapter-divergence: true` and add a `## Stack divergence` note to the slice body listing which adapters were excluded and why. Divergence is a signal, not a stop — the PO may want probe to surface unexpected platforms (e.g., an Android repo that has accidentally grown a web admin tool).
   - **Default behavior on divergence** — probe drives `stack-intersected-adapters` (the PO's confirmed surfaces). If the intersection is empty (detection found platforms but none are in `stack.platforms`), drive `matched-adapters` anyway and set `stack-adapter-divergence-mode: full-bypass` — probe must not refuse to observe, but the artifact records that the run bypassed the confirmed stack.
   - **When `stack-source: unconfirmed-auto-detect` or `probe-detected-from-repo`** → skip intersection entirely. `adapters-used` defaults to `matched-adapters`. The artifact's `stack-source` already records that no intersection was authoritative.
3. **Run the appropriate set.** `adapters-used = stack-intersected-adapters` (when stack is confirmed and the intersection is non-empty), else `adapters-used = matched-adapters`. Probe always drives every adapter in that set.
4. **No matches → ad-hoc adapter unavailable.** If `matched-adapters` is empty, write a probe slice with `status: awaiting-environment`, `bootstrap-failure: { step: adapter-detection, remediation: "No runtime adapter matched this repo. Add detection signals for a new platform to runtime-adapters.md, or run probe in a directory containing a recognized project." }`. Skip Steps 4 and 5.

# Step 4 — Two-phase bootstrap

For each adapter in `adapters-used`, run its `Bootstrap` section from `runtime-adapters.md`.

### Phase 1 — Active resolution

For each bootstrap step in order:

1. Run the step.
2. If success → continue to the next step.
3. If failure → consult the adapter's `Resolution attempts before failing` line (if present) and attempt the documented resolution. Retry the original step once.
4. If still failure → enter Phase 2 for this adapter.

Bootstrap steps may take meaningful time (emulator boot, dev server warm-up). Allow each step its documented timeout before declaring failure.

### Phase 2 — Graceful fail with awaiting-environment slice

When any adapter's bootstrap fails after resolution attempts:

1. Capture the failure details:
   - `step` — which bootstrap step failed
   - `exit-code` — the failing command's exit code (or `null` for timeouts)
   - `output-tail` — the last 20 lines of stderr/stdout from the failing step
   - `remediation` — the one-line hint from the adapter's `Remediation hints` section matched to this `step`
2. **If `adapters-used` has only one entry** OR **all adapters in `adapters-used` failed bootstrap** → write the probe slice with `status: awaiting-environment` and the full `bootstrap-failure` block. Skip Step 5. Re-running probe after the user fixes the environment will retry bootstrap and proceed.
3. **If `adapters-used` has multiple entries and only some failed** → record the failures under `partial-bootstrap-failures` but proceed to Step 5 with the adapters that did boot. The slice will carry both findings (from the booted adapters) and the partial bootstrap failures (so the user knows some surfaces were not driven).

The artifact in case of full bootstrap failure looks like:

```yaml
---
type: slice
slice-type: probe
status: awaiting-environment
slug: <slug>
slice-slug: probe-<descriptor>
probe-target: "<verbatim or 'slug-wide'>"
adapters-used: [<key>, ...]
bootstrap-failure:
  step: <step-name>
  exit-code: <code or null>
  output-tail: |
    <last 20 lines of stderr/stdout>
  remediation: "<one-line hint>"
findings-count: 0
recommended-next: "Re-run $wf probe <slug> after applying the remediation hint."
---

# Compressed Slice: probe (awaiting environment)

Generated by `$wf probe` on <iso-date>. Bootstrap could not complete.

## What was attempted

<one paragraph: which adapter, which bootstrap step, what was the user's target>

## What failed

<step name + exit code + the captured output tail + remediation hint>

## Why this matters

This artifact records that a probe was attempted. Re-running picks up where it left off. The slug's history captures that a runtime check was attempted on <date> even though it could not complete — the gap is visible rather than silent.
```

# Step 5 — Drive and observe (Phase 1 succeeded)

For each adapter in `adapters-used` whose bootstrap completed:

1. **For each entry in `target-resolution`** (or every AC across the slug when `target == slug-wide`):
   a. Follow the adapter's `Drive` section to perform the user actions implied by the target/AC text.
   b. Follow the adapter's `Observe` section to capture observable output (screenshot, stdout, response body, log lines).
   c. Write the evidence to `.ai/workflows/<slug>/probe-evidence/<descriptor>/<target-or-ac-slug>.<ext>` per the adapter's `Evidence layout`.
   d. **Read the evidence** (multimodal for visuals, parsed for textual) and compare to the target/AC text.
   e. Record `{target-or-ac, adapter, evidence-path, observation, result: pass | fail | partial}`.

2. **Incidental observations.** You may notice defects not directly tied to the current target/AC but observed during navigation — a console error during a click, a crash on a screen visited en route, an HTTP 500 from a background request. Record them in the main `## Findings` section with a `severity: incidental` tag; they count toward `findings-count`. A runtime probe that walked past an obvious crash and stayed silent would be dishonest.

3. **Tear down.** For each adapter, run its `Tear down` section. Idempotent — re-runs of probe must not leave the environment dirtier each pass.

# Step 6 — Synthesize and write the compressed probe slice

Write `.ai/workflows/<slug>/03-slice-probe-<descriptor>.md`.

**Descriptor derivation:**
- If `target` is a single short string (≤5 words after slugification) → `<descriptor>` is the slugified target.
- If `target == slug-wide` → `<descriptor>` is `slug-wide-<utc-date>` (e.g., `slug-wide-2026-05-16`).
- Collision: append `-2`, `-3`, … until unique.

**Frontmatter:**

```yaml
---
schema: sdlc/v1
type: slice
slug: <slug>
slice-slug: probe-<descriptor>
slice-type: probe
compressed: true
origin: probe
stage-number: 3
status: complete | awaiting-environment
complexity: xs
created-at: "<iso-8601 from `date -u +"%Y-%m-%dT%H:%M:%SZ"`>"
updated-at: "<same>"

probe-target: "<verbatim user string or 'slug-wide'>"
target-resolution:
  matched-ac:
    - { slice: <slice-slug>, ac-id-or-quote: "<text>", score: <0..1> }
  matched-slices: [<slice-slug>, ...]
  inferred-surfaces:
    - { kind: route | screen | command | endpoint, value: "<text>" }
  ad-hoc: <true|false>

adapters-used: [<key>, ...]
matched-adapters: [<key>, ...]          # full list from detection; adapters-used is this intersected with the confirmed stack
partial-bootstrap-failures: []          # list of {adapter, step, remediation} when only some adapters failed

probed-on-branch: <branch-name>         # only set when user chose run-and-record at Step 1
evidence-dir: ".ai/workflows/<slug>/probe-evidence/<descriptor>/"
bootstrap-failure: <object|null>        # set when status == awaiting-environment

findings-count: <N>
findings-severity:
  critical: <N>
  high: <N>
  medium: <N>
  low: <N>
  incidental: <N>                       # defects noticed off-target during navigation

recommended-next: "$wf plan <slug> probe-<descriptor>" | "$wf intake fix <slug> probe-<descriptor>" | "$wf-meta status <slug>" | "<re-run instruction>"

depends-on: []
tags: [probe]
refs:
  index: 00-index.md
  slice-index: 03-slice.md              # OMIT this key if 03-slice.md does not exist
  adapters: "../../wf/reference/runtime-adapters.md"
---
```

**Body sections (in order):**

```markdown
# Compressed Slice: probe

Generated by `$wf probe` on <iso-date> against slug `<slug>`.

## The Probe
<!-- STORY SECTION — first, and self-sufficient. A reader who reads only this section understands what was produced, the load-bearing decisions and counts, and the top risk; the structured sections below are drill-down, not a substitute. Write it in the voice defined in `_narrative-voice.md` (Sebastian Raschka register: relevance first, why before how, tradeoffs stated plainly, varied rhythm — NO "This {NOUN} implements…" openings). 1–4 short paragraphs. -->

## 1. What was probed

The verbatim `probe-target` string (or `slug-wide` if omitted).

## 2. How the target was interpreted

Render `target-resolution` as human-readable bullets:
- Layer 1 (AC text match): N matches across <slices>
- Layer 2 (Slice match): <slice-slugs> or "none"
- Layer 3 (Surface inference): <surfaces> or "none"
- Layer 4 (Ad-hoc): <true|false> — when true, explain that the target was not in any AC.

## 3. Adapters

List `adapters-used` with one line per adapter on what was driven. Note any `partial-bootstrap-failures`.

## 4. Observations

For each target/AC observed, render:
- **Target / AC**: quoted text
- **Adapter**: <key>
- **Evidence**: `<evidence-dir>/<file>` (link)
- **What was observed**: 1-3 sentences describing the captured output
- **Result**: pass / fail / partial / runtime-evidence-missing

## 5. Findings

For each finding, render:
- **Severity**: critical / high / medium / low / incidental
- **Surface**: which adapter + which target/AC
- **Defect**: what is broken
- **Evidence**: path to captured evidence
- **Suggested fix shape**: 1-3 lines naming the area and approach. NOT a plan.

If `findings-count == 0`: write "No findings. The probed surface(s) match the declared promises."

## 6. Tripwires (only if any fired)

Tripwires for probe:
- **Multi-adapter divergence** — adapters disagree about whether the same AC is met (e.g., service test passes, web UI shows broken state).
- **Same-pattern-elsewhere** — a defect found on one target appears to repeat in surfaces not in the current probe scope.
- **Bootstrap partial-failure** — at least one adapter could not boot but others did.
- **Ad-hoc-target-not-in-AC** — the user probed something that no existing AC describes. The user may want to amend the slice that owns the surface to add this AC formally.

For each fired tripwire, write one line: `[tripwire-name]: <what specifically tripped it>`.

## 7. Recommended next command

Routing logic:

| Condition | Recommendation |
|---|---|
| `findings-count: 0` AND no tripwires fired | `$wf-meta status <slug>` — slug is genuinely ready; status will surface "runtime-evidence-status: clean" |
| Findings exist, severity ≤ high, fits in ≤3 files | `$wf intake fix <slug> probe-<descriptor>` |
| Findings exist, severity ≥ high OR cross-cutting OR multi-adapter divergence | `$wf plan <slug> probe-<descriptor>` |
| `status: awaiting-environment` | Re-run probe after applying the remediation hint. |
| `interactive-verification: deferred` on the original slice was the trigger | Recommend the appropriate fix skill per above; additionally instruct that clearing the deferral happens when the new fix slice's verify produces matching evidence — the `00-index.md` `runtime-evidence-deferrals[].cleared-by` field is updated by verify, not by probe. |

State the recommendation with one sentence of justification. List alternates in priority order. User makes the final call.
```

## Step — Write free narrative fragments

Beyond the structured page, this artifact ships one or more **free narrative fragments**: `<stem>.<NN-label>.html.fragment` siblings of **unrestricted raw HTML** that tell a story the rendered page can't on its own — a bespoke diagram, a before/after flow, a state machine, an annotated mock, or an interactive widget. Author **as many as the story needs**; there is **no contract, no scoping, and no sibling `.yaml`** for these. Prefix the label with `NN-` (`01-`, `02-`, …) to order them; they inject raw-inline below the page body. See [_fragment-authoring.md](../../wf/reference/_fragment-authoring.md) Step F2 and [narrative-fragments.md](../../../references/narrative-fragments.md).

# Step 7 — Clear deferrals (when applicable)

If `runtime-evidence-deferrals` in `00-index.md` contains entries whose `cleared-by: null` and whose `slice` appears in `target-resolution.matched-slices`:

- For each matched deferral, check whether the probe produced evidence that satisfies the deferred user-observable AC.
- If yes, update `cleared-by: probe-<descriptor>` in `00-index.md.runtime-evidence-deferrals`. The deferral is now cleared.
- If no (probe ran but the AC still has no positive evidence), leave `cleared-by: null` and surface this in the slice's `## Tripwires` section.

This is the one mutation `probe` makes to `00-index.md` beyond the standard slug-mode bookkeeping (workflow-files, compressed-slices, updated-at). The mutation is additive — clearing a deferral does not remove the entry, only updates its status.

# Step 8 — Index bookkeeping (per the standard slug-mode contract)

Per `reference/_compressed-slice.md`:

1. Append `03-slice-probe-<descriptor>.md` to `00-index.md.workflow-files`.
2. Append `{slug: probe-<descriptor>, slice-type: probe, created-at: "<iso>"}` to `00-index.md.compressed-slices`.
3. Update `00-index.md.updated-at`.
4. If `03-slice.md` exists, append `{slug: probe-<descriptor>, status: defined, slice-type: probe, compressed: true}` to `slices`, bump `total-slices`, update `updated-at`.
5. Rewrite the `updated-at` column on `<slug>`'s row in `.ai/workflows/INDEX.md`.

Do NOT modify `current-stage`, `selected-slice`, `status`, `branch`, or `progress` on `00-index.md`. The probe slice is additive — it does not advance the main lifecycle.

# Step 9 — Hand off to user

Lead with a short **narrative** paragraph (prose, no bullets) telling the story — what was found, built, or measured, and what it means for the user — then the structured anchors below.

Emit a compact chat summary:

```
wf probe complete: <slug>
Target: <probe-target>
Adapters: <adapters-used>
Findings: <findings-count> (critical: <N>, high: <N>, medium: <N>, low: <N>)
Tripwires: <none | comma-separated list>
Deferrals cleared: <N>
Recommended next: <skill> — <one-sentence justification>
Probe slice: .ai/workflows/<slug>/03-slice-probe-<descriptor>.md
```

If `status: awaiting-environment`, replace the body with:

```
wf probe blocked: <slug>
Bootstrap failed at: <adapter>/<step>
Remediation: <hint>
Probe slice: .ai/workflows/<slug>/03-slice-probe-<descriptor>.md
Re-run after applying the remediation.
```

# Routing notes (read carefully)

- **`$wf plan <slug> probe-<descriptor>` is the default downstream path** when findings exist and are non-trivial. The probe slice acts as the input artifact for planning, exactly as an `rca` slice does.
- **`$wf intake fix <slug> probe-<descriptor>`** for small fixes that fit ≤3 files. Same slug-mode pattern as routing from `rca`.
- **Deferral clearing** happens at verify time, not at probe time — probe writes evidence, verify reads the evidence and updates `cleared-by`. The exception is Step 7 above, where probe directly clears a deferral whose matched AC was successfully observed during this run.
- **No auto-fix.** Probe reports; downstream skills fix. This matches the discipline `rca` already enforces.

# What this skill is NOT

- **Not a fixer** — probe writes observations and findings, not patches.
- **Not a static analyzer** — that's `rca`. The two are siblings on different axes.
- **Not a forward-path gate** — that's `$wf verify`'s interactive sub-agent 3, which now refuses `result: pass` without runtime evidence. Probe is the backward re-entry counterpart for already-done slugs.
- **Not platform-specific** — every platform-specific recipe lives in `runtime-adapters.md`. Probe stays platform-agnostic at this level.
