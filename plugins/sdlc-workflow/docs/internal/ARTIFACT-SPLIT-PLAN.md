# ARTIFACT-SPLIT-PLAN — split each artifact into an agent file and a human page

Source of truth for the build. The shareable page (private) is
https://claude.ai/artifact/EaKaLKUvF2Tn7sfp2jiScM. Decisions D1–D7 are decided
(see "Decisions" below). The PO rejected a context loader script: never add one.

## Build spec (binding for every build agent)

The plan text follows this section. Where the plan leaves a format open, this
section fixes it. Every build agent follows this section exactly.

### S1 — The `## Requires` section (R3, Y1, Y2)

Every stage reference that writes a stage artifact gets one `## Requires`
section, placed directly after the header detail table. The header table's
`Requires` and `Conditional inputs` rows are replaced by one row:
`| Requires | See [## Requires](#requires). |`.

The section has exactly this shape:

```markdown
## Requires

Read every row before you write the stage artifact. [_requires.md](_requires.md) defines the check.

| Input | Kind | When | Sections |
|---|---|---|---|
| `00-index.md` | artifact | always | |
| `02-shape.md` | artifact | always | Acceptance Criteria; Non-Functional Requirements; Edge Cases; Out of Scope |
| `po-answers.md` | artifact | if-present | |
| `03-slice-<slice>.md` | artifact | always | |
| `02c-craft.md` | artifact | if-present | |
| `implement/_artifact.md` | procedure | always | |
| `review-ledger` | artifact | mode:reviews | |
| `05-implement-<slice>.md` | writes | | |
```

Column rules:

- **Input.** One path in backticks. For `artifact` and `writes`, the path is
  relative to `.ai/workflows/<slug>/`. For `procedure`, the path is relative to
  `skills/wf/reference/`. The only placeholders are `<slice>` (the slice slug
  of the artifact being written) and `<mode>` (the intake mode). A glob `*` is
  allowed (`07-review-*.yaml`). A project-level file starts with `/.ai/`
  (for example `/.ai/ship-plan.md`). A free-text input that is not a file
  (for example `repository signals`) has no backticks and the mod ignores it.
- **Kind.** `artifact`, `procedure`, or `writes`. A `writes` row names the
  stage artifact that the check runs on. Every reference that writes a stage
  artifact has at least one `writes` row. The Sections and When cells of a
  `writes` row are empty.
- **When.** `always`, `if-present`, `on-resume`, or `mode:<name>`. The mod
  checks only `always` and `if-present` rows. The other values are a checklist
  for the agent only.
- **Sections.** Empty means the whole file. Otherwise a `; `-separated list of
  exact `##` heading texts (without the `## `). The read counts when the read
  line ranges cover each named section.

A reference that writes no stage artifact (status, recap as a reader) still
gets the table, with no `writes` row. A sub-procedure file that a stage
reference loads (for example `intake/_change-mode-tail.md`) gets no table; the
table lives in the reference that owns the stage run (for example
`intake/fix.md`).

Remove every prose read order that the table replaces (Step 0 "Read X, Y, Z"
items, "load `<file>`" sentences for procedure files). Keep prose that says
*how to use* an input. A guard test fails when a Step 0 "Read"/"Load" sentence
names a workflow file or a procedure file that the table does not name.

### S2 — The explainer fragment (R7, D6, W5)

- The file is `<stem>.explainer.html.fragment` next to the agent file. For
  `04-plan-auth.md` it is `04-plan-auth.explainer.html.fragment`.
- It replaces the story section (`## The <Stage>`) of every template, except
  brainstorm, which keeps `## The Brainstorm`. The `.md` keeps no story section.
- Content: an HTML fragment (no `<html>`, `<head>`, `<body>`). It follows the
  explainer rules in `_story-arc.md`: plain summary first, one sentence before
  each visual, text and visuals alternate, one idea per visual, labels and
  theme tokens, interactivity only when it helps, a recap at the end. It uses
  the `@include` snippets from W5 for visuals.
- Agents never read explainer fragments, except recap (R8) and the writer on a
  re-run of its own stage.
- The chat return quotes the explainer's summary paragraph as the narrative
  lead (A6 form).
- Templates reference it with one line in place of the story section:
  `Write the explainer to <stem>.explainer.html.fragment per [_story-arc.md](../_story-arc.md).`
  (adjust the relative path).

### S3 — `recommended-routes` (W1 defect 3, W3, status)

Every stage artifact frontmatter carries:

```yaml
next-command: <key>
next-invocation: "/wf <key> <slug> [<slice>]"
recommended-routes:
  - invocation: "/wf <key> <slug> [<slice>]"
    reason: "<one phrase>"
    default: true
  - invocation: "/wf <other> <slug>"
    reason: "<one phrase>"
```

- Stage artifacts use `next-command` and `next-invocation` (one key name).
  They never use `recommended-next-*`. `00-index.md` keeps its own
  `recommended-next-stage`, `recommended-next-command` and
  `recommended-next-invocation` keys, which the hub, the mod and the
  session-start hook read.
- `recommended-routes` lists every option that the old
  `## Recommended Next Stage` body section listed. Exactly one entry has
  `default: true`, and its invocation equals `next-invocation`.
- Remove the `## Recommended Next Stage` body section from every template.
  `/wf status` reads the options from `recommended-routes`, and falls back to
  the old body section for artifacts written before this change.
- Retro, probe and rca get the keys too.

### S4 — `index-history.jsonl` (R6, W3)

- Path: `.ai/workflows/<slug>/index-history.jsonl`. One JSON object per line:
  `{"at":"<ISO-8601>","kind":"<kind>","text":"<text>","stage":"<stage or null>"}`.
  `kind` is one of `note`, `next-commentary`, `subpass`, `migrated`.
- Only YAML comment prose, old next-step commentary and finished sub-pass
  telemetry move there. The deferral list (`runtime-evidence-deferrals`,
  cleared entries too), the intent risks, the charter and the `revisions:`
  ledger stay in the index.
- Keep `current-stage` in the first 4,000 characters of `00-index.md`.
- A lint warns when `00-index.md` carries a YAML comment line of prose
  (a `#` comment of more than 8 words), and when the file is over 20 KB (D7).
  Both are warnings, never blocks.

### S5 — Evidence folders (W3)

- Raw verify check output goes to `.ai/workflows/<slug>/verify-evidence/<slice>/report.md`.
  The file needs no frontmatter and no `NN-` name.
- `isProbeEvidencePath` (keep the old export; add `isEvidencePath`) covers
  `probe-evidence/` and `verify-evidence/`. Both write hooks exempt them. The
  renderer walk and the stale check exempt both folders.
