# Design — artifact contracts and final-summary rules (`design.md` Steps 1 and 2)

Load this file from `design.md` Step 1 (registration and the transformation artifact) and Step 2 (the final-summary rules). A move pass of `design/stage.md` and a move that `implement` applies also write their notes per "Registration and the transformation artifact".

## Registration and the transformation artifact

**Augmentation registration** (a move that `implement` applies, audit, critique) — create `augmentations:` in
`00-index.md` if absent. Set the whole list with `node "<skill-dir>/scripts/wf.mjs" record set "<root>" <slug> index augmentations=<list>`: the entries of the index plus the new one ([_records.md](../_records.md)):

```yaml
augmentations:
  - type: design-<sub-command>
    artifact: design-notes/<sub-command>-<timestamp>.md   # or 07-design-audit.md / 07-design-critique.md
    created-at: <timestamp>
    files-modified: [list of code files changed]   # transformations only
```

**Transformation artifact contract** (`design-notes/<sub-command>-<timestamp>.md`):

```yaml
---
schema: sdlc/v1
type: design-augmentation
sub-command: <name>
slug: <slug>
created-at: <timestamp>
design-mode: <persuade|operate|read|experience>
files-modified: [list]
---
```

Body sections: (1) **What changed** — bullets per file; (2) **Why** — design rationale; (3)
**Reference followed** — which `design/<name>.md` guided this; (4) **Verification needed** — what
`verify` re-checks (visual regression? a11y? perf?); (5) **Anti-patterns avoided** — confirm
none of the refusals in [_craft-floor.md](_craft-floor.md) were introduced (and, for transforms, the `design-mode:` field). This
artifact lets `/wf review` and `/wf ship` see exactly what design augmentations were applied.

**Move-pass note** (`/wf design <slug> <move>` on a confirmed design, [stage.md](stage.md) → Move pass): the same frontmatter with `files-modified: []`. Body sections: (1) **Findings** — one row per finding: surface, board key or `file:line`, what is wrong, the fix; (2) **Rejected candidates** — for `animate`, each candidate and the gate that rejected it; (3) **Reference followed**; (4) **Feel checks needed** — what code alone cannot settle; (5) **Decision** — amend now, or kept for later.

## Final-summary rules

**Rules:**
- **First line.** Name the command and the slug; no-slug runs that created a slug name the new
  slug; truly standalone runs use `"freestanding"`.
- **Narrative — the heart of the summary, REQUIRED for any command that produces an artifact.**
  Lead with the narrative per [_chat-return.md](../_chat-return.md) (section *The narrative*). Write a short
  **prose paragraph** (no bullets, no field labels) that *tells the user what happened*: for the design stage, what the person confirmed and how many boards
  were frozen; for `audit`/`critique`, the verdict and top findings; for `extract`, what
  was reverse-engineered; for the other upkeep commands, what the design record now says. Weave in the
  load-bearing counts, decisions, and the top risk. Write it like you're telling a colleague, not
  filling a form. Omit only for genuinely read-only runs with nothing to narrate.
- **Design modes** — the design mode of each surface the run touched (`persuade`, `operate`, `read`, `experience`), or `n/a`. Always emit it; it is the load-bearing design-mode signal.
- **Image gate** records whether the person confirmed the boards (`pass`) or why a flow skipped
  them; `n/a` for commands that don't run it.
- **Boards** — for the design stage, the frozen revision (`design/r<N>/`), its board count, and the
  contact-sheet path `design/r<N>/index.html`.
- **Artifacts.** Comma-separate the `.ai/workflows/<slug>/` paths written (build runs list the
  whole span; the design stage lists `design/r<N>/` as one entry). No-slug standalone reports may write `"none"` if nothing persisted.
- **Next** is "Type `/wf <key> <args>`.", or `Done`. The design stage routes per the Next row of `stage.md` (`/wf slice <slug>`, or `/wf plan <slug>` for an `rca` workflow), or, for a campaign
  work packet, to `/wf campaign <source-slug>` per `design.md` Step 2; `audit`/`critique` route to `/wf review <slug>`; upkeep runs usually `Done`.
- If the command reference defines its own "Chat return contract", treat that as the *content*
  spec — pick the load-bearing fields and keep it compact.
- Framing rules — narrative definition, "return only" caveat, internal audience, always-emit — are single-sourced in [_chat-return.md](../_chat-return.md); apply them here.
