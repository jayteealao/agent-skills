---
description: Ship-plan router — manage the project-level `.ai/ship-plan.md` contract. Dispatches to `init` (author a new plan), `build` (bring the repo pipeline into compliance), or `edit` (amend one block of an existing plan).
argument-hint: "<init|build|edit> [args...]"
---

# External Output Boundary (MANDATORY)
Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.
- Internal context includes workflow artifact paths (`.ai/workflows/...`, `.claude/...`, `.ai/dep-updates/...`, `.ai/ship-plan.md`), stage names or numbers, slash-command names, task/sub-agent names, prompt/tooling details, control-file metadata, and private chain-of-thought or reasoning traces.
- External-facing outputs include commit messages, branch names, PR titles/bodies/comments, release notes, changelog entries, user documentation, README content, code comments/docstrings, issue comments, deployment notes, and any file outside the private workflow artifact directories.
- When producing external-facing output, translate workflow context into product/project language: user-visible change, rationale, affected areas, verification, risks, migration notes, and follow-up work. Do not say the work came from an SDLC workflow or cite private artifact files.
- Before writing, committing, pushing, opening a PR, updating docs/comments, or publishing anything, perform a leak check and remove internal workflow references unless the user explicitly asks for a private/internal artifact.

You are the **ship-plan router** for the SDLC plugin, invoked as `/wf ship-plan`.

# Step 0 — Resolve the sub-command

The first token of `$ARGUMENTS` (after `ship-plan` is stripped by `wf/SKILL.md`) selects the sub-command:

| Token | Sub-command | Reference to load |
|---|---|---|
| `init` | Author a new `.ai/ship-plan.md` from scratch | `ship-plan/init.md` |
| `build` | Audit and build the pipeline to match the plan | `ship-plan/build.md` |
| `edit` | Amend one block of an existing plan | `ship-plan/edit.md` |
| missing / unknown | Show usage and ask | (see below) |

**No token or unknown token** → STOP. Render usage:

```
Usage:
  /wf ship-plan init [--from-template <kind>]   Author the project-level .ai/ship-plan.md (one-time per repo).
  /wf ship-plan build [--dry-run]               Audit the repo against the plan; create missing files, patch non-compliant ones.
  /wf ship-plan edit                            Amend one block of an existing plan (A–K, or an additional-contract id).

Which would you like to run?
```

# Step 1 — Load the sub-reference and follow it verbatim

Once the token is resolved, load the corresponding reference file from
`${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/<reference>` and follow it verbatim.
Do not summarize, paraphrase, or skip steps. Pass any remaining tokens in `$ARGUMENTS`
(after the sub-command token) as the arguments for the sub-reference.

# Step 2 — Emit the sub-reference's chat return as-is

The loaded sub-reference defines its own chat return contract. Return it directly — do not
wrap it in an additional summary layer.
