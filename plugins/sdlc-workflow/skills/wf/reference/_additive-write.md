# Shared additive-write contract (single source)

Revisable artifacts (`01-intake.md`, `02-shape.md`, `03-slice*` files,
`08-handoff.md`, `10-retro.md`) are never overwritten on re-invocation — the
document narrates its own evolution in place. Each stage's reference cites this
file and adds only its artifact paths, its revision-section prompt line, and any
stage-specific extra steps.

When the stage is re-invoked on a slug whose artifact already exists:

1. **Snapshot the current file** to
   `.ai/workflows/<slug>/history/<stem>-<rev>.md`, where `<rev>` is the current
   `revision-count` (before this run's increment). Use a **verbatim byte-copy** —
   do not re-emit, do not reformat.
2. **Bump `revision-count`** in frontmatter by 1. Refresh `updated-at` to the
   current ISO timestamp.
3. **Append** a new section to the body rather than rewriting earlier content:

   ```
   ## Revision <new-revision-count> — <ISO timestamp>

   What changed and why:
   - …

   <new content for this run>
   ```

   Earlier `## Initial` / `## Revision N` blocks stay intact. Readers can diff
   history snapshots when they need the exact prior wording; the live document
   narrates the evolution in-place.
4. **Sibling `.yaml`** (when present) follows the same rule: top-level scalars
   update in place; array fields append rather than replace. On structurally
   incompatible rewrites, snapshot the YAML alongside the MD as
   `history/<stem>-<rev>.yaml`.

**Exception**: if frontmatter declares `regenerable: true`, overwrite freely.
The revisable stage artifacts do not normally carry this flag.

The renderer surfaces prior revisions per artifact (typically a collapsible
`<details class="history">` block); history view paths are stable
(`<slug>/<stage>/history/<rev>/INDEX.html`), so old revisions remain linkable
from PRs and later artifacts forever.
