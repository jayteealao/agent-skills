# A pi extension inside sdlc-workflow

Status: **DRAFTED 2026-09-16** against v9.157.0. Nothing built. The plan
replaces the standalone `pi-sdlc` project and the `pi-unified` meta-package
with one extension package under `plugins/sdlc-workflow/pi/`, shipped in the
same release as the plugin. It reads the skills as they are, bundles the pi
packages that give pi its Claude Code compatibility, and carries the same
session aids the Claude Code mod carries ([MOD-FEATURES.md](MOD-FEATURES.md)).

## 1. Decisions

1. **The skills stay the source.** No native re-implementation of any stage.
   pi runs `/skill:wf …` through pi-code, which loads the plugin from the
   Claude Code plugin cache, substitutes `${CLAUDE_PLUGIN_ROOT}`, and runs
   `hooks/hooks.json` with Claude's tool vocabulary — the path
   `_host-invocation.md` already documents for pi.
2. **One package, in the plugin tree.** `plugins/sdlc-workflow/pi/` is a pi
   package (`pi.extensions`, `bundledDependencies`) versioned with the
   plugin. `pi install <checkout>/plugins/sdlc-workflow/pi` installs it.
3. **pi-unified's content moves in.** Its `extensions/unified.ts`, its
   `scripts/check.mjs`, and its manifest pattern become the package's
   foundation. pi-unified and pi-sdlc are then removed from the machine;
   the three packages register the same tool names and cannot coexist.
4. **`@juicesharp/rpiv-ask-user-question` joins the bundle.** It owns the
   questionnaire; pi-code's `question.ts` is excluded. Its tool is
   `ask_user_question` with the same parameter shape as Claude's
   `AskUserQuestion` (1–4 questions, `header`, 2–4 options with `label` and
   `description`, `multiSelect`).
5. **`/wf yolo` runs on pi** through pi-subagents' `SubagentWorkflow`, which
   runs a Claude Code `Workflow` script unchanged (`scriptPath`, `args`,
   `meta`, `agent()`, `parallel()`, `pipeline()`, `phase()`, `log()`,
   `schema`, `gate`, a `budget` stub, no `Date.now()`). `yolo.md` loses its
   "Claude Code only" banner for pi.
6. **The mod's pure modules are shared, not copied.** `hooks/mod/active.ts`,
   `picker.ts`, `workflows.ts`, `catalog.ts`, and `names.ts` import nothing
   from `claude-code`; the pi extension imports them by relative path. Only
   the host binding (`register.ts`, `views.tsx`, `strip.tsx`) has a pi
   counterpart.
7. **One settings source for both hosts.** The eight switches are read from
   Claude's `pluginConfigs.sdlc-workflow` in `~/.claude/settings.json` (the
   same rows `/config` writes on Claude Code), with an optional override
   file `~/.pi/agent/sdlc-workflow.json`.

## 2. What pi-sdlc is, and what to take from it

pi-sdlc (`C:/Users/jayte/Documents/dev/pi-sdlc`) is 38 693 lines of TypeScript
under `src/` across 15 phases. It re-implements every stage's authority in
code (dispatch, transactional artifacts, gate broker, evidence checks, budget
admission, publication batches, remediation, its own hub, its own ports of
rpiv and pi-dynamic-workflows), imports a frozen 265-file snapshot of the
skills (source version 9.154.1) through a provenance pipeline, pins pi
0.85.1 and Node 24 on win32 only, and refuses to run beside pi-unified. Every
skill change needs a re-import and a review digest. That is the
over-engineering: the skills are the product, and pi-sdlc makes them a
dependency of a second product.

The host layer under `src/adapters/pi/` (4 429 lines) is the part that
answers the same questions this plan answers. Take from it:

| pi-sdlc file | Take | Becomes |
| --- | --- | --- |
| `sub-extensions.ts` + `docs/SUB-EXTENSIONS.md` | the bundling manifest pattern, the owner-path classification, the conflict report and its advice text | `pi/extensions/unified.ts` §5 W1 |
| `checklist-widget.ts` | the `setWidget` above-editor component (adapted from pi-code's `todo.ts`, MIT notice kept) | the strip widget, W5 |
| `commands.ts` | the `/wf` chooser's argument-completion callback | the picker, W4 |
| `compaction.ts` | keeping the stage reference through compaction | the run header, W6 |
| `session-context.ts` | the `context` event handler that prepends a run header | the run header, W6 |
| `capabilities.ts` | the capability probes at `session_start` (`hasUI`, TTY, RPC) | the doctor rows, W1 |
| `tests/unit/*` | the fake `ExtensionAPI` harness | `pi/tests/`, W8 |

Leave everything else: `application/`, `domain/`, `gates/`, `effects/`,
`evidence/`, `orchestration/`, `persistence/`, `publication/`,
`remediation/`, `release/`, `usage/`, `questions/`, `hub/`, `checkpoints/`,
`git/`, `process/`, `support/`, `agents/`, `artifacts/`, the `vendor/` source
ports (the packages are dependencies instead), the import and provenance
scripts, and `bin/`.

## 3. Feature parity: the Claude mod on pi

The pi extension API (`@earendil-works/pi-coding-agent` 0.85, `ExtensionAPI`)
has a counterpart for every feature except the dim prompt suggestion and the
footer mode label.

| Feature | Claude Code mechanism | pi mechanism | Departure |
| --- | --- | --- | --- |
| `/wf` picker | 22 registered commands, band Buttons, `$.prompt.fill` | `pi.registerCommand('wf', { handler, getArgumentCompletions })`: completions from `picker.ts` (keys, then slugs, then slices) as the person types; a bare or incomplete `/wf` opens `ctx.ui.select` step by step; the last pick calls `ctx.ui.setEditorText('/skill:wf <key> <slug> <slice> ')` | one list per step in the dialog, no paging or filter field (pi's select scrolls and filters itself) |
| strip | `AbovePrompt` rows | `ctx.ui.setWidget('wf-strip', [row, costRow])` above the editor | none |
| status line | `$.ui.status` | `ctx.ui.setStatus('wf', text)` in the footer | none |
| mode label | `SessionMode` | folded into the status text | no mode-label list in pi |
| cost row | `$.session.usage().cost.usd` | session entries through `ctx.sessionManager` (`message.usage`, the reader `lib/cost-ledger.mjs` already has for pi transcripts) | probe P-pi3 |
| next-step suggestion | `$.prompt.suggest`, Tab | `pi.registerShortcut('ctrl+.', …)` fills the editor with `next-invocation`; the strip row says `next: … (ctrl+.)` | no dim suggestion in pi |
| stage check | `turn.start` / `turn.complete` / `tool.call` Write, Edit | `agent_start` / `agent_end` / `tool_execution_end` on `write`, `edit`; the command from the `input` event's text (`/skill:wf …`) | none |
| question count | `tool.call` + `ui.render` rewrite | `tool_call` on `ask_user_question`: count, and append `(question N, floor 20)` to each `questions[].question` in place (the in-place pattern `unified.ts` already uses for `Agent`) | probe P-pi2 |
| driver status | five-second timer + `$.ui.status` | `setInterval` + `ctx.ui.setStatus`; pi-subagents' own workflow card shows the live agents beside it | none |
| spinner verb | `Spinner.word` | `ctx.ui.setWorkingMessage('Implementing auth')` at `agent_start`, reset at `agent_end` | none |
| hub notice | `InfoNotice` line + toasts | `ctx.ui.notify(text, 'info')` once at `session_start`; `notify(…, 'warning')` on a state change | a notify, not a pinned line |
| dashboard | `Pane` | `/wf-dashboard` opens `ctx.ui.custom(...)`: the same rows, `s` fills `/skill:wf status <slug>`, `p` opens the picker at the slice step, Esc closes | overlay, not docked |
| settings | `userConfig` + `config.set` | `pluginConfigs.sdlc-workflow` from `~/.claude/settings.json`, override `~/.pi/agent/sdlc-workflow.json`, `/wf-settings` prints the table | no live switch UI; `/reload` applies |
| `/wf-doctor` | classic | the same, with rows for the pi install and the package ownership report | none |

## 4. The package

```
plugins/sdlc-workflow/pi/
  package.json          name sdlc-workflow-pi · version = plugin version (8th carrier)
  tsconfig.json         from pi-unified
  extensions/
    index.ts            registers the three modules below in order
    unified.ts          from pi-unified, extended (§5 W1)
    wf-picker.ts        W4
    wf-aids.ts          W5–W7
  scripts/check.mjs     from pi-unified: ownership and conflict check
  tests/                fake ExtensionAPI harness, W8
```

`package.json`:

```json
{
  "name": "sdlc-workflow-pi",
  "version": "9.158.0",
  "type": "module",
  "dependencies": {
    "pi-code": "1.0.64",
    "pi-web-access": "0.27.0",
    "@tintinweb/pi-subagents": "0.19.0",
    "@juicesharp/rpiv-ask-user-question": "2.9.0"
  },
  "bundledDependencies": ["pi-code", "pi-web-access", "@tintinweb/pi-subagents", "@juicesharp/rpiv-ask-user-question"],
  "peerDependencies": { "@earendil-works/pi-coding-agent": "*" },
  "pi": {
    "extensions": [
      "./extensions",
      "./node_modules/pi-web-access/index.ts",
      "./node_modules/pi-code/extensions",
      "-node_modules/pi-code/extensions/web.ts",
      "-node_modules/pi-code/extensions/subagent/index.ts",
      "-node_modules/pi-code/extensions/question.ts",
      "./node_modules/@tintinweb/pi-subagents/src/index.ts",
      "./node_modules/@juicesharp/rpiv-ask-user-question/index.ts"
    ]
  }
}
```

Ownership after load (the `/unified` report, extended):

| Name | Owner | Excluded provider |
| --- | --- | --- |
| `web_search`, `web_fetch`, `source_check`, `get_search_content` | pi-web-access | pi-code `web.ts` |
| `Agent`, `SubagentWorkflow`, `get_subagent_result`, `steer_subagent`, `/agents` | pi-subagents | pi-code `subagent/index.ts` |
| `ask_user_question` | rpiv-ask-user-question | pi-code `question.ts` (`question`) |
| hooks, commands, skills, output styles, MCP, memory, todo, checkpoints, `/skill:wf` | pi-code | — |
| `/wf`, `/wf-dashboard`, `/wf-doctor`, `/wf-settings`, the widget and status | sdlc-workflow-pi | — |

The Claude plugin itself is not a dependency: pi-code finds it under
`~/.claude/plugins/cache/agent-skills-marketplace/sdlc-workflow/<version>/`
when `enabledPlugins` says true (already so on this machine). The extension
checks at `session_start` that the plugin is present and that its version
equals the extension's own; a mismatch is a warning and a doctor row.

`SDLC_HOST`: the extension sets `process.env.SDLC_HOST ??= 'pi'` at load, so
every hook command pi-code spawns inherits it and the hub attributes the
session to pi (today a pi session reports as `claude`).

## 5. Waves

### W0 — Probes (before any build)

| Probe | Question | Decides |
| --- | --- | --- |
| P-pi1 | Does `pi install <local path>` load the package in place (node_modules present) or copy it? | whether `npm install` in `pi/` is a documented install step |
| P-pi2 | Does a `tool_call` handler's in-place mutation of `event.input.questions[i].question` reach rpiv's dialog? | the question count, W6 |
| P-pi3 | Which `ctx.sessionManager` call yields the session's entries with `message.usage` and cost? | the cost row, W5 |
| P-pi4 | The exact `getArgumentCompletions` signature on `registerCommand` and whether a completion may carry a description | the picker, W4 |
| P-pi5 | `pi --no-extensions -e ./pi --subagents-workflow-file=.scratch/wf/yolo.js` on a fixture repo with one planned slice: does the run reach `agent-start` and `agent-end` rows in `.driver-journal.jsonl`? | W2; the decisive probe |
| P-pi6 | Does pi-code run the plugin's `SessionStart` and `PostToolUse` command hooks from the plugin cache with `SDLC_HOST=pi` inherited? | the hub attribution, W1 |

### W1 — Package foundation

1. Create `pi/` with the manifest above, `tsconfig.json`, and
   `extensions/index.ts`.
2. Copy `pi-unified/extensions/unified.ts` to `pi/extensions/unified.ts`.
   Extend `EXPECTED_TOOLS` with `ask_user_question: 'rpiv-ask-user-question'`
   and `FORBIDDEN_TOOLS` with `question: 'pi-code question extension'`. Keep
   the `Agent` scope alias and the `sdlc:subagent-usage` ledger entry (the
   wide-view cost ledger reads it). Add the plugin-cache version check and
   `SDLC_HOST`.
3. Copy `pi-unified/scripts/check.mjs` to `pi/scripts/check.mjs`.
4. `scripts/stamp-version.mjs` stamps `pi/package.json` (8th carrier);
   `verify:versions` counts eight.
5. `lib/doctor.mjs`: rows `pi install (<path>)` from `~/.pi/agent/settings.json`
   `packages`, and `pi package ownership` from `check.mjs`.
6. Docs: SINGLE-SOURCE-CUTOVER.md gains a pi section (remove pi-unified and
   pi-sdlc, `npm install` in `pi/`, `pi install <path>`); README and the
   installation page name the pi path.
7. On this machine: `pi remove` pi-unified and pi-sdlc, install the package,
   confirm `/unified` reports no conflict and `/skill:wf status` runs.

### W2 — `/wf yolo` on pi

1. `yolo.md`: the banner becomes "Claude Code and pi; under Codex this key is
   unavailable". Step 1 names the host's workflow tool: `Workflow` on Claude
   Code, `SubagentWorkflow` on pi, same arguments. The hand-back paragraph
   covers pi: the run's result reaches the model as context on its next
   turn, and `/agents → Workflows` is the inspector.
2. `_host-invocation.md`: a row for the workflow tool per host.
3. `_gate-question.md` pi row: `ask_user_question` (rpiv), same parameter
   shape; print mode removes the tool.
4. `verify:neutrality`: yolo.md is a named host-contract file already; the
   family list gains `SubagentWorkflow` where it lists `Workflow`.
5. Acceptance: P-pi5 on the fixture, then one real slice on a scratch
   repository; the journal shows `agent-start` and `agent-end`, the driver
   status aid (W5) reads it, and `/wf status` reports the run.
6. Known limits to record: pi-subagents' `budget` always reports no target;
   `resume` continues a child by label only; a second orchestrator extension
   makes pi-subagents stand down (`workflowsEnabled: true` pins it).

### W3 — The shared core

1. A guard test asserts that `active.ts`, `picker.ts`, `workflows.ts`,
   `catalog.ts`, and `names.ts` import nothing from `claude-code` and
   nothing from `views.tsx`, `strip.tsx`, or `register.ts`.
2. `pi/extensions/*.ts` import them as `../../hooks/mod/<file>.ts`. No copy,
   no build step; pi loads TypeScript from source.
3. A `Reader` over `node:fs/promises` for pi (`list`, `read`, `exists`) and
   an `mtime` helper, in `pi/extensions/reader.ts`.

### W4 — The picker on pi

1. `pi.registerCommand('wf', …)`: `getArgumentCompletions` answers the key
   list for an empty argument, the workflow list after a key that takes a
   slug, and the slice list after a slug (from `picker.ts` `keyOptions`,
   `slugOptions`, `sliceOptions`).
2. The handler: complete arguments → `setEditorText('/skill:wf <args> ')`
   and a notify `Press Enter to run`; incomplete → `ctx.ui.select` per step
   (`stepFor`, `pick`), then the same fill.
3. `/wf-<key>` commands are not registered on pi: pi's completion on `/wf `
   covers the key list, and pi-code already exposes `/skill:wf`.

### W5 — The strip, status, cost, spinner, stage check, driver, hub

1. `wf-aids.ts` holds one `Model` (the same fields as the mod's) and the
   same refresh rules: `session_start`, every `tool_execution_end` on `write`
   or `edit` whose path lies under `.ai/workflows`, and `agent_end`.
2. Strip: `setWidget('wf-strip', rows)`; status: `setStatus('wf', text)`;
   both from `stripTextOf` and `statusTextOf`.
3. Cost: `costTextOf(stageUsd, ledgerTokensOf(cost.jsonl))`, the stage
   figure from the session entries (P-pi3).
4. Spinner: `setWorkingMessage(spinnerWordOf(command))` at `agent_start`.
5. Stage check: bracket the turn at `input` (the command text) and
   `agent_start`, collect writes, judge at `agent_end` with
   `expectedArtifactOf` and the file's mtime; `notify(…, 'warning')`.
6. Driver: `driverStatusOf` on a five-second interval from a `/skill:wf
   auto|yolo <slug>` turn on; the same outlive-the-turn rule, one warning at
   presumed dead, hand-back at the next `input`.
7. Hub: `hubHealthOf` over `fetch` once a minute; `notify` at start and on a
   state change.
8. Settings: a `settingsOf(options)` call over the merged Claude
   `pluginConfigs` and the pi override file; `/wf-settings` prints them.

### W6 — The question count, the next-step shortcut, the run header

1. `tool_call` on `ask_user_question` during an intake or shape turn:
   count, and append `(question N, floor 20)` in place (P-pi2).
2. `registerShortcut` for the next invocation: fills the editor with
   `next-invocation` when the editor is empty; the strip row shows the key.
3. From pi-sdlc `session-context.ts` and `compaction.ts`: a `context`
   handler that prepends one `wf-active` line (slug, stage, slice, next
   invocation) to every model request while a workflow is active, and a
   `before_compaction` note to keep it. This is the mod's C4, which Claude
   Code does not have yet; build it on pi first and port it back.

### W7 — The dashboard overlay

`/wf-dashboard` → `ctx.ui.custom`: the same rows as the pane
(`dashboardView`'s data, drawn with pi-tui `Text` rows), keys `↑↓` select,
`s` status, `p` pick, `Esc` close. The findings and blocker counts come from
`openFindingsOf`, `shipPlanBlockersOf`, and `reviewLedgerNameOf`.

### W8 — Tests and gates

1. `pi/tests/fake-api.ts`: a fake `ExtensionAPI` and `ExtensionContext`
   (events, `registerCommand`, `registerShortcut`, `ui.setWidget`,
   `setStatus`, `notify`, `select`, `setEditorText`, `sessionManager`)
   after pi-sdlc's harness.
2. Tests per wave, run by `npm test` through `tests/unit/pi/*.test.mjs`
   (Node, `--experimental-strip-types`), so one gate covers both hosts.
3. `pi/scripts/check.mjs` joins `npm run verify`.
4. `verify:neutrality` families: the pi tool names join the allowlist where
   the Claude names sit.

### W9 — Release

One minor release (9.158.0, catalog 1.184.0) once W1, W2, W4, and W5 are
green; W6, W7 may follow in a patch. CHANGELOG under `[Unreleased]` as each
wave lands. The four hosts reinstall as today, plus `pi install`.

## 6. Open questions for the operator

1. **Install path**: from the dev checkout (`pi install
   <checkout>/plugins/sdlc-workflow/pi`, loads in place, `/reload` after
   edits) or from the Claude plugin cache copy (needs `npm install` there
   after every plugin update). The plan assumes the checkout.
2. **The next-step key**: `ctrl+.` is the proposal; any free pi key works.
3. **Whether `/wf-<key>` commands are wanted on pi** at all, given pi's
   argument completion on `/wf `. The plan says no.

## 7. Risks

- P-pi5 is decisive: if yolo.js needs an `agent()` option pi-subagents lacks,
  W2 falls back to `/wf auto` on pi and the banner stays.
- The plugin cache and the extension are two installs of one version; the
  doctor row is the only guard against drift.
- pi-code's Claude tool-name map has no entry for `ask_user_question`, so a
  classic hook matcher written as `AskUserQuestion` never fires on pi. No
  hook in `hooks/hooks.json` matches it today; keep it so.
- The `docs/site/start/installation.html` page is dirty from another
  session; W1's docs step edits it only after that session commits.
