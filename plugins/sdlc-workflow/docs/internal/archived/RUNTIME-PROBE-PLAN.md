# Runtime Probe Plan

Plan for closing the "verified but not actually working" gap in the SDLC workflow. Three coordinated changes:

1. Promote interactive verification from a conditional sub-agent to a **gating contract** on `wf-verify`.
2. Add `/wf-quick probe <slug> [target]` as the **general re-entry path** for runtime-truth verification on an already-progressed slug.
3. Factor per-platform driving recipes into a single **adapter registry** consumed by both `verify` and `probe`.

Plus the argument contract for `probe`: a free-form target string resolved through a four-layer interpretation, treated as a **focus** rather than a **filter** by default.

This document is a **plan**, not a spec. It records the design decisions before any skill files are drafted.

---

## 1. Framing — two distinct epistemic kinds inside one stage

Today, `wf-verify` conflates two different things:

| Kind | What it answers | Cost | Per-slice or slug-wide |
|---|---|---|---|
| **Code correctness** | Does the artifact obey its own grammar? (lint, types, unit + integration tests, build) | Cheap, fast, deterministic | Per-slice, always-on |
| **Runtime truth** | Does the running artifact obey the promises declared in the acceptance criteria? | Expensive, slow, observation-based | Per-slice gate **and** slug-wide re-entry |

Conflating them produces the observable failure mode this plan addresses: a slug can show "5 of 6 slices verified" while the running artifact is visibly broken, because every slice passed its code-correctness checks while its runtime-truth checks were silently optional.

The fix is to give runtime truth a dedicated contract in `verify`, a dedicated re-entry command in `wf-quick`, and a shared adapter registry that keeps both platform-agnostic.

**Decision (recorded):** Do not split `wf-verify` into two commands. Keep one stage, two contracts. Splitting would force every slug into a longer pipeline; gating-by-contract achieves the same correctness improvement without grammar inflation.

---

## 2. Change 1 — `wf-verify` gating contract

### 2.1 The schema change

`06-verify-<slice-slug>.md` already declares interactive metrics in its frontmatter:

```yaml
metric-interactive-checks-run: <N>
metric-interactive-checks-passed: <N>
```

Today these are descriptive. Make them **prescriptive**: refuse to write `result: pass` if the per-slice AC contains any user-observable criterion and the corresponding interactive evidence count is zero.

### 2.2 Detecting "user-observable" — hybrid heuristic with explicit override

A criterion is user-observable when it would survive paraphrasing to an end-user. The gate decides via a two-step rule:

**Step A — explicit override wins.** If the AC entry in `03-slice-<slice>.md` carries an `observable: true | false` annotation, that value is final. Authors use this to correct heuristic miscalls without touching gate code.

**Step B — heuristic when unannotated.** When the AC entry has no `observable` annotation, the gate considers it user-observable when any of the following hold:

- It names a visible surface (screen, page, route, view, panel, dialog, command output).
- It names a user action (click, tap, type, submit, run, invoke, navigate).
- It declares an observable post-condition (renders, appears, displays, returns, prints, succeeds, redirects).

Criteria that fail all three checks are treated as code-only (e.g., "the new util function handles null inputs") and the interactive gate does not fire for them.

This rule lives in one place — the gate logic — and is invoked from `verify` and `probe` both. Authoring guidance for slice writers stays unchanged; the gate works on whatever wording the slice file carries, and the optional `observable` tag is documented but never required.

### 2.3 Where the gate sits in the verify flow

In `verify`'s numbered steps, after the parallel sub-agents complete and before writing `06-verify-<slice-slug>.md`:

1. Read AC from `03-slice-<slice-slug>.md`.
2. Partition AC into `code-only` vs `user-observable` using §2.2.
3. For every `user-observable` AC, require a matching entry in the interactive verification results section. Match by AC id or quoted text.
4. If any `user-observable` AC has no matching entry → write `result: blocked-runtime-evidence-missing` and surface as an issue. Do not write `result: pass`.
5. Otherwise, proceed as today.

### 2.4 Escape hatch — explicit suppression

Some AC are user-observable but genuinely cannot be probed in the current environment (no emulator, no staging API key, etc.). Provide a single, recorded escape hatch: the slice author adds `interactive-verification: deferred` with a one-line reason in the per-slice verify file. `verify` records this and surfaces it in `06-verify.md` master index.

