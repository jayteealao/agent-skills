# Intake provenance — consume a prior analysis workflow's evidence

Shared contract for every intake mode that can inherit evidence from a prior analysis
workflow. The terminal analysis modes (`investigate`, `rca`, `discover`, `ideate`,
`brainstorm`) and the research half of `update-deps` spend real sub-agent work building maps, diagnoses, verdicts,
and tradeoff cards — when the user routes the follow-on work here, that evidence must arrive
with it, not die in the source artifact. Slug-mode runs skip this file entirely.

This file holds Detect, which every run applies. [_intake-provenance-consume.md](_intake-provenance-consume.md) holds Consume and Link back, which a run reads only when a source attaches.

## Detect

Provenance is explicit or inferred — explicit always wins:

1. **Explicit:** `$ARGUMENTS` ends with `from <source-slug>`. Strip those two tokens from
   the description before deriving the new slug. Resolve the named slug against
   `.ai/workflows/<source-slug>/00-index.md` and read its `workflow-type`. If the type has
   no row in the Consume table of
   [_intake-provenance-consume.md](_intake-provenance-consume.md), WARN ("`<slug>` has workflow-type `<type>` — no
   provenance contract for it; proceeding without inherited context") and continue.
2. **Inferred (labeled sources only):** inference applies only to `investigate`,
   `ideate`, and `brainstorm` sources — they are the three whose artifacts carry
   machine-matchable labels. If `.ai/workflows/INDEX.md` exists, scan its
   `workflow-type: investigate`, `workflow-type: ideate`, and `workflow-type: brainstorm`
   rows whose `updated-at` is within the last **30 days** (older sources require the
   explicit `from <slug>` token). For each candidate, read the option labels
   (investigate), the idea labels (ideate), or the packet-of-work titles (brainstorm,
   `work[].title` in `brainstorm-board.json`) from its lead artifact. Attach only on an
   **exact label match** — the description contains a label exactly (case-insensitive).
   A partial or fuzzy resemblance is NOT a match. If exactly one workflow matches, ask ONE
   confirmation question ("This description matches `<id> — <label>` from `<type>` workflow
   `<slug>`. Use that analysis as context?") and attach on yes. If several match, ask which
   one (or none). Zero matches → proceed without provenance; that is the common case and
   costs nothing. All other source types (`rca`, `discover`, `update-deps`, an escalated
   change-mode) carry no label vocabulary — they attach only via the explicit token.

## When provenance attaches

When a source attaches, by the token, by a confirmed label match, by a list work packet (the first token after the mode is the `packet-slug` of a work packet file: [../intake.md](../intake.md), "List work packet"), or as the prior run of `update-deps`:

1. Write `from` in the `modes:` list of the frontmatter of each stage artifact that this run writes, for example `modes: [from]`. The mod has no disk fact for `from`, so it checks the `mode:from` row only when `modes:` lists it ([_requires.md](../_requires.md), Modes).
2. Read [_intake-provenance-consume.md](_intake-provenance-consume.md) in full. Apply its Consume table and its Link back steps.

With no source, do not read that file. Write no `from` mode.
