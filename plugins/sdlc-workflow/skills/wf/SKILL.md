---
name: wf
description: SDLC lifecycle-stage executor. Runs one canonical stage (intake, shape, slice, plan, implement, verify, review, handoff, ship, retro) or a perf/observability augmentation (instrument, experiment, benchmark, profile) and writes its stage artifact under `.ai/workflows/<slug>/`. Use `/wf-meta` to navigate workflows and `/wf-quick` for compressed/standalone flows.
disable-model-invocation: true
argument-hint: "<intake|shape|slice|plan|implement|verify|review|handoff|ship|retro|instrument|experiment|benchmark|profile> [args...]"
---

# External Output Boundary (MANDATORY)
Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.
- Internal context includes workflow artifact paths (`.ai/workflows/...`, `.claude/...`, `.ai/dep-updates/...`), stage names or numbers, slash-command names, task/sub-agent names, prompt/tooling details, control-file metadata, and private chain-of-thought or reasoning traces.
- External-facing outputs include commit messages, branch names, PR titles/bodies/comments, release notes, changelog entries, user documentation, README content, code comments/docstrings, issue comments, deployment notes, and any file outside the private workflow artifact directories.
- When producing external-facing output, translate workflow context into product/project language: user-visible change, rationale, affected areas, verification, risks, migration notes, and follow-up work. Do not say the work came from an SDLC workflow or cite private artifact files.
- Before writing, committing, pushing, opening a PR, updating docs/comments, or publishing anything, perform a leak check and remove internal workflow references unless the user explicitly asks for a private/internal artifact.

You are the **lifecycle-stage dispatcher** for the SDLC plugin. The 14 sub-commands you route to are *stage executors* — each runs one stage of the canonical lifecycle (or one perf/observability augmentation) and writes a stage artifact. Your only job is to identify which stage the user wants, load its reference body, and follow it verbatim.

# Step 0 — Resolve the sub-command

Parse `$ARGUMENTS`. The first token must be one of the 14 known keys below; the remaining tokens are passed verbatim to the loaded reference as `$ARGUMENTS` for the underlying stage.

**Known sub-command keys** — each resolves to `${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/<key>.md`:

| Key | Argument hint | What it does (one line) |
|---|---|---|
| `intake`     | `<task-description>`      | Stage 1 of 10 in the full SDLC lifecycle. Converts a rough request into a clear intake brief, creates the workflow folder, captures product-owner answers, establishes the canonical slug. |
| `shape`      | `[slug] [hint]`           | Feature discovery via 20 product-owner questions; writes 02-shape.md (specification artifact). |
| `slice`      | `<slug>`                  | Decompose the shape into 1–N shippable slices; writes 03-slice.md and per-slice 03-slice-<slug>.md files. |
| `plan`       | `<slug> [slice]`          | Per-slice implementation plan with parallel reuse scan; writes 04-plan-<slice>.md. |
| `implement`  | `<slug> [slice\|reviews]` | Code the slice; writes 05-implement-<slice>.md. Second arg `reviews` triggers fix-blockers mode. |
| `verify`     | `<slug> [slice]`          | Run tests, lints, typecheck; writes 06-verify-<slice>.md with pass/fail per check. |
| `review`     | `<slug> [slice\|triage]`  | Intelligent parallel sub-agent review dispatch. Selects relevant review skills, runs each in parallel, aggregates findings, triages via AskUserQuestion. Scope follows `review-scope` in `00-index.md` (set at intake): `per-slice` (default) writes `07-review-<slice>.md` + per-command sub-reviews against `git diff HEAD`; `slug-wide` writes a single `07-review.md` against `git diff <base>...HEAD`. `triage` re-visits deferred findings on the active artifact. |
| `handoff`    | `<slug>`                  | Aggregate completed slices into a PR description; writes 08-handoff.md. Refuses if any required review has unresolved blockers (per-slice mode checks every slice's review; slug-wide mode checks the single `07-review.md`). |
| `ship`       | `<slug>`                  | Release notes + ship; writes 09-ship.md. Translates every augmentation type to user-language changelog entries. |
| `retro`      | `<slug>`                  | Post-mortem across the workflow; writes 10-retro.md. |
| `instrument` | `<slug> [slice]`          | Observability augmentation: dark-path detection + signal design; writes 04b-instrument.md. |
| `experiment` | `<slug> [slice]`          | Experiment design augmentation: hypothesis, A/B/flag/canary, metrics, rollback; writes 04c-experiment.md. |
| `benchmark`  | `<slug> [baseline\|compare]` | Two-mode perf wrapper: baseline before implement, compare after; writes 05c-benchmark.md. Regression tripwires at >10% CPU / >25% memory. |
| `profile`    | `<area>`                  | Static + dynamic profiling via Node --cpu-prof, Go pprof, py-spy. Standalone artifact at .ai/profiles/<run-id>/. Does NOT modify application code. |

**`/wf review` vs `/review`:** `/wf review <slug>` runs the review stage *inside an SDLC workflow* — it knows the slug, slice (when `review-scope: per-slice`), prerequisites, and verdict contract, and dispatches per-dimension reviews internally. With `review-scope: slug-wide` (chosen at intake) the same command reviews the whole branch diff and writes a single `07-review.md`. For ad-hoc PR review with no workflow context, use the bare `/review <dim>` skill instead.

**Resolution rules:**

1. If the first positional token matches one of the 14 keys, mode is **dispatch** and the remaining tokens become the sub-command's `$ARGUMENTS`.
2. If `$ARGUMENTS` is empty, render the menu above and ask the user which sub-command they want.
3. If the first token is *not* a known key, **do not** silently treat it as a slug. Tell the user: *"`<token>` is not a known wf sub-command. Pick one of: intake, shape, slice, plan, implement, verify, review, handoff, ship, retro, instrument, experiment, benchmark, profile."*

# Step 0.5 — Fuzzy-suggest unknown slugs (v9.11.0)

After sub-command resolution, before dispatch: if the user passed a positional slug arg and it doesn't match any row in `.ai/workflows/INDEX.md`, surface a typo suggestion instead of letting the reference fail later with an opaque "workflow not found" error.

**Applies to** these 13 sub-commands (everything that *consumes* an existing slug):

`shape`, `slice`, `plan`, `implement`, `verify`, `review`, `handoff`, `ship`, `retro`, `instrument`, `experiment`, `benchmark`, `profile`

**Does NOT apply** to `intake` (it *creates* the slug, doesn't consume it — collision detection lives in `intake.md` Step 0 sub-step 2 instead). `profile`'s first arg is `<area>`, not a slug — skip Step 0.5 for `profile` as well. *Keep this exclusion list in sync with the 14-key dispatch table — exclude any future sub-command that creates a new slug rather than consuming an existing one.*

**Procedure:**

1. Identify the slug candidate. For most sub-commands the slug is the first positional token after the sub-command name. For `implement`, `verify`, `review`, `plan`, `handoff`, `ship`, `retro`, `instrument`, `experiment`, `benchmark` the slug is `$1` of the sub-command's `$ARGUMENTS`. If `$1` is empty (the user passed no slug), skip Step 0.5 — slug resolution falls through to the reference's existing single-active-workflow inference.
2. If `.ai/workflows/INDEX.md` does not exist → skip Step 0.5 (no registry → no candidate set for fuzzy match). The reference will handle the missing-slug case downstream.
3. Grep `INDEX.md` for an exact match: `grep -P "^<candidate>\t" .ai/workflows/INDEX.md`. If hit → slug is real, dispatch normally.
4. **On miss**, run a fuzzy match against every row's slug column (first tab-separated field, including closed rows — a real-but-closed slug is still useful as a suggestion):
   - Compute Levenshtein edit distance from `<candidate>` to each indexed slug.
   - Also check substring inclusion: a candidate that is a contiguous substring of an indexed slug (or vice versa) counts as a strong match.
   - Pick the best match: prefer the slug with edit distance ≤ 2, then the slug that contains `<candidate>` as a substring, then the slug `<candidate>` contains as a substring.
   - If no slug satisfies any of those conditions → no suggestion exists. STOP with: *"Unknown slug `<candidate>`. Run `/wf-meta status` to list all workflows, or `/wf intake <description>` to start a new one."*
5. If a best match exists, STOP with: *"Unknown slug `<candidate>`. Did you mean `<best-match>`<closed-suffix>? (Run `/wf-meta status` to list all workflows.)"* — where `<closed-suffix>` is ` (closed)` if and only if the best-match row's status column is `closed`, empty otherwise. Show the user the corrected command verbatim so they can copy-edit it: e.g., *"Retry: `/wf <sub-command> <best-match> <remaining args>`"*.
6. Step 0.5 is purely advisory — it never auto-corrects. The user must re-invoke with the suggested slug. This avoids the "the model decided to do something I didn't ask for" failure mode.

# Step 1 — Execute

1. Read the reference file in full from `${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/<key>.md`.
2. Treat its content as your instructions for this invocation. Do not summarize, paraphrase, or skip — follow it verbatim.
3. The reference body contains the stage's full definition (preamble, prerequisites, conditional inputs, output contract, adaptive routing). Honor every conditional input and every artifact write the reference describes.
4. The remaining `$ARGUMENTS` after the matched key are the sub-command's own arguments — pass them through verbatim.