**Deferral gating, by stage:**

| Stage | Behavior when any open deferral exists |
|---|---|
| `verify`, `review`, `handoff` | **Soft warning.** Stage proceeds, deferral is surfaced in chat summary and the slug's status view. |
| `ship` | **Hard block.** `/wf ship` refuses to run until every open deferral is cleared by a probe finding or a subsequent verify pass that no longer needs the deferral. |

**Decision (recorded):** No silent skip. Every deferral is named, dated, and surfaces in the slug's progress view. The block bites at ship, not earlier, so in-flight work that legitimately waits on an environment is not stalled mid-pipeline.

---

## 3. Change 2 — `/wf-quick probe <slug> [target]`

### 3.1 Position in the family

`probe` joins the `wf-quick` family alongside `rca`, `quick`, `hotfix`, `investigate`, `discover`, `ideate`, `simplify`, `refactor`, `update-deps`. It fills the missing cell in an existing 2x2:

| | Forward gate (per-slice) | Backward re-entry (slug-wide) |
|---|---|---|
| **Static** | lint/types/tests in `verify` | `rca` (read-only diagnosis) |
| **Runtime** | interactive sub-agent in `verify` (now gated, §2) | **`probe` (new)** |

### 3.2 Slug-mode contract

`probe` is **slug-mode only**. It always operates on an existing slug — there is no fresh-workflow form. This keeps it symmetric with the "after-the-fact" intent that motivates it.

Per the v9.10.0+ slug-mode pattern already in `wf-quick`, the first positional argument that matches an open slug in `.ai/workflows/INDEX.md` is the slug; the remainder is the target string.

```
/wf-quick probe <slug>                       # slug-wide sweep over all AC
/wf-quick probe <slug> <target>              # focused probe on target
/wf-quick probe <slug> --from <path>         # multi-target from file
/wf-quick probe <slug> --strict <target>     # filter mode (see §3.5)
/wf-quick probe <slug> --adapter <key>       # narrow to one adapter (see §4.3)
```

### 3.2.1 Pre-flight — branch posture

`probe` is the one `wf-quick` command that intentionally breaks the "one-line invocation" ergonomic when the working tree is not on the slug's branch. Before any bootstrap:

1. Read `branch` from `00-index.md`.
2. Compare against `git branch --show-current`.
3. If they match → proceed.
4. If they differ → call `AskUserQuestion` with three options: *switch to `<branch>`*, *run against the current branch and record `probed-on-branch: <current>` in frontmatter*, or *abort the probe*.

The mismatch case is loud on purpose. `probe` runs cold more often than `verify` does — the user may have moved branches days ago and forgotten — and silently switching can clobber uncommitted work.

### 3.2.2 Bootstrap — try to resolve, fall back gracefully

Once branch posture is settled, the adapter's bootstrap step runs in two phases:

**Phase 1 — active resolution.** The adapter declares its bootstrap steps (start dev server, boot emulator, build + install, etc.). `probe` attempts each step in order. If a step succeeds, proceed to the drive/observe loop.

**Phase 2 — graceful fail with awaiting-environment slice.** If any bootstrap step fails after resolution attempts, `probe` does *not* exit silently. It writes the compressed slice with:

```yaml
status: awaiting-environment
probe-target: "<verbatim user string or 'slug-wide'>"
bootstrap-failure:
  step: <step-name>
  exit-code: <code>
  output-tail: |
    <last 20 lines of stderr/stdout>
  remediation: <one-line hint from the adapter's bootstrap recipe>
```

Body: a short narrative of what was attempted, what failed, and the remediation hint. No findings (the artifact was never observed), but the *attempt* is recorded.

This means re-running `probe` after the user fixes the environment picks up where it left off, and the slug's history captures that a runtime check was attempted on date X even if it could not complete.

### 3.3 Output shape — compressed slice

Per slug-mode convention, `probe` writes a single compressed slice file:

```
.ai/workflows/<slug>/03-slice-probe-<descriptor>.md
```

With frontmatter:

