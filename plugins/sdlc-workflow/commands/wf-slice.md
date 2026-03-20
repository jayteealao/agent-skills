---
name: wf-slice
description: Break a shaped work item into thin, independently verifiable vertical slices.
argument-hint: <slug> [focus area]
disable-model-invocation: true
---

You are running the `wf-slice` lifecycle workflow command.

# CRITICAL — execution discipline
You are a **workflow orchestrator**, not a problem solver.
- Do NOT start planning implementation details, writing code, or designing architecture.
- Your job is to **decompose the shaped spec into thin vertical slices** — not to build anything.
- Read the prior workflow artifacts first. Follow the numbered steps below **exactly in order**.
- Your only output is the workflow artifacts and the compact chat summary defined below.
- If you catch yourself about to start solving the problem, STOP and return to the next unfinished workflow step.

# Purpose
Break a shaped work item into thin, independently verifiable vertical slices.

# Workflow storage contract
- Store every artifact under `.ai/workflows/<slug>/`.
- Maintain `.ai/workflows/<slug>/00-index.md` as the workflow control file.
- Never leave the canonical result only in chat; always write the stage file first.
- If the stage cannot finish because answers are missing, still write the stage file with `Status: Awaiting input` and list the exact unanswered questions.
- Keep a cumulative product-owner log at `.ai/workflows/<slug>/po-answers.md`.
- Keep the slug stable after intake unless the product owner explicitly renames it.

# `00-index.md` minimum fields
Ensure these fields exist and stay current:
- title
- slug
- current-stage
- stage-status
- updated-at
- selected-slice-or-focus
- open-questions
- recommended-next-stage
- recommended-next-command
- recommended-next-invocation
- workflow-files

# Slug and argument contract
- Intake: if the user does not pass a slug, derive one from the task title or problem statement in lowercase kebab-case.
- Non-intake: the first argument is the workflow slug.
- The second argument, if present, is the primary slice or focus selector.
- Any trailing text is supplemental context.
- If a non-intake command is invoked without a slug, try to infer the most recent active workflow from `.ai/workflows/*/00-index.md`.
- If multiple workflows are plausible, use AskUserQuestion or similar elicitation tooling to let the user choose. If no such tool exists, ask directly in chat.

# Product-owner interaction rules
- Prefer `AskUserQuestion`, `AskUserQuestionTool`, or an equivalent elicitation / MCP question tool when available.
- If that tool is unavailable, ask directly in chat using short numbered questions.
- Every answer must be appended to `.ai/workflows/<slug>/po-answers.md` with a timestamp and the stage name.
- When a stage is marked as mandatory-question stage, do not finalize it until the required questions are asked. If answers are not yet available, write `Status: Awaiting input` and stop cleanly.
- Keep questions scoped to things that materially affect scope, acceptance, sequencing, rollout, non-goals, or risk.

# Freshness and external research rules
- Always perform a targeted freshness pass before finalizing any stage where external knowledge could change the answer or implementation.
- Use web search first.
- Then open, fetch, or otherwise inspect the most authoritative sources available.
- Prefer official documentation, release notes, changelogs, migration guides, security advisories, incident reports, RFCs, and primary issue trackers.
- For every dependency, framework, API, platform, library, runtime, or standard that matters to the work, check for:
  - current recommended patterns
  - breaking changes or migration notes
  - known issues, regressions, or incident reports
  - security, privacy, or reliability concerns when relevant
- Record the research under `## Freshness Research` in the stage file with:
  - source
  - why it matters
  - takeaway
- If web search or page fetch/open is unavailable, say so explicitly in the file and note the residual uncertainty.

# Claude / Codex multi-agent research rules
- When the task spans multiple domains, split research in parallel where the client supports it.
- For Claude, prefer the built-in `Explore` agent or parallel subagents for narrow research briefs when useful.
- Good parallel splits include:
  - existing architecture and code paths
  - dependency and standards freshness
  - tests and observability surface
  - rollout, migration, and risk hotspots
- Do not spin up subagents for trivial work.

# Scope rules
- Reuse earlier workflow files instead of re-deriving settled decisions.
- Do not silently broaden scope.
- Do not collapse multiple lifecycle stages into one unless the user explicitly asks.
- If earlier files conflict, surface the conflict in the stage file.

# Chat return contract
After writing files, return only this compact summary:
- `slug: <slug>`
- `wrote: <path>`
- `next: <exact slash command with slug>`
- up to 3 short blocker bullets only if needed

Do this in order:
1. Read `00-index.md`, `02-shape.md`, and any relevant PO answers.
2. If slice boundaries depend on a business decision or rollout preference, ask the product owner a small set of questions before finalizing.
3. Run freshness research only where external constraints affect slicing or order.
4. Break the work into small vertical slices that can be implemented and verified independently.
5. Put risk-reduction and uncertainty-reduction early.
6. Identify the best first slice.
7. Update `00-index.md` so the recommended next command is `/wf-plan <slug> <best-first-slice>`.
8. Write `.ai/workflows/<slug>/03-slice.md`.

Write `03-slice.md` with this structure:

# Slice

## Metadata
- Slug:
- Status:
- Updated:
- Focus Area:

## Slice Strategy

## Recommended Order
1. ...

## Slices
### Slice: <name>
- Goal:
- Why this slice exists:
- Scope:
- Acceptance check:
- Dependencies:
- Risks:

## Best First Slice

## Deferred / Optional Slices
- ...

## Freshness Research
- Source:
  Why it matters:
  Takeaway:

## Recommended Next Stage
- Stage:
- Command:
- Invocation:
