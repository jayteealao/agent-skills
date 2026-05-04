---
name: wf-quick
description: Standalone investigative and entry-point workflows. Dispatches to one of 10 sub-commands — quick (compressed planning for small changes), rca (root-cause analysis), investigate (investment discovery), discover (problem validation), hotfix (active-incident emergency fix), update-deps (dependency upgrades), docs (documentation-only workflow), refactor (refactoring workflow), ideate (codebase improvement ideation), intake (full-lifecycle entry / stage 1 of 10). Auto-trigger when the user wants to start a new workflow, kick off an investigation, run a root-cause analysis, validate a problem, plan a hotfix, upgrade dependencies, write documentation, refactor, ideate on improvements, or types any /wf-X invocation that the v9 migration redirects through this skill.
---

# External Output Boundary (MANDATORY)
Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.
- Internal context includes workflow artifact paths (`.ai/workflows/...`, `.claude/...`, `.ai/dep-updates/...`), stage names or numbers, slash-command names, task/sub-agent names, prompt/tooling details, control-file metadata, and private chain-of-thought or reasoning traces.
- External-facing outputs include commit messages, branch names, PR titles/bodies/comments, release notes, changelog entries, user documentation, README content, code comments/docstrings, issue comments, deployment notes, and any file outside the private workflow artifact directories.
- When producing external-facing output, translate workflow context into product/project language: user-visible change, rationale, affected areas, verification, risks, migration notes, and follow-up work. Do not say the work came from an SDLC workflow or cite private artifact files.
- Before writing, committing, pushing, opening a PR, updating docs/comments, or publishing anything, perform a leak check and remove internal workflow references unless the user explicitly asks for a private/internal artifact.

You are the **standalone-workflow dispatcher** for the SDLC plugin. The 10 sub-commands you route to are *orthogonal entry points* — none of them compose, so there are no `sweep` modes here. Your only job is to identify which sub-command the user wants, load its reference body, and follow it verbatim.

# Step 0 — Resolve the sub-command

Parse `$ARGUMENTS`. The first token must be one of the 10 known keys below; the remaining tokens are passed verbatim to the loaded reference as `$ARGUMENTS` for the underlying workflow.

**Known sub-command keys** — each resolves to `${CLAUDE_PLUGIN_ROOT}/skills/wf-quick/reference/<key>.md`:

| Key | Argument hint | What it does (one line) |
|---|---|---|
| `quick`        | `<description-or-slug>`  | Compressed planning workflow for small intentional changes (collapses intake/shape/design/slice/plan into one artifact). |
| `rca`          | `<incident> [date]`      | Root-cause analysis with parallel diagnosis sub-agents; recommends a downstream command (plan, quick, hotfix). |
| `investigate`  | `<domain>`               | Investment discovery — surveys a codebase domain, ranks improvement opportunities by ROI. |
| `discover`     | `<problem>`              | Problem validation using external signals (competitors, user feedback, market data); produces build/do-not-build recommendation. |
| `hotfix`       | `<incident-description>` | Emergency-only escape hatch. Tightly bounded; escalates if scope exceeds 3 files / 50 lines / architectural change. |
| `update-deps`  | `[scope]`                | Dependency upgrade workflow — bumps, lockfile changes, compatibility checks. |
| `docs`         | `<area>`                 | Documentation-only workflow (no code changes). |
| `refactor`     | `<target-or-slug>`       | Pure refactoring workflow — never adds new functionality. |
| `ideate`       | `[lens] [count]`         | Proactive codebase ideation — discovers improvement opportunities and ranks them. |
| `intake`       | `<task-description>`     | Stage 1 of 10 in the full SDLC lifecycle. Converts a rough request into a clear intake brief, creates the workflow folder, captures product-owner answers, establishes the canonical slug. |

**Resolution rules:**

1. If the first positional token matches one of the 10 keys, mode is **dispatch** and the remaining tokens become the sub-command's `$ARGUMENTS`.
2. If `$ARGUMENTS` is empty, render the menu above and ask the user which sub-command they want.
3. If the first token is *not* a known key, **do not** silently treat it as a slug for any default sub-command. Tell the user: *"`<token>` is not a known wf-quick sub-command. Pick one of: quick, rca, investigate, discover, hotfix, update-deps, docs, refactor, ideate, intake."*

# Step 1 — Execute

1. Read the reference file in full from `${CLAUDE_PLUGIN_ROOT}/skills/wf-quick/reference/<key>.md`.
2. Treat its content as your instructions for this invocation. Do not summarize, paraphrase, or skip — follow it verbatim.
3. The reference body contains a complete workflow definition (preamble, pipeline, stages, output contract). Honor every conditional input, every artifact write, and every routing rule the reference describes.
4. The remaining `$ARGUMENTS` after the matched key are the sub-command's own arguments — pass them through verbatim.

# Notes

- **No sweep mode.** Unlike `/review`, the 10 sub-commands here are orthogonal entry points (root-cause analysis vs. ideation vs. dependency upgrade), not different lenses on the same target. Composing them in parallel makes no sense, so there is no `aggregates` map and no `/wf-quick sweep …` form. The `aggregates` field in `router-metadata.json` is intentionally empty.
- **Auto-trigger.** This skill is invoked when the user asks to start a new workflow, kick off an investigation, run an RCA, validate a problem, plan a hotfix, upgrade deps, write docs, refactor, or ideate. The harness picks the skill via the `description:` keyword match. The user can also invoke explicitly by typing `/wf-quick <key> <args>` — Claude Code resolves bare slash invocations to skills when no command file exists at that path.
- **Legacy syntax removed.** The 10 standalone `/wf-X` slash commands (where X ∈ {quick, rca, investigate, discover, hotfix, update-deps, docs, refactor, ideate, intake}) were removed in v9.0.0-alpha.2. Each is now invoked as `/wf-quick X <args>`. Migration table in `CHANGELOG.md`.
- **`intake` is Stage 1 of the full lifecycle.** Although it lives under `/wf-quick`, the underlying intake reference body is unchanged from v8 — it begins the canonical 10-stage lifecycle (`/wf-quick intake → /wf-shape → /wf-slice → …`). The placement under `/wf-quick` is a routing decision per `ROUTER-MIGRATION-PLAN.md`, not a semantic re-classification.
