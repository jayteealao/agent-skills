---
name: diataxis:plan
description: Use when a documentation request is ambiguous, involves planning a docs structure, or a page seems to mix multiple purposes. Classifies content into Diátaxis quadrants (tutorial, how-to, reference, explanation), proposes a documentation map, and produces a writing plan with ordering. Triggers on phrases like "plan my docs", "what docs do I need", "help me organise my documentation", "docs architecture", "I need to write docs for my project", or when a user asks for a README and a full docs set together.
---

# Diátaxis documentation planner

## Purpose

Use this skill when a request is about "docs", "documentation", "README", "guides", "reference", or "improving the docs" but the correct form is unclear.

This skill classifies the work using the Diátaxis model, proposes the right document types, and creates a practical writing plan.

## Core model

Diátaxis separates documentation into four kinds:

- Tutorial: a lesson for learning by doing
- How-to guide: directions to achieve a specific goal
- Reference: factual description of the machinery
- Explanation: conceptual background and reasoning

The first classification question is not "what topic is this?" but "what does the reader need right now?"

Use this decision table:

- If the content guides action and supports acquiring skill, it is a **tutorial**
- If the content guides action and supports applying skill, it is a **how-to guide**
- If the content informs cognition and supports applying skill, it is **reference**
- If the content informs cognition and supports acquiring understanding, it is **explanation**

## When to use

Use this skill when:

- the user asks for a docs plan or docs overhaul
- a page seems to mix multiple purposes
- the user asks for a README and docs architecture together
- the correct doc type is uncertain
- a large docs set needs to be reorganised

Do not use this skill when the target format is already obvious and the user wants the content written immediately. In that case route directly to the specific writing skill.

## Inputs to gather

Collect or infer:

- product or library name
- audience segments
- user maturity level: beginner, competent practitioner, advanced user, maintainer
- major jobs to be done
- key concepts that need explaining
- major interfaces or surfaces that need reference
- current docs inventory, if any
- whether the request is for a single page or an entire docs set

## Workflow

1. Identify the primary user need behind the request.
2. Classify each requested artifact into one Diátaxis form.
3. Split mixed requests into multiple artifacts rather than forcing one page to do everything.
4. Propose a docs map with landing pages where needed.
5. For large sets, keep top-level lists short and group long lists into smaller clusters.
6. Recommend an iterative order of work:
   - README / landing page
   - one reliable tutorial
   - top how-to guides
   - minimum viable reference
   - explanation pages for key concepts
7. State what should not be included in each artifact.

## README routing rules

Treat README as a landing page, not a quadrant.

A README may include:

- project summary
- value proposition
- audience
- install / quickstart entry
- minimal example
- link map into tutorial, how-to, reference, explanation
- contribution and support entry points

A README must not try to fully replace all four quadrants.

## Output format

Return:

1. Classification table
   - requested item
   - assigned type
   - user need served
   - must include
   - must avoid

2. Proposed docs structure

3. Writing order

4. Risks and likely boundary violations

## Boundary checks

Flag and fix these:

- tutorial drifting into explanation
- how-to drifting into training
- reference drifting into advice or opinion
- explanation drifting into procedures
- README becoming a dumping ground

## Quality bar

A good plan should make it obvious:

- where a beginner starts
- where a competent user goes to get work done
- where exact facts live
- where the "why" lives

If that is not obvious, the docs map is still wrong.
