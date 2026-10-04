# WF-LIVE-VIEWS-PLAN — live views for brainstorm, yolo and campaign, in three configurable styles

Status **Built, not released** (2026-10-03): W0–W6 and W8–W10, X0–X3, X5 and X6 are built; T1–T18 pass (`claude plugin test .`, and T17 in `npm test`). X4 is built without waiting for P11: the person made the Desktop app the primary surface (2026-10-03), so every part draws on `desktop` as on `terminal`. Open: W7 (a live run per style, in the Desktop app first, then the terminal) and the person's first look at P11. The probe results and the engine rules the build found are in [LIVE-VIEWS-PROBES.md](LIVE-VIEWS-PROBES.md). · Date **2026-10-02** · Plugin **v9.176.0** · Owner **jayte**
Scope: the new live views (sections 1–13) and the existing visual mods: the picker band, the strip, the `wf-dashboard` pane, the hub notice, the status line, the spinner word, the mode label and the toasts (section 14). All of them take the same three styles from one setting.
Related plans: [YOLO-COMMENTARY-PLAN.md](YOLO-COMMENTARY-PLAN.md) (events, `.control.json`), [WF-CAMPAIGN-PLAN.md](WF-CAMPAIGN-PLAN.md) (ledger, usage guard, stages), [BRAINSTORM-WORK-PACKETS-PLAN.md](BRAINSTORM-WORK-PACKETS-PLAN.md) (`work[]`, packets).
Mockups: [mockups/live-views/](mockups/live-views/) — `option-a-dashboard.html`, `option-d-dotmatrix.html`, `option-e-brutalist.html`, and `sim.js`, the shared run script. Open a file in a browser. Each page plays the same scripted SoccerManager run.

## 1. Why

The person runs `/wf yolo` and `/wf campaign` for hours, often in the Desktop app, and then walks away. Today they learn what happens only from chat. In session `e06c6e80` the main session hand-built a watch: 459 Monitor calls and 415 re-arm messages (commentary plan, section 1). The commentary plan fixes the words. This plan adds the picture: one live view per driver that answers five questions at a glance.

| # | Question | Example answer |
|---|---|---|
| Q1 | Is it alive? | "Last journal line 4 s ago." "Quiet for 11 min." |
| Q2 | Where is it? | "Slice 4 of 7, verify, 6 min of a usual 8." |
| Q3 | What did it decide? | "D6, intent-bearing: replay hooks record every action." |
| Q4 | What does it need from me? | "Confirm D6. PRODUCT.md changed. Prepare `conditions`." |
| Q5 | What will it cost? | "5-hour window 76 %, over the 75 line." |

The person reviewed five mockups and chose three styles (2026-10-02):

- **A · Dashboard.** The calm dark view: one focus, a "Needs you" list, and one summary line. Details are behind a toggle.
- **D · Dot-matrix instrument.** Dark numbered cards, dot-matrix numerals, dotted charts and one orange accent.
- **E · Brutalist grid.** A light hairline grid, heavy condensed headlines, slash-numbered sections, purple and lime accents, and black buttons with ↗.

The person rejected B (broadsheet) and C (transit) as "jokes, not usable designs". Do not propose them again.

## 2. Decisions

| # | Decision | Source |
|---|---|---|
| L1 | Three styles: A, D and E. Each style shows the same facts for the same view. A style changes how the view looks, never what it shows. | PO 2026-10-02 |
| L2 | The style is a setting in `/config`, so the person can choose it. | PO 2026-10-02 ("configurable options") |
| L3 | The details state (on or off) is remembered per view. When something needs the person, only the section that holds that thing opens. | PO agreed, 2026-10-02 |
| L4 | Motion shows a change. A still view means no news. The heartbeat is the only continuous motion. | Mockup review |
| L5 | Each view leads with one focus element and one "Needs you" list. The list is empty most of the time. | Calm revision of option A |
| L6 | Usable over decorative. Each element answers one of Q1–Q5. An element that answers none of them is not drawn. | PO 2026-10-02 |
| L7 | No flags on commands. The views open by themselves when a driver starts. The person changes the style in `/config` or with the style button in the pane. | `sdlc_convention_over_flags` |

## 3. What the person sees

### 3.1 Where the view appears

- **Pane.** Each view is one `Pane` with the id `wf-live`, titled `yolo · <slug>`, `campaign · <slug>` or `brainstorm · <slug>`. The terminal docks the pane beside the transcript in fullscreen from 110 columns. Otherwise the pane sits above the prompt (types: `Pane.placement`).
- **Band.** The `AbovePrompt` band gives one line with the focus and the primary action buttons (hotkeys `1`, `2`). It is the same in all three styles, with the style's colours.
- **Turn line.** The `Spinner` word stays the existing stage verb (`spinnerWordOf`, for example `Driving`). The live view does not take the spinner (section 14.4, X-rule K2).
- **Status line.** The plugin has one status line (`$.ui.status`: "One per plugin"). The existing driver status (`driverStatusOf`) owns it, and while a live view shows, the line adds the 5-hour usage (section 14.4, K1).
- **Toasts.** `$.ui.toast` is used only for push-class events (commentary plan C5): a decision, a protected-file change, a stale run, a stop or pause, a ready wave, a waiting prepare, and the end of the run.

### 3.2 The three styles

Each row is one element. Each column shows how one style draws it. The mockups show every row.

| Element | A · Dashboard | D · Dot-matrix | E · Brutalist |
|---|---|---|---|
| Ground | near-black panel, rounded sections | near-black, numbered cards `01 RUN STATUS` | off-white, hairline grid, `+` marks |
| Focus value | stage name + large stage rail with a runner | dot-matrix stage word (5×7 glyphs) | condensed headline at full size |
| Liveness | breathing dot, "last line 4 s ago" | dotted waveform: one spike per journal line, flat when quiet | lime health bar: `ALL SYSTEMS OPERATIONAL` → `QUIET · 11MIN` → `STOPPED` |
| Slices | row of seven dots under the rail | 7×4 square heat-map | 7×4 block matrix, with lime outlines for needs |
| Needs you | violet and amber cards with buttons | cards in an orange-bordered card 02 | bordered cards with lime tags and black ↗ buttons |
| Usage | two bars with marks at 75 and 90 | tick ring with orange 75 and 90 ticks | striped bars with marks |
| Secondary detail | one dim summary line; the rest behind details | own cards (commits, agents, steering, control) | system-status rows and a log column |
| Primary action | band buttons | card 08 pills | top-right black button and purple footer bar |
| Accent rules | green done, blue run, amber attention, red stop, violet intent | white state, orange attention, mint success only | black done, purple running, lime needs you, red cut or stop |

