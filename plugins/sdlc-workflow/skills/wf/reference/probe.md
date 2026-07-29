---
description: Runtime-truth verification — drives a running artifact through acceptance criteria (or a free-form target), captures observable output, reads it, compares against AC text, and writes findings as a compressed slice. Two modes: TARGET (compare to AC text) and `sweep` (exhaustive surface fan-out compared to AC + charter constraints + the shared defect taxonomy; runs with or without a slug). Sibling of rca (static diagnosis); probe is runtime detection. Does NOT write a fix.
argument-hint: <slug> [target|sweep] | sweep [path]
---

# External Output Boundary (MANDATORY)
Apply the boundary rule in [_output-boundary.md](_output-boundary.md) to every external-facing output
this operation produces: translate workflow context to product language and leak-check before publishing.

> **Standing steering (steer.md).** Before Step 0 work, read the active workflow's `steer.md` if it
> exists and apply the contract in [_steering.md](_steering.md): honor the user's standing instructions, never
> above a MANDATORY gate, and inject the relevant entries into every sub-agent prompt you dispatch.

You are running `/wf probe`: drive the running artifact, capture evidence, report findings. No fixes.

# Slug-mode contract (read before proceeding)

`probe` is **slug-mode only** — it always operates on an existing slug from `.ai/workflows/INDEX.md`; runtime-truth verification only makes sense against already-implemented work.

The `/wf` dispatcher routes `/wf probe`; **probe is slug-only, so a compressed slice is always the output** — follow `${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/_compressed-slice.md` for exact slice frontmatter and index bookkeeping.

- **One artifact, in the existing workflow.** Write `.ai/workflows/<slug>/03-slice-probe-<descriptor>.md` (collision suffix `-2`, `-3` if needed).
- **Same content discipline** (research depth, evidence quality, recommendation logic) — only the output destination changes.
- **No new workflow, no new branch, no `01-probe.md`, no new top-level `00-index.md`.** The slug already owns those.
- **Index updates** follow the shared compressed-slice contract — see `${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/_compressed-slice.md`.

# Position among the /wf runtime commands

`probe` fills the missing cell in this 2x2:

| | Forward gate (per-slice) | Backward re-entry (slug-wide) |
|---|---|---|
| **Static** | lint/types/tests in `/wf verify` | `rca` (read-only static diagnosis of a reported symptom) |
| **Runtime** | interactive sub-agent in `/wf verify` (gated, refuses pass without runtime evidence) | **`probe` (this command — runtime detection of reported or unreported symptoms)** |

`probe` is to `rca` what runtime is to static: `rca` reads code and git history; `probe` runs the artifact and observes it.

# CRITICAL — execution discipline
You are a **runtime observer**, not a fixer.
- Output: the compressed probe slice and index bookkeeping only. Do NOT edit application code, propose a patch, or run mutating commands beyond what the adapter's bootstrap section authorizes (start dev server, boot emulator, build + install — these are authorized).
- You may drive the running artifact (clicks, taps, HTTP requests, CLI invocations). You may NOT edit source files.
- "Suggested fix shape" in the slice body is **direction, not a plan** — 1 to 3 lines naming the area and approach.
- Follow the steps below exactly in order. Do not skip, reorder, or combine steps.

# Argument grammar

The dispatcher has consumed the first positional argument (the slug). What remains:

| Form | Meaning |
|---|---|
| `(empty)` | Slug-wide sweep — probe every AC across every slice in the slug. |
| `<target>` (single positional) | Focused probe on the target string (see Step 2 — Target resolution). |
| `sweep` (reserved keyword) | **Sweep mode** — enumerate the whole user surface and compare it against AC + charter constraints + the defect taxonomy. Not a target string. |

Probe owns its own **first-token resolution**: if the first token is the reserved word `sweep`, the run is **slug-less** (`/wf probe sweep [path]`) — no workflow required, output is a project-level `.ai/surface-sweep-<utc-date>.md`, no `00-index.md` mutation and no workflow bookkeeping (same shape as `.ai/ship-plan-audit.md`). Otherwise the first token is a slug and `sweep` may appear as the second token. `sweep` is reserved in both positions; every other string is a target.

