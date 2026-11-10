Judge the design decisions: whether they serve the person and whether they belong to this product. The critique draws nothing. The measured checks, the tokens and the Refuse lists are the audit ([audit.md](audit.md)); the critique does not score them again.

The critique has four parts: the specificity verdict, the heuristic score, the personas, and the identity check. Load [_heuristics.md](_heuristics.md) for the rubrics, the cognitive-load check and the personas.

Parts adapted from impeccable v4.7.0 (`pbakaus/impeccable`, `374a0e179`), Apache-2.0.

## Design mode

Read the design mode of each surface from `02c-craft.md` `surface-modes:` (`wf.mjs record get`), or from the content inventory of the brief. An older workflow records `register` instead: read `brand` as Persuade and `product` as Operate.

| Mode | Critique against |
|---|---|
| Persuade and Experience | Distinctiveness. Would someone ask "how was this made?" Look for a point of view, a named aesthetic lane and committed choices. |
| Operate and Read | Earned familiarity. Does the interface feel like a tool that a skilled user can trust, or a text that a reader can follow? Look for consistency, complete states, clear affordances and reading order, not for novelty. |

---

## Stance

A critique is specific. "The typography feels off" is not a finding. "The h1 is 1.15 times the h2: too flat for this hierarchy" is a finding. Be direct. Do not soften a finding, and do not put praise before each one.

## Isolation

Judge the design before you read the evidence, so that the evidence does not anchor the judgment.

1. In `/wf review`, the critique already runs as an isolated child reviewer. Continue at step 3.
2. In any `/wf design … critique` run, with or without a slug, send the design review to a fresh-context sub-agent per [_subagents.md](../_subagents.md). Give it the screen pages, the built surfaces, `02c-craft.md`, this file and [_heuristics.md](_heuristics.md). Do not give it the verify results.
3. Read the `06-verify-*.md` evidence (`wf.mjs record get`) only after the review is written. Add each measured fault that the review missed, and name each review finding that the evidence disproves.
4. When isolation is not possible, write this line first in the report: "Method: single context (<reason>)."

## 1. Design specificity verdict

Write this first. Could a neighboring product in the same category ship this design unchanged? Judge:
- the coherence of the whole;
- the structure: is it the template of the category?
- the choices that any product of the category could make: the palette, the face, the shape, the motion;
- the missed chances for product character.

A refused element or a model tell of [_craft-floor.md](_craft-floor.md) is evidence here. Name it; do not score it. On a Persuade or Experience surface, a face from the reflex list of [typeset.md](typeset.md) → Font selection with no stated reason is evidence too.

Give one verdict: `specific`, `partly specific` or `interchangeable`, with the reason.

## 2. Heuristic score

Score the ten heuristics per [_heuristics.md](_heuristics.md) → Nielsen's ten heuristics. On a Persuade or Experience surface, heuristics 7 and 10 can be `n/a`; rescale the total to the scored maximum. Give the total and its band.

Then run the cognitive-load check of [_heuristics.md](_heuristics.md): the 5-second test and the eight items. Give the count of failed items and the load level. Flag each decision point that shows more than four options.

## 3. Personas

Walk the primary task as two or three personas, chosen per [_heuristics.md](_heuristics.md) → Personas. Report each red flag with its surface. Riley walks the `worst` state of each screen.

## 4. Identity and direction

Judge the work against the design record:
- Compare it with the identity in `PRODUCT.md` at the project root.
- Compare it with the goals in `.ai/design/direction.md`.
- Compare it with the direction and the anti-goals of `02c-craft.md`.
- Give a finding that moves away from a stated goal a severity of `medium` or higher.

## Severity and routing

Tag each issue P0 to P3 per [_heuristics.md](_heuristics.md) → Severity of each issue. Write it in the issue list as `blocker`, `high`, `medium` or `low`. Use `nit` for a small observation.

Name the move that fixes each issue, from the routing table of [_lane.md](_lane.md) → Moves. An issue against an approved screen routes to `/wf design <slug> amend` with that move. For a motion sweep, route to `/wf design <slug> animate`; the critique does not run one.

## Output Format

```
## Design Critique

Method: <isolated reviewer | sub-agent | single context (<reason>)>

### Design specificity verdict
[specific | partly specific | interchangeable — the reason]

### Heuristic score
| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 0–4 or n/a | ... |
| ... | | | |
| **Total** | | **X/<scored maximum>** | **<band>** |

Cognitive load: <failed items>/8 — <low | moderate | critical>

### What's working
[1–3 specific things that are strong, with reasons]

### Issues — ordered by impact

1. **C1 [Issue title]** — Severity: blocker/high/medium/low/nit (P0–P3)
   Dimension: [specificity | heuristic <n> | persona <name> | identity]
   What: [specific problem]
   Where: [screen key, or file:component]
   Why it matters: [effect on the person or on the product character]
   Fix: [specific recommendation]
   Move: [the move of the routing table]

2. ...

### Persona red flags
[persona — red flag — where]

### Summary assessment
[2–3 sentences: the direction of the design, and whether it will serve its purpose]
```

## Close with questions

After the report, ask the person two to four targeted questions in one batch per [_gate-question.md](../_gate-question.md). Write the report first, and put the questions last. Each question names findings from the report and gives two or three concrete options. Ask about:
- the priority: which area of findings to fix first;
- the intent: when the tone does not match the brief, whether the difference is intended;
- the scope: all issues, the top three, or the blockers only;
- the limits, only when the findings touch many areas: what must stay as it is.

When the report lists fewer than three issues, you can skip the questions. Then write: "Questions skipped: <count> issues."

## Output in SDLC context

When invoked as `/wf design <slug> critique`:
- Write the draft `<wf-dir>/.draft/07-design-critique.md`, then run `node "<skill-dir>/scripts/wf.mjs" record put "<root>" <slug>` ([_records.md](../_records.md))
- When `02c-craft.md` names `screens:`, judge the pairs of approval picture and capture in `06-verify-*.md` `## Design Comparison` (`design/_surface.md`). Name the screen key in the `Where` line of the issue.
- Do not reopen a screen that the person approved. Write a finding against an approved screen as a question for `/wf design <slug> amend`. Do not redraw the screen.
- Use this frontmatter:

```yaml
---
schema: sdlc/v1
type: design-critique
slug: <slug>
title: Design critique
status: ready
created-at: <timestamp>
updated-at: <timestamp>
scope: <surface|flow|system|narrative>
findings-count: <number>
severity-distribution:
  blocker: <number>
  high: <number>
  medium: <number>
  low: <number>
  nit: <number>
refs:
  implementation: 05-implement.md
next-command: wf-review
next-invocation: "/wf review <slug>"
recommended-routes: [{invocation: "/wf review <slug>", reason: "fold the findings into review", default: true}]
---
```

- Give each issue an ID, a severity and a dimension. Later stages read the severity of each finding from the issue list.
