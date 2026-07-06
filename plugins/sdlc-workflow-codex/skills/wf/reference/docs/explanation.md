---
name: diataxis:explanation
description: Use when the user asks for conceptual guides, architecture overviews, design rationale, trade-off discussions, background on how a subsystem works, historical context, or "why is it built this way?" documentation. Creates understanding-oriented content that builds mental models — the why, not the how. Do not use for direct task execution (use how-to) or factual lookup (use reference).
---

# Explanation writer

## Purpose

Write understanding-oriented documentation that helps readers see the why, context, trade-offs, and larger picture.

Explanation is not procedure and not reference. It is where reasoning belongs.

## When to use

Use this skill when the user asks for:

- conceptual guides
- architecture overviews
- design rationale
- trade-off discussions
- background on how a subsystem works
- historical context
- "why is it built this way?"

Do not use this skill for direct task execution or factual lookup.

## What explanation should do

- deepen understanding
- connect ideas
- provide context
- discuss choices and alternatives
- justify design decisions
- help the reader build a coherent mental model

## Boundaries

Explanation can include:

- reasons
- perspective
- opinion with clear framing
- alternatives and trade-offs
- historical notes
- comparisons and analogies

Explanation must not drift into:

- procedural walkthroughs
- API field-by-field reference
- setup instructions

## Structure

Use a structure like:

1. Title framed around a topic
2. Why this matters
3. Core idea
4. Context and background
5. How the pieces relate
6. Trade-offs / alternatives
7. Common misconceptions
8. Practical implications
9. Further reading links to how-to or reference

## Writing rules

- discuss the subject, not the steps
- make connections across the system
- include background and history where helpful
- surface assumptions
- compare alternatives fairly
- keep the page bounded around one topic

## Good title patterns

- About authentication in this library
- Why the cache is write-through
- Understanding the event pipeline
- Design trade-offs in offline sync

## Inputs to gather

- topic to illuminate
- audience maturity
- design decisions and constraints
- plausible alternatives
- known misconceptions
- related how-to and reference pages

## Output contract

Produce explanation that:

- improves the reader's mental model
- helps them understand why, not just what
- stays focused on one bounded topic
- links out to action-oriented or fact-oriented docs for execution details

## Anti-patterns to remove

- numbered procedures
- argument lists and schema dumps
- generic motivational fluff
- architecture without trade-offs
- sprawling "everything about X" pages

## Final self-check

Before returning, verify:

- the page answers a why or about question
- it connects ideas instead of listing steps
- opinion is clearly presented as perspective, not disguised as fact
- task execution details are linked, not embedded
