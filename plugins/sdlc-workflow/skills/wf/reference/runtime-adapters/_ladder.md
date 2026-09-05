# Constraint-resolution ladder (`runtime-adapters/_ladder.md`)

Load this file with the registry, [../runtime-adapters.md](../runtime-adapters.md), before any deferral. The per-wall rung lists are in [_ladder-walls.md](_ladder-walls.md).

## Constraint-resolution ladder (climb before deferring — MANDATORY)

A user-observable AC asserts runtime behavior, so it requires runtime (or device-free runtime-proxy) evidence — static or truth-table reasoning never satisfies it. When the obvious path is blocked (no device, viewport pinned, no live creds, no display), do **not** jump to a deferral or rationalize a `pass`. Climb the ladder for the AC's class, record the highest rung that holds, and defer **only** the residual that no rung can reach — naming every rung tried in the defer-reason. "No emulator" is not a defer-reason; "no emulator → Robolectric covers the state machine (9/9), Roborazzi covers the visual, AVD boot failed (HAXM unavailable), residual = live multi-touch routing" is.

**Classify the wall before you climb it (wall-ownership triage — the MANDATORY first move).** A
ladder climb answers "what other rung can produce this evidence?" — but that is only the right
question when the wall genuinely belongs to the environment. Before climbing, answer one question and
record the verdict: **would a change to code in THIS repo dissolve this wall?**

