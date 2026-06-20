# Native Codex Rewrite and Shared Claude Hub Plan

## Status

> **⚠ Predates the router subsumes (written at v9.70.0; repo now v9.86.0).** Since this plan was
> written, `/wf-design` was subsumed into `$wf design` and `/wf-quick` into `$wf intake <mode>`
> (+ `$wf probe` / `$wf simplify`). Ignore the "six routers" framing and the standalone `wf-design`
> / `wf-quick` reference inventories below — there are now five public skills (`wf`, `wf-meta`,
> `wf-docs`, plus `review`), with design and the quick modes as sub-commands of `wf`.

Revised implementation plan based on the current repository state on
`feat/sdlc-narrative-fragments`:

- Claude plugin: `plugins/sdlc-workflow` version `9.70.0`
- Native Codex rewrite: `plugins/sdlc-workflow-codex`
- Shared artifact schema: `sdlc/v1`
- Shared machine state: `~/.sdlc`
- Current registry version: `2`
- Current hub configuration version: `1`

This plan supersedes the earlier assumption that Codex should be folded into one
dual-host plugin. The Codex rewrite is a real, independently installable native
Codex plugin. It is not a design lab, generated adapter, or temporary migration
surface.

## Review Resolutions (2026-06-13)

A thorough review against the current codebase and the live Codex platform docs
confirmed the plan's foundations — the Codex hook/plugin contract (10 hook
events, `hooks.json`, `${PLUGIN_ROOT}`/`${PLUGIN_DATA}`, `commandWindows`,
exit-2, `permissionDecision`, `additionalContext`, no-`async`,
`agents/openai.yaml` with `interface`/`policy`/`dependencies`), the
`PLUGIN_VERSION` identity surfaces named in *Identity Refactor*, and the
99-reference / 31-dimension / 7-aggregate counts — and surfaced seven decisions,
now resolved. **These resolutions are authoritative; where older prose below
conflicts, these win.** The affected sections have been revised in place.

1. **Skill taxonomy — router names win; the existing prototype is superseded.**
   The handwritten prototype currently sitting in `plugins/sdlc-workflow-codex/`
   (`sdlc-deliver`, `sdlc-investigate`, `sdlc-review`, `sdlc-design`,
   `sdlc-document`, `sdlc-optimize`, `sdlc-release`, `sdlc-continuity`, the
   `scripts/workflow-state.mjs` JSON continuity model, the `.ai/codex-workflows`
   store, and `MIGRATION.md`) is the wrong design and is removed. The Codex
   plugin preserves the six router names (`wf`, `wf-quick`, `wf-meta`,
   `wf-design`, `wf-docs`, `review`) and the full subcommand surface. See
   *Existing Codex Prototype Disposition* and Workstream I.
2. **Cross-host hub is a fixed requirement; the need is both (a) and (b).** Async
   shared-artifact interop **(a)** AND a concurrent shared-singleton live hub
   **(b)** are both non-negotiable. Workstream C, the cross-host lock, and
   workflow mutation leases are in scope, not optional.
3. **Trust the shared hub; never reap a same-version hub or runtime.** A healthy
   compatible hub is a trusted machine-wide component and is adopted without
   re-verifying foreign runtime bytes. Runtime GC, recovery, and SessionStart
   must never reap, restart, or replace a hub or its runtime while the runtime
   version matches. Reaping/replacement is reserved for a genuine version
   mismatch under an explicit upgrade, or for true unhealth.
4. **Bidirectional capability-parity drift detection is required.** A change to a
   capability in one host must be provably reflected in the other before release,
   in both directions (Claude→Codex and Codex→Claude). A host-neutral *capability
   parity ledger* + release gate enforces this. It is behavior-contract based,
   not a revival of the removed router body-hash. See *Cross-Host Capability
   Parity Ledger*.
