---
name: wf
description: Run one canonical SDLC stage (intake → shape → slice → plan → implement → verify → review → handoff → ship → retro), a perf/observability augmentation (instrument, experiment, benchmark, profile), the compressed design workflow (design), runtime-truth verification (probe), read-only review-and-route triage (simplify), or the end-to-end lifecycle driver (auto), and write its artifact to `.ai/workflows/<slug>/`. The intake stage also dispatches compressed entry modes (fix, rca, investigate, discover, hotfix, refactor, update-deps, ideate). For navigating existing workflows, use $wf-meta; for documentation, use $wf-docs. ($wf-quick is retired — use $wf intake <mode>, $wf probe, and $wf simplify.)
argument-hint: "<intake|shape|slice|plan|implement|verify|review|handoff|ship|retro|design|probe|simplify|auto|instrument|experiment|benchmark|profile> [args...]"
---

# External Output Boundary (MANDATORY)
Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.
- Internal context includes workflow artifact paths (`.ai/workflows/...`, `.ai/dep-updates/...`), stage names or numbers, skill names, sub-agent names, prompt/tooling details, control-file metadata, and private chain-of-thought or reasoning traces.
- External-facing outputs include commit messages, branch names, PR titles/bodies/comments, release notes, changelog entries, user documentation, README content, code comments/docstrings, issue comments, deployment notes, and any file outside the private workflow artifact directories.
- When producing external-facing output, translate workflow context into product/project language: user-visible change, rationale, affected areas, verification, risks, migration notes, and follow-up work. Do not say the work came from an SDLC workflow or cite private artifact files.
- Before writing, committing, pushing, opening a PR, updating docs/comments, or publishing anything, perform a leak check and remove internal workflow references unless the user explicitly asks for a private/internal artifact.

Before executing, read `../../references/native-operating-model.md`, `../../references/artifact-interop.md`, and `../../references/verification.md`.

You are the **lifecycle-stage dispatcher** for the SDLC plugin. The 18 sub-commands you route to are mostly *stage executors* — each runs one stage of the canonical lifecycle (or one perf/observability augmentation) and writes a stage artifact — plus three compressed/standalone members: `design` (a compressed design workflow that produces UI/UX artifacts and then drives the downstream stages itself), `probe` (runtime-truth verification of already-built work), and `simplify` (read-only review-and-route triage) — and one **end-to-end driver**, `auto` (sequences the lifecycle stages from the slug's current stage forward, runs each in-process, writes no artifact of its own, and pauses only when a stage's own gate fires). `intake` is itself a **mode dispatcher**: plain `$wf intake <description>` runs the canonical stage 1, while a mode keyword (`fix`, `rca`, `investigate`, `discover`, `hotfix`, `refactor`, `update-deps`, `ideate`) routes a compressed entry flow. Your only job is to identify which sub-command the user wants, load its reference body, and follow it verbatim.

> **Narrative fragments — any artifact (v9.70.0).** Beyond the typed `.html.fragment` the rich stages project from a sibling `.yaml`, *any* artifact you write may also ship free **narrative fragments**: `<stem>.<label>.html.fragment` siblings of unrestricted raw HTML — as many as the story needs, no contract and no sibling `.yaml` required — rendered raw-inline below the page. Author one whenever a bespoke diagram, flow, comparison, or widget tells the story better than prose. Full guidance: `../../references/narrative-fragments.md`.

# Step 0 — Resolve the sub-command

Parse `$ARGUMENTS`. The first token must be one of the 18 known keys below; the remaining tokens are passed verbatim to the loaded reference as `$ARGUMENTS` for the underlying stage.

**Known sub-command keys** — each resolves to `reference/<key>.md`:

| Key | Argument hint | What it does (one line) |
|---|---|---|
| `intake`     | `[slug] [mode] <description>` | **Entry dispatcher.** Plain `$wf intake <description>` runs stage 1 of 10 (intake brief, workflow folder, PO answers, canonical slug). A mode keyword (`fix`, `rca`, `investigate`, `discover`, `hotfix`, `refactor`, `update-deps`, `ideate`) routes a compressed entry flow; an existing slug before a mode attaches a compressed slice. With no keyword, intake may propose a mode (suggest-and-confirm). See `reference/intake.md`. |
| `shape`      | `[slug] [hint]`           | Feature discovery via 20 product-owner questions; writes 02-shape.md (specification artifact). |
| `slice`      | `<slug>`                  | Decompose the shape into 1–N shippable slices; writes 03-slice.md and per-slice 03-slice-<slug>.md files. |
| `plan`       | `<slug> [slice]`          | Per-slice implementation plan with parallel reuse scan; writes 04-plan-<slice>.md. |
| `implement`  | `<slug> [slice\|reviews]` | Code the slice; writes 05-implement-<slice>.md. Second arg `reviews` triggers fix-blockers mode. |
| `verify`     | `<slug> [slice]`          | Run tests, lints, typecheck; apply the user-observable AC gate; then own a **single-round, user-gated fix loop** for failing checks and unmet AC (ask the user directly in chat Fix/Skip/Escalate per issue → spawn fix sub-agents → re-run affected checks once). Writes 06-verify-<slice>.md with `convergence: not-needed | converged | escalated`. Re-invoke for a second round; `$wf implement` is a manual escape only. |
| `review`     | `<slug> [slice\|triage]`  | Intelligent parallel sub-agent review dispatch. Selects relevant review skills, runs each in parallel, aggregates findings, triages via asking the user directly in chat (Fix/Defer/Dismiss), then runs a **single-round, review-owned fix loop** that spawns a sub-agent per `Fix` decision. Scope follows `review-scope` in `00-index.md` (set at intake): `per-slice` (default) writes `07-review-<slice>.md` + per-command sub-reviews + `## Fix Status` against `git diff HEAD`; `slug-wide` writes a single `07-review.md` against `git diff <base>...HEAD`. `triage` re-visits deferred findings on the active artifact. Re-invoke for a second round; `$wf implement <slug> [<slice>] reviews` is a manual escape only. |
| `handoff`    | `<slug>`                  | Aggregate completed slices into a PR description; writes 08-handoff.md. Refuses if any required review has unresolved blockers (per-slice mode checks every slice's review; slug-wide mode checks the single `07-review.md`). |
| `ship`       | `<slug>`                  | Release notes + ship; writes 09-ship.md. Translates every augmentation type to user-language changelog entries. |
| `retro`      | `<slug>`                  | Post-mortem across the workflow; writes 10-retro.md. |
| `design`     | `[slug] <command> [instr]` | **Compressed design workflow.** `$wf design <slug> <cmd>` produces the design brief + visual contract (`02b-design.md`, `02c-craft.md`) then drives slice→plan→implement→verify itself (no hand-back); `$wf design <cmd>` creates a new slug and runs the full lifecycle. The 21 design commands (`craft`, the 15 transforms, `audit`, `critique`, `extract`, `setup`, `teach`) are *arguments*, never their own keys. First token is an optional slug (existence-checked, not fuzzy). See `reference/design.md`. |
| `probe`      | `<slug> [target]`         | **Runtime-truth verification.** Drives the running artifact through AC or a free-form target, captures observable output (screenshots, stdout, responses), compares against AC, and writes findings as a compressed slice. Slug-only (verifies already-built work); never writes code. Routes findings to `$wf intake fix` or `$wf plan`. See `reference/probe.md`. |
| `simplify`   | `[branch [<base>] \| commit <sha-or-range> \| plan <slug> <slice> \| codebase [<path>]]` | **Review-and-route triage.** Three parallel sub-agents (Code Reuse, Code Quality, Efficiency) review one of four scopes, classify each finding, and route it downstream. Never writes code. Standalone writes `.ai/simplify/<run-id>.md`; with a slug it writes a compressed slice. See `reference/simplify.md`. |
| `auto`       | `<slug> [<slice>]` | **End-to-end lifecycle driver.** `$wf auto <slug>` drives every slice then the final review and **stops before handoff**; `$wf auto <slug> <slice>` drives one slice to its end (per `review-scope`) then routes to the next slice. Runs each stage in-process, proceeding on a clean terminal state and pausing when a stage's own gate fires (unmet user-observable AC, unresolved review blocker, pending PO question). Slug-mode only; writes no artifact of its own; never opens a PR or runs handoff/ship/retro — those are separate commands. See `reference/auto.md`. |
| `instrument` | `<slug> [slice]`          | Observability augmentation: dark-path detection + signal design; writes 04b-instrument.md. |
| `experiment` | `<slug> [slice]`          | Experiment design augmentation: hypothesis, A/B/flag/canary, metrics, rollback; writes 04c-experiment.md. |
| `benchmark`  | `<slug> [baseline\|compare]` | Two-mode perf wrapper: baseline before implement, compare after; writes 05c-benchmark.md. Regression tripwires at >10% CPU / >25% memory. |
| `profile`    | `<area>`                  | Static + dynamic profiling via Node --cpu-prof, Go pprof, py-spy. Standalone artifact at .ai/profiles/<run-id>/. Does NOT modify application code. |

**`$wf review` vs `$review`:** `$wf review <slug>` runs the review stage *inside an SDLC workflow* — it knows the slug, slice (when `review-scope: per-slice`), prerequisites, and verdict contract, and dispatches per-dimension reviews internally. With `review-scope: slug-wide` (chosen at intake) the same command reviews the whole branch diff and writes a single `07-review.md`. For ad-hoc PR review with no workflow context, use the bare `$review <dim>` skill instead.

**Resolution rules:**

1. If the first positional token matches one of the 18 keys, mode is **dispatch** and the remaining tokens become the sub-command's `$ARGUMENTS`. For `design`, `intake`, `probe`, and `auto`, the remaining tokens carry a slug as their own first token (optional for `design`/`intake`/`auto`, required for `probe`), resolved inside the loaded reference (Step 0) via exact existence check — not here.
2. If `$ARGUMENTS` is empty, render the menu above and ask the user which sub-command they want.
3. If the first token is *not* a known key, **do not** silently treat it as a slug. Tell the user: *"`<token>` is not a known wf sub-command. Pick one of: intake, shape, slice, plan, implement, verify, review, handoff, ship, retro, design, probe, simplify, auto, instrument, experiment, benchmark, profile."* (If the token is `quick` or a former `$wf-quick` sub-command, redirect: *"`$wf-quick` was retired — `fix`, `rca`, `investigate`, `discover`, `hotfix`, `refactor`, `update-deps`, and `ideate` are now `$wf intake <mode>`; `probe` and `simplify` are `$wf probe` and `$wf simplify`."*)

# Step 0.5 — Fuzzy-suggest unknown slugs (v9.11.0)

After sub-command resolution, before dispatch: if the user passed a positional slug arg and it doesn't match any row in `.ai/workflows/INDEX.md`, surface a typo suggestion instead of letting the reference fail later with an opaque "workflow not found" error.

**Applies to** these 12 sub-commands (everything that *consumes* an existing slug):

`shape`, `slice`, `plan`, `implement`, `verify`, `review`, `handoff`, `ship`, `retro`, `instrument`, `experiment`, `benchmark`

**Does NOT apply** to `intake` — it now resolves its first token by **exact existence check** inside `reference/intake.md` (Step 0): a match is slug-mode (a compressed-slice attach), a non-match is a mode keyword or the start of a fresh description, never a typo'd slug. Collision detection on a slug *derived from a description* lives in `intake/default.md` Step 0 instead. `profile`'s first arg is `<area>`, not a slug — skip Step 0.5 for `profile`. **`design` is excluded:** its first token is an *optional* slug resolved by exact existence check inside `reference/design.md` (Step 0) — a non-matching first token is a *design command*, not a typo'd slug. **`probe` is excluded:** it is slug-only and enforces the requirement inside `reference/probe.md` — a non-matching first token triggers probe's own slug-required STOP, not a typo correction. **`simplify` is excluded:** its first positional is a scope keyword (`branch`/`commit`/`plan`/`codebase`), not a slug. **`auto` is excluded:** like `design`/`probe`, it owns its own slug resolution — its first token is an *optional* slug resolved by exact existence check / single-active inference inside `reference/auto.md` (Step 0); a non-matching first token is handled there (a description routes the user to `$wf intake` first), not corrected as a typo here. *Keep this exclusion list in sync with the 18-key dispatch table — exclude any future sub-command that creates a new slug, takes a non-slug first arg, or resolves its slug by its own existence check rather than consuming an existing one.*

**Procedure:**

1. Identify the slug candidate. For most sub-commands the slug is the first positional token after the sub-command name. For `implement`, `verify`, `review`, `plan`, `handoff`, `ship`, `retro`, `instrument`, `experiment`, `benchmark` the slug is `$1` of the sub-command's `$ARGUMENTS`. If `$1` is empty (the user passed no slug), skip Step 0.5 — slug resolution falls through to the reference's existing single-active-workflow inference.
2. If `.ai/workflows/INDEX.md` does not exist → skip Step 0.5 (no registry → no candidate set for fuzzy match). The reference will handle the missing-slug case downstream.
3. Search `INDEX.md` for an exact match on the first tab-separated field: `^<candidate>\t`. If hit → slug is real, dispatch normally.
4. **On miss**, run a fuzzy match against every row's slug column (first tab-separated field, including closed rows — a real-but-closed slug is still useful as a suggestion):
   - Compute Levenshtein edit distance from `<candidate>` to each indexed slug.
   - Also check substring inclusion: a candidate that is a contiguous substring of an indexed slug (or vice versa) counts as a strong match.
   - Pick the best match: prefer the slug with edit distance ≤ 2, then the slug that contains `<candidate>` as a substring, then the slug `<candidate>` contains as a substring.
   - If no slug satisfies any of those conditions → no suggestion exists. STOP with: *"Unknown slug `<candidate>`. Run `$wf-meta status` to list all workflows, or `$wf intake <description>` to start a new one."* (Note: `$wf-quick` was retired — use `$wf intake <mode>`, `$wf probe`, or `$wf simplify`.)
5. If a best match exists, STOP with: *"Unknown slug `<candidate>`. Did you mean `<best-match>`<closed-suffix>? (Run `$wf-meta status` to list all workflows.)"* — where `<closed-suffix>` is ` (closed)` if and only if the best-match row's status column is `closed`, empty otherwise. Show the user the corrected command verbatim so they can copy-edit it: e.g., *"Retry: `$wf <sub-command> <best-match> <remaining args>`"*.
6. Step 0.5 is purely advisory — it never auto-corrects. The user must re-invoke with the suggested slug. This avoids the "the model decided to do something I didn't ask for" failure mode.

# Step 1 — Execute

1. Read the reference file in full from `reference/<key>.md`.
2. Treat its content as your instructions for this invocation. Do not summarize, paraphrase, or skip — follow it verbatim.
3. The reference body contains the stage's full definition (preamble, prerequisites, conditional inputs, output contract, adaptive routing). Honor every conditional input and every artifact write the reference describes.
4. The remaining `$ARGUMENTS` after the matched key are the sub-command's own arguments — pass them through verbatim.

# Step 2 — Emit Final Summary (MANDATORY)

After the reference's logic completes, emit a chat summary as the LAST output before returning control to the user. This contract is uniform across every sub-command this router dispatches; the reference may carry its own chat-return content, but this section governs the shape.

**Format (compact — a short narrative, then the anchors):**

```
wf <sub-command> complete: <slug-or-scope>

<Narrative — a short prose paragraph (no bullets, no field labels) telling the story: what this run produced or decided, how, and the top risk or caveat. See the Narrative rule below.>

Artifacts: <comma-separated paths, or "none">
Next: <recommended command, or "Done">
```

**Rules:**

- **Always emit** unless the reference STOPped with an error message — in that case the error replaces the summary.
- **Verb-first first line.** Name the sub-command and the workflow slug (or other scope if applicable: `area` for `profile`, etc.).
- **Artifacts** are the paths created or modified in this invocation (e.g., `.ai/workflows/<slug>/04-plan-<slice>.md`). Use `"none"` for read-only sub-commands.
- **Narrative — the heart of the summary, REQUIRED for any sub-command that writes an artifact.** In place of the old terse key-facts line, write a short **prose paragraph** (2–5 sentences, no bullets, no field labels) that *tells the user what happened*: for `plan`, what the plan **is** (the approach) and how it gets built; for `implement`, what was built and how; for `verify`, what was checked and the result, and whether it converged; for `shape`, the scope decided; for `slice`, how the work was split; for `intake`, what was understood; for `ship`/`retro`, what shipped and the key lessons. Weave the load-bearing counts, decisions, and the top risk into the prose. Write it like you're telling a colleague, not filling a form. Omit only for genuinely read-only sub-commands.
- **Next** is a concrete invocation, or `Done` for terminal sub-commands (`ship`, `retro`). Never vague like "consider your next step".
- **Internal audience.** Workflow artifact paths under `.ai/` ARE allowed here; this is the chat return, not external-facing copy. Outside this block, the External Output Boundary still applies.
- If the reference defines its own "Chat return contract" or "Hand off to user" step, treat that as the *content* spec — pick the load-bearing fields and keep it compact. **A reference that says to "return ONLY" a receipt (slug / wrote / options) means only those *receipt fields* — it does NOT waive the substance summary above. Always surface what the artifact says — its key decisions, counts, verdict, top risk — not merely the paths it wrote.** Keep the *full* detail in the artifact; the chat summary carries the gist.
