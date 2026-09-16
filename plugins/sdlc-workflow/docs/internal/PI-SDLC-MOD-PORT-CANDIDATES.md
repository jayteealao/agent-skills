# pi-sdlc → Claude mod: port candidates for the sdlc-workflow UX

Status: **ASSESSMENT 2026-09-16**, nothing built. Source: a survey of the
pi-sdlc extension's host-facing layer (`C:/Users/jayte/Documents/dev/pi-sdlc`,
`src/adapters/pi/**`, `src/inspection/**`, `docs/FEATURE-MATRIX.md`) against
the Claude Code 2.1.271 mod contract (`.claude/types/claude-code.d.ts`).
The first port, the `/wf` picker, shipped in v9.155.0 → v9.156.2; its lessons
are in [WF-PICKER-UX-PLAN.md](WF-PICKER-UX-PLAN.md).

pi-sdlc is a native rewrite: deterministic code owns each stage's authority
and the model supplies reasoning. Most of its 38 k lines are that domain
layer and have no place in a mod. What a mod can port is the **host
surface**: what the person sees above the prompt, what the model is told at
each turn, and what the model must ask a person for. This document ranks
those.

## 1. What a Claude mod can carry (contract)

| Need | Mod mechanism |
| --- | --- |
| A widget above the prompt | `ui.render { component: 'AbovePrompt' }`, one band, collapsible by the person (`ctrl+x ctrl+a`); the picker already draws here and other hooks' trees stack under it |
| A pinned line under the prompt | `$.ui.status(text)`, one per plugin |
| A footer mode label | `ui.render { component: 'SessionMode' }`, rewrite `modes` |
| A line under the logo at start | `ui.render { component: 'InfoNotice' }` |
| A full panel | `Pane` via `$.ui.open({ id, title })` + `ui.render { component: 'Pane' }`; docked in fullscreen, waits undrawn under 144 columns until asked |
| A question to the person from code | `$.ui.ask(question, options)`: the engine's own AskUserQuestion dialog; rejects in `-p` runs |
| A tool the model calls | `$.tool.register` + `tool.call { tool: 'mcp__sdlc-workflow__<name>' }` |
| Refuse or rewrite a tool call | `tool.check` / `tool.call` hooks (`{ decision }`, `next({ ...e, input })`) |
| A system-prompt section | `prompt.section` (cached per session until `$.ui.invalidate('prompt.section')`) |
| First-message context blocks | `prompt.context` |
| The expanded text of `/wf` | `skill.prompt { skill: 'wf' }` (skill name and text only, no arguments field) |
| Compaction | `session.compact`: rewrite instructions or messages, or skip |
| A dim Tab-to-take suggestion in the prompt box | `$.prompt.suggest` / `prompt.suggest` |
| A line under the answer | `turn.complete` returns `{ text }` |
| State across sessions | `$.store` (a JSON file under the Claude configuration directory) |
| Timers, processes, HTTP | `$.clock.after/every`, `$.process.run` (argv, no shell), `$.http.fetch` |
| A file written under `.ai/` | no watcher; hook `tool.call { tool: 'Write' | 'Edit' }` after `next(e)` and read the path |

Not in the contract: a per-keystroke hook, a custom transcript message
type with its own renderer, a session tree with labels, a model or effort
switch from a hook, a replacement compaction summariser, a widget that
takes the keyboard on its own.

## 2. Candidates, ranked

Rank weighs the UX gain for a person driving `/wf` on Claude Code, against
build cost and contract risk. **Certain** means every part is contract or
already seen in the picker; **probe** names a live question.

### C1. Workflow strip in the band, and a status line — certain, small

pi: the checklist widget (`● wf checklist · step N of M`, one row per item)
and the inspector widget (`run <stage>:<status>`, gates, findings) above
the editor, refreshed on session events and on `wf_checklist` / `wf_complete`.

Mod: one line in the band, drawn whenever a workflow is active in the
repository, under the picker when the picker is up:

```
wf alpha-flow · implement · slice auth (2 of 5 complete) · next: /wf verify alpha-flow auth
```

Data: `00-index.md` (status, current-stage, selected-slice, next-invocation)
and the `03-slice.md` roster, read by the module's existing readers. The
"active" workflow is the one whose `00-index.md` changed last, or the one
the last `/wf` named. Refresh: `session.start`, and a `tool.call` hook on
`Write` / `Edit` whose path lies under `.ai/workflows` (after `next(e)`,
then `$.ui.invalidate('ui.render')`). The same text, shorter, goes to
`$.ui.status` so it stays when the band is collapsed, and `wf:<stage>` goes
into `SessionMode`.

Gain: the person always sees where the workflow stands and what runs next,
without `/wf status`. Cost: one day. Risk: none in the contract.

### C2. Next invocation as the prompt suggestion — certain, tiny

pi: `/wf <key> --preview` prints the summary and the next action.

Mod: after a turn that wrote an artifact under `.ai/workflows`, read
`next-invocation` from `00-index.md` and call `$.prompt.suggest` with it.
The prompt box shows it dim; Tab takes it; Enter runs it. Core drops the
suggestion while the box holds text or a turn runs, so it never interrupts.

Gain: the lifecycle advances with Tab, Enter. Cost: half a day. Risk: a
`prompt.suggest` hook of the engine's own guess may compete; the mod's
suggestion should replace it (`next({ ...e, text })` on origin
`suggestion`).

### C3. A native gate tool with a durable receipt — certain, medium

pi: `wf_gate` opens `ctx.ui.select` with the options, records the decision
with the artifact hashes and the git revision, and refuses approval carried
in model text ("No approval through model-generated text"). `wf_effect` is
blocked until a gate decision is consumed.

Mod: `$.tool.register({ name: 'wf_gate', ... })`; its `tool.call` hook
calls `$.ui.ask(question, options)`, then writes a receipt into `$.store`
and into `.ai/workflows/<slug>/gates.yaml` (or the existing decision
ledger) with the artifact hashes it read, the `git rev-parse HEAD` from
`$.process.run`, and the time. The `/wf ship`, `/wf handoff`, and paid
`consult` / `imagery` dispatch steps then read the receipt instead of the
transcript. In a `-p` run `$.ui.ask` rejects, and the tool answers
`paused: no one to ask`, which is pi's "durable pause".

Gain: the 2026-09-08 five-layer review named the gates decorative; this
makes the ship and handoff gates real, and the dialog is the engine's own
so it needs no new UI. Cost: two to three days, plus the skill prose that
tells the model to call the tool. Risk: the skill text must change on all
hosts; Codex has no mod, so the Codex path keeps the prose gate, and the
neutrality gate must allow the host difference.

### C4. Active-stage header in the system prompt, and compaction guidance — certain, small

pi: every model request carries a fresh `<pi-sdlc-run-header>` (run, stage,
attempt, pending gates, revision hashes), and its compaction keeps the stage
reference and re-anchors it after.

Mod: a `prompt.section` named `wf-active` with the active workflow's slug,
stage, slice, next invocation, and the hashes of the artifacts the stage
reads; invalidated on artifact writes. A `session.compact` hook appends
"keep the active `/wf` stage, slice, and the artifact paths" to the
instructions. The classic SessionStart(compact) hook already re-reads disk;
this makes the header present on every request between compactions too.

Gain: fewer lost stages after long turns. Cost: one day. Risk: the section
is cached by name, so an unstable text spends the prompt cache; keep it to
the fields above, no timestamps.

### C5. A dashboard Pane — certain, medium

pi: `/wf:dashboard`, a full-screen inspector with pages (Dashboard, Runs,
Evidence, Checkpoints, Diagnostics) and keys to page and scroll.

