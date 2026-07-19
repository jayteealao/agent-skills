---
name: diataxis
description: Write or review documentation using the Diátaxis framework. Use when the user asks for a tutorial, how-to guide, technical reference, explanation/conceptual doc, README, a documentation plan, or a review/audit of existing docs. Classifies the request into the right quadrant and enforces boundary discipline between them (learning vs task vs lookup vs understanding). For documentation produced as a stage of an /wf lifecycle workflow, use /wf docs instead.
version: 1.0.0
disable-model-invocation: false
argument-hint: "[tutorial|how-to|reference|explanation|readme|plan|review] <what to document>"
---

# Diátaxis documentation

Author and review documentation under the [Diátaxis](https://diataxis.fr) framework.
Diátaxis splits documentation into four modes serving four distinct user needs, plus
two supporting activities — a planner that classifies and maps a whole docs set, and a
reviewer that audits existing docs against the framework.

The one rule that makes Diátaxis work is **boundary discipline**: each page serves
exactly one mode. Mixing a tutorial with reference tables, or a how-to with conceptual
background, is the most common documentation failure. Classify first, then write to the
mode.

## Relationship to `/wf docs`

This skill is the **general-purpose, standalone** documentation surface — reach for it
for any repo, any docs request, outside a workflow. The `/wf docs` key is the
**lifecycle-bound** counterpart: it writes docs as `.ai/` workflow artifacts with
frontmatter and index bookkeeping. Same Diátaxis discipline, different home. If the
request is "document this slug / this shipped feature" inside an active workflow, use
`/wf docs`; otherwise use this skill.

## Routing — classify the request, then load one reference

Determine which mode the request needs and read the matching reference. If the request
is ambiguous, mixes modes, or spans a whole docs set, start with the **planner**.

| The user wants… | Mode | Reference |
|---|---|---|
| A beginner walkthrough, getting-started lesson, onboarding — learning by doing | Tutorial (learning) | [references/tutorial.md](references/tutorial.md) |
| Step-by-step instructions to achieve a specific goal; troubleshooting, config, deployment, migration, runbook | How-to (task) | [references/how-to.md](references/how-to.md) |
| API docs, CLI reference, config/parameter tables, schemas, error codes, compatibility matrices | Reference (lookup) | [references/reference.md](references/reference.md) |
| Conceptual guide, architecture overview, design rationale, trade-offs, "why is it built this way?" | Explanation (understanding) | [references/explanation.md](references/explanation.md) |
| A README, GitHub front page, library landing page, docs homepage | README (front door) | [references/readme.md](references/readme.md) |
| To plan a docs structure, classify an ambiguous request, or map a whole docs set | Planning | [references/doc-planner.md](references/doc-planner.md) |
| To review, audit, classify, or reorganise existing docs against Diátaxis | Review | [references/docs-reviewer.md](references/docs-reviewer.md) |

If `$ARGUMENTS` opens with an explicit mode keyword (`tutorial`, `how-to`, `reference`,
`explanation`, `readme`, `plan`, `review`), honor it and skip classification. Otherwise
infer the mode from the request, and when a request obviously bundles several
deliverables (e.g. "a README and a full docs set"), route through the planner first.

## The four quadrants at a glance

| | Practical steps | Theoretical knowledge |
|---|---|---|
| **Serving study (acquiring skill)** | Tutorial — learning-oriented | Explanation — understanding-oriented |
| **Serving work (applying skill)** | How-to — task-oriented | Reference — information-oriented |

- **Tutorial** and **How-to** both give steps, but a tutorial teaches a learner while a how-to serves someone who already knows what they want.
- **Reference** and **Explanation** both convey knowledge, but reference is neutral lookup during work while explanation builds mental models during study.

Keeping a page inside one cell is the whole discipline. When you catch a page straddling
two cells, that is the signal to split it — the reviewer and planner references cover how.
