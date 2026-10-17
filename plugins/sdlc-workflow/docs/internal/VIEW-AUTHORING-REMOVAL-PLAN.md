# VIEW-AUTHORING-REMOVAL-PLAN — stop writing files that only the viewer reads

Status **BUILT in v9.187.0 (2026-10-17). Section 8 lists where the build differs from this text.** · Date 2026-10-17 · Base v9.186.0 (`e4bc358f`) · Target one minor release, v9.187.0.

## 1. Why

The PO said on 2026-10-06 that they rarely, if ever, open the hub, the viewer, or the explainer pages. The hub costs no model tokens: `session-start-orient.mjs` and the render hooks run detached and write nothing to the model. The cost is the authoring. Every stage writes an explainer and a set of free fragments, and the rich stages write a sibling `.yaml`, only so that the viewer can draw a page.

Measured on SoccerManager:

| Workflow | Explainers | Free fragments | Plan `.yaml` | Other viewer-only `.yaml` | Output tokens |
|---|---|---|---|---|---|
| `test-timing-and-coverage-gate` | 74 KB | 0 | 20 KB | 2 KB | 481k |
| `engine-modules` | 250 KB | 26 KB | 426 KB | 24 KB | 5.09M |

The authoring cost is larger than the table shows, for three reasons:

- The table does not count the thinking that composes each explainer. The rules ask for at least about 250 words and two visuals for a stage explainer.
- Each stage and each sub-agent loads `_story-arc.md` (9 KB) and `_fragment-authoring.md` (6 KB). In parallel plan mode, every slice sub-agent loads both.
- Every write stays in the session transcript, and each later turn reads it again from cache.

In one 45 KB plan `.yaml`, the `planned_change` blocks take 24 KB. No agent reads them.

## 2. Decisions

| # | Decision | By |
|---|---|---|
| D1 | Remove the authoring outright. Add no on/off setting. | PO 2026-10-17 |
| D2 | Keep the hub, the renderer, `view-src/`, and `components/explainer/`. Existing pages keep their explainers and figures. A new page shows the artifact text, because the renderer already falls back to plain prose when the `.yaml` is missing. | recommendation |
| D3 | Keep the sibling `.yaml` of `07-review*` (types `review` and `review-command`). It is the findings ledger. `_findings-ledger.md`, `hooks/mod/active.ts`, handoff and recap read it. | recommendation |
| D4 | Keep the plan `.yaml`, but reduce it to `artifact`, `slice`, `files: [{path, status}]`, `edges: [{from, to, kind}]` and `risks`. The `## Sibling Plans` table (`plan.md:167`), the yolo bookkeeping agent (`yolo.md:77`), and the campaign wave driver (`campaign/_drive.md:195`, `workflows/campaign-wave.js:893`) read `files` and `edges`. The PO keeps `risks`. | PO 2026-10-17 |
| D5 | Remove the free narrative fragments (Step F2) as well as the explainers. Only the viewer reads them. | PO 2026-10-17 |
| D6 | Delete `_story-arc.md` and `_fragment-authoring.md`. Move the chat-summary rules into `_chat-return.md`. Put one rule in `_workflow-rules.md`: write no explainer, no `.html.fragment`, and no sibling `.yaml` unless a stage reference names one. | recommendation |
| D7 | `01-brainstorm.md` keeps its `## The Brainstorm` section. That section is in the agent file, and agents read it. | recommendation |
| D8 | Do not change existing artifacts. Their explainers, fragments and `.yaml` files stay on disk, and the hub keeps rendering them. | recommendation |

No `siblingYamlSchemas` type carries `class:`, so every intent-bearing record already sits in the `.md`. The live pane (`lib/live-events.mjs:84`) loses nothing when a `.yaml` goes away.

## 3. What stays the same

- The hub, the render queue, `view.hub.enabled`, `view.renderDispatch`, and `view.narrativeFragments`.
- The renderers in `renderers/`, the view runtime, and the explainer snippets. Their tests stay: `explainer-runtime`, `explainer-snippets`, `four-part-page`, `project-explainer`.
- The schema check of the review and plan `.yaml` at write time (`hooks.validateSiblingYaml`).
- The chat summary. Each stage still returns a narrative of two or three sentences and the receipt fields.

## 4. The work

### W1 — Shared rules

1. Move these rules from `_story-arc.md` into `_chat-return.md`: the four questions of A2 (what it is, how it works, why this way, what it means for the person), the summary length of A3 rule 1, the words-and-counts rule of A3, A6, and the brainstorm exception.
2. Delete `skills/wf/reference/_story-arc.md`.
3. Delete `skills/wf/reference/_fragment-authoring.md`.
4. Add the D6 rule to `_workflow-rules.md`, and remove the explainer clause from `_workflow-rules.md:3`.
5. Change `SKILL.md:13` so that it points to `_chat-return.md` for chat narratives.
6. Remove the explainer sentence from `_additive-write.md:13`.

