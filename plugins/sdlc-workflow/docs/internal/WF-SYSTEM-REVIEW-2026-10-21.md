# WF-SYSTEM-REVIEW-2026-10-21 — improvement avenues across brainstorm, ideate, campaign, yolo, and the stages

Status **BUILT, not released** (2026-10-21): A1–A4, B1–B7, C1–C6, D1–D3, D5, D6, E1, E3, E4 are in the working tree, CHANGELOG `[Unreleased]`. Deviations: E1 writes `_shared.js` into each driver at build time (`scripts/build-drivers.mjs`), not at staging, so the drivers on disk stay complete; E4 keeps `plan-index-writeback` (it writes the durable `reconcile-pending` marker that a resume needs) and the wave driver's write-back (it runs `slice-done`). SQ1–SQ6 answered by the PO 2026-10-21 (section 10). Dropped by the answers: D4 (tranches) and E2 (release train). Changed by the answers: C1 (Opus stays, the model becomes configurable) and B2/B4 (no appetite default). · Date **2026-10-21** · Plugin **v9.195.0** · Owner **jayte**
Companions: [WF-CAMPAIGN-SLICE-ORDER-PLAN.md](WF-CAMPAIGN-SLICE-ORDER-PLAN.md) (waits between slices) and [WF-CAMPAIGN-THROUGHPUT-PLAN.md](WF-CAMPAIGN-THROUGHPUT-PLAN.md) (unit order, waves, slots, the wave slicer). This review looks at the whole system and leaves those two topics to them. Origin: the PO, 2026-10-21: "what other avenues for improvement exist, zoom out".

## 1. Method

Four read-only surveys ran over the real data on this machine:

| Survey | Sources |
|---|---|
| Front end | The brainstorm, ideate, and campaign folders of SoccerManager, Lantern, Secbot, and Trails |
| Lifecycle and drivers | 51 driver journals in 10 projects (173 runs, 1,465 agent starts after de-duplication), the drivers, the tests, and the git history |
| Cost | 62 `cost.jsonl` files, and 4,499 sub-agent transcripts joined to their labels |
| The person | 4 campaign journals and 90 session transcripts (1,816 `AskUserQuestion` calls) |

I checked these claims again myself:
- the cost ledger inflation (A1);
- the model of the stage agents (C1);
- that shape does not read the packet (B1);
- the review-scope default (B2).

The other numbers come from the surveys. They are marked "survey" where a decision depends on them. SoccerManager holds most of the data: 110 of 173 runs and 66 % of the cost.

## 2. Where the cost is

| Resource | Size | Main sinks |
|---|---|---|
| **The person's time** | 4,432 questions in 1,816 calls; 299 wait hours; only 669 typed messages | Brainstorm and ideate ask 61 % of the questions. Preparing one unit asks 40–55 questions before any code runs. 44 calls of over 60 min hold 53 % of the wait hours |
| **Agent time** | 623 agent-hours | Implement 54 %, verify 29 %, plan 10 %, review 5 %. 15 % of stage agents hard-stop; implement hard-stops 20 % of the time. 4 slices take 91 h (15 %) |
| **Tokens** (survey proxy W: input + 1.25 × cache write + 0.1 × cache read + 5 × output) | about 4,830 M W | Cache read is about 60 % and cache write about 37 %. Opus carries about 80 % of sub-agent W. Implement is about 40 %. Re-runs of the same stage and slice are about 14 % |
| **Calendar** | SoccerManager: 7 of 64 units shipped in 29 days | Gaps of 3 h or more with no event: SoccerManager 287 h of a 364 h journal span, and Secbot 342 h of 346 h. Prepared units idle for up to 10 days. Each wave boundary waits 8–17 h for the person |
| **Upkeep** | 62 releases in 30 days, 10 on one day | About 750 hand-synced lines between the two drivers. 300,670 reference words. A slice re-reads about 37,000 words |

## 3. Theme A — the measurements are wrong (fix first)

Every later avenue needs numbers that the system records wrong today.

