# Codex Platform Contract — Requirements, Gaps, and Adoption Opportunities

Date: 2026-07-08

Scope: (1) the current official Codex CLI contract for plugins, skills, and
hooks; (2) conformance gaps in `plugins/sdlc-workflow-codex` and in the local
deployment; (3) how Codex subagents and `request_user_input` can be applied to
this plugin.

Sources: developers.openai.com/codex (skills, hooks, plugins/build, subagents,
config-reference, changelog, cli/features — all fetched 2026-07-08),
openai/codex GitHub issues (#9926, #10384, #11536, #12694, #15250, #26948),
local ground truth from the installed `codex-cli 0.118.0` (`codex features`,
`~/.codex/config.toml`, `~/.codex/plugins/cache`). Claims that could not be
confirmed from a primary source are flagged UNVERIFIED inline. Companion doc:
`CLAUDISM-AUDIT.md` (re-audit section, same date) for wording-level findings.

---

## 0. Deployment reality on this machine (found during research — most urgent)

**The native plugin has never been installed here.** What is installed and
enabled is the *legacy generated wrapper*:

- `~/.codex/config.toml` → `[plugins."sdlc-workflow@local-marketplace"]
  enabled = true`
- Cache: `~/.codex/plugins/cache/local-marketplace/sdlc-workflow/8.15.0/` —
  manifest name `sdlc-workflow`, version `8.15.0-codex.1`, with a
  `.claude-plugin/plugin.json` sibling. This is the generated packaging that
  `CUTOVER.md` ordered removed; the repo-side files were deleted, but the
  installed copy survived in the plugin cache and is still active.
- The repo marketplace (`.agents/plugins/marketplace.json`) correctly exposes
  only `sdlc-workflow-codex`, and a `agent-skills-marketplace` cache directory
  exists — but contains **no installed plugin**.
- Hook trust state exists only for the legacy package's `pre_tool_use` and
  `post_tool_use` (`hooks.state."sdlc-workflow@local-marketplace:…"`). The
  native plugin's five hooks (SessionStart, PreToolUse, PostToolUse, Stop,
  SubagentStop) have never been trusted, because the plugin was never
  installed.

Consequences: every Codex session in this repo has been running year-old
v8.15.0 router prose (25 commands, pre-dissolve surface), and none of the
native enforcement (SessionStart activation, stop-verify boundary) has ever
executed.

**Environment remediation (ordered):**

1. Remove/disable the stale `sdlc-workflow@local-marketplace` plugin (and its
   `local-marketplace` cache entry) — this completes the CUTOVER.md procedure
   on the *install side*, which the repo-side cutover missed.
2. Upgrade `codex-cli` (installed: 0.118.0). Hooks went GA ~May 2026; the
   manifest pins "Requires Codex CLI 0.139.0+" (that exact minimum is
   UNVERIFIED against the official docs, which state no minimum — re-derive it
   from the hooks-GA release and re-state it, or drop the claim).
3. Enable hooks: `[features] hooks = true` in `~/.codex/config.toml`
   (deprecated alias `codex_hooks`; on 0.118.0 the flag reports
   "under development, false"). Hooks are **opt-in** — without this the
   plugin's entire hook stack is inert regardless of trust.
4. Install `sdlc-workflow-codex` from the repo marketplace, then trust all
   five hook definitions (`/hooks`). For CI/automation:
   `--dangerously-bypass-hook-trust` exists but should not be the default.

---

## 1. The contract, as researched

### 1.1 Skills

- Layout: `SKILL.md` (required) + optional `scripts/`, `references/`,
  `assets/`, `agents/openai.yaml`. Frontmatter fields documented: **`name` and
  `description` only** (snake_case).
- Loading: the skills *list* (names + descriptions) is budgeted at ~2% of the
  context window or 8,000 chars when unknown — descriptions get truncated
  first, and whole skills can be omitted with a warning when the set is large.
  Full `SKILL.md` loads only on activation. Reference-file loading mechanics
  are not formally specified (instruction-driven reads work; that is what this
  plugin already does).
