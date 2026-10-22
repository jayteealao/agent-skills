# Critique heuristics (`design/_heuristics.md`)

The reference material of a design critique: the Nielsen scoring rubrics, the cognitive-load check, and the personas. [critique.md](critique.md) loads this file and says when to use each part. Other files cite a part by its heading.

> Load with: `design/_heuristics.md`

Parts adapted from impeccable v4.7.0 (`pbakaus/impeccable`, `374a0e179`), Apache-2.0.

## Nielsen's ten heuristics

Score each heuristic from 0 to 4. A 4 means excellent, not "good enough". Most real interfaces total 20–32 of 40. Give each score one key finding, or "solid".

| # | Heuristic | Check for |
|---|---|---|
| 1 | Visibility of system status | A loading signal during waits; a confirmation of each action (save, send, delete); progress in a multi-step task; the current place in the navigation; inline validation of a form |
| 2 | Match between the system and the real world | The person's own words, no unexplained jargon; information in the order the person expects; familiar icons and metaphors; the reading order of the locale |
| 3 | User control and freedom | Undo and redo; cancel on each form and dialog; a clear way back; a way to clear filters, search and selection; an exit from a long task |
| 4 | Consistency and standards | One term for each concept; the same action gives the same result everywhere; the platform's conventions; one visual system; one gesture for one behavior |
| 5 | Error prevention | A confirmation or an undo before a destructive action; constraints that stop bad input; safe defaults; labels that prevent a mistake; autosave and draft recovery |
| 6 | Recognition rather than recall | Visible options, not buried ones; help at the point of need; recent items; suggestions; a text label on each icon |
| 7 | Flexibility and efficiency of use | Shortcuts for frequent actions; bulk actions; recent items and favorites; expert paths that do not complicate the basic path |
| 8 | Aesthetic and minimalist design | Only the information each step needs; a clear hierarchy; color and emphasis with a purpose; no decoration that competes for attention |
| 9 | Help people recognize, diagnose, and recover from errors | Plain words, no internal codes; the exact problem; a recovery step; the error next to its source; the person's input kept |
| 10 | Help and documentation | Help that is easy to find, organized by task, short, and reachable without leaving the task |

### The score scale

Each heuristic uses the same scale. Read the criteria in the terms of that heuristic.

| Score | Status | Criteria |
|---|---|---|
| 0 | Absent | The heuristic fails everywhere. The person guesses, gets trapped, or meets jargon and cryptic errors. |
| 1 | Rare | The heuristic holds in a few places. Most paths fail it. |
| 2 | Partial | The main paths hold it. Edge cases, secondary paths, and details fail it. |
| 3 | Good | Most paths hold it, with small gaps. |
| 4 | Excellent | Every path holds it. The person never meets a gap. |

Examples for the low and high ends:
- **1 Visibility.** 0: no feedback, the person guesses what happened. 4: every action confirms, and progress is always visible.
- **3 Control.** 0: the person is trapped and must reload. 4: undo, cancel, back, and escape everywhere.
- **4 Consistency.** 0: it feels like several products joined together. 4: one system, predictable behavior.
- **8 Minimalist design.** 0: everything competes for attention equally. 4: every element earns its place.
- **9 Error recovery.** 0: codes, jargon, or no message. 4: the message names the problem, gives the fix, and keeps the person's work.

### Not applicable

On a Persuade or Experience surface, heuristics 7 and 10 can be `n/a`. Any other heuristic that cannot apply to the surface can be `n/a` too. Write `n/a` in the score cell with a one-line reason.

The maximum is 4 times the number of scored heuristics: 40 when all ten apply, 32 when two are `n/a`. Never print `/40` over a partial set.

### The bands

| Total of 40 | Percent | Band | Meaning |
|---|---|---|---|
| 36–40 | 90% or more | Excellent | Small polish only. |
| 28–35 | 70% or more | Good | Fix the weak areas. The base is solid. |
| 20–27 | 50% or more | Acceptable | Large improvements are needed. |
| 12–19 | 30% or more | Poor | The core experience is broken. |
| 0–11 | below 30% | Critical | Redesign. |

With a lower maximum, read the band from the percent. 24 of 32 is 75%: Good.

### Severity of each issue

Tag each issue with a priority, then write the severity of the issue list:

| Priority | Name | Meaning | Severity |
|---|---|---|---|
| P0 | Blocking | The person cannot complete the task. | `blocker` |
| P1 | Major | The person meets large difficulty or confusion. | `high` |
| P2 | Minor | An annoyance with a workaround. | `medium` |
| P3 | Polish | No real effect on the person. | `low` |

An observation with no effect on the person is a `nit`. When you are not sure between two levels, ask: "Would a person contact support about this?" When yes, the issue is at least P1.

## The cognitive-load check

Cognitive load is the mental effort that an interface asks for. An overloaded person makes mistakes and leaves.

Three kinds of load:
- **Intrinsic load** comes from the task. Structure it: split a complex task into steps, give defaults and examples, and show only what the step needs.
- **Extraneous load** comes from the design. Remove it: unclear labels, clutter, inconsistent patterns, and steps between the intent and the result.
- **Germane load** is the effort of learning. Support it: consistent patterns, feedback that confirms understanding, and teaching through action.