No flags — probe takes a slug and an optional target string. It always surfaces incidental defects observed during navigation and drives every adapter the repo matches (intersected with the confirmed stack).

> **Auto second opinion (objective triggers).** After observing (before synthesizing),
> **auto-invoke** `/consult codex <give an independent read of this runtime evidence against the
> AC>` (pinning `codex`/`claude` keeps it free) when ANY of: (a) the evidence is ambiguous against
> the AC — no clean pass/fail; (b) the probe's verdict would clear a registered
> runtime-evidence-deferral (its read unblocks ship, so it deserves two readers); (c) the
> observation contradicts an earlier verify result. Skip only when none of the triggers hold; the
> user may invoke it explicitly with any provider.

# Step 0 — Orient (MANDATORY)

1. **Read `.ai/workflows/<slug>/00-index.md`.** Parse `branch`, `selected-slice`, `current-stage`, `status`, `workflow-files`, `runtime-evidence-deferrals` (if present), `compressed-slices` (if present), the **`charter:` block** (the PO-ratified constraints — see Step 5's comparison basis; ACs are per-slice and expire, constraints are durable and cross-slice, so a runtime observer that reads only AC is checking the receipts and ignoring the contract), and the **`stack:` block** (written by `/wf intake` Step 0.5, confirmed in Batch B). When `user-confirmed: true`, it narrows adapter selection in Step 3 and tooling choice during drive/observe.
2. **Read the slice index `03-slice.md`** (or `01-quick.md` for `workflow-type: quick`). Note every slice slug and source-mode (standard / compressed / forwarded / change-mode). Change-modes (`workflow-type: fix` / `hotfix` / `refactor` / `update-deps`) write a STANDARD `03-slice.md` (one slice), so this step is unchanged — but their lead is `01-<mode>.md`, not `01-quick.md`.
3. **Read every per-slice file** referenced from the slice index. For compressed and forwarded modes, AC lives in the single source artifact (`01-quick.md`, `01-rca.md`). For change-mode, AC lives in the lead `01-<mode>.md` plus `03-slice.md` / `04-plan.md`. (`investigate` is terminal — no build, so nothing to probe in place.)
4. **Read `${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/runtime-adapters.md`** for bootstrap, drive, observe, teardown recipes per platform.
5. **Stack awareness (advisory).** Probe cannot refuse to run when `stack:` is missing, but MUST be honest about provenance:
   - **If `stack:` is missing entirely** → emit: *"`stack:` is not set on `<slug>`. Probe will run adapter detection cold; consider running `/wf intake <slug>` to capture stack so future runs respect PO intent."* Set `stack-source: probe-detected-from-repo`. Proceed.
   - **If `stack.user-confirmed: false`** → emit the same warning referencing unconfirmed-auto-detect; set `stack-source: unconfirmed-auto-detect`. Proceed.
   - **If `stack.user-confirmed: true`** → set `stack-source: confirmed`. Step 3 intersects matched adapters with `stack.platforms` and surfaces any divergence as an artifact-level signal (not a stop).
   - In all cases, record the `stack:` block under `## Stack context` in the probe slice body so a reader can reconcile what probe saw against what intake confirmed.
6. **Capture the target** from `$ARGUMENTS` per the argument grammar above: `target` = the single positional target string, or `slug-wide` if none was given.
7. **Run the clearing-event tripwire.** For every open deferral (`cleared-by: null`) carrying a `clearing-probe`, execute that **one** recorded side-effect-free command with a short timeout. A hit means the event this deferral is waiting on has *already happened* — say so up front and prioritise that deferral in this run, because probe is the actor most clearing events name. Never improvise a substitute command, never edit `00-index.md` here (Step 7 owns the clearing mutation), and treat a miss as ordinary state, not a finding. An entry with no recorded probe is simply un-watched — note it in `## Tripwires` so the next verify can add one.

8. **Read `${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/_surface-defects.md`.** MANDATORY in `sweep` mode, advisory in target mode (its classes are what Step 5.2 records incidentals against). It supplies the defect classes, the severity discipline, and the decidability boundary.
9. **Declare decidability BEFORE driving (MANDATORY in `sweep` mode).** Using the standing not-observable set in `_surface-defects.md`, state which classes of correctness this artifact makes observable and which it does not, and where each unobservable class routes. Record it as the `decidability:` frontmatter block. When the artifact's **primary** correctness class is not observable (a ranking/generative system, a long-horizon pipeline), say so FIRST — at the top of the artifact and in the chat return, before any finding — so a clean wrapper report never reads as a verdict on the thing the wrapper wraps.

# Step 1 — Branch posture (MANDATORY before bootstrap)

`probe` intentionally breaks the "one-line invocation" ergonomic when the working tree is not on the slug's branch. Probe runs cold more often than verify — the user may have moved branches and forgotten — and silently switching can clobber uncommitted work.

1. Run `git branch --show-current`. Call the result `current-branch`.
2. Compare against `00-index.md.branch`. Call that `slug-branch`.
3. **If `current-branch == slug-branch`** → proceed to Step 2.
4. **If `current-branch != slug-branch`** → call `AskUserQuestion`:

```yaml
question: "Working tree is on `<current-branch>`, but workflow `<slug>` is on `<slug-branch>`. How should probe proceed?"
header: "Branch posture"
options:
  - { label: "Switch to <slug-branch>",                  description: "Run `git switch <slug-branch>`. Refuses if uncommitted changes would be lost." }
  - { label: "Run on <current-branch>, record in artifact (Recommended when you know why you're here)", description: "Probe runs against whatever is checked out. Slice records `probed-on-branch: <current-branch>` so a future reader knows the artifact under test was not the slug's." }
  - { label: "Abort",                                    description: "Stop the probe. No artifact written. User decides whether to switch branches or invoke probe later." }
multiSelect: false
```

**switch**: attempt `git switch <slug-branch>`. If git refuses due to uncommitted changes, surface the error and stop — do not stash or force-switch.

**run-and-record**: proceed to Step 2 with `probed-on-branch: <current-branch>` reserved for frontmatter.

**abort**: write no artifact; emit: `wf probe aborted: branch mismatch (<slug> on <slug-branch>, working tree on <current-branch>).`

# Step 2 — Target resolution (four layers, all run)

**`sweep` mode skips this step entirely** — it has no target to resolve. Set `target-resolution: {sweep: true}` and go to Step 3; the comparison basis is AC + charter + taxonomy (Step 5), not a resolved target. Slug-less sweeps have no AC and no charter, so their `comparison-basis` is `[taxonomy]` and the artifact says so.

All four layers always run; their results compose into the `target-resolution` block of the slice frontmatter. For `slug-wide` invocations, layer 1 expands to "every AC in every slice file" — the other three layers do not apply.

For the non-empty target string `T`:

### Layer 1 — AC text match

Fuzzy-match `T` against the AC text of every `03-slice-*.md` (or compressed equivalent) read in Step 0. Use token-level overlap, ignoring case and stopwords. Threshold: at least 50% of `T`'s content words appear in the AC text.

- Record each match as `{slice: <slice-slug>, ac-id-or-quote: <text>, score: <0..1>}` in `target-resolution.matched-ac`. Observation compares runtime evidence to each matched AC's exact text.

### Layer 2 — Slice match

Match `T` against slice slugs and slice titles (case-insensitive substring).

- Record each match's slug in `target-resolution.matched-slices`. Observation scopes the drive plan to those slices' surfaces.

### Layer 3 — Surface inference

Extract surface hints from `T` using these heuristics:

- **Route hints** — strings starting with `/` (e.g., `/checkout`, `/api/users`). Record as `inferred-surfaces[].kind: route`.
- **Screen / page hints** — capitalized words paired with "screen", "page", "view", "panel", "drawer", "dialog" (e.g., "Login screen", "Settings page"). Record as `inferred-surfaces[].kind: screen`.
- **Command hints** — words preceded by a CLI prompt indicator (`$ `, `> `, `> npm`, `cargo run`, etc.) or bare command names that match `package.json` `bin` keys. Record as `inferred-surfaces[].kind: command`.
- **Endpoint hints** — `GET /...`, `POST /...`, `<METHOD> /<path>`. Record as `inferred-surfaces[].kind: endpoint`.

Each inferred surface narrows adapter entry points in Step 4 (route hint → `web` adapter; screen hint → `android`/`ios` navigation flow; etc.).

### Layer 4 — Ad-hoc criterion

If Layers 1–3 produced no usable results (no matched AC, no matched slice, no inferred surfaces), the target is treated as a new criterion declared at probe time:

- Set `target-resolution.ad-hoc: true`.
- The criterion text used for comparison during observation is `T` verbatim.

Ad-hoc targets are not failures — they are data. The user can promote one to a formal AC via `/wf plan <slug> <slice>` (unbuilt slice) or `/wf intake <slug> <scope>` (new slice); there is no in-place amend.

# Step 3 — Adapter selection

1. **Match adapters.** Run every adapter's detection signal (from `runtime-adapters.md`) against the repo. Collect matches into `matched-adapters: [<key>, ...]`.
2. **Stack intersection (when `stack-source: confirmed`).** Compute `stack-intersected-adapters = matched-adapters ∩ stack.platforms` from `00-index.md`.
   - **Divergence** — record both sets in the slice frontmatter. If they differ, set `stack-adapter-divergence: true` and add `## Stack divergence` listing excluded adapters. Divergence is a signal, not a stop (the PO may want probe to surface unexpected platforms).
   - **Default on divergence** — probe drives `stack-intersected-adapters`. If the intersection is empty, drive `matched-adapters` and set `stack-adapter-divergence-mode: full-bypass`; the artifact records the bypass.
   - **When `stack-source: unconfirmed-auto-detect` or `probe-detected-from-repo`** → skip intersection. `adapters-used` defaults to `matched-adapters`.
3. **Run the appropriate set.** `adapters-used = stack-intersected-adapters` (confirmed stack, non-empty intersection), else `matched-adapters`. Probe drives every adapter in that set.
4. **No matches → ad-hoc adapter unavailable.** If `matched-adapters` is empty, write a probe slice with `status: awaiting-environment`, `bootstrap-failure: { step: adapter-detection, remediation: "No runtime adapter matched this repo. Add detection signals for a new platform to runtime-adapters.md, or run probe in a directory containing a recognized project." }`. Skip Steps 4 and 5.

5. **Enumerate the surface (MANDATORY in `sweep` mode, after bootstrap).** Climb the **surface enumeration ladder** in `runtime-adapters.md` — `recipe` (the adapter's `Enumerate` section) → `static` (read the nav/route model in source) → `traversal` (bounded breadth-first drive) → `named` (caller supplies the list). Record the rung reached as `surface-coverage.enumeration-method`. **An adapter with no `Enumerate` recipe is NOT unsupported** — it sweeps at rung 2 or 3 at a declared, lower-confidence denominator. A `traversal` count is a FLOOR, not a total, and must be described as such **wherever it is rendered** (artifact AND chat return).

# Step 4 — Two-phase bootstrap

For each adapter in `adapters-used`, run its `Bootstrap` section from `runtime-adapters.md`.

### Phase 1 — Active resolution

For each bootstrap step in order:

1. Run the step.
2. If success → continue to the next step.
3. If failure → consult the adapter's `Resolution attempts before failing` line (if present) and attempt the documented resolution. Retry the original step once.
4. If still failure → enter Phase 2 for this adapter.

Allow each step its documented timeout before declaring failure.

### Phase 2 — Graceful fail with awaiting-environment slice

When any adapter's bootstrap fails after resolution attempts:

1. Capture the failure details:
   - `step` — which bootstrap step failed
   - `exit-code` — the failing command's exit code (or `null` for timeouts)
   - `output-tail` — the last 20 lines of stderr/stdout from the failing step
   - `remediation` — the one-line hint from the adapter's `Remediation hints` section matched to this `step`
2. **If only one adapter or all adapters failed bootstrap** → write the probe slice with `status: awaiting-environment` and the full `bootstrap-failure` block. Skip Step 5. Re-running after the user fixes the environment retries bootstrap.
3. **If multiple adapters and only some failed** → record failures under `partial-bootstrap-failures` and proceed to Step 5 with the booted adapters. The slice carries both findings and partial bootstrap failures.

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
recommended-next: "Re-run /wf probe <slug> after applying the remediation hint."
---

# Compressed Slice: probe (awaiting environment)

Generated by `/wf probe` on <iso-date>. Bootstrap could not complete.

## What was attempted

<one paragraph: which adapter, which bootstrap step, what was the user's target>

## What failed

<step name + exit code + the captured output tail + remediation hint>

## Why this matters

Records that a probe was attempted on <date>. Re-running picks up where it left off; the gap is visible rather than silent.
```

# Step 5 — Drive and observe (Phase 1 succeeded)

For each adapter in `adapters-used` whose bootstrap completed:

1. **For each entry in `target-resolution`** (or every AC when `target == slug-wide`):
   a. Follow the adapter's `Drive` section to perform the user actions implied by the target/AC.
   b. Follow the adapter's `Observe` section to capture observable output (screenshot, stdout, response body, log lines).
   c. Write evidence to `.ai/workflows/<slug>/probe-evidence/<descriptor>/<target-or-ac-slug>.<ext>` per the adapter's `Evidence layout`.
   d. **Read the evidence** (multimodal for visuals, parsed for textual) and compare to the target/AC text.
   e. Record `{target-or-ac, adapter, evidence-path, observation, result: pass | fail | partial}`.

1a. **Comparison basis (MANDATORY).** Every observation is compared against, in order:
   a. the matched **AC text** (target mode) or every AC in the slug (`sweep`);
   b. every **charter constraint** whose subject the observation touches — a violation is a finding at the constraint's own weight whether or not any AC covers it. Record the constraint id (e.g. `C4`) on the finding;
   c. every **defect class** in `_surface-defects.md` (`sweep` mode; advisory in target mode). Ask the class's detection question of each enumerated surface.
   Record which bases ran as `comparison-basis: [ac, charter, taxonomy]`.

1b. **Perturb (MANDATORY in `sweep` mode where authorized).** After the happy path is observed, follow the adapter's `Perturb` section and the shared perturbation protocol: break exactly one dependency, re-observe, restore. This is the only way to find `dependency-collapse` and `branch-gap` on purpose rather than by luck. Never perturb a shared or production backend without explicit authorization — record what was skipped and why.

1c. **Re-observe before recording (MANDATORY).** Any finding above `low` whose evidence is a **single observation on an interactive surface** MUST be re-observed from a clean state (fresh launch, dismissed system UI, known route) before it is recorded. On divergence, downgrade or drop it and record the divergence under `retracted-findings`. Corroboration by two tools does NOT satisfy this — both tools observe the same corrupted state; only a clean-state re-observation does. See `env-interference` in `_surface-defects.md`.

2. **Incidental observations.** Record any defects noticed during navigation (console errors, crashes, HTTP 500s) in `## Findings` with `severity: incidental`; they count toward `findings-count`.

3. **Tear down.** Run each adapter's `Tear down` section. Idempotent — re-runs must not leave the environment dirtier each pass.

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

comparison-basis: [ac, charter, taxonomy]   # which bases ran; [taxonomy] alone when slug-less
environment-class: production | staging | local-emulated | mocked
surface-coverage:
  enumeration-method: recipe | static | traversal | named
  enumerated: <N>                       # a FLOOR when enumeration-method is `traversal`
  driven: <N>
  unreached:
    - { surface: "<name>", reason: "<why>", class: blocked | out-of-authority | not-decidable }
decidability:
  observable: [<defect classes this surface can be driven for>]
  not-observable:
    - { class: <kind of truth>, why: "<reason>", covered-by: "<other surface>" }
perturbations:                          # [] when none were authorized
  - { dependency: "<what was broken>", observed: "<what happened>", restored: true }
retracted-findings:                     # withdrawn after clean-state re-observation
  - { claim: "<what was first recorded>", why-withdrawn: "<what interfered>", evidence: "<path>" }

findings-count: <N>
findings-severity:
  critical: <N>
  high: <N>
  medium: <N>
  low: <N>
  incidental: <N>                       # defects noticed off-target during navigation

recommended-next: "/wf plan <slug> probe-<descriptor>" | "/wf intake fix <slug> probe-<descriptor>" | "/wf status <slug>" | "<re-run instruction>"

depends-on: []
tags: [probe]
refs:
  index: 00-index.md
  slice-index: 03-slice.md              # OMIT this key if 03-slice.md does not exist
  adapters: "${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/runtime-adapters.md"
---
```

**Body sections (in order):**

```markdown
# Compressed Slice: probe

Generated by `/wf probe` on <iso-date> against slug `<slug>`.

## The Probe
<!-- STORY SECTION — first, and self-sufficient. A reader who reads only this section understands what was produced, the load-bearing decisions and counts, and the top risk; the structured sections below are drill-down, not a substitute. Voice per `_narrative-voice.md` — no "This {NOUN} implements…" openings. 1–4 short paragraphs. -->

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

If `findings-count == 0`: write "No findings. The probed surface(s) match the declared promises." **In `sweep` mode that alone is insufficient** — a zero-finding sweep MUST also render the coverage table (enumerated / driven / unreached with reasons) and one line per defect class. Per `_surface-defects.md`, a class that produced no finding gets **one line**, never a paragraph of reassurance. "I found no bugs" is not a result; "I enumerated 6 surfaces, drove 6, and here are the 2 I could not reach and why" is.

## 6. Tripwires (only if any fired)

Tripwires for probe:
- **Multi-adapter divergence** — adapters disagree on whether the same AC is met (e.g., service test passes, web UI shows broken state).
- **Same-pattern-elsewhere** — a defect on one target appears to repeat in surfaces outside the current scope.
- **Bootstrap partial-failure** — at least one adapter could not boot but others did.
- **Ad-hoc-target-not-in-AC** — the user probed something no existing AC describes; consider adding this AC formally.

For each fired tripwire, write one line: `[tripwire-name]: <what specifically tripped it>`.

## 7. Recommended next command

Routing logic:

| Condition | Recommendation |
|---|---|
| `findings-count: 0` AND no tripwires fired | `/wf status <slug>` — slug is genuinely ready; status will surface "runtime-evidence-status: clean" |
| Findings exist, severity ≤ high, fits in ≤3 files | `/wf intake fix <slug> probe-<descriptor>` |
| Findings exist, severity ≥ high OR cross-cutting OR multi-adapter divergence | `/wf plan <slug> probe-<descriptor>` |
| `status: awaiting-environment` | Re-run probe after applying the remediation hint. |
| `interactive-verification: deferred` on the original slice was the trigger | Recommend the appropriate fix command per above; note that `runtime-evidence-deferrals[].cleared-by` is updated by verify, not by probe. |

State the recommendation with one sentence of justification. List alternates in priority order.
```

## Step — Write free narrative fragments

Author **free narrative fragments** for any beat the structured page can't tell — as many as the story needs. Follow [_fragment-authoring.md](../../wf/reference/_fragment-authoring.md) **Step F2** for the rules (unrestricted raw HTML, no contract or sibling `.yaml`, `NN-` label ordering).

# Step 7 — Clear deferrals (when applicable)

If `runtime-evidence-deferrals` in `00-index.md` contains entries whose `cleared-by: null` and whose `slice` appears in `target-resolution.matched-slices`:

- For each matched deferral, check whether the probe produced evidence that satisfies the deferred user-observable AC.
- **Direction check first:** if the deferred AC is a prove-fail-closed criterion (a gate/guard/health-check catching a failure — shape.md's direction rule), the probe evidence must show the *failure branch firing* (induced fault caught, bad input rejected). A green happy-path observation does NOT clear it — one "unhealthy revision caught" AC was once cleared by a healthy release, leaving the gate never exercised. On a direction mismatch, leave `cleared-by: null` and record in `## Tripwires` what evidence would qualify (the fault to inject).
- **Climb the env-remediation rung before leaving one uncleared.** Probe is the actor most deferrals name as their clearing event, so arriving and re-recording the same wall is the failure mode to avoid. Rebind a harness-owned service to a free port and record it (never leave a deferral standing over a port the run itself binds), boot the documented headless mode, start an existing AVD, run a provisioning script the repo ships — per runtime-adapters.md's rung, including its denylist: do not kill a process the run did not start, mutate host configuration, or patch product code.
- **Re-run the ownership triage on every wall that survives.** A deferral recorded `external` by an earlier run is a claim, not a fact. If the wall is `code-owned` (the repo's own hard-coded port/host/endpoint or fixture pins it), say so in `## Tripwires` and name the change that would dissolve it — a probe that reports "still blocked" over a constant in our own tree has found a scoping decision, not an environment.
- If yes, set `cleared-by: probe-<descriptor>` in `00-index.md.runtime-evidence-deferrals`.
- If no, leave `cleared-by: null` and surface this in the slice's `## Tripwires` section — with the wall's current `wall-ownership` verdict and, when the recorded `clearing-event` turned out to be a passive wait ("once the port frees"), the provisionable event that should replace it.
- **Leave a `clearing-probe` behind on every deferral that survives.** A deferral nobody can *check* is a deferral nobody will notice clearing — one AC shipped uncleared while its "device available" event was satisfied on-screen in the same session. Before writing the entry back, make sure it carries a one-line, side-effect-free command that answers "has the clearing event happened yet?" (verify.md's `clearing-probe` field). You just probed this wall, so you are the best-placed writer of that command in the whole lifecycle: record the check you would run next time.

This is the one mutation `probe` makes to `00-index.md` beyond standard bookkeeping. The mutation is additive — clearing a deferral updates its status; it does not remove the entry.

# Step 8 — Index bookkeeping (per the shared compressed-slice contract)

Per `${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/_compressed-slice.md`:

1. Append `03-slice-probe-<descriptor>.md` to `00-index.md.workflow-files`.
2. Append `{slug: probe-<descriptor>, slice-type: probe, created-at: "<iso>"}` to `00-index.md.compressed-slices`.
3. Update `00-index.md.updated-at`.
4. If `03-slice.md` exists, append `{slug: probe-<descriptor>, status: defined, slice-type: probe, compressed: true}` to `slices`, bump `total-slices`, update `updated-at`.
5. Rewrite the `updated-at` column on `<slug>`'s row in `.ai/workflows/INDEX.md`.

Do NOT modify `current-stage`, `selected-slice`, `status`, `branch`, or `progress` on `00-index.md`. Probe slices are additive and do not advance the main lifecycle.

# Step 9 — Hand off to user

Lead with a short **narrative** paragraph (prose, no bullets) telling what was found and what it means, then the structured anchors below.

Emit a compact chat summary:

```
wf probe complete: <slug>
Target: <probe-target>
Adapters: <adapters-used>
Coverage: <driven>/<enumerated> surfaces (<enumeration-method>) — unreached: <none | list>
Findings: <findings-count> (critical: <N>, high: <N>, medium: <N>, low: <N>)
Tripwires: <none | comma-separated list>
Deferrals cleared: <N>
Recommended next: <command> — <one-sentence justification>
```

In `sweep` mode the chat return **leads with the coverage claim**, not the finding count — and when `enumeration-method: traversal`, it states that the denominator is a floor. When a primary correctness class is not observable (Step 0.9), that statement comes before both.

Slug-less sweeps replace the artifact line with `.ai/surface-sweep-<utc-date>.md` and recommend `/wf intake fix <description>` or `/wf intake rca <description>` — a slug-less sweep creates no slug of its own.

```
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

- **`/wf plan <slug> probe-<descriptor>`** is the default downstream path for non-trivial findings. The probe slice is the input artifact for planning, exactly as an `rca` slice is.
- **`/wf intake fix <slug> probe-<descriptor>`** for small fixes that fit ≤3 files.
- **Deferral clearing** happens at verify time (verify reads evidence and updates `cleared-by`), except for Step 7 where probe directly clears a deferral whose matched AC was successfully observed.
- **No auto-fix.** Probe reports; downstream commands fix.

# What this command is NOT

- **Not a fixer** — writes observations and findings, not patches.
- **Not a static analyzer** — that's `rca` (siblings on different axes).
- **Not a forward-path gate** — that's `/wf verify`'s interactive sub-agent 3. Probe is the backward re-entry counterpart for already-done slugs.
- **Not platform-specific** — every platform-specific recipe lives in `runtime-adapters.md`; probe stays platform-agnostic.
