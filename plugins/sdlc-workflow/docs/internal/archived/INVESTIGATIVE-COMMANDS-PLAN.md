# Investigative Commands Plan

Plan for adding six investigation- and measurement-focused commands to `sdlc-workflow`: `wf-investigate`, `wf-discover`, `wf-instrument`, `wf-experiment`, `wf-benchmark`, and `wf-profile`. Sources: [IDEAS-2.md](../../../IDEAS-2.md) (#1, #2, #7, #9, #13) plus a new `wf-investigate` entry point identified during the discussion that preceded this plan.

This document is a **plan**, not a spec. The goal is to settle the design decisions and build order before drafting individual command files.

---

## 1. Taxonomy — three different shapes

Treating all six commands as "entry points" would weaken the workflow vocabulary. The first decision is taxonomy:

| Command | Shape | Position in lifecycle | Writes |
|---|---|---|---|
| `wf-investigate` | Entry point | Before intake | `.ai/workflows/investigate-<slug>/01-investigate.md` + ranked candidates + routing recommendation |
| `wf-discover` | Entry point | Before intake | `.ai/workflows/discover-<slug>/00-discover.md` + validated problem brief + routing recommendation |
| `wf-instrument` | Augmentation | During plan or implement of an existing workflow | `04b-instrument.md` into existing `.ai/workflows/<slug>/` |
| `wf-experiment` | Augmentation | After shape, parallel to plan, in an existing workflow | `XX-experiment.md` into existing `.ai/workflows/<slug>/` |
| `wf-benchmark` | Wrapper (two modes: baseline + compare) | Before implement (baseline), after implement (compare) | `05c-benchmark.md` into existing `.ai/workflows/<slug>/` |
| `wf-profile` | Skill + thin command wrapper | Anywhere | Skill: returns analysis to caller. Command: writes `.ai/profiles/<run-id>/01-profile.md` for standalone use. |

**Why this matters:** entry points start workflows; augmentations slot into existing workflows; wrappers run twice in the lifecycle; skills are general capabilities invoked from many contexts. Building all six with the same shape would force three of them into the wrong category.

---

## 2. Entry-point family — `wf-investigate`, `wf-discover`, `wf-rca`

The three pre-lifecycle entry points share a strong shape:

> **read-only investigation → ranked output → routing recommendation → no fix, no commitment**

Worth standardizing now. Concretely the shared elements are:

- Common artifact frontmatter: `workflow-type: investigate | discover | rca`, `confidence: high|medium|low`, `recommended-next: <command>`, `status: ready-for-routing`.
- Common routing logic: each picks a primary recommendation + lists alternates; user makes the final call.
- Common handoff: each can synthesize a minimal `02-shape.md` so `/wf-plan` works downstream without modification (`wf-rca` already does this).

The differences are real and material:

| | `wf-rca` | `wf-investigate` | `wf-discover` |
|---|---|---|---|
| Trigger | "Something is broken" | "We want to invest in X (domain)" | "Should we build Y (problem statement)?" |
| Evidence source | Internal codebase + git history + logs | Internal codebase + benchmarks + telemetry | External — users, competitors, app reviews, market |
| Output flavor | Convergent (pick one root cause) | Divergent (rank N candidates by ROI) | Convergent (validated yes/no on the problem) |
| Routing target | `wf-plan` / `wf-quick` / `wf-hotfix` | `wf-intake` / `wf-plan` / `wf-quick` (per-item) | `wf-intake` (with validated problem) — or "do not build" |
| Likely sub-agents | Code path, recent change correlation, blast radius | Hotpath/profiling, opportunity surface, ROI estimation | Web search competitors, app review scrape, support ticket pattern, opportunity sizing |

**Decision (recorded):** stay independent for now (each command self-contained, matches `wf-rca`). Factor common boilerplate into a reference file later, after we have three working examples and the conventions are stable.

---

## 3. Augmentation pattern — `wf-instrument`, `wf-experiment`

These augment an existing workflow rather than starting a new one. Today, every workflow command starts a fresh workflow or resumes one as a single linear pipeline. wf-instrument and wf-experiment break that assumption: they write *additional* artifacts (`04b-instrument.md`, `XX-experiment.md`) into an existing workflow directory.

**Required infrastructure change:** `00-index.md` needs to track augmentations so `/wf-status` and `/wf-resume` understand them:

```yaml
augmentations:
  - type: instrument
    artifact: 04b-instrument.md
    status: complete
  - type: experiment
    artifact: 04c-experiment.md
    status: complete
```

Without this, augmentations are invisible to the rest of the lifecycle.

**Coupling decision (to confirm before drafting):**

- **A. Loosely coupled (recommended)** — augmentation commands write their artifact and update the index's `augmentations` field. `wf-implement` / `wf-verify` / `wf-review` notice the artifacts and read them as additional context. Each augmentation is independent; the workflow doesn't enforce ordering. *Simpler, more flexible.*
- **B. Tightly coupled** — augmentations register as preconditions or post-conditions of specific stages (e.g., `wf-instrument` is a precondition for `wf-implement`). Lifecycle commands check for them and warn or block. *Stronger guarantees, more rigid; mistakes harder.*

**Recommendation:** A (loosely coupled). Tight coupling makes augmentations feel mandatory, which kills adoption — the whole point is "use when relevant, not always." Loose coupling lets you add augmentations to a 6-month-old workflow without retrofitting. The compromise: loose by default, but specific commands like `wf-shape` could *recommend* certain augmentations based on the work shape ("this touches a hot path → consider running `/wf-benchmark baseline` and `/wf-instrument`").

---

## 4. Wrapper pattern — `wf-benchmark`

`wf-benchmark` runs twice in the lifecycle: baseline before implement, compare after. Three implementation choices:

- **Two commands** (`wf-benchmark-baseline`, `wf-benchmark-compare`): explicit, clear, more vocabulary to memorize.
- **One command, mode arg** (`/wf-benchmark <slug> baseline` / `/wf-benchmark <slug> compare`): single entry, mode is explicit.
- **One command, auto-detect** (`/wf-benchmark <slug>`): if no baseline exists in `05c-benchmark.md`, take baseline; if baseline exists, compare.

**Recommendation:** mode arg + auto-detect default. `/wf-benchmark <slug>` auto-detects (most ergonomic), `/wf-benchmark <slug> baseline|compare` for explicit override (escape hatch for re-baseline scenarios).

---

## 5. Skill vs command — `wf-profile`

IDEAS-2 explicitly tags `wf-profile` as a skill, not a stage. Reasoning is sound: profiling is a capability invoked from many contexts, not a stage that produces a workflow artifact.

**Proposal:**

- **Skill `wf-profile`** in `skills/wf-profile/SKILL.md` — invoked from `wf-investigate`, `wf-implement`, `wf-verify`, or directly. Returns structured analysis (flamegraph summary, hot functions, allocation hotspots) to the caller. No workflow artifact written by default.
- **Thin command wrapper `wf-profile`** in `commands/wf-profile.md` — for standalone use ("I want to profile X without a workflow context"). Invokes the skill, writes results to a standalone artifact at `.ai/profiles/<run-id>/01-profile.md` (parallel to `.ai/dep-updates/`). No workflow lifecycle, no routing recommendation — just the analysis.

This makes `wf-profile` composable (skill) and reachable (command).

---

## 6. Composition graph — how the new commands chain with existing ones

```
wf-discover (validate problem)
   └─> wf-intake <validated-problem>

wf-investigate (find investments)
   ├─> wf-intake <chosen-investment>     (large)
   └─> wf-quick <chosen-investment>      (small)

wf-rca (find root cause — already exists)
   ├─> wf-plan <slug>                    (non-trivial fix)
   ├─> wf-quick <slug>                   (small fix)
   └─> wf-hotfix <slug>                  (active incident)

wf-intake → wf-shape
   ├─ optional: /wf-experiment <slug>    (augmentation)
   └─ optional: /wf-instrument <slug>    (augmentation)
→ wf-slice → wf-plan
   ├─ optional: /wf-instrument <slug>    (augmentation)
   └─ optional: /wf-benchmark <slug>     (auto: baseline)
→ wf-implement
   ├─ skill: wf-profile (called from inside if needed)
→ wf-verify
   └─ optional: /wf-benchmark <slug>     (auto: compare)
→ wf-review → wf-handoff → wf-ship
```

---

## 7. Build order

1. **`wf-investigate`** — most aligned with the original ask; shape already discussed; closes the "no entry point for non-bug exploration" gap.
2. **`wf-instrument`** — observability is foundational; everything downstream (experiment, impact, benchmark) reads better when instrumentation is precedent.
3. **`wf-benchmark`** — depends on the wrapper pattern decision; once that's settled, this is the highest-leverage performance command.
4. **`wf-profile` (skill + thin command)** — fast to add once `wf-investigate` and `wf-benchmark` are landed; the skill is reusable from both.
5. **`wf-discover`** — distinct enough from `wf-investigate` to deserve its own design pass; defer until the others are landed and we've validated the entry-point pattern.
6. **`wf-experiment`** — lowest priority of the set; depends on `wf-instrument` being in place.

Each is a separate version bump. Probably 6 commits over 4-5 versions (some bundled like `wf-quick` + `wf-rca` were).

---

## 8. Naming conventions

To match precedent (`hotfix-<slug>`, `quick-<slug>`, `rca-<slug>`):

- `wf-investigate` → `.ai/workflows/investigate-<slug>/`
- `wf-discover` → `.ai/workflows/discover-<slug>/`
- `wf-profile` standalone → `.ai/profiles/<run-id>/` (parallel to `.ai/dep-updates/`)

Augmentations write into the host workflow's existing directory:

- `wf-instrument <slug>` → `.ai/workflows/<slug>/04b-instrument.md`
- `wf-experiment <slug>` → `.ai/workflows/<slug>/04c-experiment.md` (or whatever stage number is next free; the augmentation registry in `00-index.md` records the actual filename)
- `wf-benchmark <slug>` → `.ai/workflows/<slug>/05c-benchmark.md`

---

## 9. Decisions to confirm before drafting starts

1. **Augmentation coupling**: confirm loose coupling (A) or argue for tight (B) on specific augmentations.
2. **wf-benchmark shape**: confirm "one command, auto-detect default + mode-arg override" — or argue for two separate commands.
3. **wf-profile shape**: confirm skill + thin command wrapper — or skill-only / command-only.
4. **Entry-point conventions**: confirm "stay independent for now" (each command self-contained, like `wf-rca`) — or factor shared boilerplate into a reference file from the start.
5. **Build order**: confirm `wf-investigate` first, or pick a different starting point (e.g., `wf-instrument` first because observability is foundational).
6. **Naming of the entry-point artifact directory**: confirm `investigate-<slug>` and `discover-<slug>` (full word, matches `hotfix-<slug>` / `quick-<slug>`) — or use terser `inv-<slug>` / `disc-<slug>`.
7. **Augmentation index registry**: agree on the shape of the `augmentations:` array in `00-index.md` so `wf-status` and `wf-resume` can be updated alongside the first augmentation command (likely `wf-instrument`).

---

## 10. Out of scope for this plan (future work)

These commands from IDEAS-2 are related but deferred:

- `wf-impact` — post-ship measurement; depends on `wf-experiment` and `wf-instrument` shipping first.
- `wf-load-test` — distinct enough from `wf-benchmark` to warrant its own design pass; benchmark is single-request perf, load-test is concurrency/SLO.
- `wf-threat-model`, `wf-compliance`, `wf-dependency-audit` — security family; separate plan.
- `wf-polish`, `wf-ux-audit`, `wf-explore-test`, `wf-accessibility` — design/QA family; separate plan.
- `wf-rollout`, `wf-incident` — DevOps family; `wf-incident` may be subsumed by existing `wf-hotfix`.
- `wf-api-design`, `wf-migrate`, `wf-context` — architecture/knowledge family; separate plan.

---

## 11. Background — why this group first

The original ask was an entry point for performance investments. `wf-investigate` answers that directly. The other five (`wf-discover`, `wf-instrument`, `wf-experiment`, `wf-benchmark`, `wf-profile`) fall out naturally because performance work needs measurement infrastructure: you can't `wf-investigate` performance without somewhere to record baselines (`wf-benchmark`), inline analysis capability (`wf-profile`), and observability scaffolding (`wf-instrument`). `wf-experiment` and `wf-discover` are adjacent additions that complete the "investigate-then-decide" family at both ends of the lifecycle.

The grouping is coherent: **investigation (wf-investigate, wf-discover, wf-rca) → measurement infrastructure (wf-instrument, wf-benchmark, wf-profile) → controlled rollout (wf-experiment) → post-ship validation (wf-impact, deferred).** Building this group together produces a measurement-aware product-development loop that the current pipeline doesn't have.
