# The Claude Code mod: every feature built so far

Status: **REFERENCE, written 2026-09-16 at v9.157.0.** This file records what
the function-hooks module under `hooks/mod/` does on Claude Code, where each
feature lives, which engine events it uses, and what is still unverified live.
Two plans hold the design history: [WF-PICKER-UX-PLAN.md](WF-PICKER-UX-PLAN.md)
(the picker) and [WF-MOD-UX-PLAN.md](WF-MOD-UX-PLAN.md) (the session aids).
The pi port plans against this file: [PI-EXTENSION-PLAN.md](PI-EXTENSION-PLAN.md).

## 1. Where it loads

- `hooks/hooks.json` names one module: `"modules": ["./mod/register.ts"]`.
  The classic command hooks in the same file stay; the module adds to them.
- The module loads only when the session sets
  `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`. Without it, `/wf` runs as a plain
  skill and none of the features below exist. Codex and pi never load the
  module: Codex reads `hooks/codex.hooks.json`; pi reads the plugin through
  pi-code, which ignores `modules`.
- The contract is the generated `.claude/types/claude-code.d.ts` (Claude Code
  2.1.271, gitignored, regenerated with `/plugin-types`). Every event, `$`
  method, element, and prop the module uses is taken from that file.
- Each feature except the picker has a boolean switch in the manifest's
  `userConfig` (`.claude-plugin/plugin.json`), shown under `sdlc-workflow` in
  `/config` and read live at `config.set`.

## 2. The files

| File | Lines | Bound to Claude? | Holds |
| --- | ---: | --- | --- |
| `hooks/mod/register.ts` | 859 | yes (`claude-code` types, `$`) | every hook, the model, the timers, the host binding |
| `hooks/mod/views.tsx` | 100 | yes (elements) | the picker band: title row, filter field, numbered rows, more/close |
| `hooks/mod/strip.tsx` | 107 | yes (elements) | the strip rows, the dashboard pane, the notice line |
| `hooks/mod/active.ts` | 428 | **no** | pure helpers: settings, `/wf` command parsing, expected artifacts, strip and status texts, spinner verbs, ledger tokens, driver status, hub health, YAML list items, findings and blocker counts, review-ledger choice |
| `hooks/mod/picker.ts` | 173 | **no** | picker steps, options, paging, filtering, hotkeys, the pick outcome |
| `hooks/mod/workflows.ts` | 212 | **no** | `.ai/workflows` readers behind a `Reader` interface: project root, workflow list, slice roster, furthest stage file |
| `hooks/mod/catalog.ts` | 68 | **no** | the 22 keys with description, argument hint, and argument need |
| `hooks/mod/names.ts` | 30 | **no** | element keys and every user-facing string of the picker |
| `hooks/mod/tests/register.test.ts` | 707 | kit (`claude-code/testing`) | 33 tests through the engine mock |
| `tests/unit/mod/wf-picker.harness.mjs` | — | Node | 25 tests over the pure modules (`--experimental-strip-types`) |

The five unbound files are the seam a second host can share. They import
nothing from `claude-code`; they take a `Reader` and return plain values.

## 3. Feature inventory

### 3.1 The `/wf` picker (v9.155.0 → v9.156.2)

What the person sees: typing `/wf` lists 22 commands `wf-<key>` in the
native typeahead, each with its description and argument hint. Running a
bare `/wf`, a `/wf <key>` that still needs a slug, or any `/wf-<key>` draws a
numbered list in the band above the prompt: the keys, then the workflows
under `.ai/workflows` (active first, closed marked), then the slices of the
picked workflow (roster status and furthest stage file). The last pick
writes the complete command into the prompt box; Enter runs it.

Keys: a digit picks a row from the empty composer; the wheel over the band
and `0` turn the page; `ctrl+x tab` gives the band the keyboard, where the
filter field narrows the rows as the person types, Tab walks the rows and
wraps onto the next page, Enter picks, Esc leaves. Letters past nine are
hotkeys while the band holds the keyboard. A tree taller than `maxRows`
disarms the hotkeys, so the page is sized to the band.

Engine surface: `session.start` (`$.command.register` × 22 + the dashboard),
`command.run` (own commands, and any other command closes the band),
`ui.render { component: 'AbovePrompt' }`, `ui.press { plugin }`,
`ui.scroll { component: 'AbovePrompt' }` (page turn, window stays),
`ui.focus { component: 'AbovePrompt' }` (ring wrap across pages, with the
`$.clock.after(0)` retry when the new tree is not drawn yet),
`prompt.submit` (closes the band), `$.prompt.fill` (writes the draft, never
submits).

