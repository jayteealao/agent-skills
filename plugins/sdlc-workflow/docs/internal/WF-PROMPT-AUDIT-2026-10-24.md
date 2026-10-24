# /wf prompt audit — 2026-10-24

Method: `/claude-api prompt-audit` (guide `shared/prompt-audit.md`). The proposed diff is
[WF-PROMPT-AUDIT-2026-10-24.patch](WF-PROMPT-AUDIT-2026-10-24.patch): 60 files, 109 hunks,
127 lines added and 131 lines removed. The patch is the original proposal; the applied state is
described in "Decisions and application" below.

## Decisions and application (2026-10-24)

The product owner accepted every finding. The working tree carries all of them; nothing is committed.
Where an answer differs from the recommendation, the answer wins:

- **I3 + C5.** The six change-mode lines keep `/wf review <slug> <rubric>`. Review gained the form:
  SKILL.md's review cell takes `<slug> [<slice>|triage|<rubric>]`; `review.md` Step 00 and `review/_stage.md`
  Step 0 resolve a second token as a slice first, then as a rubric or alias key (the user focus override).
- **I1 + F22.** The `owner` command, its CLI case, its usage text and its test assertion are deleted from
  `scripts/campaign.mjs` and `tests/unit/campaign-cli.test.mjs`.
- **D3.** The answer named `intake amend`, but `intake/amend.md:37` makes `status` not amendable. The
  applied text is the recommended one: set `status: in-progress`, then run `/wf design <slug>`.
- **Flags.** Each flag got its suggested fix, with these choices: F1 closes the piece with
  `campaign.mjs close … done`; F2 continues with setup; F4 removes the discover checkpoint from `yolo.md`
  only (auto, a prose driver, keeps it); F5 makes causal diagnosis **medium**; F7 uses three to five colors;
  F8 adds a named exception for the build marker to `_output-boundary.md`; F9 keeps the Step 0 numbering
  and drops the retired flag; F17 names `pr#N` only.
- **Left open:** F12 (motion restraint counts), F15 (70-word narrative, house style), F16 (early-stop
  guard), and the pi version pins of F19. Each one needs an eval or a live pi session first.
- **Checks:** `npm run build`; 9 `retired.json` entries; `verify-prose-budget.mjs --update` after
  `verify.md` was cut back under its budget (the C9 self-check lines are paid for by padding removed from
  the same prompt); `verify:capabilities` OK; `verify:prose` OK.
- **Tests:** `npm test` 1,511 of 1,513 pass, 0 fail (exit 0). Two pinned patterns follow the rewritten
  sentences (C11 in `single-source-contract.test.mjs`, W18 in `ship-plan-drift-clears-on.test.mjs`).
  The review cell uses the known `<dimension>` class. The I6 lines name "the plan stage", not
  `plan.md`: a "per `plan.md`" citation joined the intake load graph to the runtime adapters (85 files,
  limit 80). One run failed once in `multi-repo-hub.test.mjs` (`git add .` in its temp repo); the next
  full run passed.

## Assumptions

- **Scope.** `plugins/sdlc-workflow/skills/wf/`: `SKILL.md`, `agents/openai.yaml`,
  `reference/**` (234 files), `workflows/*.js` (3), and the model-facing strings in
  `scripts/*.mjs` (7). About 306,000 words. Not in scope: hooks, `lib/`, the other skills,
  user-level configuration. Settings and MCP files were not read.
- **Target model.** Claude Opus 5.5 for every reference file (the agent that reads them).
  The workflow prompts are audited against the model that each `agent()` call pins:
  `OPUS` = `claude-opus-5-5` at `medium`, `SONNET` = `claude-sonnet-5-5` at `high`,
  `HAIKU` = `claude-haiku-5-5` at `medium`.
- **Baseline.** The prior audit (2026-09-25, release `56193645`) fixed every high and
  medium finding. Since then, 214 files in the scope changed (10,049 lines added). This
  audit read all files and gave first priority to the changed text.
- **Not re-reported.** The "Prompt with ALL of the following" lead-ins and the STE house
  register (low flags from the prior audit).
- **Method.** Four read-only scan agents read the partitions (design; intake and drivers;
  core stages; workflows, ship-plan, augment, docs, adapters). The lead checked 20 of the
  high findings against the files, and the edit script asserted every old text once.

## Summary

The dated-prose patterns stay clean. A grep over the whole scope finds no
think-step text, no reasoning-echo field, no update suppressor, no turn-cadence
reminder, and no budget countdown. The capitalised emphasis that remains is in sample
code or in one cluster of workflow labels. What grew back is **drift between files**.
Fast feature work (route wizard, pieces, rubric merge, design boards) changed one file
and left the files that cite it stale. 78 of the 89 findings are Group 2.

Three findings matter most. First, the yolo driver tells every **first** verify round
that "a prior round already applied one fix pass; resolve only what still fails"
(`workflows/yolo.js:1649`). `driveVerify` passes `round: 1`, and 1 is truthy, so the
first verify agent works from a false premise. Second, the command forms that the
SKILL.md argument table accepts no longer match the forms other files tell people to
type. `/wf review <slug> security` (hotfix, refactor, review stage),
`/wf implement <slug> <slice> reviews`, `/wf retro <slug> deep` and `/wf discover`
all fall through to the router. Third, the design tree still describes generated image
probes as the way to pass the image gate (`design/contract.md:9` and six other lines).
The board rule that replaced them says a generated image never passes the gate.

| Group | Findings in the diff | Flags (no edit) |
|---|---|---|
| 1 — dated prompt text | 6 | 4 |
| 2 — brittle configuration files | 60 | 18 |
| 3 — tool descriptions | not applicable (no tool definitions in scope) | — |
| 4 — request config and architecture | 1 | 0 |

Group 4 checks that found nothing: no forced `tool_choice`, no thinking-disabled
config, no history editing, no budget countdown in context. The five `HAIKU` calls in
`yolo.js` (branch, writeback, plan-reconcile-clear, run-end, plan-index-writeback) are
the bookkeeping sites the product owner approved on 2026-10-20. They are not findings.

## High confidence — contradicted by the repository

Each row is one hunk group in the patch. "Why" names the file that contradicts the text.