- `code-owned` — the repo's own source pins the constraint: a hard-coded host/port/endpoint in a
  debug source set, a fixture uid production rules reject, a harness that reads config from exactly
  one env-var name, a build flag with no override. The wall wears an environmental costume ("the port
  is held", "the service is unreachable") while its cause is a literal in your tree.
- `environment-negotiable` — the environment supplies the capability and the run may reconfigure it:
  a harness-owned port, a boot mode not yet chosen (headless), an AVD that exists but is not started,
  a provisioning script the repo ships and nobody ran.
- `external` — genuinely outside the run's authority: another user's process, a third-party account,
  hardware the host lacks, a real OAuth consent.

**A `code-owned` wall may NOT be deferred until the repo-change option has been surfaced as a
decision.** It is not an environment wall; it is unfinished verifiability work wearing one's clothes,
and deferring it re-pays the cost every slice while the cure sits unwritten. Route it three ways —
scope the change in this slice, scope it as a prerequisite slice/harness, or record an explicit PO
decline (`harness-declined: <reason>`). One slug stacked five slices of live evidence behind "host
port 8080 is held by another process" while its own debug build hard-coded `const FIRESTORE_PORT =
8080`; reading that port from the debug preference the emulator toggle already used would have
dissolved every one of those deferrals. The same slug had *already* made exactly this fix for its
backend tests — the wall stood only where the code felt out of bounds, which is a scoping decision
plan owns, not a taboo verify should enforce in silence.

Record the verdict as `wall-ownership:` on the deferral (verify) and in the per-AC
`constraint-resolution:` line (plan). This is not bookkeeping — it decides which playbook runs.
Symptom-first triage ("probe failed → find another rung → defer") answers the wrong question when the
true answer was "fix our own constant."

**Declare incapability only over a probe (attempt-before-declare).** Before writing that the
environment lacks a capability — credentials, a device, a keyed service — *execute* a cheap
capability probe and record its literal command + output tail: `firebase projects:list` /
`gcloud auth application-default print-access-token` for deploy creds, `adb devices` for devices,
an env-var presence check for keyed services, one spec run past the guard for credential-gated
suites. A claimed incapability with no recorded probe is invalid. Read-only introspection is
always allowed unprompted; probes that consume quota or send traffic follow the pre-authorization
rule below. And when an interactive suite runs but every spec exits via a credential/environment
guard (0 executed), that is `blocked-runtime-evidence-missing` with the unmet precondition
named — never a deferral.

**"No display" is not incapability for a headless-capable adapter — boot headless first.** A
windowing surface is a *boot mode*, not a prerequisite. An Android emulator boots with `-no-window`
+ a software GPU, an iOS simulator's *runtime* boots via `xcrun simctl boot` with no `Simulator.app`
window, and a Linux GUI app runs under `xvfb-run`'s virtual framebuffer — and in every case the
screenshot comes from the framebuffer (`adb exec-out screencap`, `xcrun simctl io booted
screenshot`, Xvfb capture), never from a visible window. So a background subagent or CI host with no
attached display has **not** reached the residual rung; it has hit a boot-flag choice it never made.
"No display" is a lawful defer-reason ONLY after the adapter's own **headless** boot mode has been
attempted and its probe output recorded — and the wall it exposes is missing hardware acceleration
(`emulator -no-window` failed because no KVM/HAXM/WHPX nested virtualization), never the missing
window. Attempt-before-declare (above) applies unchanged: the headless invocation *is* the probe.

**Tool absence is not a terminal state — but the fix is *pre-authorized upstream*, never an improvised verify-time install.** The verification tool is named at `slice` (the per-AC `verify:` stub) and engineered at `plan` (`## Verification Strategy`), so by the time verify runs, any install/bootstrap a criterion needs is a step the PO already approved. Verify **executes** that authorized bootstrap (the plan said "install Playwright for AC-8" → verify installs it and drives) — it does **not** silently introduce a *new* tool the plan never named, which still routes back through shape (the PO owns tooling choices). If an AC needs a tool that was never planned and none is installed, that is the upstream gap this whole chain exists to prevent: use a `stack:`-listed alternative if one genuinely covers the AC, otherwise register an honest deferral **and** flag the missing verification plan so it is fixed at the source. The cure is to *plan* the tool; the ladder is how you climb once it is planned.

**Negotiate the environment before declaring it (the env-remediation rung).** Between "the adapter's
rungs are exhausted" and "register a deferral" sits one more move the ladder always permitted but
never named: change the environment's *configuration* until a rung becomes reachable. Its boundary is
**authority, not effort** — the question is never "is this hard?" but "is this mine to change?"

Allowed unprompted (reversible, run-scoped, nobody else's state):
- **Rebind a harness-owned service to a different port when the default is taken, and RECORD the
  port.** A Firebase emulator suite on 8081 produces the same evidence as one on 8080. Never defer
  over a port the run itself binds.
- Boot the headless mode the adapter documents; start an AVD/simulator that already exists.
- Run a provisioning script the repo already ships (`scripts/create-*-avd.ps1`, a seed script).
- Execute an install/bootstrap the plan's `## Verification Strategy` already authorized.

NOT allowed without an explicit decision — surface it, do not improvise:
- **Killing, stopping, or restarting a process the run did not start.** Another user's server holding
  a port is not the run's to reclaim, however convenient the port.
- Mutating host or system configuration: port-forward rules, hosts file, firewall, service
  registration — anything requiring elevation or outliving the run.
- **Editing product code to make evidence collectible.** That is real work with real review needs: it
  routes through the `code-owned` wall rule above (scope in-slice, scope a prerequisite, or decline on
  the record), never an improvised verify-time patch.
- Introducing a tool the plan never named (unchanged from the tool-absence rule above).

Remediation is recorded exactly like a rung — what was attempted, what it changed, what it cost. A
deferral that names no attempted remediation is as incomplete as one that names no rung. And note the
asymmetry this rung exposes: a port is negotiable when the *harness* dials it and `code-owned` when
the *binary under test* hard-codes it. Same symptom, different playbook — which is why the ownership
triage runs first.

Per-wall rung lists (web UI, Android, backend, deploy-time, auth-gated, inbound-callback, infra-prerequisite): [_ladder-walls.md](_ladder-walls.md).

Both `wf-verify` (per-slice gate) and `/wf probe` (slug-wide sweep) climb this ladder. `plan`'s `## Verification Strategy` records, per AC, the rung it expects to reach and what must be built to get there; `verify` executes against that plan and records the rung actually reached.
