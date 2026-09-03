# Codex Remediation Plan — claudism cleanup + platform-contract adoption

Date: 2026-07-08
Status: **IMPLEMENTED 2026-07-08** (same day, all seven phases) — main tree
v9.107.0 / codex plugin **9.107.0** (user decision at release time: version-parity
with the Claude plugin, superseding the plan's 0.7.0 carrier below) / buildId
`a65215e5ceec…`. Per-phase results:

- **Phase 0**: E1 done via `codex plugin remove` (config entry, stale
  hooks.state hashes, and cache all cleared); E2 CLI 0.118.0 → **0.143.0**
  (hooks/plugins/multi_agent all stable-on — E3 was a no-op on this build);
  E4 installed from `agent-skills-marketplace` (snapshot tracks the repo on
  version change; a same-version content change needs remove+add). **E5:
  SessionStart + Stop observed firing and completing in two live `codex exec`
  runs** (bypass-trust); pre/post/stop enforcement covered by the live
  integration tests, which spawn the real hooks against the real bundled
  policy. Activation record deferred in exec smokes — the sandbox blocks the
  hub's localhost health confirm, so hub-ensure doesn't confirm; by contract
  activation retries on the next trusted SessionStart (verified: the same
  hook + hub-ensure succeed and write `activation.json` outside the sandbox).
  **E6: minimum restated as "hooks-GA build, verified on 0.143.0"** (manifest
  M3). E7 shipped (`npm run verify:deployment`) — reports all-ok except the
  one remaining manual step: **trust the 7 hook definitions via /hooks in an
  interactive session**. `default_mode_request_user_input` still off →
  C4 ladder confirmed necessary.
- **Phases 1–3**: shipped (codex 9.107.0). C6 proved buildId-relevant (schema
  is in the synced payload) and folded into Phase 4 as planned; also fixed
  the same `$id` in `schemas/sdlc-config.schema.json` (same claudism, also
  synced). Gate is 7 families (added `claude-model-pins` — see Phase 6 note);
  spot-check confirmed each family trips it.
- **Phase 4**: V1/V2/V3 landed; V4 = release v9.107.0 (5 bump spots + 51 doc
  brands, build, 512/0 tests + e2e PASS, docs regen before sync, 189-file
  payload parity at `a65215e5ceec…`). Found + fixed en route: the codex tree
  had no `.gitattributes`, so autocrlf gave its checkout CRLF and the synced
  payload's buildId no longer reproduced — added the LF-enforcing
  `.gitattributes` (mirroring the main plugin's) and renormalized 125
  runtime files.
- **Phase 5**: H1 + H3 + H4 shipped with fixture tests (23/23); H2 deferred,
  H5 skipped, per the decision postures below.
- **Phase 6**: S1 (`_subagents.md`) + S2 shipped; also swept an audit-missed
  claudism family the S2 work exposed — Claude model pins (`haiku`/`sonnet`,
  "`Task` call") in 6 dispatch sites → effort tiering per `_subagents.md`,
  now gate-enforced. S3 still deferred.
- **Phase 7**: option 3 shipped on the hand-authored docs landing page
  (survives regen); option 1 remains a scheduled separate workstream.
Inputs: `CLAUDISM-AUDIT.md` (2026-07-08 re-audit section) and
`CODEX-PLATFORM-GAPS.md` (same date). This plan turns their findings into
ordered, file-precise work. Finding IDs below refer to those two docs
(audit `P*`/`NEW-*`, gaps `G*`).

Seven phases. 0–3 are independent of the shared runtime and can ship as
codex-tree-only commits. Phase 4 touches main-tree source and rides a main-tree
release. Phases 5–6 are behavior changes gated on Phase 0 being proven (no
point modernizing hooks that never run). Phase 7 is a design decision.

---

## Phase 0 — Environment cutover completion (G1) — machine work, no commits

The install side of CUTOVER.md was never done: the machine runs the legacy
generated wrapper `sdlc-workflow@local-marketplace` v8.15.0-codex.1, hooks are
feature-flagged off, and `sdlc-workflow-codex` was never installed.

| # | Task | Acceptance |
|---|---|---|
| E1 | Uninstall the legacy plugin: remove `[plugins."sdlc-workflow@local-marketplace"]` and the two `hooks.state."sdlc-workflow@local-marketplace:…"` entries from `~/.codex/config.toml`; delete `~/.codex/plugins/cache/local-marketplace/sdlc-workflow/` (prefer `codex plugin` uninstall commands if the installed CLI has them; hand-edit only as fallback) | `codex` session in this repo no longer lists the v8.15.0 skills; no `sdlc-workflow@local-marketplace` key remains in config.toml |
| E2 | Upgrade `codex-cli` from 0.118.0 to the current release (hooks went GA ~2026-05; 0.118.0 predates GA) | `codex --version` ≥ the hooks-GA release; `codex features` shows `hooks` (or successor flag) as stable |
| E3 | Enable hooks: `[features] hooks = true` in `~/.codex/config.toml` (alias `codex_hooks` if the upgraded CLI still uses it) | `codex features` reports hooks enabled |
| E4 | Install the native plugin from the repo marketplace (`.agents/plugins/marketplace.json` already exposes only `sdlc-workflow-codex`); trust all five hook definitions via `/hooks` | `~/.codex/plugins/cache/agent-skills-marketplace/sdlc-workflow-codex/local/` exists; `hooks.state` has trusted hashes for all five events (`session_start`, `pre_tool_use`, `post_tool_use`, `stop`, `subagent_stop`) |
| E5 | Smoke-validate the enforcement chain: start a Codex session in this repo → activation record written under `${PLUGIN_DATA}`; write a managed artifact → pre/post hooks fire; end a turn with a deliberately invalid artifact → Stop hook blocks with a repair reason | All three observed; note results in this doc's status line |
| E6 | Re-derive the true minimum CLI version from E2/E5 observations (the manifest's "0.139.0+" is unverified) — feeds M3 | A concrete version number with the evidence for it |

Phase 0 exit gate: E5 passes. Everything in Phases 5–6 assumes it.

**Optional deliverable E7:** `scripts/verify-deployment.mjs` — a doctor script
that checks CLI version, hooks flag, plugin install + five trusted hooks, and
absence of the legacy install. The conformant-but-inert failure mode (all
schema checks green, nothing executing) is invisible to `npm test`; this makes
it visible. Wire as `npm run verify:deployment` (advisory, not a test gate —
it inspects machine state, not the repo).

---

## Phase 1 — Manifest + identity (NEW-1, G6) — codex tree only

All in `plugins/sdlc-workflow-codex/`:

| # | Task | Files |
|---|---|---|
| M1 | Rewrite `description` and `interface.longDescription` for the real surface: 8 skills (`wf` 19 keys, `consult`, `imagery`, `uiproto`, `error-analysis`, `refactoring-patterns`, `setup-wide-logging`, `test-patterns`); drop "four/five routers", `$wf-meta`, `$wf-docs`, standalone `$review` | `.codex-plugin/plugin.json:4,24` |
| M2 | Reconcile version drift: bump manifest 0.6.0 → **0.7.0** as the carrier for this plan's Phases 1–3, and align `package.json` to the same number (manifest is what the installer sees — make it authoritative; keep them in lockstep from now on) | `.codex-plugin/plugin.json:3`, `package.json` |
| M3 | Restate the CLI requirement from E6 evidence ("Requires Codex CLI ≥ <verified>, hooks enabled") or, if E6 is inconclusive, replace the number with "a hooks-GA build" | `.codex-plugin/plugin.json:4` |
| M4 | Verify `capabilities: ["Interactive", "Write"]` — `Interactive` is not among the documented example values; if invalid, use `["Read", "Write"]` | `.codex-plugin/plugin.json:27-30` |

Acceptance: `npm test` (codex tree) green; a fresh `codex plugin marketplace
upgrade` shows the new description.

---

## Phase 2 — Claudism punch list (P1-D, NEW-2/3/5, P2-A/B/C, P3-D) — codex tree (+ one main-tree ripple)

| # | Task | Files + approach |
|---|---|---|
| C1 | `/compact` → host-neutral: "Consider compacting the session before `$wf <next>` — workflow state lives in artifact files on disk and the SessionStart hook re-reads it after compaction." (keep the artifact-state rationale, drop the slash command) | `skills/wf/reference/plan.md:386`, `skills/wf/reference/implement.md:221` |
| C2 | Stale router spellings → current invocations. `$wf-hotfix`→`$wf intake hotfix`; `<$wf-intake slug-suggestion>`→`<$wf intake slug-suggestion>`; `$wf-meta status/resume/next/how`→`$wf status`/`$wf recap`/`$wf status` quick-actions/`$wf recap how`; `$wf-docs`→`$wf docs`. **Do not touch** "the former `$wf-meta`" historical-mapping prose | `skills/wf/reference/intake/rca.md:459`, `skills/wf/reference/intake/ideate.md:365`, `references/artifact-interop.md:57-59,67`, `references/narrative-fragments.md:31`, `references/native-operating-model.md:28` |
| C3 | Runtime-adapters de-Clauding: replace the `mcp__claude-in-chrome__*` block with Codex Browser plugin guidance (+ Playwright fallback), and `claude-api`/`claude-code-guide` with host-neutral "consult the provider's SDK docs" wording | `skills/wf/reference/runtime-adapters.md:183-189,237` |
| C4 | **New shared ref `skills/wf/reference/_gate-question.md`** encoding the three-rung ladder from CODEX-PLATFORM-GAPS §4: (1) plan mode → `request_user_input` (name the tool, never a JSON shape — schema undocumented); (2) code mode → one structured chat question with numbered options; (3) non-interactive → gate's documented default + assumption recorded in the artifact (`revisions:`/`assumptions:`). Then replace the five directive `AskUserQuestion` sites with a one-line cite of the new ref + the gate's question/options; update `auto.md:57` to cite it too (its host-mapping sentence becomes the ref's opening) | new `_gate-question.md`; `skills/wf/reference/intake/_intake-context.md:82`, `intake/fix.md:229`, `intake/refactor.md:42,108`, `intake/update-deps.md:209`, `auto.md:57` |
| C5 | **New shared ref `skills/wf/reference/_timestamp.md`**: "obtain real current UTC time from the shell" with both examples (POSIX `date -u +"%Y-%m-%dT%H:%M:%SZ"`, PowerShell `(Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")`) and the never-fabricate rule. Sweep the 36 files: replace each "via Bash"/raw-`date` mandate with a one-line cite (`per [_timestamp.md](_timestamp.md)` with relative-path adjustment for `intake/`, `augment/`, `review/`, `ship/` subdirs). One mechanical pattern, 36 applications — one commit. Include `skills/error-analysis/references/log-patterns.md:85` (soften to "e.g., on POSIX:") | `_timestamp.md` (new) + the 35 `skills/wf/reference/**` files listed in the audit + `log-patterns.md:85` |
| C6 | Schema `$id` de-branding — **main-tree source**: change `$id` in `plugins/sdlc-workflow/tests/frontmatter.schema.json` to a host-neutral identifier (e.g. `https://github.com/jayteealao/agent-skills/schemas/sdlc-workflow/frontmatter.schema.json`), confirm no validator dereferences it (`rg '\$id|frontmatter.schema' lib/ scripts/ hooks/ tests/`), run main-tree `npm test`, then `npm run sync:codex` to propagate to `runtime/tests/frontmatter.schema.json`. If the schema file is inside the synced payload's buildId hash, this ripples into Phase 4's release — if so, fold C6 into Phase 4 rather than shipping alone | `plugins/sdlc-workflow/tests/frontmatter.schema.json:3` → synced |

Acceptance: Phase 3's new gate (below) passes with zero findings; codex-tree
`npm test` green; `auto.md`/intake gates still read coherently end-to-end
(manual read of the two heaviest: `fix.md`, `refactor.md`).

---

## Phase 3 — Claudism regression gate (audit "Suggested Regression Checks", gaps action 8) — codex tree only

New `scripts/verify-claudisms.mjs`, wired into `package.json` `test` (or a
`verify:claudisms` script that `test` invokes). Fails on, scoped to `skills/`
+ `references/` + `.codex-plugin/`:

1. Retired-router spellings `$wf-(intake|shape|slice|plan|implement|verify|review|handoff|ship|retro|hotfix|quick|design|meta|docs)` — excluding lines matching the historical-mapping lexicon (`former|retired|absorbs|absorbed|replaces|is now|no longer`).
2. `/compact` and `slash command|slash-command`.
3. `AskUserQuestion` — excluding lines containing `in Claude Code` (host-mapping prose in `_gate-question.md`).
4. `mcp__claude`, `claude-api`, `claude-code-guide`.
5. Timestamp mandates `via Bash|date -u \+` outside `_timestamp.md` itself.
6. `anthropic.com` in `runtime/tests/` and `.codex-plugin/`.

Plus a small allowlist file (or inline list) for the intentional-interop
non-findings: `README.md`, `MIGRATION.md`, `docs/internal/*`,
`references/{shared-hub,artifact-interop,native-operating-model}.md` interop
prose, consult's `claude` provider, "pin `codex`/`claude`" boilerplate.

Acceptance: gate green after Phase 2; deliberately re-introducing one finding
of each family makes it fail (spot-check).

---

## Phase 4 — Provenance (P1-B, G4) — main-tree source + release mechanics

The env-threading pattern already half-exists: `lib/hub-lifecycle.mjs:36`
reads `SDLC_HOST || 'claude'` and forwards `SDLC_HUB_STARTED_BY` to the hub it
spawns (`:248`). The gaps are the two render-queue writers and the Codex
adapter never setting the variables.

| # | Task | Files |
|---|---|---|
| V1 | Main tree: derive render-queue provenance from env in both writer hooks — `enqueuedBy: { host: process.env.SDLC_HOST \|\| 'claude', pid: process.pid }` | `plugins/sdlc-workflow/hooks/post-write-render.mjs` (source of `dist/post-write-render.mjs:157`), `plugins/sdlc-workflow/hooks/session-start-orient.mjs:132` |
| V2 | Codex tree: set `SDLC_HOST=codex` and `SDLC_HUB_STARTED_BY=codex` in the spawn env at the single choke point where hooks invoke runtime entrypoints — `hooks/_adapter.mjs` (verify all four hook scripts route spawns through it; if any spawn directly, thread env there too) | `plugins/sdlc-workflow-codex/hooks/_adapter.mjs` (+ `session-start.mjs` if it spawns directly) |
| V3 | Tests: extend `plugins/sdlc-workflow/tests/unit/lib/render-queue.test.mjs` with an `SDLC_HOST=codex` case (existing `:77` default-claude assertion stays valid); extend codex-tree `tests/hooks.test.mjs` to assert the adapter sets both vars | both trees' tests |
| V4 | Release mechanics (the expensive part — V1 changes `hooks/` source → dist rebuild → **buildId bump**): main-tree version bump (5 source/config spots + doc-site brands + `mk` top-level per `plugin_version_bump_locations`), `npm run build`, `npm test`, `npm run test:e2e`, regen `docs/site` **before** `npm run sync:codex`, then `npm run verify:codex` for payload parity. Fold C6 in here if it proved buildId-relevant | main tree release |

Acceptance: on a Codex-started hub, `~/.sdlc/hub.pid` / health `startedBy`
reports `codex`; render-queue entries enqueued from Codex hooks carry
`host: "codex"`; Claude-side behavior byte-identical when env unset (default
stays `claude`).

---

## Phase 5 — Hook contract modernization (G2, G5) — codex tree, after Phase 0 proves hooks live

| # | Task | Decision posture |
|---|---|---|
| H1 | PreToolUse deny: emit modern `hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason }` from `_adapter.mjs`; keep exit-2 + stderr as the fallback path | Do |
| H2 | PreToolUse `updatedInput` auto-correction (rewrite recoverable artifact-path mistakes instead of blocking) | **Defer** — capability Claude lacks; adopting it creates a host behavior difference that must be recorded as intentional in the parity story. Revisit after H1 has run in anger |
| H3 | `SubagentStart` hook: register in `hooks.json`, handler injects per-turn workflow context (active slug, stage, External Output Boundary reminder) via `additionalContext` | **Do minimal now** (EOB + active-slug injection); the full standing-instructions propagation belongs to feedback-loops **W6 steering** — build the hook as W6's Codex landing site, don't duplicate its contract here |
| H4 | `PermissionRequest` hook: auto-`allow` a strict allowlist — `node "<runtime-store>/…/dist/*.mjs"` invocations of the plugin's own runtime — to cut prompt fatigue | Do, allowlist-only, log every auto-allow to `${PLUGIN_DATA}` |
| H5 | `PreCompact`/`PostCompact` | **Skip** — SessionStart `source=compact` already re-reads state (the mechanism that replaced Claude's removed PreCompact hook); adding PostCompact duplicates it |

Acceptance: codex `npm test` extended to cover H1/H3/H4 handler outputs
against recorded stdin fixtures; live smoke per E5 procedure.

---

## Phase 6 — Subagent policy adoption (gaps §3) — codex tree skills, decision-reviewed

**S1 — new shared ref `skills/wf/reference/_subagents.md`** (single source,
cited everywhere subagents are mentioned): built-in types
`explorer`/`worker`/`default` only (custom `.codex/agents` spawn-by-name is
broken upstream, #15250); `spawn_agent` + `wait_agent` batching under
`max_threads` 6; depth 1 — children never spawn; children never call
`request_user_input`; in non-interactive runs children inherit
`--ask-for-approval never` or their approval needs become errors; children
read, the coordinator writes artifacts (leases + sibling contracts stay
parent-owned); "no subagents for trivial work" retained.

**S2 — prose revisions** (change "parallel only in parallel mode" → parallel
by default within S1 constraints):

| File | Change |
|---|---|
| `skills/wf/reference/review/_stage.md` + `review.md` | Aggregates: one `explorer` child per dimension, waves of ≤6; coordinator merges into the single accumulating ledger under the mutation lease |
| `skills/wf/reference/verify.md` | Independent AC groups → parallel read-only children returning evidence; parent composes verdict |
| `skills/wf/reference/intake/discover.md:61` | Three-perspective fan-out becomes default-parallel (drop the "only when in parallel mode" clause) |
| `skills/wf/reference/intake/default.md:110`, `slice.md:68`, `shape.md:151`, `simplify.md:113` | Same clause swap, cite `_subagents.md` |

**S3 (defer to follow-up): CSV batch rosters** — `spawn_agents_on_csv` for
batch handoff/ship and multi-slug retro needs a roster→CSV materializer (small
runtime helper reading `INDEX.md`) plus `report_agent_job_result` schema
design. Separate slug; don't block this plan on it.

**Parity note:** these are Codex-native orchestration choices, the layer the
interop plan explicitly designates handwritten-per-host. Record in the
capability-parity story as intentional host difference (Claude side keeps its
own Agent-tool policies).

Acceptance: revised files cite `_subagents.md`; claudism gate still green;
one live review-aggregate run observed spawning parallel children (E5-style
smoke, after Phase 0).

---

## Phase 7 — Docs-site invocation surface (P1-A) — design decision required

The 52-file `/wf` slash-syntax problem cannot be fixed in the codex tree: the
site is generated by main-tree `_build_pages.py` and synced **byte-identical**
into `runtime/docs/site/` (payload parity is a release gate). Options:

1. **Host-syntax toggle in the generator (recommended):** `_build_pages.py`
   emits both spellings — a small JS/CSS toggle (or `<span class="inv-claude">
   /wf</span><span class="inv-codex">$wf</span>`) with a persistent
   host-picker in the site chrome. Both hosts ship the same bytes, so payload
   parity holds; each reader sees their own syntax. Also fixes the three
   "Claude Code plugin" wordings with host-conditional phrasing, and drops the
   stale `wf-quick.html`/`wf-design.html` pages. Cost: generator work +
   full-site regen + brand-page sweep; rides a main-tree release.
2. Post-sync transform of the codex copy — **rejected**: breaks byte parity
   and violates the "don't mechanically retransform" lesson.
3. Codex-only landing note ("read `/wf` as `$wf` throughout") — cheap interim,
   one page, no parity break. Acceptable stopgap if 1 is postponed, but it
   leaves `next-invocation: Full slash command` style prose wrong.

Recommendation: ship option 3 as part of Phase 2 (one generated-page note is
still a generator change — verify; if not cleanly possible, a codex README
callout), schedule option 1 as its own main-tree workstream.

---

## Sequencing and packaging

```
Phase 0  (machine)        — first; E5 is the gate for Phases 5–6
Phase 1+2+3 (codex tree)  — one release train, manifest 0.7.0
                            commit order: C4/C5 shared refs → sweeps → M1-M4 → gate (P3)
Phase 4  (main tree)      — next main-tree version bump; folds C6 if buildId-relevant
Phase 5  (codex tree)     — after Phase 0 proven; manifest 0.8.0
Phase 6  (codex tree)     — with or after Phase 5; same or next train
Phase 7  (main tree)      — option 3 early; option 1 scheduled separately
```

Risks worth naming: the Phase 0 CLI upgrade may change hook/plugin behavior
observed on 0.118.0 (re-run `codex features` and re-verify the contract facts
before Phase 5); `request_user_input`'s undocumented schema means C4 must stay
name-only prose; S2 increases token spend by design — the `_subagents.md`
"no trivial work" rule is the cost brake; Phase 4 is the only step that can
disturb the Claude side — its acceptance explicitly includes claude-default
behavior when env is unset.

Out of scope here: feedback-loops W6 (steering contract — H3 only builds its
Codex landing site), S3 CSV rosters, docs-site option 1 execution, and the
main tree's own timestamp wording (Claude-only, "via Bash" is correct there).
