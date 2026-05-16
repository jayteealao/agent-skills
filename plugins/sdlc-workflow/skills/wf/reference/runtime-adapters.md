# Runtime Adapter Registry

Per-platform driving recipes for runtime-truth verification. Both `wf-verify` (forward gate, per-slice interactive verification) and `wf-quick probe` (backward re-entry, slug-wide runtime sweep) read this file to decide how to bootstrap, drive, observe, and tear down the running artifact.

## How to consume this file

Each adapter section follows the same shape:

| Field | Purpose |
|---|---|
| **Detection signals** | Files, paths, or commands that indicate the project uses this platform. The adapter is "matched" when any signal is present. |
| **Bootstrap** | Ordered steps to bring the running artifact up. Each step is independently runnable. If any step fails after resolution attempts, the caller writes an `awaiting-environment` artifact (probe slice) or `result: blocked-runtime-evidence-missing` (verify) and stops, recording which step failed and the remediation hint. |
| **Drive** | How to perform user actions against the running artifact. |
| **Observe** | How to capture observable output (screenshots, page snapshots, stdout, HTTP responses, log scrapes). |
| **Tear down** | How to leave the environment clean after the run completes. |
| **Evidence layout** | Where the caller writes captured evidence files. |
| **Skill catalog hints** (optional) | Session-level skills/MCP servers that complement this adapter (e.g., `lazylogcat` for android logcat capture). Hints are *opt-in candidates*, not mandatory drivers — the PO picks during shape. |

## Stack fingerprint integration

Callers should re-use the `stack:` block written by `wf intake` Step 0.5 (and confirmed by the PO in intake Batch B) to short-circuit adapter selection. The contract:

1. If `stack.platforms` is present and `user-confirmed: true`, intersect it with available adapters to narrow the match set before running detection signals. Detection signals stay authoritative for *how* to drive; the fingerprint is just a fast filter for *which* adapters are in scope.
2. If `stack:` is missing or `user-confirmed: false`, fall back to running every adapter's detection signal against the repo as described below.
3. If `stack.available-skills` or `stack.available-mcp` names a session-visible helper that an adapter calls out under **Skill catalog hints**, surface that helper as a *suggested companion* — not a required tool. Record the PO's choice in the calling artifact (`verify` per slice, `probe` once per slug).

## Adapter selection (read by callers)

1. Run every adapter's detection signal against the repo.
2. Collect every adapter that matches. Multi-match (e.g., web frontend + CLI tool in one repo) is the common case, not an exception.
3. **Default — run all matched adapters in parallel.** The caller iterates over every matched adapter and aggregates observations into one report. Record `adapters-used: [<key>, ...]` (plural).
4. **Narrowing — `--adapter <key>` flag (probe only).** Restricts the run to a single matched adapter. Record `adapters-used: [<key>]` and `adapter-narrowed-by-user: true`.
5. The probe `target` string's *surface inference* layer (route names, screen names, command names, endpoint paths) refines which entry points to drive within each running adapter.

## Evidence protocol (shared across all adapters)

1. For each criterion or probe target, produce: a screenshot or output capture, a pass/fail determination, and a brief explanation of what was observed.
2. If a screenshot or capture shows unexpected behavior, describe exactly what is wrong.
3. Store evidence files in:
   - `verify`: `.ai/workflows/<slug>/verify-evidence/<slice-slug>/`
   - `probe`: `.ai/workflows/<slug>/probe-evidence/<descriptor>/`
4. Reference evidence files in the calling artifact's report.

## Accessibility checks (shared across all UI adapters)

- If an accessibility linter exists, run it on affected components.
- Check that new/modified interactive elements have appropriate ARIA attributes, labels, keyboard handling.
- Verify color contrast, focus indicators, and screen reader compatibility if tools are available.

---

# Adapter: `web`

## Detection signals
- `package.json` with a `dev` / `start` / `serve` script
- `vite.config.*`, `next.config.*`, `nuxt.config.*`, `astro.config.*`, `svelte.config.*`, `remix.config.*`
- Static HTML at repo root or under `public/`, `static/`, `dist/`
- `index.html` referencing JavaScript modules

## Bootstrap
1. **Probe for a running dev server** — `curl -sI http://localhost:<port>` against the project's documented port (read from config or `README.md`). If the server already responds, skip to drive.
2. **Start the dev server** — run `npm run dev` / `yarn dev` / `pnpm dev` (or the equivalent from `package.json scripts`) in the background. Wait for the server to bind (poll the port up to 30 seconds).
3. **Resolution attempts before failing:** if the start command exits non-zero, try `npm install` (or yarn/pnpm equivalent) once and retry the start. If that still fails, surface `bootstrap-failure: { step: dev-server-start, ... }`.

