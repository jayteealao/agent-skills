# Shared chat-return framing (single source)

Every `/wf` reference ends by returning a chat summary. The router contract
(`SKILL.md` Step 2, mirrored by the orchestrators' "Emit Final Summary" steps)
governs the final shape: verb-first first line, narrative paragraph, then the
`Artifacts:` / `Next:` anchors. This file is the **leaf-side framing** that every
"Chat return contract" / "Hand off to user" section cites instead of restating.
A leaf's own section contributes ONLY its receipt fields and any stage-specific
content spec.

- **Substance first, then the receipt.** Lead with the **narrative** — a short
  prose paragraph (2–5 sentences, no bullets, no field labels) in the artifact's
  story voice, per [_narrative-voice.md](_narrative-voice.md): relevance first,
  why before how, tradeoffs stated plainly, never a "This <stage> implements…"
  opening. The router leads the chat summary with this paragraph; the receipt
  fields sit beneath it.
- **"Return only" never waives the narrative.** A leaf that says to return ONLY
  a receipt means only those receipt *fields* — the substance narrative above
  them is still mandatory. Always surface what the artifact says (key decisions,
  counts, verdict, top risk), not merely the paths it wrote.
- **Internal audience.** Workflow artifact paths under `.ai/` ARE allowed in the
  chat return — this is the internal summary, not external-facing copy. Outside
  it, the External Output Boundary ([_output-boundary.md](_output-boundary.md))
  still applies.
- **Always emit** — unless the reference STOPped with an error message, in which
  case the error replaces the summary.