```yaml
type: slice
slice-slug: probe-<descriptor>
slice-type: probe
compressed: true
origin: wf-quick/probe
stage-number: 3
status: defined
complexity: xs        # probe produces findings, not implementation work
probe-target: "<verbatim user string or 'slug-wide' if omitted>"
target-resolution:
  matched-ac: [<ac-id-or-quote>, ...]
  matched-slices: [<slice-slug>, ...]
  inferred-surfaces: [<route|screen|command|endpoint>, ...]
  ad-hoc: <true|false>
scope-mode: focus | filter
incidental-observed-count: <N>           # only when scope-mode == filter
adapters-used: [<platform-key>, ...]
adapter-narrowed-by-user: <true|false>
evidence-dir: ".ai/workflows/<slug>/probe-evidence/<descriptor>/"
probed-on-branch: <branch-name>          # only set when user chose to run on non-slug branch
status: complete | awaiting-environment
bootstrap-failure: <object|null>         # see §3.2.2 for shape when set
findings-count: <N>
findings-severity: { critical: N, high: N, medium: N, low: N }
recommended-next: </wf plan|/wf-quick quick|none>
```

Body sections mirror the rca slice body: target, observations, findings, suggested fix shape, recommended next command.

### 3.4 The four-layer target resolution

When `probe` receives a target string, it does not pick a single interpretation. It runs all four layers and records which contributed:

| Layer | What it does | If it matches |
|---|---|---|
| **1. AC text match** | Fuzzy-match the target against AC text across every `03-slice-*.md` in the slug | Record matched AC ids; observation compares against AC text exactly |
| **2. Slice match** | Match against slice slugs and titles | Narrow the observation plan to that slice's surface |
| **3. Surface inference** | Extract surface hints (route names, screen names, command names, endpoint paths) from the target text | Use hints to pick adapter entry points |
| **4. Ad-hoc criterion** | If layers 1-3 produced nothing usable, treat the target as a new criterion declared at probe time | Set `ad-hoc: true` in frontmatter |

All four run; their results compose into `target-resolution`. A reader of the resulting slice can see exactly how the target was interpreted.

### 3.5 Focus vs filter — the scope mode decision

**Default: focus.** `probe` starts at the target and reports findings against the target, but also surfaces incidental defects observed during navigation. Rationale: a runtime probe that walked past an obvious crash on its way to the requested target and stayed silent about the crash would be dishonest.

**Opt-in: filter (`--strict`)** — strict-but-archive semantics. The `findings:` section of the probe slice contains only target-tied entries. Incidental observations made along the way are still recorded, but in a side file: `.ai/workflows/<slug>/probe-evidence/<descriptor>/incidental.md`. The probe slice frontmatter carries `incidental-observed-count: <N>` so the existence of side-evidence is visible without polluting the findings list.

Rationale: the user has explicitly opted out of being told about incidentals in the primary report, but the agent paid to gather those observations and discarding them is wasteful. A later `probe` run (or a curious reader) can review `incidental.md` to decide whether anything there warrants its own probe target.

Both modes record `scope-mode` in frontmatter so a later reader knows which posture produced the findings list.

### 3.6 Multi-target form

`--from <path>` reads a markdown file and treats each top-level bullet (or each line if no bullets) as an independent target. All targets resolve through §3.4 individually; all observations roll up into one compressed slice with the file path recorded as the source.

**Decision (recorded):** No `--targets "a, b, c"` inline list. Two reasons: shell quoting is painful, and once the user has more than two targets the file form is better hygiene anyway.

### 3.7 Loop-back to planning

After writing the probe slice, `probe` recommends one of:

| Condition | Recommendation |
|---|---|
| `findings-count: 0` | `/wf-meta status <slug>` — slug is genuinely ready; reflect that in the master index |
| Findings exist, severity ≤ high, fits ≤3 files | `/wf-quick quick <slug> <probe-descriptor>` |
| Findings exist, severity ≥ high or cross-cutting | `/wf plan <slug> probe-<descriptor>` |
| `interactive-verification: deferred` was the trigger | Same as findings exist; additionally clear the deferral flag on the original slice once the new fix slice ships |

The probe slice becomes the input artifact for the recommended next stage, exactly as an `rca` slice does.

---

## 4. Change 3 — adapter registry

### 4.1 Why factor