- `06-verify-<slice>.md` keeps every section that review, handoff and design
  audit read: Augmentation Verification, Adversarial Tests, Cross-Browser
  Delta, Friction Notes, Free Exploration Notes, the accessibility list and the
  performance list, acceptance-criteria status, issues, gaps, the
  recommendation.

### S6 — The read check (R4, Y3–Y5, W4, D2, D3)

- The mod (`hooks/mod/`) keeps a read ledger: a `tool.call` hook on `Read`
  records `{agentId, path, startLine, numLines, totalLines}` for workflow
  files and `skills/wf/reference/` files. `Grep` and shell reads are not
  recorded.
- The Requires data comes from a generated module `hooks/mod/requires.ts`,
  built by `scripts/build-requires.mjs` from the `## Requires` tables. A guard
  test fails when the generated module is out of date.
- The check runs when the named stage writer writes a file that matches a
  `writes` row (Write, Edit, MultiEdit, NotebookEdit). It never runs for
  sibling `.yaml`, fragments, `history/`, `00-index.md`, `03-slice.md`
  write-backs, `index-history.jsonl`, or evidence folders.
- Mode `warn` (default for two weeks, D2): the write runs; the mod adds the
  missing list to the tool result `context`. Mode `block`: the check runs
  before the write, and denies unless the written text carries frontmatter
  `read-waiver: "<reason>"`. Mode `off`. The setting is the mod setting
  `readCheck`.
- A dispatch prompt that carries a line `Prompt-fed inputs: <a>, <b>` and
  names the output artifact path makes those inputs count as read for the
  writer of that path.
- Each check writes one row to `.ai/workflows/<slug>/.read-ledger.jsonl`:
  `{"at","agentId","stage","artifact","missing":[...],"partial":[...],"waiver"}`.
  Never write to `.driver-journal.jsonl`.
- The ledger resets on a compaction between stages and survives a compaction
  in the middle of a stage.
- Codex has no read hook. A stage on Codex writes `reads-checked: false` in
  the artifact frontmatter (D3). `_requires.md` says so.

### S7 — File ownership during the build

Build agents run in parallel on one working tree that other sessions also
edit. Each agent edits only the files its brief names. No agent runs `git add`,
`git commit`, `git stash`, `git checkout`, `git reset`, or `npm run build`,
and no agent runs `verify-prose-budget.mjs --update` or
`update-snapshots.mjs`. Each agent ends with a report: files changed, tests
run with results, frontmatter schema keys it needs in
`tests/frontmatter.schema.json`, prose-budget changes it needs, and anything
it did not finish.

### W0 results (2026-09-28)

**Meter.** Run `node scripts/measure-artifacts.mjs --since 2026-07-01`. Add
`--json` for JSON, `--out <file>` to save the result, and `--baseline <file>`
to compare the headline numbers with a stored result. The meter counts `Read`
calls and shell reads (`cat`, `Get-Content`, `sed` and other read verbs), in
absolute and relative form. A yolo stage agent is a sub-agent whose first
message has a line that starts with `Execute the SDLC '<stage>' stage`.

**Baseline.** `docs/internal/capability-inventory/artifact-baseline.json`,
since 2026-07-01, 2,486 sessions scanned.

| Measure | Plan evidence | Baseline |
|---|---|---|
| Yolo agents: plan · implement · verify · review | 87 · 85 · 94 · 34 | 53 · 64 · 71 · 30 |
| Own reference read | 98% · 95% · 95% · 91% | 100% for all four |
| `02-shape.md` read | 72% · 8% · 15% · 18% | 72% · 11% · 13% · 20% |
| `po-answers.md` read | 68% · 31% · 41% · 6% | 53% · 22% · 34% · 7% |
| `_artifact.md` read (implement · verify · review) | 58% · 49% · 32% | 36% · 28% · 33% |
| Verify agents that read their reference in part | 41 of 94 | 44 of 71 |
| Refused reads (index) · partial reads | 37 (21) · 642 | 13 (11) · 658 |
| Shell reads over the output cap | not measured | 363 |
| Index p90 · max | 44 KB · 175 KB | 44 KB · 176 KB |
| View-layer share of artifact writes | 25% | 24% |
| Reading sessions (sub-agents) | 998 (785) | 1,148 (918) |

The index, write-mix and partial-read numbers match. The yolo numbers differ
for one reason: the old scripts found the driver prompt anywhere in a
transcript. That rule also counted 96 audit and build sub-agents that quote the
prompt, and those agents seldom read the stage files. The meter counts only
agents whose first message opens with the prompt. The old scripts also counted
a shell command that only names a file (for example `ls` or `test -f`), so
their template and procedure shares are higher. The refused count is lower.
The probable cause is that the old pattern "too large" also matched other
tool results, and that the old count included the audit sub-agents. The meter counts a shell
read over the output cap separately (363). More reading sessions match now,
because the meter also matches relative paths.

**Probe (a): mod Read hook.** The types confirm the contract: a `tool.call`
input carries `agentId` in a sub-agent, and the `Read` result carries
`startLine`, `numLines` and `totalLines`. `hooks/mod/probe.ts` now has a
`read` event, `readProbeDetail(agentId, path)`, `readProbeOf(detail)`,
`readHookCell(reads)` and `ProbeJournal.readFired(agentId, path)`. The last
function writes one row per loop per session. `npm run mod:probe` shows a
"read hook" column. A row with an agent id proves that the hook fired in a
sub-agent. There is no live proof yet. The journal on this machine has 400
rows (47 Desktop sessions, 1 CLI session) and no `read` row, because
`register.ts` does not call `readFired` yet. The mod agent adds the call in W4.
Then one yolo run on the CLI and one on Desktop give the proof.

**Probe (b): command hooks.** `SDLC_HOOK_DEBUG=1` captures payloads only in
the Codex adapter (`hooks/_adapter.mjs`, to `PLUGIN_DATA/hook-debug.jsonl`).
The Claude Code hook `dist/post-tool-use-all.mjs` has no capture. No
`hook-debug.jsonl` file exists on this machine, so there is no evidence on
disk. The Claude Code types (`BaseHookInput`) declare `agent_id` as "present
only when the hook fires from within a subagent". This is a type contract,
not a captured payload. The read check does not depend on it, because it
uses the mod hook.

### Build status (2026-09-28)

All waves W0–W6 are built in one change, not as one release per wave. The
PO asked for the full plan at once. `register.ts` now calls `readFired`, so
the live probe needs only one yolo run on the CLI and one on Desktop.

Known limits:

- **Yolo prompt-fed inputs.** The mod sees `Prompt-fed inputs:` lines only on
  model `Agent`/`Task` calls. Yolo starts its agents through the Workflow
  tool, so the yolo review writer and the fan-out plan agents can get false
  missing-read context. Warn mode (D2) costs extra reads, not blocked writes.
  Measure this in the two-week warn window before block mode.