### The 5-second test

Look at the view for five seconds. Ask:
- Can a new person name the primary action?
- Is the current state of the system clear at a glance?

When either answer is no, the view asks for too much. Cut each element that does not support the primary task. Group related elements, and separate unrelated groups with consistent space. Make each label say what the control does, and no more.

### The checklist

Check the view against these eight items:

1. **Single focus.** The person completes the primary task without distraction from competing elements.
2. **Chunking.** Information comes in small groups of four items or fewer.
3. **Grouping.** Related items are grouped by proximity, a border, or a shared ground.
4. **Visual hierarchy.** The most important element is clear at once.
5. **One thing at a time.** The person makes one decision before the next.
6. **Minimal choices.** A decision point shows four options or fewer.
7. **Working memory.** The person does not need information from an earlier screen to act on this one.
8. **Progressive disclosure.** Complexity appears only when the person needs it.

Count the failed items: 0–1 is low load, 2–3 is moderate, 4 or more is critical. Flag each decision point that shows more than four options.

### The working-memory rule

A person holds about four items in working memory. At each decision point, count the options, actions, and facts that the person must hold at once:
- four or fewer: within the limit;
- five to seven: group them, or disclose them in steps;
- eight or more: overloaded. The person skips, misclicks, or leaves.

Applications: one primary action, one or two secondary actions, the rest in a menu; five top-level navigation items or fewer; one reading path in a long article; one decision per screen on a gallery index.

### Common faults

| Fault | Fix |
|---|---|
| A wall of options: ten or more choices with no hierarchy | Group them, mark the recommended one, and disclose the rest in steps |
| A memory bridge: step 3 needs a fact from step 1 | Keep the fact visible where it is needed |
| Hidden navigation: the person builds a mental map | Show the current place: an active state, a breadcrumb, a progress signal |
| A jargon barrier | Plain words; define a domain term in place |
| A flat noise floor: every element has the same weight | One primary element, two or three secondary elements, the rest quiet |
| An inconsistent pattern | One kind of action, one kind of control |
| A multi-task demand: read, decide, and navigate at once | Put the steps in sequence |
| A context switch: one decision needs several screens | Put the information for each decision in one place |

## Personas

Walk the primary task as two or three personas. Each persona finds faults that one design review misses. Report specific red flags, not general concerns.

### Choose the personas

| Interface | Personas |
|---|---|
| Landing page, campaign | Jordan, Riley, Casey |
| Dashboard, admin | Alex, Sam |
| Checkout | Casey, Riley, Jordan |
| Onboarding flow | Jordan, Casey |
| Data-heavy view | Alex, Sam |
| Form or wizard | Jordan, Sam, Casey |

When `PRODUCT.md` names an audience that no persona covers, add one or two project personas from it: a role and a name, two or three traits, three or four behaviors, and three or four red flags. Use only facts from `PRODUCT.md`. When it gives no audience, use the five personas below.

### Alex, the impatient expert

Knows similar products. Skips onboarding, looks for shortcuts, tries bulk actions, and leaves when the product feels slow.
- Ask: can Alex finish the core task in under 60 seconds? Can Alex skip onboarding? Do dialogs close with the keyboard?
- Red flags: forced tutorials; no keyboard path for primary actions; slow motion that cannot be skipped; one item at a time where a batch is natural; a confirmation on a low-risk action.

### Jordan, the first-time user

Has never used this kind of product. Reads every instruction, hesitates, and takes each label literally.
- Ask: is the first action clear in five seconds? Does each icon have a text label? Is there help at each decision point? Is there a way back at each step?
- Red flags: icon-only navigation; jargon with no explanation; no visible help; an unclear next step after an action; no confirmation that an action worked.

### Sam, who uses assistive technology

Uses a screen reader and the keyboard only. May have low vision, a motor impairment, or a cognitive difference. Cannot see hover states.
- Ask: can Sam finish the primary flow with the keyboard only? Is focus always visible? Does the screen reader announce loading, success, and error? Does the view hold at the largest text size ([_platforms.md](_platforms.md))?
- Red flags: a pointer-only interaction; a missing focus ring; color as the only signal; an unlabelled field or button; a time limit with no extension; a custom control that breaks the reading order.

### Riley, the stress tester

Pushes the interface past the happy path on purpose. Riley's inputs are the worst-case content of [harden.md](harden.md) → Worst-case content. Do not invent a new list.
- Ask: does each `<surface>--worst` board hold in the build? What happens on reload in the middle of a flow, or in two tabs? Does an error leave the view usable?
- Red flags: a feature that seems to work but gives a wrong result; an error that shows internal details or breaks the view; an empty state with no guidance; data lost on reload or navigation.

### Casey, the distracted phone user

Uses a phone with one hand, on a slow connection, and is interrupted often.
- Ask: are the primary actions in reach of the thumb? Is the state kept when Casey leaves and comes back? Does the view work on a slow connection? Are touch targets large enough ([_platforms.md](_platforms.md))?
- Red flags: primary actions at the top of the screen; progress lost on an interruption; free text where a choice would do; heavy assets on every view; small or crowded targets.