Today, `wf-verify`'s sub-agent 3 inlines per-platform driving recipes for web, Android, iOS, CLI, and desktop (`plugins/sdlc-workflow/skills/wf/reference/verify.md:122-196`). `probe` will need exactly the same recipes. Inlining them in two places guarantees drift.

### 4.2 Where it lives

One reference file:

```
plugins/sdlc-workflow/skills/wf/reference/runtime-adapters.md
```

Keyed by platform. Each adapter entry declares:

- **Detection signals** — files or commands that indicate the project is this platform (`AndroidManifest.xml`, `package.json` with a `dev` script, `Cargo.toml`, etc.).
- **Bootstrap** — how to bring the running artifact up (start dev server, build + install, launch binary, etc.).
- **Drive** — how to perform user actions (Playwright/dev-browser, Maestro/adb, xcrun simctl, stdin/argv, etc.).
- **Observe** — how to capture output (screenshot, page snapshot, stdout/stderr, HTTP response, log scrape).
- **Tear down** — how to leave the environment clean.

### 4.3 Adapter selection

Both `verify` (forward gate) and `probe` (backward re-entry) call into the registry the same way:

1. Run every adapter's detection signal against the repo.
2. Collect every adapter that matches. Multi-match (e.g., a repo with both web and CLI surfaces) is the common case in real codebases, not an exception.
3. **Default behavior — run all matched in parallel.** The caller iterates over every matched adapter and aggregates observations into one report. The probe slice records `adapters-used: [<key>, ...]` (note the plural).
4. **Narrowing — `--adapter <key>` flag.** The user can pass `--adapter <key>` on `probe` (or future commands) to restrict the run to a single matched adapter. The probe slice records `adapters-used: [<key>]` and `adapter-narrowed-by-user: true`.
5. The target string from `probe` (§3.4 layer 3) refines which adapter entry points to drive within each running adapter.

**Decision (recorded):** Run-all is the default because multi-surface repos are common and a probe that silently picked one surface would mislead. The `--adapter` flag exists for the case where the user already knows which surface is broken and wants to skip the others for speed.

### 4.4 Adding new platforms

A new platform is a single new section in `runtime-adapters.md`. No changes to `verify` or `probe` source files. This keeps platform breadth orthogonal to workflow logic.

**Decision (recorded):** Adapters are *recipes*, not code. They are markdown sections that the agent reads and executes. This matches how the rest of the workflow already works and avoids introducing a code-execution path that the rest of the plugin does not have.

---

## 5. Schema additions — full inventory

### 5.1 `06-verify-<slice-slug>.md` (existing file, additions only)

```yaml
result: pass | fail | partial | blocked-runtime-evidence-missing  # new variant
interactive-verification: <required | deferred | not-applicable>   # new
interactive-verification-defer-reason: "<string>"                  # new, only when deferred
```

### 5.2 `03-slice-probe-<descriptor>.md` (new file type)

See §3.3 for full frontmatter.

### 5.3 `00-index.md` (existing file, additions only)

```yaml
runtime-evidence-deferrals:                                        # new
  - slice: <slice-slug>
    reason: <string>
    deferred-at: <iso-8601>
    cleared-by: <probe-descriptor or null>
```

`/wf-meta status` and `/wf-meta next` read this list to refuse advancing the slug to `wf-ship` while any deferral is uncleared.

### 5.4 `.ai/workflows/INDEX.md` (existing file, additions only)

Add a column or per-row note for `runtime-evidence-status: clean | deferrals-open | probe-findings-open`. This is what surfaces "5 of 6 verified but actually broken" before the user discovers it visually.

---

## 6. Build order

A four-step rollout that keeps each step independently shippable and reversible:

| Step | What | Why first |
|---|---|---|
| 1 | Adapter registry (`runtime-adapters.md`) — extract recipes verbatim from `verify.md` sub-agent 3, no logic change | Zero behavior change; sets the foundation; reviewable in isolation |
| 2 | `wf-verify` gating contract — partition AC, refuse `result: pass` when runtime evidence is missing, support `deferred` escape hatch | Closes the leak that motivated the plan; no new command surface |
| 3 | `/wf-quick probe <slug>` (slug-wide sweep form only, no target argument) | First version of the re-entry path; validates the compressed-slice + recommended-next loop |
| 4 | `probe` target argument with four-layer resolution + multi-target file form + filter mode | Adds the directed-probe ergonomics on top of a working sweep |