### 3.3 The yolo view

| Part | Content | Source (section 5.2) |
|---|---|---|
| Focus | current slice, stage, progress in the stage, time used against the usual time | journal, stage records |
| Liveness | seconds since the last journal line; quiet at half the stale limit; stale at the limit (`yolo.js` liveness rule, 20 min floor) | `.driver-journal.jsonl` |
| Slices | 7 slices × 4 stages: done, running, waiting | journal + `04-plan`…`07-review` records |
| Needs you | intent-bearing decisions and `awaiting-input` outcomes; protected-file changes | stage records; file hashes |
| Commits | count on the branch, last subject | `git` HEAD through the reader (5.3) |
| Agents | stage agents bright, scouts and refuters dim, with model names | journal `agent-start` / `agent-end` |
| Steering | agents that read `steer.md` after the person's last edit | journal steer-read lines + `steer.md` mtime |
| Usage | 5-hour and weekly percent with reset times | `$.session.usage()` (5.4) |
| Actions | stop after this stage, stop after verify, confirm, open record, show diff, keep | section 6 |

### 3.4 The campaign view

| Part | Content | Source |
|---|---|---|
| Focus | active wave, drives running; when paused, the countdown to the reset | `work/campaign/ledger.json` |
| Waves | each wave: six gate lights (merge, verify, drift, refuter, fidelity, ship) and its slugs, each with a four-step track and a note | ledger |
| Needs you | slugs waiting for prepare; ledger `asked` items; decisions from slug records | ledger, slug records |
| Usage | both windows, the 75 and 90 lines, and the forecast (fits, tight, does not fit) | usage files (5.4), `forecast.md` |
| Outputs | one row per wave PR with its state; the build to try; the version at ship | ledger `prs[]`, `as-built/` |
| Heavy suites | holder of `heavy.lock` and the slugs that wait | `.scratch/campaign/heavy.lock`, `lock-wait` journal lines |
| Actions | prepare next, stop after this wave, resume now | section 6 |

### 3.5 The brainstorm view

| Part | Content | Source |
|---|---|---|
| Focus | mode (explore, scope, done) and the last thing the person said | `brainstorm-board.json` `log`, session turn |
| Threads | each thread with its items; during the walk, each item takes the call of its area | board `threads`, `items`, `areas[].scope` |
| Walk | walked count, keep, cut and later counts | board `areas[].scope` |
| Packets | after `done`: one row per packet with a size bar marked at 25 and 40 carried decisions; over 40 asks for a split | board `work[]` (packets plan) |
| Sources | counts of `research/`, `references/` and `work/` files | folders (packets plan R1–R5, F1–F5) |
| Revision | `work-revision`, and the newest `work/changes.md` row when reopened | packets plan section 9 |

**Note:** The board records the scope call per area, not per item (`areas[].scope`: `keep`, `cut`, `later` or `mixed`). An item takes its area's call. An area marked `mixed` shows its items as undecided until the board records them otherwise.

## 4. Configuration

### 4.1 Settings in `/config`

Add two fields to `userConfig` in `.claude-plugin/plugin.json`, beside the existing `strip`, `driverStatus` and `readCheck` fields:

```json
"viewStyle": {
  "type": "string",
  "title": "View style",
  "description": "How the sdlc-workflow views look: the live views, the /wf picker band, the strip and the workflows dashboard. dashboard: calm dark view. instrument: dot-matrix cards. grid: light brutalist grid.",
  "options": ["dashboard", "instrument", "grid"],
  "default": "dashboard"
},
"liveView": {
  "type": "boolean",
  "title": "Live view",
  "description": "Open a live view pane when a brainstorm, yolo or campaign runs. Off: no pane (the band, status line and toasts stay).",
  "default": true
},
"liveViewDetails": {
  "type": "boolean",
  "title": "Live view details",
  "description": "Open each live view with its details shown. The pane's details button changes it per view, and the choice is remembered.",
  "default": false
}
```

- **V1.** A `string` field with `options` is a picker in the `/config` menu. A stored value outside the options counts as unset (plugin-authoring `reference.md`, "Options for a plugin…").
- **V2.** A change in the menu reloads the module with the new `options`. A reload runs `register` again. `$.state` and `$.store` keep their values, and the module's own variables start over. The view must therefore rebuild from the files and `$.state` at load (section 5.1).
- **V3.** One style setting (`viewStyle`) styles every view of the plugin, so the band, the strip and the dashboard always match the live view (section 14). The style and the on/off switch are separate fields: a person who turns the live view off still gets styled picker and dashboard views. Earlier drafts of this plan had one `liveView` picker with an `off` value; section 14 replaced that design.
- **V3a.** `liveView: false` removes only the pane. The band, the status entry and the toasts still follow `strip`, `driverStatus` and the commentary rules.

### 4.2 Changing the style from the pane

- **V4.** The pane title row carries a style button (hotkey `s`). Each press cycles dashboard → instrument → grid and calls `$.config.set({ key: 'sdlc-workflow.viewStyle', value })`. The `/config` row is the single store of the style. There is no second store in `$.store`.
- **V5.** Because a change reloads the module, the pane must survive the reload: same id, same view, same scroll. Probe P5 checks this before the button ships. If the pane closes on reload, the button stays out, and `/config` is the only way to change the style.
- **V6.** A locked row (`ConfigRow.isLocked`, managed settings) hides the style button.

### 4.3 The details state

