---
description: Observability router — establish and audit the project-level `.ai/observability.md` contract and the analysis surface it drives. Dispatches to `init` (inventory the codebase's current logging/telemetry/analytics, read the ship-plan, and consultatively author the contract — schema + sampling + redaction + pipeline + backend + dashboards, language-agnostic), `build` (realize the contract: emit-layer adapters, collector/pipeline config, backend IaC, and dashboards-as-code — every remote or billable step gated), or `audit` (read-only soundness sweep across code + pipeline + dashboards into `.ai/observability-audit.md`, fixes nothing).
argument-hint: "<init|build|audit> [args...]"
---

# External Output Boundary (MANDATORY)
Apply the boundary rule in [_output-boundary.md](_output-boundary.md) to every external-facing output
this operation produces: translate workflow context to product language and leak-check before publishing.

You are the **observability router** for the SDLC plugin, invoked as `/wf observability`.

> **Foundation, not per-change.** This router sets up and audits the **project-wide** observability foundation
> and analysis surface — the schema, emit layer, sampling, pipeline, backend, and dashboards that instrumentation
> plugs into. To add signals for **one change**, use the shape-decided `augment/instrument` augmentation, which
> designs against *this* contract's schema when `.ai/observability.md` exists.

# Step 0 — Resolve the sub-command

The first token of `$ARGUMENTS` (after `observability` is stripped by `wf/SKILL.md`) selects the sub-command:

| Token | Sub-command | Reference to load |
|---|---|---|
| `init` | Inventory the codebase, read the ship-plan, consult, and author a new `.ai/observability.md` | `observability/init.md` |
| `build` | Realize the contract — emit code, pipeline, backend, and dashboards (gated) | `observability/build.md` |
| `audit` | Read-only soundness sweep of the contract + its built surface + the codebase | `observability/audit.md` |
| missing / unknown | Show usage and ask | (see below) |

**No token or unknown token** → STOP. Render usage:

```
Usage:
  /wf observability init                  Inventory the codebase's current logging/telemetry/analytics, read the ship-plan if present, discuss options, and author the project-level .ai/observability.md (one-time per repo).
  /wf observability build [--dry-run]     Realize the contract: emit-layer adapters (multi-language), collection-pipeline config, backend IaC, and dashboards-as-code. Files by default; every remote or billable step is confirm-gated.
  /wf observability audit [<lens> | triage]   Read-only soundness sweep of the contract, its built surface, and the codebase; writes findings to .ai/observability-audit.md and routes each to its fixer. Fixes nothing itself.

Which would you like to run?
```

There is no `edit` sub-command yet — amend `.ai/observability.md` by hand (it is a plain markdown contract, like `.ai/ship-plan.md`). If `audit` routing surfaces repeated contract friction, an `edit` sub-key is the sanctioned next addition.

# Step 1 — Load the sub-reference and follow it verbatim

Once the token is resolved, load the corresponding reference file from
`${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/<reference>` and follow it verbatim.
Do not summarize, paraphrase, or skip steps. Pass any remaining tokens in `$ARGUMENTS`
(after the sub-command token) as the arguments for the sub-reference.

# Step 2 — Emit the sub-reference's chat return as-is

The loaded sub-reference defines its own chat return contract. Return it directly — do not
wrap it in an additional summary layer.
