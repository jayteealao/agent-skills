---
description: Ship-plan router — manage the project-level `.ai/ship-plan.md` contract. Dispatches to `init` (author a new plan), `build` (bring the repo pipeline into compliance), `edit` (amend one block of an existing plan), or `audit` (read-only soundness review of the plan + built pipeline + release-relevant codebase).
argument-hint: "<init|build|edit|audit> [args...]"
---

You are the **ship-plan router** for the SDLC plugin, invoked as `/wf project ship-plan`.

## Requires

Read every row before you write the stage artifact. [_requires.md](_requires.md) defines the check.

| Input | Kind | When | Sections |
|---|---|---|---|
| repository signals | artifact | always | |
| `/.ai/ship-plan.md` | artifact | mode:edit | |
| `/.ai/ship-plan.md` | artifact | mode:build | |
| `/.ai/ship-plan.md` | artifact | mode:audit | |
| `ship-plan/init.md` | procedure | mode:init | |
| `ship-plan/build.md` | procedure | mode:build | |
| `ship-plan/edit.md` | procedure | mode:edit | |
| `ship-plan/init/_blocks.md` | procedure | mode:edit | |
| `ship-plan/audit.md` | procedure | mode:audit | |
| `/.ai/ship-plan.md` | writes | | |

The plan reads no workflow artifacts.

# Step 0 — Resolve the sub-command

The first token of `$ARGUMENTS` (after `project ship-plan` is stripped by `wf/SKILL.md`) selects the sub-command:

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
  /wf project ship-plan init [--from-template <kind>]   Author the project-level .ai/ship-plan.md (one-time per repo).
  /wf project ship-plan build [--dry-run]               Audit the repo against the plan; create missing files, patch non-compliant ones.
  /wf project ship-plan edit                            Amend one block of an existing plan (A–K, or an additional-contract id).
  /wf project ship-plan audit [<lens> | triage]         Read-only soundness audit of the plan, its built pipeline, and the release-relevant codebase; writes findings to .ai/ship-plan-audit.md and routes each to its fixer. Fixes nothing itself.

Which would you like to run?
```

# Step 1 — Load the sub-reference and follow it exactly

Load the reference file for the token and follow it exactly. Pass the remaining tokens in
`$ARGUMENTS` to the sub-reference as its arguments.

# Step 2 — Emit the sub-reference's chat return as-is

The loaded sub-reference defines its own chat return contract. Return it directly — do not
wrap it in an additional summary layer.
