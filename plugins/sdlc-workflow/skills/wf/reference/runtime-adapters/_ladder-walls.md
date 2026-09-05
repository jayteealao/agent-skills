# Constraint-resolution ladder — per-wall rung lists (`runtime-adapters/_ladder-walls.md`)

Load this file from [_ladder.md](_ladder.md) when a wall matches one of these classes. Climb the rungs in order and record the rung reached.

### Web UI (no dev-browser / viewport pinned / no display)
0. **Bootstrap (only if the plan authorized it):** a jsdom + Testing-Library stack does no layout and stubs `matchMedia`, so responsive/visual ACs are genuinely unverifiable there. If the plan's `## Verification Strategy` named a real browser driver (Playwright/Cypress) for this AC, install it now per that authorization. If no driver was planned, do **not** improvise one — fall to a `stack:`-listed tool or defer, and record the planning gap.
1. Playwright with explicit `viewport` + `deviceScaleFactor` — handles responsive / 375px directly.
2. Device-metrics emulation (CDP `Emulation.setDeviceMetricsOverride`) *if the available browser tool exposes it* — forces viewport + `matchMedia`. Do not assume an in-session browser MCP can resize; verify the affordance or fall back to rung 1.
3. Component / interaction test (Testing Library + jsdom) for DOM / role / focus assertions — never for layout or media-query behavior.
4. Snapshot / visual-regression (Playwright screenshots, Percy-style diff).
5. **Residual only:** genuinely perceptual judgments → operator session, pre-registered deferral.

### Android (no device / emulator)
1. Robolectric — unit + Compose interaction (gesture dispatch, callback wiring, state machines).
2. Roborazzi — device-free screenshot goldens (visual fidelity, layout, theming).
3. Boot an AVD **headless** (`emulator -avd … -no-window -gpu swiftshader_indirect`) → instrumented + Maestro flows. No display is needed; screenshots come from the framebuffer via `adb exec-out screencap`. This rung is only unreachable when *headless* boot fails (no KVM/HAXM/WHPX), not when there is no window.
4. Real device drive (live pointer routing, multi-touch, wall-clock timing).
5. **Residual only:** hardware-specific (true pinch, hover, signed build) → pre-registered deferral.

### Backend / service (no live creds)
1. Local emulator suite (Firebase / Firestore emulator) — exercises the **real query path**, catching missing-index / rules defects that mocks hide.
2. Testcontainers for other datastores.
3. Contract tests against recorded fixtures for third-party APIs.
4. **Residual only:** genuinely creds-gated live path (prod OAuth, real third-party session) → pre-registered deferral.
5. **Rule:** a mocked integration test never satisfies a user-observable AC *about that integration* — climb to an emulator / testcontainer rung before `pass`.

### Deploy-time-only (build-inlined config, one-time migrations)
1. Pre-deploy proxy assertion (a static check that the build inlined the value, or the migration script is correct against a fixture DB).
2. Register a **post-deploy probe** as a deferral with `cleared-by: null`.
3. For PO-accepted residual risk, use a named ship-override authorization — never overload `cleared-by` with a prose risk-acceptance string.

### Auth-gated runtime (login wall / admin gate / OAuth-linked account)
1. **Test-credential seeding** — an E2E user in the auth emulator or `.env.test`, plus a seeded
   data snapshot the flows can rely on. Provisioning the seed is a plan-authorized deliverable,
   not a verify-time improvisation.
2. **Emulator wiring as a debug build variant** — `connectFirestoreEmulator` / `useEmulator` in a
   debug source set: a *planned* deliverable (the plan's force-scope rule scopes it), never
   improvised at verify.
3. **Injected-session harness** — a test rule that injects auth state and scripts the gated
   trigger (e.g., a WorkManager test rule with injected auth driving a sync against the emulator
   snapshot).
4. **Residual only:** genuinely live-account behavior (real OAuth consent, third-party rate
   limits) → pre-registered deferral.

### Inbound-callback (an external service must reach a routable endpoint)
1. **Dev tunnel** — `ngrok` / `cloudflared` exposing the local server to the live external
   service. The plan naming the tunnel in `## Verification Strategy` is the consent gate (same
   trust model as pre-authorized tool installs); record the tunnel URL + lifetime in the verify
   artifact and tear the tunnel down before the stage ends.
2. **Protocol-mode swap** where the platform offers one — e.g., a webhook→polling switch for the
   drive, restoring the real mode afterward.
3. **Recorded-callback replay** — capture one real callback, then replay the signed payload
   against the local endpoint.
4. **Residual only:** delivery-side observation only the live platform can show → pre-registered
   deferral.

### Infra-prerequisite (evidence needs a service that does not exist yet)
1. **Provision the dependency as a verify step** when the plan authorized it — a free-tier TURN
   relay via coturn/Metered, a staging deploy via the ship-plan's pipeline. Rung-0-style
   pre-authorized bootstrap, extended from tools to *services*.
2. **Containerized stand-in** — a local coturn (or equivalent) in docker-compose.
3. **Residual only:** a deferral naming the provisioning slice the force-scope rule pushed into
   scope — never a bare "infra missing".

**Staging deploy is a legitimate verify rung, not a ship act.** When `.ai/ship-plan.md` defines a
non-prod environment, verify may deploy there to produce evidence — the External Output Boundary
applies, and the deploy target is recorded in the verify artifact.
