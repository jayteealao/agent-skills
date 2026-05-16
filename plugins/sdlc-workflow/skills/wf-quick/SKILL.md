---
name: wf-quick
description: Compressed and standalone SDLC workflows — orthogonal entry points that do not compose. Sub-commands: quick (small intentional change), rca (root-cause analysis from a symptom, static), probe (runtime-truth verification — drives the running artifact, captures observable output, finds defects; slug-mode only), investigate (solution-options sketcher — 2–3 distinct engineering approaches to a stated problem, with tradeoffs, no winner picked), discover (hypothesis-test — adjudicates a code-level claim with FOR/AGAINST/counter-hypothesis evidence and a verdict), hotfix (emergency fix), update-deps, refactor, ideate, simplify (3-agent review+routing triage across branch/commit/plan/codebase; never writes code, routes findings to downstream commands). Positional slug detection (v9.10.0): if the first token after the sub-command exactly matches a non-closed slug in `.ai/workflows/INDEX.md`, the sub-command attaches to that workflow as a single compressed slice (`type: slice` + `slice-type: <sub>` + `compressed: true`); otherwise it runs standalone (creates a fresh workflow) — except probe, which is slug-mode only and refuses to run without an existing slug. Flags: probe accepts --strict, --from <path>, --adapter <key>; all other sub-commands take no flags. Full-lifecycle intake lives at `/wf intake`; documentation lives at `/wf-docs`.
disable-model-invocation: true
argument-hint: "<quick|rca|probe|investigate|discover|hotfix|update-deps|refactor|ideate|simplify> [<existing-slug>] [args...]"
---

# External Output Boundary (MANDATORY)
Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.
- Internal context includes workflow artifact paths (`.ai/workflows/...`, `.claude/...`, `.ai/dep-updates/...`), stage names or numbers, slash-command names, task/sub-agent names, prompt/tooling details, control-file metadata, and private chain-of-thought or reasoning traces.
- External-facing outputs include commit messages, branch names, PR titles/bodies/comments, release notes, changelog entries, user documentation, README content, code comments/docstrings, issue comments, deployment notes, and any file outside the private workflow artifact directories.
- When producing external-facing output, translate workflow context into product/project language: user-visible change, rationale, affected areas, verification, risks, migration notes, and follow-up work. Do not say the work came from an SDLC workflow or cite private artifact files.
- Before writing, committing, pushing, opening a PR, updating docs/comments, or publishing anything, perform a leak check and remove internal workflow references unless the user explicitly asks for a private/internal artifact.

You are the **standalone-workflow dispatcher** for the SDLC plugin. The 9 sub-commands you route to are *orthogonal entry points* — none of them compose, so there are no `sweep` modes here. Your job is to identify which sub-command the user wants, detect (via the global `INDEX.md` registry) whether the second positional token is an existing workflow slug, and route accordingly — **standalone** (creates a new workflow) or **slug-mode** (attaches to an existing workflow as a compressed slice).

# Step 0 — Identify the sub-command and detect slug

Parse `$ARGUMENTS` positionally. The `probe` sub-command accepts `--strict`, `--from <path>`, and `--adapter <key>` flags; all other sub-commands take no flags.

1. **Tokenize** respecting shell quoting (`"two words"` is one token).
2. **First token = sub-command key.** It must match one of the 10 keys in the table below.
   - Empty `$ARGUMENTS` → render the menu and ask which sub-command the user wants.
   - Unknown token → STOP: *"`<token>` is not a known wf-quick sub-command. Pick one of: quick, rca, probe, investigate, discover, hotfix, update-deps, refactor, ideate, simplify."* If the token is `intake`, redirect: *"`intake` moved to `/wf intake` in v9.1.0 — all canonical lifecycle stages now live under `/wf`."* If the token is `docs`, redirect: *"`docs` moved to `/wf-docs` in v9.4.0 — documentation now has its own router with 7 Diátaxis primitives."*
3. **Slug detection on the second token (positional, no flag).** This is the only way to opt into slug-mode in v9.10.0 — there is no `--slug` flag.
   - Read `.ai/workflows/INDEX.md` (the global workflow registry; format documented in `${CLAUDE_PLUGIN_ROOT}/skills/wf-meta/reference/sync.md`).
   - **If `INDEX.md` does not exist** → mode is **standalone**. Treat every token after the sub-command as the sub-command's `$ARGUMENTS`. Append a single line to the chat return at end: *"Tip: run `/wf-meta sync` once to enable positional slug detection on `/wf-quick` (creates `.ai/workflows/INDEX.md`)."*
   - **If `INDEX.md` exists** → take the second token (the first arg after the sub-command). Run an anchored grep: `grep -P "^<token>\t" .ai/workflows/INDEX.md` (tab-anchored, exact match on the slug column).
     - **Hit AND status column ≠ `closed`** → mode is **slug-mode**. Consume the second token as `<slug>`. All remaining tokens become the sub-command's `$ARGUMENTS`.
     - **Hit AND status column = `closed`** → ASK: *"Workflow `<slug>` is closed. Append a compressed slice anyway?"* — wait for explicit confirmation. On yes → slug-mode; on no → STOP.
     - **No hit** → mode is **standalone**. Leave all tokens after the sub-command in the sub-command's `$ARGUMENTS`. Do NOT prompt or warn — a token that is not in `INDEX.md` is simply the start of the description.