Departures recorded on the way: a terminal `Select` is a dropdown, not a
list; Button-only rows lose the arrow keys, so the ring and the wheel are the
paging channels; there is no keystroke hook, so only digits reach the band
from the prompt.

### 3.2 The workflow strip, status line, and mode label (`strip`)

Under the picker (or alone) one row, wrapped to the band's width: `wf
alpha-flow · implement · slice auth (2 of 5 complete) · next: /wf verify
alpha-flow auth`, with a `⇄ N more` button that walks the other active
workflows by slug (`/wf-active [slug]` does the same from the prompt). The
pinned status line (`$.ui.status`) carries what the strip does not: `next
/wf verify alpha-flow auth · $0.42 stage · hub 9.157.0`, so it stays useful
while the plugin panel is hidden (`ctrl+x ctrl+a`). `wf:<stage>` joins the
footer's mode labels (`ui.render { component: 'SessionMode' }`, `modes`
rewritten). A closed workflow reads `wf beta · closed (closed)` and adds no
mode label. The strip's height at the band's width is subtracted from the
picker's page size.

The active workflow is the last one a `/wf` run or a `/wf` prompt named,
else the one whose `00-index.md` has the newest modification time
(`$.fs.stat`). A `tool.call` hook on `Write`, `Edit`, and `NotebookEdit`
refreshes the tree after every write under `.ai/workflows` (after
`next(e)`; a denied or errored write does not count).

### 3.3 The cost row (`cost`)

A dim second row: `$0.42 this stage · 1.2M tokens workflow · sdlc hub
9.157.0 · 15 repos`. The row is absent only when none of the three is known;
a workflow without `cost.jsonl` shows no token figure. The stage
figure is the session cost difference (`$.session.usage().cost.usd`) across
the last `/wf` turn that was not `status` or `recap`; the workflow figure is
the sum of `cost.jsonl` (main and subagent rows; Claude and Codex token
field names, `reasoning_output_tokens` included). Departure: the ledger
holds tokens only, so the workflow figure is tokens, not dollars.

### 3.4 The next step as the prompt suggestion (`suggestNext`)

After a turn that wrote an artifact under `.ai/workflows`, the workflow's
`next-invocation` becomes the prompt box's dim suggestion (`$.prompt.suggest`;
Tab takes it, Enter runs it). The call is deferred past the `turn.complete`
dispatch with `$.clock.after(0)`, because the engine drops a suggestion made
while a turn runs. A `prompt.suggest { origin: { kind: 'suggestion' } }` hook
replaces the engine's own guess with the next invocation while a workflow is
active.

### 3.5 The stage check (`stageCheck`)

A `/wf <key> <slug> [slice]` turn that ends with an answer (`turn.complete`
reason `answer`, not `aborted`) and neither wrote nor touched the stage's
artifact toasts and logs `wf: <key> ended without <file>`. The file is
`02-shape.md`, `03-slice.md`, `04-plan-<slice>.md`, `05-implement-<slice>.md`,
`06-verify-<slice>.md`, `08-handoff.md`, `09-ship.md`, or `10-retro.md`; keys
without one, and a plan/implement/verify without a slice (or with `all`), are
not checked. "Touched" is a modification time at or after the turn's start.

The command comes from `turn.start`'s text, or, when that text is the
expanded skill rather than the typed line, from the dispatcher's own
`command.run` within the previous ten seconds.

### 3.6 The question count (`questionProgress`)

During an intake or shape turn, a `tool.call { tool: /^AskUserQuestion$/ }`
hook counts the calls, and the `ui.render { component: 'AskUserQuestion' }`
hook appends `(question N, floor 20)` to each question in the dialog.
(`AskUserQuestion` is not in the build's builtin tool union, so the matcher
is a RegExp.)

### 3.7 The driver status (`driverStatus`)

From a `/wf auto <slug>` or `/wf yolo <slug>` turn on, a five-second timer
reads `.ai/workflows/<slug>/.driver-journal.jsonl` into the status line:
`yolo · run r3 · implement auth · agent a4 · 14 min · last beat 2 min ago`.
The rule is `_control-file-ownership.md`'s: silence longer than the run's
own longest gap, with a 20-minute floor, is `presumed dead since HH:MM ·
last: <stage> <slice>`. The driver runs in the background past its own turn,
so the watch outlives the turn; at the first presumed-dead reading it toasts
once and stops, and the next turn hands the status line back to the strip.
An `agent-end` row without a stage takes the run's last named stage. The
journal has no terminal hand-back row, so a run that finished normally also
reads presumed dead twenty minutes later.

### 3.8 The spinner verb (`spinnerVerb`)

While a `/wf` turn runs, `ui.render { component: 'Spinner' }` rewrites
`word` to the stage's verb and target: `Implementing auth`, `Handing off
alpha-flow`, `Driving alpha-flow`. Intake keeps the engine's word.

### 3.9 The hub notice (`hubNotice`)

At session start the module reads `~/.sdlc/hub-config.json` (`USERPROFILE`,
then `HOME`; literal names, as the validator requires) and polls
`http://<host>:<port>/__sdlc/health` once a minute (`$.http.fetch`). The
first `InfoNotice` the engine draws gains one dim line: `sdlc hub 9.157.0 ·
15 repos · 2 renders stale · /wf-doctor`, or `sdlc hub down`; the engine's own
text and command stay. A change between up and down is one toast each way.
Without a hub config there is no line.