| ID | Location | Evidence | Pattern | Why obsolete | Action |
|---|---|---|---|---|---|
| W1 | workflows/yolo.js:1649 | "This is autonomous fix ROUND ${extra.round} of up to 2 — a prior round already applied one fix pass" | 2 stale fact | `driveVerify` (yolo.js:1848) passes `round: 1` on the first call, so round 1 gets this text. The trailing overwrite sentence is also stale (verify.md:86 asks nothing on a re-run). | rewrite: emit only when `extra.round > 1`; drop the overwrite sentence |
| W2 | workflows/yolo.js:982 | "If the reference warns the slice was already verified and asks to overwrite, proceed" | 2 stale fact | verify.md:86 notes a re-run and proceeds; `_additive-write.md` snapshots. The condition cannot occur. | remove |
| W3 | workflows/yolo.js:965 | "the plan reference runs an 8–12 question discovery interview" | 2 stale fact | plan.md:139 asks "up to 4 per round, in as few rounds as possible". | rewrite |
| W4 | workflows/yolo.js:1580 | "by mirroring implement.md Step 0.9" | 2 stale path | implement.md has no Step 0.9; the prompt already lists every git step. | remove the pointer |
| C2 | SKILL.md:40 | `` `<slug> [<slice>\|reviews]` `` | 2 conflict | `implement/_reviews-mode.md:3`, `review/_stage.md:13,212,240,244` and `handoff.md:67` give `/wf implement <slug> <slice> reviews`, which Step 0 item 7 now routes away. | rewrite: add the form |
| C3 | SKILL.md:42 | `` `<slug> [<slice>\|triage]` `` | 2 conflict | `review/_triage.md:9` reads a third-argument slice. | add `<slug> triage [<slice>]` |
| C4 | SKILL.md:45 | `` `<slug>\|pr#N\|<branch>` `` | 2 conflict | `retro.md:68` offers a `deep` token. | add `[deep]` |
| I3, C5 | intake/hotfix.md:197,206,210; intake/refactor.md:202,211; review/_stage.md:37 | "`/wf review <slug> security`", "`/wf review <slug> <rubric>`" | 2 stale command | review.md:78 takes only `<slice>` or `triage` after a slug; `refactor-safety` is now an alias of `architecture` (`review/_ad-hoc.md:12`). The stage picks the rubric by mode. | rewrite to `/wf review <slug>` |
| I2 | yolo.md:116,184,206; auto.md:128 | "`/wf discover <hypothesis …>`" | 2 stale command | `discover` is an intake mode (SKILL.md:35), not a key. | rewrite to `/wf intake discover` |
| I1 | yolo.md:128 (+ :143, :149, :160; campaign.md:74) | "**Campaign owner.** … On `owned: true`, a campaign wave drives the slug." | 2 stale fact | `scripts/campaign.mjs:704` always returns `owned: false`; `13196454` deleted the wave driver. | remove item 4; renumber; point the `models` comment at `.ai/sdlc-config.json` |
| C10 | reference/_subagents.md:72 | "may set a stage to `claude-sonnet-5-5`" | 2 stale fact | `yolo.js:69` tests `MODELS[stage] === 'sonnet'`; `schemas/sdlc-config.schema.json` allows `opus` or `sonnet`. | rewrite to `sonnet` |
| C0 | SKILL.md:10 | "Three contracts bind every key" | 2 stale fact | Four bullets follow. | rewrite to "These contracts" |
| C1 | SKILL.md:101 | "Narrative: 2–5 sentences of prose" | 2 conflict | `_chat-return.md:17` (newer, 2026-10-17) says two or three sentences, about 70 words; SKILL.md:107 defers to it. | rewrite to a pointer |
| C6 | implement/_reviews-mode.md:35 | "mainline Step 13 in `implement.md`" | 2 stale path | The commit is step 12 (implement.md:156; `implement/_steps.md:7,11`). | rewrite |
| C7 | handoff/_pr-triage.md:155 | "landed via implement reviews" | 2 stale fact | Triage fixes land through the fix-subagent contract (`_pr-triage.md:83`). | rewrite |
| C8 | slice.md:220 | "reserved for explicit `/wf status` reconcile operations" | 2 conflict | status.md:40 (newer) writes only `INDEX.md` and `00-sync.md`. | rewrite to "Do not delete a slice file from disk" |
| C12 | ship.md:108 | "`artifact-tracking` policy" | 2 stale key | The key is `artifactTracking` (`schemas/sdlc-config.schema.json:12`). | rewrite |
| X1 | ship-plan/audit.md:89 | "[../review/supply-chain.md]" | 2 stale path | `4fb5bb5e` merged the rubric into `review/security.md` § supply-chain. | rewrite the link |
| D1 | design/contract.md:9 | "generate the north-star mock/probes via the `imagery` skill" | 2 conflict | `_boards.md:69`, `_preflight.md:42`, and this file's line 78 say a generated image never passes the gate. | rewrite to boards |
| D2 | design/_component-craft.md:44 | "See the Interruptibility rules in `animate.md`" | 2 stale heading | The section is now `## Interruption and exit` (animate.md:147). | rewrite |
| D3 | design/stage.md:13 | "Use `/wf status recap <slug>` to reopen." | 2 stale fact | recap.md only tells the story; reopening sets `status: in-progress` (`intake/brainstorm.md:101`). | rewrite |
| D4 | design/record.md:71 (read clause) | "piece of work with `shape: design-direction`" | 2 stale schema | `intake/brainstorm/_artifact.md:84` records `design-form` on a new board. | rewrite the read clause; the state clause is flag F1 |
| D6 | design/_preflight.md:76 | "**Read-only** — `extract`. … no project files modified." | 2 conflict | `extract.md:137` writes `## System in code` of `current.md`; `record.md:11` agrees. | rewrite |
| D7 | design/critique.md:104 | "the `motion` review dimension" | 2 stale name | Motion is the `motion` focus of `interface-craft` (`review/_select.md:28`). | rewrite |
| D8 | design/contract.md:86 | "the "yes to proceed" answer above" | 2 stale cross-reference | No such question exists above; approval is `stage.md` Step 5. | rewrite |
| I4 | intake/simplify.md:21 | "(see SKILL.md Step 1 step 6)" | 2 stale path | The rule is `_compressed-slice.md` step 6. | rewrite |
| I5 | intake/simplify.md:22 | "`/wf intake refactor <slug> <target>`" | 2 stale form | intake.md:42 attaches a slice only for `<slug> <mode>`. | rewrite to `/wf intake <slug> refactor <target>` |
| I6 | intake/adopt.md:102; adopt/_artifacts.md:31,116 | "Apply W2d to any AC" | 2 dangling id | `W2d` is defined nowhere; the rule is the force-scope rule in `plan.md`. | rewrite |
| I7 | intake/brainstorm/_artifact.md:84 | form list without `rca` | 2 conflict | `lib/pieces.mjs:19`, `_work.md:51` and the schema include `rca`. | add `rca` |
| I8 | intake/task.md:134 | "**Not an intake mode**" | 2 conflict | intake.md:6,27 list `task` as an intake mode. | rewrite |
| I9 | yolo/_commentary.md:42 | "staleness rule in [../_control-file-ownership.md]" | 2 stale path | The rule is `_liveness.md:5`; yolo.md:37,178 cite it. | rewrite the link |
| I10 | intake/ideate/_artifact.md:30 | "(Step 3b)" | 2 stale step | `seen-in` is recorded in ideate.md Step 3c. | rewrite |
| W5 | runtime-adapters.md:32 | "`--adapter <key>` flag (probe only)" | 2 stale flag | `fb249870` removed the flag; probe.md:59 says "No flags". | remove item 4; renumber |
| W6 | augment/instrument.md:160 | "/wf experiment <slug>" | 2 stale command | SKILL.md has no `experiment` key; augmentations run inside `plan`. | rewrite |
| W7 | docs.md:152 | "`docs: update documentation via wf docs run <run-id>`" | 2 conflict | `_output-boundary.md` keeps command names and run ids out of commit messages; docs.md:7 applies it. | rewrite |
| W8 | ship-plan/audit.md:97 | "**Effort-tiered, not model-pinned**" | 2 conflict | `_subagents.md:72` says "never omit the pin". | rewrite |
| W9 | ship-plan/edit.md:54,84 | "inbound blocks (H–J)" | 2 conflict | The same file says "Inbound (H–K)" (:43, :48); build.md:67 maps K. | rewrite to H–K |