5. **Identical final state, possibly different enforcement paths.** Claude blocks
   pre-write; Codex cannot undo a completed `apply_patch` from PostToolUse. Parity
   is defined on the FINAL on-disk artifacts and rendered view, not on enforcement
   timing. Codex adds a `Stop`-time managed-artifact verification pass (using
   Codex's `Stop` block-continuation) as its enforcement boundary so the end state
   converges with Claude's.
6. **The cross-host lock is a prerequisite research spike, Windows first.** The
   shared startup/recovery lock is the long pole, not a design-phase bullet. A
   Windows-safe locking + atomic-publication proof-of-concept must land and pass
   simultaneous-activation tests BEFORE the rest of Workstream C is committed.
7. **Rendering moves out of the synchronous hook into the hub.** Hooks emit a
   filesystem-local dirty signal; the hub's existing bounded reconcile/heal loop
   performs every render (incremental, bootstrap, heal) from the active machine
   runtime. The synchronous Codex PostToolUse dispatcher shrinks to
   `verify → auto-stage`. This removes the in-turn render stall and makes
   `.last-render` identity automatically correct — only the hub, running the
   active shared runtime, ever renders. See *Rendering Is Owned by the Hub*.

## Executive Decision

Ship two native host plugins:

```text
plugins/sdlc-workflow/         # Claude-native implementation
plugins/sdlc-workflow-codex/   # handwritten Codex-native implementation
```

Both plugins:

- preserve the same workflow capability surface
- read and write the same `.ai` artifacts
- carry the same named shared runtime and hub payload
- use the same machine-wide registry, configuration, PID record, and hub
- can independently start the shared hub when it is absent
- adopt an already-running compatible shared hub regardless of which host
  started it

The Codex skills, routers, orchestration, and hook adapters are handwritten for
Codex. The shared runtime, renderers, view assets, schemas, and hub are
mechanically synchronized because they must be identical across both packages.

Handwritten host orchestration and identical shared runtime distribution are
separate requirements. Synchronizing the runtime does not make the Codex
orchestration generated.

## Non-Negotiable Behavior

### Native Codex Plugin

`plugins/sdlc-workflow-codex` is the shipping Codex plugin.

It must:

- remain a separate Codex repo-marketplace entry
- install independently from the Claude plugin
- expose handwritten Codex-native skills and hooks
- preserve every current router, subcommand, renderer capability, view, hook
  policy, and workflow artifact contract
- work when the Claude plugin is not installed
- interoperate when both plugins are installed
- require Codex CLI `0.139.0` or newer for the documented plugin and hook
  contract
- clearly require users to review and trust all bundled hooks before the plugin
  is considered activated

### Existing Codex Prototype Disposition

The directory already contains an earlier handwritten prototype that chose a
different, **superseded** design. It is removed and replaced by this plan, not
extended:

- the eight verb-named skills (`sdlc-deliver`, `sdlc-investigate`, `sdlc-review`,
  `sdlc-design`, `sdlc-document`, `sdlc-optimize`, `sdlc-release`,
  `sdlc-continuity`) are replaced by the six router-named skills below
- `scripts/workflow-state.mjs` and its `tests/workflow-state.test.mjs`, which
  drive a separate lightweight JSON continuity model under
  `.ai/codex-workflows/`, are removed — the canonical state model is the shared
  `.ai/` artifact tree
- `MIGRATION.md`'s "map intent to focused skills, no `/wf` router" framing is
  replaced by router-name parity
- the prototype's "end-to-end, artifacts optional" philosophy is replaced by the
  preserved staged surface; Codex-native autonomy is expressed *inside* each
  handwritten router body, not by collapsing the command surface

Rationale: router-name parity gives a 1:1 capability map against the 99 Claude
references, makes cross-host continuation and conformance testing mechanical, and
lets a Claude-authored workflow resume in Codex (and the reverse) without an
intent-remapping layer. Codex-idiomatic autonomy (inspect-first, proportional
planning, end-to-end execution when the user asks) is still required — it lives
in *Codex-Native Behavior*, not in the skill taxonomy.

### One Shared Hub

The interoperability requirement is **both** of the following, not a choice
between them:

- **(a) shared artifact format, asynchronous.** Claude and Codex read and write
  the same `sdlc/v1` `.ai` artifacts and `.ai/_view`, alternating across threads
  and sessions.
- **(b) shared singleton live hub, concurrent.** One `sdlc-workflow-hub` process
  per machine, adopted across hosts, with cross-host startup coordination and
  workflow mutation leases so simultaneous activation and simultaneous mutation
  are safe.

Both are fixed requirements. The machinery for (b) — Workstream C, the
cross-host lock, mutation leases — is in scope, not optional.

The machine has one named hub:

```text
sdlc-workflow-hub
```

Both plugins always carry the matching hub payload for their shared runtime
baseline.

On first trusted SessionStart activation, bootstrap, tray startup, or an
explicit hub action:

1. If a healthy compatible `sdlc-workflow-hub` is already running, use it.
2. Do not restart it merely because the caller is Claude or Codex.
3. Do not restart it merely because the caller's plugin package version differs.
4. If no hub is running, start the bundled shared hub.
5. If Codex starts the hub, Claude must be able to use it immediately.
6. If Claude starts the hub, Codex must be able to use it immediately.
7. A healthy compatible hub remains the active hub until an explicit upgrade,
   restart, stop, or genuine recovery action.

Codex plugin installation does not provide a trusted activation hook. The first
trusted Codex SessionStart is the Codex activation point.

Activation is once per installed Codex plugin runtime baseline:

1. The SessionStart adapter reads `${PLUGIN_DATA}/activation.json`.
2. If the record matches the installed plugin identity, hook contract version,
   hook-definition hash, and bundled runtime build, and the shared hub is
   healthy, it returns without repeating materialization, bootstrap, or
   orientation.
3. If no valid activation record exists, it performs activation, confirms the
   shared hub and bootstrap result, and atomically writes the record.
4. If activation was recorded but the hub later becomes unhealthy, the shared
   lifecycle may perform recovery. Recovery is not activation and must not
   repeat unrelated activation work.
5. Changed hooks, changed activation contract, or a changed bundled runtime
   build invalidate the activation record and require the next trusted
   SessionStart to activate the new baseline.

This once-only behavior is enforced in code and covered by repeated
`startup`, `resume`, `clear`, and `compact` SessionStart tests.

The supported Codex configuration requires hooks to be enabled. A user or
administrator who disables plugin hooks has disabled automatic activation and
the managed workflow hook policy; this is an unsupported operating mode for the
native Codex plugin.

### Shared Runtime, Separate Host Implementations

The following are shared and release-synchronized:

- hub server
- hub lifecycle and configuration
- registry
- render engine
- all renderers
- view assets and components
- code browser
- docs site served by the hub
- schema validation policy
- fragment verification
- stale-render healing
- standalone per-repo server
- tray/runtime support needed to operate the shared hub

The following are host-native and separately handwritten:

- router skills
- subcommand instructions
- orchestration behavior
- user-question behavior
- task/plan behavior
- subagent policy
- hook event adapters
- host-facing invocation syntax
- final response behavior

## Current Claude Baseline

The rewrite must track the current plugin, not the older `9.53.0` state.

`9.70.0` is the current inspected snapshot, not a permanently frozen rewrite
target. The Claude plugin may continue moving while the handwritten Codex work
is underway.

### Moving-Baseline Rule

At the start of every implementation phase and before every Codex release:

1. Re-read the current `plugins/sdlc-workflow` version and git commit.
2. Re-inventory router reference names, independent skills, commands, hooks,
   runtime files, renderers, schemas, tests, and built payload.
3. Classify changes since the last Codex baseline as:
   - shared runtime/hub/view contract
   - artifact/schema contract
   - Claude-only orchestration
   - capability-surface change requiring a handwritten Codex counterpart
4. Synchronize shared runtime changes into both plugin payloads.
5. Handwrite or revise Codex-native behavior for capability changes.
6. Re-run parity, cross-host, hub, renderer, and packaging tests.
7. Update the declared Codex compatibility baseline only after those checks
   pass.

The Codex package should carry a small release-baseline record:

```json
{
  "claudeBaselineVersion": "9.70.0",
  "claudeBaselineCommit": "1a514da",
  "sharedRuntimeBuildId": "...",
  "verifiedAt": "..."
}
```

This is release provenance, not router metadata and not prompt source. It
prevents the native rewrite from silently claiming parity with a Claude plugin
that has advanced beyond the last completed synchronization.

### Current Surface

| Area | Current state at `9.70.0` |
|---|---:|
| Router skills | 6 |
| Public router references | 99 |
| Review dimensions | 31 |
| Review aggregates | 7, defined in `skills/review/SKILL.md` |
| Independent skills | 5 |
| Independent command capabilities | 1 |
| Renderers | 85 |
| Hook source files | 7 |
| Shared library files | 27 |
| Runtime scripts | 14 |
| Test files | 88 |
| Built `dist` files | 113 |

Public router references:

- `wf`: 15 public references plus internal `_fragment-authoring`
- `wf-quick`: 10
- `wf-meta`: 12
- `wf-design`: 24
- `wf-docs`: 7
- `review`: 31

### Recent Changes the Codex Rewrite Must Preserve

#### `9.63.0`: Stale-Render Healing

The hub and standalone daemon now detect a view whose `.last-render` version
differs from the running renderer version and trigger a bounded background clean
render.

This makes shared runtime identity mandatory. If Claude and Codex stamp their
different package versions into `.last-render`, the healer will continuously
consider the other host's output stale.

The rewrite must replace package-version-based render identity with shared
runtime build identity.

#### `9.65.0` and `9.66.0`: Sibling YAML Validation

Write-time sibling YAML validation is reconciled against the real corpus.
The current validated allowlist is:

```text
plan
review
design
simplify-run
ship-run
```

Codex hooks and artifact authoring must preserve this behavior and must not
restore the removed/dead `review-dimension` assumption.

#### `9.67.0`: Router Migration Apparatus Removed

The current plugin removed:

- `router-metadata.json`
- `migration-manifest.json`
- router body-hash verification
- router migration scripts
- routing-resolution verification scripts

The Codex plan must not depend on those deleted files or reintroduce body-hash
maintenance. Router parity should be checked by reference-name inventory and
behavioral conformance tests.

#### `9.68.0`: Off-Pipeline Bootstrap Rendering

Bootstrap now freshness-scans and renders:

- `.ai/simplify`
- `.ai/profiles`
- `.ai/dep-updates`
- `.ai/ideation`

The Codex runtime payload and hooks must retain the same off-pipeline bucket
mapping and bootstrap behavior.

#### `9.69.0`: Live Slice Roster Counts

Rendered slice totals now reconcile against the current slice roster after
`wf-meta extend`. Both hosts must use these current renderers.

#### `9.70.0`: Free Narrative Fragments

Any artifact may carry multiple unrestricted narrative fragments:

```text
<stem>.<label>.html.fragment
```

The current renderer:

- discovers them for every artifact
- includes their mtimes in additive and bootstrap staleness
- injects them raw-inline
- preserves typed fragment behavior separately
- supports `view.narrativeFragments: false`

All Codex artifact-producing skills and render hooks must preserve this feature.

### Current Documentation Drift

The current Claude README still describes generated Codex packaging. The native
rewrite must replace that documentation only when the native Codex plugin is
operational. Do not describe generated wrappers as the final architecture.

## Capability Preservation

### Routers

#### `wf`

`intake`, `shape`, `slice`, `plan`, `implement`, `verify`, `review`, `handoff`,
`ship`, `retro`, `instrument`, `experiment`, `benchmark`, `profile`

Shared/internal references:

- `_fragment-authoring`
- `runtime-adapters`

#### `wf-quick`

`discover`, `fix`, `hotfix`, `ideate`, `investigate`, `probe`, `rca`,
`refactor`, `simplify`, `update-deps`

#### `wf-meta`

`amend`, `announce`, `build-pipeline`, `close`, `extend`, `how`,
`init-ship-plan`, `next`, `resume`, `skip`, `status`, `sync`

#### `wf-design`

`adapt`, `animate`, `audit`, `bolder`, `brand`, `clarify`, `colorize`, `craft`,
`critique`, `delight`, `distill`, `extract`, `harden`, `layout`, `onboard`,
`optimize`, `overdrive`, `polish`, `product`, `quieter`, `setup`, `shape`,
`teach`, `typeset`

#### `wf-docs`

`explanation`, `how-to`, `plan`, `readme`, `reference`, `review`, `tutorial`

#### `review`

Dimensions:

`accessibility`, `api-contracts`, `architecture`, `backend-concurrency`, `ci`,
`code-simplification`, `correctness`, `cost`, `data-integrity`, `docs`, `dx`,
`frontend-accessibility`, `frontend-performance`, `infra-security`, `infra`,
`logging`, `maintainability`, `migrations`, `observability`, `overengineering`,
`performance`, `privacy`, `refactor-safety`, `release`, `reliability`,
`scalability`, `security`, `style-consistency`, `supply-chain`, `testing`,
`ux-copy`

Aggregates:

`all`, `architecture`, `infra`, `pre-merge`, `quick`, `security`, `ux`

The aggregate composition and model policy currently live in the Claude review
skill prose. The Codex review implementation must reproduce the behavior
natively, with Codex-native execution policy and conformance tests.

### Independent Skills and Command

Preserve native Codex implementations of:

- `error-analysis`
- `refactoring-patterns`
- `test-patterns`
- `wide-event-observability`
- `setup-wide-logging`

Do not package an `imagegen` skill in `sdlc-workflow-codex`. Codex already
provides the system `imagegen` skill, and packaging another skill with the same
name would create an avoidable collision.

### Artifacts and Views

Preserve:

- `.ai/workflows/<slug>/`
- `.ai/workflows/INDEX.md`
- `.ai/simplify`
- `.ai/profiles`
- `.ai/docs`
- `.ai/dep-updates`
- `.ai/ideation`
- `.ai/research`
- `.ai/ship-plan.md`
- `PRODUCT.md`
- `DESIGN.md`
- `.ai/_view`
- typed sibling `.yaml`
- typed `.html.fragment`
- free narrative fragments

## Shipping Package Model

### Host-Separated Distribution

Keep the Claude and Codex packages separate, but expose only the native Codex
package through the Codex repo marketplace:

```text
Claude distribution: sdlc-workflow
Codex repo marketplace: sdlc-workflow-codex
```

The legacy/generated `sdlc-workflow` Codex package must not remain installable
beside `sdlc-workflow-codex`. This prevents duplicate router skill names,
duplicate hook execution, and ambiguous Codex plugin selection.

The Claude package and native Codex package may still be installed on the same
machine through their respective host distribution mechanisms and must
interoperate through the shared runtime and artifacts.

They must not import files from each other's plugin cache. Marketplace installs
cache each plugin independently, and either plugin may be absent or removed.

### Codex Plugin Target Layout

```text
plugins/sdlc-workflow-codex/
  .codex-plugin/
    plugin.json
  package.json

  skills/
    wf/
      agents/openai.yaml
    wf-quick/
      agents/openai.yaml
    wf-meta/
      agents/openai.yaml
    wf-design/
      agents/openai.yaml
    wf-docs/
      agents/openai.yaml
    review/
      agents/openai.yaml
    error-analysis/
      agents/openai.yaml
    refactoring-patterns/
      agents/openai.yaml
    test-patterns/
      agents/openai.yaml
    wide-event-observability/
      agents/openai.yaml
    setup-wide-logging/
      agents/openai.yaml

  hooks/
    hooks.json
    session-start.mjs
    pre-tool-use.mjs
    post-tool-use.mjs

  references/
    native-operating-model.md
    artifact-interop.md
    shared-hub.md
    verification.md

  runtime/
    runtime-manifest.json
    dist/
    assets/
    components/
    docs/site/
    schemas/
    tests/frontmatter.schema.json
    reference/
    bin/
```

The exact runtime payload layout may follow the existing depth-one `dist`
invariant, but the installed Codex plugin must be self-contained.

Every skill carries `agents/openai.yaml` with current display metadata,
invocation policy, and tool dependencies. Router skills should default to
explicit invocation unless forward testing demonstrates that implicit
invocation is unambiguous.

### Skill Resource Contract

Codex does not implicitly load root-level plugin references. Every handwritten
skill must explicitly name the references it may need and load them through a
stable relative path from its own `SKILL.md`, for example:

```text
../../references/native-operating-model.md
../../references/artifact-interop.md
../../references/shared-hub.md
../../references/verification.md
```

Rules:

- keep common host-native guidance in root `references/`
- keep command-specific detail beside the owning skill
- link every loadable reference directly from `SKILL.md`
- do not rely on undocumented current-working-directory behavior
- test all reference paths from the installed plugin cache

### Plugin Paths and Writable State

Codex hook commands use the documented plugin environment:

- `${PLUGIN_ROOT}` resolves read-only installed plugin payloads and executable
  entrypoints
- `${PLUGIN_DATA}` stores Codex-plugin-local writable state, including
  `activation.json` and hook logs
- `~/.sdlc` remains the intentionally shared cross-host runtime, registry,
  lifecycle, and PID store

Codex hooks must not depend on `CLAUDE_PLUGIN_ROOT` or write into the plugin
cache. Claude adapters may continue using Claude host variables while both
adapters call the same shared lifecycle implementation.

### Handwritten Boundary

Everything under `skills/`, host-facing `hooks/`, and Codex-native references is
handwritten.

No Codex skill may:

- read a Claude skill as its runtime procedure
- translate Claude tool names
- translate Claude model names
- pretend a Claude slash command executed
- use generated wrapper prose

### Shared Runtime Synchronization

The runtime payload is mechanically synchronized into both plugins at release.
This is required to guarantee identical hub and renderer behavior.

The sync process may copy or build runtime code, but it must never generate
Codex skill prose.

Required release checks:

- shared runtime manifests are identical
- shared hub build IDs are identical
- renderer and asset hashes are identical
- schema and fragment-contract hashes are identical
- the Codex plugin contains every runtime file required for standalone operation
- no runtime file resolves through the other plugin's install path

Longer term, the host-neutral runtime source may be extracted into a top-level
shared package. The first native Codex release may use the current Claude
runtime as the canonical source, provided the installed payload is copied into
both plugins and verified byte-for-byte.

## Shared Runtime Identity

### Problem in the Current Runtime

Current daemon and renderer identity is based on `package.json` plugin version:

- `lib/hub-lifecycle.mjs` compares the running hub version to `PLUGIN_VERSION`
- `scripts/hub-serve.mjs` reports `PLUGIN_VERSION`
- `lib/serve-lifecycle.mjs` compares `PLUGIN_VERSION`
- `renderers/_shell.mjs` exports a hardcoded `PLUGIN_VERSION`
- `.last-render` stores that version
- stale-render healing compares rendered version to the running daemon version
- tray stale-state compares server version to plugin version

That works for one plugin package. It is incorrect for two native plugins that
must share one hub and renderer runtime.

### Runtime Manifest

Both plugins must carry an identical runtime manifest:

```json
{
  "family": "sdlc-workflow",
  "hubName": "sdlc-workflow-hub",
  "runtimeVersion": "9.70.0",
  "hubProtocolVersion": 1,
  "artifactSchema": "sdlc/v1",
  "registryVersion": 2,
  "hubConfigVersion": 1,
  "buildId": "<sha256-of-shared-runtime-payload>"
}
```

Rules:

- `hubName` identifies the singleton independently of host.
- `runtimeVersion` tracks the shared renderer/hub/runtime release.
- `buildId` proves that two packages carrying the same version contain the same
  shared runtime bytes.
- plugin package versions remain host-specific metadata.
- hub adoption and render freshness use runtime identity, not plugin identity.

### Identity Refactor

Replace package-version comparison with runtime-manifest comparison in:

- hub lifecycle
- hub health
- standalone serve lifecycle
- standalone serve health
- render shell/version stamp
- `.last-render`
- stale-render healing
- tray health and stale detection
- diagnostics and logs

Keep the current top-level `version` health field as a compatibility alias
during migration, but define it as the shared runtime version. Add structured
identity:

```json
{
  "hub": {
    "name": "sdlc-workflow-hub",
    "protocolVersion": 1,
    "runtimeVersion": "9.70.0",
    "buildId": "..."
  },
  "startedBy": {
    "host": "codex",
    "plugin": "sdlc-workflow-codex",
    "pluginVersion": "..."
  }
}
```

`startedBy` is diagnostic only. It does not control adoption or behavior.

## Machine-Wide Shared Runtime Store

### Why It Is Needed

If a hub started directly from one plugin's marketplace cache, uninstalling or
updating that plugin can remove files the long-running hub needs later:

- stale-render healing needs `render-sunflower`
- the hub serves docs and browser assets
- restarts need the hub entrypoint
- shared chunks and renderers must remain available

The hub should not depend on whichever host plugin happened to start it.

### Runtime Store Layout

Materialize immutable shared runtime builds under:

```text
~/.sdlc/runtime/<buildId>/
  runtime-manifest.json
  dist/
  assets/
  components/
  docs/site/
  schemas/
  tests/frontmatter.schema.json
  reference/
  bin/
```

Also maintain:

```text
~/.sdlc/active-runtime.json
~/.sdlc/hub.pid
~/.sdlc/hub-config.json
~/.sdlc/registry.json
~/.sdlc/registry.d/
```

### Materialization Rules

When either plugin ensures the hub:

1. Read and validate its bundled `runtime-manifest.json`.
2. Verify or atomically materialize that build under
   `~/.sdlc/runtime/<buildId>/`.
3. Never partially overwrite an existing build directory.
4. Verify the stored manifest and required files before use.
5. Start the hub from the machine-wide runtime store, not the plugin cache.

This guarantees that:

- Codex can start the hub with no Claude installation
- Claude can start the hub with no Codex installation
- either host can use a hub started by the other
- uninstalling the starter plugin does not break the running hub
- stale-render healing always resolves the active shared renderer

Runtime garbage collection must never remove:

- the active runtime
- the runtime used by a live hub PID
- any runtime whose `runtimeVersion` matches a live or active hub (same version
  ⇒ never reaped, even if the GC caller's bundled build differs)
- the previous known-good runtime retained for rollback

## Shared Hub Lifecycle Contract

### Adoption-First State Machine

Both host plugins call the same lifecycle contract.

### Cross-Host Startup Coordination

**This is the long pole of the whole effort, not a design-phase bullet.** It is a
genuine distributed-systems problem: two *distinct host processes* (Claude and
Codex), each with its own plugin cache, racing to start/recover/upgrade one
machine-wide singleton — a situation the existing single-plugin lifecycle never
faced. It must be treated as a **prerequisite research spike** that lands and
passes simultaneous-activation tests **before** the rest of Workstream C (runtime
store, adoption, upgrade/rollback) is committed on top of it.

Before either host can materialize, start, recover, stop, or upgrade the shared
hub, Claude and Codex must use one shared coordination protocol implemented in
the host-neutral lifecycle library. No host-specific adapter may implement its
own startup lock.

**Windows first.** This repo is Windows-primary, and Windows is where
cross-process locking breaks the POSIX intuitions:

- there is no portable `O_EXCL`-equivalent atomic-create-exclusive across every
  filesystem; `wx` open is the closest and must be the tested primitive
- `fs.rename` over an *existing* target throws on Windows (unlike POSIX atomic
  replace), so the atomic-publication order for `active-runtime.json` / `hub.pid`
  must use a rename-into-empty or replace-via-temp pattern that is proven on
  Windows, not assumed from POSIX
- a dead lock-holder's PID can be recycled, so stale-lock takeover must verify
  hub health + process identity (the existing port-squat lesson), not just PID
  liveness

The spike must jointly specify and *prove on Windows first, then Linux/macOS*:

- one atomic startup/recovery lock under `~/.sdlc` (the `wx`-open primitive +
  fallback)
- lock owner identity, acquisition timestamp, heartbeat, expiry, and random token
- stale-lock recovery rules that verify hub health and process identity before
  takeover
- atomic publication order for runtime materialization, active-runtime record,
  PID record, and health readiness — using a Windows-safe replace pattern
- behavior when Claude and Codex SessionStart fire simultaneously
- behavior when startup races an explicit upgrade, stop, or recovery action

Exit gate for the spike: a test harness that launches simultaneous Claude and
Codex activation (and a startup-vs-upgrade race) on Windows, Linux, and macOS and
proves exactly one hub process, one valid PID record, and one active runtime.
Only after this gate passes does the rest of Workstream C proceed.

#### No Hub Running

```text
materialize caller's bundled runtime
start sdlc-workflow-hub from machine runtime store
write hub.pid
confirm health
use hub
```

#### Healthy Compatible Hub Running

```text
verify hubName
verify protocol compatibility
verify tracked live PID and token record
adopt existing hub
do not restart
use existing active runtime
```

This applies regardless of:

- whether Claude or Codex started it
- which plugin is currently invoking the lifecycle
- plugin package version differences
- plugin cache locations

#### Healthy Hub With a Different Runtime Build

If the hub name and protocol are compatible:

- adopt it
- do not automatically restart it
- do not downgrade it
- expose the candidate-versus-active runtime difference in diagnostics
- allow an explicit controlled upgrade or restart

This directly satisfies the requirement that an already-present hub is used.

**Trust model (resolved).** The shared `sdlc-workflow-hub` is a trusted
machine-wide component. A host adopting a hub whose runtime `buildId` differs
from its own bundled payload does **not** re-verify the active runtime's bytes
against its own manifest — it trusts the active runtime materialized in
`~/.sdlc/runtime/<buildId>` (whose stored manifest and required files the
lifecycle already verifies on materialization and before use). A host never
materializes *over* another build, and a foreign build only becomes active
through the materialization path's own integrity checks, so adoption-of-trust
does not widen the attack surface beyond "the shared store is trusted." A host
that is unwilling to run a foreign build does not silently fork its own renderer;
it surfaces the drift and offers an explicit controlled upgrade.

**Never reap a same-version hub or runtime.** When the active runtime's
`runtimeVersion` matches the caller's, the caller must never reap, restart, or
replace the hub or its runtime — not on adoption, not on GC, not on SessionStart.
Reaping or replacement is reserved for a genuine `runtimeVersion`/protocol
mismatch under an explicit controlled upgrade, or for true unhealth (see
*Unhealthy or Orphaned Hub*). "A newer plugin package wants to take over" is not,
by itself, grounds to reap a same-version hub.

#### Hub Protocol Incompatible

Do not silently replace an incompatible healthy hub during SessionStart.

Return a clear diagnostic containing:

- running hub identity
- caller's bundled runtime identity
- required upgrade action

An explicit controlled upgrade may replace it after compatibility and rollback
checks.

#### Unhealthy or Orphaned Hub

Recovery may restart a hub when:

- the PID is dead
- health does not answer
- the PID record is malformed or has lost the write token
- the process reports the wrong hub name
- the active runtime directory is missing or corrupt

Recovery is different from replacing a healthy hub because another host called.

#### Non-Hub Port Occupant

Do not identify an arbitrary process as the shared hub. Preserve or tighten the
current explicit recovery behavior, but diagnostics must clearly distinguish a
port conflict from a stale SDLC hub.

### PID Record

Extend `~/.sdlc/hub.pid` to include:

```json
{
  "pid": 1234,
  "host": "127.0.0.1",
  "port": 4173,
  "token": "...",
  "configHash": "...",
  "hubName": "sdlc-workflow-hub",
  "hubProtocolVersion": 1,
  "runtimeVersion": "9.70.0",
  "buildId": "...",
  "runtimeRoot": "~/.sdlc/runtime/<buildId>",
  "startedByHost": "codex"
}
```

Both plugins use the same token record for authenticated registry operations.

### Controlled Runtime Upgrade

SessionStart remains adoption-first. Runtime replacement is explicit.

Provide a controlled upgrade/restart operation that:

1. Acquires `~/.sdlc/hub-upgrade.lock`.
2. Materializes and verifies the requested runtime.
3. Records the previous active runtime.
4. Gracefully stops the current hub.
5. Starts the requested runtime.
6. Confirms health and registry visibility.
7. Rolls back to the previous runtime if startup fails.

The operation must never downgrade implicitly. A deliberate downgrade requires
an explicit flag and confirmation.

## Shared Renderer and Stale-Heal Contract

### Rendering Is Owned by the Hub

**Prerequisite — DELIVERED (v9.73.0):** this was delivered first as a standalone
Claude-plugin refactor in `plugins/sdlc-workflow/docs/internal/RENDER-DISPATCH-PLAN.md`
(hooks enqueue to a durable per-repo render queue; the hub drains it; hub-down →
hooks attempt a restart, report failure, and the queue is caught up on start).
That plan defines the host-neutral `lib/render-queue.mjs` `enqueue()` contract and
a single renderer-resolution seam (`resolveRenderEntrypoint()` in
`lib/heal-render.mjs`). Native interop then only (a) points that seam at the
active machine runtime and (b) has the Codex hooks call the same `enqueue()`.

Rendering is moved off the synchronous hook path and onto the hub. This is both a
performance fix (no in-turn render stall — see *Serialized Post-Tool Dispatcher*)
and the cleanest possible answer to cross-host `.last-render` identity: if the
hub is the only process that renders, and the hub runs the active machine
runtime, then `.last-render` is always stamped with the active runtime's
`buildId` regardless of which host triggered the work. There is nothing left to
thrash because there is only one renderer.

The current Claude design already points this way. The PostToolUse render hook
([`hooks/render-on-artifact-write.mjs`](../../../sdlc-workflow/hooks/render-on-artifact-write.mjs))
already returns fast and spawns a *detached* render child; the hub
([`lib/heal-render.mjs`](../../../sdlc-workflow/lib/heal-render.mjs)) is already a
bounded background render engine (concurrency cap, per-repo cooldown, attempt
ceiling, `fs.watch` live-reload) that today fires only on version drift. This
plan generalizes that engine from "render on version drift" to "render on dirty
signal OR version drift," and routes all hooks through it.

**Mechanism (preserves the heal-render security crux):**

1. A managed-artifact write's PostToolUse hook writes a **filesystem-local**
   dirty marker for the affected repo+bucket (extending today's
   `.ai/_view/.render-pending`). It does **not** call an HTTP render endpoint —
   render-on-request stays rejected because a remote GET must never be able to
   trigger a render.
2. The hub's existing reconcile tick scans registered repos. Its `consider(entry)`
   path is extended to also act on a fresh dirty marker (not just `buildId`
   drift) and enqueue a bounded render — incremental for a known slug bucket,
   bootstrap freshness for off-pipeline buckets.
3. The hub renders from the active machine runtime, resolved in order:
   1. healthy hub PID record's `runtimeRoot`
   2. verified `active-runtime.json`
   3. caller-bundled runtime materialized into the store
4. **Fallback when no hub is reachable:** a hook may spawn a one-shot detached
   render as today's degraded path — but it MUST resolve the renderer through the
   same active-runtime resolution order (PID `runtimeRoot` → `active-runtime.json`),
   never from its own plugin cache, so even the fallback stamps the active
   `buildId`. If neither resolves, it skips and lets the next hub reconcile heal.

This keeps SessionStart bootstrap, incremental writes, and stale-heal all flowing
through one bounded engine that uses one runtime identity.

### `.last-render` Identity

Replace plugin version stamping with:

```json
{
  "runtimeVersion": "9.70.0",
  "buildId": "...",
  "renderedAt": "...",
  "configHash": "..."
}
```

Keep legacy `version` as a compatibility alias during migration.

### Stale-Render Healing

The active hub's runtime build is authoritative for rendered views.

The healer compares:

```text
view .last-render buildId
vs
active hub runtime buildId
```

It must not compare Claude package version to Codex package version.

This preserves the current `9.63.0` bounded healer without cross-host thrash.

### Renderer and View Parity

The Codex plugin carries the same:

- 85 renderers
- view assets
- code browser
- hub dashboard
- docs site
- typed fragment support
- free narrative fragment support
- off-pipeline rendering

No Codex-specific view root or renderer fork is permitted.

Both hosts render to:

```text
.ai/_view
```

## Shared Artifacts and Interoperability

### Canonical State

`.ai` artifacts remain the cross-host source of truth.

Do not use `.ai/codex-workflows` as a parallel lifecycle store.

The existing Codex prototype's lightweight JSON continuity model
(`scripts/workflow-state.mjs` + `.ai/codex-workflows/`) is **removed**, not
retained (see *Existing Codex Prototype Disposition*). The canonical state model
for this rewrite is the shared `.ai/` artifact tree; cross-thread continuity is
provided by `wf-meta status`/`resume`/`next` reading those artifacts.

### Existing Invocation Fields

Current artifacts use fields such as:

- `next-command`
- `next-invocation`
- `recommended-next-command`
- `recommended-next-invocation`

Codex must read these existing artifacts and map them to native Codex skill
invocation without requiring migration.

An additive host-neutral action field may be introduced later:

```yaml
next-action: wf.plan
next-args: [account-export, api-slice]
```

If introduced:

- it is additive first
- legacy fields remain readable
- renderers and both hosts support both forms
- it does not block the first native Codex release

### Producer Provenance

Optional provenance may record the producing host:

```yaml
producer:
  host: codex
  plugin: sdlc-workflow-codex
  plugin-version: ...
  runtime-version: 9.70.0
  runtime-build-id: ...
```

Provenance is diagnostic only. It must not change how the next host interprets
the artifact.

### Concurrent Mutation

Alternating hosts is required. Simultaneous mutation of the same workflow needs
coordination.

Add workflow mutation leases:

```text
.ai/workflows/<slug>/.locks/workflow.json
```

The first implementation may use one workflow-wide lease rather than slice
leases.

Each lease records:

- host
- action
- session or turn ID when available
- acquired timestamp
- renewed timestamp
- expiry timestamp
- random lease token

Rules:

- read-only commands do not acquire a lease
- mutating commands acquire the workflow lease
- a conflicting active lease is not overwritten
- stale leases can be recovered with an audit record
- final artifact and index writes are atomic
- `.locks` is ignored by rendering and git

## Native Codex Orchestration

### Skills

Preserve the six router names as Codex skills:

```text
$wf
$wf-quick
$wf-meta
$wf-design
$wf-docs
$review
```

Each router and subcommand body is handwritten for Codex.

### Codex-Native Behavior

Codex implementations should:

- inspect the repository before choosing an approach
- read applicable `AGENTS.md` files
- use Codex's built-in plan/progress surface for nontrivial work
- use native Codex editing and verification tools
- use runtime/browser evidence for user-facing changes
- use the shared artifact/state helpers for workflow state
- preserve the current final-summary contracts
- preserve external-output leak boundaries

They should not:

- reference `AskUserQuestion` as an executable tool
- reference Claude TaskCreate or TaskUpdate
- select Claude model tiers
- read Claude router prose as runtime instructions
- claim slash-command execution when running as a Codex skill

### Questions

Ask directly in chat only when repository discovery and workflow artifacts
cannot resolve a decision and a reasonable assumption would be risky.

### Subagents and Sweeps

Codex requires explicit user intent for subagents.

Preserve review coverage and outputs with this policy:

- explicit review sweep requests may use parallel subagents
- explicit `--parallel` requests may use parallel subagents
- hidden Claude fanout becomes local/sequential Codex work by default
- one coordinator writes final shared artifacts under the mutation lease
- shared artifacts record execution mode, not Claude model names

## Native Codex Hooks

### Host Adapters Over Shared Policy

Claude and Codex hook payloads differ. Implement:

```text
host payload -> host adapter -> normalized event -> shared policy
```

Host adapters are native. Validation/render policy is synchronized with the
shared runtime.

### Required Codex Hooks

- SessionStart one-time activation, orientation, and bootstrap (bootstrap render
  is signaled to the hub, not run inline)
- pre-tool best-effort artifact validation
- one serialized post-tool dispatcher that performs schema/sibling verification,
  then implement-stage auto-stage, then emits a filesystem-local dirty render
  signal for the hub — it does **not** render inline (see *Rendering Is Owned by
  the Hub*)
- a `Stop` (and `SubagentStop`) managed-artifact verification pass that is the
  Codex enforcement boundary: because PostToolUse cannot undo a completed
  `apply_patch`, the `Stop` hook re-checks all managed artifacts touched in the
  turn and, on a violation, returns `decision: "block"` with a `reason` that
  Codex turns into a repair continuation prompt — converging Codex's final
  on-disk state with Claude's pre-write block (see Resolution 5)

### SessionStart

Codex SessionStart must:

1. Resolve the project root.
2. Read `${PLUGIN_DATA}/activation.json`.
3. Return immediately when the matching activation is already complete and the
   shared hub is healthy.
4. Acquire the shared cross-host startup coordination lock when activation or
   recovery is required.
5. Orient to active workflows during first activation.
6. Materialize its bundled shared runtime if needed.
7. Adopt an existing compatible shared hub if present.
8. Start the shared hub only if absent.
9. Signal the hub to bootstrap-render via the active shared runtime (do not run a
   bootstrap render inline in the hook; the hub owns rendering).
10. Atomically record successful activation.

Claude SessionStart must be updated to use the same adoption-first shared
runtime lifecycle and shared startup coordination protocol.

### Hook Registration and Wire Contract

The Codex plugin uses the default `hooks/hooks.json` location or an explicit
`"./hooks/hooks.json"` manifest path. Hook commands resolve entrypoints through
`${PLUGIN_ROOT}` and provide a `commandWindows` override where shell quoting or
process detachment differs.

The initial bundled hook registration is:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume|clear|compact",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${PLUGIN_ROOT}/hooks/session-start.mjs\"",
            "commandWindows": "node \"${PLUGIN_ROOT}\\hooks\\session-start.mjs\"",
            "timeout": 30,
            "statusMessage": "Activating SDLC workflow runtime"
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "apply_patch|Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${PLUGIN_ROOT}/hooks/pre-tool-use.mjs\"",
            "commandWindows": "node \"${PLUGIN_ROOT}\\hooks\\pre-tool-use.mjs\"",
            "timeout": 5,
            "statusMessage": "Validating managed artifact write"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "apply_patch|Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${PLUGIN_ROOT}/hooks/post-tool-use.mjs\"",
            "commandWindows": "node \"${PLUGIN_ROOT}\\hooks\\post-tool-use.mjs\"",
            "timeout": 15,
            "statusMessage": "Verifying managed artifacts"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"${PLUGIN_ROOT}/hooks/stop-verify.mjs\"",
            "commandWindows": "node \"${PLUGIN_ROOT}\\hooks\\stop-verify.mjs\"",
            "timeout": 20,
            "statusMessage": "Final managed-artifact check"
          }
        ]
      }
    ]
  }
}
```

The PostToolUse dispatcher now runs only verification + auto-stage (both fast,
in-repo, model-visible) and emits a dirty render signal — render no longer runs
inline, so the budget drops from the original 55s to ~15s. The dispatcher must
still report which stage timed out. The hub performs the actual render off the
request path. `SubagentStop` mirrors the `Stop` registration so subagent-authored
artifacts get the same final check.

Every hook adapter reads one JSON object from `stdin`. The adapters must parse
and validate at least:

```text
common:
  session_id
  transcript_path
  cwd
  hook_event_name
  model
  permission_mode