4. **Slug-mode-only exception for `probe`.** The `probe` sub-command refuses to run without an existing slug — runtime-truth verification only makes sense against work that has already been implemented. If Step 3 resolved mode to `standalone` for `probe` → STOP: *"`/wf-quick probe` requires an existing workflow slug as its first argument. Run `/wf-meta status` to see available slugs, or run probe as `/wf-quick probe <slug> [target]`."*
5. **Slug-mode sanity check (if slug-mode).** Verify `.ai/workflows/<slug>/00-index.md` actually exists on disk (the registry could be stale). If missing → STOP: *"`INDEX.md` references slug `<slug>` but `.ai/workflows/<slug>/00-index.md` is missing. Run `/wf-meta sync` to reconcile, or retry without the slug for a standalone run."* Otherwise read the index frontmatter and record `branch`, `current-stage`, `status` for Step 1.

**Quote-escape for ambiguous descriptions.** Slugs cannot contain whitespace, so a multi-word quoted description (e.g., `/wf-quick rca "metrics dashboard broken"`) becomes a single token that never matches `INDEX.md` and routes standalone. Document this in user guidance for the rare case where a workflow's slug collides with the first word of an intended description.

**Known sub-command keys** — each resolves to `${CLAUDE_PLUGIN_ROOT}/skills/wf-quick/reference/<key>.md`:

| Key | Argument hint (after optional slug) | What it does (one line) |
|---|---|---|
| `quick`        | `<description>`  | Compressed planning workflow for small intentional changes (collapses intake/shape/design/slice/plan into one artifact). |
| `rca`          | `<incident> [date]`      | Root-cause analysis with parallel diagnosis sub-agents; recommends a downstream command (plan, quick, hotfix). Static diagnosis only — reads code and git history, does not run the artifact. |
| `probe`        | `[target \| --from <path>] [--strict] [--adapter <key>]` | Runtime-truth verification — drives the running artifact through AC or a free-form target, captures observable output (screenshots, stdout, responses), reads it, compares against AC text, writes findings. Slug-mode only — refuses to run without an existing slug. Sibling of `rca` on the runtime axis. Never writes code; routes findings to `/wf plan` or `/wf-quick quick`. |
| `investigate`  | `<problem>`              | Solution-options sketcher — proposes 2–3 distinct engineering approaches to a stated code-level problem and characterizes their tradeoffs (effort, blast radius, reversibility, top risks). Does not pick a winner; user picks and routes to `/wf-quick quick` or `/wf intake`. |
| `discover`     | `<hypothesis>`           | Hypothesis-test — adjudicates a code-level claim using FOR/AGAINST/counter-hypothesis sub-agents. Produces a verdict (`holds` / `partial` / `fails` / `inconclusive`) with cited evidence. Read-only. |
| `hotfix`       | `<incident-description>` | Emergency-only escape hatch. Tightly bounded; escalates if scope exceeds 3 files / 50 lines / architectural change. |
| `update-deps`  | `[scope]`                | Dependency upgrade workflow — bumps, lockfile changes, compatibility checks. |
| `refactor`     | `<target>`               | Pure refactoring workflow — never adds new functionality. |
| `ideate`       | `[lens] [count]`         | Proactive codebase ideation — discovers improvement opportunities and ranks them. |
| `simplify`     | `[branch [<base>] \| commit <sha-or-range> \| plan <slug> <slice> \| codebase [<path>]]` | Three parallel sub-agents (Code Reuse, Code Quality, Efficiency) review one of four scopes, classify each accepted finding, and route it to the appropriate downstream command. Never writes code. Writes `.ai/simplify/<run-id>.md` in standalone mode (slug-mode writes a compressed slice instead — see Step 1). |

Every sub-command participates in positional slug detection — pass an existing slug as the first argument after the sub-command to attach as a compressed slice, omit it for a fresh standalone run.

# Step 1 — Slug-mode contract (only when slug-mode was selected in Step 0)

When Step 0 selected slug-mode (the second positional token matched a non-closed slug in `INDEX.md`), the sub-command's output is rerouted to a **single compressed slice** on the existing workflow. This contract overrides any "create new workflow" / "create branch" / "write `01-<sub>.md`" / "write a new `00-index.md`" instructions in the loaded reference. The reference's *content discipline* (research, sub-agents, body sections, analysis depth) still applies in full — only the *output destination* and *index bookkeeping* change.

**Slice-slug derivation:**
- Form: `<sub>-<short-descriptor>` (lowercase kebab-case, ≤5 words).
- Source the descriptor from the sub-command's first descriptive argument when available (e.g., `/wf-quick rca --slug X "payment spike"` → `rca-payment-spike`). If no descriptive arg or the arg is generic, fall back to `<sub>-<utc-date>` (e.g., `ideate-2026-05-13`).
- Collision: if `.ai/workflows/<slug>/03-slice-<slice-slug>.md` already exists, append `-2`, `-3`, … until unique.

