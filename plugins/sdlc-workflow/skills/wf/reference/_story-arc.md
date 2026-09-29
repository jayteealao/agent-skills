# Shared explainer contract (single source)

Rules for the explainer each stage writes for the person, and for the chat summary each stage returns.
All text also follows sections 1 and 3 of [_ste-procedural.md](_ste-procedural.md).

**Scope.** The agent file (`NN-<stage>[-<slice>].md`) holds state in its frontmatter and the contract
and working record in its body. The explanation for the person is a separate HTML fragment, the
explainer. The renderer puts the explainer at the top of the artifact's page. Agents do not read
explainer fragments. Only recap, and the writer on a re-run of its own stage, read them. The drivers
`auto` and `yolo` write no explainer; their final chat summary follows A6.

- **A1 — The file.** Write `<stem>.explainer.html.fragment` next to the agent file. For `04-plan-auth.md`
  it is `04-plan-auth.explainer.html.fragment`. Write an HTML fragment: no `<html>`, `<head>`, or
  `<body>` element. Do not write `<script>` or inline event handlers. Do not load remote scripts or
  external assets. The explainer is the free fragment with the label `explainer` (Step F2 of
  [_fragment-authoring.md](_fragment-authoring.md)). Artifacts written before this contract can carry
  a `## The <Stage>` section, and the renderer still shows it. Do not add that section to a new artifact.
- **A2 — Explain the thing, not the progress.** Explain what this stage built or decided. Answer four
  questions:
  1. **What it is.** Name the thing in the person's words.
  2. **How it works.** Show the mechanism, the flow, the screen, or the order of steps.
  3. **Why this way.** Give the reason for each load-bearing choice. Name each rejected option and why.
  4. **What it means for the person.** Say what changes for the person and what stays open.

  Do not write a progress report. The page's "Waiting for you" part and the frontmatter carry the
  stage status. A8 names the focus for each stage kind.

  **Brainstorm exception.** `01-brainstorm.md` keeps its story section, `## The Brainstorm`. Tell it in
  three beats, in this order: origin (the problem that started the talk), road (the turns, each with its
  reason), destination (where the talk stands and what is open). Apply A3 rule 1 and A6 to it.
- **A3 — Build the explainer in this order.**
  1. Open with a plain summary of two or three sentences and at most about 70 words. Say what the
     thing is and what it means for the person. Do not open with "This <stage> implements…".
  2. Before each visual, write one sentence that says what the visual shows. After the visual, explain
     its key points.
  3. Alternate text and visuals. Do not put two visuals together.
  4. Keep each visual on one idea. Split a complex topic into several simple visuals.
  5. Label every visual. Give one tone one meaning in all visuals. Make every visual work in the light
     theme and the dark theme (A5).
  6. Add an interactive element when a change of a variable helps the reader understand (A7).
  7. Close with a recap of two to four short points. Restate the main ideas. Do not restate the counts.

  **Floors.** After the summary, write at least about 250 words for a stage or master explainer. Write
  at least about 150 words for a per-slice explainer. Add at least one visual for each part of the
  topic that has structure (A4). A stage or master explainer with structure normally has two or more
  visuals. A per-slice explainer normally has one or more: its mechanism, screen, or dependencies.

  **Words and counts.** Name things in the person's words. Define each internal id or term in plain
  words, or do not use it. Examples: criterion ids, risk ids such as RIM-1, charter ids such as C5,
  "golden ledger", "gate hash". Make all counts agree, for example the criteria in each group and the
  total. When one item counts in more than one group, say so.
- **A4 — Add a visual only for structure.** Add a visual when the topic has structure that is easier to
  see than to read:
  - a process or a sequence, for example how a request passes through the system;
  - a spatial relationship, for example where a component sits on a screen;
  - a cycle or a feedback loop, for example the verify fix loop;
  - a comparison between options or quantities;
  - a data trend over time or across groups;
  - a hierarchy, an architecture, or a dependency.

  Add no visual for a simple definition or a single fact. Every visual must explain something that the
  text alone does not explain as well.
