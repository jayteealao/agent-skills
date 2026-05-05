---
name: wf
description: Lifecycle-stage execution for SDLC workflows. Dispatches to one of 13 sub-commands — shape (feature discovery + spec), slice (decompose into shippable slices), plan (per-slice implementation plan with reuse scan), implement (code the slice), verify (run tests + checks), review (parallel sub-agent review dispatch), handoff (PR description), ship (release notes + ship), retro (post-mortem), instrument (observability augmentation), experiment (A/B/flag/canary design), benchmark (perf baseline + compare), profile (CPU/memory hotspot analysis). Auto-trigger when the user wants to start a feature spec, slice work, plan a slice, write implementation, run verification, do a code review, prepare a handoff, ship a release, run a retro, add instrumentation, design an experiment, run a benchmark, or profile a hotspot. The 13 sub-commands produce stage artifacts under .ai/workflows/<slug>/ and are the *executors* of the SDLC lifecycle (distinct from /wf-meta which navigates and /wf-quick which starts compressed flows).
---

# External Output Boundary (MANDATORY)
Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.
- Internal context includes workflow artifact paths (`.ai/workflows/...`, `.claude/...`, `.ai/dep-updates/...`), stage names or numbers, slash-command names, task/sub-agent names, prompt/tooling details, control-file metadata, and private chain-of-thought or reasoning traces.
- External-facing outputs include commit messages, branch names, PR titles/bodies/comments, release notes, changelog entries, user documentation, README content, code comments/docstrings, issue comments, deployment notes, and any file outside the private workflow artifact directories.
- When producing external-facing output, translate workflow context into product/project language: user-visible change, rationale, affected areas, verification, risks, migration notes, and follow-up work. Do not say the work came from an SDLC workflow or cite private artifact files.
- Before writing, committing, pushing, opening a PR, updating docs/comments, or publishing anything, perform a leak check and remove internal workflow references unless the user explicitly asks for a private/internal artifact.

You are the **lifecycle-stage dispatcher** for the SDLC plugin. The 13 sub-commands you route to are *stage executors* — each runs one stage of the canonical lifecycle (or one perf/observability augmentation) and writes a stage artifact. Your only job is to identify which stage the user wants, load its reference body, and follow it verbatim.

# Step 0 — Resolve the sub-command

Parse `$ARGUMENTS`. The first token must be one of the 13 known keys below; the remaining tokens are passed verbatim to the loaded reference as `$ARGUMENTS` for the underlying stage.

**Known sub-command keys** — each resolves to `${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/<key>.md`:

| Key | Argument hint | What it does (one line) |
|---|---|---|
| `shape`      | `[slug] [hint]`           | Feature discovery via 20 product-owner questions; writes 02-shape.md (specification artifact). |
| `slice`      | `<slug>`                  | Decompose the shape into 1–N shippable slices; writes 03-slice.md and per-slice 03-slice-<slug>.md files. |
| `plan`       | `<slug> [slice]`          | Per-slice implementation plan with parallel reuse scan; writes 04-plan-<slice>.md. |
| `implement`  | `<slug> [slice\|reviews]` | Code the slice; writes 05-implement-<slice>.md. Second arg `reviews` triggers fix-blockers mode. |
| `verify`     | `<slug> [slice]`          | Run tests, lints, typecheck; writes 06-verify-<slice>.md with pass/fail per check. |
| `review`     | `<slug> [slice\|triage]`  | Intelligent parallel sub-agent review dispatch. Selects relevant review skills, runs each in parallel, aggregates findings, triages via AskUserQuestion. Writes 07-review-<slice>.md + per-command sub-reviews. `triage` re-visits deferred findings. |
| `handoff`    | `<slug>`                  | Aggregate completed slices into a PR description; writes 08-handoff.md. Refuses if any per-slice review has unresolved blockers. |
| `ship`       | `<slug>`                  | Release notes + ship; writes 09-ship.md. Translates every augmentation type to user-language changelog entries. |
| `retro`      | `<slug>`                  | Post-mortem across the workflow; writes 10-retro.md. |
| `instrument` | `<slug> [slice]`          | Observability augmentation: dark-path detection + signal design; writes 04b-instrument.md. |
| `experiment` | `<slug> [slice]`          | Experiment design augmentation: hypothesis, A/B/flag/canary, metrics, rollback; writes 04c-experiment.md. |
| `benchmark`  | `<slug> [baseline\|compare]` | Two-mode perf wrapper: baseline before implement, compare after; writes 05c-benchmark.md. Regression tripwires at >10% CPU / >25% memory. |
| `profile`    | `<area>`                  | Static + dynamic profiling via Node --cpu-prof, Go pprof, py-spy. Standalone artifact at .ai/profiles/<run-id>/. Does NOT modify application code. |

