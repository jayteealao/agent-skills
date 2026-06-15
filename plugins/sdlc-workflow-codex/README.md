# sdlc-workflow-codex

A native Codex plugin for the SDLC workflow system — handwritten Codex skills and
hooks over the **same shared runtime, hub, registry, renderer, and `.ai/` artifacts**
as the Claude `sdlc-workflow` plugin. Install either plugin alone, or both together
on one machine: they share one hub and one view, and a workflow started in one host
resumes cleanly in the other.

> **Requires Codex CLI `0.139.0` or newer** for the documented plugin + hook contract
> (`hooks.json`, `${PLUGIN_ROOT}`/`${PLUGIN_DATA}`, `commandWindows`, exit-2 /
> `permissionDecision`, `Stop` block-continuation). Older versions are unsupported.

## What it provides

**Six router skills** (router-name parity with the Claude plugin — explicit invocation):

| Skill | Purpose |
|---|---|
| `$wf` | Run one canonical SDLC stage (intake → … → retro) or a perf/observability augmentation. |
| `$wf-quick` | Compressed / standalone flows: fix, hotfix, rca, refactor, simplify, investigate, probe, ideate, discover, update-deps. |
| `$wf-meta` | Navigate existing workflows: status, next, resume, sync, amend, extend, skip, close, how, announce, init-ship-plan, build-pipeline. |
| `$wf-design` | 24 design transformations (shape, craft, brand, polish, audit, …). |
| `$wf-docs` | Diátaxis documentation: tutorial, how-to, reference, explanation, readme, plan, review. |
| `$review` | Code review across 31 dimensions + 7 aggregates (`$review sweep <aggregate>`). |

**Five independent skills** — `error-analysis`, `refactoring-patterns`, `test-patterns`,
`wide-event-observability`, `setup-wide-logging`. (No `imagegen` — Codex provides a
system one.)

Every router sub-command is a handwritten Codex-native reference under
`skills/<router>/reference/<key>.md`. No skill reads or translates Claude prompt prose,
tool names, or model tiers.

## Shared runtime + hub

The complete shared runtime is bundled under `runtime/` (`dist/`, `assets/`,
`components/`, `schemas/`, `docs/site/`, `runtime-manifest.json`). It is **byte-for-byte
identical** to the Claude plugin's runtime — the `buildId` in `runtime/runtime-manifest.json`
proves it — so both packages adopt one machine-wide `sdlc-workflow-hub`, render to one
`.ai/_view`, and never thrash each other's `.last-render`. See
[`references/shared-hub.md`](references/shared-hub.md) and
[`references/artifact-interop.md`](references/artifact-interop.md).

Verify the shipped runtime at any time (no Claude install needed):

```sh
npm run verify:runtime        # node runtime/dist/verify-runtime.mjs
```

`runtime-baseline.json` records which Claude shared-runtime build this package was
synced from (release provenance).

## Hooks — review and trust before activation

The bundled hooks (`hooks/hooks.json`) are **host adapters** that reuse the shared
runtime policy: SessionStart (once-only activation + adoption-first hub ensure +
native orientation), PreToolUse (best-effort validation), one serialized PostToolUse
dispatcher (verify → auto-stage → emit a dirty render signal; the hub renders), and a
`Stop`/`SubagentStop` managed-artifact verification pass that is the Codex enforcement
boundary (it re-checks the turn's managed artifacts and blocks for repair until they
pass, bounded by a repair ceiling).

**You must review and trust all bundled hooks before the plugin is considered
activated.** Until then it is installed but inactive, and automatic validation,
rendering, and auto-stage are not operational. Changed hook definitions invalidate
trust and the activation record — re-review them and start a new thread after an
upgrade.

## Install (Codex repo marketplace)

The Codex repo marketplace lives at `.agents/plugins/marketplace.json` and exposes
`sdlc-workflow-codex`. Install it through the supported Codex plugin flow, then:

1. Review and trust the bundled hooks.
2. Start Codex in a repo (a new thread loads the installed cache baseline).
3. First trusted SessionStart activates the plugin once and adopts (or starts) the
   shared hub.

### Updating

1. Update the marketplace plugin source + version, reinstall/upgrade.
2. Restart Codex / start a new thread so the new cache baseline loads.
3. Re-review changed hook definitions.
4. The next trusted SessionStart activates the new baseline; a healthy same-runtime
   hub is adopted (not restarted) unless you request an explicit runtime upgrade.

## Interop with the Claude plugin

Both packages may be installed on the same machine through their respective host
distributions. They share `~/.sdlc` (hub, registry, runtime store, PID), the `.ai/`
artifacts, and `.ai/_view`. They must not import files from each other's plugin cache.

## Tests

```sh
npm test            # runtime parity + native hook adapter suite
```
