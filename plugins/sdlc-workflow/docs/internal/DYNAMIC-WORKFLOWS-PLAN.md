# Dynamic Workflows Integration Plan

Companion to [QUALITY-GATES-PLAN.md](archived/QUALITY-GATES-PLAN.md) and
[MULTI-HOST-SUPPORT-PLAN.md](MULTI-HOST-SUPPORT-PLAN.md). This plan adopts
Claude Code's **Dynamic Workflows** (research preview, shipped with Opus 4.8 /
Claude Code v2.1.154, 2026-05-28) as an **execution engine for the parallel
sub-agent fan-out the plugin already performs** — without changing the
artifact model, the schema/render/registry invariants, or the human-in-the-loop
stages.

A Dynamic Workflow is a JavaScript orchestration script that a background
runtime executes, spawning fresh-context subagents (≤16 concurrent, ≤1,000
total per run), holding intermediate state in script variables instead of the
main context window, and returning a single consolidated result. The plugin
today does the same fan-out with the **Task tool**, inline in the main context,
and (since v9.17.0) with an explicit per-Task `model` tier. The opportunity is
narrow and concrete: **move the dispatch-and-crunch middle of a stage into a
workflow; keep the read-artifacts / interview / decide / write-artifact shell
around it.**

This is an **additive, gated** change. The plugin must keep working unchanged
when workflows are unavailable (older Claude Code, the generated Codex build,
or `disableWorkflows`). Nothing here is a rewrite.

---

## Scope and non-goals

### The fit line

Dynamic Workflows **cannot prompt the user mid-run** — only tool-permission
prompts can interrupt a running workflow. Every stage in this plugin defers user
interaction to a stage boundary, so this costs almost nothing. The recon
(below) confirmed that of 21 dispatch sites, exactly **one** interleaves
`AskUserQuestion` inside a fan-out (`/wf-docs` Step 3 plan gate); everywhere
else the user is asked strictly *before* or *after* the dispatch.

**In scope** — sites that are pure dispatch→synthesis (or dispatch→barrier→
synthesis) with no mid-fan-out user input:

`/wf review`, `/review sweep`, `/wf-quick ideate`, `/wf-quick discover`,
`/wf-quick investigate`, `/wf-quick simplify`, `/wf-quick rca`, `/wf-meta how`
(Mode B complex), `/wf-meta how --research` (Mode C), `/wf-docs` discover→audit,
`/wf plan all` (cohesion barrier), `/wf-quick update-deps`, and the parallel
research phases of `/wf shape` / `/wf plan` / `/wf implement` / `/wf verify`.

**Out of scope** — stages whose value *is* the interactive loop or
cross-session durability:

| Stage | Why it stays Claude/Task-orchestrated |
|---|---|
| `/wf intake`, `/wf shape`, `/wf slice` | Interview-driven — 3–20 `AskUserQuestion` rounds *are* the stage |
| `/wf ship` | Go/no-go gates + `awaiting-input` cross-session resume are the feature |
| All **triage** loops (review, verify, simplify, ideate) | One-at-a-time human decisions; happen *after* the (now workflow-backed) fan-out |
| `/wf-docs` Step 3 plan gate | The only mid-fan-out `AskUserQuestion` — becomes the workflow **run boundary** |
| `/wf implement` (code-writing body) | Single-threaded build with atomic commits; not a fan-out |

### Non-goals

- **Not** replacing `.ai/` artifacts or `INDEX.md` with workflow state. Workflow
  resume is session-scoped and ephemeral; the artifact layer is cross-session,
  git-committed, and machine-readable. They are complementary (see Cross-cutting
  → Resume duality).
- **Not** introducing a per-invocation `--workflow` flag. Engine selection is
  inferred (Convention over flags — see [[sdlc_convention_over_flags]]) with a
  single config kill-switch.
- **Not** dropping the Task-based path. It remains the fallback and the Codex
  build's only path.

---

## Three foundational decisions

These constrain every phase. They exist because the plugin's value rests on
artifacts that are schema-validated, auto-rendered, and registry-tracked.

### Decision A — Workflows return structured data; the **skill** writes artifacts

