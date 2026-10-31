# Runtime Adapter Registry

Per-platform driving recipes for runtime-truth verification. `verify` (the per-slice gate) and `/wf probe` (the slug-wide sweep) read this registry and select the adapters. Then they follow the file of each selected adapter under `runtime-adapters/` to boot, drive, observe and tear down the running artifact.

## Stack gate

Shape, slice, plan, verify and probe read the `stack:` block of `00-index.md` before they use it. Do not re-detect the stack in these stages. Find the state of the block, then do the action of your stage:

| State | shape | slice | plan | verify | probe |
|---|---|---|---|---|---|
| **missing** (no `stack:` block) | Record an open question. Propose to run `/wf intake <slug>` again. | STOP: "Run `/wf intake <slug>` again to capture the stack." | STOP, as slice. | STOP, as slice. | Warn, set `stack-source: probe-detected-from-repo`, and continue. |
| **unconfirmed** (`user-confirmed: false`) | Record an open question. Propose the intake Batch B confirm. | Ask one gate question: confirm in intake Batch B, or continue with the risk. On continue, the stack is advice only and does not set slice boundaries. | Ask the same gate question. On continue, set `stack-source: unconfirmed-auto-detect`. | Ask the verify gate question below. Never continue without an answer. On continue, set `stack-source: unconfirmed-auto-detect` and write a caveat in `## Caveats`. | Warn, set `stack-source: unconfirmed-auto-detect`, and continue. |
| **unconfirmed by policy** (`user-confirmed: false` and `workflow-type` is `hotfix`, `update-deps` or `adopt`) | Note the caveat. Ask no question. | Use the stack as advice only. Ask no question. | Set `stack-source: unconfirmed-auto-detect`. Ask no question. | Set `stack-source: unconfirmed-auto-detect` and write a caveat in `## Caveats`. Ask no question. | As unconfirmed. |
| **confirmed** (`user-confirmed: true`) | Match `stack.platforms` to the adapters. | Continue. The slices may cite the confirmed platforms and tools. | Continue, and set `stack-source: confirmed`. Sub-agent 3 reads the stack. | Continue. Intersect the matched adapters with `stack.platforms`. | Set `stack-source: confirmed`. Intersect the matched adapters with `stack.platforms`. |

- Intake writes `user-confirmed: false` on purpose for `hotfix`, `update-deps` and `adopt` (the stack policy of [intake/_change-mode-tail.md](intake/_change-mode-tail.md)). The caveat carries the risk, so these runs get no stack question.
- When the plan record carries `stack-source: unconfirmed-auto-detect`, verify writes the same stamp and caveat.
- The verify gate question: header `"Stack unconfirmed"`, options `Stop (recommended)` / `Proceed with unconfirmed stack`. The question says that adapter selection may be wrong, and that review and ship may refuse a result with weak provenance.

## Adapter selection (read by callers)

This section owns adapter selection for `verify` and `probe`. The callers cite it and do not restate it.

1. **Match.** Run every detection signal of the Adapters table against the repo. Each adapter with a signal present goes into `matched-adapters`. Several matches (for example a web frontend and a CLI) are the common case.
2. **Intersect.** When the stack is confirmed (`stack.user-confirmed: true`), the effective set is `matched-adapters ∩ stack.platforms`. The stack selects *which* adapters run; the adapter files say *how*. When the stack is missing or unconfirmed, do not intersect: the effective set is `matched-adapters`.
3. **Divergence.** When the intersection drops an adapter, set `stack-adapter-divergence: true`. List each dropped adapter under the divergence heading: `## Stack divergence` in the probe slice, `## Caveats` in the verify record (also `adapters-excluded-by-stack`). Divergence is a signal, not a stop.
4. **Empty intersection.** When the stack is confirmed and the intersection is empty, drive `matched-adapters`, set `stack-adapter-divergence-mode: full-bypass`, and record the bypass under the divergence heading.
5. **No match.** When `matched-adapters` is empty, record `bootstrap-failure: { step: adapter-detection, remediation: "No runtime adapter matched this repo. Add an adapter file under runtime-adapters/ and its row to the Adapters table, or run in a directory that holds a recognized project." }`. Probe writes the slice with `status: awaiting-environment` and skips its Steps 4 and 5. Verify writes `result: blocked-runtime-evidence-missing`.
6. **Drive all.** Drive every adapter of the effective set in parallel, and put the observations into one report. Record `adapters-used: [<key>, ...]`. Probe also records `matched-adapters` and `stack-intersected-adapters` in the slice frontmatter. When the stack is unconfirmed, verify stamps each evidence record `stack-confirmed: false` and says in `## Caveats` that the person did not confirm the selection.
7. **Entry points.** The surface inference of the probe target (route, screen, command and endpoint names) refines which entry points each adapter drives.
8. **Companions.** When `stack.available-skills` or `stack.available-mcp` names a helper that an adapter lists under **Skill catalog hints**, offer it as a companion, not as a required tool. Record the choice of the person in the calling artifact (`verify` per slice, `probe` once per slug).