## Medium confidence

| ID | Location | Evidence | Pattern | Why obsolete | Action |
|---|---|---|---|---|---|
| W10 | workflows/yolo.js:138,803,860,876,904,943,1545; _shared.js:62 | "STANDING STEERING (MANDATORY)" and six more labels | 1a pressure language | One stage prompt carries six "(MANDATORY)" labels on blocks that are all required, so the label carries no signal. optimize.js:58 already omits it. | remove the token; keep each clause |
| IM5 | intake/brainstorm/_talk.md:15,30; brainstorm/_artifact.md:185; yolo/_commentary.md:84 | "about 150 to 350 words", "at most six sentences" | 1f numeric ceilings | No code checks these numbers; the coded 150-word archive summary is kept. | rewrite as audience framing |
| W18 | ship-plan/_readiness-gate.md:9 | "The original rule … is right about … and wrong about …" | 1d migration-relative | The text is a diff against a rule the reader never sees; the bullets below state the rule. | rewrite |
| I12 | yolo/_commentary.md:7,72 | "available to the session today (WF-WATCH-MONITOR-PLAN, section 9)"; "no longer depends … before R1" | 1d + 2 history | Relative time and plan ids as authority. | rewrite |
| IM7 | intake/ideate/_artifact.md:78 | "The renderer's `score` formula does not change." | 1d migration-relative | Implies an earlier formula. | rewrite to the current fact |
| IM8 | intake/task.md:49 | "the two new rungs on the existing ladder" | 1d migration-relative | Same. | rewrite |
| H1 | verify/_deferrals.md:11,35,55; handoff/_pr-ci-handoff.md:78; _control-file-ownership.md:8 | "Stale relayed environment facts once calcified …"; "Decision (plan §2.4)"; "the retro recorded 'AC6 shipped uncleared.'" | 2 history narrative | Each rule already states its behaviour; the incident text adds no rule. | remove the incident sentences; restate §2.4 as a rule |
| P1 | review/_stage.md:23; review/_triage.md:3; verify/_runtime-evidence.md:3,61; implement/_steps.md:3,5,25; verify/_sub-agents.md:38; status/_renders.md:73; status.md:78; _question-craft.md:79; intake/brainstorm.md:165; brainstorm/_artifact.md:169,221 | "(WF-SYSTEM-REVIEW E3)", "(C4)", "(B6)", "## Archive (D1)" | 2 plan ids as authority | The ids point at plan documents the reader does not load. | remove the parentheticals |
| C9 | verify.md:166–198 | fix prompt without a check command | 2 conflict | `_fix-loop.md` rule 4: "run a real check command the orchestrator passes in". | add the command and the `Self-check:` line |
| C11 | reference/_subagents.md:72 | "pins … to `claude-opus-5-5` at `medium` effort … Never use `opus` below high" | 2 conflict in one cell | `yolo.js:64` pins Opus at medium by product-owner decision; the rule is about prose dispatch. | rewrite to scope the rule to prose dispatch |
| C13 | ship/announce.md:3,36 | "from `$ARGUMENTS` (second argument, if present)" | 2 conflict | The route is `/wf ship <slug> announce`, so the second argument is `announce`. | rewrite; Step 3 asks |
| C14 | ship/rollback.md:119 | "story section (same narrative voice as every stage artifact)" | 2 stale fact | `_chat-return.md:15,20`: stages write no explainer; only the brainstorm keeps a story. | remove the clause |
| C15 | _ste-procedural.md:10,16 | "Story sections and chat summaries MUST additionally follow *The narrative*" | 2 conflict | The narrative's 70-word form cannot hold the three-beat brainstorm story. | scope to chat summaries |
| D9 | design/contract.md:20,27,143; design/shape.md:5,110; design/_preflight.md:55 | "probes generated", "image probes" | 2 stale vocabulary | Boards resolve the gate (finding D1). | rewrite to boards |
| D10 | design.md:131; design/_output.md:59 | "`Next` is "Type `/wf slice <slug>`."" | 2 conflict | `design/stage.md:9` routes `rca` to `/wf plan`. | rewrite to point at the Next row |
| D11 | design.md:119–128 | summary template without `Boards:` | 2 conflict | `design/_output.md:55` requires the board revision in the summary. | add the line |
| D12 | design/audit.md:116–118 | "`/wf design harden`" | 2 stale form | With no slug, a move starts a new workflow (design.md:64–67). | rewrite to `/wf design <slug> harden` |
| D18 | design/mode-read.md:33 | "about 60–75 characters" | 2 conflict | Line 22 of the same file, `_craft-floor.md:28` and `typeset.md:102` say 65–75. | rewrite |
| IM2 | campaign.md:84 | "add it to the list as a new piece with `/wf intake brainstorm <source-slug> add`" | 2 stale fact | campaign.md:10 also takes an ideate source, which has no `add`. | rewrite with the condition |
| IM4 | intake/brainstorm/_cohere.md:3,25 | "the work it already routed", "a routed piece" | 2 replaced model | Piece states are `written/open/built/done/dropped` (`lib/pieces.mjs:25`). | rewrite |
| IM6 | goal.md:22 | "they answer gates by written policy" | 2 conflict | campaign.md:19: the walk asks at each stop. | rewrite |
| W11 | workflows/yolo.js:1500 | "Give drives board paths …, never a canvas link." | 1c padding | Garbled copy of `_boards.md:111`; orient dispatches nothing. | remove |
| W12 | workflows/yolo.js:1223 | `stepsDone: { type: 'number' }` | 2 stale schema | Step groups were removed (D33); no code reads the field. | remove |
| W13 | workflows/optimize.js:113 | `book()` at `...SONNET` (effort high) | 4 deterministic call | The agent runs one command and returns its stdout. One call must stay (the runtime cannot exec), but high effort buys nothing. | set `effort: 'low'` (a routing decision the product owner may decline) |
| W14 | workflows/optimize.js:111 | "Do not edit any file" | 2 conflict in one prompt | The same prompt can ask for a file write first (`pre`, :148). Sonnet 5.5 follows the later rule literally. | rewrite to "any other file" |
| W15 | ship-plan/audit.md:10–11 | "Only when the workflow has a `steer.md`" | 2 conflict | The audit is project-level and has no slug; ship-plan.md:29: "The plan reads no workflow artifacts". | remove |
| W16 | augment/benchmark.md:166–168 | lines 42 and 136 say Compare Step 4 sets `mode: complete` | 2 rule names a step that does not do it | Compare Step 4 sets only the `05c` frontmatter. | add the index update to Step 4 |
| W17 | runtime-adapters/web.md:25,27 | "rung 0 of the web ladder", "the web ladder above" | 2 stale pointer | The ladder is in `_ladder-walls.md`. | rewrite |
| W19 | ship-plan/build.md:124 | "with trailer `sdlc-unreviewed: true`" | 1d unenforced + 2 conflict | No reference reads the trailer, and it puts workflow vocabulary in a commit. | remove the trailer clause |
| W21 | ship-plan/edit.md:10 | "use `/wf intake <slug> amend` for that" | 2 conflict | intake.md:2,8: `amend` edits configuration only, never stage artifacts. | rewrite |