- **Project-level `writes` rows** (`/.ai/ship-plan.md`,
  `/.ai/profiles/*/01-profile.md`) are not checked: no slug holds the ledger
  row.
- **Interactive explainers.** The view's CSP (`script-src 'self'`) runs no
  script in a fragment. Explainers use CSS-only interaction.
- **Dark theme.** `assets/sdlc.css` defines light tokens only. The snippets
  use theme tokens, so they follow a dark theme once the view has one.
- **Brainstorm slug mode** still writes the slice and a board file. The fix
  needs `lib/hook-utils.mjs` and pinned brainstorm text; it stays open.
- **W4 "done when"** needs a live yolo run on a fixture slug with the read
  ledger. The unit and kit tests prove the check; the 95% coverage figure
  needs that run and the meter's section (e).

## The plan

# Split each artifact into an agent file and a human page

Status **Building (all waves, 2026-09-28)**     Date **2026-09-27**     Plugin **v9.171.0**     Owner **jayte**      Today each workflow artifact is one markdown file that tries to serve agents, the audit record and the person at the same time. Agents read the files next to their stage but skip the upstream intent and most procedure files, and the person gets a document written mostly for agents. This plan covers all 23 `/wf` keys and all intake modes. It gives agents small, stable files and checks that each stage reads its required inputs. It also gives the person an HTML page for each artifact, written as a plain explainer.

## What the plan delivers

Each target is measured by the same meter that produced the evidence on this page. W0 adds that meter to the plugin.           Required reads≥ 95%of stage writers read every required input and procedure file. Today yolo implement agents read the shape 8% of the time, and review agents read their context list 3% of the time.     Refused reads0Today 37 reads were refused as too large, and 642 read only part of the file.     Index sizep90 < 20 KBToday p90 is 44 KB and the maximum is 175 KB.     Human pageEvery artifactEach artifact gets an HTML page that opens with a plain explainer and shows what waits for the person.     Agent write cost−20% or moreW5 adds a generator that builds the typed fragments from the YAML, so agents stop writing them. Today agents write every typed fragment. View-layer writes are 25% of artifact writes.

## The evidence

The data comes from 72 slugs on disk and 998 sessions that read workflow artifacts, all since 2026-07-01. The method section lists the repos and the limits.           Next stage's agentNeeds the contract: acceptance criteria, scope, plan steps, findings and verdicts. It needs this text in full on every run.     Audit recordResume, retro, recap and probe need evidence and reasons. They need a lot of text, but only rarely.     Person reviewingNeeds the story, the verdict and the decisions that wait for a person. Today this reader mostly uses the rich view and the chat summary.

### The main finding: agents read the files next to their stage, and skip the rest

300 yolo stage agents almost always read their stage reference and the artifact directly before them. They seldom read the upstream intent (the shape and the PO answers) or the procedure files that their reference orders them to load. For each slice plan, `plan.md` Step 0 orders a median of 109,000 tokens of reads. Yolo plan agents read a median of 26,000.

| Share of yolo stage agents that read the file | plan (87) | implement (85) | verify (94) | review (34) |
|---|---|---|---|---|
| Own stage reference | 98% | 95% | 95% | 91% |
| Artifact directly before the stage | slice 100% | plan 98% | implement 91% | verify 74% |
| `02-shape.md` (required for all four) | 72% | 8% | 15% | 18% |
| `po-answers.md` (required for all four) | 68% | 31% | 41% | 6% |
| Artifact template file (`<stage>/_artifact.md`) | — | 58% | 49% | 32% |
| Other procedure files the reference orders | — | research 6% | sub-agent charters 12% · fix loop 5% · runtime adapters 11% | context list 3% · dispatch 15% |
| Artifact tokens read (median · p90) | 26k · 43k | 21k · 42k | 22k · 37k | 22k · 37k |

Sibling plans: 84 yolo plan agents had earlier sibling plans on disk (9.6 on average). 79 read at least one, 13 read all, and the median agent read 20% of them. Verify agents read their own reference only in part in 41 of 94 runs. Correction: version 3 of this page reported lower read rates (for example "65 of 96 read no sibling plan"), because that script missed shell reads and relative paths. These figures replace them.

| Measure (all 998 reading sessions) | Result |
|---|---|
| Reads refused as too large · partial reads | 37 (21 index, 8 plan) · 642 |
| Share of read bytes that repeat a read in the same session | 23% |
| Sessions that are sub-agents | 785 of 998 |
| Share of context processed that comes from artifact reads | 5% (p90 session 18%) |
| Artifact writes as a share of all output tokens | 14% |
| View-layer writes (fragments and sibling YAML) as a share of artifact writes | 25% |
| Index: frontmatter share · prose stored as YAML comments | 95% · 12% |

Read cost is moderate. The main reason to change is correctness: stages act on inputs they did not read.

### What each artifact contains

Every `##` section is in one bucket, based on its heading. The explainer is only 8–18% of each build-stage artifact. Across 47 shape files, about 85% is contract, and design files are all contract, so those two stay whole.                  ContractEvidenceWorking recordExplainerBoilerplateUnclassified          plan9.2 MB552985     verify5.9 MB20339121610     review8.5 MB322910719     implement4.5 MB4515181210     slice3.1 MB456111324     0%50%100%

| Other artifact types | What the sections show |
|---|---|
| po-answers.md | 936 KB of dated question-and-answer entries. The same answers are also copied into intake and shape sections. |
| 90-recap.md | Almost all explainer. Recap is already a human page in markdown form. |
| 08-handoff.md | 18% frontmatter. The body repeats the frontmatter in "PR Readiness Block". |
| 09-ship-run-*.md | 25% frontmatter, which is the source of truth. The body tables are regenerated from the frontmatter. |
| brainstorm | Already split: `brainstorm-board.json` for agents, `01-brainstorm.md` and `brainstorm-page.html` for the person. This is the model for every other key. |

## Target model

Each artifact produces four kinds of files. The agent file keeps its current name, because the mod, both drivers, the renderer, the schema and the filename rule all use the `NN-stage[-slice].md` names.           04-plan-<slice>.md (name unchanged)

### Agent file

Frontmatter holds state. The body holds contract sections under fixed `##` headings, and then the working record. It holds no story section and no evidence.     <stem>.explainer.html.fragment

### Explainer

A short plain-words explanation in simple HTML, written by the agent. The renderer already finds free fragments. Agents never read fragment files.     verify-evidence/<slice>/ · review ledger .md

### Evidence

