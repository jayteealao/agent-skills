# /wf Mod UX Plan — strip, next step, dashboard, and six session aids

Status: **DRAFTED 2026-09-16** against v9.156.2 (`6932c2ea`); **W1–W7 BUILT 2026-09-16** (unreleased at the time of writing). Departures: the cost row shows the workflow in ledger tokens, not dollars, because `cost.jsonl` records tokens only; the pane is drawn with `userConfig` rows whose schema the validator settled (P8: `type`, `title`, `description`, `default`); P9 answered yes (`mock.clock` has `advance` and `set`); P10 settled from `review/_artifact.md` Step 5b and the triage gate of `post-write-verify.mjs`: a review sibling YAML holds open findings only (`open`, `deferred`, `could-not-fix`), so the count is its `findings:` items in one of those statuses; the audit's blockers are its `findings:` items with severity BLOCKER or HIGH and status open (absent counts as open). Review 2026-09-16 (same day, before release) also moved the driver watch past its own turn (`/wf yolo` runs the driver in the background), added the dispatcher-run fallback for a `turn.start` whose text is the expanded skill, deferred the next-step suggestion past the `turn.complete` dispatch, made the hub and driver switches stop and start their timers, pinned the hub line to one notice, and kept the engine's notice command.
Scope, as the operator chose it on 2026-09-16: candidates C1, C2, and C5 of
[PI-SDLC-MOD-PORT-CANDIDATES.md](PI-SDLC-MOD-PORT-CANDIDATES.md), and the
additions 1, 2, 3, 4, 6, 7, and 8 from the same conversation (the artifact
rows in the transcript, addition 5, are out). Every mechanism below is in
the Claude Code 2.1.271 mod contract (`.claude/types/claude-code.d.ts`)
unless a line says **probe**.

Related: [WF-PICKER-UX-PLAN.md](WF-PICKER-UX-PLAN.md) (the band the strip
shares; its probes P1–P6 are still open), `hooks/mod/` (the module),
[RELEASE-DISCIPLINE.md](RELEASE-DISCIPLINE.md).

## 1. Goal

A person driving `/wf` on Claude Code sees where the workflow stands, what
runs next, how far a questionnaire has come, whether an autonomous run is
alive, what a stage cost, and whether the stage landed, without a model
turn and without leaving the prompt. Every feature is read-only against
the repository and can be switched off in the engine's settings panel.

## 2. The three prompt calls (glossary)

The module uses three engine calls on the prompt box. They differ in what
the person must do next.

| Call | What it does | Person's next act | Used by |
| --- | --- | --- | --- |
| `$.prompt.fill({ text })` | Writes `text` into the prompt box as the person's draft, replacing what the box holds, cursor at the end. Never submits. | Edits or presses Enter | the picker's last pick; a dashboard row |
| `$.prompt.suggest({ text })` | Shows `text` dim in the empty box. Nothing is written until Tab or the right arrow takes it. Core drops it while the box holds text or a turn runs. | Tab, then Enter | W3, the next step |
| `$.prompt.submit({ text })` | Hands the session a prompt as the plugin, run once the session is idle. Starts a turn. | Nothing | not used: the person runs every stage |

## 3. Shared foundation (W1)

Everything below reads the same "active workflow" and refreshes on the
same signal. Build once.

1. **Active workflow.** The workflow the last `/wf` named (from the
   `command.run` hook), else the one whose `00-index.md` has the newest
   mtime under `.ai/workflows` (`$.fs.stat`). Kept in the module's model
   with its index fields (status, current-stage, selected-slice,
   next-invocation) and its roster (`03-slice.md`), through the readers the
   picker already has in `hooks/mod/workflows.ts`.
2. **Artifact watcher.** A `tool.call` hook on `{ tool: 'Write' | 'Edit' |
   'MultiEdit' | 'NotebookEdit' }`: after `next(e)`, when the call's
   `file_path` lies under `<root>/.ai/workflows`, mark the active workflow
   dirty, record the path in the turn's write list, and
   `$.ui.invalidate('ui.render')`. No file watcher exists in the contract;
   this is the only signal, and it covers every write the model makes.
