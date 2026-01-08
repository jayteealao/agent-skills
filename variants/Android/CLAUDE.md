# CLAUDE.md — Android (Compose-first, strict, clear, production)

Start: say hi. One motivating line. Then work.

## Owner / contact
- Owner: <FILL ME> (name, handle, email).

## Style goals (always)
- Simple, clear, readable. Production-grade.
- Prefer explicit code over clever tricks.
- Small functions, clear names, clear data flow.
- Delete dead code, remove duplication, keep one source of truth.

## Non-negotiables (implementation)
- One canonical implementation in the primary codepath.
  - Remove legacy/shims/adapters in the same change. No compatibility wrappers.
- Single source of truth for:
  - business rules, validation, enums, flags, constants, configuration.
- UI is a thin view layer:
  - renders state and options from domain/shared types.
  - no business rules duplicated in UI.
- Validate and sanitize all user-controlled inputs before OS/file/process calls.
- Errors are explicit:
  - no silent catches.
  - user-visible error states where appropriate.
  - logs have context, no secrets.

## Workflow
- No git worktrees unless user asks.
  - If asked: `peakypanes-worktress/<worktree-name>/`
- Safe git by default:
  - OK: `git status`, `git diff`, `git log`, `git show`.
  - No destructive ops unless explicit (`reset --hard`, `clean`, `restore`, `rm`, …).
  - No amend unless asked.
- Small commits. Reviewable diffs. No repo-wide reformat.

## Jetpack Compose rules (must follow)
- Compose is the UI system. Stay current and use cutting-edge Compose libraries.
- Do NOT use the Compose BOM.
  - All Compose artifacts must use explicit versions (prefer `gradle/libs.versions.toml`).
  - Keep versions aligned (runtime, UI, foundation, material3, tooling, navigation-compose, etc.).
- Compiler alignment:
  - Ensure the Compose compiler/plugin is compatible with the repo’s Kotlin version.
  - No “it builds on my machine” mismatches. Fix at the source.

## Compose architecture
- Unidirectional data flow:
  - UI emits events. ViewModel owns state. Domain owns rules.
- Composables:
  - Prefer small, focused composables.
  - Parameters explicit. Avoid hidden global reads.
  - Hoist state. Stateless where practical.
- Side effects:
  - Use `LaunchedEffect` / `DisposableEffect` deliberately.
  - No leaking coroutines. Cancellation respected.

## Previews (required)
- Every UI composable must have a Preview.
  - “UI composable” = any composable that renders a screen/section/card/list row/dialog.
- Previews must be parametric where the UI has meaningful states:
  - loading / empty / error / success
  - light / dark
  - small / large font where relevant
- Use stable preview data:
  - no network calls, no randomness, no current time.
  - use simple fake models from shared preview fixtures.

## Screenshot tests (required)
- All critical UI surfaces must have screenshot coverage:
  - key screens, key components, and the main states (loading/empty/error/success).
- Screenshot tests must be deterministic:
  - fixed clock, fixed locale, fixed font scale where needed.
  - avoid animations or disable them in test harness.
- Baselines:
  - update only when UI changes are intentional.
  - keep diffs reviewable (small surface at a time).

## Testing rules (Android)
- Behavior change => test change.
- Prefer real behavior over heavy mocking.
- No flaky tests:
  - no sleeps.
  - use test dispatchers/idling/deterministic schedulers.
- Coverage expectation:
  - critical domain + ViewModel logic covered by unit tests.
  - UI behavior covered by screenshot + instrumented tests where appropriate.

## Dependencies
- Avoid new dependencies.
- If required:
  - pick maintained + widely used.
  - explain why and remove anything replaced in the same change.

## Commands (Gradle)
- Build debug:
  - `./gradlew :app:assembleDebug`
- Unit tests:
  - `./gradlew test` (or `./gradlew :app:test`)
- Lint:
  - `./gradlew lint` (or `./gradlew :app:lint`)
- Compose / formatting / static analysis (run what exists):
  - `./gradlew detekt` / `./gradlew ktlintCheck` / `./gradlew spotlessCheck`
- Instrumented tests:
  - `./gradlew connectedAndroidTest` (or module-scoped)
- Screenshot tests (run the repo’s task):
  - `./gradlew screenshotTest` / `./gradlew verifyPaparazziDebug` / `./gradlew roborazziRecord` / `./gradlew roborazziVerify`
  - Use the task names that exist in this repo.

## CI workflows (must exist and stay green)
Maintain GitHub Actions workflows that run on PRs and main:

1) Fast checks (PR):
- build: `assembleDebug`
- unit: `test`
- lint: `lint`
- screenshot verify (if configured): verify task

2) Full gate (main, and optionally PR nightly):
- `assembleDebug`
- `test`
- `lint`
- screenshot verify
- instrumented tests: `connectedAndroidTest` (emulator)

3) Release confidence:
- `assembleRelease`
- (optional) `bundleRelease` if Play publishing pipeline exists
- run the same lint/unit gates against release variants if the repo config differs

Rules:
- No merging on red CI.
- If CI fails, fix root cause. Do not paper over with ignores unless justified.
- If you add/rename tasks, update workflows in the same change.

## Security & privacy
- Treat external inputs as hostile.
- No secrets in code, logs, or screenshots.
- Prefer least privilege and safe defaults.
- **Never git add or commit:**
  - API keys, tokens, passwords, or credentials
  - `.env` files (use `.env.example` with placeholder values)
  - Private keys, certificates, keystores, or signing configs with real credentials
  - `google-services.json` or `local.properties` with real keys
  - Database connection strings with credentials
  - Cloud provider credentials (AWS, GCP, Azure, Firebase)
- Before any `git add`:
  - Review staged files for accidental secrets
  - Check for hardcoded credentials in code
  - Ensure `.gitignore` covers sensitive files
- If secrets are accidentally committed:
  - Do NOT just delete and commit again (history retains them)
  - Rotate/revoke the exposed credentials immediately
  - Use `git filter-repo` or similar to purge from history if needed

## Before you finish
- List commands run + results.
- Legacy paths removed. No parallel implementations.
- Rules/validation centralized (not duplicated in UI).
- Every UI composable has previews (parametric where needed).
- Screenshot tests added/updated for meaningful UI changes.
- CI workflows updated if the task surface changed.
- Clear summary. Key files noted.
