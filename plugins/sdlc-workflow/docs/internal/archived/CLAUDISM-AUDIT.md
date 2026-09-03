# Claudism Audit: sdlc-workflow-codex

Date: 2026-06-16
Re-audited: 2026-07-08 (see the re-audit section directly below; the original
2026-06-16 findings and file ledger are retained beneath it as historical
record — a large fraction of their file paths no longer exist)

---

## Re-Audit: 2026-07-08

### State at re-audit

| Surface | State |
| --- | --- |
| Claude plugin | `sdlc-workflow` v9.106.0 (`3de67e9`); `/wf` = 20 keys; `wf-meta`/`wf-docs` dissolved (v9.98.0), craft dissolved (v9.96.0) |
| Codex plugin manifest | `.codex-plugin/plugin.json` name `sdlc-workflow-codex` v0.6.0 (`package.json` still says `0.1.0` — version drift, see NEW-1) |
| Codex skill surface | 8 skills: `wf` (19 keys, no `yolo`), `consult`, `imagery`, `uiproto`, `error-analysis`, `refactoring-patterns`, `setup-wide-logging`, `test-patterns`. No standalone `review`, `wf-quick`, `wf-design`, `wf-meta`, `wf-docs` |
| Codex hooks | `hooks/hooks.json` registers 5 events: SessionStart, PreToolUse, PostToolUse, Stop, SubagentStop |

The original audit's four claudism criteria still apply. One classification
refinement: prose of the form "the former `$wf-meta`" (historical mapping in
the dissolve documentation, e.g. `skills/wf/SKILL.md` Resolution rule 3,
`status.md`, `ship.md`, `intake.md`, `close.md`) is **intentional** and is not
counted. Only *directive* uses of retired spellings count.

### Original-finding status

| Finding | Status 2026-07-08 |
| --- | --- |
| P1-A docs site teaches Claude slash commands | **STILL PRESENT** — 52 site files use `/wf ` syntax, 7 say "slash command", 3 say "Claude Code plugin" (`runtime/docs/site/index.html:99`, `explanation/build-and-dist.html:100`, `_build_pages.py:1776`). Stale `reference/wf-quick.html` / `reference/wf-design.html` pages still shipped |
| P1-B provenance defaults to claude | **PARTIALLY FIXED** — hooks no longer hard-code a host, but `hooks/session-start.mjs` still does not set `SDLC_HUB_STARTED_BY`/`SDLC_HOST` before hub-ensure, so `runtime/dist/hub-serve.mjs:54` (`process.env.SDLC_HUB_STARTED_BY \|\| "claude"`) stamps Codex-started hubs as claude; `runtime/dist/post-write-render.mjs:157` hard-codes `enqueuedBy: { host: "claude" }` with no env indirection |
| P1-C invalid router spellings (original 6 locations) | **OBSOLETE** — all six files deleted in the wf-quick/wf-design dissolves. Successor findings: see NEW-2/NEW-3 |
| P1-D `/compact` guidance | **STILL PRESENT** — `skills/wf/reference/plan.md:386`, `skills/wf/reference/implement.md:221` |
| P2-A Claude MCP tools in runtime-adapters | **STILL PRESENT** — `skills/wf/reference/runtime-adapters.md:183-189` (`mcp__claude-in-chrome__*` tool list), `:237` (`claude-api` / `claude-code-guide`) |
| P2-B Bash/POSIX timestamp mandates | **STILL PRESENT** — 36 files (35 under `skills/wf/reference/`, incl. all `intake/*`, `augment/*`, `ship/rollback.md`, 5 review dims; plus `skills/error-analysis/references/log-patterns.md:85`). None fixed; count shifted only because the dissolve moved files |
| P2-C Anthropic schema `$id` | **STILL PRESENT** — `runtime/tests/frontmatter.schema.json:3` |
| P3-A "Claude is capable…" in design guidelines | **OBSOLETE** — `references/design/` deleted; successor tree `skills/wf/reference/design/` is clean |
| P3-B retro centers CLAUDE.md | **RECLASSIFIED: intentional dual-host interop** — every occurrence now pairs `AGENTS.md` first (`retro.md:97,98,180,247`) |
| P3-C "slash-command names" in review refs | **FIXED** — zero matches across all 34 `skills/wf/reference/review/` dimension files |
| P3-D Unix-only operational snippets | **MOSTLY FIXED** — `refactoring-patterns` and `setup-wide-logging` clean; one remnant in `error-analysis/references/log-patterns.md:85` (illustrative, low severity) |

### New findings (not in the 2026-06-16 audit)

- **NEW-1 (P1): the plugin manifest itself describes the retired surface.**
  `.codex-plugin/plugin.json:4` says "four handwritten router skills (`$wf`,
  `$wf-meta`, `$wf-docs`, `$review`)" and the `interface.longDescription` says
  "five routers". `$wf-meta` and `$wf-docs` are dissolved; `review` is `$wf
  review`. This is the public marketplace-facing description. Same file: the
  manifest is v0.6.0 while `package.json` is 0.1.0 — reconcile whichever is
  authoritative.