Each step ships independently. A user who pulls only step 1 sees no behavior change; step 2 alone gives a stricter forward gate but no re-entry; step 3 adds re-entry; step 4 adds direction.

**Decision (recorded):** Do not bundle. Each step is small enough that a single PR per step keeps the change reviewable and the rollback path obvious.

---

## 7. Recorded decisions

All six questions raised during plan review have been settled. The body sections referenced below have been updated to match — this section is the authoritative log of *why* each choice was made.

| # | Decision | Reflected in | Rationale |
|---|---|---|---|
| Q1 | **Hybrid: heuristic + override.** The gate uses the §2.2 wording heuristic by default; slice authors may add `observable: true \| false` on any AC to override. | §2.2 | Works on existing slice files unchanged. Authors get an escape hatch when the heuristic guesses wrong. Avoids the migration cost of a tag-only or full-type-system design. |
| Q2 | **Try to resolve, then fail gracefully.** Probe actively attempts the adapter's bootstrap steps; if any step fails after resolution attempts, probe writes an `awaiting-environment` slice with the failure details and a remediation hint. | §3.2.2 | Captures that a probe was attempted even when the environment is broken. Re-running picks up where it left off. Active resolution honors the "probe acts on the artifact" posture without silently running unrequested mutations — the adapter declares which steps are safe to attempt. |
| Q3 | **Ask via AskUserQuestion on mismatch.** When the working tree is not on the slug's `branch`, probe presents three options: switch, run-and-record, or abort. | §3.2.1 | Probe runs cold more often than verify, so auto-switching (the verify precedent) risks clobbering uncommitted work the user has since accumulated. Explicit confirmation is the right posture for a destructive action. |
| Q4 | **Hard block on ship, soft warning earlier.** Verify, review, and handoff surface open deferrals as warnings but proceed; `/wf ship` refuses to run until every deferral is cleared. | §2.4 | The deferral gate should bite where it actually matters (release boundary), not at every intermediate stage. In-flight work that legitimately waits on an environment is not stalled mid-pipeline. |
| Q5 | **Run all matched adapters in parallel by default; `--adapter <key>` narrows.** | §4.3 | Multi-surface repos are common (web + CLI in one repo is the norm, not the exception). A probe that silently picked one surface would mislead. The flag exists for the speed case when the user already knows which surface is broken. |
| Q6 | **Strict-but-archive.** Filter mode's `findings` list contains only target-tied entries, but incidental observations are recorded to `probe-evidence/<descriptor>/incidental.md` with `incidental-observed-count: N` in frontmatter. | §3.5 | The user has opted out of being told about incidentals in the primary report, but the agent paid to gather them. Discarding observation data is wasteful; archiving preserves it for later review without polluting findings. |

**Pattern across the six decisions.** They share one posture: prefer honesty about what was observed (Q6 archive, Q5 multi-adapter, Q2 attempt-recording), and prefer explicit user control on destructive or load-bearing choices (Q3 ask, Q4 ship-block, Q1 author override). These are not coincidences — they reflect what the rest of the workflow already values, so the new behavior should feel idiomatic to anyone who already knows `rca` and `verify`.

**Remaining settle-during-implementation items.** None. Both questions originally tagged "settle-during-implementation" (Q2, Q3) ended up with explicit answers during plan review; the implementation no longer carries hidden design risk.

---

## 8. What this plan deliberately does not do

- Does not introduce a new top-level command. `probe` lives inside the `wf-quick` family that already houses every "small fast investigation or surgical change" command.
- Does not platform-specialize the workflow. Every platform-specific recipe lives in one registry file; both verify and probe stay platform-agnostic at their level.
- Does not replace `rca`. `rca` is static diagnosis of a reported symptom; `probe` is runtime detection of unreported symptoms. The wf-quick family now spans both axes (static/runtime x reported/unreported).
- Does not modify the slice-level pipeline. Slices still go intake -> shape -> slice -> plan -> implement -> verify -> review -> handoff -> ship -> retro. `probe` writes a new compressed slice into an existing slug; it does not insert a new stage.
- Does not auto-fix. `probe` reports findings; fixes go through the recommended downstream command, identically to how `rca` already routes.