A workflow's `agent()` calls use a `schema` to return validated findings. The
script dedups / adversarially verifies / synthesizes and `return`s a structured
object. The **main skill, back in the session, writes the `.ai/` artifact** the
same way it does today.

Why: artifact writes must traverse the existing hooks —
[`hooks/pre-write-validate.mjs`](../../hooks/pre-write-validate.mjs) (schema gate),
[`hooks/post-write-render.mjs`](../../hooks/post-write-render.mjs) /
[`hooks/render-on-artifact-write.mjs`](../../hooks/render-on-artifact-write.mjs)
(sunflower render), and registry maintenance via
[`lib/workflow-index.mjs`](../../lib/workflow-index.mjs). Whether the PostToolUse /
PreToolUse hooks fire for a *workflow subagent's* Write is **undocumented**
(Phase 0 probes it). Routing all artifact writes back through the skill makes
the question moot and keeps [QUALITY-GATES-PLAN.md](archived/QUALITY-GATES-PLAN.md)'s
renderer snapshot suite valid unchanged.

### Decision B — Acceleration layer, never a hard dependency

A workflow is only ever an *optimization* of logic that still works via Task
fan-out. Each migrated site keeps its Task path as the documented fallback,
selected automatically when workflows are unavailable. This is what keeps the
generated Codex plugin (`.codex-generated/`, `.codex-plugin/`) working — Codex
has no Workflow tool.

### Decision C — Reuse `router-metadata.json` model tiers verbatim

The dispatch model tiers are already data:

```
review:   { default: "haiku", overrides: { architecture, refactor-safety, security: "sonnet" } }
wf-quick: { default: "haiku", overrides: { investigate, rca, hotfix: "sonnet" } }
wf-meta:  { default: "haiku", overrides: {} }
```

`models.overrides[dim] ?? models.default` maps 1:1 onto `agent(prompt, {model})`.
No new tiering decisions; the workflow author reads the same metadata.

---

## Reconnaissance

### Eligible dispatch sites, grouped by migration family

Each family shares one workflow shape, so each migrates with one reusable
authoring pattern (defined in Phase 0).

**Family 1 — Single-stage panel → barrier → structured return** (the bulk):

| Site | File:line | Fan-out | Model (from metadata) | Returns |
|---|---|---|---|---|
| `/review sweep <agg>` | [SKILL.md:60](../../skills/review/SKILL.md) | ≤31 per aggregate, parallel | haiku; sonnet for `architecture`/`refactor-safety`/`security` | findings |
| `/wf review <slug>` | [review.md:305](../../skills/wf/reference/review.md) | 3–15 selected dims, parallel | sonnet (hardcoded in prose) | findings |
| `/wf-quick ideate` | [ideate.md:66](../../skills/wf-quick/reference/ideate.md) | ≤6 lenses, parallel | haiku | ideas |
| `/wf-quick simplify` | [simplify.md:105](../../skills/wf-quick/reference/simplify.md) | 3, parallel | haiku | findings |
| `/wf-quick discover` | [discover.md:69](../../skills/wf-quick/reference/discover.md) | 3 (FOR/AGAINST/counter), parallel | haiku | verdict+evidence |
| `/wf-quick investigate` | [investigate.md:69](../../skills/wf-quick/reference/investigate.md) | 3 (cartographer/options/tradeoffs), parallel | sonnet | options |
| `/wf-quick rca` | [rca.md:69](../../skills/wf-quick/reference/rca.md) | 2–3, parallel | sonnet | causal-chain |
| `/wf-design` preflight | [SKILL.md:131](../../skills/wf-design/SKILL.md) | 4 inspectors, parallel | inherit | design-context |

**Family 2 — Fan-out → dedicated synthesis agent** (research):

| Site | File:line | Fan-out | Model | Returns |
|---|---|---|---|---|
| `/wf-meta how` Mode B | [how.md:160](../../skills/wf-meta/reference/how.md) | 2–4 explorers → 1 synth | haiku explorers; inherit synth | explanation |
| `/wf-meta how --research` Mode C | [how.md:279](../../skills/wf-meta/reference/how.md) | 6–8 source agents → 1 synth (200+ sources) | haiku agents; inherit synth | cited report |

