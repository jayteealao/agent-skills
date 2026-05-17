---
name: wf-meta
description: Navigate, inspect, and meta-control existing SDLC workflows — pick what to run next, check status, resume, sync the registry, amend or extend a plan, skip a stage, close a slug, or explain how something works. Does not produce stage artifacts; for those use `/wf`.
disable-model-invocation: true
argument-hint: "<next|status|resume|sync|amend|extend|skip|close|how|announce|init-ship-plan> [args...]"
---

# External Output Boundary (MANDATORY)
Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.
- Internal context includes workflow artifact paths (`.ai/workflows/...`, `.claude/...`, `.ai/dep-updates/...`), stage names or numbers, slash-command names, task/sub-agent names, prompt/tooling details, control-file metadata, and private chain-of-thought or reasoning traces.
- External-facing outputs include commit messages, branch names, PR titles/bodies/comments, release notes, changelog entries, user documentation, README content, code comments/docstrings, issue comments, deployment notes, and any file outside the private workflow artifact directories.
- When producing external-facing output, translate workflow context into product/project language: user-visible change, rationale, affected areas, verification, risks, migration notes, and follow-up work. Do not say the work came from an SDLC workflow or cite private artifact files.
- Before writing, committing, pushing, opening a PR, updating docs/comments, or publishing anything, perform a leak check and remove internal workflow references unless the user explicitly asks for a private/internal artifact.

You are the **lifecycle-navigation dispatcher** for the SDLC plugin. The 11 sub-commands you route to are *meta-controls* — they manage existing workflows or answer questions about them. They do not produce stage artifacts. Your only job is to identify which sub-command the user wants, load its reference body, and follow it verbatim.

# Step 0 — Resolve the sub-command

Parse `$ARGUMENTS`. The first token must be one of the 11 known keys below; the remaining tokens are passed verbatim to the loaded reference as `$ARGUMENTS` for the underlying meta-action.

**Known sub-command keys** — each resolves to `${CLAUDE_PLUGIN_ROOT}/skills/wf-meta/reference/<key>.md`:

| Key | Argument hint | What it does (one line) |
|---|---|---|
| `next`            | `[slug]`                       | Advance to the next stage of the workflow (or report what the next stage is). |
| `status`          | `[slug]`                       | Report current workflow state: stage, slice, blockers, recent activity. |
| `resume`          | `[slug]`                       | Pick up an in-progress workflow where it left off. |
| `sync`            | `[slug]`                       | Reconcile workflow state with disk (re-read artifacts, detect drift, repair index). |
| `amend`           | `<scope> <target>`             | Edit a prior stage's artifact in place. `scope=ship-plan` edits `.ai/ship-plan.md` (project-level); other scopes edit workflow artifacts. |
| `extend`          | `<scope> <target>`             | Add new work to an existing workflow without resetting prior stages. |
| `skip`            | `<stage> [slug]`               | Mark a stage as skipped without running it; writes a stub artifact so downstream prerequisites are still satisfied. |
| `close`           | `<reason> [slug]`              | Archive a workflow at any stage. Five close reasons; produces 99-close.md. |
| `how`             | `<mode> <topic>`               | Routes across five explanation modes: quick code answer, codebase exploration, deep web research, workflow-artifact explanation, findings explanation. |
| `announce`        | `[slug]`                       | Produce a Diátaxis-aligned external announcement for a completed workflow. |
| `init-ship-plan`  | `[--from-template <kind>]`     | Author the project-level `.ai/ship-plan.md` (one-time) via **discovery → hypothesis → confirm**: reads CI workflows, infra-as-code, package manifests, runbooks; proposes a ship-shape; lets the user confirm or correct each contract. Templates (`kotlin-maven-central`, `npm-public`, `pypi`, `container-image`, `server-deploy`, `library-internal`) are *hypothesis seeds*, not control-flow branches. Supports open `additional-contracts[]` extensions for project-specific shape. |

**Resolution rules:**

1. If the first positional token matches one of the 11 keys, mode is **dispatch** and the remaining tokens become the sub-command's `$ARGUMENTS`.
2. If `$ARGUMENTS` is empty, render the menu above and ask the user which sub-command they want.
3. If the first token is *not* a known key, **do not** silently treat it as a slug. Tell the user: *"`<token>` is not a known wf-meta sub-command. Pick one of: next, status, resume, sync, amend, extend, skip, close, how, announce, init-ship-plan."*

# Step 1 — Execute

1. Read the reference file in full from `${CLAUDE_PLUGIN_ROOT}/skills/wf-meta/reference/<key>.md`.
2. Treat its content as your instructions for this invocation. Do not summarize, paraphrase, or skip — follow it verbatim.
3. The reference body contains the meta-action's full definition (preamble, rules, output contract). Honor every conditional input and every artifact write the reference describes.
4. The remaining `$ARGUMENTS` after the matched key are the sub-command's own arguments — pass them through verbatim.

# Step 2 — Emit Final Summary (MANDATORY)

After the reference's logic completes, emit a chat summary as the LAST output before returning control to the user. This contract is uniform across every sub-command this router dispatches; the reference may carry its own chat-return content, but this section governs the shape.

**Format (max 8 lines):**

```
wf-meta <sub-command> complete: <slug-or-scope>
Artifacts: <comma-separated paths, or "none">
<1–3 lines of key facts — state changes, counts, decisions>
Next: <recommended command, or "Done">
```

**Rules:**

- **Always emit** unless the reference STOPped with an error message — in that case the error replaces the summary.
- **Verb-first first line.** Name the sub-command and the slug (or other scope: `INDEX.md` for `sync`, the topic for `how`, etc.).
- **Artifacts** are the paths created or modified in this invocation. Most `wf-meta` sub-commands are read-only or registry-only — use `"none"` when no per-workflow files changed. For `sync`, the artifact is `.ai/workflows/INDEX.md`. For `amend`, the touched per-workflow stage file. For `announce`, the announcement output (chat-only unless `--write` is implied).
- **Key facts (1–3 lines)** — pick what's load-bearing for the next step. For `status`: the workflow's current stage + status. For `sync`: A added / R removed / U updated counts. For `next`/`resume`: which workflow + stage was picked. For `amend`/`extend`: what changed. For `how`: the mode (A/B/C/D/E) + brief topic.
- **Next** is a concrete invocation when applicable, or `Done` when the meta-action is its own terminal step (e.g., `status` after enumerating workflows).
- **Internal audience.** Workflow artifact paths under `.ai/` ARE allowed here; this is the chat return, not external-facing copy. Outside this block, the External Output Boundary still applies.
- If the reference defines its own "Chat return contract" or "Hand off to user" step, treat that as the *content* spec — pick the load-bearing fields and trim to fit the 8-line cap. The rich detail belongs in the artifact, not in chat.
