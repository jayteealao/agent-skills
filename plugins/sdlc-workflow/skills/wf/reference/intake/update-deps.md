# Output boundary & shared context
Apply `intake/_intake-context.md` — the External Output Boundary and the workflow-registry / slug rules. Apply the "Compressed-lifecycle change-modes" contract in `intake/_change-mode-tail.md`: the model, the authorship split, and the gate. Do not restate them here.

You are running `/wf intake update-deps`, a **dependency maintenance standard lifecycle**.

# Slug-mode

When the dispatcher selected slug-mode, follow [_compressed-slice.md](../_compressed-slice.md) with `<op>` = `update-deps`: it overrides the standalone steps below.

# Pipeline
`01-update-deps`(intake, scan) → `02-shape` (research + prioritize) → `03-slice` → `04-plan` (tiered commands) → **[gate]** → **self-authored** `05-implement` + `06-verify` (tier-ordered) → `/wf review` → `/wf ship` → `/wf retro`

| | Detail |
|---|---|
| Requires | See [## Requires](#requires). |
| Produces (this command) | In-slug standard artifacts under `<wf-dir>/`: `01-update-deps.md` (`type: intake`, scan), `02-shape.md` (research + priority tiers), `03-slice.md` (`type: slice-index`), `04-plan.md` (tiered commands), and, because update-deps writes its own execution, `05-implement.md` and `06-verify.md`. Also a conformant `00-index.md` (`type: index`). |
| Slug | `update-deps-<YYYYMMDD>` (for example `update-deps-20260619`). Keep a `run-id` field on the lead, for continuity with old `.ai/dep-updates/` runs. |
| No argument | Scan and update all dependencies. |
| `<package-name>` | Focus on one named package. |
| `<existing-run-slug>` | **Resume.** A bare token that matches an existing `workflow-type: update-deps` slug exactly (for example `update-deps-20260619`) resumes that run from its first unwritten artifact. Any other bare token is a package name. |
| `--security-only` | Prioritize and update only the packages with a CVE. |
| `--audit-only` | Run the scan, the research and the plan only. Stop at the gate after `04-plan`, and do not implement. The lawful end is `/wf intake <slug> close deferred` (Step 6). |
| Exception | update-deps is the one change mode that writes its own `05` and `06`, because the tier-ordered execution is specialized. `/wf implement` and `/wf verify` redirect it back here. Only `/wf review` accepts it. |

## Card

The rules of Steps 6 to 9 when a driver runs them (`/wf yolo`), with nobody to ask:

- The answer at the Step 6 gate is "Proceed with full plan": run every planned tier. Never treat the run as audit-only.
- Run the P0 security updates one package at a time, then the P1 major updates one at a time, then the P2 safe updates in one batch. Apply only the app-code changes that the bump forces.
- Never mix a security update and a major migration in one commit. Never edit a lockfile by hand: use the commands of the package manager (`npm update`, `pip install --upgrade`, `go get`, `cargo update`, …).
- When the tests or the build of a package fail, record the package as blocked in `05-implement.md`, with the reason, and continue. Do not change app code to make the tests pass. A run that updates some packages and blocks others is `result: partial`, not a stop.
- Skip no stage. Keep the step order where a step uses the output of an earlier step or crosses a gate.
- Write `06-verify.md` from the full suite and the build. Defer an acceptance criterion only by the law of `verify/_deferrals.md`, once, with the probe of this run.
- Stop after `06-verify.md`. Do not run the review or the handoff.

## Requires

Read every row before you write the stage artifact. [_requires.md](../_requires.md) defines the check.

| Input | Kind | When | Sections |
|---|---|---|---|
| a package manifest | artifact | always | |
| `00-index.md` | artifact | on-resume | |
| `01-update-deps.md` | artifact | on-resume | |
| `decisions.yaml` | artifact | if-present | |
| `intake/_intake-context.md` | procedure | always | |
| `intake/_change-mode-tail.md` | procedure | always | |
| `intake/_intake-provenance.md` | procedure | always | |
| `intake/_intake-provenance-consume.md` | procedure | mode:from | |
| `design/stage.md` | procedure | mode:design | |
| `_compressed-slice.md` | procedure | mode:slug | |
| `intake/update-deps/_exec-artifacts.md` | procedure | always | |
| `01-update-deps.md` | writes | | |
| `02-shape.md` | writes | | |
| `03-slice.md` | writes | | |
| `04-plan.md` | writes | | |
| `05-implement.md` | writes | | |
| `06-verify.md` | writes | | |

# Role
You run the dependency update: scan, prioritize, plan, then apply each update through the package manager.

# Step 0 — Orient
1. **Parse the arguments** of `$ARGUMENTS`:
   - no argument: `mode: all`;
   - a bare token that matches an existing `workflow-type: update-deps` slug on disk exactly: resume that run. This check runs before the package-name reading, because a slug is not a package;
   - any other bare token: `mode: single`, with `target-package`;
   - `--security-only`: `mode: security-only`;
   - `--audit-only`: `mode: audit-only` (stop at the gate after `04-plan`).
2. **Resolve the slug, or resume.** A new run names its slug per "New slug" of [_intake-context.md](_intake-context.md), with the form `update-deps-<YYYYMMDD>`. A run of the same type resumes from its first unwritten artifact. Old `.ai/dep-updates/<run-id>/` runs still validate and render through the fallback; new runs are in-slug.
3. **Prior-run provenance.** Apply `_intake-provenance.md` (the update-deps row). Find the most recent earlier `workflow-type: update-deps` run in `.ai/workflows/INDEX.md`. When one exists, read the Hold tier of its `02-shape.md` and the Blocked list of its `05-implement.md` (`record get "<root>" <prior-slug> <name>`), and seed the research of Step 2 from them. Check each recorded revisit condition again, instead of deriving last month's Hold research from nothing. When you use it, record `origin-update-deps: <prior-slug>` on the index.
4. **Stack fingerprint.** Apply the stack policy in `_change-mode-tail.md`: detect cheaply, and write the block with `user-confirmed: false`. update-deps asks no planning questions, and its own verify carries the caveat. Write `ux-impact: none` and `progress.design: skipped`, with `design-skip-reason: dependency update; no intended design change`. When a P1 package is a UI framework, a component or a styling package, review selects the `design-audit` dimension (`review/_select.md`) and checks the rendered surfaces for drift.
5. **Find the package managers.** Read the manifests at the project root. A project can have several (a Node frontend and a Python backend). List them all.
6. **Branch.** The default is `branch-strategy: dedicated`, with the branch `deps/<slug>`. Create it from the current base when it is absent.
7. **One slice.** The whole update is one slice (`slice-slug` = `<slug>`). The P0, P1 and P2 tiers are organized inside the bodies of the slice, the plan and the implement record, so the single un-suffixed `05-implement.md` and `06-verify.md` capture the tiered execution.

# Step 1 — Scan → `01-update-deps.md` (`type: intake`)
**Write the index first.** Before the first question or research of this step, write the draft of `00-index.md` from the shared change-mode index template in [_change-mode-tail.md](_change-mode-tail.md), with the values of the `update-deps` column, `progress.intake: in-progress` and `next-invocation: /wf intake update-deps <slug>`, and put it. A run that stops before the gate can then resume (the resume test of Step 0 reads this index), and a close or a probe route of a later step has an index to act on.

Read all manifests, and make a complete inventory. For each manifest, read it, and run the outdated and audit commands of its package manager:

| Ecosystem | Commands |
|---|---|
| Node | `npm outdated --json` + `npm audit --json` |
| Python | `pip list --outdated` + `pip-audit`/`safety check` |
| Go | `go list -u -m all` + `govulncheck ./...` |
| Rust | `cargo outdated` + `cargo audit` |
| Java | `mvn versions:display-dependency-updates` / `gradle dependencyUpdates` |

For `mode: single`, filter to the target. For `security-only`, find the packages with a CVE. Write the draft `<wf-dir>/.draft/01-update-deps.md`, then run `node "<skill-dir>/scripts/wf.mjs" record put "<root>" <slug>`. Write the draft of each later record of this run, and put it, the same way.
Take the frontmatter from the `01-<mode>.md` planning template in [_change-mode-tail.md](_change-mode-tail.md).
Add `run-id: deps-<YYYYMMDD-HHMM>` (continuity with old `.ai/dep-updates/` runs) and `mode: <all|single|security-only|audit-only>` after `workflow-type`.
Body: `## Security Vulnerabilities` (CVEs: severity, package, fix version), `## Outdated Packages` (table: package | current | latest | update-type | days-behind), `## Up to Date` (the count only).

# Step 2 — Research + prioritize → `02-shape.md`
For each package that needs an update, launch web-research sub-agents in parallel, in batches of 3 to 5.

**Effort tier.** Give every batch agent the tier **low** ([_subagents.md](../_subagents.md)). Each agent does a web search and a bounded structured extraction per package: the versions, the breaking changes, the migration steps, the CVEs and the compatibility.

Each batch agent returns, per package: the current and the latest version, the update type, the breaking changes, the migration steps, the CVEs, the compatibility, and a recommendation (update-now, update-with-migration or hold).

**The authoritative source, per package.** Web search finds the material. Each agent grounds the breaking changes and the migration steps in the package's own changelog or release notes, not in blog posts or Q&A.
1. Fetch and read, in this order: the `CHANGELOG.md` / `HISTORY` / `NEWS` in the package repo; the GitHub or GitLab Releases page for the target version range; an official upgrade or migration guide when one exists.
2. Read every major version in between. A jump from 3 to 6 means the notes of 4.0, 5.0 and 6.0, because breaking changes stack.
3. Record the exact source URLs read, and the highest version whose notes were read.
4. When no authoritative changelog can be found for a P0 or P1 package, do not infer "no breaking changes". Mark it `changelog: unverified`, and recommend `hold` (or a manual review). A missing changelog is a risk signal, not an all-clear.

**When the changelog cannot settle it, read the source.** For a P0 or P1 package whose changelog is `unverified`, ambiguous, or silent on a symbol that the repo calls, use the `study-sources` skill. It fetches the real source of the target version (a source JAR, `npm pack`, an sdist, `go mod download`, the Cargo or NuGet cache, or a clone of the release tag into `.scratch/`). Diff its changed API against the current usage. The real diff turns an `unverified` guess into a cited migration fact. Record the version you read next to `changelog-source:`. This is a read-only study step: it never installs or runs the candidate version.

**A limitation claim carries its evidence.** A claim that the target version removed, broke or no longer exposes a capability cites one of these in the artifact: the changelog or release line that announces the removal (the `changelog-source:` URL), a `study-sources` read of the installed source of the target version (name the path you opened), or an upstream issue. Do not infer a removal from a remembered API or from a comment in the repo: a comment that claims a limitation is a hypothesis to check again, never the authority to plan a migration on. An uncited "the new version dropped X" moves the package to `Hold: changelog unverified`.

Then sort the packages into tiers:
- **P0 Security:** an active CVE with a fix. Update at once, one at a time.
- **P1 Major+migration:** breaking changes. One at a time.
- **P2 Minor/patch safe:** batch up to 10.
- **Hold:** incompatible, blocked by a peer, or a recommended hold.

Write the draft of `02-shape.md`, and put it.
Take the frontmatter from the `02-shape.md` planning template in [_change-mode-tail.md](_change-mode-tail.md).
Body: one `## <package>` section each (current and latest, CVEs, breaking changes, migration steps, recommendation, reason, and **`changelog-source:` URL(s) + `changelog-read-through:` the highest version whose notes were read, or `unverified`**). Then `## Priority Groups` (the four tiers with their packages), then `## In Scope` / `## Out of Scope` (the Hold tier). The migration steps of every P1 (major+migration) package cite the changelog source they come from. An uncited P1 migration is not ready for the plan, and moves to `Hold: changelog unverified`.

# Step 3 — Slice → `03-slice.md` (`type: slice-index`, one slice)
Take the frontmatter from the `03-slice.md` planning template in [_change-mode-tail.md](_change-mode-tail.md).
Body: "Single-slice dependency update — executed in P0 → P1 → P2 tier order (see `04-plan.md`)."

# Step 4 — Plan → `04-plan.md` (tiered commands)
Take the frontmatter from the `04-plan.md` planning template in [_change-mode-tail.md](_change-mode-tail.md).
Body: `## P0 — Security` / `## P1 — Major+migration` / `## P2 — Safe batch` / `## Hold`. Give each package its exact update command, its test command, what to verify, and its rollback command; for Hold, the reason and the revisit condition. Then `## Tripwire breaches`, only when one fired, per `_change-mode-tail.md`. The update-deps tripwires are: a P1 migration without a cited changelog; a Hold entry without a revisit condition; mixed tiers forced into one commit by the tooling.

# Step 5 — Finish `00-index.md` (conformant `type: index`)
Get the index that Step 1 wrote (`record get "<root>" <slug> index`), and finish it. Write its draft from the shared change-mode index template in [_change-mode-tail.md](_change-mode-tail.md) with the values of the `update-deps` column: the final `workflow-files`, `progress` and terminus route. Also write `mode: <all|single|security-only|audit-only>` on the index frontmatter as an extra key, `origin-update-deps` when Step 0 used an earlier run, and `stack.user-confirmed: false`. Put it.

# Step 6 — Gate before implement
Apply the gate and the family gate rules in [_change-mode-tail.md](_change-mode-tail.md). For update-deps, ask per the gate-question ladder ([_gate-question.md](../_gate-question.md)), with the options for the tiers:
```
question: "Dependency update plan ready. P0: <N> security · P1: <N> major · P2: <N> safe · Hold: <N>. Proceed?"
options:
  - Proceed with full plan
  - Proceed with P0 security updates only
  - Audit-only — save plan, do not implement
  - Adjust plan (describe changes)
```
Record the gate decision in `01-update-deps.md` on every branch (full plan, P0 only, audit-only, adjusted), per the tail.

When `mode: audit-only`, or the person picks Audit-only, the run ends lawfully, not in a deadlock:
1. Add each Hold-tier entry to the `open-questions` of the index as `"revisit <package>: <condition>"`. The research survives as revisit triggers that a script can read.
2. Report to the index in one call, with the `open-questions` list of item 1: `record set "<root>" <slug> index mode=audit-only next-command=wf-close "next-invocation=/wf intake <slug> close deferred" "open-questions=[<current entries>, <revisit entries>]"`. The `record set` refreshes the registry row.
3. Stop, and print: *"Audit saved. Close the run with `/wf intake <slug> close deferred` — the plan stays revivable; a future run seeds from its Hold list via provenance."* Do not point at `/wf review`: it refuses without `05-implement.md`. Do not leave `next-command` on an implementation that will never run.

# Step 7 — Self-author `05-implement.md` (tier-ordered execution)
Run the plan in tier order. Never mix tiers in one commit.
- **P0 (one at a time):** per package, update, run the migration steps, and run the test command. On a pass, commit `fix(deps): update <pkg> to <version> (CVE-<id>)`. On a fail, mark it `blocked`, document it, and continue.
- **P1 (one at a time):** per package, migrate, apply only the app-code changes that the API forces, and test. On a pass, commit `fix(deps): update <pkg> to <version> (major, migration applied)`. On a fail, mark it `blocked`.
- **P2 (one batch):** update the batch, and run the full suite. On a pass, commit `fix(deps): batch update <N> safe dependencies`. On a fail, bisect or roll back the culprit, and mark it `blocked`.

Write the draft of `05-implement.md` (un-suffixed) per [intake/update-deps/_exec-artifacts.md](update-deps/_exec-artifacts.md). It satisfies the required set of **implement** (`next: 06-verify.md`, `next-command: wf-review`). Put it.
Body: `## Updated` (package@version per tier, with the commit SHA), `## Blocked` (package, reason **and revisit condition**), `## Held`.

**Then report to `00-index.md`.** The stage is complete, so the index says so: run `record set "<root>" <slug> index current-stage=implement stage-number=5 progress.implement=complete "workflow-files=[<current entries>, 05-implement.md]"`. It refreshes the registry row. A self-authored stage that skips this leaves the dashboard at "unimplemented" for good.

# Step 8 — Self-author `06-verify.md`
Run the full checks against the updated state: the complete test suite (not only the targeted tests), the build (`npm run build` / `go build ./...` / `cargo build`), and the integration and E2E tests when present. Confirm that no blocked package left an inconsistent lockfile. Write the draft of `06-verify.md` (un-suffixed) per [intake/update-deps/_exec-artifacts.md](update-deps/_exec-artifacts.md), and put it. It satisfies the required set of **verify** (`next: 07-review.md`).
Body: `## Test Result` (pass/fail/skip), `## Build`, `## Blocked packages` (still at the old version, with the reason **and the revisit condition**), `## Caveats` (the unconfirmed stack). Write the raw test and build output to `verify-evidence/<slug>/checks.md`. `result: partial` is valid when some packages updated and some are blocked.

**Then report to the index** again, in one call: `record set "<root>" <slug> index current-stage=verify stage-number=6 progress.verify=complete "workflow-files=[<current entries>, 06-verify.md]" next-command=wf-review "next-invocation=/wf review <slug>"`. It refreshes the registry row. In the same call, add each blocked package to the `open-questions` of the index as `"revisit <package>: <condition>"`, so the provenance seed of the next run finds them without reading the stage bodies again.

# Step 9 — Route to review
On a `pass` or `partial` verify, route to **`/wf review <slug>`**. Review recognizes `workflow-type: update-deps`, and reviews the un-suffixed `05` and `06` against `01-update-deps.md` and `03-slice.md`. Then `/wf ship` → `/wf retro`.

Lead with a short narrative paragraph: what was scanned, the tier counts, what updated and what is blocked, and the verify result. Then:
```
wf intake update-deps complete: <slug>
Branch: deps/<slug>
Tiers: P0 <n> · P1 <n> · P2 <n> · Hold <n>
Updated: <n> · Blocked: <n> · Verify: <pass|partial|fail>
Next: /wf review <slug>  →  /wf ship  →  /wf retro
```

# Workflow rules
Apply the shared workflow rules in [_change-mode-tail.md](_change-mode-tail.md). The rules of update-deps:
- Store the artifacts in-slug. Old `.ai/dep-updates/<run-id>/` runs still validate and render through the fallback.
- Always use the package manager's own commands. Never edit a lockfile by hand.
- Never mix a security update with a major migration in one commit.
- Search the web for every package that you update. Do not rely on `npm outdated` alone.
- Review is not skipped: update-deps verifies itself (`06-verify.md`), then routes to `/wf review`.