Mode C is functionally identical to the built-in **`/deep-research`** workflow;
Phase 2 evaluates delegating to it vs. authoring a bespoke script.

**Family 3 — Multi-stage pipeline with a justified barrier**:

| Site | File:line | Shape | Barrier reason |
|---|---|---|---|
| `/wf plan <slug> all` | [plan.md:216](../../skills/wf/reference/plan.md) | 1 plan agent/slice → cohesion check | cohesion needs *all* slice plans at once |
| `/wf-docs` discover→audit | [SKILL.md:51,82](../../skills/wf-docs/SKILL.md) | 1 discover → N audit (per doc) | audit needs the discovery inventory |
| `/wf-quick update-deps` | wf-quick reference | research per package batch → tier | risk-tiering needs all package research |

**Family 4 — Per-stage parallel research preludes** (low individual value,
high aggregate context savings): `/wf shape` (2 explorers,
[shape.md:44](../../skills/wf/reference/shape.md)), `/wf plan` single
([plan.md:79](../../skills/wf/reference/plan.md)), `/wf implement`
([implement.md:93](../../skills/wf/reference/implement.md)), `/wf verify`
([verify.md:80](../../skills/wf/reference/verify.md)), `/wf instrument`
([instrument.md:58](../../skills/wf/reference/instrument.md)). These run *before* an
interview; moving them off-context is the main benefit.

**Family 5 — Parallel file-mutating execution** (the genuinely new capability,
highest risk): `/wf plan all` *writing* per-slice plans, `/wf implement reviews`
fix loop ([implement.md:198](../../skills/wf/reference/implement.md), today
sequential), and a future **DAG slice-wave** executor. These require
`isolation: 'worktree'` so concurrent agents don't clobber each other's edits —
the one place a workflow does something Task fan-out cannot do cleanly.

### Sites explicitly excluded from migration

- **Mid-fan-out interaction:** `/wf-docs` Step 3 ([SKILL.md:138](../../skills/wf-docs/SKILL.md)) — split at this gate.
- **Sequential by design:** `/wf implement reviews` ([implement.md:198](../../skills/wf/reference/implement.md)) — verify-before-next; only Phase 4 (worktree) touches it.
- **Single agent (no fan-out):** `/wf experiment` ([experiment.md:57](../../skills/wf/reference/experiment.md)), `/wf-docs` discover/review steps.

### Supporting infrastructure already present

- Static verifier [`scripts/verify-router-migration.mjs`](scripts/verify-router-migration.mjs) — Check 4 already enforces "every dimension resolves to a valid model." Extend here.
- Live routing verifier [`scripts/verify-routing-resolution.mjs`](scripts/verify-routing-resolution.mjs) — uses the Agent SDK `query()`.
- Hooks: [`pre-write-validate.mjs`](../../hooks/pre-write-validate.mjs), [`post-write-render.mjs`](../../hooks/post-write-render.mjs), [`render-on-artifact-write.mjs`](../../hooks/render-on-artifact-write.mjs), [`session-start-orient.mjs`](../../hooks/session-start-orient.mjs), [`pre-compact-preserve.mjs`](hooks/pre-compact-preserve.mjs).
- [`lib/config.mjs`](../../lib/config.mjs), [`lib/workflow-index.mjs`](../../lib/workflow-index.mjs), [`lib/hook-utils.mjs`](../../lib/hook-utils.mjs), [`lib/schema-validator.mjs`](../../lib/schema-validator.mjs).

---

## Phase 0 — Foundation: contract, gate, and the hook probe

No site migrates until the shared substrate exists. This phase ships no
user-visible behavior change.

### 0.1 Probe the hook-firing question

Write `scripts/probe-workflow-hooks.mjs` (developer-only, not shipped in the
command surface). It launches a one-agent workflow whose agent writes a marker
file to `.ai/workflows/__wfprobe__/00-index.md` and then checks:

1. Did `pre-write-validate.mjs` run (valid/invalid fixture → block)?
2. Did `post-write-render.mjs` produce `.ai/_view/.../__wfprobe__`?