Proof and history, kept for audit and for the one agent that fixes a specific finding. No stage must read it.     index-history.jsonl

### History

Finished sub-pass telemetry, cleared deferrals and old notes. A `.jsonl` file triggers no render and no stale flag.           R1 · one role per placeFrontmatter is state. The agent file body is contract and working record. The explainer fragment is for the person. This replaces the rule in `_workflow-rules.md:3`, which most templates break today.     R2 · stable anchorsEvery section that another stage reads uses a fixed `##` heading with the exact name the consumer cites. A guard test checks every producer against every consumer.     R3 · declared inputsEach stage reference lists, in its existing Requires table, two kinds of rows: the artifacts it must read and the procedure files it must load (template, charters, context list). The prose read orders in Step 0 are removed.     R4 · checked readsThe mod records each artifact and procedure file that each agent reads, with the line ranges. When the agent writes its stage artifact, the mod compares those reads with the Requires table. A file counts as read only when the ranges cover it.     R5 · one source per factEach fact has one home and one writer. Other files refer to that home and do not copy it. This covers PO answers, findings, acceptance criteria, charter and next steps.     R6 · the index is current stateThe index holds only keys that some reader uses now. YAML comment prose and old next-step commentary move to `index-history.jsonl`. The deferral list (cleared entries too) and the index `revisions` ledger stay, because the repeat-deferral marker, the plan tripwire, retro, amend and the overview renderer read them.     R7 · the renderer builds the pageThe renderer builds each human page from the explainer, the frontmatter, the contract sections and the sibling YAML. Today agents author the typed fragments, and no code generates them. W5 adds that generator. The hook that blocks a missing sibling `.yaml` stays, because the generator depends on the YAML.     R8 · downstream reads the small formKeys that read many artifacts (handoff, ship, recap, status) read frontmatter, every `07-review-*.yaml` and named contract sections, not whole bodies or dimension files. Retro is excluded: it judges review quality and plan-versus-implement drift, so it keeps its full reads.

## What the person sees

Each human page has the same four parts in the same order. The renderer fills parts 2 to 4 from agent data, so the page cannot contradict the contract.

| Part | Source | Content |
|---|---|---|
| 1. Explainer | explainer fragment | What happened, why, and what it means for the person, in plain words. |
| 2. Waiting for you | frontmatter: open questions, gates, verdict | The decisions and approvals that wait for a person. The page says "nothing" when nothing waits. |
| 3. The contract, readable | contract sections and sibling YAML | A stage-specific table. The table for each stage is in the next table. |
| 4. Evidence and history | evidence files, `history/` snapshots | Collapsed. Links to the evidence file and to earlier revisions. |

### How an explainer is built

An explainer can combine text with diagrams, charts and interactive elements. The agent adds a visual only when the topic has structure that is easier to see than to read:            processes and sequences, for example how a request passes through the system;
- spatial relationships, for example where a component sits on a screen;
- cycles and feedback loops, for example the verify fix loop;
- comparisons between options or quantities;
- data trends over time or across groups;
- hierarchies, architectures and dependencies.
The agent adds no visual for a simple definition or a single fact. Every visual must explain something that the text alone does not explain as well.

- Open with a short plain-words summary.
- Introduce each visual with one sentence that says what it shows. After the visual, explain its key points.
- Alternate text and visuals. Do not stack several visuals together.
- Keep each visual on one idea. Split a complex topic into several simple visuals.
- Label every visual. Use the view's theme tokens, so the colours match and the visual works in light and dark themes.
- Use an interactive element (slider, toggle, step-through) only when changing a value helps the reader understand.
- Close with a short recap.
The renderer already expands `@include` snippets. W5 adds a small snippet set for explainers: a sequence diagram, a comparison bar, a state cycle and a dependency graph. Agents use the snippets, so every explainer uses the same shapes and colours, and agents write less markup.

| Stage | Part 3 shows | The page does not show |
|---|---|---|
| intake | Restated request, charter, success criteria, out of scope | Freshness research, mapping notes |
| shape | Acceptance criteria, non-functional requirements, edge cases, out of scope | Ambiguity inventory, questions asked, research |
| design | Direction confirmed, north-star mock, mock fidelity list | Reference file lists, carry-forward notes |
| slice | Slices with order, status and acceptance criteria | Grouping reasoning, research |
| plan | Steps in plain words, files to touch, risks, blockers | Simplicity ladder, assumptions, current-state research |
| implement | What changed, deviations from the plan, what was deferred | Design-choice notes, research |
| verify | Result, acceptance-criteria status with evidence level, gaps | Check output, probes, scans (in evidence) |
| review | Verdict, open findings by severity, triage decisions | Detailed findings, dimension files (in evidence) |
| probe | What was probed, findings, recommended next command | Adapter notes, observations (in evidence) |
| handoff | Readiness verdict, PR link, reviewer focus, rollout notes | Pre-push and CI telemetry |
| ship | Go/No-Go, version, release steps with status, rollback state | Polling and dry-run output |
| retro | What went well, friction, root causes, recommended improvements | Learning-file lists |
| recap · close · task · brainstorm | Recap becomes the slug's story page. Close shows reason and revival steps. Task shows steps and evidence per acceptance criterion. Brainstorm keeps its current page. | — |

## Every key: inputs and changes

"Requires" is the proposed content of each key's Requires table. Square brackets mark an input that is required only when the file exists. "State" means the index keys the stage uses, not the whole history.

