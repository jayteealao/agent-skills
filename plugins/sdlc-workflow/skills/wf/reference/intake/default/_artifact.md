# Intake artifact templates (Steps 2 and 9 of `intake/default.md`)

## `00-index.md`

1. Run `node "<skill-dir>/scripts/wf.mjs" stamp index --slug <slug>`. It prints every field that the schema requires, with the allowed values of each enum.
2. Write the output to the draft `.ai/workflows/<slug>/.draft/00-index.md`. Remove the `# one of:` comments.
3. Fill `title`, `branch-strategy`, `branch` and `base-branch`. Then set or add these keys:

```yaml
stage-number: 1
review-scope: slug-wide
review-scope-confirmed: true
appetite: <small|medium|large>
stack:
  detected-at: "<iso-8601>"
  platforms: []
  languages: []
  ui: []
  build: []
  package-managers: []
  testing: []
  observability: []
  integrations: []
  available-skills: []
  available-mcp: []
  user-confirmed: false
ux-impact: <none|visual|flow|new-surface>
ux-impact-confirmed: false
design-move: <move>
design-skip-reason: "<one line>"
origin-packet: "<the packet file path; only when started from one>"
origin-items: []
intent-risks:
  - id: RIM-1
    risk: "<one-line risk statement>"
    severity: <high|medium|low>
    status: open
    adjudicated-by: ""
    decision: ""
    po-ratified: null
charter:
  - id: C1
    commitment: "<one positive commitment, falsifiable by code>"
    source: "01-intake.md#<section>"
    status: honored
    po-ratified: <true|false>
next-command: wf-intake
next-invocation: "/wf intake <slug>"
workflow-files: [00-index.md, 01-intake.md, decisions.yaml]
progress: {intake: in-progress, design: not-started, slice: not-started, plan: not-started, implement: not-started, verify: not-started, review: not-started, ship: not-started, retro: not-started}
```

4. Put the draft, per [_records.md](../../_records.md).

The index has no markdown body. The frontmatter is the current state of the workflow. Apply these rules:

- Write no YAML comments in the index.
- `next-command: wf-intake` holds until the shape phase writes the next stage. A stop before the shape phase resumes with `next-invocation`. `progress.intake` becomes `complete` when the shape phase writes `02-shape.md`.
- Append history (old notes, old next-step commentary) to `index-history.jsonl`, one JSON object per line: `{"at","kind","text","stage"}`.
- Keep the deferral list, `intent-risks`, `charter`, and `revisions:` in the index.
- `review-scope: slug-wide` is the rule: one review per work packet. Nobody is asked. A person who wants a review per slice sets `review-scope: per-slice` with `/wf intake <slug> amend` before the first review.
- `stack` is the Step 0.5 fingerprint. Batch B confirms it. `design/_lane.md` defines the `ux-impact` values.
- Write `design-move` only when `/wf design <move>` started the workflow. Otherwise omit the key.
- When `ux-impact: none`, shape sets `progress.design: skipped` and writes `design-skip-reason`. Otherwise omit the key.

**`intent-risks` (the RIM ledger).** Write one entry for each RIM from the Step 6a misreading pass. When there are zero entries, write `intent-risks: none-declared`. An absent key is illegal in default mode, and shape's Step 9a backfills it. Shape adjudicates every `open` entry (shape.md Step 9a). Ship blocks on any entry that stays `open`. Compressed intake modes (fix, hotfix, refactor, update-deps, adopt) write entries only when a risk exists. Terminal-analysis modes write no ledger.

**`charter`.** Write the 3–7 load-bearing commitments from Step 6b. Keep them few: each commitment is falsifiable by code, not a mood. Distill them from the Restated Request, Intended Outcome, and Known Constraints. Set `po-ratified: true` when Step 6b confirms an entry. When there are zero commitments, write `charter: none-declared`. Compressed intake modes write no charter. Shape's RIM adjudications and the `## Intake Fidelity` rows can cite charter ids. The intent-fidelity review dimension checks each charter id.

## `decisions.yaml`

The decision store of the workflow. Only `wf.mjs decide` writes it, per [_decisions.md](../../_decisions.md).

Shape links each answer to the shape Ambiguity Inventory. Shape puts the AMB ids that the answer closes or confirms at the start of the answer text, for example `AMB-1, AMB-3: <answer>`.

## `01-intake.md`

```yaml
---
schema: sdlc/v1
type: intake
slug: <slug>
status: complete
stage-number: 1
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
tags: []
refs:
  index: 00-index.md
  next: 02-shape.md
next-command: wf-intake
next-invocation: "/wf intake <slug>"
recommended-routes:
  - invocation: "/wf intake <slug>"
    reason: "the shape phase of intake runs next, in the same run"
    default: true
---
```

# Intake

## Restated Request
<!-- If the request implies a core loop ("user does A, gets B, then C"), state it as NUMBERED STEPS. Shape derives the Charter Scenario from it. -->

## Intended Outcome

## Primary User / Actor

## Affected Areas (preliminary)
<!-- Step 0.7 findings: file paths, the existing behavior in one line each, and each ambiguity the code already resolves. Omit the section only when the Step 0.7 skip criteria held. -->
- ...

## Known Constraints
- ...

## Assumptions
- ...

## Unknowns / Open Questions
- ...

## Dependencies / External Factors
- ...

## Risks if Misunderstood
<!-- The RIM ledger is `intent-risks` in 00-index.md. Name each RIM id here in one line. Record each dismissed Step 6a candidate as "considered: <misreading> — dismissed because <reason>". With `none-declared`, write the one-line reason here. The charter is `charter` in 00-index.md; with `charter: none-declared`, write its one-line reason here too. -->
- **RIM-1** — see `00-index.md` `intent-risks`

## Success Criteria
- ...

## Out of Scope for Now
- ...

## Freshness Research
- Source:
  Why it matters:
  Takeaway:

When required answers are still missing, set `status: awaiting-input`. Then set `next-invocation` to `/wf intake <same-slug>`.