Record the verdict in this doc's Open Questions. **Outcome does not change
Decision A** (skill-writes is still safer for Codex parity), but a positive
result enables a future optimization where leaf-only artifacts (e.g. per-dim
`07-review-<slice>-<dim>.md`) are written by subagents directly.

### 0.2 The structured-return schemas

New file: **`tests/dispatch-return.schema.json`** — a JSON Schema with one
`$defs` branch per return family, reused by both `agent({schema})` calls in
workflow scripts and by unit tests:

- `findings` — `[{ dimension, severity (BLOCKER|HIGH|MED|LOW|NIT), file, line, title, detail, confidence }]`
- `ideas` — `[{ lens, title, impact, effort, score, rationale }]`
- `verdict` — `{ verdict (holds|partial|fails|inconclusive), evidence_for[], evidence_against[], counter[] }`
- `options` — `[{ approach, effort, blast_radius, reversibility, top_risks[] }]`
- `research` — `{ executive_summary[], state_of_art, debates[], takeaways[], sources[] }`
- `causal_chain` — `[{ event, evidence, file_line }]`

These mirror the YAML the renderers already consume, so the skill can write the
artifact directly from the return object.

### 0.3 The engine-selection gate (Convention over flags)

New module: **`lib/dispatch.mjs`**

```js
// resolveEngine(opts) -> 'workflow' | 'task'
//   opts: { fanoutCount, adversarial, env, config, isCodexBuild }
// Rules (first match wins):
//   1. isCodexBuild || env.CLAUDE_CODE_DISABLE_WORKFLOWS || config.dispatch.engine==='task'  -> 'task'
//   2. config.dispatch.engine==='workflow'                                                    -> 'workflow'
//   3. adversarial===true                                                                     -> 'workflow'
//   4. fanoutCount >= config.dispatch.workflowThreshold (default 6)                           -> 'workflow'
//   5. otherwise                                                                              -> 'task'
export function resolveEngine(opts) { /* ... */ }
export function modelFor(routerMeta, dim) { /* overrides[dim] ?? default */ }
```

Config lives in `.ai/sdlc-config.json` under a new `dispatch` block (schema
added to `schemas/sdlc-config.schema.json`):

```jsonc
"dispatch": {
  "engine": "auto",            // auto | task | workflow
  "workflowThreshold": 6,      // min parallel agents before auto picks workflow
  "adversarialVerify": true    // enable the refute layer on review-family sites
}
```

`auto` is the default and, on machines/plans without workflows, transparently
yields `task`. No per-command flag is ever introduced.

### 0.4 The shared authoring contract

New reference: **`skills/_shared/workflow-dispatch.md`**, loaded by every
migrated skill via `${CLAUDE_PLUGIN_ROOT}`. It encodes, once:

1. **When to author a workflow** — call the Step-0 gate; if `task`, follow the
   existing inline-dispatch prose; if `workflow`, author per this contract.
2. **The script skeleton** — `export const meta` literal, phase names, the
   `pipeline`-by-default / `parallel`-only-for-barriers rule, and the structured
   `return`.
3. **Decision A restated** — the script returns data; it never writes `.ai/`
   artifacts. (It MAY read.)