| # | Problem | Evidence | Proposal |
|---|---|---|---|
| A1 | **The cost ledger counts each sub-agent again on every turn** | Checked: `realism-team-shape-recorded-match-gaps/cost.jsonl` (38 MB, 1,069 rows) has 226,520 sub-agent entries for 821 agents. One agent has usage in 438 rows. The rows sum to 1,226.7 G cache-read tokens, and the highest value for each agent sums to 5.08 G, so the ledger is at least 240 times too high. It starts at 2026-10-14T07:20Z (session `29b05b7e`, row 635). Inference: the per-agent offsets in the cursor (`lib/cost-ledger.mjs:438`) were lost, so every Stop reads each agent file from byte 0 | Make the write idempotent: key each sub-agent on `agent_id` and write only the change from its last total. Add `label`, `stage`, `slice`, start, and end to each sub-agent entry. Rebuild the inflated files from the transcripts (SQ4). `/wf status`, `aggregateCost`, and `forecastHistory` read these rows today |
| A2 | **The forecast never learns** | `forecast-actual` is `null` for waves 2 and 3, because the actuals are recorded only when `--minutes` and `--tokens` are passed. Wave 3: forecast 2,231 min and 225 M tokens; actual about 16,300 min and about 9.8 G tokens (survey) | `wave <n> record` writes the actuals from the journal and the fixed ledger. The forecast uses output tokens or W for each stage, not raw tokens, which cache reads dominate |
| A3 | **A stop has no reason** | The `agent-end` line has `status` and `errors`, with no reason (`campaign-wave.js:146`). 118 hard-stops have no recorded cause. 106 of 173 runs have no run-end line (survey) | Add `reason`, `hardStopReason`, and `routeBack` to `agent-end`. Write `run-end` from a final step that always runs |
| A4 | **Some journal lines do not parse** | 4 `refuter` lines in 3 Windows journals hold unescaped backslashes (survey) | Write every journal line through `JSON.stringify`, never by hand-built text in a prompt |

## 4. Theme B — the person's time

| # | Problem | Evidence | Proposal | Gain (estimate) |
|---|---|---|---|---|
| B1 | **Shape and intake ask again what the packet decided** | Checked: `shape.md` has no rule that reads the packet (its three hits for "carried" mean other things). It has a flat floor of 20 questions. Survey: shape asks 8–44 questions on a decided packet, and intake asks scope again (`realism-harness-core-measuring-realism/po-answers.md:20,26`) | Seed the shape's Ambiguity Inventory from the packet's decisions, findings, tensions, and open questions. The floor applies only to items that the packet does not cover. Intake does not ask scope for a packet unit | 15–20 fewer questions for each unit; about 800–1,000 for SoccerManager's 52 planned units |
| B2 | **Defaults that the person overrides every time** | Checked: `slice.md:97` recommends `Per slice` for every roster with more than one slice. Survey: the person picked `Slug-wide` 10 times of 13. Appetite was `Large` 11 times of 13. 94 confirm-type questions (charter, stack, scope) were mostly "confirm" | Standing defaults for each campaign (SQ2): one review for each unit (also TQ5), "accept and carry" for fidelity narrowing, and the ship choices that the person picks 80 % of the time or more (plan drift, window, pre-push, merge method, announce, dry-run). Appetite stays a question. One confirm-or-edit digest for each wave shows the defaults | About 20 questions for each unit |
| B3 | **A decided question is asked again** | Survey: Lantern's verify asked the start-hook decision 3 times (about 2.5 h of a one-unit wave); Secbot asked one question twice, and the second ask waited 399 min; Trails' "run them and remember" was picked 3 times; SoccerManager asked one brainstorm question 8 times in an afternoon. `_question-craft.md` has no rule against a re-ask | Before a question, look up the earlier answers (`po-answers.md`, ledger questions, `decided`, steer). When an earlier answer covers it, use that answer and say so | Hours on the critical path |
| B4 | **Questions that a standing rule can answer** | Survey: fidelity (F3) narrowing was accepted 9 times of 9, and each held a wave for 1 h or more. Ship-family questions (237) took the recommendation 80 % of the time or more | A standing policy for each kind, which the person sets once and can change. A question that follows the policy becomes a line in a digest | About 1 h per wave, and about 60 questions per 4 campaigns |
| B5 | **Away mode is typed again each night** | Survey: "going to bed… pick the best" typed 6 times; 1 `decided` event recorded; 24 calls over 2 h hold 133 h | A persistent away state with a default for each question kind, and a digest of what it decided when the person returns. A question that the default cannot answer waits, and the other units go on | Up to about 100 h of wall clock |
| B6 | **Brainstorm closing questions repeat** | Survey: "Next", "Check-in", "Top risk", "Core", and "First version" total about 320 questions. "Top risk" was answered "[No preference]" 16 times of 50. Brainstorm questions mostly carry no recommendation | Close an area with one digest and a recommendation for each item. Ask "Top risk" only when the board holds a risk with no owner | About 200–250 questions |
| B7 | **The person polls for status** | Survey: about 10 typed status questions and 13 `/wf status` runs; "Are you monitoring the campaign?" | One surface that answers "what runs, what waits for me, what comes next", kept current by the watch | Trust and less polling |

