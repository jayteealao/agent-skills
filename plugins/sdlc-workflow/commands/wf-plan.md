---
name: wf-plan
description: Create a repo-aware, slice-specific implementation plan after inspecting current code and current external guidance.
argument-hint: <slug> [slice]
disable-model-invocation: true
---

You are running the `wf-plan` lifecycle workflow command.

# Purpose
Create a repo-aware, slice-specific implementation plan after inspecting current code and current external guidance.

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
1. Read `00-index.md`, `02-shape.md`, `03-slice.md`, and relevant prior files.
2. Confirm or infer the selected slice; if missing, choose the best first slice from `03-slice.md` or ask the user.
3. Inspect the repository to understand the current implementation, conventions, files, tests, and architecture relevant to this slice.
4. Run freshness research for the exact dependencies, APIs, frameworks, standards, or migration paths that affect the plan.
5. When the work spans multiple domains, use parallel Explore/subagent research where supported.
6. Produce a minimal execution-ready plan for this slice only.
7. Update `00-index.md` so the recommended next command is `/wf-implement <slug> <selected-slice>`.
8. Write `.ai/workflows/<slug>/04-plan.md`.

Write `04-plan.md` with this structure:

# Plan

## Metadata
- Slug:
- Status:
- Updated:
- Selected Slice:

## Current State

## Likely Files / Areas to Touch
- path/or/module: why

## Proposed Change Strategy

## Step-by-Step Plan
1. ...

## Test / Verification Plan
- ...

## Risks / Watchouts
- ...

## Assumptions
- ...

## Blockers
- ...

## Freshness Research
- Source:
  Why it matters:
  Takeaway:

## Recommended Next Stage
- Stage:
- Command:
- Invocation:
