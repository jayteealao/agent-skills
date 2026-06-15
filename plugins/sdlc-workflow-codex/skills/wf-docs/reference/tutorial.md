---
name: diataxis:tutorial
description: Use when the user asks for a tutorial, beginner walkthrough, getting-started lesson, first-project guide, or onboarding material for new users. Creates learning-oriented step-by-step lessons where readers learn by doing something meaningful. The goal is skill and confidence, not task completion. Do not use for advanced tasks, troubleshooting, or exhaustive product coverage — those are how-to guides.
---

# Tutorial writer

## Purpose

Create a true tutorial: a learning-oriented lesson in which the reader learns by doing something meaningful.

This is not a how-to guide. The aim is not to help an already-competent user complete a task, but to help a learner build skill and confidence.

## When to use

Use this skill when the user asks for:

- a beginner walkthrough
- a getting started lesson
- a first project
- onboarding material for new users

Do not use this skill for troubleshooting, advanced tasks, operational runbooks, or exhaustive product coverage.

## Tutorial promise

A tutorial should say, in effect:

"Stay with me, follow these steps, and you will successfully build or do something concrete."

The author is responsible for the learner's path and success.

## Key principles

- learning-oriented, not task-oriented
- concrete actions, not abstraction
- visible results early and often
- clear expected outcomes at each step
- minimal explanation
- no unnecessary options or alternatives
- strong reliability and testability

## Structure

Use this shape:

1. Title focused on the thing the learner will make or achieve
2. What we are going to build or do
3. Prerequisites kept minimal
4. Step-by-step lesson
5. Checkpoints with expected results
6. Short recap of what the learner now has
7. Next steps linking to how-to, reference, and explanation

## Writing rules

### Start with a concrete destination

State what the learner will accomplish, not what they will "learn".

Good:
- In this tutorial, we will build a small Kotlin client that fetches weather data.

Bad:
- In this tutorial, you will learn about networking, architecture, and design.

### Deliver visible results early

Get to a meaningful output quickly.

Every step should create an observable result:
- a command succeeds
- a UI changes
- a file appears
- a request returns data
- a test passes

### Maintain expectation

Tell the learner what should happen next.

Use language like:
- You should now see...
- The output should look like...
- If you do not see..., check...

### Minimise explanation

Only explain just enough for the step to make sense.
Move conceptual depth into explanation pages.

### Remove choices

Choose defaults for the learner.
Do not branch unless absolutely necessary.

### Favour confidence over coverage

A shorter tutorial that works is better than a broad tutorial that overwhelms.

## Inputs to gather

- exact learner starting point
- one meaningful end result
- minimal prerequisites
- stable environment assumptions
- commands, files, and outputs that can be tested
- known failure points

## Output contract

Produce a tutorial that:

- is safe for a beginner to follow
- works as written on the chosen happy path
- includes expected outputs or checkpoints
- resists distraction
- hands off naturally to deeper docs

## Anti-patterns to remove

- long conceptual detours
- option matrices
- exhaustive flags and parameters
- advice for advanced users
- hidden prerequisites
- steps without observable outcomes

## Final self-check

Before returning, verify:

- the tutorial has one achievable goal
- every step has a reason to exist
- the learner gets a result early
- the likely failure points are anticipated
- explanation is ruthlessly trimmed
- the ending points to the next appropriate docs
