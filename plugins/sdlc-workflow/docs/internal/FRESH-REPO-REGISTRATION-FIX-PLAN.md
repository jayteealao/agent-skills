# Fresh-Repo Registration & Hook-Delivery Fix Plan

**Authored:** 2026-07-10 · **Status:** IMPLEMENTED 2026-07-10 as v9.109.0 (`a119048`) — F1–F4, F6, F7–F11, F13 done (Phase 3 repaired hello-test; view re-rendered under 9.109.0). Open: **F5** (Desktop matcher fix — awaiting `SDLC_HOOK_DEBUG=1` payload capture from a real Desktop session) and **F14** (managed-by banner, deferred to the W6 steering workstream).
**Origin:** forensic audit of the `hello-test` / `gp-practice-landing-page` run (Codex Desktop, 2026-07-09 → 2026-07-10). Evidence chain in memory topic `sdlc-hub-fresh-repo-registration-bugs`; same-day `$wf` visibility fix in `sdlc-codex-platform-gaps-audit`.

## The defect story

A brand-new repo can **never** become registered + rendered with the hub on its own. Three independently confirmed failures compound:

1. **B1 — hub-ensure ordering.** `scripts/hub-ensure.mjs` calls `upsertRegistryEntry()` before anything creates `.ai/_view`. `validateEntry()` (`lib/registry.mjs` ~L176) `realpathSync`s the viewDir and throws on a missing dir → `reject-on-write … viewDir does not resolve`. hub-ensure's own trailing `writeStatus()` creates the dir milliseconds later. `--confirm` gates only hub *health*, so SessionStart still records `activation.json` — the registration failure is invisible.
2. **B2 — reconcile reaps never-rendered repos.** `scripts/hub-serve.mjs` `reconcile()` (~L324) keeps an entry only if `.last-render` exists OR `countPending(viewDir) > 0`. A fresh repo registered with an empty queue is pruned within one 10 s tick. The prune logs ONLY to hub stdout (`logHub`), never `registry.prune.log`. Live-verified twice: manual registrations vanished in <15 s with zero on-disk trace.
3. **C — Codex Desktop PostToolUse events never reach the pipeline.** With hooks trusted 7/7 and SessionStart demonstrably firing (activation.json stamped at session start), ~40 `apply_patch` artifact writes produced **zero** render-queue jobs and no `.ensure-stamp` → `post-tool-use.mjs` never dispatched. Consequence: post-write **validation never ran** (verified: `post-write-verify` exits 2 with precise errors on the malformed `03-slice.md` when fed a valid event — enforcement works, delivery is dead). Lead hypothesis: tool-name/payload-shape mismatch vs the `apply_patch|Edit|Write` matcher on Desktop 0.144.0-alpha.4. Rollout JSONL does not record hook execs, so this needs payload capture, not transcript archaeology.

Combined: B1 rejects the first registration; C keeps the queue empty; B2 reaps any later successful registration. Manual heal recipe (applied to hello-test): valid PostToolUse JSON → bundled `post-write-render.mjs` (enqueue) → bundled `hub-ensure.mjs` (register) → hub drains + renders → `.last-render` protects the entry.

---

## Phase 1 — Hub registration fixes (shared runtime, main tree)

**F1 · viewDir-before-register (B1).** In `upsertRegistryEntry()` (`lib/registry.mjs`), after the `buildEntry` not-git null-check and before `validateEntry`, `mkdirSync(resolvedView, { recursive: true })` (best-effort try/catch — a mkdir failure should fall through to the existing reject path, not throw). Fixing at the choke point covers every caller (session-start hub-ensure, render-hook spawn, heal). Leave hub-ensure's arg flow unchanged.

**F2 · fresh-entry survival + self-render (B2).** Two coordinated changes in `scripts/hub-serve.mjs`:
- On accepting a registry upsert (POST handler and shard fold-in) whose entry has no `.last-render`, **enqueue a `kind: 'bootstrap'` render job** into that repo's queue (the render-queue record kind already exists). This both renders the fresh repo and makes `countPending > 0` protect it through reconcile.
- **Grace period** as belt-and-braces: `reconcile()` keeps an entry whose `updatedAt` is younger than `RECONCILE_GRACE_MS` (propose 10 min) even with no `.last-render`/pending work. Genuinely vanished repos (missing repoRoot/viewDir) still prune immediately — do not weaken that arm.

**F3 · observability.** `reconcile()` prunes must also `logPrune()` to `registry.prune.log` (keep the stdout line). Add the prune reason (`no .last-render + empty queue` vs `backing files gone`) to the log line so the two arms are distinguishable.

**Tests (same commit):**
- Fresh-repo unit: temp git repo with NO `.ai/` tree → `upsertRegistryEntry` succeeds and the viewDir exists afterwards.
- Reconcile unit: freshly upserted entry with empty queue survives a reconcile tick (grace), and a bootstrap job lands in its queue; an entry with missing repoRoot still prunes and the prune line appears in `registry.prune.log`.
- E2E (the real acceptance): script a cold start — temp git repo, run bundled `hub-ensure --confirm` once → within one reconcile interval the repo is in `registry.json`, `.last-render` exists, `INDEX.html` rendered. This test IS the bug reproduced; it must fail before the fix and pass after.

