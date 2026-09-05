# Capability inventory

The regression shield for every prose cut in
[WIDE-VIEW-REPAIR-PLAN.md](../WIDE-VIEW-REPAIR-PLAN.md) (wave W0, §3).

A capability is what the prose makes the model do: an artifact written, a
frontmatter field, a gate, a STOP condition, a sub-agent dispatch, an
invocation, a config key, a citation, a rubric check. Wording is not a
capability. `scripts/extract-capabilities.mjs` records the nine categories from
every `skills/**/*.md`. `scripts/verify-capabilities.mjs` fails when a baseline
entry is gone without an explanation.

## Files

| File | Written by | Edited by hand |
|---|---|---|
| `baseline.json` | `node scripts/extract-capabilities.mjs --write` | never |
| `load-baseline.json` | `node scripts/measure-load.mjs --write` | never |
| `moved.json` | the author of a cut | yes — `[{ "from", "to", "entry", "category"? }]` |
| `retired.json` | the author of a cut | yes — `[{ "entry", "reason", "release", "file"?, "category"? }]` |
| `groups.json` | W4 | yes — `{ "<rubric file>": "<group>" }`; rubric checks compare per group |
| `reworded.json` | the author of a cut | yes — `[{ "file", "category", "from", "to" }]`; the sentence survived in new words, and `to` must be present in the same file |
| `prose-budget.json` | `node scripts/verify-prose-budget.mjs --update` (ratchets); by hand for `classes`, `hardCapLines`, token `pattern`/`allowedFiles` | see W1, plan §4.2 |

## Rules

1. Run `npm run verify:capabilities` before every commit that touches `skills/`.
2. When the gate prints `MISSING`, do one of four things. Restore the sentence.
   Record the move in `moved.json`. Record the new first words in
   `reworded.json`. Record the retirement in `retired.json` with a reason and
   the release.
3. Regenerate `baseline.json` only in the release that intentionally changes the
   inventory, in the same commit as the `moved.json` or `retired.json` entries
   that explain the difference.
4. A reviewer reads `retired.json` in every pull request of waves W1 to W4.

## Categories

| Category | Scope | Rule |
|---|---|---|
| `artifacts` | per file | `\d{2}[a-z]?-[a-z-]+(<…>)?.(md\|yaml\|html.fragment)`, placeholders → `<X>` |
| `gates` | per file | first eight words of every paragraph that cites `_gate-question.md` |
| `stops` | per file | first eight words of every sentence containing `STOP` |
| `dispatches` | per file | headings matching `sub-agent \d` / `research sub-agent` / `reviewer`; sentences with `dispatch`/`launch` and `sub-agent` |
| `rubric-checks` | per rubric group | list items under `PRIMARY QUESTIONS` or `NON-NEGOTIABLES` in `reference/review/*.md`, first six words |
| `fields` | tree-wide | backticked `key:` tokens |
| `invocations` | tree-wide | `/wf <key>[ <token>]`, `/consult`, `/study-sources`, `/imagery`, `/uiproto`, `/diataxis` |
| `config` | tree-wide | `hooks.*`, `view.*`, `semantic.*`, `solutions.*`, `memory.*`, `SDLC_*` |
| `citations` | tree-wide | every `](…​.md)` target, resolved to a plugin-relative path |

## Prose budget (W1)

`npm run verify:prose` runs `scripts/verify-prose-budget.mjs`. Every
`skills/**/*.md` has a class and a line budget (plan §4.1). A file over budget
is a ratchet: `prose-budget.json` records its current size, and it may shrink
but never grow. The same file ratchets the emphasis tokens of plan §6.1, the
version strings, the rubric code fences, and each key's core and instructed
load against the §1.1 targets. After an intentional shrink run
`node scripts/verify-prose-budget.mjs --update` and commit the file with the
prose.

The extractor cannot see a condition with no marker. §3.3 of the plan names the
two mitigations: the cut rules for imperative sentences, and the behavior evals
under `tests/evals/`.