### W2 — Stage references: explainers and free fragments

Remove every "write the explainer" step, every Step F2 paragraph, and every `_story-arc.md` and `_fragment-authoring.md` link. Change every chat-return line that "quotes the explainer's summary" so that the stage writes the summary straight into chat.

59 files cite `_story-arc.md`. The 47 references that name the explainer are:

- `intake.md`, and in `intake/`: `default`, `discover`, `rca`, `investigate`, `audit`, `ideate`, `update-deps`, `refactor`, `hotfix`, `fix`, `extend`, `adopt`.
- `shape.md`, `slice.md`, `plan.md`, `implement.md`, `verify.md`, `handoff.md`, `ship.md`, `retro.md`, `retro/_artifact.md`, `close.md`, `recap.md`, `task.md`, `probe.md`, `simplify.md`.
- `review/_stage.md`, `ship-plan.md`, `ship-plan/init.md`, `ship-plan/edit.md`.
- `design.md`, and in `design/`: `stage.md`, `contract.md`, `audit.md`, `critique.md`, `_output.md`.
- In `augment/`: `benchmark.md`, `profile.md`, `instrument.md`, `experiment.md`.
- `_story-arc.md`, `_fragment-authoring.md`, `_additive-write.md`, `_workflow-rules.md`, `_chat-return.md`, `SKILL.md` (W1).

The other references that carry a Step F2 paragraph or a "Narrative fragments" note are `docs.md:16`, `implement/_artifact.md:87`, `verify/_artifact.md:134`, `ship/announce.md:169` and `ship/_run-artifact.md:142`.

Remove the `_fragment-authoring.md` rows from the `_requires` tables in `plan.md:38` and `simplify.md:48`.

### W3 — Viewer-only `.yaml`

Remove the step that writes the sibling `.yaml`, and its schema text, for each of these types:

| Type | Places |
|---|---|
| `rca` | `intake/rca.md:184`; delete `intake/rca/_view.md` if it holds only the `.yaml` contract |
| `simplify-run` | `simplify.md:194-195`; the `.yaml` section of `simplify/_artifact.md` from line 188 |
| `profile` | `augment/profile.md:209`; the *Sibling YAML* section of `augment/profile/_artifact.md` |
| `benchmark` | `augment/benchmark.md:216-225` |
| `experiment` | `augment/experiment.md:164`; the *Sibling YAML* section of `augment/experiment/_artifact.md` |
| `instrument` | `augment/instrument.md:184`; the *Sibling YAML* section of `augment/instrument/_artifact.md` |
| `design` | `design/shape.md:114` and `:129-134` |
| `design-contract` | Step 6 of `design/contract.md` (line 156 on); `design/stage.md:8` |
| `design-audit` | `design/audit.md:143`, `:161-162` |
| `design-critique` | `design/critique.md:140`, `:156-157` |
| `ship-run` | Step Z of `ship/_run-artifact.md` (line 100 on); `ship.md:17` and `:182` |

Before you remove each one, search `skills/`, `lib/`, `hooks/` and `scripts/` for a reader of that `.yaml`. On 2026-10-17, no reader exists for any type in the table.

### W4 — The reduced plan `.yaml`

1. Rewrite Step F of `plan.md` (line 231 on). The plan agent writes `artifact: plan`, `slice`, `files` with `path` and `status`, `edges` with `from`, `to` and `kind`, and `risks`. The agent writes no `modules`, `loc`, `delta`, `imports`, `planned_change`, `history` or `lanes`.
2. In `siblingYamlSchemas.plan` of `tests/frontmatter.schema.json`, make `artifact`, `slice` and `files` the required set. Keep the other fields optional, because old plans carry them.
3. Change the parallel-plan prompt in `plan.md:131` so that it names the reduced `.yaml`.
4. Render a plan page from a reduced `.yaml`. The page must draw without an error. If the topology figure needs `modules`, make the renderer derive the modules from the path prefixes, or fall back to plain prose.

`## Sibling Plans`, `yolo.md:77`, `campaign/_drive.md:195` and `campaign-wave.js:893` need no change.

### W5 — Recap

Change `recap.md:87` so that recap reads the frontmatter and the body of each stage file. Recap reads an explainer only when one exists from an older run.

### W6 — Hooks and libraries

1. In `hooks/post-write-verify.mjs`, reduce `RICH_TIER_TYPES` to `review`, `review-command` and `plan`.
2. Reduce `SIBLING_YAML_VALIDATED_TYPES` to `plan` and `review`.
3. Delete `enforceExplainerPresence`, `lintExplainers`, `EXPLAINER_STEM_PATTERNS`, and the nudge for a `.yaml` without an `.html.fragment`.
4. Delete `lib/explainer-check.mjs`, and remove the explainer check from `scripts/verify-fragment.mjs`.
5. Change the description of `hooks.remindMissingFragments` in `schemas/sdlc-config.schema.json` and `lib/config.mjs:73` so that it names only the three kept types.
6. Rebuild `dist/` in the same commit.

