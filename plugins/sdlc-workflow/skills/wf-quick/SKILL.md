---
name: wf-quick
description: Compressed and standalone SDLC workflows — orthogonal entry points that do not compose. Sub-commands: quick (small intentional change), rca (root-cause analysis), investigate (investment discovery), discover (problem validation), hotfix (emergency fix), update-deps, refactor, ideate, simplify (3-agent review+routing triage across branch/commit/plan/codebase; never writes code, routes findings to downstream commands). Full-lifecycle intake lives at `/wf intake`; documentation lives at `/wf-docs`.
disable-model-invocation: true
argument-hint: "<quick|rca|investigate|discover|hotfix|update-deps|refactor|ideate|simplify> [args...]"
---

# External Output Boundary (MANDATORY)
Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.
- Internal context includes workflow artifact paths (`.ai/workflows/...`, `.claude/...`, `.ai/dep-updates/...`), stage names or numbers, slash-command names, task/sub-agent names, prompt/tooling details, control-file metadata, and private chain-of-thought or reasoning traces.
- External-facing outputs include commit messages, branch names, PR titles/bodies/comments, release notes, changelog entries, user documentation, README content, code comments/docstrings, issue comments, deployment notes, and any file outside the private workflow artifact directories.
- When producing external-facing output, translate workflow context into product/project language: user-visible change, rationale, affected areas, verification, risks, migration notes, and follow-up work. Do not say the work came from an SDLC workflow or cite private artifact files.
- Before writing, committing, pushing, opening a PR, updating docs/comments, or publishing anything, perform a leak check and remove internal workflow references unless the user explicitly asks for a private/internal artifact.

You are the **standalone-workflow dispatcher** for the SDLC plugin. The 9 sub-commands you route to are *orthogonal entry points* — none of them compose, so there are no `sweep` modes here. Your only job is to identify which sub-command the user wants, load its reference body, and follow it verbatim.

# Step 0 — Resolve the sub-command

Parse `$ARGUMENTS`. The first token must be one of the 9 known keys below; the remaining tokens are passed verbatim to the loaded reference as `$ARGUMENTS` for the underlying workflow.

**Known sub-command keys** — each resolves to `${CLAUDE_PLUGIN_ROOT}/skills/wf-quick/reference/<key>.md`:

| Key | Argument hint | What it does (one line) |
|---|---|---|
| `quick`        | `<description-or-slug>`  | Compressed planning workflow for small intentional changes (collapses intake/shape/design/slice/plan into one artifact). |
| `rca`          | `<incident> [date]`      | Root-cause analysis with parallel diagnosis sub-agents; recommends a downstream command (plan, quick, hotfix). |
| `investigate`  | `<domain>`               | Investment discovery — surveys a codebase domain, ranks improvement opportunities by ROI. |
| `discover`     | `<problem>`              | Problem validation using external signals (competitors, user feedback, market data); produces build/do-not-build recommendation. |
| `hotfix`       | `<incident-description>` | Emergency-only escape hatch. Tightly bounded; escalates if scope exceeds 3 files / 50 lines / architectural change. |
| `update-deps`  | `[scope]`                | Dependency upgrade workflow — bumps, lockfile changes, compatibility checks. |
| `refactor`     | `<target-or-slug>`       | Pure refactoring workflow — never adds new functionality. |
| `ideate`       | `[lens] [count]`         | Proactive codebase ideation — discovers improvement opportunities and ranks them. |
| `simplify`     | `[branch [<base>] \| commit <sha-or-range> \| plan <slug> <slice> \| codebase [<path>]]` | Three parallel sub-agents (Code Reuse, Code Quality, Efficiency) review one of four scopes, classify each accepted finding, and route it to the appropriate downstream command (`/wf-quick fix`, `/wf-quick refactor`, `/wf intake`, `/wf-meta amend`, `/wf-docs`, etc.). Never writes code. Writes `.ai/simplify/<run-id>.md`. |

**Resolution rules:**

1. If the first positional token matches one of the 9 keys, mode is **dispatch** and the remaining tokens become the sub-command's `$ARGUMENTS`.
2. If `$ARGUMENTS` is empty, render the menu above and ask the user which sub-command they want.
3. If the first token is *not* a known key, **do not** silently treat it as a slug for any default sub-command. Tell the user: *"`<token>` is not a known wf-quick sub-command. Pick one of: quick, rca, investigate, discover, hotfix, update-deps, refactor, ideate, simplify."* If the token is `intake`, redirect: *"`intake` moved to `/wf intake` in v9.1.0 — all canonical lifecycle stages now live under `/wf`."* If the token is `docs`, redirect: *"`docs` moved to `/wf-docs` in v9.4.0 — documentation now has its own router with 7 Diátaxis primitives. Use `/wf-docs` for the full audit pipeline or `/wf-docs <primitive>` for single-document writes."*

# Step 1 — Execute

1. Read the reference file in full from `${CLAUDE_PLUGIN_ROOT}/skills/wf-quick/reference/<key>.md`.
2. Treat its content as your instructions for this invocation. Do not summarize, paraphrase, or skip — follow it verbatim.
3. The reference body contains a complete workflow definition (preamble, pipeline, stages, output contract). Honor every conditional input, every artifact write, and every routing rule the reference describes.
4. The remaining `$ARGUMENTS` after the matched key are the sub-command's own arguments — pass them through verbatim.
