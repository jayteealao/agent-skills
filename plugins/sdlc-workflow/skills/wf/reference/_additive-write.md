# Shared additive-write contract (single source)

Revisable artifacts (`01-intake.md`, `02-shape.md`, `03-slice*` files,
`04-plan*` files, `08-handoff.md`, `10-retro.md`) are never *silently*
overwritten on re-invocation — but they are **living documents**: the body
always reads as the current truth, and the *history* of how it got there lives
in two machine-readable places, not stacked inside the prose.

This replaces the old `## Revision N` append pattern. Do **not** append
`## Revision N` sections to the body any more — a document that stacks diffs
forces every reader to replay the log to learn the current state, and buries
the newest content at the bottom. State wants a document; history wants a log.
Keep them apart.

## On re-invocation of a stage whose artifact already exists

**0. No-op guard (skip everything below when nothing changed).** If the stage
computes an *input fingerprint* (see each stage's reference) and it matches the
value stored in frontmatter, the re-run changed nothing: do **not** snapshot,
do **not** touch the ledger, do **not** bump anything. Leave the file byte-for-byte
as-is and say so in the chat return. Only the steps below run when the inputs
actually moved.

1. **Snapshot the current file** to
   `.ai/workflows/<slug>/history/<stem>-<rev>.md`, where `<rev>` is the current
   `revision-count` (before this run's increment). Use a **verbatim byte-copy** —
   do not re-emit, do not reformat. This is the immutable forensic record; the
   renderer links it, and history view paths are stable forever.

2. **Rewrite the body to current truth.** Edit in place so a reader who opens
   the file sees the present state in present tense — no archaeology, no
   "previously X, now Y" scaffolding in the structured sections. The story
   section (`## The <Stage>`) is where the *narrative* of change belongs: retell
   it so it is true now ("review surfaced a race in the retry path, so the
   rollback notes were reworked"), the way a colleague would update a doc rather
   than appending a changelog to it.

3. **Append one entry to the `revisions:` ledger** in frontmatter — reason-centric,
   never diff-centric (git and the history snapshot already hold the line diff;
   the ledger answers *why*):

   ```yaml
   revisions:
     - rev: 2
       at: "<ISO-8601 timestamp>"
       trigger: review-feedback   # see enum below
       because: "<one phrase — what prompted this revision>"
       changed: "<one phrase — what moved in the body>"
   ```

   `trigger` is one of: `review-feedback`, `ci-fix`, `new-slice`,
   `new-slug-joined`, `scope-change`, `answers-returned`, `resume`, `manual`.
   Add stage-specific triggers only if a stage's reference names them.

4. **Bump `revision-count`** in frontmatter to the new `rev` (it equals the
   number of ledger entries). Refresh `updated-at`. `revision-count` stays for
   mechanical consumers (schema, dashboard captions, page badges); the ledger is
   the human-and-render-facing record.

5. **Sibling `.yaml`** (when present) follows the same rule: top-level scalars
   update in place; the `revisions:` array appends. On a structurally
   incompatible rewrite, snapshot the YAML alongside the MD as
   `history/<stem>-<rev>.yaml`.

**Exception**: if frontmatter declares `regenerable: true`, the artifact is
view-over-state — overwrite the body freely and write **no** ledger entry and
**no** snapshot (there is no evolution to narrate; the file is a pure function
of current state). The revisable stage artifacts do not normally carry this flag.

## What the renderer does with this

- The `revisions:` ledger renders as a compact timeline strip (trigger + reason,
  newest first) above the body — provenance at a glance.
- The `history/<stem>-<rev>.md` snapshots render as a collapsible
  `<details class="history">` block; history view paths are stable
  (`<slug>/<stage>/history/<rev>/INDEX.html`), so old revisions stay linkable
  from PRs and later artifacts forever.

The two are complementary: the ledger says *why each revision happened* in one
line; the snapshots hold *the exact prior wording* for anyone who needs to diff.
Neither lives in the body.
