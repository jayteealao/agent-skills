# Shared gate-question ladder (single source)

Every human gate in this workflow (compressed-lifecycle Proceed/Adjust/Escalate,
refactor branch/coverage gates, update-deps tier gate, ship go/no-go, the auto
driver's branch posture) asks its question through the platform's blocking
question mechanism — `request_user_input` in Codex, `AskUserQuestion` in Claude Code,
`ask_user` in Gemini. On Codex that mechanism is **mode-dependent**, so every
gate resolves through this three-rung ladder instead of naming a tool inline.
A citing site contributes ONLY its question text and options; this file owns
the mechanics.

1. **Plan mode (interactive).** Call `request_user_input` with the gate's
   question and its 2–4 options. Name the tool exactly; describe the question
   and options in plain language — do NOT invent a JSON parameter shape (the
   tool's schema is undocumented and may change).
2. **Code/default mode (interactive).** `request_user_input` is unavailable
   outside plan mode and will error — do not call it. Fall back to a structured
   chat question: ONE message stating the gate's question with the options as a
   numbered list (recommended option first, marked), then WAIT for the reply.
   Do not proceed past the gate on silence.
3. **Non-interactive (`codex exec`, the auto driver, CI).** No user input is
   possible. Resolve by recorded policy: take the gate's documented default
   (its recommended option unless the citing site names a different
   non-interactive default), write the decision AND the assumption behind it
   into the gate's artifact — the `revisions:` ledger or an `assumptions:`
   field — and continue.

- **Never require structured input to proceed.** A gate must always be
  resolvable by rung 2 (free-text reply mapped to the closest option) or
  rung 3 (policy default). Rung 1 is an affordance, not a dependency.
- **Record the outcome regardless of rung.** Which rung fired, what was chosen,
  and (rung 3) what was assumed all land in the artifact body or ledger — the
  gate decision must be reconstructable from disk.
- **Children never ask.** Subagents must not reach for any rung; gates belong
  to the coordinating parent (see the subagent constraints reference).