## Drive — candidate tools

The PO chose a driver during shape (from `02-shape.md` and the `stack:` block); use whatever they picked. The list below is a menu of candidates the shape question draws from, ordered roughly by *already-installed first*. Do not propose installing a new tool without going back through shape.

### 1. `dev-browser` (if installed or PO opted in)
Check if installed: `command -v dev-browser`. If not installed AND the PO did not select it during shape, skip this option — do not auto-prompt for installation here.

If available, dev-browser provides Playwright's full Page API in a sandboxed QuickJS runtime with persistent pages across scripts:

```bash
dev-browser --headless <<'SCRIPT'
const page = await browser.getPage("verify");
await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
// interact with the page
await page.click("button#submit");
await page.waitForSelector(".success-message");
// capture screenshot evidence
const buf = await page.screenshot();
await saveScreenshot(buf, "verify-criterion-name.png");
// get AI-friendly DOM snapshot for reasoning
const snapshot = await page.snapshotForAI();
console.log(JSON.stringify(snapshot));
SCRIPT
```

- Use **persistent named pages** (`browser.getPage("verify")`) to maintain state across multiple verification scripts (e.g., login once, then verify multiple pages).
- Use `page.snapshotForAI()` to get LLM-optimized DOM snapshots for reasoning about page structure.
- Screenshots are saved to `~/.dev-browser/tmp/` — copy them to the evidence directory.
- Use `--connect` flag instead of `--headless` if the user has a running Chrome with remote debugging enabled.

### 2. Chrome MCP tools (fallback)
If `mcp__claude-in-chrome__*` tools are available in the session:
- `mcp__claude-in-chrome__navigate` to load pages
- `mcp__claude-in-chrome__read_page` to inspect content
- `mcp__claude-in-chrome__computer` for interactions (click, type)
- `mcp__claude-in-chrome__get_page_text` to read page content
- `mcp__claude-in-chrome__read_console_messages` to check for errors
- `mcp__claude-in-chrome__read_network_requests` to verify API calls

### 3. Playwright directly
If configured in the project, run existing Playwright test suites or write inline scripts.

## Observe
- Screenshots via the driver's screenshot API; copy into the evidence directory.
- Browser console messages — check for errors after each interaction.
- Network requests — verify correct requests sent, responses received when the criterion involves API calls.
- DOM snapshots for AI-readable reasoning when supported (`page.snapshotForAI()`).
- Accessibility scan: axe-core via Playwright (`@axe-core/playwright`), eslint-plugin-jsx-a11y, or built-in browser accessibility audit.

## Tear down
- If this run started the dev server (i.e., it was not already running at bootstrap), terminate the background process.
- If `dev-browser --headless` was used, no extra teardown needed — its tmp directory self-prunes.
- Persistent named pages in dev-browser survive across verification scripts within the same run; they are not torn down between criteria.

## Evidence layout
```
<evidence-dir>/
  <criterion-or-target-slug>.png        # screenshot
  <criterion-or-target-slug>.console.log  # console output
  <criterion-or-target-slug>.network.json # network captures (if applicable)
```

## Remediation hints (surface in bootstrap-failure)
- `dev-server-start` failed → "Run `npm install` and try the dev script manually to see the underlying error."
- Port already in use → "Another process is bound to the dev port; stop it or run probe with the existing server (probe will detect and reuse it)."
- Build error during startup → "Run `npm run build` to surface the build-time error before retrying probe."

## Skill catalog hints

Surface these only if they appear in `stack.available-skills` / `stack.available-mcp` and the task touches the relevant area. None are required.

- **`frontend-design`** — when the work introduces a new UI surface and the PO wants design-quality output rather than a wired-up component.
- **`playground`** — when the deliverable is an interactive single-file explorer rather than a production-wired feature.
- **`claude-api` / `claude-code-guide`** — when the work involves the Anthropic SDK or Claude Code itself.
- **MCP browsers** (`mcp__Claude_in_Chrome__*`, `mcp__Claude_Preview__*`) — if available, these are session-native alternatives to dev-browser; surface alongside dev-browser as drive candidates.

---

# Adapter: `android`

## Detection signals
- `AndroidManifest.xml` anywhere in the repo
- `build.gradle` / `build.gradle.kts` with `com.android.application` plugin
- `gradlew` / `gradlew.bat` at repo root
- `app/src/main/java/` or `app/src/main/kotlin/` layout

