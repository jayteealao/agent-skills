# Retro — artifact template and additive-write contract (`retro.md`)

Load this file from `retro.md` when you write `10-retro.md`.

## `10-retro.md` structure

```yaml
---
schema: sdlc/v1
type: retro
slug: <slug>
retro-scope: <slug | branch>          # branch = part of a batch retro over every slug on the branch
deep-retro: false                     # true only when the `deep` token ran the deep pass (transcript mining where the host keeps transcripts; artifact-only fallback otherwise)
branch: "<branch name or empty>"      # set in batch mode
branch-slugs: []                      # the roster (batch mode only; empty otherwise)
status: complete
stage-number: 10
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
workflow-outcome: <completed|abandoned|partial>
learnings-written: []              # paths of .ai/solutions/ files this retro wrote/updated (empty list allowed)
metric-improvement-count: <N>
metric-stages-completed: <N>
metric-stages-skipped: <N>
tags: []
refs:
  index: 00-index.md
next-command: ""
next-invocation: ""
---
```

# Retro

## The Retro
<!-- STORY SECTION — first, and self-sufficient. MUST follow `_story-arc.md`: three beats in order — the state this stage inherited, the load-bearing decisions with reasons and counts, then what this stage enables next plus the top open risk. Language MUST follow `_ste-procedural.md` sections 1 and 3. No "This <stage> implements…" opening. 1–3 short paragraphs. -->

## What Went Well
- ...

## Friction / Failure Points
- ...

## Root Causes
- ...

## Recommended Improvements
- priority: improvement

## Suggested Repo Instruction Updates
```md
<copy-paste-ready additions or edits for AGENTS.md / CLAUDE.md>
```

## Suggested Automation / Hook Opportunities
- ...

## Suggested Test / CI Improvements
- ...

## Keep / Change / Drop
Keep:
- ...
Change:
- ...
Drop:
- ...

## Deferred Debt
<!-- From the deferred-debt harvest (Analysis sub-agent 1). One row per `sdlc-debt:` marker THIS workflow introduced; scoped to this workflow, not the whole repo.
| Marker (file:line) | Ceiling | Upgrade path | Recorded in | Disposition |
|---|---|---|---|---|
| `src/auth.ts:42` | global lock serializes all tenants | per-tenant lock keys | 05-implement-auth.md ## Known Risks | act-now → /wf intake refactor "per-tenant auth locks" |
Disposition is `act-now` (routes to a follow-up workflow via Option B below) or `accept` (a deliberate ceiling that stays visible but needs no action now).
If the workflow introduced no shortcuts: "No deferred debt — no `sdlc-debt:` markers introduced." -->

## Learnings Written
<!-- One line per learning distilled into .ai/solutions/ (path + its index hook), or:
"None — no finding passed the durability filter." Match the frontmatter learnings-written list. -->

## Recommended Next Stage
- **Option A (default):** Workflow complete
- **Option B:** `/wf intake <follow-up>` — [reason, if applicable]
- **Option C:** `/wf plan <slug> <next-slice>` — next slice [reason, if applicable]
- **Option D:** Apply improvements — [list quick wins, if applicable]


## Additive-write contract (v9.20.2+)

`10-retro.md` is usually one-shot (a retro runs once at workflow close), but
it IS revisable — extended retrospectives sometimes add a follow-up "30-day
check" or "quarterly look-back" section. When `/wf retro` is re-invoked on a
slug that already has one, follow the shared additive-write contract in
[_additive-write.md](../_additive-write.md) with:

- Snapshot: `.ai/workflows/<slug>/history/10-retro-<rev>.md`.
- **Rewrite the body** so the retro reads as current truth — fold the revisit's
  findings into the relevant sections rather than appending a `## Revision N`
  block. The `## The Retrospective` story section carries the arc (what we said
  at close vs. what actually happened 30 days later).
- **Ledger entry**: append one `revisions:` entry with `trigger: manual` (or
  `scope-change` for an incident-driven revisit), `because:` naming the revisit
  ("30-day check-in", "post-incident follow-up", "quarterly review"), and
  `changed:` naming what moved.

A retro's value is largely *historical* — the point of the revisit is to compare
original intent against later reality. That comparison lives in the story
section and in the verbatim history snapshots, not in a stack of body sections.
