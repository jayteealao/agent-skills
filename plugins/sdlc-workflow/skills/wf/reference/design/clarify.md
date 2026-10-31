> **Additional context needed**: what the audience already knows, and their emotional state at each moment.

Rewrite unclear interface text. After the rewrite, a person knows what happened, what matters and what to do next. Keep the factual meaning, the product terms and the voice.

Clarify changes words. Visual hierarchy and reading order are in [layout.md](layout.md). Removing elements is in [distill.md](distill.md). The cognitive-load check is in [_heuristics.md](_heuristics.md).

---

## Design mode

Persuade and Experience: say the offer in one line. Name the action the visitor came for. Invent no claim.

Operate: write a verb and an object on each action. State the system state plainly. Use one term per concept on every screen.

Read: make each heading answer the reader's question. Make link text work out of context.

---

## Audit the language

Read the whole interaction path, not single strings. Find:
- ambiguous nouns, verbs and actions;
- internal jargon and assumed knowledge;
- vague labels, outcomes and system states;
- a missing consequence, recovery or timing;
- inconsistent terms and capitals;
- repeated headings, introductions, helper text and confirmations;
- text that breaks at real widths or in translation;
- a tone that ignores stress, risk, success or urgency.

Take the audience and the task from the product context and the surrounding UI. Ask before you change a factual claim, a legal meaning or a term that can be specific to the domain.

## Set the message order

For each state, decide in this order:
1. The one fact the person needs now.
2. The next action.
3. The context that changes the decision.
4. The tone for this moment.

Say each idea once. When the heading already explains the state, the introduction adds new information or goes.

## Rewrite by function

### Actions and navigation

Write a verb and an object when the outcome is not obvious. A label names what happens, not the gesture that starts it. Use the same noun and verb for the same concept across the product.

On a destructive action, name the object and the consequence. When recovery is safe, prefer undo to a confirmation. When a confirmation is necessary, name the action in the message and on the button. Never write Yes, No, OK or Submit.

### Forms

Give each field a persistent label. A placeholder is an example, not a label. Put format and eligibility rules before the submit. When the reason for a field is not obvious, say why you ask for it. Mark required and optional fields the same way everywhere.

A validation message says what needs attention and how to correct it. It does not blame the person. Keep the instruction near its field, and announce the error to assistive technology.

### Errors and permissions

An error answers three questions:
1. What failed.
2. Why, when the cause is known and useful.
3. How to recover, or what other path remains.

Do not show an internal code as the main message. Do not promise a cause or a fix that the system cannot know. Keep the person's input. On privacy, payment, deletion, lost access and blocked work, warm words are allowed, jokes are not.

### Loading, empty and success states

Loading text names the real operation. When the wait is long, set an honest expectation. Show real progress when the system knows it. Never invent progress.

An empty state tells which case it is: first use, no results, an active filter, no permission or a failure. Explain the state and give the next useful action.

A success message confirms the outcome. Name the next consequence only when it changes what the person does next. Keep a routine success short.

### Help text

Helper text answers a question the person has. It does not repeat the control. Put uncommon detail behind progressive disclosure. Give every icon-only control an accessible name that matches its action.

## Voice and language

Keep the voice the same everywhere. Change the tone for the moment. Use plain language, and keep the terms that the audience knows.

- Write each message as one whole translatable sentence. Never build a sentence from fragments.
- Keep variables and numbers structured, so that a translator can reorder them.
- Leave room for longer translations. Do not abbreviate early. See [harden.md](harden.md) §12 and the worst-case corpus in §11.
- Make alt text carry the information of the image. Give a decorative image an empty alt.
- Keep each accessible name aligned with its visible label and its outcome.
- Do not let punctuation, color or an icon carry the message alone.

When terms differ across the product, keep a short terminology list. Do not vary words for effect in an interface.

## Verify

Read the flow in context. Answer each item with evidence: the string, its screen and its state.
- A person without hidden product knowledge understands it.
- Each error, empty state and decision point gives an action.
- Each claim is true, and each term is consistent.
- The text scans at every target width and at the largest text size ([_platforms.md](_platforms.md)).
- Long names, longer translations, plurals and dynamic values fit.
- Accessible names are correct, and state changes are announced.
- The tone fits the consequence and the emotional context.

The final copy is as short as it can be without losing meaning or recovery.

## Never

- Removing information that a person needs in a rare but important case.
- Changing a factual claim, a legal meaning or a domain term without asking.
- A joke on an error, a loss, money, privacy or blocked work.

## In the workflow

This file is a move. [_lane.md](_lane.md) → Moves says how each stage uses it.
Focus: interface text. Checks: the audit and the Verify list. Notes record: each changed string (old and new, with its screen and state), the terminology list, and the claims and terms that wait for the person.

---

> *Parts adapted from impeccable v4.7.0 (`pbakaus/impeccable`, `374a0e179`), Apache-2.0.*
