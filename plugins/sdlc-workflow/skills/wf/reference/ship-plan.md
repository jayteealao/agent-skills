---
description: Ship-plan router — manage the project-level `.ai/ship-plan.md` contract. Dispatches to `init` (author a new plan), `build` (bring the repo pipeline into compliance), `edit` (amend one block of an existing plan), or `audit` (read-only soundness review of the plan + built pipeline + release-relevant codebase).
argument-hint: "<init|build|edit|audit> [args...]"
---

# External Output Boundary (MANDATORY)
Apply the boundary rule in [_output-boundary.md](_output-boundary.md) to every external-facing output
this operation produces: translate workflow context to product language and leak-check before publishing.

You are the **ship-plan router** for the SDLC plugin, invoked as `/wf ship-plan`.

# Step 0 — Resolve the sub-command

The first token of `$ARGUMENTS` (after `ship-plan` is stripped by `wf/SKILL.md`) selects the sub-command:

| Token | Sub-command | Reference to load |
|---|---|---|
| `init` | Author a new `.ai/ship-plan.md` from scratch | `ship-plan/init.md` |
| `build` | Audit and build the pipeline to match the plan | `ship-plan/build.md` |
| `edit` | Amend one block of an existing plan | `ship-plan/edit.md` |
| `audit` | Read-only soundness audit of the plan + built pipeline + release-relevant codebase | `ship-plan/audit.md` |
| missing / unknown | Show usage and ask | (see below) |

**No token or unknown token** → STOP. Render usage:

```
Usage:
  /wf ship-plan init [--from-template <kind>]   Author the project-level .ai/ship-plan.md (one-time per repo).
  /wf ship-plan build [--dry-run]               Audit the repo against the plan; create missing files, patch non-compliant ones.
  /wf ship-plan edit                            Amend one block of an existing plan (A–K, or an additional-contract id).
  /wf ship-plan audit [<lens> | triage]         Read-only soundness audit of the plan, its built pipeline, and the release-relevant codebase; writes findings to .ai/ship-plan-audit.md and routes each to its fixer. Fixes nothing itself.

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
