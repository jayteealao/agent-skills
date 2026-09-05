# Repo stack fingerprint (Step 0.5 of `intake/default.md`)

Goal: cheaply observe what the repo *already uses* and what *tooling is available in this session*, then write both into `00-index.md` as durable signal for shape/plan/implement. This is **not** a recommendation step; recommendations happen in shape, with the user in the loop. Stay descriptive: record only what is actually detected.

1. **Repo signals (cheap globs/reads, no network).** Run these probes and record what hits. Do not infer beyond direct evidence; absence ≠ proof of absence, so leave keys out rather than guess.
   - **Manifests:** `package.json`, `pyproject.toml` / `requirements.txt` / `setup.py`, `Cargo.toml`, `go.mod`, `pom.xml` / `build.gradle*` / `settings.gradle*`, `Gemfile`, `composer.json`, `pubspec.yaml`, `mix.exs`, `*.csproj` / `*.sln`. Capture language(s) + package manager(s).
   - **Platforms:** `AndroidManifest.xml` or `app/src/main/**` → `android`. `*.xcodeproj` / `*.xcworkspace` or `ios/Runner.xcodeproj` → `ios`. `next.config.*` / `vite.config.*` / `nuxt.config.*` / `astro.config.*` / `remix.config.*` / `svelte.config.*` → `web`. `src-tauri/` or `electron` dep → `desktop`. `Dockerfile` exposing HTTP or HTTP server framework imports → `service`. `*.ipynb` → `notebook`. `[[bin]]` in `Cargo.toml`, `bin` in `package.json`, `cmd/<name>/main.go` → `cli`.
   - **UI / framework:** React/Vue/Svelte/Angular (from `package.json`), Jetpack Compose (`androidx.compose.*` in gradle), XML views (`res/layout/`), SwiftUI, UIKit, Flutter, React Native.
   - **Build / package managers:** npm vs pnpm vs yarn vs bun (lockfile present), gradle/AGP version, cargo, go modules.
   - **Testing & verification tooling:** Jest, Vitest, pytest, JUnit, Go testing, RSpec, XCTest, **Maestro** (`maestro/` dir or `*.maestro.yaml`), Detox, Playwright, Cypress, Appium, Selenium, Espresso. Visual: Percy, Chromatic.
   - **Observability / logging:** `.lazylogcat*`, Perfetto trace configs, Sentry/OpenTelemetry SDKs, structured-log setup files.
   - **Marker files for known integrations:** Hilt/Dagger (`hilt-` deps), Room (`androidx.room.*`), Engage SDK, Play Billing, R8/ProGuard rules.

2. **Session catalog (what is available to *this* agent run).** Enumerate skills, commands, and MCP servers visible in the current session. Record names + a one-line description each; these become the matching surface in shape. Do not invent entries; only record what the session actually exposes.

3. **Write into `00-index.md` frontmatter** as a `stack:` block (sibling to `tags:`). Every key is optional; omit rather than guess. Example shape (Android case):
   ```yaml
   stack:
     detected-at: "<iso-8601>"
     platforms: [android]
     languages: [kotlin]
     ui: [compose]
     build: [gradle]
     package-managers: [gradle]
     testing: [junit, maestro]
     observability: [lazylogcat]
     integrations: [hilt, room]
     available-skills:
       - {name: android-cli, hint: "Android project + SDK orchestration"}
       - {name: lazylogcat, hint: "Non-interactive logcat capture/filter"}
       - {name: adaptive, hint: "Multi-form-factor UI adaptation"}
     available-mcp: []
     user-confirmed: false
   ```
   `user-confirmed: false` means "auto-detected, awaiting Batch B confirmation." Batch B flips it to `true` after the PO has had a chance to correct.

4. **Recommend nothing yet.** No "you should use X." That happens in shape, after the user has confirmed or corrected the fingerprint. This step's only output is observation written to disk.