| Key | Agent file(s) | Requires | Changes |
|---|---|---|---|
| Entry |
| intake (default) | `00-index`, `01-intake`, `po-answers` | none · on resume: `01-intake`, `po-answers` | Remove the PO Questions and PO Answers sections; `po-answers` is the only home. Charter and intent risks live in the index only, and the body refers to them. Add `intent-risks` and `charter` to the index template. |
| intake fix · hotfix · refactor · update-deps · adopt | `01-<mode>` plus the `02`–`06` files each mode writes | on resume: index state, `01-<mode>` | Acceptance criteria have one home in `01-<mode>`; implement and verify require that file, not `03-slice.md`. Correct the stale `next-command: wf-shape`. Hotfix root cause lives only in `02-shape`. |
| intake rca · investigate · discover · ideate · audit | `01-<mode>`; audit also writes the review ledger | on re-run: `01-<mode>`, [review ledger] | Change the numbered `###` sections to fixed `##` anchors. The rca `02-shape` refers to RCA sections and does not copy them. Build the ideate ranked list from the `ideas:` roster. |
| intake extend · amend · modernize | `03-slice-<new>`; index edits | extend: index state, `03-slice.md`, seed source | Extend slice files get an explainer. Modernize moves old index history to `index-history.jsonl` for existing slugs. Extend stops reading retro sections that do not exist. |
| shape | `02-shape`, [`02b-design`] | index state, `01-intake`, `po-answers` | Add an `AMB-n` field to each `po-answers.md` entry, because the question-to-ambiguity link lives only in Questions Asked today. Then remove Questions Asked and Answers Captured. Refer to intake's Affected Areas and research instead of merging them again. State the `current-stage` and `progress.shape` writes. Add the `files-in-scope` key that design reads, or change design's read. |
| design | `02c-craft` + `.yaml`; audit and critique files | index state, `02-shape`, [`02b-design`], [carried board] | Change `### 3.` and `### 4.` to the `## Mock fidelity inventory` and `## Implementation contract` anchors that plan, implement and verify cite. Add an explainer. |
| brainstorm | `brainstorm-board.json`, `01-brainstorm`, page | on resume: board, `01-brainstorm` | Already split. Rename its page to the common pattern. Fix slug mode, which writes two artifacts against the one-artifact rule. |
| task | `01-task`, `05`, `06` | on resume: index state, `01-task` | Give the sections fixed headings so that verify and the renderer can find them. |
| Build |
| slice | `03-slice`, `03-slice-<s>` | index state, `01-intake`, `02-shape`, `po-answers`, [`02b`, `02c`] | Add `## Likely Files` to the slice template, or remove plan's read of it. Correct the file names in slice's additive-write rules. |
| plan | `04-plan-<s>` + `.yaml`; `04-plan.md` | index state, `02-shape`, `03-slice-<s>`, `po-answers`, `04-plan.md` sibling table, [`02b`, `02c`, augmentation files] | `04-plan.md` gets a sibling table, built from each existing `04-plan-<s>.yaml` (`files` and `edges`). Step 9 reads the table and reads a sibling plan in full when a file or an edge overlaps, or when the sibling is a listed dependency. The full read catches migration order, shared fixtures, API changes across different files and duplicated utilities, which a file table alone misses. Move Step 0 item 7 to after research. |
| implement | `05-implement-<s>`; `05-implement.md` | index state, `03-slice-<s>`, `04-plan-<s>`, `02-shape`, `po-answers`, [`02b`, `02c`, augmentation files]; reviews mode: review ledger YAML | Add the `files-modified` key that verify reads. Give each upstream field (roster status, cross-links) one owner. Implement stops editing other stages' files directly. |
| verify | `06-verify-<s>`; evidence in `verify-evidence/<s>/` | index state, `03-slice-<s>`, `04-plan-<s>`, `05-implement-<s>`, `02-shape`, `po-answers`, [`02b`, `02c`, augmentation files] | Move raw check output to `verify-evidence/<s>/report.md`. Keep acceptance-criteria status, issues, gaps, the recommendation, and the sections that review, handoff and design audit read: Augmentation Verification, Adversarial Tests, Cross-Browser Delta, Friction Notes, Free Exploration Notes, and the accessibility and performance lists. Cover the update-deps and task verify templates too. Add the missing keys (`stack-source`, `skipped-gating-specs`, `debt-markers-*`) and sections (Caveats, Design Comparison). |
| augment (instrument · experiment · benchmark · profile) | `04b`, `04c`, `05c`, profile run | index state, `02-shape`, `04-plan-*` | Use one status vocabulary (plan writes `ready`, augment writes `complete`, consumers look for `baseline`). Use one path per type. |
| simplify | `01-simplify` + `.yaml`, or a compressed slice | the scope input only | Use one finding-id scheme in the `.md` and the `.yaml`. Settle the plan-scope search rule. |
| Assurance |
| review | master `.md` + `.yaml`; dimension files | per `_context.md`, plus `01-intake` success criteria for slug-wide runs | The master `.yaml` (open findings) is the agent file for downstream stages. The ledger `.md` and the dimension files are evidence. Add the missing Soft Findings / Reviewer Notes section. Move the slug-wide `01-intake` read into the Requires table. |
| probe | `03-slice-probe-<d>`; `probe-evidence/` | index state, `03-slice.md` or `01-*`, per-slice files, runtime adapters | Change the numbered sections to fixed anchors and add the sections the reference names. Map the severity scale to review's scale. Add a template for slug-less sweep. Settle who clears a deferral: probe or verify. |
| Release |
| handoff | `08-handoff` | index state per roster slug, `03-slice.md`, review master frontmatter + `.yaml`, verify frontmatter (named keys), `02-shape` Documentation Plan, [`02c`] | First add frontmatter keys for the verdict reason, the checks that auto-detect skipped, and `live-checks-failing-nonrequired`. Then remove the PR Readiness Block. Keep Summary, Problem and Solution as the PR body, and use them for the explainer. Correct the stale section and key names. |
| ship | `09-ship-run-<id>` + `.yaml`; `09-ship-runs` | `.ai/ship-plan.md`, `08-handoff` frontmatter, index deferrals and intent risks, every `07-review-*.yaml` and the review frontmatter, `po-answers` | Stop reading every `07-review-*.md` body. Per-slice reviews have no master `.yaml`, so ship reads each slice's `.yaml`. The `.yaml` holds only open findings; for "what review fixed" in the release notes, ship reads the fixed-findings count from frontmatter. Correct the Freshness Research heading name. Remove the fragment buttons that have no action behind them. |
| ship-plan | `.ai/ship-plan.md`, acks, audit | repository signals (no workflow artifacts) | Add an explainer. Break the circular read of handoff's `has-migration`. |
| retro | `10-retro`; `.ai/solutions/` | unchanged: every stage file, review bodies and dimension files, `po-answers`, `steer.md`, all deferrals | Keep the full reads. Retro judges review quality and plan-versus-implement drift, and it feeds `.ai/solutions/`, so it needs the bodies. Correct the legacy names `09-ship.md` and `05-implement.md`. Add the `revisions:` key. |
| close | `99-close`, `skip-slice-*` | index state, `03-slice.md` | Change the numbered bold items to `##` headings. Add `99-close.md` to `workflow-files`. |
| Reading keys and drivers |
| status | `INDEX.md`; deep: `00-sync` | index state and stage frontmatter only | First add a `recommended-routes` list (every option with its reason) to each stage's frontmatter, and use one key name (today `recommended-next-*` and `next-*` both exist). Then status reads the options from frontmatter, and the "Recommended Next Stage" body section is removed. Retro, probe and rca get the key too. |
| recap | `90-recap` | explainer fragments, stage frontmatter, `po-answers` | Recap reads the explainers, not every body. Its output becomes the slug's story page in HTML. |
| auto | none | runs each stage in the same session | The read ledger resets on compaction, so a stage after compaction reads its inputs again. |
| yolo | none; the driver writes the index | each stage agent follows the stage's Requires table | See Yolo fixes (Y1–Y8). The ledger is kept for each `agentId`. |
| Project level |
| docs · observability | `.ai/docs/`, `08b-docs-index`, `.ai/observability*.md` | workflow mode: `02-shape` Documentation Plan, `08-handoff` frontmatter | Replace "read the index and all stage artifacts" with the named sections. |