3. **Turn bracket.** `turn.start` records the time, the `/wf` key and
   arguments of the turn when the prompt was a `/wf` command (from
   `prompt.submit`, text starting with `/wf`), the session cost from
   `$.session.usage()`, and clears the write list. `turn.complete` closes
   the bracket; W3, W5, and W6 read it.
4. **One band, one tree.** The band is one instance per plugin. The picker
   and the strip are two views composed in the one `ui.render
   { component: 'AbovePrompt' }` hook: the picker above, the strip beneath,
   both under `stack`. The picker's page size subtracts the strip's rows.
5. **Settings (addition 7).** The manifest gains a `userConfig` block with
   boolean fields, each with a description and a default of true: `strip`,
   `suggestNext`, `stageCheck`, `questionProgress`, `driverStatus`,
   `spinnerVerb`, `cost`, `hubNotice`. Their values arrive as `options` in
   `register(on, options)`; a `config.set` hook on `{ key: /^sdlc-workflow\./ }`
   updates the model and invalidates. The rows appear in the engine's own
   settings panel as `sdlc-workflow.<field>`. **Probe P8:** the exact
   `userConfig` field schema (type, default, description keys) in the
   manifest type at the top of `claude-code.d.ts`.

Files: `hooks/mod/active.ts` (the model and readers), `hooks/mod/register.ts`
(the hooks), `.claude-plugin/plugin.json` (userConfig).

Kit tests: the watcher marks dirty on a write under `.ai/workflows` and
not elsewhere; a `/wf plan alpha-flow` run makes alpha-flow active; the
newest index wins when no command named one; a `config.set` of
`sdlc-workflow.strip` to false hides the strip at the next render.

## 4. W2 — the strip, the status line, the mode label, cost, spinner verb

Candidate C1, additions 6 and 4.

**What the person sees.** Under the picker, or alone, one or two rows:

```
wf alpha-flow · implement · slice auth (2 of 5 complete) · next: /wf verify alpha-flow auth
   $0.42 this stage · $3.10 workflow
```