- **V7.** The details button (hotkey `d`) shows or hides the secondary parts of the current view. The state is stored per view in `$.store` under `live-view.details.<yolo|campaign|brainstorm>`, so it lasts across sessions. With no stored value, `liveViewDetails` is the default.
- **V8.** When a "Needs you" item arrives, only the section that holds its detail opens. For example, a protected-file change opens the protected-files list. The section closes again when the person acts on the item. The stored state does not change.
- **V9.** Style D has no hidden parts: its cards are its details. The details button changes the card set from 6 cards (focus, needs, slices, time, usage, control) to 8 cards (plus commits and agents). Style E shows the log column only with details on, and puts "Needs you" in its place when details are off.

## 5. Architecture

### 5.1 Modules

Add the live views as a second hooks module, so that their code stays apart from the picker and the strip. Use one shared model and one renderer per style:

```
hooks/hooks.json            "modules": ["./mod/register.ts", "./mod/live/register.ts"]
hooks/mod/live/
  register.ts               hooks: session.start, ui.render (Pane wf-live), ui.close, timers, actions; the shared sites (band, status, spinner) stay with mod/register.ts (section 14.4)
  reader.ts                 polls files by offset and mtime; returns raw facts; no drawing
  model/yolo.ts             facts → YoloModel        (pure)
  model/campaign.ts         facts → CampaignModel    (pure)
  model/brainstorm.ts       facts → BrainstormModel  (pure)
  model/needs.ts            decisions, protected files, prepare, asked → NeedsItem[]  (pure)
  events.ts                 model diff → event list (stage-end, decision, …); shared with scripts/yolo-watch.mjs
  styles/pane.tsx           (ui, facts, view state) → tree   — the one live pane of every style (since 9.180.5)
  styles/skin.tsx           the ink layer and the style marks: words, chips, stage cells (since 9.180.5)
  styles/common.tsx         band, spinner word, status text, toast text (same facts in every style)
  glyphs.ts                 5×7 dot-matrix font, braille packing, tick-ring and wave geometry
  client/heartbeat.tsx      Client module: waveform / breathing dot on the frame clock
  tests/*.test.ts           claude plugin test suites (section 9)
```

In 9.180.5 one shared pane (`hooks/mod/styles/pane.tsx`) replaced the three per-style pane files and the `rail` and `dots` clients. The styles differ by palette, frame, marks and casing (`styles/tokens.ts`, `styles/skin.tsx`), not by layout. The style files live in `hooks/mod/styles/`, not in `hooks/mod/live/styles/`.

- **M1.** The models are pure functions of the facts. This is the same split as the mockups' `sim.js` (state) and page (render). A style never reads a file. A model never draws.
- **M2.** `events.ts` is shared with `scripts/yolo-watch.mjs` (commentary plan S1–S5). The script loads it with `node --experimental-strip-types`, as `scripts/mod-probe.mjs` already does. The watch and the view therefore name the same events with the same rules. Probe P7 checks that the mod can import a file that the script also imports.
- **M3.** `register.ts` holds `ViewState` in `$.state` (declared in a `types/index.d.ts` contract): the open view, the slug, the last offsets, and the dismissed need ids. The reload in V2 therefore keeps the view where it was.
- **M4.** Each hook body catches its own errors and draws the engine's default (`next(e)`). The mods share one worker, and 3 crashes unload all of them, the `/wf` picker included (campaign plan, mods facts). A live-view fault must never cost the person the picker.

### 5.2 Data sources

| Fact | File | Read rule |
|---|---|---|
| Agent starts and ends, steer reads, lock waits | `.ai/workflows/<slug>/.driver-journal.jsonl` | by byte offset; only new lines are parsed |
| Stage progress and decisions | `04-plan*.md`, `05-implement*.md`, `06-verify*.md`, `07-review*.md` frontmatter and decision tables | by mtime; parse only frontmatter and the decision table |
| Outcome, stop | driver outcome in the journal and `.control.json` | by mtime |
| Protected files | `PRODUCT.md`, `DESIGN.md`, `yolo.protectedFiles`, files dirty at start | hash every 20 s, files ≤ 1 MiB only |
| Commits | `git rev-list --count` and `git log -1 --format=%s` through `$.process` | every 20 s, only while a run is live; probe P8 |
| Campaign state | `work/campaign/ledger.json`, `forecast.md`, `.campaign-journal.jsonl` | by mtime / offset |
| Heavy lock | `.scratch/campaign/heavy.lock` | by mtime |
| Board | `.ai/workflows/<brainstorm>/brainstorm-board.json` | by mtime |
| Packet folders | `research/`, `references/`, `work/` | `$.fs.list` on board change only |
| Usage | `$.session.usage()` for this session; `~/.claude/sdlc/usage/*.json` from the usage guard mod for other sessions | section 5.4 |

### 5.3 The reader and the timers

- **R1.** Use one `$.clock.every` timer. The timer runs between turns and does not start a turn. It polls every 2 s while the pane shows and every 15 s while the pane is hidden or collapsed. When no driver is live, it polls every 60 s, and it checks only whether a journal or board exists.
- **R2.** Each poll reads only new bytes and changed files. Budget: 50 ms of work per poll on the 5 MB journal fixture (section 9). The hook limit is 10 s. The budget keeps a slow disk far from that limit.
- **R3.** The reader returns facts. `register.ts` builds the model, diffs it with the last model, and redraws only when the model changed. Each redraw coalesces; at most one redraw is drawn per frame.
- **R4.** The reader never writes a workflow file. The only file the mod writes is `.control.json`, and only for a stop request (section 6).

### 5.4 Usage

- **U1.** The yolo view and the brainstorm view read `$.session.usage().rateLimits` for their own session. The plain call is free. `session.measure` pushes a new value when a window moves by a whole point. Subscribe to it, and stop polling for usage.
- **U2.** The campaign view reads the newest file in `~/.claude/sdlc/usage/`, which is written by the usage guard mod (campaign plan D14, Stage D3). Until D3 ships, the campaign view uses U1, because the campaign session is the main session.
- **U3.** An unknown value shows as `—`, never as 0 (campaign plan 17.5).