## Yolo fixes

Yolo runs each stage as a new sub-agent. The prompt (`runStage()`, `yolo.js:854`) tells the agent to read `<stage>.md` in full and follow it exactly, and it adds the autonomous policy. It passes no artifact text, and the stage agent does not run the skill. The agent does read the reference. It then skips what the reference points to, and nothing in the run notices. Yolo is Claude-only, so the mod's read ledger covers every yolo run, and decision D3 (Codex) does not apply.

| Fix | What changes | Wave |
|---|---|---|
| Y1 · procedure files are inputs | The Requires table of plan, implement, verify and review lists the procedure files the stage must load: artifact template, sub-agent charters, context list, dispatch rules, fix loop, runtime adapters. Today these are read in 3–58% of runs. | W2 |
| Y2 · upstream intent is required and named | Implement, verify and review require the named shape sections (non-functional requirements, edge cases, out of scope) and `po-answers.md`. Today they read the shape in 8–18% of runs. | W2 |
| Y3 · the check talks to the agent | When a stage agent writes its artifact with a required read missing, the mod adds the missing files to the tool result as `context`. The write succeeds. The agent reads the files and writes again inside the same stage run. The driver needs no file access for this. A block, if D2 chooses one later, must run before the write: a `deny` after the write leaves the file written but tells the agent the write failed. | W4 |
| Y4 · the run report shows reads | The mod writes each check result to a new file, `.read-ledger.jsonl`. The run report agent reads that file and lists every stage that wrote with a missing read, and the waiver reason when D2 allows one. The results do not go to `.driver-journal.jsonl`: the liveness check treats the newest line there as the driver's state, so a mod row would show a live run as "presumed dead". The mod also has no append, so a second writer can drop driver lines. | W4 |
| Y5 · partial reads do not count | The ledger records line ranges. A required file counts as read only when the ranges cover it. Today verify agents read their own reference only in part in 41 of 94 runs. | W4 |
| Y6 · the stage prompt names the checklist | `runStage()` tells the agent that the Requires table is a checklist, that the mod checks it, and that a missing read returns as feedback. The "read in full" order stays. | W2 |
| Y7 · plan fan-out sees its siblings | With `planFanout` on, parallel plan agents cannot see each other's plans, and today they race on the master `04-plan.md`. The fan-out agents stop writing the master. After the fan-out, the bookkeeping agent writes the sibling table from each `04-plan-<s>.yaml` and sets a durable `reconcile-pending` marker in the index. A reconcile agent compares the rows and returns the overlapping slices, and the driver plans those slices again in review-and-fix mode. Orient runs reconcile on resume while the marker is set, because orient otherwise sees every plan done and skips it. Every new agent gets the heartbeat clause. | W3 |
| Y8 · orient reads less | The orient agent parses the index. After the index split it reads only current state, so the open deferrals and the charter are no longer mixed with finished history. | W3 |

The diagram shows how one stage run uses the read check. The loop on the right runs only when a required read is missing.
The check never blocks in warning mode (D2). The write always lands, and the agent gets the missing list in the same turn. Only the named stage writer is checked, and only for its own stage artifact.
The driver's own agents (scouts, refuters, checkpoints, index bookkeeping, slice write-back) write no stage artifact, and their prompts carry their full inputs, so the read check does not apply to them. `auto` runs stages in the main session and gets fixes Y1–Y6 through the same Requires tables and ledger.

## Regression check

Version 4 of this plan was checked against the plugin code at v9.171.0, consumer by consumer. As written, version 4 caused 14 regressions: 2 hard failures, 9 silent data losses and 3 sources of false warnings. This version includes every fix below. The brackets in the last column say where the fix is on this page.

| # | Change in v4 | Regression | Fix in this version |
|---|---|---|---|
| 1 | Retire the fragment hard block | hard The block (`post-write-verify.mjs:160`) is on a missing `.yaml`, not on the fragment. Without it, rich pages fall back to prose. No fragment generator exists. | Keep the `.yaml` block. Drop only the fragment nudge, after W5 ships a generator. (R7, W5) |
| 2 | Write `verify-evidence/<s>/report.md` | hard `pre-write-validate.mjs:42-51` blocks it: no `NN-` name, no frontmatter. The renderer would also make it a page, and a `.md` there marks the workflow stale. | Extend `isProbeEvidencePath` to `verify-evidence/`, and exempt both folders in the renderer walk and the stale check. (W3) |
| 3 | Move 11 verify sections to evidence | silent Review turns failed augmentation checks into BLOCKER findings and reads Adversarial Tests, Cross-Browser Delta and Friction Notes (`review/_context.md:37-43`). Handoff builds Reviewer Focus Areas from them. Design audit reads the accessibility list. | Those sections are contract and stay in `06-verify`. Only raw check output moves. (Every key: verify) |
| 4 | Remove "Recommended Next Stage" | silent `/wf status` shows every option from that section (`status.md:133`). Frontmatter holds one invocation. Retro writes an empty key; probe and rca have none. | Add `recommended-routes` and one key name first. (Every key: status) |
| 5 | Move cleared deferrals and `revisions` out of the index | silent The repeat-deferral marker (`verify/_deferrals.md:57`), the plan tripwire (`plan.md:77`) and retro need cleared entries. The overview renders the index `revisions` strip, and amend writes it. | Only comment prose and old commentary move. (R6, W3) |
| 6 | Ship reads "the review master `.yaml`" | silent Per-slice reviews have no master `.yaml`. The `.yaml` holds open findings only. | Ship reads every `07-review-*.yaml` and the review frontmatter. (R8, Every key: ship) |
| 7 | Retro reads named sections only | silent Retro loses review quality and plan-versus-implement drift, so `.ai/solutions/` learnings get weaker. | Retro keeps its full reads. (R8, Every key: retro) |
| 8 | Story section becomes an explainer fragment | silent Free fragments render at the page foot. `history/` saves only the `.md`. The brainstorm check-in rewrites `## The Brainstorm`, and two brainstorm tests pin that text. | The `explainer` label gets the top slot. `_additive-write.md` saves the fragment too. Brainstorm keeps its section. (W5) |
| 9 | Read results go to `.driver-journal.jsonl` | silent A mod row becomes the newest line, so the status line shows "presumed dead" and stops the watch, and a dead driver can look alive. The mod has no append, so it can drop driver lines. | A separate `.read-ledger.jsonl`. (Y4) |
| 10 | Plan Step 9 reads only a file table | silent A file table misses migration order, shared fixtures, API changes across files and duplicated utilities (`plan.md:101`). | Table from `04-plan-<s>.yaml` files and edges, plus a full read on overlap or dependency. (Every key: plan) |
| 11 | Y7 reconcile after fan-out | silent After a driver stop, orient sees every plan done and never runs reconcile. | Durable `reconcile-pending` marker, and heartbeats. (Y7) |
| 12 | Read check on every stage write | false warning Writers that are not the stage writer (slice write-back, index bookkeeping), writers fed by the prompt (parallel plan, yolo review writer), and an engine compaction in the middle of `/wf auto`. | Check only the named stage writer on its own artifact. Count prompt-fed inputs as read. Keep the ledger through a compaction that `auto` starts in the middle of a stage. (W4) |
| 13 | The mod write hook | false warning It does not match MultiEdit. A `deny` after the write leaves the file written and reports a failure. | Match MultiEdit. Warn through `context`. A future block runs before the write. (Y3, W4) |
| 14 | Remove the PR Readiness Block and shape's Questions Asked | lost detail The verdict reason, skipped checks and failing optional checks have no key. The question-to-`AMB-n` link exists only in Questions Asked. | Add the handoff keys and an `AMB-n` field in `po-answers.md` first. (Every key: handoff, shape) |

