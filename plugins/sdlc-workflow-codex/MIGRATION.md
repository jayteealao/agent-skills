# Migration from `sdlc-workflow` (Claude) to `sdlc-workflow-codex`

The native Codex package is **router-first**: it mirrors the Claude plugin's
command surface as native Codex skills. Same lifecycle, same artifacts under
`.ai/workflows/<slug>/`, same shared machine-wide hub — only the host adapter and
the invocation syntax differ. There is no remapping to a smaller set of intents;
every Claude `/wf*` command has a one-to-one Codex skill.

## Command mapping

Codex skills are invoked with `$`; Claude commands with `/`. The router skills
take the same sub-command and arguments.

| Claude slash command | Codex skill |
|---|---|
| `/wf <stage> …` — intake, shape, slice, plan, implement, verify, review, handoff, ship, retro, instrument, experiment, benchmark, profile | `$wf <stage> …` |
| `/wf-meta <action> …` — amend, announce, build-pipeline, close, extend, how, init-ship-plan, next, resume, skip, status, sync | `$wf-meta <action> …` |
| `/wf design …` | `$wf design …` |
| `/wf-docs …` | `$wf-docs …` |
| `/wf-quick …` | `$wf-quick …` |
| `/review <dimension>` | `$review <dimension>` |

`$wf` is the lifecycle-stage router (one canonical stage per sub-command);
`$wf-meta` navigates and mutates existing workflows. The standalone helper skills
(`error-analysis`, `refactoring-patterns`, `test-patterns`,
`wide-event-observability`) are invoked the same way under Codex.

## What stays the same

- The `.ai/workflows/<slug>/` artifacts, the `sdlc/v1` schema, slug conventions,
  and the typed + free narrative-fragment tiers.
- The shared `~/.sdlc` runtime, registry, and singleton hub. A Codex session
  adopts a Claude-started hub and vice-versa; a workflow created under one host
  is discovered and continued under the other.
- Validation, implement-stage auto-stage, and rendering policy — the *same*
  bundled runtime executes under both hosts, so the final on-disk and rendered
  outcome is identical.

## Intentional host differences

- **Invocation syntax:** `$skill` (Codex) instead of `/command` (Claude).
- **Enforcement timing:** Claude blocks an invalid managed-artifact write
  *pre-write*; Codex converges it at `Stop`/`SubagentStop` via a bounded repair
  loop. The timing differs by design; the verification *outcome* does not.
- **Rendering is owned by the hub** under both hosts: hooks emit a filesystem
  dirty signal and the hub renders off the request path — neither host renders
  inline as a normal path.
- **Activation:** Codex has no install-time trusted hook, so the first trusted
  SessionStart is the activation point. Users are expected to review and trust
  all bundled hooks; until then the plugin is installed but not activated.
