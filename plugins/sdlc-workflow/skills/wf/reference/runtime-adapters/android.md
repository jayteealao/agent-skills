# Adapter: `android`

## Detection signals
- `AndroidManifest.xml` anywhere in the repo
- `build.gradle` / `build.gradle.kts` with `com.android.application` plugin
- `gradlew` / `gradlew.bat` at repo root
- `app/src/main/java/` or `app/src/main/kotlin/` layout

## Bootstrap
1. **Probe for a connected device or running emulator** — `adb devices`. If any device shows `device` status, skip to step 3.
2. **Boot an emulator (headless by default)** — list available AVDs with `emulator -list-avds`. If at least one exists, boot the first one **headless** in the background: `emulator -avd <name> -no-window -no-audio -no-boot-anim -gpu swiftshader_indirect -no-snapshot-load &`. The `-no-window` + software-GPU flags let the emulator boot with **no display** (essential when driving from a background subagent, an SSH/CI host, or any session without a desktop) — screenshots are still captured from the framebuffer (see Observe). Drop `-no-window` only when you want a visible window AND a display is attached. Wait for `adb wait-for-device`, then poll `adb shell getprop sys.boot_completed` until it returns `1` (timeout 90 seconds). If the boot never completes, run `emulator -accel-check` and capture its output — a headless boot that fails here is the *genuine* wall (no KVM/HAXM/WHPX hardware acceleration), distinct from "no display".
3. **Build and install the app** — `./gradlew installDebug` (or the project's equivalent). Resolution attempt before failing: if `installDebug` fails on signing or stale dex, try `./gradlew clean installDebug` once.
4. **Launch the app** — `adb shell am start -n <package>/<launcher-activity>` (read package + activity from `AndroidManifest.xml`).

## Enumerate
Inventory destinations **before** driving (see the enumeration ladder in [_protocols.md](_protocols.md)).
1. **Recipe rung** — read the navigation model: `NavHost` composable destinations, the route enum / sealed class, the bottom-nav or drawer roster, and `AndroidManifest.xml` exported activities plus deep-link intent filters.
2. **Static rung** — no central graph: grep for `composable(` / `startActivity(` targets and collect destination literals.
3. **Traversal rung** — drive from launcher, `adb shell uiautomator dump` at each state, and record distinct screens reached. The count is a FLOOR.
Note whether a destination is a tab root or a detail route — a tab that maps to another tab's root is a product observation, not a defect.

## Drive

**Climb the Android ladder — device-free rungs first.** Before booting an emulator or driving Maestro, cover what the device-free rungs can: **Robolectric** for unit + Compose-interaction ACs (gesture dispatch, callback wiring, state machines) and **Roborazzi** for device-free screenshot goldens (visual fidelity, layout, theming). Climb to an AVD + Maestro / instrumented run only for what those cannot reach (live pointer routing, multi-touch, wall-clock timing), and to a real device for hardware-specific behavior. "No emulator/device available" *caps* the climb — it is not a license to skip the device-free rungs that **do** run on this host.

- **Preferred — Maestro flows.** If `maestro/` directory or any `*.maestro.yaml` files exist, run them: `maestro test <flow>.yaml`. Maestro provides built-in assertions: `assertVisible`, `assertNotVisible`, `assertText`.
- **Fallback — adb input commands.** If no Maestro flows exist for the surface being driven, use:
  - `adb shell input tap <x> <y>` for taps
  - `adb shell input text "<string>"` for text entry
  - `adb shell input keyevent <code>` for hardware keys (HOME=3, BACK=4, etc.)
  - `adb shell input swipe <x1> <y1> <x2> <y2> <duration-ms>` for swipes
- **Optional — generate Maestro flow from probe target.** If a probe target describes a navigation flow and no Maestro flow exists, the probe MAY synthesize one inline (write to `<evidence-dir>/generated-<descriptor>.maestro.yaml` and run it). Do not commit synthesized flows; they are evidence, not source.

## Observe
- **Screenshots** — `adb exec-out screencap -p > <evidence-dir>/<slug>.png` (preferred — reads the framebuffer directly, so it works on a **headless** emulator with no window and skips the `/sdcard` round-trip). The older `adb shell screencap /sdcard/<slug>.png && adb pull …` form also works and is window-independent too. **Read the screenshot** to confirm the expected visual state.
- **Logcat** — `adb logcat -d *:E` filtered to the app's package (`--pid=$(adb shell pidof <package>)`). Capture errors only by default; capture full output (`*:V`) when investigating a crash.
- **Maestro test reports** — Maestro writes to `~/.maestro/tests/` by default; copy the relevant run report into evidence.
- **Maestro assertions** — `assertVisible`, `assertNotVisible`, `assertText` produce structured pass/fail in the test output; capture and quote them.

## Perturb
Break exactly one dependency, re-observe, restore (see the perturbation protocol in [_protocols.md](_protocols.md)).
- **Offline** — `adb shell cmd connectivity airplane-mode enable`, re-observe, then `... disable`. Always restore.
- **One collection unreadable** — where the harness owns the backing rules/fixtures, deny a single collection and leave the rest readable. Never mutate rules the run does not own.
- **Backing service down** — stop a harness-started local emulator/service, not a process the run did not start.
The canonical catch: a screen whose local-only state dies with an unrelated remote read.

## Tear down
- If this run booted the emulator (i.e., none was running at bootstrap), shut it down: `adb emu kill`.
- If this run installed the app, leave it installed — uninstalling between runs would slow re-runs and the install is idempotent.
- Pull any captured screenshots off `/sdcard/` and delete them: `adb shell rm /sdcard/<slug>.png`.

## Evidence layout
```
<evidence-dir>/
  <criterion-or-target-slug>.png            # screenshot
  <criterion-or-target-slug>.logcat.txt     # filtered logcat
  <criterion-or-target-slug>.maestro.txt    # maestro run output (if used)
  generated-<descriptor>.maestro.yaml       # synthesized flow (probe only)
```

## Remediation hints
- `adb devices` empty AND no AVDs → "Install at least one Android Virtual Device via Android Studio's AVD Manager, or connect a physical device with USB debugging enabled."
- Emulator boot hangs / never reaches `sys.boot_completed` from a background subagent or headless host → this is almost always a **windowed** boot with no display, not a missing emulator. Re-boot with the headless flags (`-no-window -gpu swiftshader_indirect`); do NOT record "no display" as a deferral until the *headless* boot has itself been tried.
- Headless boot still fails → run `emulator -accel-check`. If it reports no hardware acceleration (no KVM on Linux, no HAXM/WHPX on Windows/Intel, no Hypervisor.framework on macOS), *that* is the genuine wall: a nested-virtualization-less host cannot boot any emulator. Record the `-accel-check` output as the capability probe and defer the AVD rung's residual — the device-free rungs (Robolectric, Roborazzi) still run and must be climbed first.
- `installDebug` fails → "Run `./gradlew assembleDebug` manually to see the build error. Common causes: missing signing config, expired Gradle cache, network failure fetching dependencies."
- App crashes on launch → "Probe captured the crash in logcat; the runtime probe cannot proceed past launch. Treat as a high-severity finding."

## Skill catalog hints

These session-level skills/MCP servers complement the android adapter. Surface them as candidates when matched in `stack.available-skills` / `stack.available-mcp`; the PO picks during shape. None are required.

- **`android-cli`** — orchestrates project creation, deployment, SDK management, and environment diagnostics via the `android` CLI. Good companion when bootstrap (AVD, SDK paths) is shaky.
- **`lazylogcat`** — non-interactive logcat capture, filter by package/tag/text, programmatic parsing. Prefer over raw `adb logcat` when criteria need structured log evidence.
- **`adaptive`** — Compose multi-form-factor (phone/tablet/foldable/desktop/TV/Auto/XR) UI guidance. Surface when the work touches layouts that may render across window sizes.
- **`migrate-xml-views-to-jetpack-compose`** — workflow for converting XML views to Compose. Surface when both `ui: [xml-views]` and `ui: [compose]` appear in `stack:`, or when the PO mentions migration.
- **`testing-setup`** — installs unit/UI/screenshot/E2E test infra. Surface when `stack.testing` is thin or empty.
- **`perfetto-trace-analysis`** + **`perfetto-sql`** — when criteria involve latency, jank, or memory investigation against a captured trace.
- **`edge-to-edge`**, **`styles`**, **`navigation-3`** — narrower Compose surface migrations; surface only when the intake/shape narrative mentions the area.
- **`agp-9-upgrade`**, **`r8-analyzer`**, **`play-billing-library-version-upgrade`**, **`engage-sdk-integration`**, **`camera1-to-camerax`**, **`appfunctions`**, **`display-glasses-with-jetpack-compose-glimmer`** — specialist skills; surface only when intake names the matching domain.

The matching rule: a hint is *relevant* if (a) the skill name appears in `stack.available-skills`, and (b) the intake/shape narrative or `stack:` block mentions a signal the skill targets. Skip a hint silently rather than suggesting an irrelevant tool.