## 5. Theme C — implement reliability and cost

| # | Problem | Evidence | Proposal | Gain (estimate) |
|---|---|---|---|---|
| C1 | **Every stage runs on Opus** | Checked: `runStage` passes `...OPUS` for each stage (`campaign-wave.js:1064`). The A/B of 2026-10-16 passed Sonnet on implement (8 of 8 verify passes, −45 % cost, Opus preferred in 50 % of pairs) and was never wired in | **SQ1: Opus stays the default.** The model of each stage becomes configurable in both drivers: a `models` block in `.ai/sdlc-config.json` (for example `{ "implement": "sonnet" }`), read at launch and passed in the driver args. With no block, every stage runs on Opus as today | Up to about 13 % of all tokens for a project that chooses Sonnet for implement |
| C2 | **A hard-stopped implement starts again from nothing** | Survey: 23 of 43 implement ends in `realism-team-shape-recorded-match-gaps` were hard-stops. `out-of-possession-primitives` had 9 before it completed. Re-runs of implement are 31 % of implement tokens. The 22 slices implemented more than once hold 39 % of slice tokens | The implement commits after each plan step and records the step. A restart resumes after the last committed step. After 2 hard-stops on one slice, the driver parks it with a "split this slice" question instead of a third run. A3 gives the reason | Half of the 8 % repeat-implement cost; the 91 h tail of 4 slices |
| C3 | **Long implement agents carry a huge context** | Survey: implement averages 256,000 tokens of context for each call (p90 300,000) over about 167 calls. One run wrote 37.7 M cache tokens | A fresh implement agent for each group of plan steps, with a short hand-over note. This is also the resume point of C2 | 5–7 % of tokens (uncertain) |
| C4 | **Tests run three times** | The implement, verify, and wave-verify agents each run the suite. Verify is 29 % of agent-hours, with 19 waits on the shared test lock (survey) | Implement writes a pass receipt for its final commit and its command list. Verify reuses a receipt for the same commit and the same commands, and runs only the checks that the receipt does not cover | 20–30 % of verify time |
| C5 | **Five checks ask whether the build kept the intent** | Charter checkpoint, the intent-fidelity rubric, the contract scout (at unit and at wave review), wave fidelity, and as-built notes. 63 of 113 checkpoints returned `at-risk` and 11 returned `honored` (survey: a noisy signal) | Keep one check for each level: the unit review for the unit, and the wave fidelity for the wave. Run the charter checkpoint only when a slice changes a charter file | Fewer false alarms and parks |
| C6 | **Refuters cold-start one at a time** | Survey: 1,780 refute agents, each paying about 37,000 tokens of cache write | One refuter for up to 4 findings | About 2 % of tokens |

## 6. Theme D — front-end artifacts and scale

| # | Problem | Evidence | Proposal |
|---|---|---|---|
| D1 | **The brainstorm grows without a limit** | Survey: SoccerManager's `01-brainstorm.md` is 1.0 MB and its board 2.5 MB. A resume reads about 870,000 tokens. 79 % of the board item texts repeat in the document. `## The Brainstorm`, meant as "a few plain sentences", is 10,184 words. `history/` is 88 MB | Keep the person's document short: the brief, the areas, and links. Archive closed areas and shipped pieces to files that a session reads only on demand. Cap `## The Brainstorm` |
| D2 | **Packets are copied when nothing changed** | Survey: 210 of 285 history copies differ only in `revision` and `generated-at`. `changes.md` holds 285 "Started, not rewritten" lines | Write a packet and its history copy only when its content hash changes |
| D3 | **Findings and tensions do not reach the unit** | Survey: Lantern has 25 findings and 11 tensions on the board, and 0 in the packets. A packet says "What we found: None" | Carry each finding, tension, and assumption that touches a piece's decisions into its packet. `work-packets.mjs check` warns about a piece with decisions and no findings |
| D4 | **One brainstorm feeds a campaign of 85 packets and 34 waves** | Survey: 13 reopenings, 22 replans, 424 graph changes. 42 of 85 packets are over the split threshold of 25 decisions. Reopening revision 9 made two prepared units go back to planned | **Dropped (SQ3: no).** One brainstorm keeps feeding one campaign of any size. D2, D6, and the throughput plan's unit-graph fix (T1) reduce the churn instead |
| D5 | **Ideate's carried decisions are ceremony** | Survey: Trails carried the same sentence as 46 of 47 decisions. 1,489 of 1,976 SoccerManager carried decisions have no session or date | Ideate carries the pick once for the workflow, and each idea's evidence as a finding. Every carried decision gets its session and date |
| D6 | **Prepared units go stale while they wait** | Survey: SoccerManager wave 4 units were prepared 10 days before they ran. Secbot `lead-orchestrator` waited 10 days. A reopening invalidated two prepared units | Prepare only what can start within one slot cycle. Record `prepared-at-revision`, and on a reopening ask again only the changed decisions |

