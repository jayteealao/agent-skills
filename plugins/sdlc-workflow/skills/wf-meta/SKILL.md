---
name: wf-meta
description: Lifecycle navigation, status, and meta-control for SDLC workflows. Dispatches to one of 10 sub-commands — next (advance to next stage), status (read current state), resume (continue an in-progress workflow), sync (reconcile workflow state with disk), amend (edit a prior stage's artifact), extend (add new work to an existing workflow), skip (mark a stage as skipped without running it), close (archive a workflow at any stage), how (route across explanation modes), announce (Diátaxis announcement output). Auto-trigger when the user wants to check workflow status, resume work, find what's next, sync state, amend an artifact, extend scope, skip a stage, close a workflow, ask how to do something, or publish an announcement. The 10 sub-commands are about *managing* an existing workflow (or asking about one) — they do not produce stage artifacts themselves.
---

# External Output Boundary (MANDATORY)
Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.
- Internal context includes workflow artifact paths (`.ai/workflows/...`, `.claude/...`, `.ai/dep-updates/...`), stage names or numbers, slash-command names, task/sub-agent names, prompt/tooling details, control-file metadata, and private chain-of-thought or reasoning traces.
- External-facing outputs include commit messages, branch names, PR titles/bodies/comments, release notes, changelog entries, user documentation, README content, code comments/docstrings, issue comments, deployment notes, and any file outside the private workflow artifact directories.
- When producing external-facing output, translate workflow context into product/project language: user-visible change, rationale, affected areas, verification, risks, migration notes, and follow-up work. Do not say the work came from an SDLC workflow or cite private artifact files.
- Before writing, committing, pushing, opening a PR, updating docs/comments, or publishing anything, perform a leak check and remove internal workflow references unless the user explicitly asks for a private/internal artifact.

You are the **lifecycle-navigation dispatcher** for the SDLC plugin. The 10 sub-commands you route to are *meta-controls* — they manage existing workflows or answer questions about them. They do not produce stage artifacts. Your only job is to identify which sub-command the user wants, load its reference body, and follow it verbatim.

# Step 0 — Resolve the sub-command

Parse `$ARGUMENTS`. The first token must be one of the 10 known keys below; the remaining tokens are passed verbatim to the loaded reference as `$ARGUMENTS` for the underlying meta-action.

**Known sub-command keys** — each resolves to `${CLAUDE_PLUGIN_ROOT}/skills/wf-meta/reference/<key>.md`:

| Key | Argument hint | What it does (one line) |
|---|---|---|
| `next`     | `[slug]`            | Advance to the next stage of the workflow (or report what the next stage is). |
| `status`   | `[slug]`            | Report current workflow state: stage, slice, blockers, recent activity. |
| `resume`   | `[slug]`            | Pick up an in-progress workflow where it left off. |
| `sync`     | `[slug]`            | Reconcile workflow state with disk (re-read artifacts, detect drift, repair index). |
| `amend`    | `<scope> <target>`  | Edit a prior stage's artifact in place (e.g. `from-review` to incorporate review findings). |
| `extend`   | `<scope> <target>`  | Add new work to an existing workflow without resetting prior stages. |
| `skip`     | `<stage> [slug]`    | Mark a stage as skipped without running it; writes a stub artifact so downstream prerequisites are still satisfied. |
| `close`    | `<reason> [slug]`   | Archive a workflow at any stage. Five close reasons; produces 99-close.md. |
| `how`      | `<mode> <topic>`    | Routes across five explanation modes: quick code answer, codebase exploration, deep web research, workflow-artifact explanation, findings explanation. |
| `announce` | `[slug]`            | Produce a Diátaxis-aligned external announcement for a completed workflow. |

**Resolution rules:**

1. If the first positional token matches one of the 10 keys, mode is **dispatch** and the remaining tokens become the sub-command's `$ARGUMENTS`.
2. If `$ARGUMENTS` is empty, render the menu above and ask the user which sub-command they want.
3. If the first token is *not* a known key, **do not** silently treat it as a slug. Tell the user: *"`<token>` is not a known wf-meta sub-command. Pick one of: next, status, resume, sync, amend, extend, skip, close, how, announce."*

# Step 1 — Execute

1. Read the reference file in full from `${CLAUDE_PLUGIN_ROOT}/skills/wf-meta/reference/<key>.md`.
2. Treat its content as your instructions for this invocation. Do not summarize, paraphrase, or skip — follow it verbatim.
3. The reference body contains the meta-action's full definition (preamble, rules, output contract). Honor every conditional input and every artifact write the reference describes.
4. The remaining `$ARGUMENTS` after the matched key are the sub-command's own arguments — pass them through verbatim.

# Notes

- **No sweep mode.** Like `/wf-quick`, the 10 sub-commands here are orthogonal meta-controls (status check ≠ amend ≠ close), not different lenses on a shared target. The `aggregates` field in `router-metadata.json` is intentionally empty.
- **Auto-trigger.** This skill is invoked when the user asks to check status, resume work, find what's next, sync state, amend an artifact, extend scope, skip a stage, close a workflow, ask how to do something, or publish an announcement. The harness picks the skill via the `description:` keyword match. The user can also invoke explicitly by typing `/wf-meta <key> <args>` — Claude Code resolves bare slash invocations to skills when no command file exists at that path.
- **Legacy syntax removed.** The 10 standalone `/wf-X` slash commands (where X ∈ {next, status, resume, sync, amend, extend, skip, close, how, announce}) were removed in v9.0.0-alpha.3. Each is now invoked as `/wf-meta X <args>`. Migration table in `CHANGELOG.md`.
- **Distinction from `/wf` and `/wf-quick`.** `/wf` *executes* the canonical lifecycle stages (`intake`, `shape`, `slice`, `plan`, …); `/wf-quick` *starts* compressed/standalone flows (RCA, hotfix, investigate, etc.); `/wf-meta` *navigates and manages* existing workflows. Aside from `/wf intake` (which begins the canonical lifecycle) and `/wf-meta resume` (which re-enters an ongoing one), the three skills don't overlap.
