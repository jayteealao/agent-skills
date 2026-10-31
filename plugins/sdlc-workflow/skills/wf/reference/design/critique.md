Provide prescriptive, actionable design feedback. Unlike `audit` (which measures technical quality), critique evaluates the design *decisions* — whether they serve the user and communicate the brand effectively.

Load [_heuristics.md](_heuristics.md) for the scoring rubrics, the cognitive-load check, and the personas. Load [_craft-floor.md](_craft-floor.md) as a checklist: judge the work against its Refuse list and its Model tells. The critique draws nothing.

Parts adapted from impeccable v4.7.0 (`pbakaus/impeccable`, `374a0e179`), Apache-2.0.

## Design mode

Read the design mode of each surface from `02c-craft.md` `surface-modes:` (`wf.mjs record get`), or from the brief's content inventory. An older workflow records `register` instead: read `brand` as Persuade and `product` as Operate.

Persuade and Experience: critique against distinctiveness. Would someone ask "how was this made?" If the answer is "no — it looks like every other AI landing page," the design has failed. Critique for POV, specific aesthetic lane, and committed visual choices.

Operate and Read: critique against earned familiarity. Does the interface feel like a tool a skilled user can trust, or a text a reader can follow? Critique for consistency, state completeness, affordance clarity, and reading order — not for visual novelty.

---

## Stance

A good critique is specific, not general. "The typography feels off" is not a critique. "The heading weight contrast ratio between h1 and h2 is 1.15× — too flat for the information hierarchy required here" is a critique.

Be direct. Don't soften findings. The goal is to surface the real problems, not to make the designer feel good. Surface-level praise before every criticism ("this is nice but…") wastes the critique.

## Isolation

Judge the design before you read the evidence, so that the evidence does not anchor the judgment.

1. In `/wf review`, the critique already runs as an isolated child reviewer. Continue at step 3.
2. In a freestanding `/wf design critique`, send the design review to a fresh-context sub-agent per [_subagents.md](../_subagents.md). Give it the screen pages, the built surfaces, `02c-craft.md`, and this file. Do not give it the verify results.
3. Read the `06-verify-*.md` evidence (`wf.mjs record get`) only after the review is written. Add each measured fault that the review missed, and name each review finding that the evidence disproves.
4. When isolation is not possible, write this line first in the report: "Method: single context (<reason>)."

## Design specificity verdict

Write this first. Could a neighboring product in the same category ship this design unchanged? Judge the coherence of the whole, the structural sameness, the choices that any product in the category could make, and the missed chances for product character. Give one verdict: `specific`, `partly specific`, or `interchangeable`, with the reason.

## Heuristic score

Score Nielsen's ten heuristics per [_heuristics.md](_heuristics.md) → Nielsen's ten heuristics. On a Persuade or Experience surface, heuristics 7 and 10 can be `n/a`; rescale the total to the scored maximum. Give the total and its band.

## Evaluation Dimensions

### 1. Purpose alignment

Does the design serve its stated purpose?
- Is the primary user action immediately obvious?
- Does the information hierarchy match the user's decision path?
- Is the emotional tone appropriate for the context?

Ask: "What would a user do in their first 5 seconds here? Does the design support that?"

Run the cognitive-load check of [_heuristics.md](_heuristics.md) → The cognitive-load check: the 5-second test and the eight items. Give the count of failed items and the load level. Flag each decision point that shows more than four options.

### 2. Visual hierarchy

Does the eye travel correctly?
- Is there a clear entry point?
- Does size, weight, color, and spacing guide attention in the right order?
- Are there competing focal points that fight each other?

Run the squint test: blur the detail. The primary element, the secondary element, and the major groups still read in order.

### 3. Typographic execution

- Does the type scale communicate the content hierarchy?
- Are font choices aligned with the design mode and the brief?
- Are there line length, line height, or tracking issues?
- Check against the reflex list in [typeset.md](typeset.md) → Font selection on a Persuade or Experience surface. Flag a listed font on a new surface without a reason.

### 4. Color execution

- Does the color strategy follow the chosen dosage (Restrained / Committed / Full palette / Drenched)?
- Are semantic colors consistent?
- Check against the Refuse list of [_craft-floor.md](_craft-floor.md): a colored side stripe above 1 px is always refused. Call each one out explicitly.
- Does secondary text on a colored ground take its color from that hue?

### 5. Spatial quality

- Is there a consistent spatial system (spacing multiples)?
- Does whitespace have intent or does it feel accidental?
- Are there density problems (too tight / too spread)?

### 6. Component consistency

- Do interactive elements follow a consistent vocabulary?
- Are all required states present (hover, focus, active, disabled)?
- Are there invented affordances where standard ones would serve better?

### 7. Slop check

Would someone say "AI made this"?
- Check the Refuse list and the Model tells of [_craft-floor.md](_craft-floor.md). Name each one that is present.
- Persuade and Experience: does it have a POV? Can you name the aesthetic lane?

### 8. Motion & interaction feel

When the surface has motion in scope:
- Does each animation pass the gates of `animate.md` — a frequency tier that allows it and a named purpose? Frequently-seen and keyboard-triggered actions do not animate; occasional and first-time moments can.
- Does it *feel* responsive — ease-out or a strong curve token on entrances and exits (never ease-in), inside the durations of `animate.md`, popovers scaling from their trigger origin, nothing scaling from 0?
- Is fast-fired or gesture motion retargetable (a retargetable animation or a spring, not a restarting animation)?
- Does the motion cohere with the component's personality, or does it feel borrowed?

Then run the opportunity sweep of `animate.md` once: list at most 5–7 places that should move but do not, and 2–5 rejected candidates with the gate that rejected each. "The motion here is already right" is a valid result. For the sweep alone on a confirmed design, run `/wf design <slug> animate`.

Motion bugs hide at full speed — review animations in slow motion or frame-by-frame, and with fresh eyes the next day, before judging them. The full rubric is `animate.md` and the `motion` section of the `interface-craft` review rubric. Platform forms are in `_platforms.md`.

### 9. Identity and direction

Judge the work against the design record:
- Compare it with the identity in `PRODUCT.md` at the project root.
- Compare it with the goals in `.ai/design/direction.md`.
- Give a finding that moves away from a stated goal a severity of `medium` or higher.

### 10. Personas

Walk the primary task as two or three personas, chosen per [_heuristics.md](_heuristics.md) → Personas. Report each red flag with its surface. Riley walks the `worst` state of each screen.

## Severity

Tag each issue P0 to P3 per [_heuristics.md](_heuristics.md) → Severity of each issue. Write it in the issue list as `blocker`, `high`, `medium`, or `low`. Use `nit` for a small observation.

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
[1–3 specific things that are genuinely strong, with reasons]

### Issues — ordered by impact

1. **C1 [Issue title]** — Severity: blocker/high/medium/low/nit (P0–P3)
   Dimension: [critique dimension]
   What: [specific problem]
   Where: [file:component or visual area]
   Why it matters: [effect on user or design quality]
   Fix: [specific, actionable recommendation]

2. ...

### Persona red flags
[persona — red flag — where]

### Summary assessment
[2–3 sentences: the overall design direction and whether it will serve its purpose]
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

- Give each issue an ID, a severity, and a dimension. Later stages read the severity of each finding from the issue list.
