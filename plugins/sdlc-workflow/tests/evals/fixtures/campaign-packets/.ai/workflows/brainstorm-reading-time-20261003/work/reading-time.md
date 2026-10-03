---
schema: sdlc/v1
type: work-packet
slug: brainstorm-reading-time-20261003
key: reading-time
work-slug: reading-time
title: Show a reading-time estimate on each docs page
form: intake
target-slug: null
amends: null
urgency: normal
revision: 1
origin-brainstorm: brainstorm-reading-time-20261003
order: 1
depends-on: []
provides:
  - key: page-minutes
    text: Each docs page shows its reading time.
expects: []
carried-decisions:
  - key: minutes-at-top
    text: Each docs page shows its reading time in whole minutes under the title.
    why: Readers decide before they scroll.
    session: 1
    decided-at: "2026-10-03T08:30:00Z"
  - key: two-hundred-wpm
    text: The estimate counts 200 words per minute and never shows less than 1 minute.
    session: 1
    decided-at: "2026-10-03T08:40:00Z"
open-ideas:
  - code-blocks-count
findings:
  - pages-are-markdown
assumptions: []
later: []
research: []
references: []
ux-impact: none
design: none
size: small
state: proposed
routed-to: null
generated-at: "2026-10-03T09:00:00Z"
---

# Show a reading-time estimate on each docs page

The board wins where this packet and the board differ: [brainstorm-board.json](../brainstorm-board.json), [01-brainstorm.md](../01-brainstorm.md). The work set: [index.md](index.md).

## Start

Form: `intake`. Order: 1. Size: small, carried decisions: 2.

```
/wf intake .ai/workflows/brainstorm-reading-time-20261003/work/reading-time.md
```

## What the person decided

Intake shows these decisions with their dates, and the person confirms or changes each group. Intake does not re-word them.

- **minutes-at-top** — Each docs page shows its reading time in whole minutes under the title. Why: Readers decide before they scroll. ([board](../brainstorm-board.json#minutes-at-top)) (session 1, 2026-10-03T08:30:00Z)
- **two-hundred-wpm** — The estimate counts 200 words per minute and never shows less than 1 minute. ([board](../brainstorm-board.json#two-hundred-wpm)) (session 1, 2026-10-03T08:40:00Z)

## What is still open

- **code-blocks-count** — Do code blocks count as words? ([board](../brainstorm-board.json#code-blocks-count))

## What we found

Intake re-verifies each finding against the current code. A contradicted finding becomes a known unknown.

- **pages-are-markdown** — Every docs page is a markdown file under docs/. Evidence: `docs/guide.md:1`. ([board](../brainstorm-board.json#pages-are-markdown))

## What we assume

- None.

## Provides and expects

- Provides `page-minutes`: Each docs page shows its reading time.

## Depends on / needed by

- Depends on: nothing.
- Needed by: `reading-badge`.

## Left for later and cut

- None.

## Sources

- None.
