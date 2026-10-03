---
schema: sdlc/v1
type: work-set
slug: brainstorm-reading-time-20261003
work-set: multi
work-revision: 1
slugs:
  - reading-time
  - reading-badge
waves:
  - - reading-time
  - - reading-badge
written: []
generated-at: "2026-10-03T09:00:00Z"
---

# Work set: a per-page reading-time estimate

The board wins where this file and the board differ: [brainstorm-board.json](../brainstorm-board.json). Changes by revision: [changes.md](changes.md).

## Packets

| Order | Packet | Form | Size | State | Depends on |
|---|---|---|---|---|---|
| 1 | [Show a reading-time estimate on each docs page](reading-time.md) | intake | small | proposed | — |
| 2 | [Show a reading-time badge in the docs index](reading-badge.md) | intake | small | proposed | `reading-time` |

## Written in the brainstorm session

- None.

## Contracts

- `reading-time` provides `page-minutes`; `reading-badge` expects it.

## Waves

1. `reading-time`
2. `reading-badge`

## Start commands

In order. A packet starts after every packet it depends on is done.

1. `/wf intake .ai/workflows/brainstorm-reading-time-20261003/work/reading-time.md`
2. `/wf intake .ai/workflows/brainstorm-reading-time-20261003/work/reading-badge.md`