- Invocation: explicit `$name` / `/skills` browse; implicit by description
  match unless `policy.allow_implicit_invocation: false` in
  `agents/openai.yaml`.
- `agents/openai.yaml` (snake_case): `interface.{display_name,
  short_description, icon_small, icon_large, brand_color, default_prompt}`,
  `policy.allow_implicit_invocation`, `dependencies.tools[]` (type `"mcp"`
  only — declares MCP servers Codex can auto-install for the skill).
- Discovery locations beyond plugins: `.agents/skills` (repo, walking up),
  `~/.agents/skills` (user), `/etc/codex/skills` (admin). The older
  `~/.codex/skills` convention appears superseded (UNVERIFIED deprecation
  timeline).
- UNVERIFIED (conflicting research): one source says skills/agents can declare
  hooks in their own frontmatter (`hooks:` block in SKILL.md YAML); the
  primary skills page documents only `name`/`description`. Verify against the
  live hooks doc before designing around per-skill hooks.

### 1.2 Hooks

Event set (10): `SessionStart`, `SubagentStart`, `PreToolUse`,
`PermissionRequest`, `PostToolUse`, `PreCompact`, `PostCompact`,
`UserPromptSubmit`, `SubagentStop`, `Stop`.
Timeline: experimental v0.114.0 (2026-03) with SessionStart/Stop;
Pre/PostToolUse + PermissionRequest ~v0.117.0; GA ~2026-05.

Handler contract highlights (full payload tables in the official hooks doc):

- `type: "command"` is the only operative handler type (`"prompt"`/`"agent"`
  parsed but skipped). `commandWindows` override confirmed. `timeout` in
  seconds, **default 600**. `async: true` is parsed but the handler is
  **silently skipped** — never set it.
- Exit codes: `0` ok (stdout may carry JSON), `2` block/deny with reason on
  **stderr**.
- `PreToolUse` modern output: `hookSpecificOutput.permissionDecision:
  "deny"|"allow"` (+ `permissionDecisionReason`), and — notably —
  `permissionDecision: "allow"` + `updatedInput` can **rewrite the tool
  input** before execution. Legacy `{decision: "block", reason}` still
  accepted. `permissionDecision: "ask"` is NOT supported.
- `PostToolUse`: `{decision: "block", reason}` replaces the tool result with
  feedback (cannot undo the write); `additionalContext` supported.
- `Stop`/`SubagentStop`: `{decision: "block", reason}` → Codex **continues**,
  turning `reason` into a new continuation prompt. This is exactly the
  enforcement boundary NATIVE-INTEROP-REWRITE-PLAN Resolution 5 designed for,
  now confirmed GA. `stop_hook_active` in the payload guards re-entry.
- `SubagentStart`/`SubagentStop` carry `agent_id`, `agent_type` (matcher
  field: `agent_type`); SubagentStart `additionalContext` injects context
  into the child; `continue: false` does NOT prevent the spawn.
- `PermissionRequest`: `hookSpecificOutput.decision.behavior: "allow"|"deny"`
  — can programmatically resolve approval prompts (any deny wins).
- Env for plugin hooks: `PLUGIN_ROOT`/`PLUGIN_DATA` with
  `CLAUDE_PLUGIN_ROOT`/`CLAUDE_PLUGIN_DATA` compatibility aliases.
- Enablement: `[features] hooks = true`, opt-in; per-definition user trust
  required for plugin-bundled (non-managed) hooks.

### 1.3 Plugins

- Manifest `.codex-plugin/plugin.json`: required `name`, `version`,
  `description`; optional `skills` (path), `hooks` (path/inline — default
  `hooks/hooks.json`), `mcpServers`, `apps`, `interface` (camelCase:
  `displayName`, `longDescription`, `capabilities`, `defaultPrompt`, …). All
  paths `./`-relative, inside the plugin root.