4. **External Output Boundary injection** — every `agent()` prompt must be
   prefixed with the boundary text (fresh-context subagents don't inherit it);
   provide the canonical preamble string.
5. **Model resolution** — `modelFor(routerMeta, dim)` for every `agent()`.
6. **The fallback note** — what the Task path does, for parity.

### 0.5 Verifier extension

Extend [`scripts/verify-router-migration.mjs`](scripts/verify-router-migration.mjs)
with **Check 9 — dispatch parity**: for every reference file that declares a
workflow-eligible dispatch, assert (a) it loads `_shared/workflow-dispatch.md`,
(b) it documents a Task fallback, and (c) every structured return names a
`$defs` branch that exists in `tests/dispatch-return.schema.json`.

### Phase 0 exit criteria

- ✅ `scripts/probe-workflow-hooks.mjs` runs and its verdict is recorded in Open Questions.
- ✅ `tests/dispatch-return.schema.json` exists; `lib/schema-validator.mjs` validates each `$defs` branch against a fixture.
- ✅ `lib/dispatch.mjs` exports `resolveEngine` + `modelFor` with unit tests covering all five gate rules (including Codex-build and disable-env paths → `task`).
- ✅ `schemas/sdlc-config.schema.json` admits the `dispatch` block; absent block defaults to `engine:auto, threshold:6, adversarialVerify:true`.
- ✅ `skills/_shared/workflow-dispatch.md` exists.
- ✅ Verifier Check 9 added and passing (no eligible sites migrated yet → vacuously true).

---

## Phase 1 — Pilot: `/wf review` + `/review sweep`

The highest-value, highest-fan-out site, and the one where adversarial
verification is pure upside. Proves Decision A end-to-end on real artifacts.

### Design

Both skills gain a Step-0 engine gate. When `workflow`:

```js
export const meta = { name: 'wf-review-sweep',
  description: 'Multi-dimension review with adversarial verify',
  phases: [{ title: 'Review' }, { title: 'Verify' }] }
// args = { slug, slice, dims: [{key, prompt, model}], diff, boundary }
const out = await pipeline(args.dims,
  d => agent(`${args.boundary}\n${d.prompt}\n<diff>\n${args.diff}\n</diff>`,
             { label: `review:${d.key}`, phase: 'Review', model: d.model, schema: FINDINGS }),
  review => parallel((review.findings || []).map(f => () =>
    agent(`${args.boundary}\nTry to REFUTE this finding; default refuted=true if uncertain:\n${JSON.stringify(f)}`,
          { label: `verify:${f.file}`, phase: 'Verify', model: 'sonnet', schema: VERDICT })
      .then(v => ({ ...f, refuted: v.verdict === 'fails' })))))
return { findings: out.flat().filter(Boolean).filter(f => !f.refuted) }
```

The skill then does, in the main session, exactly what it does today: write
`07-review-<slice>-<dim>.md` per dimension + the `07-review-<slice>.md` master
(+ `.yaml` + `.html.fragment`), run dedup by `(file:line + root cause)`,
determine the verdict, and run the interactive **triage** `AskUserQuestion`
loop. Triage is unchanged — it was always post-fan-out.

Notes:
- `/wf review`'s hardcoded `sonnet` (prose) should move into
  `skills/review/router-metadata.json` as a `wf-review` model context, so
  `modelFor` is the single source of truth (closes a v9.17.0 follow-up).
- Adversarial verify is gated by `config.dispatch.adversarialVerify`; when
  false, the pipeline is single-stage (parity with today).
- Agent budget: 31 dims × (1 review + ~N findings × 1 refute) stays far under
  the 1,000-agent cap; the 16-concurrent ceiling just queues.

### Phase 1 exit criteria

- ✅ `/review sweep all` and `/wf review <slug> <slice>` produce byte-identical artifacts (modulo the new `verified:`/`refuted-count:` frontmatter fields) whether run via `engine:task` or `engine:workflow`.
- ✅ With `engine:workflow`, the main-session context shows only the consolidated verdict — no per-dimension transcripts (context-savings check).
- ✅ `adversarialVerify:true` demonstrably drops at least one planted false-positive finding in a fixture; `false` reproduces the legacy single-pass set.
- ✅ Renderer snapshot suite (QUALITY-GATES Phase 1) passes unchanged on the produced `07-review-*` artifacts.
- ✅ Triage `AskUserQuestion` loop behaves identically to pre-migration.
- ✅ Codex build (`engine` forced to `task`) is unaffected.

---

## Phase 2 — Panels and research fan-outs

Migrate the Family 1 panels and Family 2 research sites. All share the
dispatch→barrier→structured-return shape; each reuses
`_shared/workflow-dispatch.md`.

### Sites

- **`/wf-quick ideate`** — ≤6 lens agents → return `ideas`; skill runs the
  adversarial filter + ranking + `AskUserQuestion` selection, writes
  `.ai/ideation/<focus>-<ts>.md`.
- **`/wf-quick simplify`** — 3 agents → return `findings`; skill writes
  `.ai/simplify/<run-id>.md` + `.yaml`, runs accept/skip/defer triage.
- **`/wf-quick discover`** — 3 adjudicators → return `verdict`; skill picks the
  one verdict, writes `01-discover.md`.
- **`/wf-quick investigate`** — 3 sketchers → return `options`; skill writes
  `01-investigate.md`.
- **`/wf-quick rca`** — 2–3 investigators → return `causal_chain`; skill
  synthesizes `01-rca.md` (+ `02-shape.md` standalone).
- **`/wf-meta how` Mode B** — 2–4 explorers → 1 synth agent → return
  `explanation`; skill writes `.ai/research/<topic>-<ts>.md`.
- **`/wf-meta how --research` Mode C** — evaluate **delegating to the built-in
  `/deep-research`** workflow vs. a bespoke 6–8-agent script. Decision recorded
  in this doc; default to delegation if `/deep-research` is present, else
  bespoke. Returns `research`.

### Design notes

- The Mode B/C synthesis agent keeps "inherit parent model" by omitting `model`
  on that `agent()` call (the workflow inherits the session model).
- These sites' fan-out counts (3–8) sit at/above the default threshold of 6 for
  ideate/research and below it for the 3-agent panels — so the 3-agent panels
  only use a workflow when `adversarialVerify` or an explicit `engine:workflow`
  applies. That is intentional: a 3-agent fan-out rarely justifies the runtime
  overhead. Document this in each reference.

### Phase 2 exit criteria

- ✅ Each site runs through `resolveEngine` and produces identical artifacts on both engines.
- ✅ Mode C delegation-vs-bespoke decision recorded; whichever ships, the citation index still targets 200+ sources.
- ✅ No site writes a `.ai/` artifact from inside a workflow (Decision A audit — grep the authored scripts for `.ai/` Write patterns; verifier Check 9 enforces).
- ✅ Threshold behavior documented per reference (which engine each fan-out size selects).

---

## Phase 3 — Multi-stage pipelines

### Sites

- **`/wf plan <slug> all`** — `pipeline` of slices, each producing a plan
  *return* (not a write); a **barrier** then runs the cohesion check across all
  returned plans in the main session, and the skill writes each
  `04-plan-<slice>.md` + the `04-plan.md` master. The barrier is justified:
  cohesion genuinely needs every slice plan at once.
- **`/wf-docs` discover→audit** — `agent(discover)` → `parallel(audit per doc)`;
  return the aggregated audit; skill writes `discover.md` + `audit.md`, then
  **stops at the Step 3 plan gate** and runs the existing `AskUserQuestion`
  (generate-all / P0+P1 / audit-only / adjust). Generation (Step 4) stays
  Claude-orchestrated because it interleaves a per-delete confirmation and is
  itself sequential file-writing. The workflow covers only discover→audit.
- **`/wf-quick update-deps`** — `pipeline` of package batches (web research) →
  barrier → risk-tier synthesis; skill writes `.ai/dep-updates/<run-id>/` and
  drives the tiered, one-at-a-time update commits (unchanged).

### Phase 3 exit criteria

- ✅ `/wf plan all` cohesion check sees all slice plans; artifacts identical across engines; shared-file conflict detection unaffected.
- ✅ `/wf-docs` workflow terminates exactly at the plan gate; the Step 3 `AskUserQuestion` fires in the main session; `--audit-only` short-circuits before any generation.
- ✅ `update-deps` risk tiers (P0/P1/P2/Hold) and never-mix-tiers commit rule preserved.

---

## Phase 4 — Parallel file-mutating waves (new capability, opt-in)

The one place workflows do something Task fan-out cannot: **concurrent
file-editing agents in isolated git worktrees.** Highest risk; ships behind
`config.dispatch.engine: workflow` only (never auto-selected) until proven.

### Sites

- **`/wf plan all` (writing mode)** and a new **DAG slice-wave executor** —
  slices carry `depends_on` (the [IDEAS-3](../../IDEAS-3.md) "DAG-based parallel
  execution" + "agentic concurrent wave execution" items). The workflow groups
  ready slices into waves; slices that share files serialize, independent slices
  run concurrently with `isolation: 'worktree'`. The skill merges worktrees back
  and writes artifacts.
- **`/wf implement reviews`** — optionally parallelize independent findings
  (non-overlapping files) with worktree isolation, keeping overlapping fixes
  sequential. Today it is strictly sequential ([implement.md:198](../../skills/wf/reference/implement.md)).

### Phase 4 exit criteria

- ✅ Concurrent slice/finding agents in worktrees produce no clobbered edits; merge step is clean or reports conflicts explicitly.
- ✅ Shared-file slices/findings provably serialize (planted overlap fixture).
- ✅ Never auto-selected: `engine:auto` always yields `task` for file-mutating sites; only explicit `engine:workflow` enables it.
- ✅ A failed worktree agent drops to `null` and is reported, not silently dropped (no-silent-caps rule).

---

## Phase 5 — Parity, verification, docs, cleanup

- **Codex parity:** confirm `scripts/` regeneration of `.codex-generated/`
  emits the **Task fallback** prose only (workflows stripped). Add a generation
  assertion that no `.codex-generated/**` file references the Workflow tool,
  `agent(`, `pipeline(`, or `_shared/workflow-dispatch.md`.
- **Live routing verifier:** extend
  [`scripts/verify-routing-resolution.mjs`](scripts/verify-routing-resolution.mjs)
  with a fixture per migrated site asserting the engine gate resolves correctly
  under each config/env permutation.
- **Doc site:** add `docs/site/reference/dispatch.html` (engine selection, the
  `dispatch` config block, the structured-return families, the fallback model)
  following the `hooks.html` pattern; cross-link from `types.html`
  (QUALITY-GATES Phase 5).
- **README:** new "Dispatch engine" subsection under *Understanding the system*
  explaining auto-selection and the workflow/Task duality.
- **Cleanup:** fold `/wf review`'s hardcoded `sonnet` into router metadata;
  retire any now-duplicated inline dispatch prose in favor of
  `_shared/workflow-dispatch.md` + a per-site delta.

### Phase 5 exit criteria

- ✅ `.codex-generated/**` contains zero workflow references; Codex build runs every migrated command via Task.
- ✅ `dispatch.html` + README subsection shipped and linked.
- ✅ All inline model strings resolved through `modelFor`; verifier Check 4 + Check 9 green.

---

## Cross-cutting concerns

### Convention over flags

Engine selection is inferred from scale + config, never a per-call flag —
consistent with the registry-driven, flagless philosophy
([[sdlc_convention_over_flags]]). The single knob is the `dispatch` block in
`.ai/sdlc-config.json` (which is gitignored, per-machine — like the serve
config), so determinism-sensitive users or CI can pin `engine:task`.

### Model mapping

Every `agent()` model comes from `modelFor(routerMeta, dim)`. Synthesis agents
intentionally omit `model` to inherit the session model (matches Mode B/C
today). This preserves the v9.17.0 cost optimization exactly.

### External Output Boundary

`/wf-docs` and others enforce a strict no-`.ai/`-leak boundary. Workflow
subagents are fresh-context and won't inherit it — so every authored `agent()`
prompt is prefixed with the canonical boundary preamble from
`_shared/workflow-dispatch.md`. Verifier Check 9 asserts the prefix is present.

### Cost and caps

Per-run ceilings: 16 concurrent / 1,000 total agents. The largest site
(`/review sweep all` with adversarial verify ≈ 31 + ~31×findings) stays well
under 1,000; concurrency just queues. Workflow runs count against plan usage and
rate limits like any session — `log()` the agent count so the cost is visible,
and keep `workflowThreshold` ≥ 6 so small fan-outs don't pay runtime overhead.

### Resume duality (do not conflate)

| Layer | Scope | Mechanism |
|---|---|---|
| **Workflow resume** | Within one Claude Code session | Cached `agent()` results; lost on exit |
| **Artifact resume** | Cross-session, cross-machine, git | `.ai/` + `INDEX.md` + `00-index.md` + `09-ship-run-*` `awaiting-input` |

The workflow layer saves a half-finished fan-out *within* a session; the
artifact layer remains the durable spine. Decision A keeps the artifact layer
authoritative — a workflow that dies mid-run loses only un-returned compute, not
committed stage state.

### Multi-host interaction (verify before Phase 4)

Workflows run locally (16-concurrent bounded by local cores). The
[MULTI-HOST-SUPPORT-PLAN.md](MULTI-HOST-SUPPORT-PLAN.md) execution model and
`skills/wf/reference/runtime-adapters.md` may interact with the local
concurrency ceiling and with worktree isolation. **Read both before designing
Phase 4**; the DAG-wave executor in particular must reconcile workflow-local
worktrees with any remote/multi-host runtime adapter.

---

## Commit sequence and version targets

| Phase | Content | Version |
|---|---|---|
| Phase 0 | Probe, return schemas, `lib/dispatch.mjs`, config block, `_shared/workflow-dispatch.md`, verifier Check 9 | **v9.31.0** |
| Phase 1 | `/wf review` + `/review sweep` pilot with adversarial verify | **v9.31.0** (same drop if 0 is small) or v9.31.1 |
| Phase 2 | ideate, simplify, discover, investigate, rca, how B/C | **v9.32.0** |
| Phase 3 | plan-all cohesion, wf-docs discover→audit, update-deps | **v9.33.0** |
| Phase 4 | Worktree slice-waves + parallel review fixes (opt-in) | **v9.34.0** |
| Phase 5 | Codex parity, verifiers, doc site, README, cleanup | woven into each phase; final sweep at **v9.34.0** |

Phases 0–1 must land together (Phase 1 is the proof that Phase 0's contract
holds). Phases 2–3 are independent and can ship in any order. Phase 4 is gated
and may be deferred indefinitely without blocking the rest.

---

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Hooks don't fire on workflow-subagent writes | Medium | Decision A — skill writes all artifacts; probe in Phase 0 confirms before relying on any subagent write |
| Codex build breaks (no Workflow tool) | High if unguarded | Decision B + Phase 5 generation assertion; `engine` forced to `task` in Codex |
| Adversarial verify drops real findings (over-refutation) | Medium | "default refuted=true if uncertain" tuned conservatively; gate behind `adversarialVerify`; Phase 1 planted-fixture test in *both* directions |
| External Output Boundary leak via fresh-context subagent | Medium | Mandatory prompt-prefix from `_shared`; verifier Check 9 |
| Cost spike from large auto-selected fan-outs | Low | `workflowThreshold` ≥ 6; `log()` agent counts; runs count against normal rate limits |
| Workflow resume mistaken for durable state | Low | Decision A keeps `.ai/` authoritative; documented in Resume duality |
| Multi-host runtime conflicts with local worktrees | Medium (Phase 4 only) | Read MULTI-HOST plan first; Phase 4 opt-in and never auto-selected |
| Research-preview API drift (Workflow constructs change) | Medium | Isolate all script-authoring in `_shared/workflow-dispatch.md` so a contract change is one edit |

---

## Open questions

1. **Hook firing on subagent writes** — resolved by Phase 0 probe; record verdict here. *(pending)*
2. **Mode C: delegate to `/deep-research` or author bespoke?** — depends on whether the built-in is present and whether its citation-index shape matches `.ai/research/` rendering. Decide in Phase 2. *(pending)*
3. **Should `workflowThreshold` differ per family?** Panels (3 agents) vs sweeps (≤31) have very different overhead/benefit. Start with one global value; revisit if 3-agent sites never benefit. *(open)*
4. **Does `engine:auto` ever pick `workflow` on Pro plans** where workflows are off-by-default until `/config`? The gate must treat "installed but not enabled" as unavailable → `task`. Confirm detection mechanism. *(open)*

---

## Single end-to-end acceptance signal

After Phases 0–3 land, all of the following hold:

```
node scripts/verify-router-migration.mjs      # Checks 1–9 green, including dispatch parity
npm test                                       # unit + snapshot + dispatch-gate + return-schema tests pass
```

and, for any migrated site, running it under `dispatch.engine:task` and
`dispatch.engine:workflow` produces **byte-identical `.ai/` artifacts** (modulo
the additive `verified:`/`refuted-count:` review fields) — proving the workflow
is a transparent acceleration layer, not a behavior change.
