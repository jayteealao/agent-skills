---
name: diataxis:readme
description: Use when the user asks for a README, a GitHub front page, an open source library landing page, or a documentation homepage for a repository. Writes the README as a front door that orients readers and routes them to the right deeper docs — not a tutorial, not a full reference manual, not a conceptual essay. Use a different diataxis skill when the request is specifically for a step-by-step lesson, a task guide, API details, or conceptual background.
---

# README writer

## Purpose

Write or rewrite a repository README as the front door to a project.

This skill uses Diátaxis principles, but does not force the README to become a tutorial, how-to, reference, or explanation page. Instead, it makes the README a landing page that orients the reader and routes them to the right documentation.

## When to use

Use this skill when the user asks for:

- a README
- a better GitHub front page
- open source library documentation entry pages
- a docs homepage for a small repository

Use a different skill when the request is specifically for:

- a step-by-step lesson, use `diataxis:tutorial`
- a task guide, use `diataxis:how-to`
- API or CLI details, use `diataxis:reference`
- conceptual background, use `diataxis:explanation`

## Objective

Help the reader answer, quickly:

- What is this?
- Why would I use it?
- Is it for me?
- How do I get started safely?
- Where do I go next?

## Required sections

Prefer this structure, adapting as needed:

1. Project name and one-sentence value proposition
2. Short overview
3. Who it is for
4. Key capabilities or use cases
5. Installation
6. Quickstart
7. Minimal example
8. Documentation map
9. Status, compatibility, or stability notes
10. Contributing / support / license

## README rules

- Keep the quickstart short and confidence-building.
- Provide one happy-path example that works.
- Do not turn the README into an exhaustive reference manual.
- Do not turn the README into a conceptual essay.
- Do not bury the user in every configuration option.
- Link out to dedicated tutorial, how-to, reference, and explanation pages when depth is needed.

## Writing guidance

### Opening

The first screenful should tell the reader:

- what the project does
- the main benefit
- the rough audience
- the fastest path to first success

### Quickstart

The quickstart can borrow the shape of a tutorial, but it must stay compact.

Good quickstart characteristics:

- minimal prerequisites
- a narrow happy path
- visible result early
- no long digressions
- no branching unless essential

If the quickstart becomes long, split it into a real tutorial and link to it.

### Documentation map

Always orient readers with a short map such as:

- Tutorial: start here if you are new
- How-to guides: solve specific tasks
- Reference: exact API and configuration details
- Explanation: concepts and design decisions

### Tone and style

- practical and concrete
- low-friction
- honest about limitations
- structured for scanning
- not bloated

## Inputs to gather

- project name
- elevator pitch
- audience
- install methods
- minimal working example
- supported platforms / versions
- links or paths to deeper docs
- maturity / stability notes

## Output contract

Produce a README that:

- is readable on GitHub
- makes the project legible in under a minute
- gives a trustworthy quickstart
- points readers to the correct deeper docs
- avoids mixing all doc types into one page

## Final self-check

Before returning, verify:

- the value proposition is clear in the first lines
- the quickstart is actually runnable
- the example produces a visible result
- reference details are linked, not dumped
- conceptual discussion is linked, not over-expanded
- the next step after the README is obvious