**Release mechanics:** lib/ + scripts/ changes → rebuild `dist/` in the same commit → buildId bump → `npm run sync:codex` → version bump (5 source spots + doc-site brands + regen `docs/site` BEFORE sync). Fold in the still-uncommitted `$wf` visibility fix (7 files) and F13/F14 below so this is one release train.

## Phase 2 — Codex Desktop hook delivery (codex tree)

**F4 · capture before fixing.** Add an opt-in payload dump to `hooks/_adapter.mjs` `readEvent()`: when `SDLC_HOOK_DEBUG=1` (or a `hook-debug` flag file under `PLUGIN_DATA`), append `{ts, hookScript, rawStdinLength, parsedKeys, tool_name, hook_event_name}` (+ full raw payload while debugging) to `PLUGIN_DATA/hook-debug.jsonl`. Never on the critical path, never throws. Then: enable, run a Desktop session that writes one artifact, read the log.

**F5 · fix what the payloads show.** Expected repairs, pending evidence: widen the `PreToolUse`/`PostToolUse` matchers in `hooks.json` to the Desktop's actual patch-tool name; extend `touchedFromEvent()`/`parseApplyPatch()` for the observed `tool_input` shape. Re-verify `Stop`/`stop-verify` delivery the same way. Acceptance: a Desktop session writing a schema-invalid artifact gets the exit-2 deny/flag, and a valid write produces a queue job + `.ensure-stamp`.

**F6 · verify:deployment sees the Desktop binary.** `scripts/verify-deployment.mjs` currently versions the PATH binary only (it reported a stale third install, 0.125.0, while Desktop ran 0.142.5/0.144.0-alpha.4). Scan `%LOCALAPPDATA%\OpenAI\Codex\bin\*\codex.exe --version`, report both, WARN on PATH-vs-Desktop divergence and on Desktop < hooks-GA.

**Sequencing note:** F4 ships with Phase 1's release train (it's inert without the env flag); F5 lands as its own follow-up once payloads are in hand — do not guess matchers into a release.

## Phase 3 — hello-test artifact repair (consumer repo; no plugin release)

Optional — hello-test is a testbed; skip if it's disposable. If repairing:
- **F7** Rewrite `03-slice.md` as a contract-true `slice-index` (`total-slices`, `best-first-slice`, `slices:` roster) and author the four `03-slice-<slug>.md` files retroactively from `02-shape.md` ACs + implemented reality, marked `provenance: reconstructed` — do not fabricate PO answers; record the gap honestly in `po-answers.md`.
- **F8** Restore full plan schema on `04-plan-supporting-task-content.md` / `04-plan-responsive-accessibility-hardening.md`; rewrite both sibling YAMLs to the `artifact: plan` shape; fix the three review sibling YAMLs' `snake_case` → dashed keys.
- **F9** Move the intake `## Revision Ledger` into `revisions:` frontmatter; rename `history/01-intake-20260709T1753Z.md` → `01-intake-0.md`.
- **F10** Re-drive `$wf review gp-practice-landing-page documentation-launch-readiness` (the truncated stage); fix `00-index.md` (`workflow-files` missing the supporting-task-content implement entry; empty-but-user-confirmed `stack:` block).

## Phase 4 — guardrails already agreed, folded into the Phase-1 train

- **F11** Commit the `$wf` visibility fix; reword the three `defaultPrompt` chips in `.codex-plugin/plugin.json` to name `$wf` explicitly and to say `wf` is not a shell command (Windows resolves it to `WF.msc`).
- **F13** Bootstrap seeds consumer `.gitignore` with `.ai/_view/` and `.ai/workflows/*/.locks/` (tonight's run staged view output before recovering).
- **F14** (deferred, separate workstream) managed-by banner on managed artifacts — the only guardrail that survives hooks-off surfaces; overlaps the W6 steering work.

## Risks / watchouts

- **F2 is the risky edit.** Reconcile is the hub's GC; a too-generous grace could keep zombie entries alive. Mitigate by keeping the missing-backing-files arm untouched and testing both arms explicitly.
- **Bootstrap-render-on-register** must be idempotent (registering an already-rendered repo must not re-render everything — gate on `.last-render` absence).
- **Test stdin fixtures:** git-bash `echo`/`printf` collapse `\\` in single-quoted JSON — hooks then no-op on invalid stdin, indistinguishable from a real no-op. Write event fixtures as files, byte-exact.
- **Don't touch cross-host lock / stale-takeover paths** while editing hub-serve (see `sdlc_cross_host_lock_takeover_serialization`).

## Order of work

1. Phase 1 (F1–F3) + F4 + F11 + F13, one release train, E2E cold-start test as the gate.
2. Capture Desktop payloads (F4 output) → F5 + F6 follow-up release.
3. Phase 3 repair if hello-test is worth keeping.