Checked and safe: the stale check ignores `.jsonl` files; the hub, the registry and the tray read only status, stage, branch and PR keys; the handoff gate does not change; `subagent-start` (Codex only) reads the first 4,000 characters of the index for `current-stage`, and a smaller index helps it. Three defects exist today without the plan: parallel plan agents race on the master `04-plan.md`; handoff names `live-checks-failing-nonrequired`, which no template or schema defines; status reads `recommended-next-*`, which most stages do not write. W1 fixes all three.

## Contract defects to fix first

The four inventories found about 40 places where one stage reads something that another stage does not write, or writes it under another name. A read check cannot work on top of these defects, so W1 fixes them. These are the classes, with examples.

| Class | Count | Examples |
|---|---|---|
| A consumer reads a section or key that the producer does not write | 9 | Plan reads slice `## Likely Files`; verify reads implement `files-modified`; design reads shape `files-in-scope`; review reads Soft Findings; extend reads retro sections that do not exist. |
| Heading level or name differs from what consumers cite | 7 | Design writes `### 4.` but consumers read `## Implementation contract`; RCA and probe use numbered sections; close uses bold items; ship reads Freshness Research, but the template says "Freshness research delta". |
| A template is missing keys or sections that the stage writes | 8 | Verify: four keys and two sections. Index: `intent-risks`, `charter`, `design-move`. Retro: `revisions:`. |
| Two vocabularies for one thing | 5 | Augmentation status; probe and review severity scales; simplify finding ids; the intake grammar in `recommended-next`; the pre-push decline shape. |
| Stale or legacy file names | 5 | `01-quick.md`, `09-ship.md`, `03-slice-index.md`, and `next-command: wf-shape` on change-mode leads. |
| Copied content with two homes | 6 | PO answers in three places; findings in four places; charter in the body and the index; RCA sections copied into shape; hotfix root cause in two files. |

## Waves

The order puts contract fixes and read fixes before the human page, because stages act on unread inputs today. Each wave ends on a condition that a test or the meter can check. Each wave ships as its own release.

- W0

### Meter and probes

Add the measurement scripts to `scripts/` as one meter for read coverage, refused reads, artifact size and write mix. Record the baseline next to `load-baseline.json`.
- Probe the mod: confirm that a `tool.call` hook on `Read` fires for yolo stage agents with an `agentId`, on the CLI and on Desktop.
- Probe command hooks with `SDLC_HOOK_DEBUG=1` to learn whether sub-agent payloads carry an agent id.
**Done when**the meter reproduces this page's figures, and both probe results are written in the plan document.

- W1

### Contract fixes and a contract-graph test

Fix the defects in the table above, class by class.
- Fix the three defects that the regression check found: the race on the master `04-plan.md` in plan fan-out, the undefined `live-checks-failing-nonrequired` key, and the two next-step key names.
- Add a guard test that reads every stage reference, collects each section and key that a consumer cites, and checks that the producer's template contains it.
**Done when**the contract-graph test passes for every key and intake mode, and it fails when a cited section is removed from a template.
**Risk:** the snapshot and fixture tests pin some current headings. Update them in the same commit.

- W2

### Requires tables replace prose read orders

Put each key's inputs from the coverage table into its existing Requires table. Delete the prose read orders in Step 0.
- Cut the over-reads: handoff, ship, retro, recap and status read frontmatter, the review ledger YAML and named sections.
- Add the procedure-file rows and the named upstream sections (yolo fixes Y1 and Y2).
- Change the yolo stage prompt and `auto.md` to name the Requires table as a checklist (Y6).
**Done when**a guard test finds a Requires table in every stage reference, and no Step 0 or "load" sentence names a file that the table does not name. The prose budget does not grow.

- W3

### Small agent files

Split the index: move YAML comment prose and old next-step commentary to `index-history.jsonl`. Keep the deferral list (cleared entries too), the intent risks and the `revisions` ledger. Add a lint that rejects YAML comment prose in the index, and a size warning.
- Move raw verify check output to `verify-evidence/<s>/report.md`. Keep the sections that review, handoff and design audit read. Extend `isProbeEvidencePath` to cover `verify-evidence/` in both write hooks, and exempt both evidence folders in the renderer walk and the stale check.
- Add the `04-plan.md` sibling table from the plan `.yaml` files, and the yolo fan-out reconcile step with its durable marker (Y7, Y8).
- Add `recommended-routes` to stage frontmatter. Then remove the duplicated content and the "Recommended Next Stage" body sections, and status reads frontmatter.
**Done when**the meter shows no refused reads and an index p90 under 20 KB on new slugs, and a test proves that each moved key has no reader in code.
**Risk:** `subagent-start` reads only the first 4 KB of the index. Keep `current-stage` near the top.

- W4

### The read ledger

