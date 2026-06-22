# YOLO — Autonomous Workflow-Driven Lifecycle Driver

`/wf yolo` is an **autonomous sibling of `/wf auto`**. Where `auto` removes
inter-stage friction but **pauses** at every stage gate for the user, `yolo`
makes those gate decisions itself — in the user's best interest, by a written
policy — and drives an intaked slug to the review endpoint **without stopping**.
It is built on Claude Code's **Workflow** tool (a background JS orchestration
runtime that spawns fresh-context subagents), staying sequential on the stage
chain and fanning out only where parallelism is safe and valuable.

> **Claude-only.** `yolo` is built on the Workflow tool, which the Codex runtime
> does not have. It lives **only** in `plugins/sdlc-workflow/` and is **never**
> mirrored to `plugins/sdlc-workflow-codex/`. No `npm run sync:codex` for yolo;
> the Codex `wf` dispatcher must never gain the `yolo` key. This is a permanent
> divergence between the two builds, by design.

> **Relationship to `/wf auto`.** `auto` stays exactly as it is — the
> human-in-the-loop driver. `yolo` does not replace it, modify it, or weaken it.
> They are two drivers over the same stage references and the same artifact
> state-machine; the only difference is who answers the gates.

---

## 1. Locked decisions

| Decision | Value |
|---|---|
| **Name** | `yolo` → `/wf yolo <slug> [<slice>]`; prototype script `wf-yolo.js` |
| **Modes** | **Both** — slug (whole workflow → stop before handoff) and slice (one slice → route to next). One parameterized script, mode inferred from args. |
| **Fan-out default** | **Safe set** — review internals (dimensions + adversarial verify), plan reuse scan, cross-slice *planning*. Parallel file-mutating implement stays **opt-in / experimental**. |
| **Fix posture** | **Fix as much as possible.** Blockers + HIGH + **all MEDIUMs always**. LOW/nit fixed **when necessary** (in-scope, localized, safe); defer only with a recorded rationale. |
| **Endpoint** | Same as `auto`: stops **before** handoff. Never opens a PR, runs handoff/ship/retro, or touches CI. |
| **Platform** | **Claude-only.** Never in the Codex build. |

---

## 2. The sequential / parallel map

The governing principle: **parallelize analysis and review internals freely;
serialize anything that writes code.**

| Axis | Unit | Mode | Why |
|---|---|---|---|
| Stage chain | `plan → implement → verify → review` | **Sequential — mandatory** | `implement` needs the plan; `verify` tests that code; `review` reads that diff. No fan-out exists here. |
| Within `plan` | reuse / prior-art scan | **Fan out** | Independent codebase lookups; returns a structured reuse brief. |
| Within `review` | per-dimension reviewers | **Fan out + adversarial verify** | Dimensions are independent; each surfaced finding is refuted by N skeptics before it reaches the autonomous fix decision. |
| Within `verify` | independent checks (lint / typecheck / suites) | **Fan out (modest)** | Independent commands; bounded gain. |
| Cross-slice — analysis | `plan` per slice | **Fan out** | Planning writes no code; slices plan concurrently. |
| Cross-slice — mutation | `implement` per slice | **Sequential by default; worktree-parallel only if provably disjoint** | Parallel implement mutates files → needs `isolation: 'worktree'` + a clean merge. High value, high risk. Phase 5, opt-in, fail-closed. |
| Final slug-wide review | the one `07-review.md` | **Fan out internally** | Largest single review; dimension fan-out + adversarial verify pay off most here. |

---

## 3. The Autonomous Decision Policy (safety core)

This is the heart of `yolo` and the one artifact that must be ratified before any
code runs. Every gate that `auto` defers to the user, `yolo` resolves by the rule
below. Two tiers: **auto-resolve** (proceed, *recording* the decision into the
stage artifact) and **HARD-STOP** (end the run with the artifact trail and a
reason — even an autonomous driver refuses to cross these).