SessionStart:
  source = startup | resume | clear | compact

PreToolUse and PostToolUse:
  turn_id
  tool_name
  tool_use_id
  tool_input

PostToolUse:
  tool_response
```

Matcher and tool rules:

- SessionStart matches `startup|resume|clear|compact`
- file-edit hooks match `apply_patch|Edit|Write`
- hook input is interpreted using canonical `tool_name: "apply_patch"`
- Bash and MCP writes are treated as additional best-effort paths where their
  final touched files can be established
- hook logic never assumes Claude-only `MultiEdit` or `NotebookEdit` events

Output rules:

- success with no model-visible feedback exits `0` with no stdout
- SessionStart orientation context uses documented
  `hookSpecificOutput.additionalContext`
- PreToolUse denial uses documented `permissionDecision: "deny"` or exit code
  `2` with a clear stderr reason
- PostToolUse feedback uses documented PostToolUse JSON or exit code `2`
- unsupported fields such as asynchronous handlers or unsupported output
  mutations are not emitted
- malformed input fails with a concise diagnostic and never silently claims
  validation succeeded

The normalized shared-policy event schema and every host adapter mapping must be
documented and fixture-tested before enabling Codex hooks.

### Activation Record Contract

`${PLUGIN_DATA}/activation.json` is written atomically only after successful
activation:

```json
{
  "schemaVersion": 1,
  "pluginName": "sdlc-workflow-codex",
  "pluginVersion": "...",
  "hookContractVersion": 1,
  "hookDefinitionHash": "...",
  "runtimeVersion": "9.70.0",
  "runtimeBuildId": "...",
  "hubName": "sdlc-workflow-hub",
  "activatedAt": "..."
}
```

The adapter writes a temporary sibling, flushes it, and atomically renames it
into place. A missing, malformed, partially written, or mismatched record is not
active. The activation record is host-local provenance; shared hub health and
the shared lifecycle records remain authoritative for the running hub.

### Serialized Post-Tool Dispatcher

Codex launches multiple matching command hooks concurrently. Therefore
`hooks/hooks.json` registers exactly one Codex PostToolUse command for managed
artifact writes.

That dispatcher runs these stages sequentially:

1. Determine the final touched files from the Codex event and on-disk state.
2. Run schema, path, slug, sibling, and fragment verification.
3. If verification fails, emit corrective feedback and skip auto-stage and the
   render signal.
4. If verification succeeds and the workflow is in implement stage, run the
   existing auto-stage policy.
5. Emit the filesystem-local dirty render signal for the hub (see *Rendering Is
   Owned by the Hub*). Do **not** render inline.
6. Return one combined result.

Render is intentionally NOT a stage of the synchronous dispatcher. Removing it
both eliminates the in-turn render stall on large repos and corrects a false
dependency: auto-stage (`git add` of a non-artifact source file) depends on the
workflow being in implement stage, never on render output — so it must follow
verification, not rendering. The hub renders from the dirty signal afterward.

The existing auto-stage behavior is retained. It must preserve its current
opt-out, workflow-stage, repository, and artifact exclusions.

Each stage must be idempotent. The dispatcher must prevent overlapping
processing of the same touched-file set within one turn.

### Post-Tool Validation Limits and the Stop-Time Enforcement Boundary

PostToolUse runs after the tool side effect and cannot undo an invalid write. It
is the deepest *in-turn* on-disk audit and corrective-feedback point, not a
transactional rollback boundary. Claude's enforcement (a PreToolUse/PostToolUse
exit-2 hard block) cannot be replicated identically on Codex `apply_patch`, where
the write is already durable by the time any hook sees final content.

**Resolved parity goal (Resolution 5): identical FINAL state, not identical
enforcement timing.** Parity is defined on the final on-disk artifacts and the
rendered view a turn leaves behind, not on whether the bad write was blocked
before or repaired after. The hosts may arrive there by different paths.

**Resolved enforcement boundary: the `Stop` hook.** Codex's `Stop` hook supports
`decision: "block"` with a `reason` that Codex turns into a continuation prompt.
The `Stop`/`SubagentStop` managed-artifact verification pass re-checks every
managed artifact touched in the turn; on a violation it blocks with a concrete
repair `reason`, forcing the turn to continue and fix the artifact before it can
end. This is what guarantees Codex's end state converges with Claude's, even
though Claude blocked pre-write and Codex repaired pre-stop. PostToolUse remains
the fast in-turn nudge; `Stop` is the boundary that must pass.

The remaining implementation spike covers only the mechanics:

- whether an invalid managed artifact is left on disk for repair or restored from
  a pre-tool snapshot before the `Stop` re-check
- how partial multi-file rich artifacts (the `.md` landed, the sibling `.yaml`
  not yet) are distinguished from genuine violations during a turn vs. at `Stop`
- a bounded repair-attempt ceiling so a `Stop` block cannot loop forever (after N
  blocks, surface a hard failure rather than re-prompting)
- how shell/MCP writes that bypass interception are caught by the `Stop` sweep
- the shared normalized representation so the same verification core backs the
  Claude block and the Codex `Stop` pass

The verification core is shared with Claude; the enforcement *timing* difference
(pre-write block vs. Stop-time repair) is the documented, intentional host
difference.

### Background Process Launch

Keep the current Claude detached-background behavior while adapting it to the
Codex command-hook contract:

- the SessionStart hook synchronously performs activation checks, lifecycle
  locking, and bounded readiness confirmation
- the hub process is launched detached from the hook process and survives hook
  exit
- Windows launches use hidden-window detached process behavior
- macOS and Linux launches detach and unreference the child process
- stdout and stderr go to bounded logs under the shared runtime or
  `${PLUGIN_DATA}`, never to an inherited pipe that keeps the hook alive
- hook commands do not use unsupported `async: true`
- activation remains within the configured SessionStart timeout and returns a
  clear diagnostic on timeout
- detached launch and readiness behavior are tested on Windows, Linux, and
  macOS

### Codex `apply_patch`

Codex PreToolUse does not receive the same final-content shape as Claude Write.

Therefore:

- pre-tool validation handles paths and violations visible in patch text
- post-tool validation performs the deepest final on-disk audit and supplies
  corrective feedback, while acknowledging that it cannot undo the completed
  tool side effect
- managed artifact skills explicitly validate before completion
- rich artifact skills write required siblings in the correct order
- hooks remain a safety net because not every shell write is intercepted

### Current Validation Behavior to Preserve

- `sdlc/v1` frontmatter validation
- workflow slug/path consistency
- project context validation
- rich-tier mandatory sibling `.yaml`
- optional typed `.html.fragment` nudge
- current sibling YAML validated allowlist
- free narrative fragment discovery and staleness
- off-pipeline bootstrap rendering

### Hook Trust

Document and test Codex hook trust:

1. Install `sdlc-workflow-codex`.
2. Review and trust its hooks.
3. Confirm registration.
4. Start in a repo with active workflows.
5. Verify orientation, bootstrap, shared hub adoption, and render behavior.

Users are expected to trust all bundled hooks. Until every bundled hook is
trusted, the plugin is installed but not activated, and documentation must not
claim that automatic activation, validation, rendering, or auto-stage is
operational.

Changed hook definitions invalidate Codex hook trust. Plugin update
documentation and tests must explicitly include re-reviewing changed hooks and
starting a new thread for the updated plugin baseline.

## Shared Runtime Source and Release Synchronization

### Initial Source of Truth

For the first native Codex interoperability release:

- baseline the shared runtime from current Claude `sdlc-workflow` `9.70.0`
- copy the required self-contained runtime payload into
  `plugins/sdlc-workflow-codex/runtime`
- add hash and manifest verification
- keep Codex skill prose completely handwritten

### Preferred Long-Term Source

After the first vertical interoperability slice, extract the host-neutral runtime
source into a shared top-level package, for example:

```text
packages/sdlc-workflow-runtime/
```

Both plugins then consume the same runtime source during release packaging.

The installed plugin packages still carry their own complete payload. They must
not require the top-level source package at runtime.

### Release Alignment

Every Claude runtime-changing release must perform a Codex runtime sync check.

Examples of runtime-changing work:

- hub or lifecycle changes
- renderer changes
- assets or components
- schemas
- hook policy
- docs served by the hub
- render/bootstrap changes
- code browser
- tray/shared daemon behavior

Codex skill-only changes may bump the Codex plugin version without changing the
shared runtime version or build ID.

Claude skill-only changes may bump the Claude plugin version without changing
the shared runtime version or build ID.

If a shared runtime changes, both plugin packages must carry the new runtime
before release is considered complete.

Every Claude capability-surface change must also trigger a native Codex parity
review. A new or changed Claude subcommand is not copied as prose; its behavior
is assessed and the corresponding Codex-native implementation is handwritten or
updated before the Codex compatibility baseline advances.

### Cross-Host Capability Parity Ledger

Reference-name inventory catches *added* and *removed* commands. It does **not**
catch a command whose *behavior* changes under the same name — which, given the
Claude plugin's release velocity, is the common case. The router body-hash that
used to catch behavioral change was deliberately removed in `9.67.0` and must not
return. The replacement is a host-neutral **capability parity ledger** that
detects behavioral drift in **both** directions (Claude→Codex and Codex→Claude)
and gates release until parity is re-asserted.

Shape (one entry per capability — router reference, review dimension, aggregate,
independent skill):

```json
{
  "capability": "wf.plan",
  "contractVersion": 7,
  "behaviorContractHash": "<sha256 of the host-neutral behavior contract>",
  "hosts": {
    "claude": { "verifiedContractVersion": 7, "at": "..." },
    "codex":  { "verifiedContractVersion": 7, "at": "..." }
  }
}
```

- The **behavior contract** is host-neutral and observable: the artifacts a
  capability produces (paths, `type`, required frontmatter/sibling fields), the
  `next-action`/invocation it recommends, the render buckets it touches, and its
  safety gates. It is NOT the prompt prose (that stays handwritten per host) and
  NOT a router-body hash.
- A host that changes a capability's observable behavior bumps
  `contractVersion` and re-points `behaviorContractHash`. Its own
  `verifiedContractVersion` advances only when its conformance fixture passes at
  the new contract.
- **Release gate (bidirectional):** release fails if any capability's
  `contractVersion` is ahead of *either* host's `verifiedContractVersion`. So a
  Claude behavioral change leaves Codex behind → gate red until Codex's
  handwritten implementation is updated and re-verified; and a Codex behavioral
  change leaves Claude behind → same gate, same direction enforced the other way.
- Conformance is proven by the existing cross-host fixtures (artifact
  conformance + cross-host continuation), now keyed to `contractVersion`, so the
  ledger is backed by tests rather than asserted by hand.

This is the mechanism Resolution 4 requires: a change in one host's version is
provably reflected in the other host's version before release, without
reintroducing body-hash or router-metadata maintenance.

### Codex Repo Marketplace and Update Flow

The Codex package targets the repository marketplace at:

```text
.agents/plugins/marketplace.json
```

That marketplace exposes `sdlc-workflow-codex` and must not expose the legacy
generated `sdlc-workflow` Codex package after cutover.

Codex update documentation and release tests must cover:

1. Update the repo-marketplace plugin source and version.
2. Upgrade or reinstall the marketplace plugin using the supported Codex
   plugin flow.
3. Restart Codex or start a new thread so the installed cache baseline is
   loaded.
4. Review and trust changed hook definitions.
5. Allow first trusted SessionStart to activate the new plugin/runtime/hook
   baseline.
6. Confirm the prior healthy shared hub is adopted unless an explicit runtime
   upgrade is requested.
7. Confirm the activation record is updated only after successful activation.

The release documentation must state the minimum supported Codex CLI version:
`0.139.0`.

## Implementation Workstreams

### Workstream A: Current-State Baseline

Deliverables:

- record `9.70.0` runtime inventory and hashes
- record and enforce minimum Codex CLI `0.139.0`
- record all current routers and reference filenames
- record current review aggregate behavior from `review/SKILL.md`
- snapshot current artifact, renderer, hub, heal, off-pipeline, and fragment
  behavior
- remove old `9.53.0` and router-metadata assumptions from planning docs
- remove the superseded Codex prototype from `plugins/sdlc-workflow-codex/`: the
  eight verb-named `sdlc-*` skills, `scripts/workflow-state.mjs`,
  `tests/workflow-state.test.mjs`, the `references/workflow-state.md` model, and
  `MIGRATION.md`'s no-router framing (see *Existing Codex Prototype Disposition*)
- seed the **Cross-Host Capability Parity Ledger** from the current surface — one
  entry per router reference, review dimension, aggregate, and independent skill
  at `contractVersion: 1`, with the current behavior contract hashed

Exit criteria:

- the rewrite baseline matches the current plugin
- the superseded prototype is gone and the ledger covers the full surface
- all current core tests pass

### Workstream B: Shared Runtime Identity

Deliverables:

- runtime manifest
- shared hub name
- runtime build ID
- package-version-to-runtime-version refactor
- structured health identity
- runtime-aware tray and diagnostics
- `.last-render` runtime identity

Exit criteria:

- Claude and Codex package versions can differ without daemon or render churn
- a hub reports host-neutral identity

### Workstream C: Machine-Wide Runtime Store and Hub Adoption

Deliverables:

- immutable machine runtime store
- atomic runtime materialization
- active runtime record
- jointly designed shared Claude/Codex startup and recovery lock
- adoption-first lifecycle
- controlled upgrade/restart with rollback
- runtime garbage collection safeguards

Exit criteria:

- either plugin starts a hub that survives starter plugin cache removal
- the other plugin adopts the same PID
- SessionStart never replaces a healthy compatible hub

### Workstream D: Codex Shared Runtime Payload

Deliverables:

- complete current shared runtime payload under the Codex plugin
- byte/hash parity verification
- self-contained execution with no runtime install
- Codex package version aligned to a declared Claude runtime baseline

Exit criteria:

- Codex alone can start, render, serve, heal, and operate the hub

### Workstream E: Native Codex Hooks

Deliverables:

- handwritten Codex hook adapters
- complete Codex hook stdin, matcher, output, exit-code, timeout, and
  `commandWindows` contract
- shared normalized events
- current validation policy
- one serialized PostToolUse dispatcher (verify → auto-stage → emit dirty render
  signal; no inline render)
- `Stop`/`SubagentStop` managed-artifact verification pass as the Codex
  enforcement boundary (block-continuation repair)
- PostToolUse/Stop invalid-state recovery design with a bounded repair ceiling
- detached cross-platform background launch matching current Claude behavior
- hub-owned rendering via dirty signal, with an active-runtime-resolved fallback
  render when no hub is reachable
- once-only SessionStart activation record under `${PLUGIN_DATA}`
- adoption-first SessionStart behavior

Exit criteria:

- Codex hooks operate natively
- Claude and Codex hooks converge on equivalent FINAL on-disk and rendered-view
  outcomes; enforcement *timing* may differ (Claude pre-write block vs. Codex
  Stop-time repair) and that difference is documented, not eliminated

### Workstream F: Handwritten Codex Routers

Migration order:

1. Read-only and recovery commands
2. Planning and artifact-authoring commands
3. Mutating engineering commands
4. Review dimensions and sweeps
5. External side-effect commands

Every migrated command requires:

- handwritten Codex reference
- artifact conformance fixture
- cross-host continuation test
- current render/fragment coverage
- explicit safety gates

Exit criteria:

- every preserved router action is implemented natively
- no generated or translated Claude execution prose remains

### Workstream G: Independent Skills and Command

Deliverables:

- native Codex implementations of all independent skills except `imagegen`
- native `setup-wide-logging`
- shared artifact/runtime use where applicable

Exit criteria:

- the complete non-router capability surface is preserved without packaging a
  duplicate Codex `imagegen` skill

### Workstream H: Documentation and Release

Deliverables:

- installation docs for each plugin alone and both together
- Codex repo-marketplace install and update docs
- minimum Codex CLI `0.139.0` documentation and enforcement
- hook review, trust, re-trust, and activation docs
- shared hub behavior docs
- runtime upgrade/recovery docs
- removal of generated-Codex claims after cutover
- release synchronization checks

Exit criteria:

- users understand that both plugins carry and use one shared hub

### Workstream I: Remove Legacy Generated Codex Packaging

This workstream removes the **generated Codex packaging that lives inside the
Claude plugin** — distinct from the superseded handwritten prototype removed in
Workstream A.

Deliverables:

- remove `plugins/sdlc-workflow/.codex-generated/`
- remove `plugins/sdlc-workflow/.codex-plugin.overrides.json`
- inventory and remove whatever the wrapper build actually generates from the
  overrides file (NOTE: there is no `plugins/sdlc-workflow/.codex-plugin/`
  directory on disk today — verify the real generation mechanism in Phase 0
  rather than removing a path that may not exist)
- remove Codex-wrapper generation scripts, tests, build wiring, and stale docs
  from the Claude plugin
- remove the legacy `sdlc-workflow` entry from the Codex repo marketplace
  (`.agents/plugins/marketplace.json` currently lists both `sdlc-workflow` and
  `sdlc-workflow-codex`)
- add a release check that fails if generated Codex wrapper paths or legacy
  Codex marketplace exposure return

Exit criteria:

- `sdlc-workflow-codex` is the only Codex plugin path
- the Claude package remains functional through its native host distribution
- no duplicate Codex router skills or hooks can be installed from this repo

## Phased Delivery

### Phase 0: Rebaseline at `9.70.0`

1. Run:
   - `npm run build`
   - `npm run verify`
   - `npm test`
   - `npm run test:e2e`
   - `node scripts/verify-fragment.mjs`
2. Record renderer, runtime, schema, and hub payload hashes.
3. Record the current router/reference inventory directly from the filesystem.
4. Add parity checks that do not depend on removed router metadata.
5. Record Codex CLI `0.139.0` as the minimum supported version and add a
   preflight/version fixture.
6. Inventory every generated Codex packaging path and its build/test/doc
   dependencies for complete removal during cutover.

Exit: the rewrite is anchored to the current plugin.

### Phase 1: Make the Existing Claude Hub Shareable

1. Introduce `runtime-manifest.json`.
2. Refactor hub/serve/render/heal/tray identity away from package version.
3. Add structured shared hub health identity.
4. Keep legacy health/version fields for compatibility.
5. Add adoption-first behavior to the Claude lifecycle.

Exit: the current Claude plugin can safely share its hub with another package.

### Phase 2: Add the Machine-Wide Runtime Store

0. **Gating spike (do this first):** land the shared Claude/Codex
   startup/recovery lock and prove simultaneous-activation + startup-vs-upgrade
   safety on Windows first, then Linux/macOS (see *Cross-Host Startup
   Coordination*). The rest of Phase 2 does not start until this gate passes.
1. Add atomic runtime materialization (Windows-safe replace pattern).
2. Build the shared startup, recovery, and upgrade coordination protocol on top
   of the proven lock.
3. Start the hub from `~/.sdlc/runtime/<buildId>`.
4. Record active runtime and runtime root in the PID file.
5. Make render (hub-owned) and heal resolve through the active runtime.
6. Add explicit upgrade/restart and rollback.

Exit: the hub no longer depends on the starter plugin's cache.

### Phase 3: Make Codex Independently Hub-Capable

1. Copy/package the current shared runtime into `sdlc-workflow-codex`.
2. Verify identical runtime manifest and build ID.
3. Add native Codex SessionStart hook with once-only activation and detached
   cross-platform background launch.
4. Add complete hook wire-contract fixtures.
5. Prove:
   - Codex-only install starts the hub
   - Claude-only install starts the hub
   - Claude adopts a Codex-started hub
   - Codex adopts a Claude-started hub
   - simultaneous Claude and Codex activation starts exactly one hub
   - repeated Codex SessionStart events do not repeat completed activation

Exit: the same hub works independently and jointly.

### Phase 4: Native Codex Read/Recovery Slice

Handwrite:

- `wf-meta status`
- `wf-meta next`
- `wf-meta resume`
- `wf-meta sync`
- `wf-meta how`

Add native Codex pre-tool validation, the serialized PostToolUse
verify → auto-stage → render-signal dispatcher, and the `Stop`/`SubagentStop`
managed-artifact verification pass (the enforcement boundary). Complete the
invalid-write recovery design spike (bounded repair ceiling) before enabling the
Stop-time block by default.

Exit: Codex can discover and continue a Claude-created workflow using the same
hub and view.

### Phase 5: Native Codex Planning and Artifact Authoring

Handwrite:

- `wf intake`, `shape`, `slice`, `plan`
- `wf-design shape`, `craft`, `brand`, `product`, `setup`
- all `wf-docs` actions
- read-heavy `wf-quick` actions
- `wf-meta amend`, `extend`, `skip`, `close`, `init-ship-plan`

Exit: Claude can continue workflows originated by Codex without repair.

### Phase 6: Native Codex Mutating Commands

Handwrite:

- `wf implement`, `verify`, `review`
- all review dimensions and sweeps
- mutating `wf-design` actions
- `wf-quick fix`, `hotfix`, `refactor`, `simplify`, `update-deps`
- `wf instrument`, `experiment`, `benchmark`, `profile`
- `wf-meta build-pipeline`

Exit: Codex can execute the full engineering loop.

### Phase 7: Native Codex Handoff and Release

Handwrite:

- `wf handoff`
- `wf ship`
- `wf retro`
- `wf-meta announce`

Preserve all explicit confirmation and external-output gates.

Exit: Codex can complete the full lifecycle.

### Phase 8: Cutover

1. Point the Codex plugin only at handwritten native skills and hooks.
2. Fully remove `.codex-generated`, the Claude plugin's `.codex-plugin`,
   `.codex-plugin.overrides.json`, wrapper generators, wrapper tests, wrapper
   build wiring, and generated-Codex documentation.
3. Remove the legacy `sdlc-workflow` entry from the Codex repo marketplace.
4. Keep `sdlc-workflow-codex` as the only Codex repo-marketplace entry.
5. Update README and docs to describe host-separated plugins with one shared
   hub.
6. Add a regression gate that rejects generated Codex packaging or duplicate
   Codex marketplace exposure.
7. Retain rollback releases and additive artifact compatibility.

Exit: the native Codex plugin is the only Codex execution path.

## Test Strategy

### Shared Hub Tests

Required:

1. No hub + Claude SessionStart -> Claude starts shared hub.
2. No hub + Codex SessionStart -> Codex starts shared hub.
3. Claude-started hub + Codex SessionStart -> same PID is adopted.
4. Codex-started hub + Claude SessionStart -> same PID is adopted.
5. Different plugin package versions + same runtime build -> same PID is
   adopted.
6. Healthy compatible hub + different bundled runtime build -> existing hub is
   adopted and drift is reported, not restarted.
7. Dead hub PID -> either host recovers it.
8. Missing/corrupt active runtime -> clear recovery diagnostic.
9. Explicit runtime upgrade succeeds and retains registry.
10. Failed runtime upgrade rolls back.
11. Starter plugin cache removed -> active hub still renders/heals.
12. Both hosts authenticate registry upserts through the same PID token.
13. Simultaneous Claude and Codex SessionStart -> exactly one hub PID and one
    valid active-runtime record.
14. Codex `startup`, `resume`, `clear`, and `compact` after successful
    activation -> activation work is not repeated.
15. Invalid or changed activation baseline -> exactly one new activation after
    hooks are trusted.

### Renderer and Heal Tests

- Both plugin payloads have identical renderer/runtime build IDs.
- A managed write under either host results in a hub render stamped with the
  active runtime `buildId` (the hub is the only renderer).
- Claude render then Codex render does not change `.last-render` build identity.
- Codex render then Claude render does not change `.last-render` build identity.
- A hook-emitted dirty signal never triggers render over the network; only the
  hub's reconcile tick renders (render-on-request stays rejected).
- The fallback render (no hub reachable) still resolves the renderer from the
  active runtime, not the plugin cache, and stamps the active `buildId`.
- The `9.63+` healer remains fresh after alternating hosts.
- Typed fragments behave identically.
- Free narrative fragments behave identically.
- Off-pipeline bootstrap rendering behaves identically.
- Current sibling YAML validation allowlist behaves identically.

### Cross-Host Workflow Tests

1. Claude intake -> Codex shape -> Codex plan -> Claude implement -> Codex
   verify -> Claude review -> Codex handoff.
2. Codex intake -> Claude shape -> Claude slice -> Codex plan -> Claude
   implement -> Codex verify.
3. Claude writes rich plan and narrative fragments -> Codex renders and
   continues.
4. Codex writes rich review and narrative fragments -> Claude renders and
   continues.
5. Both hosts attempt to mutate one slug -> lease prevents torn state.
6. Legacy workflow with only current invocation fields resumes in Codex.

### Native Codex Tests

- every public Claude router reference has a handwritten Codex counterpart
- every review dimension exists in Codex
- all seven review aggregates behave equivalently
- no Codex skill reads Claude skill prose at runtime
- no generated Codex wrapper is required
- no packaged Codex `imagegen` skill exists
- every skill has valid `agents/openai.yaml`
- every root reference used by a skill resolves from the installed cache
- Codex hook trust flow works
- changed hooks require re-trust before the new activation baseline runs
- SessionStart activation record is atomic and once-only
- hook stdin, matchers, outputs, exit codes, timeouts, and Windows commands
  match the documented Codex contract
- one PostToolUse dispatcher sequences verify -> auto-stage -> emit render signal
  (render is NOT run inline)
- verification failure skips auto-stage and the render signal and returns
  corrective feedback
- a `Stop`/`SubagentStop` violation blocks with a repair continuation and the
  next turn converges the artifact to a valid final state
- the Stop-time repair loop is bounded — after the repair ceiling it surfaces a
  hard failure instead of re-prompting forever
- Codex `apply_patch` post-write validation works
- the capability parity ledger gate fails when one host's `contractVersion` is
  ahead of the other's `verifiedContractVersion` (proven in both directions)

### Packaging Tests

- Claude plugin installed alone
- Codex plugin installed alone
- both host-native packages installed through their respective host
  distribution mechanisms
- Codex repo marketplace exposes only `sdlc-workflow-codex`
- legacy generated Codex package paths and generation code are absent
- either uninstalled while shared hub is running
- fresh marketplace cache
- Codex plugin update, new-thread pickup, changed-hook re-trust, and activation
- minimum Codex CLI `0.139.0` accepted and older versions rejected clearly
- Windows, Linux, macOS
- paths containing spaces
- no runtime `npm install`

### Existing Core Regression Gates

Retain and extend the current gates:

- build freshness
- doc-site verification
- unit tests
- hook tests
- renderer snapshots
- fragment determinism
- fragment verifier
- renderer e2e acceptance
- hub and registry tests
- heal-render tests
- off-pipeline bootstrap tests

Do not restore the removed router migration verifier.

## Release Strategy

### Version Model

Track three identities separately:

```text
Claude plugin version
Codex plugin version
shared runtime version + build ID
```

Only the shared runtime identity controls:

- shared hub compatibility
- renderer freshness
- stale-render healing
- shared daemon/tray stale state

### Release Invariant

For a shared-runtime release:

```text
Claude runtime manifest == Codex runtime manifest
Claude runtime build ID  == Codex runtime build ID
```

The native Codex plugin may lag in handwritten command coverage during
development, but it must never claim compatibility with a runtime payload it
does not actually carry.

### Rollout

1. Shared-hub lifecycle and joint-startup-lock preview
2. Codex-only and Claude-only hub startup preview
3. Trusted-hook activation and serialized PostToolUse preview
4. Cross-host read/recovery alpha
5. Planning/artifact beta
6. Mutating/review beta
7. Full lifecycle release candidate
8. Remove legacy generated Codex packaging and marketplace exposure
9. Stable native Codex release

### Rollback

- keep the prior machine runtime build
- keep additive artifact compatibility
- keep legacy health/version aliases during transition
- make runtime upgrade explicit and reversible
- never destructively migrate `.ai/workflows`

## Risks and Mitigations

### Risk: Host Package Versions Restart the Shared Hub

Mitigation:

- remove package version from hub adoption identity
- use shared hub name, protocol, runtime version, and build ID
- adoption-first SessionStart behavior

### Risk: Stale-Render Healing Thrashes Between Hosts

Mitigation:

- stamp shared runtime build identity into `.last-render`
- render through the active machine runtime
- compare heal state to active runtime build, not plugin package

### Risk: Starter Plugin Is Removed

Mitigation:

- run hub and renderer from immutable `~/.sdlc/runtime/<buildId>`
- retain active and rollback builds

### Risk: Shared Runtime Copies Drift

Mitigation:

- byte/hash parity checks
- identical runtime manifests
- release gate on shared runtime build ID

### Risk: Handwritten Skills Drift

Mitigation:

- reference-name parity checks (catch added/removed capabilities)
- the **Cross-Host Capability Parity Ledger** + bidirectional release gate (catch
  *behavioral* drift under an unchanged name, in both directions)
- shared artifact fixtures keyed to `contractVersion`
- cross-host behavioral conformance tests
- no body-hash or router-metadata maintenance

### Risk: Codex Pre-Write Validation Is Weaker

Mitigation:

- best-effort pre-tool validation
- deepest on-disk post-tool audit with explicit corrective feedback
- explicit managed-artifact validation before command completion
- complete the invalid-write recovery design before enabling post-tool policy

### Risk: Concurrent Post-Tool Hooks Race

Mitigation:

- register one Codex PostToolUse dispatcher
- sequence verify then auto-stage; render is delegated to the hub via a dirty
  signal, not run in the dispatcher
- skip auto-stage and the render signal after verification failure
- deduplicate overlapping processing within a turn

### Risk: SessionStart Repeats Activation

Mitigation:

- atomically record activation under `${PLUGIN_DATA}`
- key activation to plugin, hook contract, and bundled runtime baseline
- make repeated SessionStart sources return without repeating completed work
- treat genuine hub recovery separately from activation

### Risk: Claude and Codex Start the Hub Simultaneously

Mitigation:

- jointly design one shared host-neutral startup/recovery lock
- require both host adapters to use it
- atomically publish active runtime and PID state only after readiness
- test simultaneous activation on all supported platforms

### Risk: Concurrent Host Mutation

Mitigation:

- workflow mutation leases
- atomic artifact/index writes
- coordinator-only final mutation

### Risk: Uneven Plugin Updates

Mitigation:

- adopt healthy compatible active hub
- report runtime drift
- use active runtime for rendering
- upgrade explicitly with rollback
- never downgrade implicitly

## Settled Decisions

1. `sdlc-workflow-codex` is the shipping native Codex rewrite.
2. It remains separately installable from `sdlc-workflow`.
3. Codex orchestration is handwritten.
4. Both plugins carry the same named shared hub/runtime payload.
5. Either plugin starts the hub when absent.
6. Either plugin adopts a healthy compatible hub started by the other.
7. A healthy compatible hub is not restarted merely because another host or
   plugin package version invoked the lifecycle.
8. The hub runs from a machine-wide immutable runtime store.
9. `.ai` artifacts, `.ai/_view`, `~/.sdlc` registry, and hub are shared.
10. Renderer/heal identity uses shared runtime build identity.
11. Current `9.70.0` runtime behavior is the baseline.
12. Removed router-migration metadata and verification stay removed.
13. Generated Codex wrappers are removed after native parity.
14. Codex distribution targets the repo marketplace.
15. The Codex repo marketplace exposes only `sdlc-workflow-codex`.
16. The legacy generated Codex package and related generation code are fully
    removed at cutover.
17. Users are expected to review and trust all bundled Codex hooks.
18. Codex activation occurs on first trusted SessionStart and is enforced as
    once per installed baseline.
19. Codex uses one serialized PostToolUse dispatcher that sequences
    verify → auto-stage → emit dirty render signal (no inline render), and
    retains current auto-stage behavior.
20. Minimum supported Codex CLI version is `0.139.0`.
21. Codex does not package a duplicate `imagegen` skill.
22. The superseded handwritten prototype (eight verb-named `sdlc-*` skills, the
    `workflow-state` JSON continuity model, `.ai/codex-workflows`, and
    `MIGRATION.md`'s no-router framing) is removed; router-name parity (`wf`,
    `wf-quick`, `wf-meta`, `wf-design`, `wf-docs`, `review`) is the taxonomy.
23. The interop requirement is both async shared `.ai` artifacts (a) AND a
    concurrent shared singleton live hub (b).
24. The shared hub is a trusted machine-wide component; a hub or runtime whose
    runtime version matches is never reaped, restarted, or replaced except under
    an explicit upgrade on a genuine mismatch, or for true unhealth.
25. Rendering is owned by the hub. Hooks emit a filesystem-local dirty signal;
    the hub's bounded reconcile/heal loop renders from the active runtime; render
    is never triggerable over the network.
26. Cross-host capability parity is enforced bidirectionally by the capability
    parity ledger + release gate, not by a revived router body-hash.
27. The Codex enforcement boundary is the `Stop`/`SubagentStop` managed-artifact
    verification pass; parity is defined on the final on-disk + view state, not on
    enforcement timing.
28. The cross-host startup/recovery lock is a gating, Windows-first research
    spike that must pass simultaneous-activation tests before the rest of
    Workstream C is built on it.

## Open Implementation Decisions

Resolve during Phase 0-2:

1. Exact runtime manifest schema and build-hash inputs.
2. Exact machine runtime garbage-collection policy.
3. Whether explicit hub upgrade is exposed through tray, CLI, `wf-meta`, or all
   three.
4. Protocol compatibility rules for future hub protocol versions.
5. Mutation lease timeout and stale-recovery audit shape.
6. Whether host-neutral `next-action` fields ship in the first native release
   or a later additive release.
7. Exact runtime source extraction timing.
8. Invalid-post-write recovery *mechanics* only — the enforcement boundary is
   resolved (the `Stop`/`SubagentStop` block-continuation pass). Open: leave-on-
   disk vs. pre-tool snapshot, the exact repair-ceiling value, and partial
   multi-file rich-artifact handling during a turn.
9. The cross-host startup/recovery lock *primitive* — the approach is resolved
   (one shared host-neutral lock, gating Windows-first spike). Open: the exact
   `wx`-open primitive + Windows-safe atomic-replace pattern and the stale-lock
   takeover protocol.

## Definition of Done

The rewrite is complete when:

- `plugins/sdlc-workflow-codex` is a complete native Codex plugin
- all current routers, references, review dimensions, aggregates, independent
  skills except `imagegen`, and command capabilities are preserved
- no Codex execution path reads or translates Claude prompt prose
- Codex works with no Claude plugin installed
- Claude works with no Codex plugin installed
- either plugin starts the shared hub when absent
- either plugin adopts the same healthy hub started by the other
- alternating hosts does not restart the hub or thrash stale-render healing
- both packages carry an identical verified shared runtime payload
- the active hub and renderer do not depend on either plugin cache
- both hosts read and write the same current artifact model
- typed fragments, free narrative fragments, off-pipeline rendering, sibling
  YAML validation, and current views behave identically
- cross-host workflow and concurrency tests pass
- no runtime dependency installation is required
- generated Codex wrappers are no longer the Codex execution path
- generated Codex wrappers, packaging, generation code, tests, and marketplace
  exposure are removed
- the Codex repo marketplace exposes only `sdlc-workflow-codex`
- Codex CLI versions older than `0.139.0` receive a clear unsupported-version
  diagnostic
- users have trusted all bundled hooks and first trusted SessionStart activates
  the installed baseline once
- repeated SessionStart events do not repeat completed activation
- one serialized PostToolUse dispatcher verifies before auto-stage and before
  signaling the hub to render; the hub is the sole renderer and stamps the active
  runtime `buildId`
- the `Stop`/`SubagentStop` verification pass converges Codex's final on-disk and
  view state with Claude's, with a bounded repair ceiling
- the bidirectional capability parity ledger gate is green (no host's
  `contractVersion` is ahead of the other's verified version)
- the superseded handwritten prototype is removed and the surface is router-name
  parity
- simultaneous Claude and Codex activation produces one shared hub

## Recommended First Vertical Slice

Implement the shared-hub foundation before rewriting the full command surface:

1. Rebaseline and test current Claude `9.70.0`.
2. Add shared runtime manifest and build identity.
3. Refactor hub, renderer, heal, serve, and tray identity away from package
   version.
4. Add machine-wide immutable runtime materialization (Windows-safe replace).
5. **Land the cross-host startup/recovery lock — the gating long pole.** Prove
   simultaneous-activation and startup-vs-upgrade safety Windows-first, then
   Linux/macOS, before building the rest of the lifecycle on it. Budget this as a
   research spike, not a step.
6. Make Claude SessionStart adoption-first and route its bootstrap render through
   the hub.
7. Package the exact shared runtime into `sdlc-workflow-codex`.
8. Add native Codex SessionStart once-only activation and shared hub adoption.
9. Add the complete Codex hook wire contract: the verify → auto-stage →
   render-signal PostToolUse dispatcher plus the `Stop`/`SubagentStop`
   enforcement pass.
10. Prove both startup directions and simultaneous activation retain the same
    hub PID, and that a write under either host yields one hub render at the
    active `buildId`.
11. Handwrite `wf-meta status`, `resume`, `next`, and `sync`.
12. Prove Claude-created workflow -> Codex resume -> same view/hub, and the
    reverse.

This validates the two hardest requirements — the cross-host lock and single-
renderer identity — before the large handwritten router rewrite begins.

## Codex Documentation References

- Codex hooks: https://developers.openai.com/codex/hooks
- Build Codex plugins: https://developers.openai.com/codex/plugins/build
- Codex skills: https://developers.openai.com/codex/skills
- Migrate to Codex: https://developers.openai.com/codex/migrate
- Codex subagents: https://developers.openai.com/codex/subagents