## Adapters

This table owns detection. Load the file of each selected adapter. Each file gives Bootstrap, Enumerate, Drive, Observe, Perturb, Tear down, Evidence layout and Remediation hints. When a bootstrap step still fails after its resolution attempt, probe writes an `awaiting-environment` slice and verify writes `result: blocked-runtime-evidence-missing`. Each records the failed step and its remediation hint.

| Key | Detection signals (any one matches) | File |
|---|---|---|
| `web` | `package.json` with a `dev` / `start` / `serve` script; a `vite` / `next` / `nuxt` / `astro` / `svelte` / `remix` config file; static HTML at the repo root or under `public/`, `static/`, `dist/`; `index.html` referencing JavaScript modules | [runtime-adapters/web.md](runtime-adapters/web.md) |
| `android` | `AndroidManifest.xml` anywhere in the repo; `build.gradle` / `build.gradle.kts` with the `com.android.application` plugin; `gradlew` / `gradlew.bat` at the repo root; an `app/src/main/java/` or `app/src/main/kotlin/` layout | [runtime-adapters/android.md](runtime-adapters/android.md) |
| `ios` | `*.xcodeproj` or `*.xcworkspace`; `Package.swift` declaring an iOS platform target; `ios/Runner.xcodeproj` (Flutter) or `ios/<Project>.xcodeproj` (React Native) | [runtime-adapters/ios.md](runtime-adapters/ios.md) |
| `cli` | `Cargo.toml` with a `[[bin]]` target or a single binary crate; `package.json` with a `bin` field; `go.mod` with `main.go` or `cmd/<name>/main.go`; `setup.py` / `pyproject.toml` declaring an `entry_points` console script; a `Makefile` or `justfile` with a `run` target | [runtime-adapters/cli.md](runtime-adapters/cli.md) |
| `desktop` | `package.json` with an `electron` / `electron-builder` / `tauri-build` dependency; a `src-tauri/` directory; `pyproject.toml` declaring `pyqt`, `pyside`, `tkinter`, `kivy`, or `wxpython`; `.app` / `.exe` bundles under `dist/` or `build/` | [runtime-adapters/desktop.md](runtime-adapters/desktop.md) |
| `service` | a `Dockerfile` exposing an HTTP port; files declaring an HTTP server framework (Express, Fastify, FastAPI, Flask, Gin, Actix-web, Axum, Spring Boot, Rails, or a similar framework); `openapi.yaml` / `openapi.json` / `swagger.yaml`; `docker-compose.yml` with web service definitions | [runtime-adapters/service.md](runtime-adapters/service.md) |
| `notebook` | `*.ipynb` files; `requirements.txt` / `pyproject.toml` declaring `jupyter`, `notebook`, `nbconvert`, or `papermill`; `environment.yml` for a conda env aimed at data work | [runtime-adapters/notebook.md](runtime-adapters/notebook.md) |

## Shared protocols (load with every adapter run)

- [runtime-adapters/_ladder.md](runtime-adapters/_ladder.md) — the constraint-resolution ladder (mandatory before any deferral): wall-ownership triage, attempt-before-declare, the headless boot and the real wall of each adapter, pre-authorized tool absence, and the env-remediation rung. The per-wall rung lists: [runtime-adapters/_ladder-walls.md](runtime-adapters/_ladder-walls.md).
- [runtime-adapters/_protocols.md](runtime-adapters/_protocols.md) — the surface enumeration ladder, the perturbation protocol, the evidence protocol, and the accessibility checks.
