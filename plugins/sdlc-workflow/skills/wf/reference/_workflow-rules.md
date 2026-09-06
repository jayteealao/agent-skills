# Workflow rules
- Store artifacts under `.ai/workflows/<slug>/`. Maintain `00-index.md` as the control file. Never leave the canonical result only in chat — write the stage file first.
- Every artifact file has YAML frontmatter (between `---` markers) as the first thing in the file. All machine-readable state goes in frontmatter; the markdown body is human-readable narrative only.
- Timestamps are real: for `created-at` / `updated-at`, get the current UTC time per [_timestamp.md](_timestamp.md). Never guess or use `T00:00:00Z`.
- If the stage cannot finish, set `status: awaiting-input` in frontmatter and list unanswered questions.
- Keep `po-answers.md` as the cumulative product-owner log. Keep the slug stable after intake.
- `00-index.md` always has: title, slug, current-stage, stage-status, updated-at, selected-slice-or-focus, open-questions, recommended-next-stage, recommended-next-command, recommended-next-invocation, workflow-files.
- Ask multiple-choice PO questions as gate questions per [_gate-question.md](_gate-question.md) (structured decisions, confirmations). Use freeform chat for open-ended questions. Construct every question per [_question-craft.md](_question-craft.md). Append every answer to `po-answers.md` with timestamp and stage.
- Run a freshness pass (web search → official docs) before finalizing any stage where external knowledge matters. Record under `## Freshness Research` with source, relevance, takeaway.
- Reuse earlier workflow files. Do not silently broaden scope. Do not collapse stages unless the user asks.
- Conditional inputs are mandatory when present. If a file in the stage's *Conditional inputs* row exists on disk, read it and honor it in the output. Existence is optional; consumption is required; silent omission is a contract violation.
- Use parallel sub-agents for multi-domain research per [_subagents.md](_subagents.md). Do not spin up sub-agents for trivial work.
- Respect the stated order only where a step consumes an earlier step's output or crosses a gate; reading and research may interleave freely.

A stage body cites this file instead of restating these rules. A stage-specific rule (an extra artifact, an idempotency invariant, an evidence layout) stays in the stage body, beneath the citation.
