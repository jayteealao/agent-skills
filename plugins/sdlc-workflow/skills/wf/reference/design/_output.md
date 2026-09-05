# Design — artifact contracts and final-summary rules (`design.md` Steps 5 and 6)

Load this file from `design.md` Step 5 (registration and the transformation artifact) and Step 6 (the final-summary rules).

## Step 5 — registration and the transformation artifact

**Augmentation registration** (transformations, audit, critique) — create `augmentations:` in
`00-index.md` if absent:

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
register: <brand|product>
files-modified: [list]
---
```

Body sections: (1) **What changed** — bullets per file; (2) **Why** — design rationale; (3)
**Reference followed** — which `design/<name>.md` guided this; (4) **Verification needed** — what
`verify` re-checks (visual regression? a11y? perf?); (5) **Anti-patterns avoided** — confirm
none of the absolute bans were introduced (and, for transforms, the `register:` field). This
artifact lets `/wf review` and `/wf handoff` see exactly what design augmentations were applied.

## Step 6 — final-summary rules

**Rules:**
- **First line.** Name the command and the slug; no-slug runs that created a slug name the new
  slug; truly standalone runs use `"freestanding"`.
- **Narrative — the heart of the summary, REQUIRED for any command that produces an artifact.**
  Write a short **prose paragraph** (2–5 sentences, no bullets, no field labels) that *tells the
  user what happened*: for a build command, what was designed AND built and how far the
  compressed flow ran; for `audit`/`critique`, the verdict and top findings; for `extract`, what
  was reverse-engineered; for `setup`/`teach`, what context was established. Weave in the
  load-bearing counts, decisions, and the top risk. Write it like you're telling a colleague, not
  filling a form. Omit only for genuinely read-only runs with nothing to narrate.
- **Register** is `brand` or `product` — always emit; it is the load-bearing design-mode signal.
- **Image gate** records whether the imagery check passed for commands that use it; `n/a` for
  commands that don't run it.
- **Artifacts.** Comma-separate the `.ai/workflows/<slug>/` paths written (build runs list the
  whole span). No-slug standalone reports may write `"none"` if nothing persisted.
- **Next** is a concrete invocation, or `Done`. A completed in-workflow build typically routes to
  `/wf review <slug>`; `audit`/`critique` route to `/wf review <slug>`; standalone runs usually
  `Done`.
- If the command reference defines its own "Chat return contract", treat that as the *content*
  spec — pick the load-bearing fields and keep it compact.
- Framing rules — narrative definition, "return only" caveat, internal audience, always-emit — are single-sourced in [_chat-return.md](../_chat-return.md); apply them here.