## Bootstrap
1. **Probe for a connected device or running emulator** — `adb devices`. If any device shows `device` status, skip to step 3.
2. **Boot an emulator** — list available AVDs with `emulator -list-avds`. If at least one exists, boot the first one in the background: `emulator -avd <name> -no-snapshot-load &`. Wait for `adb wait-for-device`, then poll `adb shell getprop sys.boot_completed` until it returns `1` (timeout 90 seconds).
3. **Build and install the app** — `./gradlew installDebug` (or the project's equivalent). Resolution attempt before failing: if `installDebug` fails on signing or stale dex, try `./gradlew clean installDebug` once.
4. **Launch the app** — `adb shell am start -n <package>/<launcher-activity>` (read package + activity from `AndroidManifest.xml`).

## Drive
- **Preferred — Maestro flows.** If `maestro/` directory or any `*.maestro.yaml` files exist, run them: `maestro test <flow>.yaml`. Maestro provides built-in assertions: `assertVisible`, `assertNotVisible`, `assertText`.
- **Fallback — adb input commands.** If no Maestro flows exist for the surface being driven, use:
  - `adb shell input tap <x> <y>` for taps
  - `adb shell input text "<string>"` for text entry
  - `adb shell input keyevent <code>` for hardware keys (HOME=3, BACK=4, etc.)
  - `adb shell input swipe <x1> <y1> <x2> <y2> <duration-ms>` for swipes
- **Optional — generate Maestro flow from probe target.** If a probe target describes a navigation flow and no Maestro flow exists, the probe MAY synthesize one inline (write to `<evidence-dir>/generated-<descriptor>.maestro.yaml` and run it). Do not commit synthesized flows; they are evidence, not source.

## Observe
- **Screenshots** — `adb shell screencap /sdcard/<slug>.png && adb pull /sdcard/<slug>.png <evidence-dir>/`. **Read the screenshot** to confirm the expected visual state.
- **Logcat** — `adb logcat -d *:E` filtered to the app's package (`--pid=$(adb shell pidof <package>)`). Capture errors only by default; capture full output (`*:V`) when investigating a crash.
- **Maestro test reports** — Maestro writes to `~/.maestro/tests/` by default; copy the relevant run report into evidence.
- **Maestro assertions** — `assertVisible`, `assertNotVisible`, `assertText` produce structured pass/fail in the test output; capture and quote them.

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

---

# Adapter: `ios`

## Detection signals
- `*.xcodeproj` or `*.xcworkspace`
- `Package.swift` declaring an iOS platform target
- `ios/Runner.xcodeproj` (Flutter), `ios/<Project>.xcodeproj` (React Native)

## Bootstrap
1. **Probe for a booted simulator** — `xcrun simctl list devices | grep Booted`. If one is booted, skip to step 3.
2. **Boot a simulator** — list available with `xcrun simctl list devices available`. Boot the first iPhone device: `xcrun simctl boot "<device-name>"`. Open Simulator.app if not already running: `open -a Simulator`.
3. **Build and install** — `xcodebuild` or `flutter run --debug` or `react-native run-ios`. Resolution attempt before failing: if `xcodebuild` fails on missing pods, try `cd ios && pod install && cd ..` once.

## Drive
- **Preferred — existing XCUITest or Detox flows.** Run with `xcodebuild test -scheme <scheme>` or `detox test`.
- **Fallback — simctl interactions.** Limited compared to Android adb:
  - `xcrun simctl io booted recordVideo <file.mov>` for video capture
  - `xcrun simctl openurl booted <url>` for deep links
  - Direct UI tap automation via simctl is not first-class; prefer XCUITest or Maestro (which supports iOS as of Maestro 1.30+).

## Observe
- **Screenshots** — `xcrun simctl io booted screenshot <evidence-dir>/<slug>.png`. **Read the screenshot** to confirm the expected state.
- **Console logs** — `xcrun simctl spawn booted log stream --predicate 'process == "<app-name>"'` (run as a background capture, terminate after the criterion completes).
- **Crash reports** — `~/Library/Logs/DiagnosticReports/` for the host; `xcrun simctl get_app_container booted <bundle-id>` to locate app container logs.

## Tear down
- If this run booted the simulator, shut it down: `xcrun simctl shutdown booted`.
- Leave the app installed; install is idempotent.

## Evidence layout
```
<evidence-dir>/
  <criterion-or-target-slug>.png        # screenshot
  <criterion-or-target-slug>.log        # console log stream excerpt
  <criterion-or-target-slug>.mov        # video (if recorded)
```

## Remediation hints
- No iOS simulators available → "Open Xcode → Preferences → Platforms → install at least one iOS Simulator runtime."
- `pod install` fails → "Update CocoaPods (`sudo gem install cocoapods`) and re-run."
- Code signing error → "Open the project in Xcode and select a development team in Signing & Capabilities, then re-run probe."

---

# Adapter: `cli`

## Detection signals
- `Cargo.toml` with a `[[bin]]` target or a single binary crate
- `package.json` with a `bin` field
- `go.mod` with a `main.go` or `cmd/<name>/main.go` layout
- `setup.py` / `pyproject.toml` declaring an `entry_points` console script
- `Makefile` or `justfile` with a `run` target

## Bootstrap
1. **Build the binary** — `cargo build`, `go build ./...`, `npm install` (for `bin` field linking), `pip install -e .`, or the project's documented build step.
2. **Locate the executable** — record the path so observe can invoke it directly (`./target/debug/<name>`, `./<name>` after `go build`, `node_modules/.bin/<name>`, etc.).
3. **Resolution attempt before failing:** if the build fails, run `<tool> --version` to confirm the toolchain is installed; surface a clear error if not.

## Drive
- Run the binary with the inputs implied by the criterion or probe target.
- For interactive CLIs, use `expect` or pipe stdin: `echo "<input>" | <binary> <args>`.
- For commands that take files, stage minimal fixtures under `<evidence-dir>/inputs/` and pass them in.

## Observe
- **Stdout + stderr** — capture both separately: `<binary> <args> >stdout.txt 2>stderr.txt`. Record exit code (`echo $?`).
- **Exit code** — non-zero is a strong signal but not the only signal; some CLIs return zero and emit errors on stderr.
- **Output format** — for criteria that declare output structure (e.g., JSON, table format), parse and validate the structure, not just substring presence.
- **Error cases (when probe target asks)** — test wrong arguments, missing files, permission errors. Capture each.

## Tear down
- Delete any temporary input fixtures created under `<evidence-dir>/inputs/`.
- Built binaries persist (they're idempotent and re-running probe is faster with them in place).

## Evidence layout
```
<evidence-dir>/
  <criterion-or-target-slug>.stdout.txt
  <criterion-or-target-slug>.stderr.txt
  <criterion-or-target-slug>.exit-code   # single-line file with the integer
  inputs/                                # staged fixtures, if any
```

## Remediation hints
- Build fails → "Run the project's build command manually to surface the underlying compiler/linker error."
- Binary not found after build → "Check the build target's output path; some projects place binaries under non-default locations."
- Permission denied on execution → "Run `chmod +x <binary>` if the build did not mark it executable."

---

# Adapter: `desktop`

## Detection signals
- `package.json` with `electron` / `electron-builder` / `tauri-build` dependency
- `src-tauri/` directory (Tauri)
- `pyproject.toml` declaring `pyqt`, `pyside`, `tkinter`, `kivy`, `wxpython` dependencies
- `.app` / `.exe` bundles under `dist/` or `build/`

## Bootstrap
1. **Build the desktop app** — `npm run electron:dev`, `cargo tauri dev`, or the project's documented launch command.
2. **For Electron**: probe may attach via Playwright for Electron — install if needed (`npm install -D playwright`).
3. **Resolution attempt before failing:** retry once after `npm install` / `cargo build` if the launch fails.

## Drive
- **Electron** — Playwright for Electron exposes the same Page API as web. Use it for click/type/screenshot.
- **Tauri** — drive via the webview side using a Playwright connection if the app exposes one; otherwise fall back to OS-level automation (PyAutoGUI, Robot Framework with imagebased keywords).
- **Native (PyQt, etc.)** — use PyAutoGUI for OS-level events; this is the least precise option and should be a last resort.

## Observe
- **Screenshots** — Playwright `page.screenshot()` for Electron; OS-level screen capture (`screencapture` on macOS, `gnome-screenshot` on Linux, `Snipping Tool` programmatic on Windows) for native.
- **Logs** — application log file location varies; check `~/Library/Logs/<app>/` (macOS), `%APPDATA%\<app>\logs\` (Windows), `~/.config/<app>/logs/` (Linux).

## Tear down
- Quit the application: `osascript -e 'quit app "<name>"'` (macOS), equivalent on other OSes.

## Evidence layout
```
<evidence-dir>/
  <criterion-or-target-slug>.png        # screenshot
  <criterion-or-target-slug>.log        # app log excerpt
```

## Remediation hints
- Electron app fails to start → "Run the dev script manually and check for missing native modules; common culprits are `node-gyp` build failures."
- Tauri build fails → "Ensure Rust toolchain and platform-specific build tools (Xcode CLT on macOS, MSVC on Windows, libwebkit2gtk on Linux) are installed."

---

# Adapter: `service` (HTTP API / backend service)

## Detection signals
- `Dockerfile` exposing an HTTP port
- Files declaring HTTP server frameworks: Express, Fastify, FastAPI, Flask, Gin, Actix-web, Axum, Spring Boot, Rails, etc.
- `openapi.yaml` / `openapi.json` / `swagger.yaml`
- `docker-compose.yml` with web service definitions

## Bootstrap
1. **Probe for a running service** — `curl -sI http://localhost:<port>/health` (or the project's documented health endpoint). If it responds, skip to drive.
2. **Start the service** — run the project's documented start command (`docker compose up -d`, `npm run start`, `python -m uvicorn`, etc.) in the background.
3. **Wait for readiness** — poll the health endpoint up to 60 seconds.
4. **Resolution attempt before failing:** if start fails, check that required environment variables are set; surface them in the failure hint.

## Drive
- **HTTP requests** — `curl` or `httpie` (`http POST localhost:<port>/<route>`). For complex flows, write a short script that chains requests.
- **OpenAPI clients** — if a generated client exists, use it for type-safe drives.
- **Existing integration test suites** — prefer running them when they cover the target surface (`pytest tests/integration/`, `npm run test:integration`).

## Observe
- **Response bodies** — capture for each request, validate structure against OpenAPI schema if available.
- **Response status codes** — record per request.
- **Response headers** — capture for security-sensitive criteria (CORS, CSP, cache-control).
- **Service logs** — tail the application log during the drive phase; capture log lines emitted in the relevant time window.

## Tear down
- If this run started the service, stop it: `docker compose down`, kill the background process, etc.

## Evidence layout
```
<evidence-dir>/
  <criterion-or-target-slug>.request.txt   # curl command or request descriptor
  <criterion-or-target-slug>.response.json # response body
  <criterion-or-target-slug>.headers.txt   # response headers + status
  <criterion-or-target-slug>.service.log   # captured log lines
```

## Remediation hints
- Service refuses to start → "Check environment variables and database connectivity. Most service bootstrap failures are config, not code."
- Health endpoint never returns ready → "The service is probably stuck on a migration or external dependency; check service logs for the blocking call."

---

# Adapter: `notebook` (Jupyter / data exploration)

## Detection signals
- `*.ipynb` files in the repo
- `requirements.txt` / `pyproject.toml` declaring `jupyter`, `notebook`, `nbconvert`, `papermill`
- `environment.yml` for a conda env aimed at data work

## Bootstrap
1. **Ensure the kernel is installed** — `jupyter kernelspec list`.
2. **For papermill execution (preferred):** `pip install papermill` if not present.

## Drive
- **Execute notebooks programmatically** — `papermill <notebook>.ipynb <output>.ipynb -p <param> <value>` to parameterize and run.
- **Validate notebook contents** — `jupyter nbconvert --to script <notebook>.ipynb` and inspect output cells.

## Observe
- **Output cells** — read the executed notebook's cell outputs; flag any cell with errors.
- **Plots** — image outputs are embedded in the executed notebook; extract for visual inspection.
- **Runtime** — record execution time per cell when the criterion is performance-related.

## Tear down
- Delete intermediate executed notebooks under `<evidence-dir>/` after capturing the relevant outputs.

## Evidence layout
```
<evidence-dir>/
  <notebook-name>.executed.ipynb
  <notebook-name>.cell-<N>.png       # extracted plot
```

## Remediation hints
- Kernel missing → "Install the kernel with `python -m ipykernel install --user --name <env>`."
- Cell error → "Re-run the notebook manually to see the full traceback; the executed notebook has the error in the failing cell's output."

---

# Adding a new adapter

To add a platform not in this registry:

1. Append a new section using the same shape (Detection signals, Bootstrap, Drive, Observe, Tear down, Evidence layout, Remediation hints).
2. No changes are needed in `verify.md` or `probe.md` — both read this file and discover adapters by section heading.
3. Submit as a single-file change; reviewers can audit the recipe in isolation.

Adapters are *recipes*, not code. They are markdown sections that the calling agent reads and executes. This matches how the rest of the workflow already works and avoids introducing a code-execution path that the rest of the plugin does not have.