**Write exactly one artifact** at `.ai/workflows/<slug>/03-slice-<slice-slug>.md` with this frontmatter shape:

```yaml
---
schema: sdlc/v1
type: slice
slug: <slug>
slice-slug: <slice-slug>
slice-type: <sub>           # one of: quick, rca, probe, investigate, discover, hotfix, update-deps, refactor, ideate, simplify
compressed: true
origin: wf-quick/<sub>
status: defined
stage-number: 3
created-at: "<iso-8601 from `date -u +"%Y-%m-%dT%H:%M:%SZ"`>"
updated-at: "<same>"
complexity: <xs|s|m|l|xl>   # estimate from the sub-command's own analysis; use xs when not applicable (e.g., a pure rca diagnosis)
depends-on: []
tags: []
refs:
  index: 00-index.md
  slice-index: 03-slice.md  # OMIT this key if 03-slice.md does not exist
---
```

**Body shape:** start with a `# Compressed Slice: <sub>` heading and a one-line provenance preamble (e.g., `Generated by `/wf-quick <sub>` on <iso-date> against slug `<slug>`.`). Then write the same content sections the standalone reference would have written to `01-<sub>.md` — the research findings, plan, diagnosis, recommendations, etc. — under the same section headings. Do not write a separate `01-<sub>.md` file.

**Index updates** (after writing the slice file):
1. Read `.ai/workflows/<slug>/00-index.md`.
2. Append `03-slice-<slice-slug>.md` to `workflow-files`.
3. Append `{slug: <slice-slug>, slice-type: <sub>, created-at: "<iso>"}` to a top-level `compressed-slices:` array. Create the array if it does not exist on the index yet.
4. Update `updated-at` to the current ISO timestamp.
5. **Do not** modify `current-stage`, `stage-number`, `selected-slice`, `status`, `branch`, or `progress`. The compressed slice is additive — it does not advance the main lifecycle.

**Global registry update** (after `00-index.md` is rewritten):
6. Open `.ai/workflows/INDEX.md`. Locate the row whose first tab-separated column equals `<slug>`. Rewrite only the `updated-at` column (last column) to the same ISO timestamp used in step 4. Do NOT change `status`, `workflow-type`, or `branch` — slug-mode is additive, the parent workflow's lifecycle position is unchanged. If the row is missing for any reason (registry drift), append a new row using the values just read from `00-index.md` (`<slug>\t<status>\t<workflow-type>\t<branch>\t<updated-at>`); the next `/wf-meta sync` will reconcile sort order.

**Slice-index update (conditional):** if `.ai/workflows/<slug>/03-slice.md` exists:
1. Read it. Append `{slug: <slice-slug>, status: defined, slice-type: <sub>, compressed: true}` to `slices`.
2. Bump `total-slices` by 1.
3. Update `updated-at`.
4. Do NOT change `best-first-slice` — compressed slices are additive, not part of the planned implementation order.

If `03-slice.md` does NOT exist (the workflow has not reached slicing yet), skip this step entirely. The entry in `00-index.md.compressed-slices` is the single source of truth.

**Branch behavior:** do NOT switch branches and do NOT create a new branch. If the current git branch differs from the workflow's `branch` field, surface a one-line warning in the chat return but proceed — the artifact lives in the workflow dir, not on a specific branch.

**What the reference's standalone instructions are NOT allowed to do in slug-mode:**
- Create a new directory under `.ai/workflows/`.
- Write a new top-level `00-index.md`.
- Write `01-<sub>.md` or any standalone artifact at the workflow root.
- Run `git checkout -b` or any branch-creating command.
- Set `current-stage` or `selected-slice` on the existing `00-index.md`.

**Chat return for slug-mode:** one line — `wf-quick <sub> → compressed slice <slice-slug> on <slug>` — followed by the downstream recommendation the standalone sub-command would have surfaced (e.g., rca's "consider `/wf-quick refactor --slug <slug>` for finding X"). The downstream recommendation is still valid; it is now scoped to the new slice rather than a fresh workflow.

# Step 2 — Execute

1. Read the reference file in full from `${CLAUDE_PLUGIN_ROOT}/skills/wf-quick/reference/<key>.md`.
2. Treat its content as your instructions for this invocation. Do not summarize, paraphrase, or skip — follow it verbatim, **with one exception**: if slug-mode is active (Step 0 detected a matching `INDEX.md` slug), the Step 1 slug-mode contract above overrides any reference instructions that would create a new workflow, write `01-<key>.md`, switch branches, or write a top-level `00-index.md`. The reference's *content production* (research, sub-agents, body sections, output discipline) still applies — only the *output destination* and *index bookkeeping* change.
3. The reference body contains a complete workflow definition (preamble, pipeline, stages, output contract). In standalone mode, honor every conditional input, every artifact write, and every routing rule the reference describes. In slug-mode, honor the same content discipline but write only the compressed slice file plus the additive index updates (including the global `INDEX.md` row touch in step 6 of Step 1).
4. The remaining `$ARGUMENTS` after the matched key (and after the slug, if Step 0 consumed it) are the sub-command's own arguments — pass them through verbatim.