- **A5 — Use the explainer snippets.** Write each snippet as `<!-- @include explainer/<name> { <json> } -->`.
  The renderer expands the token.

  | Snippet | Shows | JSON keys |
  |---|---|---|
  | `@include explainer/sequence` | steps between actors | `{title?, steps: [{label, text?, lane?}]}` |
  | `@include explainer/comparison` | quantities that differ | `{title?, unit?, max?, bars: [{label, value, tone?, note?}]}` |
  | `@include explainer/cycle` | a cycle or a feedback loop | `{title?, states: [{label, tone?, note?}]}` |
  | `@include explainer/dependency` | a dependency graph | `{title?, nodes: [{id, label, tone?, note?}], edges: [{from, to, label?}]}` |
  | `@include explainer/layout` | regions of a screen, a pitch, or a page | `{title?, cols, rows, regions: [{label, col, row, w?, h?, tone?, note?}], caption?}` |
  | `@include explainer/trend` | data over time or across groups | `{title?, unit?, x: [labels], series: [{label, values: [numbers], tone?}], min?, max?}` |
  | `@include explainer/states` | a state machine | `{title?, states: [{id, label, tone?, note?}], transitions: [{from, to, label?}]}` |
  | `@include explainer/steps` | a step-through, one step at a time | `{title?, steps: [{label, text, tone?}]}` |

  `tone` is one of `accent`, `ok`, `warn`, `bad`, `risk`, `muted`. Use `comparison` only for quantities
  that differ. Do not use it for a list or a mapping, for example bars that all have the value 1. For a
  list or a mapping, write a `<ul>` or a small `<table>`.

  **Free SVG and theme tokens.** When no snippet fits, write an inline `<svg>` with a `<title>`. Label
  every mark. Use only `var(--…)` theme tokens for colour, for example `var(--ink)`, `var(--accent)`.
  Do not write a hex, `rgb()`, or named colour. The tokens follow the light and the dark theme.
- **A6 — Chat-summary form.** The narrative of the chat summary is the explainer's summary, as plain
  text: two or three sentences, no bullets, no field labels. The receipt fields (`Deltas:`,
  `Artifacts:`, `Next:`) sit beneath it. A run that writes no explainer writes the same summary for the
  chat only. For brainstorm, the narrative compresses `## The Brainstorm`.
- **A7 — Interaction.** The view runtime acts only on `data-ex-*` markup; without it, all steps, panels,
  and frames show. Use interaction for a threshold, a budget, a before and after, or a step-by-step flow.
  - **Step-through.** Put `[data-ex-step]` children in a `[data-ex-steps]` container. The runtime adds
    Previous and Next buttons and shows one step. The `steps` snippet writes this markup.
  - **Toggle.** Give each button `data-ex-toggle="<group>"` and `data-ex-show="<key>"`. Give each panel
    `data-ex-panel="<group>"` and `data-ex-key="<key>"`. The first button starts active.
  - **Slider.** Put `[data-ex-frame="<value>"]` frames in `[data-ex-frames="<group>"]`. The runtime shows
    the frame nearest the slider value. Precompute each frame, for example one SVG curve for each dose.

  ```html
  <div data-ex-steps><div data-ex-step>The request arrives.</div>
    <div data-ex-step>The cache answers.</div></div>
  <button data-ex-toggle="v" data-ex-show="old">Before</button><button data-ex-toggle="v" data-ex-show="new">After</button>
  <div data-ex-panel="v" data-ex-key="old">…</div><div data-ex-panel="v" data-ex-key="new">…</div>
  <input type="range" data-ex-slider="d" min="0" max="10" step="5" value="5"><span data-ex-value="d" data-ex-unit="mg"></span>
  <div data-ex-frames="d"><svg data-ex-frame="0">…</svg><svg data-ex-frame="5">…</svg><svg data-ex-frame="10">…</svg></div>
  ```
- **A8 — What each stage explains.**

  | Stage | Explain |
  |---|---|
  | intake | the problem, who has it, and the outcome the person asked for |
  | shape | the behaviour the person will see, and the choices behind it |
  | design | the screens and states the person confirmed, and why they look this way |
  | slice (master) | how the work splits, and how the slices depend on each other |
  | slice | the mechanism or screen the slice delivers, and what it depends on |
  | plan | how the change works end to end, and the order of the steps |
  | implement | what was built, how it works, and where it differs from the plan |
  | verify | what was proven, how it was proven, and what stays unproven |
  | review | the problems found, and why each one matters |
  | handoff, ship | what the change does for users, and what the release carries |
  | retro | what the work taught, and what to change next time |
  | other kinds | the finding, the decision, or the thing produced, and why it is so |
