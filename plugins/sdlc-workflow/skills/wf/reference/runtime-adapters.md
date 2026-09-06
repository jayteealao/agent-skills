# Runtime Adapter Registry

Per-platform driving recipes for runtime-truth verification. Both `wf-verify` (forward gate, per-slice interactive verification) and `/wf probe` (backward re-entry, slug-wide runtime sweep) read this registry, then the adapter files under `runtime-adapters/`, to decide how to bootstrap, drive, observe, and tear down the running artifact.

## How to consume this registry

Each adapter lives in its own file, `runtime-adapters/<key>.md`, and follows the same shape:

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

Callers should re-use the `stack:` block written by `/wf intake` Step 0.5 (and confirmed by the PO in intake Batch B) to short-circuit adapter selection. The contract:

1. If `stack.platforms` is present and `user-confirmed: true`, intersect it with available adapters to narrow the match set before running detection signals. Detection signals stay authoritative for *how* to drive; the fingerprint is just a fast filter for *which* adapters are in scope.
2. If `stack:` is missing or `user-confirmed: false`, fall back to running every adapter's detection signal against the repo as described below.
3. If `stack.available-skills` or `stack.available-mcp` names a session-visible helper that an adapter calls out under **Skill catalog hints**, surface that helper as a *suggested companion* — not a required tool. Record the PO's choice in the calling artifact (`verify` per slice, `probe` once per slug).

## Adapter selection (read by callers)

1. Run every adapter's detection signal against the repo.
2. Collect every adapter that matches. Multi-match (e.g., web frontend + CLI tool in one repo) is the common case, not an exception.
3. **Default — run all matched adapters in parallel.** The caller iterates over every matched adapter and aggregates observations into one report. Record `adapters-used: [<key>, ...]` (plural).
4. **Narrowing — `--adapter <key>` flag (probe only).** Restricts the run to a single matched adapter. Record `adapters-used: [<key>]` and `adapter-narrowed-by-user: true`.
5. The probe `target` string's *surface inference* layer (route names, screen names, command names, endpoint paths) refines which entry points to drive within each running adapter.

## Adapters

Match on the detection signals, then load the file for every matched adapter. The file's own `Detection signals` section is authoritative when this table and the file disagree.

| Key | Detection signals (any one matches) | File |
|---|---|---|
| `web` | `package.json` with a `dev` / `start` / `serve` script; a `vite` / `next` / `nuxt` / `astro` / `svelte` / `remix` config file; static HTML at the repo root or under `public/`, `static/`, `dist/`; `index.html` referencing JavaScript modules | [runtime-adapters/web.md](runtime-adapters/web.md) |
| `android` | `AndroidManifest.xml`; `build.gradle` / `build.gradle.kts` with the `com.android.application` plugin; `gradlew` at the repo root; an `app/src/main/java/` or `app/src/main/kotlin/` layout | [runtime-adapters/android.md](runtime-adapters/android.md) |
| `ios` | `*.xcodeproj` or `*.xcworkspace`; `Package.swift` declaring an iOS platform target; `ios/Runner.xcodeproj` (Flutter) or `ios/<Project>.xcodeproj` (React Native) | [runtime-adapters/ios.md](runtime-adapters/ios.md) |
| `cli` | `Cargo.toml` with a `[[bin]]` target or a single binary crate; `package.json` with a `bin` field; `go.mod` with `main.go` or `cmd/<name>/main.go`; `setup.py` / `pyproject.toml` declaring an `entry_points` console script; a `Makefile` or `justfile` with a `run` target | [runtime-adapters/cli.md](runtime-adapters/cli.md) |
| `desktop` | `package.json` with an `electron` / `electron-builder` / `tauri-build` dependency; a `src-tauri/` directory; `pyproject.toml` declaring `pyqt`, `pyside`, `tkinter`, `kivy`, or `wxpython`; `.app` / `.exe` bundles under `dist/` or `build/` | [runtime-adapters/desktop.md](runtime-adapters/desktop.md) |
| `service` | a `Dockerfile` exposing an HTTP port; files declaring an HTTP server framework (Express, Fastify, FastAPI, Flask, Gin, Actix-web, Axum, Spring Boot, Rails); `openapi.yaml` / `openapi.json` / `swagger.yaml`; `docker-compose.yml` with web service definitions | [runtime-adapters/service.md](runtime-adapters/service.md) |
| `notebook` | `*.ipynb` files; `requirements.txt` / `pyproject.toml` declaring `jupyter`, `notebook`, `nbconvert`, or `papermill`; `environment.yml` for a conda env aimed at data work | [runtime-adapters/notebook.md](runtime-adapters/notebook.md) |

## Shared protocols (load with every adapter run)

- [runtime-adapters/_ladder.md](runtime-adapters/_ladder.md) — the constraint-resolution ladder (mandatory before any deferral): wall-ownership triage, attempt-before-declare, headless boot first, pre-authorized tool absence, and the env-remediation rung. Per-wall rung lists: [runtime-adapters/_ladder-walls.md](runtime-adapters/_ladder-walls.md).
- [runtime-adapters/_protocols.md](runtime-adapters/_protocols.md) — the surface enumeration ladder, the perturbation protocol, the evidence protocol, and the accessibility checks.

# Adding a new adapter

To add a platform not in this registry:

1. Create `runtime-adapters/<key>.md` with the same shape (Detection signals, Bootstrap, Enumerate, Drive, Observe, Perturb, Tear down, Evidence layout, Remediation hints).
2. Add its row to the Adapters table above. No changes are needed in `verify.md` or `probe.md` — both read this registry and load adapters by key.
3. Submit as a two-file change; reviewers can audit the recipe in isolation.

Adapters are *recipes*, not code. They are markdown sections that the calling agent reads and executes. This matches how the rest of the workflow already works and avoids introducing a code-execution path that the rest of the plugin does not have.
