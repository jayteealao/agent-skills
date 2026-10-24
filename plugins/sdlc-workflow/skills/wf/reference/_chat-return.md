# Shared chat-return framing (single source)

Every `/wf` reference ends by returning a chat summary. The router contract (`SKILL.md` Step 2, mirrored by the orchestrators' "Emit Final Summary" steps) governs the final shape: verb-first first line, narrative paragraph, then the `Artifacts:` / `Next:` anchors. This file is the **leaf-side framing** that every "Chat return contract" / "Hand off to user" section cites instead of restating. A leaf's own section contributes ONLY its receipt fields and any stage-specific content spec.

- **Substance first, then the receipt.** Lead with the **narrative**: a plain paragraph of two or three sentences, per [The narrative](#the-narrative) below. The router leads the chat summary with this paragraph; the receipt fields sit beneath it.
- **"Return only" never waives the narrative.** A leaf that says to return ONLY a receipt means only those receipt *fields* — the substance narrative above them is still mandatory. Always surface what the artifact says (key decisions, counts, verdict, top risk), not merely the paths it wrote.
- **Lead the receipt with a `Deltas` line.** A stage that changed the product's shape must surface it at the one altitude the PO reliably reads — the chat return, not a 300-line artifact. Immediately below the narrative, before the other receipt fields, emit a `Deltas:` line naming: intake directives **narrowed** (from shape's Intake Fidelity table), architectural **mechanisms introduced** (from the named-mechanism decisions), and intent-bearing decisions **pending or auto-resolved** (from the `class:` stamps per [_decision-classes.md](_decision-classes.md)). Nothing new is computed — the line only surfaces what shape/verify already recorded. When there is nothing to report, the line reads `Deltas: none` (one word). A stage with no fidelity/mechanism/decision surface (e.g. a pure status read) omits the line.
- **Narrative above, receipt below.** The narrative paragraph follows [The narrative](#the-narrative); everything below it — the `Deltas:` line, receipt fields, `Artifacts:` / `Next:` anchors — uses one term per concept and gives every pronoun one referent, and any command or instruction the return gives the user is imperative, one instruction per sentence, condition before command.
- **The person types the next step.** When the next step is a `/wf` key, write "Type `/wf <key> <args>`." Never write that you run it.
- **Internal audience.** Workflow artifact paths under `.ai/` ARE allowed in the chat return — this is the internal summary, not external-facing copy. Outside it, the External Output Boundary ([_output-boundary.md](_output-boundary.md)) still applies.
- **Always emit** — unless the reference STOPped with an error message, in which case the error replaces the summary.

## The narrative

The narrative is the only explanation the person gets. A stage writes no explainer and no sibling `.yaml` for a viewer.

- **Form.** Write two or three sentences of plain text, at most about 70 words. Write no bullets and no field labels.
- **Explain the thing, not the progress.** Say what the stage built or decided, how it works, why it is this way, and what it means for the person. Do not open with "This <stage> implements…". The frontmatter carries the stage status.
- **Words and counts.** Name things in the person's words. Define each internal id in plain words, or do not use it, for example criterion ids, `RIM-1`, `C5`. Make every count agree with the artifact.
- **Brainstorm.** `01-brainstorm.md` keeps its story section, `## The Brainstorm`, in three beats: origin, road, destination. The narrative compresses that section.
- **Focus for each stage.**

  | Stage | Explain |
  |---|---|
  | intake | the problem, who has it, and the outcome the person asked for |
  | shape | the behaviour the person will see, and the choices behind it |
  | design | the screens and states the person confirmed, and why they look this way |
  | slice | how the work splits, and how the slices depend on each other |
  | plan | how the change works end to end, and the order of the steps |
  | implement | what was built, how it works, and where it differs from the plan |
  | verify | what was proven, how it was proven, and what stays unproven |
  | review | the problems found, and why each one matters |
  | handoff, ship | what the change does for users, and what the release carries |
  | retro | what the work taught, and what to change next time |
  | other kinds | the finding, the decision, or the thing produced, and why it is so |

## Claims about work you did not watch

The rules for a claim about work happening elsewhere (a background driver, another session, a spawned task) are in `_liveness.md`. Meet them before you make the claim.