Add a mod `tool.call` hook on `Read`. It records each workflow artifact and procedure file that each agent reads, with line ranges, keyed by session and `agentId`, and resets the record on compaction.
- A missing read returns to the agent as `context` on the tool result, and the write succeeds. Each result goes to `.read-ledger.jsonl` for the yolo run report (Y3, Y4, Y5).
- The existing mod hook on `Write` and `Edit` compares those reads with the stage's Requires table when the agent writes its stage artifact. Add `MultiEdit` to the hook's tool list.
- Check only the named stage writer on its own stage artifact. Skip sibling `.yaml` and fragment files, `history/`, the index, `03-slice.md` write-backs and the driver's agents.
- The writer must read the inputs itself. Reads by research sub-agents do not count for the coordinator. An input passed in the prompt (parallel plan, the yolo review writer) counts as read.
- Reset the ledger on a compaction between stages. Keep the ledger through a compaction in the middle of a stage, which `/wf auto` can start.
- On Codex, which has no read hook, the artifact records `reads-checked: false`.
**Done when**a test proves that a stage write with a missing required read produces the feedback, and a yolo run on a fixture slug shows every stage at 95% or more required-read coverage in its run report.
**Risk:** do not add `Read` to the `post-tool-use-all` matcher. That pipeline does not check the tool name, and it would run `git add` and schema checks on every file an agent reads.

- W5

### The human page

Replace the story section in each template with the explainer fragment. Brainstorm keeps its `## The Brainstorm` section. Update `_story-arc.md` with the explainer rules above, and `_chat-return.md`: the chat return quotes the explainer summary.
- Give the renderer an `explainer` slot at the top of the page. Today free fragments go to the foot.
- Add `_additive-write.md` Step 1: save the explainer fragment to `history/` with the `.md`.
- Add the explainer snippet set (sequence, comparison, cycle, dependency graph) as `@include` snippets that use the view's theme tokens. Confirm whether the view runs scripts inside fragments before any explainer uses an interactive element.
- Add a light explainer check: summary first, one sentence before each visual, a recap at the end. `verify-fragment` skips free fragments today.
- Give the renderer one page recipe for each stage, with the four parts described above.
- Add a generator that builds each typed fragment from its sibling YAML. Then agents stop writing typed fragments, and only the fragment nudge is removed. The block on a missing `.yaml` stays.
- Recap becomes the slug's story page.
**Done when**the renderer builds a four-part page for every stage type with the explainer at the top, the brainstorm tests pass unchanged, and the meter shows typed-fragment writes near zero on new artifacts. The meter also reports the explainer write cost.
**Risk:** the renderer maps unknown file names to nothing. Every new file name must have a route in `_paths.mjs`, or its content is silently not rendered.

- W6

### Old slugs and documentation

Old slugs keep their current view. The renderer falls back to the full body when an artifact has no explainer.
- `/wf intake modernize` can move an old index's history to `index-history.jsonl` on request.
- Update the doc site pages for artifacts and for each stage.
**Done when**an old slug from each of the 13 sample projects renders without error, and the doc-site check passes.

## Risks and how the plan handles them

| Risk | Handling |
|---|---|
| A renamed agent file breaks the mod's landed-stage check, the drivers' gate tables, the schema and the renderer routes. | Agent files keep their current names (R1). |
| A `Read` matcher on the shared PostToolUse pipeline runs `git add` and schema checks on every read. | The ledger lives in the mod `tool.call` hook, not in command hooks (W4). |
| The coordinator writes, but children read, so a strict per-agent check blocks the coordinator. | The Requires table lists only inputs the writer needs itself. Research inputs stay with children and are not checked. |
| Reads through Grep, shell `cat` or partial `Read` are not recorded, which causes false blocks. | Start in warning mode and study the meter before blocking (D2). |
| A new file type fails the filename rule, the schema branch or the renderer route. | Evidence goes under exempt folders. History is `.jsonl`. Explainers are free fragments, which the renderer already routes. |
| Moving index keys breaks yolo orient, the design gate, the registry, the hub, the tray or the mod. | Only keys with no reader in code move. A test checks each moved key (W3). |
| A history or evidence file written after the index marks the workflow as stale. | History is `.jsonl`, which the stale check ignores. Add the evidence folders to the stale-check exclusions. |
| Guard churn: snapshots, the prose-budget ratchet, `dist/` rebuilds, Codex hook re-trust. | Each wave updates snapshots and rebuilds `dist/` in the same commit. W2 removes prose while it adds tables, so the budget shrinks. |

## Decisions

The PO decided D1 to D7 on 2026-09-27.

D1
Is the wave order right: contract fixes and read fixes first, human page later?
**Decided:** yes. Contract fixes and read fixes come first, because stages act on unread inputs today.

D2
When a stage misses a required read, does the check block the write or record a warning?
**Decided:** warn for two weeks and measure false positives with the meter. Then block, with a waiver that needs a written reason.

D3
Codex reads cannot be recorded by a hook. Do Codex sessions skip the read check?
**Decided:** yes. The artifact records `reads-checked: false`.

D4
How do a person's answers reach the contract once the human part is HTML: chat only, or an input on the page?
**Decided:** questions are always asked in chat. The agent writes the answers to `po-answers.md`. The HTML page shows the questions and answers, and it has no input fields.

D5
Do old slugs get the new human pages?
**Decided:** no. Old slugs keep their current view, and modernize is opt-in.

D6
Does the agent write the explainer as an HTML fragment, or as a markdown section that the renderer converts?
**Decided:** an HTML fragment. It gives you HTML files, agents never read it, the renderer already places free fragments, and it can carry the diagrams and charts that the explainer rules allow.

D7
What is the index size limit that triggers the warning?
**Decided:** 20 KB.

## Method and limits

**Artifacts on disk:** 72 slugs with activity since 2026-07-01 in Waypoint, Isometric, SoccerManager, SoccerManager-faces-poc, Playster, Crumb, Trails, bot-backend, NaijaBet_Api, FManager, vercel-test, PushKit and Aperture. The test fixtures wf-mod-fixture, tier-b and grok-test are not included.
**Transcripts:** 2,424 Claude and Codex sessions since 2026-07-01. Of these, 998 read workflow artifacts. Waypoint (807 sessions) and SoccerManager (458) supply about half of them. Plugin development in agent-skills and a Codex test repo add about 10%.
**Code inventory:** four read-only passes over every stage reference, the shared rule files, the hooks, the mod, the renderer, the schema and the tests in `plugins/sdlc-workflow` at v9.171.0.
**Regression check:** three more read-only passes traced every consumer of each changed section, key and file, in code and in stage-reference prose. The results are in the regression check.
**Limits:**

- Token counts are characters divided by 4.
- Write counts do not include Codex writes or shell heredoc writes, so the true write share is higher.
- The yolo driver puts no artifact text in its stage prompts, so the read rates for yolo agents are complete. Other orchestrators can put artifact text in a prompt, and those reads are not counted.
- "Sibling plans on disk" also counts plans written after the session.
- The section buckets and the defect counts come from headings and my judgment.

Prepared with Claude from local artifacts, session transcripts and a read-only inventory of the plugin. No plugin code changed.