### 5.5 Surfaces

| Surface | Pane | Animated parts | Fallback |
|---|---|---|---|
| terminal | yes; docked in fullscreen from 110 columns, else inline | `Client` regions on their frame clock; dot glyphs as braille text (2×4 dots per cell); `Raster` only for the instrument ring if braille is too coarse (P3) | Box/Text tree with block characters |
| desktop | yes | `Client` regions; `Svg` with SMIL for the rings and dot glyphs | `Svg` as an image |
| vscode | in the types; earlier research said VS Code draws nothing (P4) | `Svg` with `isInteractive` | static tree |
| mobile | yes | `Svg` summary only; no `Input` or `Select` | buttons and chat |

- **S1.** Each style declares, per element, its terminal form and its desktop form. Style E's condensed headline is one bold line on the terminal (no font control). Style D's glyphs are braille dots on the terminal and SVG circles on the desktop.
- **S2.** The existing `wf-dashboard` pane draws only on the terminal (`register.ts:934`). The live view must draw on the desktop too, because the SoccerManager yolo run used `claude-desktop`.

### 5.6 Motion

| Motion | Trigger | Duration | Styles |
|---|---|---|---|
| runner slides to the next stage | stage end | 0.9 s ease-out | A |
| dot glyph shimmer (random delay per dot, ≤ 260 ms) | value change | 0.4 s | D |
| headline turns over | stage change | 0.25 s | E |
| heartbeat spike / ripple | journal line | 0.9 s | all |
| heartbeat slows, changes colour | gap passes half the limit, then the limit | — | all |
| needs card enters, leaves | item added, acted on | 0.5 s / 0.35 s | all |
| gate light turns on | gate passes | 0.5 s | all |
| countdown | paused | 1 s steps | all |

- **N1.** No other element moves. A still view means no news (L4).
- **N2.** All motion runs in `Client` regions or on the surface (SMIL, blit), never in a hook loop. A `Client` that calls `setState` on three renders in a row with no input unmounts. Each `Client` therefore advances on its `every` timer, not on its own render.
- **N3.** The engine exposes no reduced-motion preference (Q4). Therefore the heartbeat is the only looping motion, and it stops when the run stops.

## 6. Actions

Every action uses one of three ways to reach the run. The way is fixed per action:

| Action | Way | Detail |
|---|---|---|
| stop after this stage / after verify / after this wave | write `.control.json` | `{action:"stop", after:"<stage>\|current\|wave", by:"live-view", at}`. Every agent reads the file first (commentary plan G1–G2). |
| resume now (campaign paused) | write `.control.json` `{action:"resume"}`, then `$.prompt.submit` the resume line | campaign plan 17.6 |
| confirm a decision | `$.prompt.submit("Confirm decision D6 for engine-modules")` | the main session records it under the existing rules (`po-answers.md`); the mod never writes a record |
| prepare next slug | `$.prompt.submit("/wf campaign <slug> prepare <next>")` | campaign session only (campaign plan section 8) |
| show diff, open record, open build | `Link` to the file, or a prompt that asks for the diff | read-only |
| keep, later, dismiss | store the need id in `$.state` `dismissed[]` | the item leaves "Needs you"; the files do not change |

- **A1.** `$.prompt.submit` waits until the session is idle and names the mod as the sender. A yolo run is a background Workflow, so the session is usually idle and the prompt runs at once.
- **A2.** Before an action writes or submits, the button changes to its armed state (for example, "Stop requested · after verify"). A second press of the same button removes the request: the mod deletes the stop entry from `.control.json` if no agent has acted on it yet.
- **A3.** The commentary plan says the main session writes `.control.json` (G1). This plan adds the mod as a second writer. Rule: the writer adds `by`. The file has one entry per action. The main session deletes the file after the stop or the resume has happened. `$.fs.write` is not atomic, so the mod writes the whole file in one call and reads it back to confirm.

## 7. How the view opens and closes

- **O1.** The mod sees the driver start: the `/wf yolo`, `/wf campaign` or `/wf brainstorm` command in the prompt, or a new `.driver-journal.jsonl` or board under the project. It then opens `wf-live` for that slug.
- **O2.** The mod opened the pane itself, so the terminal seats it only from 144 columns. Below 144 columns, the pane waits, and the band says `live view ready · ctrl+x tab`. If the person opened the pane (command or band button), it seats at any width.
- **O3.** One `wf-live` pane exists at a time. A second driver adds a tab in the pane's title row. The existing `wf-dashboard` pane stays separate.
- **O4.** When the run ends, the pane stays open with the final state. It closes when the person closes it, or after the next driver starts.
- **O5.** `liveView: false` opens nothing (V3a).

## 8. Style specifications

Each style file implements the same interface:

```ts
type StyleRenderer = {
  pane(ui: Ui, model: ViewModel, view: ViewState, act: Actions, surface: Surface): RenderElement
  band(ui: Ui, model: ViewModel, act: Actions): RenderElement        // shared layout, style colours
  palette: Palette                                                   // named colours, used by status and toasts
}
```

### 8.1 A · Dashboard

- Layout, details off: liveness row; focus block (name, stage, time, large four-segment rail with runner); slice dots; "Needs you"; one summary line with a `details ▸` button.
- Layout, details on: the full set in the busy mockup (`option-a-dashboard.html` with details on): agents, commits, protected files and steering as sections.
- Palette: ground `#080b10`, text `#d9dfe9`, green `#4ade80` done, blue `#60a5fa` running, amber `#fbbf24` attention, red `#f87171` stop, violet `#a78bfa` intent.

### 8.2 D · Dot-matrix instrument

- Layout: a three-column card grid. The focus card spans two columns.
  - Yolo: 01 run status, 02 needs you, 03 slices, 04 stage time, 05 usage, 06 commits, 07 agents and steering, 08 control.
  - Campaign: 01 campaign status, 02 needs you, 03 waves (spans two), 04 usage, 05 outputs, 06 heavy suites, 07 control.
  - Brainstorm: 01 session, 02 last captured or last call, 03 threads (spans two), 04 walk, 05 packets (spans two), 06 sources.
