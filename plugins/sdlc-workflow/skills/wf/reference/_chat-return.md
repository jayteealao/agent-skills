# Shared chat-return framing (single source)

Every `/wf` reference ends by returning a chat summary. The router contract
(`SKILL.md` Step 2, mirrored by the orchestrators' "Emit Final Summary" steps)
governs the final shape: verb-first first line, narrative paragraph, then the
`Artifacts:` / `Next:` anchors. This file is the **leaf-side framing** that every
"Chat return contract" / "Hand off to user" section cites instead of restating.
A leaf's own section contributes ONLY its receipt fields and any stage-specific
content spec.

- **Substance first, then the receipt.** Lead with the **narrative** — a short
  prose paragraph (2–5 sentences, no bullets, no field labels) that MUST
  follow [_story-arc.md](_story-arc.md) rule A6: the same three
  beats as the artifact's story section — the state inherited, the decisions
  with reasons, then what comes next plus the top risk — never a "This <stage>
  implements…" opening. The router leads the chat summary with this paragraph;
  the receipt fields sit beneath it.
- **"Return only" never waives the narrative.** A leaf that says to return ONLY
  a receipt means only those receipt *fields* — the substance narrative above
  them is still mandatory. Always surface what the artifact says (key decisions,
  counts, verdict, top risk), not merely the paths it wrote.
- **Lead the receipt with a `Deltas` line (INTENT-FIDELITY W10.1).** A stage that
  changed the product's shape must surface it at the one altitude the PO reliably
  reads — the chat return, not a 300-line artifact. Immediately below the narrative,
  before the other receipt fields, emit a `Deltas:` line naming: intake directives
  **narrowed** (from shape's Intake Fidelity table), architectural **mechanisms
  introduced** (from the named-mechanism decisions), and intent-bearing decisions
  **pending or auto-resolved** (from the decision-class stamps, once those exist).
  Nothing new is computed — the line only surfaces what shape/verify already recorded.
  When there is nothing to report, the line reads `Deltas: none` (one word). A stage
  with no fidelity/mechanism/decision surface (e.g. a pure status read) omits the line.
- **Arc above, receipt below.** The narrative paragraph MUST follow rule A6 of
  [_story-arc.md](_story-arc.md); everything
  below it — the `Deltas:` line, receipt fields, `Artifacts:` / `Next:`
  anchors — MUST follow the word-discipline rules (section 1) in
  [_ste-procedural.md](_ste-procedural.md), and any command or instruction the
  return gives the user MUST follow section 2: imperative, one
  instruction per sentence, condition before command.
- **Internal audience.** Workflow artifact paths under `.ai/` ARE allowed in the
  chat return — this is the internal summary, not external-facing copy. Outside
  it, the External Output Boundary ([_output-boundary.md](_output-boundary.md))
  still applies.
- **Always emit** — unless the reference STOPped with an error message, in which
  case the error replaces the summary.

## Claims about work you did not watch

A chat return often has to say something about work happening *elsewhere* — a
background driver, another session, a spawned task. Two rules, because both have
already misled a user badly.

- **Liveness is judged by recency, never by existence.** Before saying a driver or
  background run is "still running", apply the staleness rule single-sourced in
  [_control-file-ownership.md](_control-file-ownership.md): compare when its
  heartbeat journal was last written against the run's own observed cadence. A
  session once told the user a driver was "currently re-verifying older slices"
  purely because its trail existed — the driver had been dead for two hours, and
  the user made a stop-or-continue decision on the fiction.

- **Cross-session activity claims require repo evidence.** A system-reminder saying
  a spawned task is "running independently" is a statement about a **chip**, not
  about work occurring. Before asserting that another session is doing, or has
  done, something — and *especially* before predicting a conflict with it — check
  the repo: the branch, recent commits, the target files. If the repo shows
  nothing, say *"a task chip exists; I can't see whether it ran."* One session
  escalated a chip reminder into "a background session is **already implementing
  this exact fix** … guaranteeing a conflict"; two words from the user ("what bg
  task") deflated it, because nothing existed. Confident narration about invisible
  work is worse than silence: it is unfalsifiable until the user does your checking
  for you.
