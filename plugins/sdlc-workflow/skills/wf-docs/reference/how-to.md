---
name: diataxis:how-to
description: Use when the user asks for a how-to guide, step-by-step instructions for a specific goal, troubleshooting guide, configuration guide, deployment steps, migration guide, or operational runbook. Creates goal-oriented guides for competent users who know what they want to achieve. The reader already understands the basics — this is about getting work done. Do not use for beginner onboarding (use tutorial) or conceptual background (use explanation).
---

# How-to guide writer

## Purpose

Create a goal-oriented guide that helps a competent user get something done.

A how-to guide is about work, not study. It is not a tutorial.

## When to use

Use this skill when the user asks for:

- how to do a specific task
- troubleshooting a known problem
- configuration for a concrete outcome
- deployment or migration steps
- operational procedures

Do not use this skill for beginner onboarding or conceptual background.

## Core stance

Assume the reader:

- already understands the basics
- knows what outcome they want
- can apply judgement while following guidance

## What a good how-to guide does

- addresses a real task, goal, or problem
- keeps a tight focus on the outcome
- contains action and only action
- avoids teaching, essays, and filler
- links out for reference or explanation when needed

## Scope rules

Good scopes:

- Configure token refresh for Android clients
- Migrate from v1 config to v2
- Diagnose webhook signature failures
- Deploy with Docker Compose behind Traefik

Bad scopes:

- Learn Android networking
- Build a web app
- Understand authentication

## Structure

Use this structure unless the task genuinely needs branching:

1. Title in "How to..." form
2. When to use this guide
3. Assumptions / prerequisites
4. Steps
5. Validation or verification
6. Recovery / troubleshooting notes if essential
7. Links to reference and explanation

## Writing rules

- start with the outcome
- prefer direct imperative steps
- skip obvious hand-holding
- include only decisions relevant to the goal
- use branches only when reality demands them
- include verification steps so the user knows they succeeded

## Handling non-linear tasks

A how-to guide does not have to be perfectly linear.
If the task has forks, entry points, or judgement calls:

- make decision points explicit
- separate branches clearly
- explain which path to choose in one line
- return to the main flow quickly

## Inputs to gather

- exact task or problem
- user environment
- assumptions about baseline competence
- required prerequisites
- success criteria
- common failure conditions

## Output contract

Produce a guide that:

- gets a competent reader to a specific result
- stays tightly on-task
- avoids tutorial-style teaching
- avoids reference-dump behaviour
- includes a clear success check

## Anti-patterns to remove

- broad "getting started" framing
- large conceptual sections
- exhaustive command flag explanations
- multiple unrelated goals in one page
- step narration that insults the reader's competence

## Final self-check

Before returning, verify:

- the guide solves one concrete problem
- the target reader is already competent
- every paragraph serves the task
- the user can verify success
- supporting facts live in reference, not inline unless essential