- Card header: `NN TITLE` in small mono caps. Values in dot-matrix glyphs (`glyphs.ts`, 5×7, digits, A–Z, `% / : . - +`).
- On the terminal, the 5×7 glyph packs into braille: each 2×4 braille cell holds 8 dots, so one glyph takes 3×2 cells. The tick ring and the waveform pack the same way.
- Palette: ground `#0a0a0a`, card `#151515`, text `#ececec`, accent `#ff4a1c` (attention only), success `#3ee6a8`.

### 8.3 E · Brutalist grid

- Layout: a top bar (logo, breadcrumb, system box, primary black button); a hero (`/01`, condensed headline, second line, purple tag line, last log line, buttons) beside a block matrix and a lime coordinate box; three sections (`/02` needs you, `/03` system status, `/04` log or outputs); a footer status bar with the purple primary action.
- Terminal: the headline is a bold line in capitals, and the block matrix uses two cells per block (`██`). Striped bars use `▌` patterns.
- Palette: ground `#f4f4f2`, ink `#0d0d0d`, lines `#d2d2cd`, purple `#7b5cff`, lime `#d7ff3a`, red `#ff3b30`.
- E is a light style. On a dark terminal theme the pane draws its own ground colour. Probe P6 checks that a light pane is readable inside a dark terminal. If it is not, E on the terminal inverts to ink ground with the same accents.

## 9. Tests

| # | Test | Kind |
|---|---|---|
| T1 | Each model builds the expected model from fixtures: a SoccerManager journal excerpt from session `e06c6e80`, records, a ledger, a board | unit, red first |
| T2 | `events.ts` yields the same events for the watch script and the mod from one fixture | unit, shared |
| T3 | The reader parses only new bytes; a 5 MB journal poll stays under 50 ms | performance |
| T4 | Each style draws each view on `terminal` and `desktop`, and the trees validate (`$.ui.mount` per surface; loop over surfaces as the kit advises) | `claude plugin test` |
| T5 | The same model shows the same facts in all three styles: a fact list extracted from each tree must match | contract |
| T6 | `liveView: false` opens no pane; band and status stay, in the `viewStyle` style | `claude plugin test` with `options` |
| T7 | The style button calls `$.config.set` with the next value; a locked row hides it | `claude plugin test` |
| T8 | The details state is stored per view and restored after a reload; a need opens only its section | `claude plugin test` |
| T9 | Stop buttons write the `.control.json` shape of section 6, read it back, and a second press removes it | `claude plugin test` with mock fs |
| T10 | A thrown error in a style draws the engine default and leaves the picker working | `claude plugin test` |
| T11 | No `Client` render loop: each region advances only on `every` | `claude plugin test` (`Client` frame clock) |
| T12 | The mock run of `sim.js` replayed through the models gives the same screens as the mockups at five checkpoints | snapshot |

## 10. Probes (before the build)

Record the results in `docs/internal/LIVE-VIEWS-PROBES.md`.

| # | Probe | Blocks |
|---|---|---|
| P1 | A `Client` region draws and animates in the Desktop app and in the terminal | animated parts on each surface |
| P2 | `Svg` with `isInteractive` runs SMIL on the desktop | D rings on desktop |
| P3 | Braille glyph density in Windows Terminal and the Desktop font: is a 5×7 glyph legible at 3×2 cells? | D on the terminal |
| P4 | Does VS Code draw a `Pane` tree? | VS Code support |
| P5 | Does an open pane survive the reload that `$.config.set` causes, with the same id and view? | V4 style button |
| P6 | Is a light pane readable in a dark terminal theme? | E on the terminal |
| P7 | Can a hooks module import a `.ts` file that `scripts/yolo-watch.mjs` also imports? | M2 shared events |
| P8 | Does `$.process` run `git` from a mod on Windows within the hook limit? | commits fact |
| P9 | Does `$.prompt.submit` from a button run while a background Workflow is live? | A1 actions |
| P10 | Is a second entry in `hooks.json` `modules` loaded and isolated, so that a fault in one module skips only that module's hooks? | M4, section 5.1 |

## 11. Build waves

| Wave | Content | Depends on |
|---|---|---|
| W0 | Probes P1–P10. Red-first tests T1, T2, T3 with fixtures. Contracts: `types/index.d.ts` for `ViewState`. | — |
| W1 | `reader.ts`, `model/yolo.ts`, `model/needs.ts`, `events.ts`; T1–T3 green. | W0; commentary plan W1 (shared `events.ts`) |
| W2 | `live/register.ts`: open rules (section 7), timers (R1–R3); the live facts reach the band and status through `$.state` (K1–K3); `viewStyle`, `liveView` and `liveViewDetails` in `plugin.json`. | W1; X0–X2 and X6 (section 14.7) |
| W3 | Style A for yolo, with details (V7–V9); T4–T6, T8, T10. | W2 |
| W4 | Actions (section 6) for yolo: stop requests, confirm, keep; T9. | W3; commentary plan W3 (stop request in `yolo.js`) |
| W5 | `glyphs.ts`, the `Client` modules; style D for yolo; T11. | W3; P1–P3 |
| W6 | Style E for yolo; P6 fallback; the style button (V4–V6) if P5 passes; T7. | W3 |
| W7 | Live run on one SoccerManager slug, in the terminal and in the Desktop app, once per style. | W4–W6 |
| W8 | `model/brainstorm.ts` and the brainstorm view in A, D and E. Packets and sources parts follow the packets plan; before that, the view shows threads, walk and revision only. | W3; packets plan W2 for `work[]` |
| W9 | `model/campaign.ts` and the campaign view in A, D and E; campaign actions. | W3; campaign plan Stage C (ledger) |
| W10 | Usage from the usage guard mod (U2). | campaign plan Stage D3 |

Release after W4 (yolo view, style A), after W7 (all three styles for yolo), after W8, and after W9. Each release follows the plugin release rules: bump with `npm version`, rebuild `dist/` in the same commit if the build covers the changed files, and push until `origin/master` carries the tag.