**Resolution rules:**

1. If the first positional token matches one of the 13 keys, mode is **dispatch** and the remaining tokens become the sub-command's `$ARGUMENTS`.
2. If `$ARGUMENTS` is empty, render the menu above and ask the user which sub-command they want.
3. If the first token is *not* a known key, **do not** silently treat it as a slug. Tell the user: *"`<token>` is not a known wf sub-command. Pick one of: shape, slice, plan, implement, verify, review, handoff, ship, retro, instrument, experiment, benchmark, profile."*

# Step 1 — Execute

1. Read the reference file in full from `${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/<key>.md`.
2. Treat its content as your instructions for this invocation. Do not summarize, paraphrase, or skip — follow it verbatim.
3. The reference body contains the stage's full definition (preamble, prerequisites, conditional inputs, output contract, adaptive routing). Honor every conditional input and every artifact write the reference describes.
4. The remaining `$ARGUMENTS` after the matched key are the sub-command's own arguments — pass them through verbatim.

# Notes

- **No sweep mode.** Like `/wf-quick` and `/wf-meta`, the 13 sub-commands here are sequential lifecycle stages, not orthogonal lenses on a shared target. The `aggregates` field in `router-metadata.json` is intentionally empty. Only `/review` has sweeps.
- **Auto-trigger.** This skill is invoked when the user asks to start a feature spec, slice work, plan a slice, implement code, verify, review, hand off, ship, run a retro, instrument, design an experiment, benchmark, or profile a hotspot. The harness picks the skill via the `description:` keyword match. The user can also invoke explicitly by typing `/wf <key> <args>` — Claude Code resolves bare slash invocations to skills when no command file exists at that path.
- **Legacy syntax removed.** The 13 standalone `/wf-X` slash commands (where X ∈ {shape, slice, plan, implement, verify, review, handoff, ship, retro, instrument, experiment, benchmark, profile}) were removed in v9.0.0-alpha.4. Each is now invoked as `/wf X <args>`. Migration table in `CHANGELOG.md`.
- **Distinction from `/wf-meta` and `/wf-quick`.** `/wf-quick` *starts* new workflows (intake, RCA, hotfix, etc.); `/wf-meta` *navigates and manages* existing ones (status, resume, amend, close); `/wf` *executes* the canonical lifecycle stages and produces stage artifacts. Three orthogonal skills, no overlap.
- **`/wf review` vs `/review`.** `/wf review <slug>` runs the review stage of an SDLC workflow — it knows about the workflow's slug, slice, prerequisites, and verdict contract; it dispatches to per-dimension reviews internally. `/review <dim>` is the bare review skill — runs one review dimension on the current diff with no workflow context. Use `/wf review` inside a workflow; use `/review` for ad-hoc PR review or outside the lifecycle.
- **`profile` is shared with `skills/wf-profile/`.** The `/wf profile` reference (skills/wf/reference/profile.md) is the slash-invocation orchestrator. The actual profiling skill lives at `skills/wf-profile/SKILL.md` and is also called by `/wf-quick investigate`, `/wf benchmark`, and `/wf implement` for in-stage performance analysis. The orchestrator delegates; the skill executes.
