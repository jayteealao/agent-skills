# Shared Hub — Machine-Wide SDLC Rendering Daemon

## One hub per machine

There is exactly one named hub process, `sdlc-workflow-hub`, per machine. The hub is shared across the Claude plugin and Codex — both hosts cooperate with the same daemon. The hub owns rendering and serves the dashboard, the documentation site, and the code browser.

## Startup and adoption

The session-start hook (Claude) or Codex session-start handler follows adoption-first ordering:

1. **Probe for a healthy hub.** Query the health endpoint at the well-known hub port.
2. **If a compatible hub is already running** (same `runtimeVersion`, healthy response) — adopt it. Do not start a second hub. Do not reap it.
3. **If no hub is found** — start one from the machine runtime store at `~/.sdlc/runtime/<buildId>/`. Never start the hub from a plugin-relative path; the machine runtime store is the single authoritative location.
4. **Same-runtime-version hubs are never reaped** — a running hub whose `runtimeVersion` matches the current runtime is kept alive across plugin upgrades. Only a version mismatch triggers a controlled handoff.

The startup sequence runs under a cross-host advisory lock (`.locks/hub-start.lock` in the machine runtime store) to prevent two hosts from racing to start the hub simultaneously.

## Rendering ownership

The hub is the **sole owner** of rendering. Codex hooks (and the Claude plugin hooks) emit a filesystem-local dirty signal only — they write a lightweight record to `.ai/_view/.render-queue/`. The hub's reconcile tick drains the queue and calls the renderer from the active runtime. Rendering never occurs inside a hook.

- Rendering is **never triggerable over the network**. No HTTP endpoint exposes a render action.
- The hook writes a queue entry; the hub reads it. This is a local-filesystem protocol, not a remote one.
- Render freshness is keyed on `buildId`. A hub started from a different `buildId` than the one that wrote the artifacts will re-render to apply the current template.

## Views

Rendered output lands in `.ai/_view/` under each registered repository root. Do not read from or write to `.ai/_view/` directly — treat it as build output managed by the hub.

## What the hub serves

| Path prefix | Content |
|---|---|
| `/sdlc/<slug>/` | Workflow dashboard for a registered repo |
| `/docs/` | SDLC documentation site |
| `/code/` | Code browser (when enabled) |
| `/health` | Health probe — returns `{runtimeVersion, buildId, status}` |

## Trust and activation

The bundled hooks (Claude plugin) and Codex session-start handler run scripts on the user's machine. **Users must review and trust the bundled hook scripts before the hub activates.** The hooks are committed to the plugin repository and can be audited at any time under `plugins/sdlc-workflow-codex/hooks/` (Codex) and `plugins/sdlc-workflow/hooks/` (Claude plugin).

Hub activation requires explicit opt-in via plugin configuration. The hub does not auto-start on a fresh install without user confirmation.

## What Codex does not do

- Does not start a per-repository serving daemon. The machine-wide hub is the only server.
- Does not render from inside a hook. Dirty signals only.
- Does not reap a hub whose `runtimeVersion` matches the current runtime.
- Does not expose a render-trigger over any network interface.