## 12. Risks

| Risk | Effect | Answer |
|---|---|---|
| Shared worker: 3 crashes unload all mods | the person loses the picker and the strip | M4; T10; a second module (P10) |
| Three styles drift apart in content | the person sees different facts per style | one model (M1); contract test T5 |
| Poll cost on a large journal | slow turns, hook timeouts | offsets (R2); T3 budget |
| Light style E in a dark terminal | unreadable pane | P6; inverted terminal fallback |
| `.control.json` with two writers | a lost stop request | A3: `by` field, whole-file write, read-back |
| Animation noise | the calm the person asked for is lost | L4; motion table 5.6; N1 |
| Pane closes on a style change | the style button feels broken | P5; `/config` only if it fails |

## 13. Open questions

| # | Question | Recommendation |
|---|---|---|
| Q1 | Is `dashboard` the right default style? | Yes. It is the calmest style, and it is the closest to the terminal's own look. |
| Q2 | Should the band also follow the chosen style, or stay neutral? | Follow the style's palette only. The layout stays the same, so the hotkeys stay in the same places. |
| Q3 | Does the brainstorm view open by itself, or only on request? | By itself in scope mode and after `done`; on request while exploring, because exploring is a conversation. |
| Q4 | Is there an engine reduced-motion setting to honour? | The 2.1.286 types declare none (no `reducedMotion` or `prefersReducedMotion`). Keep N3, and check again on each engine update. |
| Q5 | Should the mod write `.control.json`, or always ask the main session to write it? | The mod writes it (A3). The stop must work while the main session is busy with the person. |

## 14. Existing visual mods: audit and restyle

Mockup: [mockups/live-views/existing-mods.html](mockups/live-views/existing-mods.html) shows E1–E4 in all three styles, with the picker open or the live line, the dashboard details, and the dark or light theme for style E.

The plugin already draws nine visual parts from `hooks/mod/register.ts` (1410 lines), `hooks/mod/strip.tsx` and `hooks/mod/views.tsx`. This section audits them against the 2.1.286 API and its standards. It then plans how they take the three styles. The audit used the current code, the per-build types file (`plugin-authoring/types/claude-code.d.ts`, 2.1.286) and `reference.md`.

### 14.1 Inventory

| # | Part | Site | Code | Surfaces today | Settings |
|---|---|---|---|---|---|
| E1 | `/wf` picker band: title, filter `Input`, up to 9 digit rows, `more`, `back`, `close`, hint | `AbovePrompt` | `views.tsx` `bandView`; `register.ts:844` | terminal only (`register.ts:848`) | always on |
| E2 | Strip: workflow row with the `⇄ n more` rotate button, then a dim cost row | `AbovePrompt`, under the band | `strip.tsx` `stripView`; `register.ts:850` | terminal only | `strip`, `cost` |
| E3 | Workflows dashboard: padded text table, slice rows with `▰▱` marks, findings and hub footer, `status` and `pick` buttons | `Pane` `wf-dashboard` | `strip.tsx` `dashboardView`; `register.ts:932` | terminal only (`register.ts:934`); elsewhere the command answers `DASHBOARD_TERMINAL_TEXT` (`register.ts:791`) | — |
| E4 | Hub line under the logo | `InfoNotice` | `strip.tsx` `noticeView`; `register.ts:906` | terminal (the component is terminal-only) | `hubNotice` |
| E5 | Status line: workflow position, stage cost and hub, or the driver liveness line | `$.ui.status` | `register.ts:428`, `:432`, `:1171` | every surface, best effort | `strip`, `cost`, `driverStatus` |
| E6 | Spinner word: the stage verb (`Shaping`, `Driving`) | `Spinner` | `register.ts:899`; `active.ts:289` | every surface | `spinnerVerb` |
| E7 | Mode label `wf:<stage>` at the right of the prompt footer | `SessionMode` | `register.ts:892`; `active.ts:283` | terminal, desktop | `strip` |
| E8 | Question counter `(question n, floor 20)` added to the question text | `AskUserQuestion` | `register.ts:916` | every surface | `questionProgress` |
| E9 | Toasts: hub up or down, driver presumed dead, compaction | `$.ui.toast` | `register.ts:734`, `:1176`, `:1217`, `:1277` | every surface, best effort | `hubNotice`, `driverStatus`, `stageCompact` |

### 14.2 Audit findings

Each finding was checked against the current code and the 2.1.286 types. The severity says what the person loses.

