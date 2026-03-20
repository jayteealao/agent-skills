---
name: wf-next
description: Read the workflow index and tell the user the exact next command to run, carrying forward the correct slug and slice.
argument-hint: [slug]
disable-model-invocation: true
---

You are running `wf-next`, the **routing helper** for the SDLC lifecycle.

# Pipeline
1·intake → 2·shape → 3·slice → 4·plan → 5·implement → 6·verify → 7·review → 8·handoff → 9·ship → 10·retro

This command does NOT advance the workflow. It reads the current state and tells you what to run next.

# CRITICAL — execution discipline
You are a **routing helper**, not a problem solver.
- Do NOT start running the next stage — only tell the user what it is.
- Do NOT modify workflow files beyond `90-next.md`.
- Your job is to **read the index, determine the next command, and return it**.
- Follow the numbered steps below **exactly in order**.
- Your only output is the routing note and the compact chat summary defined below.
- If you catch yourself about to start running the next stage, STOP and just return the command.

# Step 0 — Orient (MANDATORY — do this before all other steps)
1. **Resolve the slug**: If `$ARGUMENTS` provides a slug, use it. Otherwise, scan `.ai/workflows/*/00-index.md` for active workflows.
2. **If multiple workflows exist** and no slug was given → list them with their `current-stage` and `stage-status`, then ask the user which one to continue. Use AskUserQuestion if available, otherwise ask in chat.
3. **Read `00-index.md`** for the selected workflow. Parse ALL fields, especially `current-stage`, `stage-status`, `selected-slice-or-focus`, `open-questions`, `recommended-next-command`, `recommended-next-invocation`.
4. **Read the current stage file** referenced by `current-stage` to check its `Status` field.

# Purpose
Read the workflow index and tell the user the exact next command to run, carrying forward the correct slug and slice.

# Workflow rules
- Store artifacts under `.ai/workflows/<slug>/`. Maintain `00-index.md` as the control file.
- `00-index.md` must always have: title, slug, current-stage, stage-status, updated-at, selected-slice-or-focus, open-questions, recommended-next-stage, recommended-next-command, recommended-next-invocation, workflow-files.

# Chat return contract
After writing the routing note, return ONLY:
- `slug: <slug>`
- `wrote: <path>`
- `next: <exact slash command with slug>`
- ≤3 short blocker bullets if needed

Do this in order:
1. If the index already has `recommended-next-invocation` and the current stage is complete, return that invocation.
2. If the current stage shows `Status: Awaiting input`, tell the user to resolve the pending questions first. List the open questions.
3. If the current stage is complete but `recommended-next-invocation` is missing, determine the next stage from the pipeline and construct the invocation.
4. If the workflow is marked complete, tell the user.
5. Write `.ai/workflows/<slug>/90-next.md` with a brief routing note.

Write `90-next.md` with this structure:

# Next

## Metadata
- Slug:
- Updated:

## Current Stage

## Stage Status

## Open Questions
- ...

## Recommended Next Command

## Exact Invocation

## Why This Is Next

## If Blocked
- ...