- **NEW-2 (P2): directive retired-router spellings in shared references.**
  `references/artifact-interop.md:57-59,67` (`$wf-meta status/resume/next` as
  current commands), `references/narrative-fragments.md:31` (lists `$wf-docs`,
  `$wf-meta` as live skills), `references/native-operating-model.md:28`
  (`via $wf-meta status / resume / next`). Correct forms: `$wf status`,
  `$wf recap`, `$wf docs`.
- **NEW-3 (P2): directive retired spellings in intake references.**
  `skills/wf/reference/intake/rca.md:459` (`$wf-hotfix`; correct: `$wf intake
  hotfix`) and `skills/wf/reference/intake/ideate.md:365` (artifact template
  field `<$wf-intake slug-suggestion>`; correct: `$wf intake <slug>`).
- **NEW-4 (non-finding, recorded for future scans): `claude` as a consult
  provider.** `skills/consult/SKILL.md` and ~23 reference files carry the
  "pin `codex`/`claude` to stay free" second-opinion boilerplate. Intentional
  external-dispatch interop, not a claudism — but the consult path invokes the
  `claude` CLI, which may be absent in a pure Codex environment; the skill
  already treats providers as availability-probed.
- **NEW-5 (P1): `AskUserQuestion` referenced as an executable tool.** Five
  directive uses instruct Codex to call a Claude-only tool that does not exist
  on the Codex surface — exactly what NATIVE-INTEROP-REWRITE-PLAN's
  "should not" list forbids:
  `skills/wf/reference/intake/_intake-context.md:82`,
  `skills/wf/reference/intake/fix.md:229`,
  `skills/wf/reference/intake/refactor.md:42` and `:108`,
  `skills/wf/reference/intake/update-deps.md:209`.
  `skills/wf/reference/auto.md:57` shows the correct pattern ("the platform's
  blocking question tool — `AskUserQuestion` in Claude Code,
  `request_user_input` in Codex"). Note the Codex tool is **plan-mode-only**
  (fails in code mode and `codex exec`), so the fix needs a degradation ladder,
  not a 1:1 name swap — see `CODEX-PLATFORM-GAPS.md`.

### Re-audit verification scans

Same four scan families as the original, with two adjustments: exclude
`former \`\$wf-` (historical-mapping prose) from the router-spelling scan, and
add the manifest to the scan surface:

```sh
rg -n -i "claude|anthropic|mcp__claude|claude-api|claude-code-guide|CLAUDE\.md" plugins/sdlc-workflow-codex/skills plugins/sdlc-workflow-codex/references plugins/sdlc-workflow-codex/.codex-plugin
rg -n -i "slash.command|/compact" plugins/sdlc-workflow-codex/skills plugins/sdlc-workflow-codex/references
rg -n "\\\$wf-(intake|shape|slice|plan|implement|verify|review|handoff|ship|retro|hotfix|quick|design|meta|docs)" plugins/sdlc-workflow-codex/skills plugins/sdlc-workflow-codex/references plugins/sdlc-workflow-codex/.codex-plugin | rg -v "former|retired|absorbs|absorbed|replaces|is now|no longer"
rg -n -i "via Bash|date -u \+|\\\$\(date \+" plugins/sdlc-workflow-codex/skills plugins/sdlc-workflow-codex/references
rg -n "AskUserQuestion" plugins/sdlc-workflow-codex/skills | rg -v "in Claude Code"
```

The suggested regression gate from the original audit still does not exist
(`npm test` / `verify:no-legacy` catch none of these categories); the scan
above is the candidate implementation, plus a docs-site brand check for
`/wf ` vs `$wf `.

Platform-contract gaps (hooks support on the installed CLI, enforcement
boundary, subagent/user-input adoption) are tracked separately in
`CODEX-PLATFORM-GAPS.md`.

---

## Original Audit (2026-06-16) — historical

Scope:
- Package-wide claudism scan of `plugins/sdlc-workflow-codex`.
- File-by-file review of `plugins/sdlc-workflow-codex/skills`.
- File-by-file review of `plugins/sdlc-workflow-codex/references`.
- Coverage: 140 files under `skills`, 19 files under `references`, 159 files total.

Claudism criteria used in this audit:
- Direct Claude, Anthropic, or Claude Code product naming in Codex-facing instructions.
- Claude slash-command syntax such as `/wf`, `/review`, or `/compact`.
- Generated/legacy router spellings that do not exist in the Codex skill surface.
- Claude Code Bash-tool assumptions in mandatory workflow mechanics, especially timestamps and artifact writes.

Notes:
- Intentional Claude/Codex interoperability references in `README.md`, `MIGRATION.md`,
  `docs/internal/*`, `references/shared-hub.md`, `references/artifact-interop.md`,
  and `references/native-operating-model.md` are not treated as claudisms unless
  they incorrectly direct Codex behavior.
- Generated runtime docs under `runtime/docs/site` were included in the
  package-wide scan, but not in the later skills/references-only file ledger.
- Generic shell snippets in review/checklist references are not counted as
  claudisms unless they are mandatory workflow mechanics. They are a separate
  Windows portability cleanup target.

## Findings

### P1: Shipped Runtime Docs Still Teach Claude Slash Commands

The bundled documentation site still presents the Codex package as a Claude Code
plugin and teaches slash-command usage instead of Codex skill invocation syntax.

Examples:
- `runtime/docs/site/index.html:101` says "A Claude Code plugin..."
- `runtime/docs/site/reference/wf.html:100` says entries are invoked as
  `/wf <sub-command> [args]`.
- `runtime/docs/site/orientation/mental-model.html:146` says "Claude has no
  memory between sessions."
- `runtime/docs/site/reference/hooks.html:98` describes hooks during normal
  Claude Code use.

Impact:
- Users following the bundled docs will try `/wf`, `/wf-meta`, `/review`, etc.
  instead of `$wf`, `$wf-meta`, `$review`, etc.
- This conflicts with the Codex router skills exposed by the package.

Observed scope:
- 26 generated docs pages contain Claude wording.
- 56 generated docs pages contain slash-command syntax.

Recommended fix:
- Regenerate or rewrite the Codex docs site with Codex-native invocation
  examples.
- Use `$wf`, `$wf-meta`, `$wf-docs`, and `$review`. (`$wf-quick` and `$wf-design` were retired —
  their flows are now `$wf intake <mode>` / `$wf probe` / `$wf simplify` and `$wf design`.)
- Replace Claude-specific prose with "Codex", "the agent", or host-neutral
  wording where appropriate.

### P1: Codex Runtime Provenance Defaults to Claude

Normal Codex hook paths invoke the shared runtime without setting
`SDLC_HOST=codex`, while the runtime defaults provenance to `claude`.

Evidence:
- `hooks/_adapter.mjs:79` spawns bundled runtime entrypoints without setting
  `SDLC_HOST`.
- `hooks/session-start.mjs:92` invokes `hub-ensure` without setting
  `SDLC_HOST`.
- `runtime/dist/chunk-BTN5KJR6.mjs:196` defaults `STARTED_BY_HOST` to
  `"claude"`.
- `runtime/dist/hub-serve.mjs:54` defaults `STARTED_BY_HOST` to `"claude"`.
- `runtime/dist/post-write-render.mjs:156` hard-codes render queue provenance
  as `{ host: "claude", pid: process.pid }`.
- `runtime/dist/session-start-orient.mjs:110` hard-codes bootstrap render queue
  provenance as `{ host: "claude", pid: process.pid }`.

Impact:
- Codex-started hubs and Codex render work can appear Claude-started.
- Diagnostics, health records, PID records, and render queue entries are
  misleading.

Recommended fix:
- Set `SDLC_HOST=codex` in Codex hook adapters before invoking shared runtime
  entrypoints.
- Set `SDLC_HUB_STARTED_BY=codex` where appropriate for hub launches.
- Change Codex-distributed runtime queue entries to use Codex provenance, or
  derive host from `SDLC_HOST`.

### P1: Skills and References Contain Non-Existent Codex Router Names

Several files still point to generated or legacy router spellings that do not
match the Codex skill surface.

Evidence:
- `skills/wf-quick/reference/hotfix.md:201`
  - Current: `$wf-review`, `$wf-review security`
  - Expected: `$wf review` or `$review security`
- `skills/wf-quick/reference/rca.md:460`
  - Current: `$wf-hotfix`
  - Expected: `$wf-quick hotfix`
- `skills/wf-quick/reference/ideate.md:348`
  - Current: `<$wf-intake slug-suggestion>`
  - Expected: `<$wf intake slug-suggestion>`
- `skills/wf-design/reference/craft.md:157`
  - Current: `$wf-plan`
  - Expected: `$wf plan`
- `references/design/design-guidelines.md:21`
  - Current: `$wf-design:setup`
  - Expected: `$wf-design setup`
- `references/design/personas.md:162`
  - Current: `$wf-design:setup`
  - Expected: `$wf-design setup`

Impact:
- These instructions route users and agents to commands/skills that do not
  exist in the Codex package.

Recommended fix:
- Replace all generated hyphen-router and colon-router spellings with the
  canonical Codex skill invocations.
- Add a regression check for invalid router spellings:
  - `$wf-intake`, `$wf-shape`, `$wf-slice`, `$wf-plan`, `$wf-implement`
  - `$wf-verify`, `$wf-review`, `$wf-handoff`, `$wf-ship`, `$wf-retro`
  - `$wf-hotfix`, `$wf-design:setup`

### P1: Workflow References Recommend Claude `/compact`

Two Codex workflow references tell users to run Claude Code's `/compact`
slash-command.

Evidence:
- `skills/wf/reference/plan.md:367`
- `skills/wf/reference/implement.md:181`

Impact:
- Codex users are instructed to run a command that is not part of the Codex
  skill surface.

Recommended fix:
- Replace `/compact` guidance with host-neutral wording such as "continue after
  context compaction if available" or Codex-specific thread/session guidance.
- Keep the useful artifact-state explanation, but remove the Claude slash
  command.

### P2: Runtime Adapter Guidance References Claude Tools

`skills/wf/reference/runtime-adapters.md` still recommends Claude-specific
browser MCP tools and Claude/Anthropic-specific helper skills.

Evidence:
- `skills/wf/reference/runtime-adapters.md:96` references
  `mcp__claude-in-chrome__*`.
- `skills/wf/reference/runtime-adapters.md:97-102` lists Claude-in-Chrome tool
  names.
- `skills/wf/reference/runtime-adapters.md:150` references `claude-api` and
  `claude-code-guide`.
- `skills/wf/reference/runtime-adapters.md:151` references
  `mcp__Claude_in_Chrome__*` and `mcp__Claude_Preview__*`.

Impact:
- Codex workflows may ask for unavailable Claude MCP tools instead of the
  Browser plugin, Playwright, or other Codex-native capabilities.

Recommended fix:
- Replace Claude MCP browser references with Codex Browser plugin guidance and
  Playwright fallback guidance.
- Replace `claude-api` / `claude-code-guide` with OpenAI/Codex documentation
  guidance where the work involves OpenAI products, or host-neutral AI assistant
  guidance otherwise.

### P2: Timestamp Instructions Are Bash/POSIX-First

Multiple Codex skill references instruct agents to use Bash or raw POSIX `date`
commands for timestamps. This is not host-neutral and is wrong in
Windows/PowerShell Codex contexts.

Evidence:
- `skills/wf-quick/SKILL.md:79`
- `skills/wf-docs/SKILL.md:40`
- `skills/wf-docs/SKILL.md:308`
- `skills/wf-quick/reference/discover.md:143`
- `skills/wf-quick/reference/fix.md:103`
- `skills/wf-quick/reference/hotfix.md:77`
- `skills/wf-quick/reference/hotfix.md:200`
- `skills/wf-quick/reference/ideate.md:326`
- `skills/wf-quick/reference/investigate.md:139`
- `skills/wf-quick/reference/probe.md:260`
- `skills/wf-quick/reference/rca.md:132`
- `skills/wf-quick/reference/refactor.md:80`
- `skills/wf-quick/reference/refactor.md:287`
- `skills/wf-quick/reference/simplify.md:69`
- `skills/wf-quick/reference/update-deps.md:54`
- `skills/wf-quick/reference/update-deps.md:86`
- `skills/wf-quick/reference/update-deps.md:298`
- `skills/wf/reference/benchmark.md:129`
- `skills/wf/reference/experiment.md:113`
- `skills/wf/reference/handoff.md:93`
- `skills/wf/reference/implement.md:136`
- `skills/wf/reference/instrument.md:121`
- `skills/wf/reference/intake.md:107`
- `skills/wf/reference/plan.md:240`
- `skills/wf/reference/profile.md:50`
- `skills/wf/reference/profile.md:154`
- `skills/wf/reference/retro.md:114`
- `skills/wf/reference/review.md:125`
- `skills/wf/reference/shape.md:149`
- `skills/wf/reference/ship.md:80`
- `skills/wf/reference/ship.md:87`
- `skills/wf/reference/slice.md:58`
- `skills/wf/reference/verify.md:288`
- `skills/wf-meta/reference/close.md:97`
- `skills/wf-meta/reference/how.md:382`
- `skills/wf-meta/reference/resume.md:99`
- `skills/wf-meta/reference/skip.md:97`
- `skills/wf-meta/reference/status.md:63`
- `skills/error-analysis/references/log-patterns.md:85`
- `skills/review/reference/accessibility.md:950`
- `skills/review/reference/api-contracts.md:654`
- `skills/review/reference/cost.md:814`
- `skills/review/reference/data-integrity.md:1096`
- `skills/review/reference/dx.md:1209`

Impact:
- Codex may run in PowerShell or another shell, so Bash/POSIX timestamp
  instructions cause unnecessary failures or require manual translation.

Recommended fix:
- Replace "via Bash" and raw `date` requirements with host-neutral wording:
  - "Use the available shell or time tool to get the real current UTC time."
  - POSIX example: `date -u +"%Y-%m-%dT%H:%M:%SZ"`
  - PowerShell example:
    `(Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")`
- For file append examples using `$(date +%Y-%m-%d)`, use a language-neutral
  placeholder or include a PowerShell equivalent.

### P2: Anthropic-Branded Schema ID Remains in Codex Runtime

The runtime schema ID still points at an Anthropic URL.

Evidence:
- `runtime/tests/frontmatter.schema.json:3` has
  `https://anthropic.com/plugins/sdlc-workflow/frontmatter.schema.json`.

Impact:
- Low runtime risk, but it leaks the wrong authority into the Codex package.

Recommended fix:
- Use a host-neutral schema ID, such as an `sdlc-workflow` project URL, or a
  local/package schema identifier.

### P3: Design Guidance Names Claude

`references/design/design-guidelines.md` contains model-specific encouragement.

Evidence:
- `references/design/design-guidelines.md:262` says "Claude is capable of
  extraordinary creative work."

Impact:
- Minor wording claudism in a Codex reference file.

Recommended fix:
- Replace with host-neutral wording, such as "The agent is capable..." or
  "Codex is capable...".

### P3: Retro Guidance Centers CLAUDE.md

The retro reference still treats `CLAUDE.md` as a normal Codex output target.

Evidence:
- `skills/wf/reference/retro.md:90` has "AGENTS.md / CLAUDE.md gaps".
- `skills/wf/reference/retro.md:91` tells the agent to read `AGENTS.md` and
  `CLAUDE.md`.
- `skills/wf/reference/retro.md:133` suggests updates for `AGENTS.md`,
  `CLAUDE.md`, hooks, tests, CI checks, and skill prompts.
- `skills/wf/reference/retro.md:195` asks for additions or edits for
  `AGENTS.md / CLAUDE.md`.

Impact:
- Codex should prioritize `AGENTS.md`; `CLAUDE.md` should be interop-only if it
  already exists.

Recommended fix:
- Make `AGENTS.md` primary.
- Mention `CLAUDE.md` only as optional interop when present in a dual-host repo.

### P3: Review References Say "Slash-Command Names"

Five review references still use "slash-command names" in hidden-context
guidance.

Evidence:
- `skills/review/reference/security.md:22`
- `skills/review/reference/style-consistency.md:22`
- `skills/review/reference/supply-chain.md:22`
- `skills/review/reference/testing.md:22`
- `skills/review/reference/ux-copy.md:8`

Impact:
- Minor terminology mismatch. Codex uses skill invocation names, not Claude
  slash commands.

Recommended fix:
- Replace "slash-command names" with "skill invocation names".

### P3: Mandatory Search Examples Are Often Unix-Only

This is a lower-confidence claudism: many skill/reference files still assume a
Unix shell for discovery snippets. This is only counted here when the snippet is
presented as an operational step rather than an illustrative example.

Examples:
- `skills/setup-wide-logging/SKILL.md:39-95` uses Bash fences with `cat`,
  `grep`, `cut`, `sort`, and `uniq` for required discovery.
- `skills/refactoring-patterns/SKILL.md:213-215` shows `grep` and `sed -i`.
- `skills/refactoring-patterns/references/rename-patterns.md:9-39` shows
  `grep`, `find`, and `sed -i`.
- `skills/error-analysis/SKILL.md:183-201` uses Bash/grep log commands.
- `skills/error-analysis/references/log-patterns.md:27-251` uses Unix log
  analysis commands throughout.
- `skills/wf-design/reference/extract.md:17-37` uses `grep -r` for design token
  extraction.

Impact:
- Codex on Windows/PowerShell has to translate these commands.
- The issue is less severe than direct Claude/slash-command leftovers because
  the agent can usually adapt generic search examples.

Recommended fix:
- Prefer host-neutral wording: "use the fastest available search tool; prefer
  `rg` when present."
- Where commands are mandatory, provide PowerShell and POSIX examples or avoid
  shell-specific syntax entirely.

## File-by-File Skills and References Ledger

### Shared References

| File | Result |
| --- | --- |
| `references/artifact-interop.md` | Intentional Claude/Codex interop; non-finding |
| `references/fragment-author-contract.md` | Clean; legacy asset path references are non-findings |
| `references/native-operating-model.md` | Intentional Claude/Codex interop; non-finding |
| `references/narrative-fragments.md` | Clean |
| `references/shared-hub.md` | Intentional Claude/Codex interop; non-finding |
| `references/verification.md` | Clean |
| `references/design/cognitive-load.md` | Clean |
| `references/design/color-and-contrast.md` | Clean |
| `references/design/craft.md` | Clean |
| `references/design/design-guidelines.md` | P1 invalid `$wf-design:setup`; P3 names Claude |
| `references/design/extract.md` | Clean |
| `references/design/heuristics-scoring.md` | Clean |
| `references/design/interaction-design.md` | Clean |
| `references/design/motion-design.md` | Clean |
| `references/design/personas.md` | P1 invalid `$wf-design:setup` |
| `references/design/responsive-design.md` | Clean |
| `references/design/spatial-design.md` | Clean |
| `references/design/typography.md` | Clean |
| `references/design/ux-writing.md` | Clean |

### Top-Level Skill Files and Agents

| File | Result |
| --- | --- |
| `skills/error-analysis/SKILL.md` | P3 Unix-only operational snippets |
| `skills/error-analysis/agents/openai.yaml` | Clean |
| `skills/refactoring-patterns/SKILL.md` | P3 Unix-only operational snippets |
| `skills/refactoring-patterns/agents/openai.yaml` | Clean |
| `skills/review/SKILL.md` | Clean |
| `skills/review/agents/openai.yaml` | Clean |
| `skills/setup-wide-logging/SKILL.md` | P3 Unix-only operational snippets |
| `skills/setup-wide-logging/agents/openai.yaml` | Clean |
| `skills/test-patterns/SKILL.md` | Clean |
| `skills/test-patterns/agents/openai.yaml` | Clean |
| `skills/wf/SKILL.md` | Clean |
| `skills/wf/agents/openai.yaml` | Clean |
| `skills/wf-design/SKILL.md` | Clean for claudisms |
| `skills/wf-design/agents/openai.yaml` | Clean |
| `skills/wf-docs/SKILL.md` | P2 timestamp shell assumptions |
| `skills/wf-docs/agents/openai.yaml` | Clean |
| `skills/wf-meta/SKILL.md` | Clean |
| `skills/wf-meta/agents/openai.yaml` | Clean |
| `skills/wf-quick/SKILL.md` | P2 timestamp shell assumptions |
| `skills/wf-quick/agents/openai.yaml` | Clean |
| `skills/wide-event-observability/SKILL.md` | Clean |
| `skills/wide-event-observability/agents/openai.yaml` | Clean |

### `skills/wf/reference`

| File | Result |
| --- | --- |
| `skills/wf/reference/_fragment-authoring.md` | Clean |
| `skills/wf/reference/benchmark.md` | P2 timestamp shell assumptions |
| `skills/wf/reference/experiment.md` | P2 timestamp shell assumptions |
| `skills/wf/reference/handoff.md` | P2 timestamp shell assumptions |
| `skills/wf/reference/implement.md` | P1 `/compact`; P2 timestamp shell assumptions |
| `skills/wf/reference/instrument.md` | P2 timestamp shell assumptions |
| `skills/wf/reference/intake.md` | P2 timestamp shell assumptions |
| `skills/wf/reference/plan.md` | P1 `/compact`; P2 timestamp shell assumptions |
| `skills/wf/reference/profile.md` | P2 timestamp shell assumptions |
| `skills/wf/reference/retro.md` | P2 timestamp shell assumptions; P3 `CLAUDE.md` target |
| `skills/wf/reference/review.md` | P2 timestamp shell assumptions |
| `skills/wf/reference/runtime-adapters.md` | P2 Claude MCP/tool guidance; P3 Unix-only snippets |
| `skills/wf/reference/shape.md` | P2 timestamp shell assumptions |
| `skills/wf/reference/ship.md` | P2 timestamp shell assumptions |
| `skills/wf/reference/slice.md` | P2 timestamp shell assumptions |
| `skills/wf/reference/verify.md` | P2 timestamp shell assumptions |

### `skills/wf-quick/reference`

| File | Result |
| --- | --- |
| `skills/wf-quick/reference/discover.md` | P2 timestamp shell assumptions |
| `skills/wf-quick/reference/fix.md` | P2 timestamp shell assumptions |
| `skills/wf-quick/reference/hotfix.md` | P1 invalid `$wf-review`; P2 timestamp shell assumptions |
| `skills/wf-quick/reference/ideate.md` | P1 invalid `$wf-intake`; P2 timestamp shell assumptions |
| `skills/wf-quick/reference/investigate.md` | P2 timestamp shell assumptions |
| `skills/wf-quick/reference/probe.md` | P2 timestamp shell assumptions |
| `skills/wf-quick/reference/rca.md` | P1 invalid `$wf-hotfix`; P2 timestamp shell assumptions |
| `skills/wf-quick/reference/refactor.md` | P2 timestamp shell assumptions |
| `skills/wf-quick/reference/simplify.md` | P2 timestamp shell assumptions |
| `skills/wf-quick/reference/update-deps.md` | P2 timestamp shell assumptions |

### `skills/wf-meta/reference`

| File | Result |
| --- | --- |
| `skills/wf-meta/reference/amend.md` | Clean |
| `skills/wf-meta/reference/announce.md` | Clean |
| `skills/wf-meta/reference/build-pipeline.md` | Clean |
| `skills/wf-meta/reference/close.md` | P2 timestamp shell assumptions |
| `skills/wf-meta/reference/extend.md` | Clean |
| `skills/wf-meta/reference/how.md` | P2 timestamp shell assumptions |
| `skills/wf-meta/reference/init-ship-plan.md` | Clean |
| `skills/wf-meta/reference/next.md` | Clean |
| `skills/wf-meta/reference/resume.md` | P2 timestamp shell assumptions |
| `skills/wf-meta/reference/skip.md` | P2 timestamp shell assumptions |
| `skills/wf-meta/reference/status.md` | P2 timestamp shell assumptions |
| `skills/wf-meta/reference/sync.md` | Clean |
| `skills/wf-meta/reference/ship-plan-templates/container-image.md` | Clean; `$IMAGE:$VERSION` is shell syntax, not a router claudism |
| `skills/wf-meta/reference/ship-plan-templates/kotlin-maven-central.md` | Clean |
| `skills/wf-meta/reference/ship-plan-templates/library-internal.md` | Clean |
| `skills/wf-meta/reference/ship-plan-templates/npm-public.md` | Clean |
| `skills/wf-meta/reference/ship-plan-templates/pypi.md` | Clean |
| `skills/wf-meta/reference/ship-plan-templates/server-deploy.md` | Clean |

### `skills/wf-design/reference`

| File | Result |
| --- | --- |
| `skills/wf-design/reference/adapt.md` | Clean |
| `skills/wf-design/reference/animate.md` | Clean |
| `skills/wf-design/reference/audit.md` | Clean |
| `skills/wf-design/reference/bolder.md` | Clean |
| `skills/wf-design/reference/brand.md` | Clean |
| `skills/wf-design/reference/clarify.md` | Clean |
| `skills/wf-design/reference/colorize.md` | Clean |
| `skills/wf-design/reference/craft.md` | P1 invalid `$wf-plan` |
| `skills/wf-design/reference/critique.md` | Clean |
| `skills/wf-design/reference/delight.md` | Clean |
| `skills/wf-design/reference/distill.md` | Clean |
| `skills/wf-design/reference/extract.md` | P3 Unix-only operational snippets |
| `skills/wf-design/reference/harden.md` | Clean |
| `skills/wf-design/reference/layout.md` | Clean |
| `skills/wf-design/reference/onboard.md` | Clean |
| `skills/wf-design/reference/optimize.md` | P3 Unix-only operational snippets |
| `skills/wf-design/reference/overdrive.md` | Clean |
| `skills/wf-design/reference/polish.md` | Clean |
| `skills/wf-design/reference/product.md` | Clean |
| `skills/wf-design/reference/quieter.md` | Clean |
| `skills/wf-design/reference/setup.md` | Clean |
| `skills/wf-design/reference/shape.md` | Clean |
| `skills/wf-design/reference/teach.md` | Clean |
| `skills/wf-design/reference/typeset.md` | Clean |

### `skills/wf-docs/reference`

| File | Result |
| --- | --- |
| `skills/wf-docs/reference/explanation.md` | Clean |
| `skills/wf-docs/reference/how-to.md` | Clean |
| `skills/wf-docs/reference/plan.md` | Clean |
| `skills/wf-docs/reference/readme.md` | Clean |
| `skills/wf-docs/reference/reference.md` | Clean |
| `skills/wf-docs/reference/review.md` | Clean |
| `skills/wf-docs/reference/tutorial.md` | Clean |

### `skills/review/reference`

| File | Result |
| --- | --- |
| `skills/review/reference/accessibility.md` | P2 timestamp shell assumptions |
| `skills/review/reference/api-contracts.md` | P2 timestamp shell assumptions |
| `skills/review/reference/architecture.md` | Clean |
| `skills/review/reference/backend-concurrency.md` | Clean for claudisms; contains generic shell examples |
| `skills/review/reference/ci.md` | Clean for claudisms; contains generic shell examples |
| `skills/review/reference/code-simplification.md` | Clean |
| `skills/review/reference/correctness.md` | Clean |
| `skills/review/reference/cost.md` | P2 timestamp shell assumptions |
| `skills/review/reference/data-integrity.md` | P2 timestamp shell assumptions |
| `skills/review/reference/docs.md` | Clean |
| `skills/review/reference/dx.md` | P2 timestamp shell assumptions |
| `skills/review/reference/frontend-accessibility.md` | Clean |
| `skills/review/reference/frontend-performance.md` | Clean |
| `skills/review/reference/infra.md` | Clean for claudisms; contains generic shell examples |
| `skills/review/reference/infra-security.md` | Clean |
| `skills/review/reference/logging.md` | Clean for claudisms; contains generic shell examples |
| `skills/review/reference/maintainability.md` | Clean |
| `skills/review/reference/migrations.md` | Clean for claudisms; contains generic shell examples |
| `skills/review/reference/observability.md` | Clean for claudisms; contains generic shell examples |
| `skills/review/reference/overengineering.md` | Clean |
| `skills/review/reference/performance.md` | Clean for claudisms; contains generic shell examples |
| `skills/review/reference/privacy.md` | Clean for claudisms; contains generic shell examples |
| `skills/review/reference/refactor-safety.md` | Clean |
| `skills/review/reference/release.md` | Clean for claudisms; contains generic shell examples |
| `skills/review/reference/reliability.md` | Clean for claudisms; contains generic shell examples |
| `skills/review/reference/scalability.md` | Clean for claudisms; contains generic shell examples |
| `skills/review/reference/security.md` | P3 "slash-command names"; generic shell examples |
| `skills/review/reference/style-consistency.md` | P3 "slash-command names"; generic shell examples |
| `skills/review/reference/supply-chain.md` | P3 "slash-command names"; generic shell examples |
| `skills/review/reference/testing.md` | P3 "slash-command names"; generic shell examples |
| `skills/review/reference/ux-copy.md` | P3 "slash-command names"; generic shell examples |

### `skills/error-analysis/references`

| File | Result |
| --- | --- |
| `skills/error-analysis/references/error-categorization.md` | Clean |
| `skills/error-analysis/references/fix-patterns.md` | Clean for claudisms; contains generic shell examples |
| `skills/error-analysis/references/log-patterns.md` | P2 timestamp shell assumptions; P3 Unix-only operational snippets |
| `skills/error-analysis/references/root-cause-analysis.md` | P3 Unix-only operational snippets |

### `skills/refactoring-patterns/references`

| File | Result |
| --- | --- |
| `skills/refactoring-patterns/references/extract-patterns.md` | Clean |
| `skills/refactoring-patterns/references/move-patterns.md` | Clean |
| `skills/refactoring-patterns/references/rename-patterns.md` | P3 Unix-only operational snippets |
| `skills/refactoring-patterns/references/simplify-patterns.md` | P3 Unix-only operational snippets |

### `skills/test-patterns/references`

| File | Result |
| --- | --- |
| `skills/test-patterns/references/coverage-strategies.md` | Clean for claudisms; contains generic shell examples |
| `skills/test-patterns/references/integration-test-patterns.md` | Clean |
| `skills/test-patterns/references/test-data-factories.md` | Clean |
| `skills/test-patterns/references/unit-test-patterns.md` | Clean |

## Non-Findings

The following are intentional or acceptable in context:
- Claude/Codex interop references in:
  - `README.md`
  - `MIGRATION.md`
  - `docs/internal/*`
  - `references/shared-hub.md`
  - `references/artifact-interop.md`
  - `references/native-operating-model.md`
- `next-command: wf-*` artifact field values. These are internal stage IDs, not
  user-facing invocation names.
- Paths containing `/wf/reference/...` or file names such as
  `review-security.md`. These are repository paths, not slash commands.
- Valid Codex skill invocations such as `$wf plan`, `$wf-meta status`,
  `$wf-quick fix`, `$wf-design craft`, `$wf-docs readme`, and `$review security`.
- `$IMAGE:$VERSION` and similar shell variable syntax in ship-plan templates.
- Generic shell examples in review references, unless they are mandatory
  timestamp/artifact-update mechanics.

## Verification Run

Targeted scans used for this audit:

```sh
rg -n -i "claude|anthropic|mcp__claude|mcp__Claude|claude-api|claude-code-guide|CLAUDE\.md" plugins/sdlc-workflow-codex/skills plugins/sdlc-workflow-codex/references
rg -n -i "slash-command|slash command|/compact" plugins/sdlc-workflow-codex/skills plugins/sdlc-workflow-codex/references
rg -n "\$wf-(intake|shape|slice|plan|implement|verify|review|handoff|ship|retro|hotfix)|\$wf-design:|\$review-" plugins/sdlc-workflow-codex/skills plugins/sdlc-workflow-codex/references
rg -n -i "via Bash|date -u|date \+|\$\(date \+" plugins/sdlc-workflow-codex/skills plugins/sdlc-workflow-codex/references
```

Existing package gates noted during review:

```sh
npm test
npm run verify:no-legacy
```

The existing gates do not currently catch:
- Claude wording in generated docs.
- Invalid Codex router spellings.
- `/compact` in Codex-facing workflow references.
- Runtime provenance defaulting to `claude`.
- Bash/POSIX-specific timestamp wording.

## Suggested Regression Checks

Add a Codex package audit script that fails on:
- User-facing `/wf`, `/wf-meta`, `/wf-quick`, `/wf-design`, `/wf-docs`, or
  `/review` in Codex docs, excluding paths and migration docs.
- `/compact` in Codex-facing skills and references.
- Invalid router spellings:
  - `$wf-intake`
  - `$wf-shape`
  - `$wf-slice`
  - `$wf-plan`
  - `$wf-implement`
  - `$wf-verify`
  - `$wf-review`
  - `$wf-handoff`
  - `$wf-ship`
  - `$wf-retro`
  - `$wf-hotfix`
  - `$wf-design:setup`
- Claude-specific tools in `skills/**`:
  - `mcp__claude`
  - `claude-api`
  - `claude-code-guide`
- `CLAUDE.md` as a primary Codex output target.
- "slash-command names" in Codex review references.
- `via Bash` and raw `date -u` timestamp requirements in Codex skill
  references.
- Runtime queue provenance hard-coded to `host: "claude"` in Codex-distributed
  runtime entrypoints.