| # | Finding | Evidence | Severity | Fix |
|---|---|---|---|---|
| F1 | Draw state lives in module variables (`model`, `settings`, `driverText`), and redraws use `$.ui.invalidate('ui.render')`. The standard is `$.state` values declared in a contract and read while drawing; a write redraws the readers. A reload loses module variables. | `register.ts:580`; `reference.md` line 81: "State a drawing draws from belongs in `$.state`, not a module variable (a hot reload loses those)" | High | X1: atoms in a `types/index.d.ts` contract; remove the `invalidate` calls. |
| F2 | After a reload, `model.isDashboardOpen` starts as `false`. An open `wf-dashboard` pane then draws the engine default (`next(e)`), an empty body. A `/config` change of any sdlc setting causes a reload (V2). | `register.ts:934`; `reference.md` line 63 | High (probable; P14 confirms) | X1: the open state comes from `ui.open` and `ui.close` and is kept in `$.state`. |
| F3 | No contract. `plugin.json` names no `"types"`, and the plugin has no `types/index.d.ts`. `claude plugin validate` therefore cannot check state keys. | no `types/` folder; no `types` key in `plugin.json` | Medium | X0: add the contract. |
| F4 | The `config.set` hook copies a changed setting into memory and starts or stops timers. When a menu change reloads the module, the engine drops the environment this code runs in. | `register.ts:759-784`; `reference.md` line 63 | Low (dead weight, no fault) | X1: keep only what a `$.config.set` from another plugin needs; P14 decides. |
| F5 | The band, the strip and the dashboard are gated to the terminal. The types raise `AbovePrompt` on the terminal and the desktop, and `Pane` on every surface. The person runs yolo in the Desktop app. The gates were kept on purpose until a live run proves the desktop (`archived/MOD-DESKTOP-PLAN.md` rule 2). | `register.ts:848`, `:934`; types `AbovePrompt`, `Pane` | High for the dashboard, Medium for the band | X4, after probe P11. |
| F6 | No element uses `color`, `variant`, `role` or `hover`. Every `close` is a dim Button, so the desktop cannot draw its own close control (`role: 'dismiss'`). No site marks its primary action (`variant: 'primary'`). | `views.tsx` `bandView`; `strip.tsx`; types `ButtonProps.variant`, `ButtonProps.role`, `TextProps.color` | Medium | X3. |
| F7 | The dashboard aligns its columns with `padEnd` inside one `Text`. A proportional desktop font breaks the alignment. A narrow pane cuts the `next` column first, and that column is the most useful one. | `strip.tsx` `dashboardView` | Medium (on the desktop) | X3: one `Box` row per workflow, with fixed-width child boxes. |
| F8 | Toasts use the default 4 s. A "driver presumed dead" toast vanishes before a person who looked away can read it. | types `ToastOptions.timeoutMs` (default 4000); `register.ts:1176` | Medium | X6: `timeoutMs: 10000` for the push-class toasts (section 3.1). |
| F9 | The plugin has one status line. The live view and the driver status (E5) both want it. Two modules of one plugin that both call `$.ui.status` overwrite each other. | types `$.ui.status`: "One per plugin" | High once W2 ships | K1 (section 14.4). |
| F10 | The first draft of section 5.1 gave the live module hooks on `AbovePrompt` and `Spinner`, which `register.ts` already hooks. Two hooks from one plugin on one site stack two trees. | `register.ts:844`, `:899` | High once W2 ships | K2, K3 (section 14.4). This revision already moved the sites. |
| F11 | The tests mount most components on `terminal` only. The desktop band test asserts an empty tree (`register.test.ts:1025`). The dashboard test asserts the terminal-only text (`:1027`). The kit advises one loop over `['terminal', 'desktop']`. | `register.test.ts:10-27`, `:250-254`, `:1025-1027`; `reference.md` line 68 | Medium | X4: loop the UI tests over both surfaces; change the two desktop assertions when P11 passes. |

These parts have no finding:

- E6, the spinner. It rewrites only `word`, as the types allow.
- E7, the mode label. It adds one label to `modes`.
- E8, the question counter. It rewrites the `questions` text.
- The picker's key handling: `ui.focus`, `ui.scroll`, the digit hotkeys and the paging. It follows the band rules in the types.

### 14.3 Restyle: which parts take a style

- **Y1.** A part takes the style only where the plugin draws its own tree: E1 band, E2 strip, E3 dashboard, E4 hub notice, and the live pane.
- **Y2.** The engine draws E5 status, E6 spinner, E7 mode label, E8 question text and E9 toasts. The plugin gives only their text. These parts take no style, and their words are the same in all three styles. Capitals or glyphs in the engine's own lines only add noise.
- **Y3.** A restyle changes no fact, no hotkey, no element key and no row order (L1). The picker keeps its digit hotkeys, its paging, its filter and its `rowKeyOf` keys. The filter still matches the option value and the label words. A style glyph in a label matches nothing that a person types.
- **Y4.** `stripRows` measures the styled text, not the plain text. The band's page size depends on this count, and a wrong count disarms the digits (`views.tsx` `pageSizeOf`).

| Part | A · Dashboard | D · Dot-matrix instrument | E · Brutalist grid |
|---|---|---|---|
| E1 band title | `/wf › plan › pick a slice` in bold; the path dim | `01 /WF · PICK A SLICE` in mono capitals; the page count `2/3` in orange | `/01 PICK A SLICE` in bold capitals; the path in purple |
| E1 rows | plain digit Buttons (unchanged); each workflow row starts with a stage-coloured `●` | plain digit Buttons; a four-cell stage mark `▪▪▫▫`; an orange `!` only on a row that waits for the person | plain digit Buttons; a lime `NEEDS YOU` tag on a row that waits |
| E1 controls | `close` with `role: 'dismiss'`; `more` and `back` dim | the same, with labels in capitals | the same, with labels in capitals and `↗` |
| E2 strip row | `● slug · verify · s3 ▰▰▱ 2/7 · next: /wf review slug` | `SLUG  VERIFY  S3 2/7` and a dim `NEXT` part | `SLUG — VERIFY` in bold, slice blocks `■■□`, a purple `RUNNING` or a lime `NEEDS YOU` |
| E2 detail row | dim cost and tokens (unchanged) | dim, in capitals | dim, in capitals |
| E3 dashboard | one row per workflow: dot, slug, four-segment stage rail, slice dots, amber findings; one summary line; closed workflows behind `details` | one card per active workflow `01 SLUG`: stage word (dot-matrix on the desktop, capitals on the terminal), slice heat row, findings in orange; one `HUB` card | a grid table `/01 WORKFLOWS` (slug, stage, slices as blocks, findings, next); a footer bar, lime `HUB 9.176.0 · OPERATIONAL` or red `HUB DOWN`; `STATUS ↗` and `PICK ↗` buttons |
| E4 hub notice | `● sdlc hub 9.176.0 · 12 repos`, with a green or red dot | `HUB 9.176.0 · 12 REPOS` | `/HUB 9.176.0 — 12 REPOS` |

- **Y5.** The dashboard's `details` button follows V7. The state is stored under `live-view.details.workflows`. In all three styles, closed workflows show only with details on.
- **Y6.** Style A uses theme keys for its colours, so style A follows the person's terminal theme. Styles D and E use the raw colours of section 8. Probe P13 lists the theme keys that `Text.color` accepts.
- **Y7.** Style E reads the `theme` row through `$.config.list()`. With a dark theme on the terminal, style E draws an ink ground with the same accents. This answers probe P6 without a guess.

### 14.4 One owner per shared site

The live module and `register.ts` are two modules of one plugin. Each shared site gets one owner. The other module gives its facts through `$.state`.