## Flags — no edit proposed

| ID | Location | Evidence | Why flagged | Decision for the product owner |
|---|---|---|---|---|
| F1 | design/record.md:71 | "set the piece's `state: routed` and `routed-to: direction`" | Stale schema, but the current way to mark a direction piece done is not settled. | The piece file, or `campaign.mjs close … done`? |
| F2 | design/_preflight.md:51 | "Otherwise STOP: *Design context is missing.*" | Conflicts with `stage.md:22`, `contract.md:18`, `setup.md:5` (continue with setup). The older passage is a STOP gate, so the guide does not allow a proposed rewrite. | Keep the STOP, or "run `/wf design setup` with the person, then continue"? |
| F3 | intake/brainstorm/_work.md:166 vs intake/_intake-provenance-consume.md:40 | "No other session writes them" vs "Set `state: open` in the piece file" | `campaign.mjs open` refuses non-build forms (:495). | Allow the mode to write `state`, or add a script command? |
| F4 | yolo.md:116,184,206; auto.md:128 | the discover checkpoint | `yolo.js` has no RIM or milestone code; it never ran. | Build it, or remove the three passages? |
| F5 | handoff/_ci-red-routing.md:7 vs _subagents.md:41 | diagnosis "at **medium** effort" vs "**high** only for … causal-reasoning children" | `intake/rca/_research.md:5` argues for medium. | Which tier for causal diagnosis? |
| F6 | design/adapt.md:41 vs typeset.md:78, mode-read.md:22 | "On a Persuade or Read surface, display type may grow" | Same commit; history cannot order them. | Probably "Persuade or Experience". |
| F7 | design/colorize.md:30 vs mode-persuade.md:30 | "3–4 named color roles" vs "Three to five colors" | Same commit. | Pick one count. |
| F8 | ship-plan/build.md:20; ship-plan/build/*.md; observability/build.md:33 | "# Added by wf ship-plan build" | Puts a command name in the user's repo, but ship.md:109 matches the marker. | Named exception in `_output-boundary.md`, or rename together with ship.md? |
| F9 | ship.md:3,58 | "not `/wf ship --init-plan`" | Redirect for a retired flag (1d); removal renumbers Step 0. | Low. |
| F10 | design/_platforms.md:7,147 | "added on 2026-10-22"; "Rechecked with … W0" | History; the verification date is useful. | Low. |
| F11 | design/_design-context.md:61 | "Minimum 16px body text" | Stricter than `typeset.md:160`. | Low. |
| F12 | design/animate.md:76; design/critique.md:102 | "at most 5–7 opportunities", "List 2–5 rejected candidates" | A ported motion-restraint rule, not a length cap. | Low; keep unless evals say otherwise. |
| F13 | review/_dispatch.md:71,75 | `kept-by-person`, `needs-amend` | Not named in `_findings-ledger.md` rule 5. | Low. |
| F14 | review/_stage.md:145 | "(per [_fix-loop.md] rule 3)" | Cites the fix pin for the reviewer tier. | Low. |
| F15 | _chat-return.md:17 | "at most about 70 words" | 1f numeric cap, but it is the house style. | Low. |
| F16 | _autonomy-guards.md:6–15 | early-stop guard | Anti-early-stop booster (1a). Re-test on Opus 5.5. | Low. |
| F17 | handoff.md:52; ship.md:55; retro.md:65; status.md:87; recap.md:50 | bare `#N` and bare-integer forms | SKILL.md Step 0 item 7 accepts only `pr#N`. | Low. |
| F18 | plan.md:163 | "Option B `/wf slice <slug>`" | plan.md:157–158 define B as Implement all. | Low. |
| F19 | _compressed-slice.md:76; slice.md:97; _grounded-progress.md:25; _host-surfaces.md:7 | "it is now scoped"; "picked it 10 times of 13"; probe receipts in `verify.md`; version pins without a date | Small 1d and history items. | Low. |
| F20 | intake/rca.md:206; investigate.md:214; investigate/_artifact.md:70 | `/wf status recap <slug> <focus>` | recap takes a fixed focus set. | Low. |
| F21 | intake/brainstorm/_design.md:3; ideate/_lenses.md:63; yolo.md:97,114 | duplicate form; "Step 5 prints"; checkpoint skip not stated | Small stale details. | Low. |
| F22 | scripts/campaign.mjs (plugin root):18,704; skills/wf/scripts/campaign.mjs:2; workflows/yolo.js:1163,1560 | `owner` command; "the waves"; "mirrors implement.md Step 0.9" | Dead code and stale comments, outside the prompt surface. After I1, `owner` has no caller. | Remove with a code change and its test. |

## How to apply

1. Read the patch. Take hunks one at a time; each hunk carries one finding.
2. CAUTION: do not run `git add -A`. Other sessions edit this tree; stage each file by path.
3. From the repository root, apply the hunks you keep: `git apply --include=<repo-relative path> plugins/sdlc-workflow/docs/internal/WF-PROMPT-AUDIT-2026-10-24.patch`. Omit `--include` to apply all hunks.
4. Run `npm run build`. `workflows/_shared.js` changed, and `scripts/build-drivers.mjs` writes it into the SHARED block of `yolo.js`. The patch edits both copies the same way.
5. Add `retired.json` or `reworded.json` entries where a removed sentence was a capability (for example `--adapter`, the campaign owner step).
6. Run `verify-prose-budget.mjs` and the unit suite. Two tests name `WF-SYSTEM-REVIEW E3` only in comments.

## Not verified

- No behavioural probe ran (Step 7 of the guide). Each Group 2 fix was checked against the repository only.
- The unit suite did not run against the patched tree.
- About 40 files in the intake and ship-plan partitions were checked by diff since `56193645` and by grep, not read line by line. The scan reports name them.
