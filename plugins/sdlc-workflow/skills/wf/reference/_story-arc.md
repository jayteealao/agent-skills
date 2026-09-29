# Shared explainer contract (single source)

Structure rules for the explainer each stage writes for the person, and for the
chat summary each stage returns. This file defines no language rules: all text
follows the controlled-language contract in
[_ste-procedural.md](_ste-procedural.md), sections 1 and 3.

**Scope.** The agent file (`NN-<stage>[-<slice>].md`) holds state in its
frontmatter and the contract and working record in its body. It has no story
section. The explanation for the person is a separate HTML fragment, the
explainer. The renderer puts the explainer at the top of the artifact's page.
Agents do not read explainer fragments. Only recap, and the writer on a re-run
of its own stage, read them. The drivers `auto` and `yolo` write no explainer;
their final chat summary follows A6.

- **A1 — The file.** Write `<stem>.explainer.html.fragment` next to the agent
  file. For `04-plan-auth.md` it is `04-plan-auth.explainer.html.fragment`.
  Write an HTML fragment: no `<html>`, `<head>`, or `<body>` element. Use inline
  markup only: no remote scripts and no external assets. The explainer is the
  free fragment with the label `explainer` (Step F2 of
  [_fragment-authoring.md](_fragment-authoring.md)). Brainstorm is the one
  exception: `01-brainstorm.md` keeps its story section, `## The Brainstorm`,
  and follows A2–A6. Artifacts written before this contract can carry a
  `## The <Stage>` section, and the renderer still shows it. Do not add that
  section to a new artifact.
- **A2 — Three beats, in this order, every time.** The text of the explainer
  follows three beats:
  1. **Origin.** The state this stage inherited: what the previous stage
     handed over, or the problem that started the work.
  2. **Road.** The load-bearing decisions, in the order they were made, each
     with its reason. Include the decisive counts.
  3. **Destination.** What this stage enables next, and the top open risk in
     concrete terms.
- **A3 — Build the explainer in this order.**
  1. Open with a plain summary paragraph of two to five sentences and at most
     about 90 words. It carries all three beats in compressed form. A reader
     who reads only this paragraph knows what was produced, the load-bearing
     decisions and counts, and the top risk. Do not open with "This <stage>
     implements…": the first sentence names the inherited state or the
     problem. Name things in the person's words. Do not use internal ids or
     jargon (criterion ids, risk ids such as RIM-1, charter ids such as C5,
     terms such as "golden ledger" or "gate hash") unless the explainer
     defines them in plain words.
  2. Before each visual, write one sentence that says what the visual shows.
     After the visual, explain its key points.
  3. Alternate text and visuals. Do not put two visuals together.
  4. Keep each visual on one idea. Split a complex topic into several simple
     visuals.
  5. Label every visual. Use the view's theme tokens for colours, so that the
     visual works in the light theme and the dark theme.
  6. Use an interactive element (a toggle, a step-through) only when a change
     of value helps the reader understand. The view runs no script in a
     fragment, so use CSS only: `<details>`, or a checkbox or radio toggle.
  7. Close with a short recap.
  8. Make all counts agree, for example the criteria in each group and the
     total. When one item counts in more than one group, say so.
- **A4 — Add a visual only for structure.** Add a visual when the topic has
  structure that is easier to see than to read:
  - a process or a sequence, for example how a request passes through the system;
  - a spatial relation, for example where a component sits on a screen;
  - a cycle or a feedback loop, for example the verify fix loop;
  - a comparison between options or quantities;
  - a data trend over time or across groups;
  - a hierarchy, an architecture, or a dependency.

  Add no visual for a simple definition or a single fact. Every visual must
  explain something that the text alone does not explain as well.
- **A5 — Use the explainer snippets.** For a visual, use these snippets, so
  every explainer uses the same shapes and colours:

  | Snippet | Shows |
  |---|---|
  | `@include explainer/sequence` | a sequence of steps between actors |
  | `@include explainer/comparison` | a comparison bar between options or quantities |
  | `@include explainer/cycle` | a state cycle or a feedback loop |
  | `@include explainer/dependency` | a dependency graph |

  Write each snippet as `<!-- @include explainer/<name> { <json> } -->`. The
  renderer expands the token. The JSON keys:
  - `sequence`: `{title?, steps: [{label, text?, lane?}]}`
  - `comparison`: `{title?, unit?, max?, bars: [{label, value, tone?, note?}]}`
  - `cycle`: `{title?, states: [{label, tone?, note?}]}`
  - `dependency`: `{title?, nodes: [{id, label, tone?, note?}], edges: [{from, to, label?}]}`

  `tone` is one of `accent`, `ok`, `warn`, `bad`, `risk`, `muted`.

  Use `comparison` only for real quantities that differ. Do not use it for a
  list or a mapping, for example bars that all have the value 1. For a list or
  a mapping, write a `<ul>` or a small `<table>`.
- **A6 — Chat-summary form.** The narrative of the chat summary is the
  explainer's summary paragraph, as plain text: two to five sentences, no
  bullets, no field labels, the three beats in order. The receipt fields
  (`Deltas:`, `Artifacts:`, `Next:`) sit beneath it. For brainstorm, the
  narrative compresses `## The Brainstorm`.
