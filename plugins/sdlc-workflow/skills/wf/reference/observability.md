---
description: Observability router — establish and audit the project-level `.ai/observability.md` contract and the analysis surface it drives. Dispatches to `init` (inventory the codebase's current logging/telemetry/analytics, read the ship-plan, and consultatively author the contract — schema + sampling + redaction + pipeline + backend + dashboards, language-agnostic), `build` (realize the contract: emit-layer adapters, collector/pipeline config, backend IaC, and dashboards-as-code — every remote or billable step gated), or `audit` (read-only soundness sweep across code + pipeline + dashboards into `.ai/observability-audit.md`, fixes nothing).
argument-hint: "<init|build|audit> [args...]"
---

You are the **observability router** for the SDLC plugin, invoked as `/wf project observability`.

> **Foundation, not per-change.** This router sets up and audits the **project-wide** observability foundation
> and analysis surface — the schema, emit layer, sampling, pipeline, backend, and dashboards that instrumentation
> plugs into. To add signals for **one change**, use the shape-decided `augment/instrument` augmentation, which
> designs against *this* contract's schema when `.ai/observability.md` exists.

## Requires

Read every row before you write the stage artifact. [_requires.md](_requires.md) defines the check.

| Input | Kind | When | Sections |
|---|---|---|---|
| repository signals | artifact | always | |
| `/.ai/ship-plan.md` | artifact | mode:init | |
| `/.ai/observability.md` | artifact | mode:build | |
| `/.ai/observability.md` | artifact | mode:audit | |
| `observability/init.md` | procedure | mode:init | |
| `observability/build.md` | procedure | mode:build | |
| `observability/audit.md` | procedure | mode:audit | |
| `/.ai/observability.md` | writes | | |

The router reads no workflow artifacts.

## Rules for every sub-command

These rules apply to `init`, `build` and `audit`. The sub-references do not repeat them.

- **No credentials, ever.** Never enter a vendor API key, token or account secret, and never store one. Record the decision, write the config and the exact commands, and let the person authenticate: entering a credential is always the person's own action.
- **Never JavaScript on a non-JS unit.** Realize each unit in its own language, from the contract's Block B and the repo. Node is the reference adapter, not the default: never propose a JS default, or Express or Pino advice, for a Go, Python, JVM, Rust or .NET unit.

# Step 0 — Resolve the sub-command

The first token of `$ARGUMENTS` (after `project observability` is stripped by `wf/SKILL.md`) selects the sub-command:

| Token | Sub-command | Reference to load |
|---|---|---|
| `init` | Inventory the codebase, read the ship-plan, consult, and author a new `.ai/observability.md` | `observability/init.md` |
| `build` | Realize the contract — emit code, pipeline, backend, and dashboards (gated) | `observability/build.md` |
| `audit` | Read-only soundness sweep of the contract + its built surface + the codebase | `observability/audit.md` |
| missing / unknown | Show usage and ask | (see below) |

**No token or unknown token** → STOP. Render usage:

```
Usage:
  /wf project observability init                  Inventory the codebase's current logging/telemetry/analytics, read the ship-plan if present, discuss options, and author the project-level .ai/observability.md (one-time per repo).
  /wf project observability build [--dry-run]     Realize the contract: emit-layer adapters (multi-language), collection-pipeline config, backend IaC, and dashboards-as-code. Files by default; every remote or billable step is confirm-gated.
  /wf project observability audit [<lens> | triage]   Read-only soundness sweep of the contract, its built surface, and the codebase; writes findings to .ai/observability-audit.md and routes each to its fixer. Fixes nothing itself.

Which would you like to run?
```

There is no `edit` sub-command yet. Amend `.ai/observability.md` by hand.

# Step 1 — Load the sub-reference and follow it exactly

Load the reference file for the token and follow it exactly. Pass the remaining tokens in
`$ARGUMENTS` to the sub-reference as its arguments.

# Step 2 — Emit the sub-reference's chat return as-is

The loaded sub-reference defines its own chat return contract. Return it directly — do not
wrap it in an additional summary layer.