### W7 — The mod

1. In `hooks/mod/requires.ts`, remove the `_fragment-authoring.md` rows (lines 1756 and 2460) and the `*.explainer.html.fragment` row (line 1888).
2. Change `scripts/mod-fixture.mjs` so that the fixture writes no explainers.

### W8 — Tests

1. Delete `tests/unit/hooks/explainer-nudge.test.mjs` and `tests/unit/renderers/explainer-check.test.mjs`.
2. In `tests/unit/hooks/hooks.test.mjs`, change the block cases of the removed types so that they expect no block.
3. Add a schema case for the reduced plan `.yaml`, and a renderer case for a plan page without `modules`.
4. Update `tests/unit/mod/read-ledger.harness.mjs`, `hooks/mod/tests/readcheck.test.ts`, `tests/unit/skills/yolo-artifact-split.test.mjs` and `tests/unit/lib/measure-artifacts.test.mjs` where they expect explainers.
5. Search `tests/evals/` for explainer expectations, and update each one.
6. Run `npm test`. Every test must pass.

### W9 — Documentation

1. Update the 11 doc-site pages that name explainers or fragments: `concepts/controlled-language`, `concepts/the-machinery`, `guides/staying-oriented`, `guides/the-standard-lifecycle`, and in `reference/`: `artifacts`, `commands`, `configuration`, `glossary`, `hooks`, `intake-modes`, `skills`.
2. Add a status line to `reference/narrative-fragments.md` and `reference/fragment-author-contract.md`: agents no longer write these files, and the renderer still draws the existing ones.
3. Write the changelog entry for 9.187.0.

### W10 — Release

CAUTION: do not run `git add -A`. It stages other sessions' uncommitted work into your commit.

1. Stage every changed file by its path.
2. Commit the work, the changelog, and the release as separate commits, as the recent releases do.
3. Run `npm version minor`. It stamps five carriers and builds, but it does not commit or tag.
4. Commit and tag `v9.187.0`.
5. Push to `origin/master`. The release is done only when `origin/master` carries it.

## 5. Checks after the build

1. Search `skills/` for `explainer`, `_story-arc` and `_fragment-authoring`. The search must return no instruction to write an explainer.
2. Run one intake and one plan in `wf-mod-fixture`. The run must write no `.explainer.html.fragment`, and the write hook must not block.
3. Open the new plan page in the hub. The page must render from the reduced `.yaml`.
4. Open an old SoccerManager page in the hub. The page must still show its explainer.

## 6. Risks

- New plan, ship-run, design and augmentation pages lose their figures: the file map, the deploy timeline, the coverage grid, and the explainer at the top.
- W2 touches 59 files. Other sessions edit this tree at the same time. The campaign files (`campaign/_drive.md`, `campaign-wave.js`) changed in v9.186.0 and can change again.
- The plan renderer can depend on `modules`. W4 step 4 finds this before release.
- Codex and pi share this tree, so the change reaches all three hosts in one release.

## 7. Answered questions

1. D5: remove the free narrative fragments together with the explainers. PO 2026-10-17: yes.
2. D4: keep `risks` in the reduced plan `.yaml`. PO 2026-10-17: keep.

## 8. Where the build differs

- Two more viewer-only `.yaml` files went: `00-sync.yaml` (`/wf status deep`) and `08b-docs-index.yaml` (`/wf docs`). No agent read them.
- Consult no longer embeds its panel as a fragment, and its `CONSULT_RESULT` has no `fragment:` field.
- Design audit and design critique moved their per-finding data into the `.md`: the audit report has a `## Findings` table, and each critique issue carries an ID, a severity and a dimension. Implement and verify read these findings.
- `siblingYamlSchemas.plan` requires only `files`, not `artifact`, `slice` and `files`, so a re-run over an older plan still validates.
- The plan renderer buckets files by their first two folders when the `.yaml` has no `modules`.
- `_chat-return.md` is reflowed to one line per bullet, to stay inside the 80-line budget of a shared contract.
- `retired.json` records the 49 removed inventory entries, `prose-budget.json` is ratcheted down, and the `artifactStems` pin fell from 92 to 70.
- `hooks/mod/requires.ts` is regenerated with `node scripts/build-requires.mjs`.
- The renderer keeps its full `RICH_TIER_TYPES` list, so old `.yaml` files keep their figures. A test checks that the hook list is a subset.
- Check 2 of section 5 (a live intake and plan in `wf-mod-fixture`) did not run. The hook tests cover the same write paths.