- **K1. Status line.** `register.ts` owns `$.ui.status`. The live module writes `live.status` (the heartbeat age and the 5-hour usage) to `$.state`. `register.ts` reads it and joins it to the driver line, for example `yolo · verify s4 · 4 s ago · 5h 76 %`.
- **K2. Spinner and mode label.** `register.ts` owns both. The live module hooks neither.
- **K3. Band.** `register.ts` owns `AbovePrompt`. While a pick is open, the band draws the picker. Otherwise the band draws the live line (the focus and the primary actions, hotkeys `1` and `2`) from `live.band` in `$.state`, then the strip. The live module never hooks `AbovePrompt`.
- **K4. Styles.** The style files move from `hooks/mod/live/styles/` to `hooks/mod/styles/`, so both modules import one set. `StyleRenderer` (section 8) gains `pickerBand`, `strip`, `workflows` and `notice`.
- **K5. Toasts.** Each module raises its own toasts. The text rules are shared (`styles/common.tsx` `toastTextOf`). Both modules raise one toast per event per run.

### 14.5 State migration

Declare these values in `types/index.d.ts` under `sdlc-workflow`. Name the file in `plugin.json` as `"types"`.

| Key | Value | Writer | Readers |
|---|---|---|---|
| `picker` | `{ step, page, filter, ring }` or null | `register.ts` handlers | band |
| `active` | the active slug | `register.ts` | strip, status |
| `workflows` | the workflow entries and rosters last read | `register.ts` reader | band, strip, dashboard |
| `dashboard` | the open state of `wf-dashboard` | `ui.open`, `ui.close` hooks | dashboard |
| `hub` | hub health | hub timer | notice, dashboard |
| `driver` | the driver line | driver timer | status |
| `live.status`, `live.band` | section 14.4 | live module | `register.ts` |
| `live.view` | `ViewState` (M3) | live module | live pane |

- **Z1.** Write each value from a handler or a timer with `update($, atom, fn)`. Never write while drawing: the engine denies `$.state.set` in a render hook.
- **Z2.** Give each atom a `shape` tag. When the code's idea of a value changes, bump the tag, so that a reload does not read the old form.
- **Z3.** Keep `$.store` for values that outlive the session: the active slug per root (`activeStoreKeyOf`), the details state (V7) and the read-check store (`REQUIRES_STORE_KEY`).
- **Z4.** `bracket` (the open turn's command, cost and writes) stays a module variable. No drawing reads it, and a reload in the middle of a turn ends that bookkeeping anyway.

### 14.6 Tests and probes

| # | Test | Kind |
|---|---|---|
| T13 | A reload keeps an open picker step, its page and its filter. An open dashboard keeps its body (F1, F2). | `claude plugin test`: mount, reload, mount |
| T14 | Each styled part (E1–E4) draws in all three styles on `terminal` and `desktop`, and the trees validate. | `claude plugin test`, loop over surfaces and `viewStyle` |
| T15 | The picker gives the same keys, hotkeys, row order and filter results in all three styles (Y3). | contract |
| T16 | `stripRows` equals the drawn row count of the styled strip at 40, 80 and 120 columns (Y4). | unit |
| T17 | Only `register.ts` calls `$.ui.status` and hooks `AbovePrompt`, `Spinner` and `SessionMode` (K1–K3). | source scan |
| T18 | Push-class toasts carry `timeoutMs: 10000` (F8). | `claude plugin test` |

| # | Probe | Blocks |
|---|---|---|
| P11 | The Desktop app draws the picker band (`Input`, digit hotkeys, paging) and the `wf-dashboard` pane. | X4 |
| P12 | Two modules of one plugin read and write the same `$.state` keys under one contract. | K1, K3 |
| P13 | The theme keys that `Text.color` accepts on the terminal and the desktop, and the values of the `theme` row. | Y6, Y7 |
| P14 | A `/config` change reloads the module of a marketplace-installed plugin, not only of a `--plugin-dir` plugin. | F2, F4, V5 |

### 14.7 Build waves for the existing mods

| Wave | Content | Depends on |
|---|---|---|
| X0 | Probes P11–P14. The contract `types/index.d.ts` with the keys of 14.5, and `"types"` in `plugin.json`. Red-first T13 and T16. | — |
| X1 | State migration (14.5): atoms, `update`, no `$.ui.invalidate`; the dashboard open state from `ui.open` and `ui.close`; a smaller `config.set` hook (F4). T13 green. The person sees no change. | X0 |
| X2 | `hooks/mod/styles/` with the tokens and the `StyleRenderer` of K4; style A for E1–E4; the `viewStyle` field. T14 (style A), T15 and T16 green. | X1 |
| X3 | Element standards: `role: 'dismiss'` on every close, `variant: 'primary'` on the one main action per site, `Box` columns in the dashboard (F6, F7). | X2 |
| X4 | Desktop: remove the gates of F5 for each part that P11 passed; loop the UI tests over both surfaces (F11). | X3; P11 |
| X5 | Styles D and E for E1–E4, with the dark-theme rule for E (Y7). T14 for all styles. | X2; P13 |
| X6 | Shared sites K1–K5 and the toast timeouts (F8). T17 and T18. | X1 |

Order with the live waves: X0, X1, X2 and X6 come before W2, because W2 uses the contract, the shared sites and the shared style files. X5 ships with W5 and W6, so that the live pane and the existing parts change style in one release. Release after X4 (standards, style A and the desktop), and again with W7.

### 14.8 Risks

| Risk | Effect | Answer |
|---|---|---|
| The restyle moves a picker row or a hotkey | the person's muscle memory breaks | Y3; T15 |
| A styled strip is taller than `stripRows` says | the band scrolls, and the digits disarm | Y4; T16 |
| The state migration changes behaviour silently | a regression in a shipped part | X1 ships with no visible change; the 50 existing tests in `register.test.ts` stay green |
| The Desktop app draws the band differently from the terminal | a broken picker on the desktop | P11 before X4; the gate stays for each part that P11 fails |
