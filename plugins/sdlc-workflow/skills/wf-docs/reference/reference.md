---
name: diataxis:reference
description: Use when the user asks for API docs, CLI command reference, configuration reference, parameter tables, schema documentation, error code lists, or version compatibility matrices. Creates neutral, structured, scannable technical reference — factual description of the machinery for lookup during active work. Do not use for onboarding, task guides, or conceptual justification.
---

# Reference writer

## Purpose

Write technical reference that describes the machinery accurately, neutrally, and in a predictable structure.

Reference is for truth, certainty, and lookup while working.

## When to use

Use this skill when the user asks for:

- API docs
- CLI command docs
- configuration reference
- parameter tables
- schema docs
- error code lists
- version compatibility matrices

Do not use this skill for onboarding, tasks, or conceptual justification.

## Core principles

- describe and only describe
- neutral, factual, and precise
- structured around the thing being documented
- complete enough for lookup
- consistent in format and terminology
- examples may illustrate, but must not turn into tutorials

## Reader need

The reader asks:
- What is this?
- What are the valid inputs?
- What does it return or affect?
- What constraints, defaults, or limits apply?
- What errors or warnings exist?

## Structure patterns

Choose one consistent pattern per item type.

### API endpoint

- Name
- Purpose
- Method / path
- Authentication
- Parameters
- Request body
- Response body
- Errors
- Examples
- Notes / limits

### CLI command

- Name
- Synopsis
- Arguments
- Options
- Defaults
- Exit codes
- Examples
- Related commands

### Config key

- Name
- Type
- Default
- Required or optional
- Allowed values
- Effect
- Constraints
- Example

## Writing rules

- avoid persuasion and opinion
- avoid "best practice" unless clearly marked and linked elsewhere
- avoid long narrative prose
- use standard headings and repeated patterns
- mirror the structure of the product where possible
- make scanning easy

## Examples policy

Examples are allowed when they clarify usage, but they must stay illustrative.

Good:
- one short request example
- one short response example
- one command example showing syntax

Bad:
- long walkthroughs
- conceptual essays attached to every field
- advice-heavy examples disguised as reference

## Inputs to gather

- product surface being documented
- canonical names and terminology
- exact signatures, defaults, constraints, limits
- warnings and error cases
- version and compatibility notes
- examples that reflect reality

## Output contract

Produce reference that:

- is structured consistently
- is easy to scan
- states facts cleanly
- separates facts from advice
- can be trusted during active work

## Anti-patterns to remove

- recommendation language without a clear basis
- tutorial prose
- hidden defaults
- vague types like "object" without schema details
- missing constraints and edge cases
- inconsistent naming across entries

## Final self-check

Before returning, verify:

- the document is neutral
- the structure mirrors the product surface
- repeated items use a repeated template
- warnings and limits are explicit
- examples illustrate rather than teach