- Marketplace: `$REPO_ROOT/.agents/plugins/marketplace.json` (legacy alias
  `.claude-plugin/marketplace.json`), source types `local` / `url` /
  `git-subdir`, `policy.installation: AVAILABLE|INSTALLED_BY_DEFAULT|
  NOT_AVAILABLE`. Install cache
  `~/.codex/plugins/cache/<marketplace>/<plugin>/<version>/` (`local` for
  local sources — note the stale install in §0 sits at `8.15.0`, an old
  layout).
- Plugin system launched 2026-03-25; no documented minimum CLI version; no
  documented manifest breaking changes since.

### 1.4 Subagents

- `features.multi_agent = true` — **stable and on by default** (confirmed
  locally on 0.118.0). `multi_agent_v2` alpha exists (buggy, #26753).
- Model-callable tools: `spawn_agent`, `wait_agent`, `send_input`,
  `resume_agent`, `close_agent`; batch: `spawn_agents_on_csv` (+ mandatory
  per-worker `report_agent_job_result`, ≤64 concurrent, per-row results CSV).
  Exact `spawn_agent` parameter schema is UNVERIFIED/undocumented (#26948
  shows `message`, `items`, `fork_context`).
- Built-in agent types: `default`, `worker`, `explorer` (read-heavy). Custom
  agents: `.codex/agents/*.toml` / `~/.codex/agents/*.toml` with `name`,
  `description`, `developer_instructions` (+ optional `model`,
  `model_reasoning_effort`, `sandbox_mode`, `mcp_servers`, `skills.config`).
  **Known bug #15250:** repo-local custom agents may not be spawnable by name
  — design around the built-in types plus prompt instructions.
- Limits (config `[agents]`): `max_threads` 6, `max_depth` 1 (children cannot
  spawn grandchildren by default), `job_max_runtime_seconds` 1800.
- Children inherit the parent's sandbox policy and live overrides. In
  `codex exec`, any child action needing an approval **fails** and propagates
  — use `--ask-for-approval never` for autonomous pipelines.
- Delegation only happens when the model calls `spawn_agent` — skill prose
  must say so explicitly.

### 1.5 `request_user_input`

- Real, shipped tool — but available **only in Plan mode** in the interactive
  TUI. In code/default mode the call errors ("unavailable in code mode"); in
  `codex exec` it is removed from the toolset. Extending it to default mode is
  a long-open request (#10384 → #11536 → #12694, still open as of 2026-07).
- Parameter schema: UNVERIFIED/undocumented. Do not encode a parameter shape
  in skill prose; name the tool and describe the question + options in plain
  language.
- `ask_user_question` (#9926, tabbed multi-question UI) is a **proposal, not
  shipped**.
- Partial substitute in default mode: MCP elicitation
  (`tool_call_mcp_elicitation` is stable on 0.118.0) — requires shipping an
  MCP server, which this plugin does not currently do.

---

## 2. Conformance of the current code

What already conforms (verified against the fetched contract):

- `hooks/hooks.json` — five valid events, valid matchers (`apply_patch|Edit|
  Write` uses the documented aliases; `startup|resume|clear|compact` matches
  the `source` filter), `commandWindows` present, sane explicit timeouts
  (5–30s vs 600 default), `statusMessage` used, no `async`.
- `hooks/_adapter.mjs` output shapes — `hookSpecificOutput.additionalContext`
  and `{decision: "block", reason}` are both documented-valid for the events
  they're used on.
- `.codex-plugin/plugin.json` — schema-conformant (camelCase `interface`,
  `./`-relative `skills` path). One UNVERIFIED value: `capabilities:
  ["Interactive", "Write"]` — the documented example set is `Read`/`Write`;
  confirm `Interactive` is an accepted enum value.
- `skills/*/agents/openai.yaml` — correct snake_case schema
  (`interface.display_name`, `policy.allow_implicit_invocation`).
- Marketplace entry — valid `local` source + `policy` block.

### Gaps

- **G1 (blocking, environment): stale legacy install + hooks disabled +
  native plugin never installed.** See §0. Nothing else in this doc matters
  until this is fixed, because none of the native code executes.
- **G2 (code): PreToolUse deny path uses only the legacy shape / exit-2.**
  Adopt `hookSpecificOutput.permissionDecision: "deny"` +
  `permissionDecisionReason`; keep exit-2 as fallback. Opportunity in the same
  contract: `permissionDecision: "allow"` + `updatedInput` could *auto-correct*
  recoverable artifact-write mistakes (wrong slug dir, missing `.ai/` prefix)
  instead of hard-blocking — a capability Claude's PreToolUse does not have;
  adopting it would create an intentional, documented host difference.
- **G3 (code): five directive `AskUserQuestion` references** in
  `skills/wf/reference/intake/` (see CLAUDISM-AUDIT re-audit NEW-5) instruct
  Codex to call a nonexistent tool. Fix with the §4 degradation ladder, not a
  name swap.
- **G4 (code): provenance env not set** — `hooks/session-start.mjs` spawns
  hub-ensure without `SDLC_HUB_STARTED_BY=codex`, so
  `runtime/dist/hub-serve.mjs:54` defaults to `"claude"`;
  `runtime/dist/post-write-render.mjs:157` hard-codes
  `enqueuedBy: {host: "claude"}` (needs a source-level fix in the shared
  runtime + sync, since dist is generated). Carried from CLAUDISM-AUDIT P1-B.
- **G5 (code, opportunity): six documented events unused.**
  `SubagentStart` (inject workflow/steering context into children — natural
  home for the W6 `steer.md` propagation contract, and for handing children
  the External Output Boundary), `PermissionRequest` (auto-allow known-safe
  runtime invocations like `node <runtime>/dist/*.mjs` to reduce prompt
  fatigue), `UserPromptSubmit`, `PreCompact`/`PostCompact` (the Claude side
  relies on SessionStart(source=compact) re-reads — PostCompact is the more
  precise Codex hook for the same re-orientation).
- **G6 (docs/manifest): manifest staleness** — retired-router description
  (CLAUDISM-AUDIT NEW-1), `package.json` 0.1.0 vs manifest 0.6.0 drift, and
  the unverifiable "0.139.0+" requirement (§0 item 2).
- **G7 (design consideration): skills-list budget.** Eight skills with long
  `short_description`s (e.g. `wf`'s enumerates sub-modes) compete for a
  ~8k-char list budget; Codex truncates descriptions first and may drop
  skills. Front-load trigger words; move enumerations into the SKILL.md body.
- **G8 (watch item): skill-frontmatter hooks** — if the frontmatter `hooks:`
  capability is real (§1.1 UNVERIFIED), per-skill scoping could replace parts
  of the global hooks.json; verify before acting.

---

## 3. Applying subagents

Current plugin policy (from NATIVE-INTEROP-REWRITE-PLAN + skill prose): hidden
fan-out becomes sequential local work; parallel subagents only on explicit
user request or "parallel mode" (`discover.md:61`, `simplify.md:113`,
`shape.md:151`, `slice.md:68`); handoff already mandates fix/diagnosis
subagents (`_pr-ci-handoff.md`).

That policy was written when subagent support was assumed to require explicit
user intent. With `multi_agent` **stable and on by default**, the constraint
is now cost/limits, not availability. Recommended revisions:

1. **Review sweeps** (highest value): `$wf review` aggregates currently run
   dimensions sequentially. Spawn one `explorer`-type child per dimension
   (read-only), collect with `wait_agent`, coordinator writes the single
   ledger under the mutation lease. Respect `max_threads` 6 — batch dimensions
   in waves for the 34-dimension `all` aggregate. Keep artifact-writing in
   the parent (children read, parent writes) so sibling-fragment and lease
   rules hold; `SubagentStop`/stop-verify already covers any child that does
   write.
2. **Verify**: independent AC groups → parallel read-only children, each
   returning evidence; parent composes the verify artifact and verdict.
3. **Intake discover / multi-domain research**: the existing "three
   perspectives" fan-out can default to parallel `explorer` children instead
   of being gated on "parallel mode".
4. **Batch rosters**: `spawn_agents_on_csv` fits the v9.105 batch
   handoff/ship roster and multi-slug retro/simplify sweeps — one row per
   slug, `output_schema` = per-slug verdict, coordinator applies the
   AND-verdict. (Requires materializing the roster as CSV; a small runtime
   helper could emit it from INDEX.md.)
5. **Effort tiering**: default children to `model_reasoning_effort` low/medium
   for mechanical stages; reserve high for judge/verify children.

Constraints to encode in skill prose: `max_depth` 1 (orchestrator→child only —
the handoff fix-subagent contract already fits this shape); children must
never need `request_user_input` (it will fail); in `$wf auto`-style
non-interactive runs, children inherit `--ask-for-approval never` or their
approval needs become errors; token cost scales linearly — keep the "no
subagents for trivial work" rule. Because of bug #15250, do not depend on
custom `.codex/agents/*.toml` names — instruct with built-in `explorer`/
`worker` types plus an explicit prompt.

---

## 4. Applying `request_user_input`

The plugin's gate pattern (compressed-lifecycle Proceed/Adjust/Escalate,
refactor branch/coverage gates, ship go/no-go, auto-driver branch posture)
maps onto a **three-rung degradation ladder**, which should become a single
shared reference (mirroring the `_fix-loop.md`/`_chat-return.md`
single-source pattern) cited by every gate:

1. **Plan mode (interactive)** — call `request_user_input` with the question
   and 2–4 options. Name the tool exactly; do not specify a JSON shape (schema
   undocumented).
2. **Code/default mode (interactive)** — the tool errors; fall back to a
   structured chat question: one message, numbered options, wait for the
   reply. (This is what the five `AskUserQuestion` sites in intake should
   become — G3.)
3. **Non-interactive (`codex exec` / auto driver)** — no user input is
   possible. Resolve by recorded policy: take the gate's documented default,
   write the decision + assumption into the artifact (`revisions:` ledger or
   an `assumptions:` field), and continue — the same shape as the yolo
   driver's gate-resolution-by-policy design.

`auto.md:57` already names the right tool per host; extend that same phrasing
to the intake gates and any future gate. Do not design gates that *require*
structured input to proceed — #12694 (default-mode support) has been open
since early 2026 and may land, but the ladder must not depend on it. If a
default-mode structured prompt ever becomes necessary, the MCP-elicitation
route (stable today) is the escape hatch, at the cost of shipping an MCP
server in the plugin.

---

## 5. Ordered action list

1. Environment: complete the install-side cutover (§0 steps 1–4). Without
   this, everything below is theoretical.
2. Manifest: rewrite `plugin.json` description/longDescription for the 8-skill
   / 19-key surface; reconcile 0.6.0 vs 0.1.0; restate or drop the "0.139.0+"
   pin (G6, CLAUDISM-AUDIT NEW-1).
3. G3: replace the five `AskUserQuestion` sites with the §4 ladder (new shared
   `_gate-question.md`-style reference; also fixes CLAUDISM-AUDIT NEW-5).
4. G4: set `SDLC_HUB_STARTED_BY=codex` in `session-start.mjs`; fix the
   hard-coded render-queue provenance at the shared-runtime source and
   re-sync dist.
5. CLAUDISM-AUDIT re-audit punch list: `/compact` (2 sites), stale router
   spellings (5 files), runtime-adapters Claude MCP block, docs-site `$wf`
   regeneration, schema `$id`, timestamp host-neutral wording (36 files —
   consider a single `_timestamp.md` shared reference instead of 36 edits).
6. G2/G5 adoption wave (separate workstream): modern PreToolUse deny shape,
   `updatedInput` auto-correction, `SubagentStart` steering injection (align
   with feedback-loops W6), `PermissionRequest` auto-allow for runtime
   invocations.
7. §3 subagent policy revision across review/verify/discover + CSV batch for
   rosters (separate workstream; touches both trees' parity ledger).
8. Add the claudism regression scan (CLAUDISM-AUDIT "Re-audit verification
   scans") as an npm gate so categories 1–4 cannot regrow.
