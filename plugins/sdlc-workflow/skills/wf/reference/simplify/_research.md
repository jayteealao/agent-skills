# Simplify — the three review charters

Load this file from `simplify.md` Step 2. It holds the effort tier, the shared inputs, the output contract, and the three charters. The body keeps the dispatch rule: all three sub-agents launch in one parallel wave per [_subagents.md](../_subagents.md).

**Effort tier for every dispatched agent:** **low** (per [_subagents.md](../_subagents.md)). REQUIRED on every dispatch — reviewers must not silently inherit the parent's model.

Each agent receives the scope token + target, the Step 1 input (`INPUT_DIFF`, `INPUT_PLAN_TEXT`, or codebase file list), and one charter below.

## Output contract

Each agent returns a structured findings list:

```yaml
findings:
  - id: <agent>-<n>          # e.g., reuse-1, quality-3
    severity: high | med | low | nit
    location: <file:line | plan-section | path>
    issue: <one-sentence problem statement>
    suggestion: <one-sentence fix>
    rationale: <one-or-two sentences why this matters>
```

## Agent 1 — Code Reuse Review

For each change in scope:

1. **Search for existing utilities and helpers** that could replace newly written code — `lib/`, `utils/`, `helpers/`, shared modules, files adjacent to the changed ones.
2. **Flag any new function that duplicates existing functionality.** Suggest the existing function to use instead.
3. **Flag any inline logic that could use an existing utility** — hand-rolled string manipulation, manual path handling, custom environment checks, ad-hoc type guards, custom retry loops, hand-written debounce/throttle.

### Plan-scope adaptation
For `plan` scope: flag plan steps that propose new code where a reuse-scan should have surfaced an existing helper. Quote the plan section verbatim in `location` and the existing helper path in `suggestion`.

## Agent 2 — Code Quality Review

Review for hacky patterns:

1. **Redundant state**: duplicates existing state, cached values that could be derived, observers/effects that could be direct calls.
2. **Parameter sprawl**: new parameters added instead of generalizing or restructuring existing ones.
3. **Copy-paste with slight variation**: near-duplicate code blocks that should be unified with a shared abstraction.
4. **Leaky abstractions**: internal details exposed that should be encapsulated, or existing abstraction boundaries broken.
5. **Stringly-typed code**: raw strings used where constants, enums (string unions), or branded types already exist.
6. **Unnecessary JSX/template nesting**: wrapper Boxes/Views/divs/elements with no layout value — check if inner component props already provide the needed behavior.
7. **Unnecessary comments**: comments explaining WHAT (well-named identifiers do that), narrating the change, or referencing the task/caller — delete; keep only non-obvious WHY (hidden constraints, subtle invariants, workarounds).

### Plan-scope adaptation
For `plan` scope: hunt the same defect classes in the plan's prose and structure instead of code.

## Agent 3 — Efficiency Review

Review for efficiency:

1. **Unnecessary work**: redundant computations, repeated file reads, duplicate network/API calls, N+1 patterns.
2. **Missed concurrency**: independent operations run sequentially when they could be parallel.
3. **Hot-path bloat**: new blocking work in startup or per-request/per-render hot paths.
4. **Recurring no-op updates**: unconditional state/store updates in polling loops, intervals, or event handlers — add a change-detection guard. Also: verify that wrapper functions taking an updater/reducer callback honor same-reference returns — otherwise callers' early-return no-ops are silently defeated.
5. **Unnecessary existence checks**: pre-checking file/resource existence before operating (TOCTOU anti-pattern) — operate directly and handle the error.
6. **Memory**: unbounded data structures, missing cleanup, event listener leaks.
7. **Overly broad operations**: reading entire files when only a portion is needed, loading all items when filtering for one.

### Plan-scope adaptation
For `plan` scope: hunt the same efficiency classes in the plan's steps instead of code.

## Provenance + deliberate divergence from upstream

`/wf simplify` **adapts** the upstream bundled `simplify` skill (source studied at `.scratch/claude-code/src/skills/bundled/simplify.ts`) but **diverges deliberately** in one critical way:

| | Upstream bundled `simplify` | sdlc-workflow `/wf simplify` |
|---|---|---|
| Agent rubrics | Reuse, Quality, Efficiency | Same — kept verbatim |
| Dispatch shape | Three parallel sub-agents | Same |
| Action after findings | **Applies fixes directly** | **Routes findings to downstream commands; never writes code** |
| Output | Ephemeral chat summary | `.ai/workflows/<slug>/01-simplify.md` artifact (`type: simplify-run`) in a `type: workflow-index` slug workflow |

The divergence is intentional: every command in this plugin operates as an **orchestrator, not a problem-solver**. Plan plans; implement implements; review reviews; simplify routes. The user invokes the appropriate downstream command for code action — each runs its own discipline, keeping the artifact trail clean and preventing simplify from becoming a back-door code-write path that bypasses review, verify, or planning.

If the upstream rubric evolves, update the charters above to match and bump the CHANGELOG.
