---
schema: sdlc/v1
type: work-packet
slug: brainstorm-reading-time-20261003
key: reading-badge
work-slug: reading-badge
title: Show a reading-time badge in the docs index
form: intake
target-slug: null
amends: null
urgency: normal
revision: 1
origin-brainstorm: brainstorm-reading-time-20261003
order: 2
depends-on:
  - reading-time
provides:
  - key: index-badge
    text: The docs index shows each page's reading time beside its link.
expects:
  - key: page-minutes
    from: reading-time
    text: Each docs page shows its reading time.
carried-decisions:
  - key: badge-beside-link
    text: The docs index shows the reading time beside each page link.
    session: 1
    decided-at: "2026-10-03T08:50:00Z"
open-ideas: []
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

# Show a reading-time badge in the docs index

The board wins where this packet and the board differ: [brainstorm-board.json](../brainstorm-board.json). The work set: [index.md](index.md).

## Start

Form: `intake`. Order: 2. Size: small, carried decisions: 1. Starts after `reading-time` is done.

```
/wf intake .ai/workflows/brainstorm-reading-time-20261003/work/reading-badge.md
```

## What the person decided

- **badge-beside-link** — The docs index shows the reading time beside each page link. (session 1, 2026-10-03T08:50:00Z)

## Provides and expects

- Provides `index-badge`: The docs index shows each page's reading time beside its link.
- Expects `page-minutes` from `reading-time`: Each docs page shows its reading time.

## Depends on / needed by

- Depends on: `reading-time`.
- Needed by: nothing.