## 7. Theme E — upkeep of the plugin

| # | Problem | Evidence | Proposal |
|---|---|---|---|
| E1 | **Two drivers kept equal by hand** | Survey: 24 helpers copied word for word (376 lines) and 12 same-named functions that diverged (379 lines or more). The parity test finds only the 24 | Build both scripts from one shared source at staging (`stage-yolo-driver.mjs` concatenates `_shared.js`). The parity test then has nothing to check |
| E2 | **Release churn** | Survey: 62 releases in 30 days, 10 on 2026-10-20. Each release stamps 5 version carriers, rebuilds `dist/`, syncs Codex, and upgrades the hub. Live runs keep an older staged driver, so a fix and a run often disagree (hot-patch records) | **Dropped (SQ5: keep as today).** Releases follow each change |
| E3 | **Each stage re-reads a large reference** | Survey: about 37,000 words for each slice; stage bodies are 10–19 times their word target; the 2,200-word preamble goes to every stage agent | Move the deferral and runtime-evidence sections of `verify.md` and `review/_stage.md` into files that load only when a deferral exists. Give the preamble once in the agent prompt, not as files to read |
| E4 | **Many bookkeeping agents** | Survey: 47 % of agent starts and about 1–2 % of cost. 78 of 93 read-check agents found no ledger | Fold the read check into orient or unit end, and the write-back into the stage agent's last step. This is a simplicity gain, not a speed gain |

## 8. What is not worth the effort

- Cheaper bookkeeping agents: they are about 2 % of tokens and 1 % of agent-hours.
- Cheaper watch, look-in, and commentary: about 0.2 % of tokens.
- Batching questions 4 to a call: about 7 h in total (survey).
- Brainstorm token cost: 5–14 % of tokens, mostly main-session. Its larger cost is the person's time (B6) and the artifact size (D1).

## 9. Order of work

| Step | Content | Why first |
|---|---|---|
| 1 | A1–A4 | Every later gain is measured with them |
| 2 | C1, B2, B3 | Small changes: one model line, defaults, a lookup before a question |
| 3 | B1, B4, B5 | The largest saving of the person's time |
| 4 | C2, C3, C4 | The largest saving of agent time and tokens. A3 shows which stops C2 must handle |
| 5 | D1–D3, D5, D6 | The front end, before the next large brainstorm |
| 6 | E1 (after the slice-order release), E3, E4, C5, C6 | Upkeep and simplicity |

The two companion plans run in parallel with steps 1–3. Their P0 (the slice-order release) and step 1 here touch different files.

## 10. Questions

| # | Question | Recommendation |
|---|---|---|
| SQ1 | Does implement move to Sonnet 5.5 in both drivers, with Opus as the retry model after a hard-stop? | **Answer: keep Opus, make it configurable.** The model of each stage is set in the project config; the default stays Opus (C1) |
| SQ2 | Which standing defaults does a campaign get: review scope slug-wide, appetite Large, F3 narrowing "accept and carry", and the ship choices that the person picks 80 % of the time or more? | **Answer: review scope, F3 "accept and carry", and the usual ship choices.** Appetite stays a question (B2) |
| SQ3 | Does a brainstorm with more than about 20 pieces split into tranches at `done`? | **Answer: no.** D4 is dropped |
| SQ4 | May the fix of A1 rebuild the inflated `cost.jsonl` files in the project repos from the transcripts? | **Answer: yes.** Each old file is kept as `.bak` until the person deletes it |
| SQ5 | Is a release train of at most one release a day acceptable? | **Answer: keep releases as today.** E2 is dropped |
| SQ6 | Are the two drivers built from one shared source? | **Answer: yes, after the slice-order release** (E1) |