Mod: `/wf-dashboard` opens a Pane: every workflow with status, stage, and
selected slice; the roster of the chosen one with each slice's furthest
stage file; open review findings from the review ledger; ship-plan audit
blockers; the hub's health from `/__sdlc/health` through `$.http.fetch`.
Rows are Buttons: a press fills `/wf status <slug>` or opens the picker at
the slug step. The keyboard is the person's, as in the band.

Gain: `/wf status` without a model turn. Cost: three days. Risk: a Pane
waits undrawn under 144 columns until asked; the operator asked for the
band, not a pane, for the picker, so this is a separate opt-in command.

### C6. A question ledger — certain, small

pi: `wf_question` gives every question a stable identity, keeps partial
answers, and records answers as receipts that grant no authority.

Mod: a `tool.call { tool: 'AskUserQuestion' }` hook that, after `next(e)`,
appends the question, the options, and the answer to
`.ai/workflows/<slug>/questions.yaml` when a workflow is active. Intake and
shape already ask through AskUserQuestion; the ledger makes the receipts
deterministic instead of prose the model writes.

Gain: durable decision receipts with no change to the skill text. Cost:
one day. Risk: none in the contract.

### C7. A stage packet through `skill.prompt` — probe first, large

pi: the stage message inlines only the references the stage row names,
within a 30 KiB budget, with outlines for large files.

Mod: `skill.prompt { skill: 'wf' }` receives the expanded text of `/wf` and
may return other text. The hook could keep the dispatcher's Step 0 and the
one key's reference files, and drop the rest. **Probe P7:** whether the
text at `skill.prompt` already carries the arguments substituted (the
contract gives `skill` and `text` only). Without the arguments the hook
cannot know the key.

Gain: the largest context saving available. Cost: a week, and it reopens
the progressive-disclosure design of v9.104.0. Risk: the highest here; do
it after C1–C4.

### C8. A synopsis line under the answer — certain, tiny

pi: worker event lines in the transcript ("worker <id> <stage> settled").

Mod: a `turn.complete` hook that, when an artifact under `.ai/workflows`
changed during the turn, returns `{ text }` such as
`wf: 05-implement-auth.md written · next: /wf verify alpha-flow auth`.
The transcript's record is never rewritten.

Gain: the stage outcome in one line. Cost: half a day. Risk: none.

### C9. In-process tool gating — later

pi: `tool_call` blocks a built-in write to a managed `.ai` artifact and any
tool outside the stage row's allowlist.

Mod: `tool.check` could carry the classic PreToolUse guards
(`pre-write-validate`, the leak guards) in-process, with `$.ui.notice`
under the tool dialog, and no node spawn per call. Not now: Codex reads the
classic hooks from the same tree, so the shell hooks stay, and a second
copy of each rule is a second source of truth.

## 3. Not portable, and why

- **The questionnaire TUI** (tabs, notes, previews, partial answers): the
  contract has no full-screen custom component and no key hook; the
  engine's AskUserQuestion dialog is the only question surface.
- **Model and thinking switches per stage rung** (`pi.setModel`): no engine
  call sets the model or the effort from a hook; `config.set` fires when the
  person sets a row, and a rewrite there is a clamp, not a switch.
- **Custom transcript messages with renderers**: `ui.render` covers the
  engine's own components; a plugin draws no message type of its own.
- **Session tree labels and branch scans**: `$.session.messages()` reads
  the transcript; there are no entries, labels, or branches.
- **A replacement compaction summariser**: `session.compact` rewrites the
  instructions or the messages, or skips; the engine summarises.
- **Command collision reports**: `$.command.list` exists, but a plugin's
  commands are namespaced (`sdlc-workflow:wf`), so collisions do not arise.

## 4. Suggested order

1. C1 + C2 + C8 in one minor release: orientation and the next step, all
   read-only, all contract.
2. C4 and C6: continuity and receipts, no skill text change.
3. C3: the gate tool, with the skill text change and the Codex parity
   decision.
4. C5 when a person asks for it.
5. Probe P7, then decide C7.