Under the prompt, the pinned status line holds the first row shortened to
the slug, stage, and slice. The footer's mode labels gain `wf:implement`.
While a `/wf implement auth` turn runs, the spinner reads
`Implementing auth… (12s)`; the verb comes from the key (Shaping, Slicing,
Planning, Implementing, Verifying, Reviewing, Handing off, Shipping,
Reflecting, Designing, Probing, Simplifying, Driving for auto and yolo,
Working, Inspecting, Recapping, Closing, Documenting, Instrumenting;
intake keeps the engine's word).

**Mechanism.**

- Strip: the band hook draws it when the model holds an active workflow
  and `options.strip` is true. Rows: slug, status when not active, stage,
  selected slice with the roster count of complete slices, next invocation
  from `00-index.md`. A closed workflow draws `closed` and no next step.
- Status: `$.ui.status(text)` at every refresh; `undefined` when no
  workflow is active.
- Mode label: `ui.render { component: 'SessionMode' }` returns
  `next({ ...e, props: { modes: [...e.props.modes, 'wf:<stage>'] } })`.
- Cost (addition 6): the stage figure is the session cost at
  `turn.complete` minus the cost at `turn.start`, for the last `/wf` turn;
  the workflow figure sums `.ai/workflows/<slug>/cost.jsonl`, which the
  Stop hook `cost-ledger.mjs` already writes. Drawn only when
  `options.cost` is true and the ledger exists.
- Spinner verb (addition 4): `ui.render { component: 'Spinner' }` while the
  turn bracket holds a `/wf` key: `next({ ...e, props: { ...e.props, word } })`.
  The `message` and `mode` props pass unchanged.

**Row budget.** The strip takes two rows at most; the picker's
`pageSizeOf` subtracts them when both draw, so the band never exceeds
`maxRows` (a scrolling band arms no digit).

Kit tests: the strip text for the fixture workflow; the closed-workflow
row; the status text; the mode label appended; the spinner word during a
`/wf implement` bracket and untouched outside one; the cost rows from a
fixture `cost.jsonl`; `options.strip = false` draws nothing.

## 5. W3 — the next step as the suggestion, and the stage-landed check

Candidate C2 and addition 1, both at `turn.complete`.

**What the person sees.** After a stage turn, the prompt box shows
`/wf verify alpha-flow auth` dim; Tab takes it, Enter runs it. When the
stage did not land, a toast says
`wf: implement ended without 05-implement-auth.md`.

**Mechanism.**

- Suggestion: at `turn.complete` of a turn whose write list touched the
  active workflow, re-read `00-index.md` and call
  `$.prompt.suggest({ text: nextInvocation })`. A `prompt.suggest` hook on
  `{ origin: { kind: 'suggestion' } }` (the engine's own guess) replaces
  the engine's text with the next invocation while a workflow is active,
  so the two never compete. Off when `options.suggestNext` is false.
- Stage-landed check: at `turn.complete` of a `/wf <key> <slug> [slice]`
  turn, the expected artifact is looked up by key: shape → `02-shape.md`,
  slice → `03-slice.md`, plan → `04-plan-<slice>.md`, implement →
  `05-implement-<slice>.md`, verify → `06-verify-<slice>.md`, review →
  a `07-review*.md`, handoff → `08-handoff.md`, ship → `09-ship.md`, retro
  → `10-retro.md`. Intake and the keys with no artifact are skipped. The
  stage landed when the artifact is in the turn's write list, or its mtime
  (`$.fs.stat`) is later than the turn's start. Otherwise one
  `$.ui.toast` and one `$.ui.log` line. A turn the person interrupted
  (`e.reason`) is not checked. Off when `options.stageCheck` is false.

Kit tests: a fixture turn that writes the artifact yields the suggestion
and no toast; one that writes nothing yields the toast; an interrupted turn
yields nothing; the engine's own suggestion is replaced while a workflow is
active and passes through when none is.

## 6. W4 — question progress in the dialog

Addition 2.

**What the person sees.** During `/wf intake` and `/wf shape`, every
AskUserQuestion dialog carries its count: the question text ends with
`(question 7, floor 20)`; the header chip is untouched, because it holds
twelve characters at most.

**Mechanism.** The `tool.call { tool: 'AskUserQuestion' }` hook counts the
calls of the current turn bracket. The `ui.render { component:
'AskUserQuestion' }` hook, while the bracket's key is intake or shape,
returns `next({ ...e, props: { ...e.props, questions } })` with each
question's `question` string suffixed. The rewrite must still fit the
tool's schema or the engine draws the original; the suffix changes one
string, so it fits. The floor is the 20 of `_question-craft.md`; read it
from the module's constant, not from the reference file. Off when
`options.questionProgress` is false.

Kit tests: the third dialog of an intake bracket draws `(question 3, floor
20)`; a dialog outside a `/wf` bracket draws unchanged.

## 7. W5 — live driver status for auto and yolo

Addition 3.

**What the person sees.** While `/wf auto` or `/wf yolo` runs, the pinned
status line reads
`yolo · run r3 · implement auth · agent 4 · 14 min · last beat 2 min ago`,
and when the journal is silent past its own longest gap (20-minute floor,
the rule of `_control-file-ownership.md`) it reads
`yolo · presumed dead since 14:02 · last: implement auth`.

**Mechanism.** At `turn.start` of an auto or yolo bracket, start
`$.clock.every(5000, tick)`; `tick` reads
`.ai/workflows/<slug>/.driver-journal.jsonl`, keeps the newest run's
entries (`at`, `run`, `seq`, `event`, `agent`, `phase`, `stage`, `slice`),
computes the elapsed time and the largest gap, and sets `$.ui.status`. The
timer is cancelled at `turn.complete`, and the status line returns to the
strip's text. Off when `options.driverStatus` is false.

Kit tests: a fixture journal with three entries yields the running text;
a stale one yields the presumed-dead text; no journal yields
`no driver journal`. The kit's `mock.clock` drives the ticks (**probe P9:**
whether `mock.clock` exposes an advance call; else the tick function is
exported and called directly).

## 8. W6 — the hub line at session start

Addition 8.

**What the person sees.** One dim line under the logo at start:
`sdlc hub 9.156.2 · 15 repos · 2 renders stale · /wf-doctor`, and one toast
during the session when the hub stops answering, one more when it returns.

**Mechanism.** At `session.start`, read `~/.sdlc/hub-config.json` through
`$.fs.read` (home from `$.env`), `$.http.fetch` the health endpoint
`http://127.0.0.1:<port>/__sdlc/health`, and keep the answer. The
`ui.render { component: 'InfoNotice' }` hook draws its own tree: the
engine's notice text, then the hub line, `command` set to `/wf-doctor`
(a registered command that runs `npm run doctor` through `$.process.run`
and shows the table in a Pane). A `$.clock.every(60000)` poll toasts on a
state change only. Off when `options.hubNotice` is false; skipped when the
config file is absent.

Kit tests: the notice text from a fixture health answer; no line when the
config is absent; one toast per state change across four polls.

## 9. W7 — the dashboard Pane

Candidate C5.

**What the person sees.** `/wf-dashboard` opens a pane titled
`sdlc workflows`, docked beside the transcript in fullscreen, above the
prompt otherwise:

```
workflow      status   stage      slice   next
alpha-flow    active   implement  auth    /wf verify alpha-flow auth   [status] [pick]
beta          closed
──
alpha-flow slices   auth ▰▰▰ verified   ui ▰▱▱ planned   api ▱▱▱ defined
open findings 3 · ship-plan blockers 0 · hub 9.156.2 ok
```

`[status]` fills `/wf status <slug> `; `[pick]` opens the picker at the
slug's slice step. The keyboard is the person's (`ctrl+x tab`, Esc); the
engine's close mark or `ctrl+x x` closes it, and a `ui.close` hook is not
registered, so the close is never refused.

**Mechanism.** `$.command.register({ name: 'wf-dashboard' })` at
`session.start`; the `command.run` hook calls
`$.ui.open({ id: 'wf-dashboard', title: 'sdlc workflows', rows: 12 })`;
the `ui.render { component: 'Pane', requestId: 'wf-dashboard' }` hook draws
the tree from the workflow list, the roster with each slice's furthest
stage file (three cells: plan, implement, verify), the open findings, the
ship-plan audit blockers, and the hub health. Refresh through the W1
watcher. **Probe P10:** the open-findings count reads the review ledger's
sibling YAML (open-only) when present, else counts the open rows of the
newest `07-review*.md`; confirm the row shape against
`_findings-ledger.md` before writing the parser. The pane waits undrawn
under 144 columns until asked, 110 once asked; the command's answer says
so when `$.session.surfaces()` reports a narrower terminal.

Kit tests: the pane tree for the fixture (two workflows, two slices); a
`[status]` press fills the prompt; a `[pick]` press opens the picker at
the slice step; the findings count from a fixture ledger.

## 10. Probes

| Probe | Question | Feeds |
| --- | --- | --- |
| P8 | The `userConfig` field schema in the manifest type | W1 |
| P9 | Whether the kit's `mock.clock` advances time on demand | W5 tests |
| P10 | The findings ledger row shape (sibling YAML and markdown) | W7 |
| P1–P6 | Open from the picker plan: Tab between Buttons, wrap order, wheel at the edges, focus after redraw, Input focus, action chords | W2 row budget, W7 keys |

## 11. Order and releases

1. W1 + W2 + W3 in one minor release: the foundation, the strip, the next
   step, the stage check, the cost rows, the spinner verb, the settings.
2. W4 + W5 + W6 in one minor release: the dialog count, the driver status,
   the hub line.
3. W7 in one minor release, after P10.

Each release follows [RELEASE-DISCIPLINE.md](RELEASE-DISCIPLINE.md): gates,
changelog heading, catalog line, `npm version`, commit and tag by hand,
push with tags, reinstall the four hosts, adopt the hub through the
installed plugin's `hub-ensure.mjs`.

Out of scope: the artifact rows in the transcript (addition 5); any hook
that changes what the model reads (C4, C7); the gate tool (C3); the
question ledger (C6). Codex reads none of this: `hooks/hooks.json`'s
`modules` entry is Claude Code's alone.
