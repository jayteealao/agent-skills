# Consult triggers — the recorded, exclusive list

A stage fires `/consult` only when a trigger in this table holds. The list is the union of every objective trigger the stage files name. A stage that finds no trigger adds no consult. The user can fire `/consult` at any time; that run records `user-invoked`.

## Recording

When a stage fires `/consult`, it writes one entry per run into its artifact frontmatter:

```yaml
consult-runs:
  - trigger: touches-auth
    provider: codex
    at: 2026-09-07T12:00:00Z
```

`trigger` is one name from the table. `provider` is the provider that answered (`codex`, `claude`, `gemini`, `openai`). `at` is the dispatch time. A run that answered several triggers records the first trigger that held. The schema carries the field on `plan`, `review`, `verify`, `handoff`, and `ship-run` frontmatter; other stages record it when their frontmatter template has the key.

Set `SDLC_COST_SLUG=<slug>` and `SDLC_COST_KEY=<key>` in the environment of the dispatcher call, so the provider's token usage lands in `.ai/workflows/<slug>/cost.jsonl` as an `external` row (see [_additive-write.md](_additive-write.md)).

## The triggers

| Trigger | Holds when | Stages |
|---|---|---|
| `unknowns-present` | the artifact carries a `## Unknowns / Open Questions` entry | plan |
| `touches-concurrency` | the slice or fix touches async, concurrent, or parallel behaviour | plan, implement |
| `touches-auth` | the slice or fix touches authentication or session handling | plan, implement, intake |
| `touches-migration` | the slice or fix touches a data migration or schema change | plan, intake |
| `touches-billing` | the slice or fix touches money, payments, or billing | plan, implement, intake |
| `touches-external-api` | the slice touches an external API contract | plan |
| `touches-security` | the request or PR touches a security-sensitive surface | intake, handoff |
| `touches-deletion` | the request changes deletion semantics | intake |
| `touches-data-integrity` | a sub-agent fix touches data integrity | implement |
| `intent-risk-carried` | any `intent-risk` (RIM) is `carried` | plan, shape, handoff |
| `rim-severity-high` | any RIM on the ledger has `severity: high` | intake, shape |
| `appetite-medium-or-larger` | appetite is medium or larger | plan, intake |
| `new-capability` | the work introduces a new capability or externally-observable surface | intake, shape |
| `multi-slice` | more than one slice exists or is expected | shape |
| `second-opinion-fired` | the stage's second-opinion trigger already fired this run (batch the pre-mortem into the same panel) | shape |
| `verdict-ship-with-caveats` | the review verdict is `ship-with-caveats` | review |
| `blocker-fixed-in-loop` | a blocker finding was fixed in-loop and the re-check verdict flipped to ship | review |
| `ac-met-by-inference` | an acceptance criterion is judged met by inference, not by direct observation | verify |
| `ac-deferred` | an acceptance-criterion verification is deferred (headless or device wall, pre-registered manual re-run) | verify |
| `open-review-finding` | the PR carries an open review finding | handoff |
| `deferred-finding-rides-release` | a deferred review finding or runtime-evidence deferral rides the release | ship |
| `base-moved-since-verify` | the freshness delta shows the base branch moved since verify | ship |
| `preflight-warning-overridden` | pre-flight or the dry run surfaced a warning that was overridden | ship |
| `plan-drift-significant` | the adapted approach departs from a named plan step | implement |
| `suppression-written` | the run wrote a new `sdlc-debt:` suppression to get the build green | implement |
| `docs-audit-violations` | the docs audit found quadrant violations or stale claims | docs |
| `docs-public-api` | the generated doc documents a public API surface | docs |
| `docs-none-required-contradiction` | the doc plan concludes "None required" for work that changed user-facing behaviour | docs |
| `user-invoked` | the user ran `/consult` explicitly | any |

## Rules

- Fire on the first trigger that holds. Do not wait for a second trigger.
- Record the run before the stage writes its verdict or next step.
- Name the trigger in the panel fragment's first line, so a reader sees why the consult ran.
- A trigger name that is not in this table is a defect. Add the row here before the stage names it. `tests/unit/skills/consult-trigger-coverage.test.mjs` checks every name.