| Gate | Auto-resolve | **HARD-STOP** |
|---|---|---|
| `plan` scope fork (`awaiting-input`) | Implementation-detail forks: pick the option best satisfying the slice AC at least cost; **record the assumption** (`decision`/`rationale`). | A fork that changes **user-observable scope or contract** — that is a product decision, not a best-interest call. |
| `verify` failing check / unmet AC | Auto-fix: spawn fix sub-agent, re-run affected checks once. Up to **N = 2** rounds. | Still failing after 2 rounds (`convergence: escalated`), or `result: blocked-runtime-evidence-missing` (cannot fabricate runtime proof). |
| `review` triage | **Fix** every BLOCKER + HIGH + **MEDIUM (always)**. **Fix** LOW/nit when *necessary* = in-scope (touches this slice's diff) ∧ localized ∧ safe; else **defer-and-record**. Never silently dismiss. | `verdict: dont-ship`, or an unfixable **security / data-loss** blocker after the fix loop. |
| `branch` posture | If `yolo` created/owns the branch, switch to it. | A switch would clobber uncommitted work (never stash/force). |
| `intake` / `shape` (PO alignment) | **Never autonomous** — these own product-owner alignment. | `01-intake.md` / `02-shape.md` missing or `awaiting-input` → stop, route to `/wf intake`. |
| Any stage | — | The stage itself STOPs with an error. |

**Two invariants make this auditable, not reckless:**

1. **Every autonomous decision is written into the stage artifact** — `decision:`,
   `rationale:`, `surfaced-at:` — so a `yolo` run is exactly as inspectable as a
   human-gated one. Nothing dies silently inside an artifact.
2. **`yolo` never expands past review.** The autonomy is bounded to *building and
   reviewing* — never *publishing*. No PR, no ship, no CI, identical to `auto`.

> **The fix posture, precisely.** "Fix as much as possible" means the default
> action on any finding is *fix*. MEDIUMs lose the option to defer. LOW/nits keep
> a defer escape, but only when fixing them would reach outside the slice's diff,
> be non-localized, or risk a convention conflict — and the defer is always
> recorded with its reason. An unfixable finding is recorded `could-not-fix`, and
> only escalates to a HARD-STOP if it is a BLOCKER that is security/data-loss or
> the verdict is `dont-ship`.

---

## 4. Architecture

The Workflow runtime gives the script body **no filesystem access** — only
`agent()` subagents have tools. So in a `yolo` run, **stage subagents do all the
artifact writes**, exactly as the manual stages do today. The script is pure
orchestration: select stage → run it as a subagent → gate on its structured
return → loop.

### 4.1 Stage-runner (wrap, not fork)

One `agent()` abstraction runs any stage autonomously and returns a schema'd
terminal state. It points the subagent at the **existing on-disk reference** and
overrides only the interactive part — so `yolo` inherits every future
improvement to `plan.md` / `verify.md` / `review.md` automatically, with zero
duplicated stage logic.

```javascript
const STAGE_RESULT = {                       // JSON Schema (abbrev.)
  type: 'object',
  required: ['stage', 'status', 'artifactPath', 'terminal'],
  properties: {
    stage: { type: 'string' }, slice: { type: 'string' },
    status: { enum: ['complete', 'hard-stop'] },
    artifactPath: { type: 'string' },
    terminal: { type: 'object' },            // verify→{convergence,result}; review→{verdict,blockerCount}
    decisions: { type: 'array' },            // recorded autonomous calls (decision/rationale)
    residual:  { type: 'array' },            // unresolved findings (could-not-fix / deferred)
    hardStopReason: { type: 'string' },
  },
}

const runStage = (stage, { slug, slice, root }) => agent(
  `Execute the SDLC '${stage}' stage for slug '${slug}'${slice ? `, slice '${slice}'` : ''}.
   Read ${root}/skills/wf/reference/${stage}.md in full and follow it VERBATIM, with ONE override:
   wherever it instructs you to ask the user (AskUserQuestion), DO NOT ask. Apply the
   Autonomous Decision Policy — fix BLOCKER+HIGH+all-MEDIUM, fix in-scope/localized/safe LOW+nit,
   defer-and-record the rest; HARD-STOP on dont-ship / unfixable security|data-loss / verify
   escalated after 2 rounds / a scope-changing plan fork — and WRITE every decision into the
   artifact. Honor the External Output Boundary on any commit message. Return the terminal state.`,
  { schema: STAGE_RESULT, label: `${stage}${slice ? ':' + slice : ''}`, phase: 'Drive' }
)
```

### 4.2 Idempotent artifact-gating → free cross-session resume

Before running a stage, the workflow checks whether its artifact already exists
and is terminal (a cheap read-only probe agent or `Bash` stat). Done stages are
skipped. Because the durable record is still the on-disk artifact trail
(`00-index.md` + numbered files), a killed run resumes on re-invocation exactly
like `auto` — **no separate state file.** Within a session, `resumeFromRunId`
replays the cached `agent()` prefix.

### 4.3 Fan-out internals

- **review:** `parallel(dimensions.map(reviewer))` → each finding refuted by N
  skeptics (`default refuted=true if uncertain`) → only survivors enter the
  autonomous fix decision. Higher signal *before* auto-fix means fewer
  false-positive fixes.
- **plan:** keep the internal reuse/prior-art scan as parallel `agent()` calls
  returning a structured brief.
- **cross-slice plan (slug mode):** plan all slices concurrently (read-only),
  then feed each into its sequential build chain.

### 4.4 Worktree isolation (Phase 5, opt-in)

Parallel `implement` across slices whose plans declare disjoint target files,
via `isolation: 'worktree'`, then a serialized integration pass (apply each
worktree's commits to the slug branch, re-verify the integrated tree). **Default
off**; gated behind explicit opt-in; the disjointness check **fails closed** (any
file overlap → fall back to sequential).

---

## 5. Control flow

### Slug mode — `/wf yolo <slug>`

```javascript
const idx = await orient(args)               // read 00-index.md + roster; resolve scope, convention, branch
if (idx.reviewScope === 'per-slice') {
  await pipeline(idx.slices,                  // independent sequential chains; fan out the CHAINS
    s => runStage('plan', forSlice(s)),
    (_, s) => driveChain(['implement','verify','review'], s, idx))   // implement serialized inside each
} else {                                      // slug-wide
  for (const s of idx.slices)                 // serialize: implement builds on prior commits
    await driveChain(['plan','implement','verify'], s, idx)
  await runSlugWideReview(idx)                // ONE review over the branch diff — fan out internally
}
// endpoint → stop before handoff; summary recommends `/wf handoff <slug>`
```

### Slice mode — `/wf yolo <slug> <slice>`

```javascript
const idx = await orient(args)
await driveChain(
  idx.reviewScope === 'per-slice'
    ? ['plan','implement','verify','review']
    : ['plan','implement','verify'],          // slug-wide: stop before review (it runs once, later)
  args.slice, idx)
// route → next roster slice `/wf yolo <slug> <next>`; last slice → final review (slug-wide) or handoff
```

`driveChain` runs stages sequentially, gating each on `STAGE_RESULT.terminal` per
§3, HARD-STOPping (and emitting the trail) when the policy says so.

---

## 6. Risks & guardrails

| Risk | Guardrail |
|---|---|
| Autonomous review ships a real bug | Adversarial-verify before auto-fix; HARD-STOP on dont-ship / unfixable security|data-loss; every decision recorded for audit. |
| ~~Hooks don't fire on workflow-subagent writes~~ | **RESOLVED 2026-06-21 (GREEN) — see Phase 0 result.** Subagent writes hit the same hooks and persist to real disk; no fallback needed. |
| Parallel implement corrupts the tree | Off by default; disjointness check fails closed; worktree isolation + serialized integration + re-verify. |
| Internal-artifact leak into commits | Stage-runner prompt re-asserts the External Output Boundary (fresh-context subagents don't inherit it); `log()` is internal-audience only. |
| Over-reach past review | Hard architectural stop at review — no handoff/ship/PR, identical to `auto`. |
| Wrong best-interest call on scope | Scope-changing `plan` forks are HARD-STOP, not auto-resolved. |
| Mistaken for `auto` / accidentally autonomous | Distinct key, distinct name; the dangerous semantics are in the name. |

---

## 7. Triggering & wiring

- **Script location (DECIDED + BUILT 2026-06-22):** ONE source of truth at
  `skills/wf/workflows/yolo.js` inside the plugin — *not* a `.claude/workflows/` copy.
  The plugin is installed globally, so the script must travel with it; a per-repo copy
  would only drift. The same path serves both dev iteration (no rebuild) and production.
- **Production (BUILT):** the Claude-only `/wf yolo` key + `reference/yolo.md` instruct
  Claude to invoke the Workflow tool as
  `Workflow({ scriptPath: <pluginRoot>/skills/wf/workflows/yolo.js, args: { projectRoot,
  referenceRoot: <pluginRoot>/skills/wf/reference, slug, [slice] } })`. The user typing
  `/wf yolo <slug>` **is** the explicit Workflow opt-in. All paths absolute (Phase-0 caveat).
- **Dispatcher changes (Claude build only — DONE):** `yolo` added to the 18→19 key
  table, the description, the argument-hint, both resolution rules, and the Step 0.5
  fuzzy-suggest **exclusion** list (it owns its own slug resolution like `auto`). Codex
  `SKILL.md` deliberately left at 18 keys, no `yolo`.
- **Build rules (CORRECTED 2026-06-22):** `skills/` (SKILL.md, reference/, the workflow
  script) are read **from source**, not bundled into `dist/` — so adding `yolo` needs
  **no `npm run build` and no version bump to function** (those gate only dist/template/
  CSS changes). `sync:codex` copies only `dist/assets/components/schemas/docs`, so it
  **structurally cannot** carry a skills-only key to the Codex mirror — the Claude-only
  invariant holds by construction (verified: Codex `SKILL.md` still 18 keys, no `yolo`;
  `npm run verify` green). A version bump + CHANGELOG entry remain a deliberate *release*
  step taken after live validation — not required to run the feature.

---

## 8. Phased implementation

0. **Hook-firing probe** — ✅ **DONE / GREEN (2026-06-21).** See *Phase 0 result* below.
1. **Policy ratified** — ✅ this doc's §3 table, agreed.
2. **MVP: both modes, both scopes** — ✅ **BUILT (2026-06-22).** Sequential
   `plan→implement→verify[→review]` per slice, autonomous policy gates, branch policy,
   verify 2-round fix loop, artifact-gated resume (orient reports per-slice terminal
   state → done stages skipped). *Live-validation gate STILL OPEN: run against a real
   slug, diff artifacts vs. a manual `auto` run.*
3. **Review fan-out** — ✅ **BUILT, opt-in (`args.reviewFanout`, default off).** Parallel
   dimension scouts → adversarial-verify each finding (refute, default-refuted) → a
   wrapped `review.md` writer given the survivors (review.md keeps ownership of the
   ledger/triage/fix — wrap, not fork). Off until artifact-parity vs. the wrapped form is proven.
4. **Slug mode** — ✅ **BUILT.** Sequential slice iteration (mirrors `auto`) + one final
   slug-wide review. Cross-slice parallel *plan* is opt-in (`args.planFanout`, default
   off — it races the shared `00-index.md`; validate parity first).
5. **(Experimental) parallel implement in worktrees** — ⏸ **deferred.** The fail-closed
   disjointness design (§4.4) stands; not yet wired.

Each phase ships behind its own validation gate; nothing generalizes until the narrower
form matches `auto`'s artifact quality. **The fan-out paths (Phase 3, Phase 4's plan
fan-out, Phase 5) are present in the script but gated OFF by default for exactly this
reason: the fully-sequential core is the validatable baseline that tracks `auto`
control-flow-for-control-flow; flip a single `args` flag once parity is proven.**

### Build result — files (2026-06-22)

| File | Role |
|---|---|
| `skills/wf/workflows/yolo.js` | The driver script — orient → driveChain → policy gates → structured outcome. ~Both modes, both scopes, verify 2-round loop, opt-in fan-out. Validated: `meta` pure-literal, body parses as an async workflow. |
| `skills/wf/reference/yolo.md` | The `/wf yolo` reference — EOB header, the policy table, Step 0 arg resolution (absolute paths), Step 1 Workflow-tool invocation, Step 2 hand-back contract. |
| `skills/wf/SKILL.md` | Dispatcher: +`yolo` row, 18→19 counts, resolution rules, Step 0.5 exclusion. Claude build only. |

**Deviations from the original plan, with reasons:** (1) one plugin-resident script
instead of a `.claude/workflows/` prototype copy — the global install demands it; (2)
no version bump/rebuild — skills are source-read (corrected §7); (3) fan-out gated OFF
by default rather than on — the plan's own §8 "validate the narrower form first" applied
to the wrap-vs-fork hazard in review fan-out and the shared-`00-index.md` race in plan
fan-out. The sequential core honors the §2 governing principle ("serialize anything that
writes code") literally.

### Phase 0 result — workflow-subagent writes are first-class (2026-06-21)

Probed in a throwaway repo with the plugin installed globally. A workflow
subagent performed two Writes to `.ai/workflows/probe-wf/`:

- **Invalid** (no frontmatter) → **blocked by PreToolUse `pre-write-validate`**;
  file never created. Block message authentic and slug-specific.
- **Valid** (schema/type/slug) → **written and persisted to real disk**;
  PostToolUse `post-write-verify` independently fired and flagged it against the
  *full* `sdlc/v1` schema (file persists, surfaced as needing fix).

Verified by independent on-disk inspection, not the subagent's self-report (the
first run's report was misleading — see caveat 1).

**Verdict: stage subagents write the artifact trail directly. No render/validate
fallback needed.** The hook layer treats a subagent Write identically to a
main-session Write.

**Two operational caveats now baked into the architecture:**
1. **Subagents inherit the parent session's cwd**, not a per-repo cwd. Pass the
   **absolute** project root / `referenceRoot` to every stage subagent — an
   `undefined`/relative path silently writes into cwd (the first probe run did
   exactly this, minting a stray `undefined/.ai/...` tree). Never let a path arg
   be undefined.
2. **`post-write-verify` enforces COMPLETE frontmatter.** yolo's stage subagents
   must emit schema-complete artifacts (the real stage references already do). An
   incomplete write earns an exit-2 fix-me error — a safety net, not a blocker;
   the file still lands and the subagent re-edits.

---

## 9. Open decisions

1. ~~**Probe outcome (Phase 0)**~~ — **RESOLVED 2026-06-21:** yes, hooks fire on
   workflow-subagent writes and they persist to disk. Stage subagents write
   artifacts directly; pass absolute paths. *(see Phase 0 result)*
2. **`N` (verify fix rounds)** — start at 2; revisit if too eager/too quick to
   stop. *(open)*
3. **"Necessary" LOW/nit rubric** — codified as in-scope ∧ localized ∧ safe; tune
   after the first real runs. *(open)*
4. ~~**v1 surface**~~ — **RESOLVED 2026-06-22: built both modes in one script**;
   validate slice-first per §8. Fan-out (review dimensions, cross-slice plan) is gated
   OFF by default pending artifact-parity; the sequential core is the v1 surface.
5. **Live validation venue** — needs a repo with an active intaked slug. Options: a
   real in-flight slug, or scaffold a tiny throwaway slug (e.g. in the existing
   `yolo-hook-probe` repo) and diff `/wf yolo` artifacts vs. a manual `/wf auto` run.
   *(open — the one remaining gate before flipping any fan-out flag on)*