### 3.10 The dashboard pane (`/wf-dashboard`)

`$.ui.open({ id: 'wf-dashboard', title: 'sdlc workflows' })` opens a pane
(docked beside the transcript in fullscreen, above the prompt otherwise;
`ctrl+x x` closes it, `ui.close { id }` records it). It draws every
workflow with status, stage, slice, and next step, a `status` button that
fills `/wf status <slug>` and a `pick` button that opens the picker at the
slug's slice step; under them each active roster with a three-cell mark per
slice (`▰▰▱` for plan, implement, verify); then one footer line with the
open findings of each review ledger, the ship-plan audit's open BLOCKER and
HIGH findings, and the hub's health.

Ledger rules, from the schemas: a review sibling YAML holds open findings
only, so the count is its `findings:` items in `open`, `deferred`, or
`could-not-fix` (absent counts as open); the sweep-level file wins
(`07-review.yaml`, else the selected slice's, else the last by name), and the
markdown's unchecked rows serve without one. The audit count follows
`auditTriageViolation` in `hooks/post-write-verify.mjs`: `findings:` items
with severity BLOCKER or HIGH and status open.

## 4. Engine facts the build settled

- `userConfig` fields need `type`, `title`, `description`, and `default`;
  the validator refuses a field without a title. Keys arrive at `config.set`
  as `sdlc-workflow.<field>`.
- `$.env.get` takes a literal name; the validator scans the module for it.
- A `tool.call` matcher takes an array of builtin names; a name outside the
  union (`AskUserQuestion`, `MultiEdit`) needs a RegExp.
- `ui.close`'s matcher key is `id`; `Pane` and the other `ui.render`
  matchers accept `requestId`.
- `turn.complete` carries `reason: 'answer' | 'aborted' | 'refusal' |
  'error'`, `answer`, `durationMs`, `isAborted`, `turnId`.
- `$.session.usage()` answers `{ context, rateLimits, cost?: { usd } }`.
- The health answer is `{ ok, version, entries: [{ stale, ... }], ... }`.
- The kit engine raises every event as `$.noun.event(...)`; `$.ui.input`
  and `$.ui.select` are not on it (the filter field is covered by the
  harness only); `mock.clock(on)` answers `{ now, advance, set }`; a bottom
  mock for every op must be registered in the seat before the first `$`
  call; a rewritten render's props are read back through a bottom
  `ui.render` hook, not from the returned tree.

## 5. Live findings and what is still open

First live test, 2026-09-17, Claude Code 2.1.273, the Aperture repository:

- The band can be hidden (`plugin panel hidden · ctrl+x ctrl+a or click to
  show`); while hidden the strip is invisible and only the status line and
  the mode label remain. The status line therefore carries the next step,
  the stage cost, and the hub, not the strip's identity row.
- The strip truncated at the band's width; it now wraps, and the rotate
  button walks the active workflows.
- No line appeared under the logo: a session with no engine notice draws no
  `InfoNotice`, so the hub line had nothing to join. The hub is now in the
  strip's detail row too; the `InfoNotice` hook stays for sessions that
  have a notice.
- No cost row: none of Aperture's workflows has a `cost.jsonl`, so the
  ledger figure was null and the stage figure needs one `/wf` turn first.
- The status line is drawn with a warning glyph (`⚠`) by the engine; a
  plugin status line has no level of its own.
- `ctrl+x tab` to focus the band is the engine's `abovePrompt:focus`
  chord; `~/.claude/keybindings.json` can rebind it (for example `ctrl+f`
  in the `Chat` context).
- `scripts/mod-fixture.mjs <dir>` writes a throwaway repository for the
  tests below; run them there, not on a live project.

Still open:

1. The `userConfig` rows in `/config`.
2. The pane's draw, and its width behaviour under 144 columns.
3. The filter field's `ui.input` wiring.
4. Picker probes P1–P6 of WF-PICKER-UX-PLAN.md.
5. Whether `turn.start`'s text is the typed `/wf` line or the expanded
   skill (the fallback covers both).
6. How many `InfoNotice` instances the engine draws in one session.
