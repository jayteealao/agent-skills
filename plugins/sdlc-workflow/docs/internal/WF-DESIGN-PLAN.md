# WF-DESIGN-PLAN — the design joins and the impeccable v4.7 re-port

Status **BUILT, NOT COMMITTED (2026-10-22). Releases A, B, C, D and E are built in the working tree as one change, with the CHANGELOG under [Unreleased]. Not done here: the Part II section 6 Lantern steps (another repository) and the Part III W10 live runs. Every question is answered: DQ1–DQ6, BQ1–BQ4, Q1–Q8, and MQ1–MQ3 (section 7, the PO took each recommendation).** · Date **2026-10-22** · Base **v9.198.0** (`43777ca0`) · Owner **jayte**

This file merges three documents. Their full text is in Parts I–III. Each part keeps its own section numbers, so "section 5" or "3.4" inside a part means that part's section.

| Part | Source | Date | What it is |
|---|---|---|---|
| I | WF-DESIGN-PROCESS-REVIEW-LANTERN-2026-10-21.md | 2026-10-21 | The Lantern transcript review: findings DP1–DP15. |
| II | WF-DESIGN-PROCESS-FIX-PLAN.md | 2026-10-21 | The fix plan for DP1–DP15: Release A (prose and design tools) and Release B (drivers and the campaign CLI). |
| III | WF-DESIGN-IMPECCABLE-V4-PLAN.md | 2026-10-20 | The re-port of impeccable v4.7.0: the craft floor, the 15 moves, critique and audit, directions, modes, templates (waves W0–W10). |

## 1. Why one plan

Both plans change the `/wf design` lane, and they edit the same files: `design/stage.md`, `design/_boards.md`, `design/_platforms.md`, `design/shape.md`, `design/setup.md`, `design/record.md`, `design.md`, `intake/brainstorm/_design.md`, and `shape.md`. Built apart, each plan's line anchors go stale under the other. Built from one order, each file is edited once per release. v9.198.0 (the sub-procedure audit) also moved several anchors of both plans (section 4).

## 2. Decisions

All decisions are answered. The IDs are renamed so the two plans do not collide: the process decisions are **P1–P6**, and the impeccable decisions are **I1–I15**. Parts II and III use the new IDs.

| ID | Was | Decision |
|---|---|---|
| P1 | fix D1 (DQ1) | The design stage shows carried decisions as one read-only summary. It asks only about items on a drawn surface, items that shape narrowed, and every contradiction. |
| P2 | fix D2 (DQ2) | A review finding against a confirmed board or the `02c-craft.md` contract is never fixed or dismissed by a driver. The driver asks the person at once: amend, keep, or defer. |
| P3 | fix D3 (DQ3) | The sketches go into git, and the tracked file is the only source. A canvas is a published view of the file (A5b). |
| P4 | fix D4 (DQ4) | The brainstorm proposes one `design-direction` piece; the campaign has the person run `/wf design setup` before wave 1 when the board has `focus: design`. |
| P5 | fix D5 (DQ5) | Terminal design rules and a terminal capture with colour. |
| P6 | fix D6 (DQ6) | `disable-model-invocation` stays. Every reply writes the next stage as "Type `/wf …`". |
| I1–I7 | impeccable D1–D7 | The craft floor is text only; it loads after the direction is settled; the DESIGN-CRAFT-PORT-PLAN decisions stand; the moves get the ported text; engine-only features stay out; one credit line per ported file; ported text is rewritten in STE. |
| I8–I15 | impeccable D8–D15 (Q1–Q8) | Four modes per surface; critique adds Nielsen, cognitive load and personas; the `#000`/`#fff` ban goes; a kicker label is always refused; warmth on an error, no jokes; body measure 65–75; `runtime-adapters/web.md` grades web vitals; new PRODUCT.md and DESIGN.md sections. |

BQ1 ("build nothing until the slice-order release is on `origin/master`") is met: slice order shipped in v9.196.0.

## 3. Release order

| Release | Content | Why here |
|---|---|---|
| **W0** (read only) | Re-check every anchor of Parts II and III at HEAD, with section 4 as the start. Measure the word budgets again (Part II C2 and Part III 6.3 are stale). Check each new `_platforms.md` form against platform documentation. | Every later release cites line numbers. |
| **A** | Part II Release A: A1–A11. | Lantern wave 2 waits for A1 (Part II section 6). A touches no driver. |
| **B** | Part II Release B: B1–B4. | Driver and campaign CLI changes; independent of the floor. |
| **C** | Part III W1 (the craft floor) and W2 (defect fixes). | Every later move wave cites `_craft-floor.md`. |
| **D** | Part III W3–W6: the move ports, `_platforms.md` rows, clarify, critique and audit, directions and the contract. | W3 and W4 touch different files and can run in parallel. |
| **E** | Part III W7–W8: register to modes, and the PRODUCT.md and DESIGN.md templates. | Last: it rewrites the `## Register` section of every move once, after its content is settled. It changes the runtime schema. |
| **Live** | Part II section 6 (Lantern) after A and B. Part III W10 after E. | |

Each release carries its own doc-site pages and CHANGELOG entry (Part III W9 is split across C, D and E).

## 4. Where the plans meet v9.198.0 and each other

**M1. Web vitals (I14 against the shipped F1).** I14 (PO, 2026-10-20) makes `runtime-adapters/web.md:71` the measuring source: INP above 200 ms is HIGH; LCP above 2,500 ms and CLS above 0.1 are WARN. v9.198.0 (F1) made review grade all three HIGH, to match `verify/_artifact.md:122`, before I14 was built. Release C applies I14 to both files: `verify/_artifact.md:122` and `review/_stage.md` (the "Web vitals (frontmatter)" bullet, about line 84). Review has no WARN severity, so a WARN becomes MED in review (MQ3).

**M2. The name `modes:` is taken.** Since v9.198.0, `modes:` in a stage artifact's frontmatter is the list of read-check modes the writer ran under (`_requires.md` "Modes", `hooks/mod/readledger.ts` `declaredModesOf`). Part III 9.1 step 2 puts a `modes:` map keyed by surface into `02c-craft.md`. Two meanings for one key break the read check's parse and the one-term rule. Release E names the design field `surface-modes:`, and the prose says "design mode" (MQ2).

**M3. Anchors that v9.198.0 moved.** W0 starts from this table.

| Plan text cites | Now |
|---|---|
| `_design-context.md` lines 22–37, 39–51, 59–78, 80–83, 85–89, 91–100, 132 | Sections "Register", "Shared design laws", "Absolute bans". Context gathering, the image gate, preflight and the mutation types moved to `design/_preflight.md`. |
| Requires rows for `_design-context.md` | Sections cells: `plan.md` (Register; Shared design laws; Absolute bans), `implement.md` (the same), `slice.md` (Register; Absolute bans), `design.md` audit and critique rows (Absolute bans). Release C moves "Absolute bans" to `_craft-floor.md` and changes each cell. Release E renames "Register" and changes each cell again. |
| `review/_context.md:18`, `review/_select.md:21-22` | `review/_context.md` is folded into `review/_stage.md` ("Augmentation and verify inputs"). `review/_select.md` is a `mode:select` row. |
| `verify/_sub-agents.md:95` | Sub-agent 3 is in `verify/_runtime-evidence.md`; sub-agent 4 is in `verify/_augmentation.md` (`mode:augment`). The design-consumer paragraph is in `verify/_runtime-evidence.md`; the board comparison is in `verify/_augmentation.md`. |
| `design/_commands.md` | Deleted. Part III 6.1 and W4 drop their `_commands.md` rows. |
| `design/_output.md` Steps 5 and 6 | Headings "Registration and the transformation artifact" and "Final-summary rules". |
| `campaign/_phases.md:89-92` (Rolling prepare) | `campaign/_prepare.md` steps 3 and 4. DP10 is still open there: slice runs before the design lane. |
| `campaign/_phases.md` Phase 1 Setup | Still in `campaign/_phases.md`. |
| `campaign/_waves.md:105-112` | Local records are in `campaign/_records.md`. |
| `campaign.md` Steering | Unchanged. |
| `_host-invocation.md` (80 lines) | A 736-word core; per-stage host rows are in `_host-surfaces.md`. |
| `_chat-return.md` | The liveness rules moved to `_liveness.md`. |
| `implement.md:130` (the design-floor paragraph) | `implement.md:131`. |
| Part II C1 (slice-order files in flight) | Resolved: shipped in v9.196.0. |

**M4. Files both plans edit.** Edit each file in release order. Re-read it before each release.

| File | Release A/B (Part II) | Releases C–E (Part III) |
|---|---|---|
| `design/stage.md` | A1 viewports (Step 4.1), A3 Next lines, A8 terminal worst-case board, A9 write-back at freeze | C: floor load at Step 4, `:46` wording, Move pass; D: Step 3b directions (DIR-1–6); E: mode files |
| `design/_platforms.md` | A8 "Terminal" section | D: C16 rows and the "Idioms" table |
| `design/_boards.md` | A1 viewports, A5 tracking, A5b comments and republish, A8 terminal capture | — |
| `design/shape.md` | A1 `viewports:`, A2 carried sketches | E: the aesthetic questions move here from setup (I15) |
| `design/setup.md` | A9 token roles under `## Colors` | E: the eight DESIGN.md headings, which include "Colors" |
| `design/record.md` | A9 write-back note | C: "Floor guard" section |
| `design.md` | A3 Next | C: `_craft-floor.md` rows and load sentences |
| `intake/brainstorm/_design.md` | A5b import at the door, A6 references and direction piece | C: "Do not load `design/_craft-floor.md`" |
| `shape.md:102` | A2 one clause points to `design/shape.md` | E: the mode question replaces the register question |
| `_gate-question.md` | A10 interrupted question | — (v9.198.0 already added the intent-bearing STOP to rung 3) |

**M5. A9 and I15 agree.** A9 writes the settled token roles into DESIGN.md `## Colors`; I15 adopts eight DESIGN.md headings, one of which is "Colors". Release A writes under the current `## Colors`. Release E keeps that section name.

## 5. Constraints

- **Prose budgets.** Part II C2 and Part III 6.3 were measured before v9.198.0. W0 measures again with `node scripts/measure-load.mjs` and `node scripts/verify-prose-budget.mjs`.
- **The read check.** Since v9.198.0 the mod checks a `mode:<name>` row when the mode applies. A new `_craft-floor.md` row with `mode:ui` in `implement.md` applies only when the writer lists `ui` in `modes:` (no disk fact proves `ui`). Release C states that in `implement.md`.
- **Pinned text and the capability inventory.** Part II C3 and C4, and Part III 6.4, still hold. Re-check the pinned lines in W0.
- **Build.** A change to `lib/`, `scripts/` or `renderers/` rebuilds `dist/` in the same commit.
- **Several sessions edit this tree.** Stage by path; never `git add -A`.

## 6. Verification

Part II section 7 and Part III section 12 hold. Add: after Release C, `grep` finds no Sections cell that names "Absolute bans" outside rows for `_craft-floor.md`; after Release E, no frontmatter key `modes:` in `02c-craft.md`.

## 7. Merge questions (answered)

| # | Question | Options | Recommendation | Answer (2026-10-22) |
|---|---|---|---|---|
| MQ1 | Release order? | (a) A, B, C, D, E (section 3). (b) C first (the floor), then A, B, D, E. | (a): Lantern wave 2 waits for A1, and A and C touch different sections of the shared files. | (a) |
| MQ2 | Name of the per-surface design-mode field in `02c-craft.md`? | (a) `surface-modes:`. (b) keep `modes:` and rename the read-check key. | (a): the read-check key shipped in v9.198.0 and is read by the mod. | (a) `surface-modes:` |
| MQ3 | How does review grade an LCP or CLS breach once I14 is built? | (a) MED. (b) LOW. (c) keep HIGH in review only. | (a): WARN is the middle grade in verify, and review has no WARN.  (a) MED |

## Part I — The Lantern design process review (2026-10-21)

Source file: `WF-DESIGN-PROCESS-REVIEW-LANTERN-2026-10-21.md` (merged here on 2026-10-22). Decision IDs are renamed per section 2.

**Date:** 2026-10-21. **Plugin:** the sessions ran on v9.190.0 – v9.194.x. Every finding below was checked against v9.195.0 and is still open.
**Status:** analysis only. Nothing is built. DQ1–DQ6 answered 2026-10-21 (section 7). All six took the recommendation; DQ1 adds "ask every contradiction", and DQ3 tracks sketches (the person reports the outlook canvases now open).

### 1. Method

The Lantern design path is in one Claude Code session (`a514ffc7`, 43 MB, 2026-10-18 21:32 → live on 10-21). The artifact-access session `7c6e9f57` is a second source. Three sub-agents each read one time window, the project artifacts and the plugin files. I checked each high finding against the current plugin code.

| Window | Time | What ran |
|---|---|---|
| Ideate | 10-18 21:32 → 10-19 11:06 | `/wf intake ideate`, rerouted to a general brainstorm (empty repo). 95 questions, 1 sub-agent. |
| Brainstorm design | 10-19 11:23 → 18:31 | `/wf intake brainstorm <slug> design`. 70 design questions + 20 scope questions, 12 sketch files (43 sketch keys), 9 packets, 2 compactions. |
| Wave 1 design | 10-19 21:09 → 21:54 | `lantern-session-feed` (terminal installer). Design setup, carried walk, boards, 25 min board review. |
| Wave 1 review → retro | 10-20 → 10-21 14:25 | Driver review dismissed 3 design findings. Retro asked 4 direction questions. |
| Wave 2 design | 10-21 16:12 → live | `lantern-app-home` intake, shape. `/wf design lantern-app-home` started at 18:26:20 and stopped at 18:26:42, before Step 0 read the project. No design question has run. |

### 2. Summary

The design flow works from the stage onward. Each board reached slice, plan, implement and verify, and design-audit found real defects. The faults are at the joins:
- the same carried decisions are asked three times;
- the drivers dismiss a finding against a confirmed design instead of asking the person;
- design artifacts are reachable only on one disk and partly only in one claude.ai account;
- the person must find the next command at each stage change.

The brainstorm design focus also sketched before the person's references arrived, and it made no project-wide look piece. Wave 1 then ran design setup inside its first unit, on a terminal surface the plugin has almost no craft for.

### 3. Findings

Severity: H = high, M = medium, L = low. "Owner" is the plugin file that owns the behavior.

#### 3.1 Across the whole path

**DP1 (H). Carried decisions are asked three times.**
- Intake confirms all carried decisions in groups of 8 (`po-answers.md:5-15`, "Keep all 8" three times, wave 2).
- Shape narrows some of them (wave 2 Round 3, Q10–Q12).
- The design stage walks each one again: keep, change or drop, 4 per batch (`design/_carried.md:26-33`). This contradicts `_carried.md:24` ("do not ask its question again").
- Wave 1 observed: 4 items asked again at 21:19. All 4 were feed-data rules for later waves, not about the terminal surface being drawn.
- Wave 2 projected: about 6 batches for 24 items. In addition, `design/stage.md:61` asks about viewports again ("Phone and foldable" is already in `po-answers.md:169-171`).
- In the brainstorm itself, 22 of 70 design questions were "carry it forward" approvals, not choices.
- Owner: `design/_carried.md` Step 1b, `design/stage.md` Step 4.1.
- Fix: Step 1b presents the carried items as one read-only summary. It asks only about items that touch the surfaces in `02b-design.md`, items narrowed since intake, and items that a sketch contradicts. Step 4.1 takes the viewports from the shape answers.

**DP2 (H). The drivers dismiss a design finding instead of asking the person.**
- `07-review-design-audit.md` (wave 1): T2 and T3 (MED, light-theme contrast) and T11 are `dismissed`; T12 is deferred. Each outcome says "A change needs the person to amend the design" (lines 84, 95, 106, 139).
- The person first saw them in the retro, 21 hours later and after ship. They became retro direction questions 2 and 3.
- The rule exists: `design/_lane.md:71` routes a finding against a confirmed board to `/wf design <slug> amend`.
- The review override in `workflows/campaign-wave.js:482-492` and `workflows/yolo.js:444-454` knows only fix, defer and false-positive dismiss.
- Owner: both drivers' `review` override.
- Fix: add a case for a finding against a confirmed board. Keep the finding open as `needs-amend`. Ask it through the driver's question path, or show it at handoff. Never mark it dismissed.

**DP3 (H). Design artifacts are not durable or reachable.**
- The Lantern `.gitignore` (lines 10-15, from `lib/design-boards.mjs:295-297`) tracks only `design/r*/`. Brainstorm sketches, `references/` (the mood boards) and packets are only on this disk.
- 10 of 14 claude.ai canvases return "artifact not found" (session `7c6e9f57`, 14:32 and 15:19). They belong to jayteealao@outlook.com, and the invitations sent no email. All 4 canvases that `lantern-app-home/02b-design.md:106-111` links are in the failing set.
- The first search for the links found none, because Grep skips ignored files.
- Local copies exist and are byte-identical, so the design stage can still work in the main checkout.
- Owner: `lib/design-boards.mjs` (track), `design/_carried.md`, `intake/brainstorm/_design.md`.
- Fix:
  1. `design-boards.mjs track` also tracks `design/sketches/` with `state: carried` and the brainstorm's `references/`.
  2. Each canvas link records its owning account.
  3. `_carried.md` tests each link with an Artifact read and leads with the local path when the link fails.

**DP4 (H). The person must find the next command at each stage change.**
- The `/wf` skill has `disable-model-invocation: true` (`SKILL.md:4`). The model cannot run the next stage.
- At 18:16 shape offered "Start the design: I run `/wf design lantern-app-home`". The wrap-up button was dropped because its message started with "/". The person typed "start the design", the Skill call was refused, and the person typed the command.
- Intake and shape had run from plain words earlier only because the skill body was still in context. The 18:08 compaction removed it.
- `campaign/_phases.md:89-92` tells the model to "Run `/wf intake`" and "Run `/wf shape`".
- No design or shape file names a campaign command. The person asked "What's the campaign command" (10-21 16:11) and "whats the handoff slug" (10-20 22:46).
- Owner: `shape.md` (closing route), `design/stage.md:122`, `_chat-return.md`, `campaign/_phases.md`, `_host-invocation.md`.
- Fix: when the next step is a `/wf` key, write "Type `/wf design <slug>`", never "I run". When `00-index.md` has `origin-packet` and a campaign ledger exists, each stage's `Next:` names the exact campaign step (`/wf slice`, then `campaign.mjs unit <key> prepared`, then `/wf campaign <board>`).

#### 3.2 Brainstorm design focus

**DP5 (H). It sketched before the promised references arrived.**
- 11:31: the person answered "Warm light, I'll provide design inspiration images". The agent still drew plain wireframes (`home-layouts.html`, 12:42).
- 12:43: the person rejected them as bland and sent references (F05, F06). The later sketches from those references were accepted.
- `intake/brainstorm/_design.md` does not mention references or mood boards.
- Fix: when the design record is empty, the first batch asks for references. When the person promises references, sketch nothing until they arrive. A sketch names the reference it starts from.

**DP6 (M). Sketch links were missing from the brainstorm document and page.**
- The person asked at 18:21 whether the design pages were linked. The agent's own check found the packets linked, but not `01-brainstorm.md`, not the page, and one sketch still in state `idea`.
- The page is built by a throwaway scratchpad script (`build-page.js`). No plugin code renders `brainstorm-page.html`. The page also lost the session stories until 11:05.
- Owner: `intake/brainstorm/_artifact.md` (no `## Sketches` section), `intake/brainstorm.md` step 2.9, `lib/work-packets.mjs` check.
- Fix: add `## Sketches` to the template and to step 2.9. Ship one page renderer. Make `work-packets.mjs check` fail on a sketch still `idea` or a carried sketch in no packet.

**DP7 (M). No project-wide look piece.**
- The look (warm light, grey-to-butter, charcoal card, widget same look) was copied into 6–7 packets. No `design-direction` piece was offered, although `_design.md:36` defines one.
- `DESIGN.md` came later from a separate setup, and wave 1 ran design setup inside its first unit (DP12).
- Fix: when kept design items span more than one piece, propose one `design-direction` piece first, and let the feature pieces point to it.

**DP8 (M). One sketch file holds several sketch keys.**
- 43 keys in 12 files. The copy step made three byte-identical files (`glow-first-launch.html`, `glow-quiet-home.html`, `glow-error-panels.html`).
- Owner: `_design.md:24` (one file per key) and `design/_carried.md:20` (copy by key).
- Fix: allow `path#artboard` and keep the anchor when the file is copied.

**DP9 (L). Smaller faults.**
- Every decision in a session has the same `decided-at` (87 at 21:35:52, 50 at 11:25:11). Owner: `_artifact.md`, `_timestamp.md`.
- An interrupted question ("outcome unknown", 17:55) was not asked again. The person typed "askagain". Owner: `_gate-question.md`; it has no rule for an interrupted result.
- `ideate` on an empty repo has no rule; the agent made up the switch to brainstorm. Owner: `intake/ideate.md` Step 0.
- The first research note was about hooks although the prompt preferred Claude mods. The person corrected it at 21:48.

#### 3.3 Campaign design stage

**DP10 (M). The campaign prepare order puts slice before design.**
- `campaign/_phases.md:91-92`: step 3 slice, step 4 design lane. `design/_lane.md` and `design/stage.md:9` put design between shape and slice. The session followed the lane. The campaign repeated the wrong order to the person at 16:14.
- Fix: swap steps 3 and 4.

**DP11 (M). The plugin has almost no terminal craft, and the person approved boards with the defects.**
- Three of the four retro direction questions trace to boards the person approved:
  - "3 changes made, 1 skipped" after a skip (`02c-craft.md:62`) → "prove the path".
  - ANSI 33 questions on a light board drawn with a hand-picked dark amber, not a real terminal scheme (`02c-craft.md:95,109`) → "contrast first".
  - Paths printed with `~` (`02c-craft.md:116`) → "pasteable paths".
- No board had a height budget. Verify captured text, not colour (`06-verify-installer.md:176`).
- `design/_platforms.md:14` is the only terminal line. Worst-case boards are drawn only for new data surfaces (`stage.md:55-59`).
- Fix: add terminal rules to `_platforms.md` (named real colour schemes, contrast of ANSI yellow and bright black, an 80×24 height board, paths that paste into each target shell, a "done" line only after an end-to-end check), and a terminal capture through an ANSI-to-HTML render.

**DP12 (M). Design setup ran inside the first unit, and the design record contradicted the contract.**
- `DESIGN.md` was written at 21:11 from the phone sketches and gave the terminal "butter" roles. The contract chose ANSI 33 the same evening. Nobody wrote the settled roles back (T11, DC-14).
- `campaign/_phases.md` has no design setup step.
- Fix: campaign setup runs `/wf design setup` once when the board has `focus: design`. `design/stage.md` Step 6 writes the token roles that the contract settles back into `DESIGN.md` at freeze.

**DP13 (M). The retro wrote the design record in the wave worktree, and worktree remove overwrote main.**
- The retro wrote `.ai/design/*` in the wave 1 worktree. Sync conflicted twice (13:25, 14:19).
- At 16:17, after a `git checkout --` in the worktree, `campaign.mjs worktree remove` copied the older files over main's newer ones. The agent rebuilt them from `records/conflicts/`.
- `direction.md` and `current.md` are still uncommitted on main.
- Owner: `retro.md:74`, `campaign/_waves.md:105-112`, `scripts/campaign.mjs` worktree remove.
- Fix: under a campaign, the retro writes `.ai/design/*` in the main checkout, as the design stage does. `worktree remove` refuses to overwrite a main record that is newer than the base.

**DP14 (M). Shape did not show the carried sketches.**
- Wave 2 Round 3b Q16 ("Which states need their own board?") showed no sketch. The person wrote "there should already be designs in artifacts for each brainstorm work packet".
- Q13 (theme) asked what `direction.md:18` already decides (dark theme is wave 5).
- Owner: `design/shape.md` (line 19 says to search the carried thoughts first), `shape.md:102`.
- Fix: Round 3b lists the carried sketches with paths and drops questions the design record answers.

**DP15 (L). The retro does not route decisions to later waves.**
- The direction answers reached wave 2's `steer.md` only because the person clicked two follow-ups.
- `steer wave-3 add` wrote the loopback rule to all three wave 3 units, although only chip-bar uses it.
- Owner: `retro.md` (no campaign step), `campaign.md` steer.
- Fix: under a campaign, the retro proposes a `steer <unit>` line for each direction decision, per unit, and the person confirms.

### 4. What works and must stay

- Brainstorm references go into `references/index.md` with hash and size, and are described as findings.
- Splitting a reference into parts the person can pick led to accepted sketches.
- Every sketch has a local file, and dropped sketches are kept. `PRODUCT.md` later uses them as anti-references.
- The coherence pass found four real conflicts (dark theme, wait and fault order, two "History" names, Snooze against watch-only).
- Packets carry path, link, caption, carried decisions with reasons, and `ux-impact`.
- Question texts carry the link and caption. This is necessary over Remote Control.
- The design flowed into every later stage: slice maps surfaces, plan cites board keys, implement checks "Visual Contract Honored", verify pairs boards with captures.
- The claude.ai canvas mirror let the person review boards over Remote Control.
- The retro asked its direction questions one at a time with a recommendation, and `direction.md` quotes the answers.
- Wave 2's `02b-design.md` keeps each item's source key and a fidelity count (40 honoured, 6 narrowed, 0 dropped). Wave 2 needed no setup round.

### 5. Lantern now (project, not plugin)

- `.ai/design/direction.md` and `.ai/design/current.md` are uncommitted on main. A worktree sync can overwrite them again (DP13).
- 10 of 14 claude.ai canvases were not reachable from the gmail account at 15:19. The person reports that they open now (DQ3 answer). The local copies under `design/sketches/` stay the fallback.
- The wave 2 design stage stopped at 18:26:42 before Step 0. The cause is not verified. One second earlier the transcript shows a `bridge-session` line, which points to the host.

### 6. Order of work

1. DP2 (both drivers): a finding against a confirmed board stays open and goes to the person.
2. DP1 and DP14: stop re-asking carried decisions and viewports; show carried sketches in shape.
3. DP4 and DP10: correct next-step wording and the prepare order.
4. DP3 and DP13: track carried sketches and references; protect main records on worktree remove.
5. DP5, DP6, DP7, DP8: brainstorm design focus fixes and a page renderer.
6. DP11 and DP12: terminal craft, campaign design setup, write-back at freeze.
7. DP9 and DP15.

DP2, DP10 and DP13 touch the campaign driver and `campaign.mjs`, which the slice-order release (`WF-CAMPAIGN-SLICE-ORDER-PLAN.md`) also changes. Build them in that release or after it.

### 7. Questions

| # | Question | Options | Recommendation | Answer (2026-10-21) |
|---|---|---|---|---|
| DQ1 | At the design stage, what happens to carried decisions that intake already confirmed? | (a) one read-only summary; ask only items that touch the drawn surfaces, were narrowed, or a sketch contradicts. (b) one "keep all, or name the changes" question. (c) keep the full walk. | (a) | (a), and ask every contradiction: between two carried items, against `direction.md` or `DESIGN.md`, or against a sketch. |
| DQ2 | In yolo and campaign, where does a finding against a confirmed board go? | (a) a driver question to the person at once (amend, keep, defer). (b) stays open as `needs-amend` and shows at handoff. | (a) | (a) |
| DQ3 | How do design artifacts stay reachable? | (a) track carried sketches and `references/` in git, and record each canvas's account. (b) resolve paths against the main checkout only. | (a) | Track the sketches in git. The canvases open now. Tracking `references/` and recording the account were not named; build the sketch tracking first. |
| DQ4 | Where does the project-wide look get decided? | (a) the brainstorm proposes a `design-direction` piece, and the campaign runs `/wf design setup` before wave 1. (b) the campaign setup only. (c) keep as today. | (a) | (a) |
| DQ5 | Add terminal craft rules (colour schemes, height board, pasteable paths, ANSI capture)? | Yes / No. | Yes | Yes |
| DQ6 | Can the model run the next `/wf` stage on "start X"? | (a) keep `disable-model-invocation`; the reply says "type `/wf …`". (b) allow the model to run the next stage. | (a) | (a) |

## Part II — The design joins fix plan (2026-10-21)

Source file: `WF-DESIGN-PROCESS-FIX-PLAN.md` (merged here on 2026-10-22). Decision IDs are renamed per section 2.

**Date:** 2026-10-21. **Base:** v9.195.0. **Status:** PLAN, nothing built. BQ1–BQ4 answered 2026-10-21 (section 9). BQ1: build nothing until the slice-order release is on `origin/master`; then Release A, then Release B. BQ2–BQ4 took the recommendation. A5b (the tracked file is the only source, with fixes for the three canvas-access cases) was added at the person's request.
**Source:** Part I — findings DP1–DP15, answers DQ1–DQ6.

### 1. Decisions (from DQ1–DQ6)

| # | Decision |
|---|---|
| P1 (DQ1) | The design stage shows the carried decisions as one read-only summary. It asks only about (a) items that touch a surface in `02b-design.md` `surfaces:`, (b) items that shape narrowed, and (c) every contradiction: two carried items against each other, an item against `direction.md`, `DESIGN.md` or `PRODUCT.md`, an item against a sketch, or an item against a shape answer. |
| P2 (DQ2) | A review finding against a confirmed board or the `02c-craft.md` contract is never fixed or dismissed by a driver. It stays open, and the driver asks the person at once: amend, keep, or defer. |
| P3 (DQ3) | The sketches go into git, and the tracked file is the only source. A canvas is a published view of the file. Changes go through the file and are republished; a canvas from another account is republished under the session's account; outside work is saved to a file at once (A5b). `references/` is not part of this plan. |
| P4 (DQ4) | The brainstorm proposes one `design-direction` piece when kept design items span more than one piece. The campaign has the person run `/wf design setup` once before wave 1 prepare when the board has `focus: design` and the design record is missing. |
| P5 (DQ5) | The plugin gets terminal design rules and a terminal capture with colour. |
| P6 (DQ6) | `disable-model-invocation` stays. Every reply writes the next stage as "Type `/wf …`". In a campaign, the reply names the campaign step. |

### 2. Constraints

**C1. The slice-order release is in flight in another session.** These files have uncommitted edits now:
- `skills/wf/workflows/campaign-wave.js` and `yolo.js`;
- `scripts/campaign.mjs` and `lib/campaign.mjs`;
- `skills/wf/reference/campaign/_drive.md`;
- `tests/unit/skills/driver-parity.test.mjs`, `campaign-deps-docs.test.mjs`, `campaign-wave-docs.test.mjs`;
- the new files `reference/campaign/_order.md` and `lib/roster-edit.mjs`.

Release A of this plan touches none of these files. Release B touches the drivers and the campaign CLI. By BQ1, start no wave of this plan until the slice-order release is on `origin/master`. Then build Release A, then Release B.

**C2. Prose budgets** (`tests/unit/prose-budget.test.mjs`, `key-surface.test.mjs:98`):

| File | Now | Limit | Rule for this plan |
|---|---|---|---|
| `intake/brainstorm.md` | 249–250 lines | 250 | Edit inside existing lines only. |
| `shape.md` | 4589 words | 4589 | Net zero words. Put new rules in `design/shape.md`. |
| `verify.md` | 3929 words | 3929 | Do not touch. Put capture rules in `design/_boards.md`. |
| `_host-invocation.md` | 80 lines | 80 | Do not touch. |
| `intake/ideate.md` | 247 lines | 250 | At most 3 lines. |
| `_gate-question.md` | 69 lines | 80 | At most 11 lines. |
| `design/*`, `campaign/_phases.md` | ≤ 148 lines | 300 | Room. |

**C3. Pinned text.** Keep these sentences, or update the test in the same commit:
- `brainstorm-design.test.mjs:73-84`: in `_carried.md`, "whose `routed-to` is this slug", "keep, change (free text says how), or drop", and "`## Carried design thoughts`"; in `stage.md`, "## Step 1b — Present the carried design thoughts" and the `carried-from:` line.
- `design-lane.test.mjs:237,258,289`: three `stage.md` sentences.
- `brainstorm-mode.test.mjs:337-341`: the "## 2.9 The page" heading and three page sentences.
- `design-craft-port.test.mjs:30-39`: the `_platforms.md` table header and term names.
- The STOP keys (first 8 words) in `design/stage.md:13-17` and `design/_lane.md:39-40`.

**C4. Capability inventory.** `shape.md`, `design.md`, `retro.md`, `intake/extend.md`, `intake/ideate.md`, `_gate-question.md` and `_chat-return.md` are in the baseline. Rewording a stop, gate or artifact there needs an entry in `reworded.json` or `moved.json`.

**C5. Build.** A change to `lib/*.mjs` or `scripts/*.mjs` needs `npm run build` in the same commit (`scripts/build.mjs:79-81` bundles `campaign`, `design-boards`, `work-packets`). Add a new bundled script to that list.

**C6. Version bump is a shared act.** Release A and the slice-order release must not bump at the same time. Bump only after `git fetch` shows no newer release commit.

### 3. Release A — design prose and design tools (no driver, no campaign CLI)

The waves follow the review's section 6 order, without DP2, DP13 and the code parts of DP4 and DP12 (Release B).

#### A1. Stop re-asking carried decisions (DP1, P1)

- `design/_carried.md` "At the design stage":
  - Step 1 Present: the summary lists every carried item with its intake answer and source key. It asks nothing.
  - Step 2 Walk: replace "Ask about each carried decision" with the ask set of P1. Keep the pinned phrase "keep, change (free text says how), or drop" for the items in the ask set. When the ask set is empty, ask one question: "Keep the carried direction, or name a change".
  - Add a short "Find contradictions" list: item against item, against `direction.md`, `DESIGN.md`, `PRODUCT.md`, against a sketch, against a shape answer. Each contradiction is one question that names both sides.
- `design/shape.md` Round 3: record `viewports:` in the brief. Take it from a carried item, `DESIGN.md`, or the platform. Ask only when no source gives it.
- `design/stage.md:61` and `design/_boards.md:58`: take the viewports from the brief `viewports:`. Ask only when the brief has none.
- Tests: update `brainstorm-design.test.mjs` for the new Walk text; add a test that `stage.md` Step 4.1 names the brief `viewports:`.

#### A2. Shape shows the carried sketches (DP14)

- `design/shape.md` Round 3 (no budget pressure): each design question that a carried sketch answers gives the sketch path and caption in the question text. A question that `direction.md`, `DESIGN.md` or `PRODUCT.md` already answers is not asked; the brief records the source.
- `shape.md:102` Round 3b: no new words. Change one existing clause to point to `design/shape.md` Round 3 for the sketch rule (net zero words).
- Test: `design/shape.md` names the carried sketches and the record sources.

#### A3. Next step wording (DP4 prose, P6)

- `_chat-return.md` (42/80 lines): add one rule. When the next step is a `/wf` key, write "Type `/wf <key> <args>`". Never write that the model runs it.
- `design/stage.md` Next (:9, :122) and `design.md:119`: when `00-index.md` has `origin-packet` and `.ai/workflows/<board>/work/campaign/ledger.json` exists, the Next line names the campaign order: "Type `/wf slice <slug>`", then "Run `campaign.mjs unit <key> prepared`", then "Type `/wf campaign <board>`". Do not change the STOP sentence at `stage.md:16`.
- `shape.md:184` Option E: replace "Design → `/wf design <slug>`" wording with "Type `/wf design <slug>`" (net zero words).
- `campaign/_phases.md:89-91`: "Run `/wf intake …`" becomes "Have the person type `/wf intake …`". Same for shape and slice.
- Capability inventory: add `reworded.json` entries for any baseline gate text that changes.
- Test: `_chat-return.md` has the "Type `/wf`" rule; `design/stage.md` Next names the campaign order.

#### A4. Prepare order (DP10)

- `campaign/_phases.md` Rolling prepare: swap step 3 (slice) and step 4 (design lane). Keep step 6 as `unit <key> prepared`, so ":123 run step 6 again" stays true. Keep the pinned `needs add --by prepare` and `provides set` strings.
- `campaign.md:16`: "intake, shape, the design lane when the packet needs one, and slice".
- Test: `campaign-deps-docs.test.mjs` asserts design comes before slice. **CAUTION:** that test file has uncommitted edits from the slice-order session. Put the new assertion in a new test file, `campaign-prepare-order.test.mjs`.

#### A5. Track the sketches (DP3, P3)

- `lib/design-boards.mjs:294-297`: add `.ai/workflows/*/design/sketches/` to `STAR_BLOCK` and `GLOB_BLOCK`. Track all sketch files (BQ3).
- `scripts/design-boards.mjs` `track` (:512-529): also probe a sketch path, so that a repo with the old block gets the new lines (`change: true`).
- `design/_carried.md`: give the local path first and the canvas link second (A5b).
- `design/_boards.md` Tracking: name the sketches.
- Build `dist/`. Tests: `design-boards.test.mjs:280-304` (the new line, the old-block upgrade, `design/boards/` stays ignored).

**A5b. The tracked file is the only source (decided 2026-10-21, replaces the canvas read and diff).** A sketch or board file in git is the design. A claude.ai canvas is a published view of that file. Every stage, sub-agent, machine and account reads the file, so no stage needs access to a canvas to read the design. Three cases still need canvas access. A5b fixes each one.

*Case 1 — a change made on claude.ai.*
- Rule: change a sketch or board only through its file. When the person wants a change, the person says so in chat or in a canvas comment. The agent edits the file and republishes it to the same link.
- Comments: before each design question, read the canvas comments with the host's comment tool (`design/_boards.md:69` already reads them before the board question; extend it to carried sketches at carry). Turn each comment into a change to the file, or answer it, then republish.
- Detection without a read pass: a republish from the file to a link whose live version is newer is refused by the host, and the refusal gives the live version. Then ask the person: take the canvas change into the file, or replace it with the file. Write the choice to the file, then republish. For a frozen board, a taken canvas change goes through `design/import.md` and becomes a new board revision, never an edit inside `r<N>/`.

*Case 2 — the person must open and comment on every link.*
- Publish every canvas from the session's own account. Record `canvas: { link, account, published-at, sha256 }` on the sketch entry (board `sketches[]`, packet `sketches:`) or in `boards.json` for a board. `sha256` is the hash of the file that was published.
- At carry (`intake/_packet.md:47`, `design/_carried.md` Find) and before any question that gives a link: when the recorded `account` is not the session's account, publish the tracked file again under the session's account, record the new link, and keep the old link in `canvas.previous[]`. Because the file is the source, this republish loses nothing.
- When the recorded `sha256` differs from the file's hash, republish before the link goes into a question, so the person never reviews an old view.
- On a host with no design canvas (Codex, pi), give the file path only, and record nothing.

*Case 3 — design work made outside `/wf`, with no local file.*
- Import at the door: when the person gives a claude.ai link or other outside design work, in a brainstorm or at the design stage, save it to a local file at once (`design/sketches/<key>.html`, or `design/import.md` for boards). From then on the file is the source, and Case 2 applies.
- When the session's account can read only a summary of the link (the account can view but not edit it), the full page cannot be saved. Ask the person for one of: give this account edit access, download the file and give its path, or keep the link as a reference only (`state: reference`, no file, never a board).
- `intake/brainstorm/_design.md` and `design/import.md` name this rule.

*Files:*
- `intake/_packet.md:47`, `design/_carried.md` (Find, Present), `design/_boards.md` (lines 60 and 69, Tracking), `design/stage.md` Step 6, `design/import.md`, `intake/brainstorm/_design.md:24`.
- `tests/frontmatter.schema.json` `$defs.brainstormBoard.sketches` (~:1922) and the packet `sketches` (~:2138): an optional `canvas` object with `link`, `account`, `published-at`, `sha256`, `previous[]`; `state` adds `reference`. `boards.json` gets the same object next to `--canvas-version`.
- `lib/design-boards.mjs` + `scripts/design-boards.mjs`: `canvas-stale <slug>` lists each sketch and board whose recorded `sha256` differs from its file, or whose `account` differs from a given account. Build `dist/`.

*Tests:* `canvas-stale` reports a changed file and a foreign account; the schema accepts the `canvas` object and `state: reference`; `_carried.md`, `_boards.md` and `brainstorm/_design.md` name "the file is the source", the republish rule and import at the door.

#### A6. Brainstorm design focus (DP5, DP7, DP8, P4 first half)

- `intake/brainstorm/_design.md` (48/250 lines):
  - **References first (DP5).** When the design record is empty, the first design batch asks for references. When the person promises references, draw no sketch until they arrive. Each sketch names the reference it starts from.
  - **Design direction piece (DP7, P4).** At done, when kept `design: true` items fall in more than one piece, propose one `design-direction` piece first, and let the feature pieces point to it.
  - **One file, many sketches (DP8).** A sketch `path` may be `<file>#<artboard>`.
- `design/_carried.md:20`: copy a file once; keep the `#<artboard>` anchor in the key's record. Do not copy one file under several names.
- `lib/work-packets.mjs` `packetSketches` (:270-277): keep the anchor in `path`.
- Tests: `brainstorm-design.test.mjs` for the three rules; `work-packets.test.mjs` for an anchored path.

#### A7. Sketch links and the page (DP6)

- `intake/brainstorm/_artifact.md` document template (228/250): add `## Sketches` (key, caption, local path, link, state).
- `intake/brainstorm.md:189`: add "sketches" to the page contents list inside the same line.
- New `lib/brainstorm-page.mjs` + `scripts/brainstorm-page.mjs`: render `brainstorm-page.html` from `brainstorm-board.json` and `01-brainstorm.md`, with the sessions, decisions, sketches and pieces. Reuse `esc`, `safeHref` and the sheet pattern of `lib/design-boards.mjs:210-289`. Add it to `scripts/build.mjs`.
- `intake/brainstorm.md` step 2.9: point to the script inside existing lines (C2).
- `lib/work-packets.mjs` `checkWorkSet` (:147-224): add three errors at done: a sketch still `state: idea`; a carried sketch in no piece; a piece that names an unknown sketch key.
- Tests: a new `brainstorm-page.test.mjs`; `work-packets.test.mjs` for the three errors.

#### A8. Terminal design (DP11, P5)

- `design/_platforms.md` (66/300): add a "Terminal" section below the table (do not change the pinned table):
  - Draw light and dark boards with named real colour schemes, and state each scheme.
  - Check the contrast of ANSI yellow and bright black on each scheme.
  - Draw one board at 80×24 for the height budget.
  - Print paths that paste into every target shell. Do not print `~`.
  - Write a "done" line only after an end-to-end check of the path it reports.
- `design/stage.md:55-59`: a terminal flow surface gets a worst-case board.
- `design/_boards.md` capture rules: a terminal surface is captured through an ANSI-to-HTML render with the named scheme. The HTML board method uses the same render.
- New `renderAnsi(text, scheme)` in `lib/design-boards.mjs` with two built-in schemes, and a `design-boards.mjs ansi` command (BQ4). Build `dist/`.
- Tests: `_platforms.md` names the five rules; `renderAnsi` maps SGR 33 and 90 to the scheme colours.

#### A9. Design record write-back and campaign design setup prose (DP12 prose, P4 second half)

- `design/stage.md` Step 6 (freeze): write the token roles that `02c-craft.md` settles into `DESIGN.md`, and show the change to the person.
- `design/record.md:10`: the design stage now writes `DESIGN.md` token roles at freeze.
- `design/setup.md` template: add token roles under `## Colors`.
- `campaign/_phases.md` Phase 1 Setup: when the board has `focus: design` and `PRODUCT.md` or `DESIGN.md` is missing, have the person type `/wf design setup` before wave 1 prepare.
- Test: the phases text and the record rule.

#### A10. Smaller faults (DP9)

- `_gate-question.md`: an interrupted question or an unknown result is unanswered. Ask it once more.
- `_timestamp.md`: read the clock for each question batch; a decision gets the time of its batch.
- `intake/ideate.md` Step 0 (≤ 3 lines): when the repo has no code, propose a brainstorm.
- The hook-versus-mod redirect (Lantern 21:48) gets no change; `brainstorm.md` Craft already says to follow the person.

#### A11. Retro routes design decisions (DP15 prose, DP13 prose)

- `retro.md:74` (218/250): under a campaign, write `.ai/design/*` in the main checkout, never in a wave worktree. For each direction decision, propose a `steer <unit>` line for each unit it applies to, and the person confirms.
- `campaign.md` Steering (:139-152): a direction decision goes to the units it applies to, not to `wave-<n>`.
- `campaign/_waves.md:110`: do not revert a record file in a worktree before sync.

#### A12. Release A

- Doc site pages for design, brainstorm and campaign. CHANGELOG. `npm version minor` (it stamps the version carriers and builds), per C6.
- Gates: `npm test`, prose budget, capability inventory, `verify:capabilities`.
- Reinstall on all hosts.

### 4. Release B — driver and campaign CLI (after the slice-order release)

#### B1. A design finding goes to the person (DP2, P2)

- `POLICY.review` (`campaign-wave.js:~510`, `yolo.js:444`): add a case. A finding against a confirmed board or the `02c-craft.md` contract is not fixed and not dismissed. Record it as open with `needs-amend`, and list it in the result `amendFindings[]` (key, severity, one-line summary, the contract line).
- `STAGE_RESULT` (both drivers): add `amendFindings`.
- **Campaign:** after the review fix loop, when `amendFindings` is not empty, `park(u, 'design-amend', …)` with a `PARK_TEXT['design-amend']` that lists the findings and three answers:
  - amend → the unit stays stopped; the next step is "Type `/wf design <slug> amend`"; after the amend the lane reruns from the first plan to revisit;
  - keep → each finding closes as `kept-by-person` with the answer as reason;
  - defer → each finding closes as `deferred` with `by: person`.
  The park blocks the unit (BQ2). The other units continue.
- **yolo:** stop with `stoppedAt: 'review'`, the findings as reason, and `route: /wf design <slug> amend` (the same shape as the orient design gate at `yolo.js:882-895`).
- Add the new clause to both drivers with the same text. Add a parity assertion for the clause text, because `POLICY` is not in the SHARED list.
- Tests: `campaign-wave.test.mjs` review stub with `amendFindings` → an `ask` with `--kind design-amend`; answers keep and defer close the findings; yolo stub → stop with the amend route.

#### B2. Main records are safe on worktree remove (DP13)

- `scripts/campaign.mjs` `mainOwned` (:447): add `.ai/design/`. A wave worktree never copies `.ai/design/*` out to main.
- `lib/campaign-records.mjs` `recordsOut` (:180-217): keep a per-file list of earlier base hashes. When the worktree hash equals an earlier base, write a conflict copy and do not overwrite main.
- Tests: `campaign-records.test.mjs` (revert after copy-out → no overwrite); `campaign-cli.test.mjs` (`.ai/design/` stays main-owned).

#### B3. The campaign names its next command (DP4 code)

- `lib/campaign.mjs` `campaignAction` (:1011-1053): add `command` to each action that waits for the person (`prepare`, `start-wave`, `ask`, `setup`, `design-setup`).
- `scripts/campaign.mjs` `unit <key> prepared` (:1717-1749): return `next` with the command.
- The stage prose of A3 reads `campaign.mjs status` for the command when a ledger exists.
- Tests: `campaign.test.mjs` for `command` on each action.

#### B4. Design setup action (DP12 code, P4)

- `campaignAction`: a new `design-setup` action before `prepare`, when `brainstorm-board.json` has `focus: design` and `PRODUCT.md` or `DESIGN.md` is missing. It is in `campaignAction`, not `orient`, so live ledgers get it.
- Tests: the action appears and clears when the files exist.

#### B5. Release B

- Doc site, CHANGELOG, `npm version minor`, all gates, all hosts.

### 5. Migration

- **Old brainstorm boards** with several keys per file keep working. The `#<artboard>` form is optional. The duplicate copies in Lantern are harmless.
- **Repos with the old `.gitignore` block** get the sketch lines from `design-boards.mjs track --write`. Ask the person before `--write`. Lantern needs this once.
- **Open campaigns** get `design-setup` and `command` from `campaignAction` with no ledger change. A `design-amend` question uses the existing `questions[]` entry; no ledger version change.
- **Findings already dismissed** in Lantern wave 1 are already answered in its retro. No migration.

### 6. Lantern after the releases

1. Before Release B, commit `.ai/design/direction.md` and `current.md` on main, so that no sync can overwrite them.
2. After A5, run `design-boards.mjs track --write` with the person's yes. Then commit the sketch files.
2b. After A5b, republish the sketches whose canvases belong to the outlook account under the session's account, and update the links in the brainstorm board, the packets and `lantern-app-home/02b-design.md`. Read the comments on the old canvases first when the session's account can read them.
3. Restart the wave 2 design stage: type `/wf design lantern-app-home`. With A1, it asks only the open items (AMB-30, AMB-33, the unsketched surfaces) and the contradictions.

### 7. Tests (summary)

| Wave | New or changed tests |
|---|---|
| A1 | `brainstorm-design.test.mjs` (Walk text), `stage.md` viewports |
| A3 | `_chat-return.md` "Type `/wf`" rule; stage Next names the campaign order |
| A4 | new `campaign-prepare-order.test.mjs` |
| A5 | `design-boards.test.mjs` track lines and upgrade probe; `canvas-stale`; schema `canvas` object and `state: reference` |
| A6 | `brainstorm-design.test.mjs`, `work-packets.test.mjs` (anchor) |
| A7 | new `brainstorm-page.test.mjs`; `work-packets.test.mjs` (3 errors) |
| A8 | `_platforms.md` terminal rules; `renderAnsi` |
| B1 | `campaign-wave.test.mjs`, yolo stop route, parity of the clause |
| B2 | `campaign-records.test.mjs`, `campaign-cli.test.mjs` |
| B3–B4 | `campaign.test.mjs` |

### 8. Risks

- **R1.** A1 can hide a decision the person wants to change. The summary is shown in full, and a free-text reply to the one question can change any item.
- **R2.** A5 tracks every sketch, so dropped sketches also go to git. They are small HTML or PNG files.
- **R3.** B1 adds a park after review, which can delay a wave. Only findings against the confirmed design cause it, and the review fixes everything else first.
- **R4.** C1 conflicts: Release A edits `campaign/_phases.md` and `campaign.md`. By BQ1, Release A starts after the slice-order release, so re-read both files and the line anchors of this plan before A3, A4 and A9.
- **R6.** A5b republishes a canvas from another account under the session's account, so its comments stay on the old link. `canvas.previous[]` keeps the old link, and the agent reads its comments once before it stops using it, when the session's account can read them.
- **R7.** The `account` field writes a claude.ai account name into a tracked file. That is the person's request; a repo that is public shows it.
- **R8.** Case 1 detection depends on the host refusing a republish when the live version is newer. When a host does not refuse, a change made on claude.ai is overwritten by the next republish. The rule "change only through the file" is the main defence.
- **R5.** The A7 page renderer replaces a scratchpad script that each session wrote. The first live brainstorm checks it.

### 9. Questions

| # | Question | Options | Recommendation | Answer (2026-10-21) |
|---|---|---|---|---|
| BQ1 | Ship Release A before the slice-order release is on `origin/master`? | (a) yes, it touches none of its files. (b) wait and ship after it. | (a) | (b) Wait. Build nothing until the slice-order release is out, then Release A, then Release B. |
| BQ2 | In a campaign, does a `design-amend` question stop the unit? | (a) yes, after the review fix loop; other units continue. (b) no; the unit continues, and handoff waits for the answer. | (a) | (a) |
| BQ3 | Which sketches go to git? | (a) all files in `design/sketches/`. (b) only sketches with `state: carried` (needs per-file lines written from the board). | (a) | (a) |
| BQ4 | Terminal capture: build `renderAnsi` in the plugin? | (a) yes, with two named schemes. (b) prose only; each project uses its own converter. | (a) | (a) |

## Part III — The impeccable v4.7 re-port (2026-10-20)

Source file: `WF-DESIGN-IMPECCABLE-V4-PLAN.md` (merged here on 2026-10-22). Decision IDs are renamed per section 2.

Status **PLAN, nothing built. Q1–Q8 answered 2026-10-20: the PO accepted every recommendation (I8–I15).** · Date **2026-10-20** · Plugin **v9.193.2** (HEAD `cdaa8632`) · Owner **jayte**
Source: impeccable (`pbakaus/impeccable`), commit `374a0e179` (2026-10-20), skill v4.7.0, Apache-2.0. Local clone: `.scratch/impeccable`.
Depends on: [DESIGN-CRAFT-PORT-PLAN.md](DESIGN-CRAFT-PORT-PLAN.md) (v9.191.0). This plan keeps every decision of that plan, in particular its D2: a rule names a concept, not a CSS property; platform forms live in `design/_platforms.md`.
Origin: the PO asked on 2026-10-20 what we took from impeccable, what changed, and what to take now. The PO chose option 1 for the craft floor and asked for a detailed plan that covers the moves.

### 1. Why

`/wf design` descends from impeccable twice:

| When | Commit | What we took | Upstream version |
|---|---|---|---|
| v8.0.0, 2026-04-12 | `c70e58f0` | The command set, Nielsen scoring, personas, cognitive load, `.impeccable.md`, `npx impeccable` | impeccable-style-universal v2.1.1 |
| v8.27, 2026-05-03 | inside `7c385088` | The brand/product register, PRODUCT.md and DESIGN.md, the shared laws, the absolute bans, the image gate, the router pattern. Nielsen, personas and the detector were dropped. | impeccable v3.0.x |

Everything after v8.27 is ours or comes from Kowalski and Krehel. Upstream moved 1,848 commits since. Its skill text changed for reasons that it measured, and several of those reasons apply to us.

**Problem 1: our ban list is present while the model invents.** `_design-context.md` carries the absolute bans. The design stage loads the whole file at Step 1 (`design/stage.md:21`), before the three directions of Step 3b. Upstream moved its bans to `craft-floor.md` and loads that file only immediately before a UI edit (`SKILL.src.md:23`). Its evidence, commit `153b416f2`: "Models tread lightly when a ban list is present during ideation." A lean core beat a heavy core 66% (`6b3d174e9`).

**Problem 2: our moves contradict the floor and each other.** Each row below was checked against the file on 2026-10-20.

| File | Defect | Upstream rule |
|---|---|---|
| `design/overdrive.md:39-45` | A gradient-text snippet as a ready recipe | Gradient text is refused (`craft-floor.md:33`) |
| `design/overdrive.md:58-67` | `animation-timeline: view()` on every `.section` | "Not one identical entrance on every section" (`craft-floor.md:13`) |
| `design/overdrive.md:35-37` | A mesh gradient at hue 280 | Our own ban, purple-blue gradients (`_design-context.md:94`) |
| `design/overdrive.md:75-81` | An endless weight pulse, a layout property | `animate.md` cheap-property rule |
| `design/typeset.md:49` | Display size up to `7rem` | Display max 6rem (`craft-floor.md:12`) |
| `design/bolder.md:30` | Tracking down to −0.05 em | Tracking floor −0.04 em (`craft-floor.md:12`) |
| `design/bolder.md:35-42` | "Upgrade the color strategy one tier" | Scope is sovereign: no new color without asking (`bolder.md:7-9`) |
| `design/adapt.md:47` | Dark mode: "border + subtle glow" | A zero-offset halo is decoration (`craft-floor.md:10`) |
| `design/onboard.md:80` | A stagger of about 100 ms | Our own `animate.md:144`: 30–80 ms |
| `design/typeset.md:20`, `design/brand.md:20` | Inter rejected outright | Only "Inter as a display face", and only on Persuade and Experience (`new-work.md:67`). Our `product.md:13` recommends Inter. |
| `design/colorize.md:24-29` | A fixed 60/30/10 split | Removed upstream (`77c7d8e0f`): pick a strategy, not a percentage |
| `design/colorize.md:34` | Fixed semantic hues | Hue from the platform, the domain and the palette (`colorize.md:46`) |
| `design/colorize.md:86`, `_design-context.md:61` | "Always tint gray" | Reversed upstream: "Neutral gray is valid" (`colorize.md:44`) |
| `design/colorize.md:46` | A warm-neutral example `oklch(97% 0.01 60)` | Upstream called this "the AI cream/sand giveaway" |
| `design/optimize.md:65` | `loading="lazy"` on the hero | "Never lazy-load above-fold content" (`optimize.md:243`) |
| `design/polish.md:120` | Bans decorating scrollbars | Theme scrollbars from the palette (`craft-floor.md:15`) |
| `design/quieter.md:44` | "80%+ of the surface is neutral" | Contradicts the Committed and Drenched strategies |
| `design/delight.md:40` against `:109` | Error messages are a delight moment, and delight on errors is banned | Warmth allowed, jokes not (`delight.md:42`) |
| `intake/fix.md:66` | Reads `.impeccable.md` | Retired in `7c385088`; every other read reads PRODUCT.md |
| `CHANGELOG.md:5406` | Credits impeccable to "Anthropic" | The repository is `pbakaus/impeccable`, Apache-2.0. No design file carries a notice. |

**Problem 3: our move text is older than upstream's.** Upstream rewrote most commands since May with evidence: clarify became a UX-copy command, bolder became scoped amplification, polish classifies drift, harden added concurrency and interrupted gestures, colorize builds roles. Section 5 lists each change.

**Problem 4: two open structural questions.** The register (brand/product) became four modes upstream (`bf2dd7ec1`). Critique gained Nielsen scoring and personas again. Both need a PO decision (section 11).

### 2. Decisions

| # | Decision | By |
|---|---|---|
| I1 | **The craft floor is text only (option 1).** A new `design/_craft-floor.md` holds the bans and a Verify list. No hook. | PO 2026-10-20 |
| I2 | **The floor loads after the direction is settled.** Load it at design stage Step 4 (before the first board), in `implement` before the first UI file edit of a slice, in verify and review as a checklist, and in record writes as a guard. Never load it in a brainstorm, design stage Steps 1–3b, `shape`, `slice` or `plan`. | PO 2026-10-20 (option 1 load table) |
| I3 | **The DESIGN-CRAFT-PORT-PLAN decisions stand.** Every ported rule is generic. A web form goes into `_platforms.md` or into a fenced example labelled "Web:". Our motion system, curve tokens, durations and the worst-case corpus win over upstream text. | recommendation |
| I4 | **The moves get the ported text in this plan. The `## Register` sections change to `## Mode` in W7 (I8).** Each move entry in section 5 gives the mode outline, ready for wave W7. | recommendation |
| I5 | **Engine-only upstream features stay out.** Section 7 lists them. | recommendation |
| I6 | **Every ported file carries one credit line:** "Parts adapted from impeccable v4.7.0 (`pbakaus/impeccable`, `374a0e179`), Apache-2.0." Fix the CHANGELOG credit in the release entry. | recommendation |
| I7 | **Text ported from upstream is rewritten in STE.** No MUST, CRITICAL, "verbatim" or other token that `prose-budget.json` forbids. No "Codex" or other host name (`verify-host-neutrality.mjs`). | rule of this repo |
| I8 | **Register becomes four modes** (Persuade, Operate, Read, Experience), chosen per surface. `register` stays readable for old workflows and maps brand → persuade, product → operate (9.1). (Was Q1.) | PO 2026-10-20 |
| I9 | **Critique adds Nielsen scoring, the cognitive-load check and personas** in a new `design/_heuristics.md`. P0–P3 map onto blocker/high/medium/low; Riley points to the worst-case boards (7.1). (Was Q2.) | PO 2026-10-20 |
| I10 | **The `#000` and `#fff` ban is removed** from the laws and the floor. (Was Q3.) | PO 2026-10-20 |
| I11 | **A kicker or eyebrow label above a heading is always refused.** No brief earns it back. (Was Q4.) | PO 2026-10-20 |
| I12 | **Delight on an error: warmth allowed, jokes not.** Play or jokes on an error, a loss, money, privacy or blocked work stay refused (DELIGHT-4). (Was Q5.) | PO 2026-10-20 |
| I13 | **Body measure: 65–75 characters for body prose in the floor.** Typeset allows 45 for a narrow column. (Was Q6.) | PO 2026-10-20 |
| I14 | **`runtime-adapters/web.md:71` is the measuring source for web vitals.** `verify/_artifact.md:122` changes to agree with its severities (INP HIGH, LCP and CLS WARN). (Was Q7.) | PO 2026-10-20 |
| I15 | **PRODUCT.md adds Positioning, Operating Context, Capabilities and Constraints, Brand Commitments and Evidence on Hand. The aesthetic questions move from setup to `shape`. DESIGN.md adopts the eight section headings, without token frontmatter** (9.2). (Was Q8.) | PO 2026-10-20 |

### 3. The craft floor: `design/_craft-floor.md`

#### 3.1 Class and size

A sub-procedure file, under the 300-line cap of `prose-budget.json:9`. Keep it at or under **1,200 words**: review and verify count it into their instructed load (review 17,221 of 18,700; verify 10,925 of 12,700).

#### 3.2 Outline

1. **Title and intro.** Adapted from upstream `craft-floor.md:3`, without the hook sentence. Add a load-point table (3.4) and the rule: "Do not load this file during a brainstorm, design stage Steps 1–3b, `shape`, `slice` or `plan`." Add: "A pinned brief or the confirmed design overrides a default below. Your own habit does not."
2. **`## Verify`.** Checks on the built result, run together in one look. From upstream `:9-17` plus our Accessibility law (`_design-context.md:80-83`):
   - **Contrast:** body text 4.5:1, large text 3:1, focus ring 3:1. On a colored ground, take secondary text from that hue. Never gray.
   - **Color is never the only signal** of a state.
   - **Depth:** a shadow has an offset and a soft blur. A zero-offset halo is decoration.
   - **Spacing:** tight groups, wide separation, more space above a heading than below it.
   - **Type:** body prose 65–75 characters (I13), display max 6rem, tracking floor −0.04 em, balanced headings. Run the real copy at every width.
   - **Motion:** one authored moment. Never the same entrance on every section. Start from a visible default. The reduced-motion setting gives fewer and gentler motion, not zero.
   - **States:** default, hover, focus, active, disabled, loading, error, empty, success.
   - **System parts:** text selection, caret, scrollbar, focus ring, link underline and table numerals carry the palette. Theme their color. Never change their behavior. (This resolves upstream's own conflict between `craft-floor.md:15` and `operate.md:50`.)
   - **Copy:** the product's own words. A control names its action. An error names the problem and the recovery.
   - **Coverage:** every item of the `02c-craft.md` `## Mock fidelity inventory` is present and findable.
3. **`## Refuse — always`.** No brief earns these back:
   - a colored side stripe above 1 px (ours `:93`, upstream `:35`);
   - a card nested in a card (ours `:96`, upstream `:25`);
   - a kicker or eyebrow label above a heading (upstream `:27`; I11);
   - bounce or elastic easing on an Operate or Read surface (ours `:97`; "product" until W7).
4. **`## Refuse — defaults the brief can earn`.** Intro from upstream `:21`: the brief's own words can earn one; reaching for one by habit means you were not deciding.
   - Page scaffolds: same-size icon-heading-text card grids as the page structure; the hero-metric template without real proof (ours `:95`); section numbers unless the sequence carries information (upstream `:28`); a modal for a task that needs no interruption.
   - Surface habits: gradient text; decorative glass and blur; hard offset shadows outside a neobrutalist world; sparklines and rings standing in for content; monospace as a "technical" costume; a system display face as the display voice of a Persuade or Experience surface; emoji or glyphs as icons; a geometric mask faking an organic edge; light or dark picked by category; purple-blue generic gradients (ours `:94`); a cream or off-white default ground, italic accent words in headlines, and pill buttons as the default shape (ours `:100`).
5. **`## Model tells`.** Upstream's `<codex>` block (`:44-50`) without the tag: a 1 px border under a wide soft shadow (the ghost card); card radii outside 12–16 px, pills only for small controls; sketch-style SVG scenes and noise grain posing as illustration; stripe and grid backgrounds with no canvas, map or blueprint under them; illustrative values not labelled as illustrative.
6. **`## Record guard`.** From upstream `agents/impeccable-documenter.md:31`: "Never write a refused element into DESIGN.md or `.ai/design/current.md` as a system rule. Record it as design debt."
7. **Closing line.** Upstream `:52`: "The floor holds the mechanics. It never picks the direction. When torn between refined and committed, commit."

Fraunces and Cormorant (ours `:99`) do not go into the floor. They belong to the font reflex list, which is a direction-time rule (`new-work.md:67`). See TYPESET-3.

#### 3.3 What stays in `_design-context.md`

Keep: the register (22–37, until W7), context gathering (39–51), the laws (59–78), the motion summary (85–89), the image gate, the preflight, the inspection sub-agents and the mutation types.

Change:
- Lines 3–8 and the consumer contract 10–16: rewrite per 3.4.
- Line 57: "Check each result against the Absolute bans below…" becomes "The build checks itself against [_craft-floor.md](_craft-floor.md) at the edit step."
- Line 61: "Never `#000` or `#fff`. Tint every neutral…" becomes "Tint a neutral toward the brand hue only when it creates cohesion. A plain neutral is valid." (COLORIZE-14, I10.)
- Lines 80–83 (Accessibility): move to the floor's Verify list.
- Lines 91–100 (Absolute bans): move to the floor.
- Line 132 (preflight Register row): no change until W7.

Add a short **anti-convergence block** to the laws, after line 62. It is a direction-time rule, so it stays here, not in the floor. From upstream `new-work.md:65-73`:
- Pick the color strategy before any color. Commit it at page scale.
- Decide light or dark from a one-sentence scene: who, where, under what light.
- Four saturated looks fail when the brief left the aesthetic free: cream + serif + terracotta; near-black + neon glow; broadsheet hairlines + italic serif + mono labels; flat ink + hard offset shadows + condensed display type.
- Self-check: if someone can guess the look from the category, or from the category plus its avoidance, rework it.
- A negative constraint in the brief removes a device, not energy.
- The model's first palette for a warm or bookish subject (cream, serif, lamplight) is already spent. Do not use it unless the brief pins it.
- Truth binds claims, not demonstrations: author demo data at full fidelity and label it synthetic.

#### 3.4 Load points

| Where | Load | How |
|---|---|---|
| `intake/brainstorm/_design.md` | No | Add: "Do not load `design/_craft-floor.md`." |
| Design stage Steps 1–3b | No | `stage.md:46` "Every direction meets the craft bar on its own" becomes "Every direction is complete and uses the tokens of DESIGN.md." |
| Design stage Step 4 (and Amend, which runs Steps 4–6) | Yes, before the first board | Insert at `stage.md:53`: "Load [_craft-floor.md](_craft-floor.md) now. Draw every board against it." |
| Import (`design.md:88`) | Yes | Import resumes at Step 5 and skips Step 4. Add the floor to the files it loads. |
| Move pass (`stage.md:107-118`) | Yes, as a checklist | It draws nothing. Add the floor to Step 1 of the pass. |
| `shape`, `slice`, `plan` | No | Remove "absolute bans" from `plan.md:66` and `slice.md:67`. |
| `implement` | Yes, before the first UI file edit, once per slice | Requires row `design/_craft-floor.md | procedure | mode:ui`. Rewrite `implement.md:130`. |
| `verify` | Yes, as a checklist | `verify/_sub-agents.md:95`. See 6.3 for the budget. |
| `review` (design-audit, design-critique) | Yes, as a checklist | `review/_select.md:21`, `design/audit.md:7,56`, `design/critique.md:46,64`. |
| Record writes: `setup`, `teach`, `sync`, `direction`, `extract`, `retro` | Yes, the Record guard only | New "Floor guard" section in `design/record.md` after `:72`. `retro` reaches it through `record.md` (`retro.md:51`). `extract.md:134-139` adds one sentence. |
| `02c-craft.md` `## Anti-patterns to avoid` | Yes | `contract.md:148`: "…plus the refusals in `_craft-floor.md`". Step 6 runs after Step 4 loaded the floor. |

The move files replace both ban pointers ("Apply the ban list in [_design-context.md]…" in `## Never`, and "The absolute bans in [_design-context.md] apply." in `## In the workflow`) with one sentence: "Before you draw or edit UI, load [_craft-floor.md](_craft-floor.md). Check the result against its Refuse and Verify lists."

#### 3.5 Conflicts the floor resolves

| Topic | Upstream | Ours | Resolution |
|---|---|---|---|
| Kicker or eyebrow | Always refused (`:27`) | Only monospace eyebrows, "unless the brief names them" (`:100`) | Always refused (I11). |
| Section numbers | Allowed when the sequence carries information (`:28`) | "Unless the brief names them" (`:100`) | Use the upstream test. It is checkable. |
| Scrollbars | Theme them (`:15`) | `product.md:52` and `polish.md:120` ban custom scrollbars | Theme the color. Never change the behavior. |
| Motion materials | Blur, mask, clip and shadow are in the palette (`:13`) | `audit.md:27` lists animated blur above 20 px as expensive | Both hold: allowed on a Persuade or Experience focal moment, inside the frame budget (ANIMATE-4). Keep the audit flag as a cost check, not a ban. |
| System display face | Refused on an own-world page (`:39`) | `product.md:13`: system fonts are legitimate | Refuse only as the display voice of a Persuade or Experience surface. |
| Cream, italic accents | Direction-time calibration (`new-work.md:69`) | Ban line `:100` | Both: the anti-convergence block steers at direction time; the floor refuses the default at edit time. |

### 4. Engine-only upstream features (out of scope)

These need impeccable's Rust engine or its private catalog. Do not port them as text.

| Feature | Why |
|---|---|
| `concept-seed` dice, challengers, re-roll registers, seed references | The catalog is a private paid service. |
| `serve-question` decision page | Engine server. |
| `build-phase`, `comp-spec`, `comp-diff`, `font-match`, plates, hero gate, `component-review` | Engine verbs and measurements. |
| `detect` (all scopes, `--cdp`), the live overlay, the design hook | The detector is the engine. |
| `live`, `generate`, live parameters (`scale`, `density`, `color-amount`) | Live server. |
| `critique-storage` trend, fingerprints, snapshots | Engine storage. Our `07-design-critique.md` and retro cover the need. |
| `signals` routing, `doctor`, `hooks`, `pin` | Engine utilities. |
| `.impeccable/design.json` sidecar, `surface-brief` | Engine artifacts. |

### 5. The moves, file by file

Each change has an ID, an action, our anchor, the new rule and its upstream source. "Floor pointer" means the sentence of 3.4. Line numbers are from 2026-10-20; W0 re-checks them. "Mode" lists the W7 text for the `## Register` section (I4).

Every move also gets:
- the floor pointer, in place of both ban pointers;
- an updated `## In the workflow` section in the form of `animate.md:227-234` (design not confirmed; design confirmed: the move runs its checks and draws nothing; plan and implement; the design note). Today only `animate.md` describes the confirmed-design Move pass (`stage.md:107-118`);
- the credit line (I6);
- "Next: the `polish` move." where upstream hands off to polish (optimize, quieter, typeset).

#### C1 — `design/adapt.md` (127 lines → about 157)

| ID | Action | Ours | New rule | Upstream |
|---|---|---|---|---|
| ADAPT-1 | REPLACE | `:3` | "Adapt an existing design to a new context: a window size, an input method, a platform or a medium. Rethink the experience for that context. Do not scale it." | `adapt.md:3`, `adapt.native.md:15` |
| ADAPT-2 | ADD before `:15` | — | "## Assess the context": name the source context and its assumptions; name the target (device class, input, orientation, posture, connection); list what will not fit, not work, or feel foreign. | `adapt.md:9-31` |
| ADAPT-3 | REPLACE | `:22` "44×44px" | "Give every touch target the platform's minimum hit area." New `_platforms.md` row **minimum hit area**: web 44 CSS px, iOS 44 pt, Android 48 dp. | `adapt.md:46,148` |
| ADAPT-4 | REPLACE | `:24` "16px, often 17–18px" | "Keep body text at the platform body size or larger. On the web, that is 16 px." | `mode-read.md:15` |
| ADAPT-5 | REPLACE | `:31-32` (`clamp()`) | Hover for progressive disclosure only on a hover pointer, never the only path. Display type may grow with the window on Persuade and Read; Operate keeps a fixed type scale and changes structure. | `operate.md:14,28` |
| ADAPT-6 | ADD after `:32` | — | "### Large windows, orientation and foldables": restructure, do not stretch; list and detail side by side when width allows; navigation shape follows width (bar, rail, sidebar); split screen is a size; structure from the window size class, never the device model; landscape restructures, never letterboxes; lock orientation only when the task demands it; test a foldable folded, unfolded and half-open. New row **window size class**. | `adapt.native.md:13-23,47`; `adapt.md:64-76` |
| ADAPT-7 | REPLACE | `:34-40` "Web to native (React Native, Flutter, etc.)" | "### Platform to platform": translate idioms, never transplant them; rebuild navigation and controls in the target vocabulary; carry palette intent, type accent and motion personality through the target theme. MOVE the font stacks of `:40` and the idiom table of `adapt.native.md:29-37` to a new `_platforms.md` "## Idioms" table. | `adapt.native.md:29-37` |
| ADAPT-8 | REPLACE | `:47` "border + subtle glow" | "Show elevation with a lighter surface for each higher layer. Keep a shadow only where it still reads. Give it an offset and a soft blur. Never use a zero-offset glow as depth." Also fix the contraction at `:43`. | `craft-floor.md:10`; `adapt.native.md:36` |
| ADAPT-9 | REPLACE | `:50` `@media print` | "Print: remove navigation and controls. Break pages at logical points. Show full link targets and hidden sections. Add the title and the date." | `adapt.md:99-111` |
| ADAPT-10 | ADD after `:52` | — | "Email: one column about 600 px wide. Make each action a large button. Expect no hover. Link a complex task back to the app." | `adapt.md:113-124` |
| ADAPT-11 | ADD after `:60` | — | Hit areas and hover follow the pointer type, not the width; a laptop can have touch; one information architecture in every context; never hide core function on a small screen; a large screen is not a fast device; break where the content breaks. New row **coarse pointer**. | `adapt.md:170-177,211-241`; `adapt.native.md:53-58` |
| ADAPT-12 | ADD to Validate after `:121` | — | Tap each custom control, then drag it to its end with the target input. Swipe across it on the scroll axis: the page scrolls, the control stays. Name the evidence source: emulation, synthetic touch or a real device. A screenshot proves layout, never a gesture. Report missing hardware as a gap. | `adapt.md:191-195` (`0c09f4c7e`) |

Keep: `:54-60`, the Feel native checklists `:62-111` (C9, pinned by `design-craft-port.test.mjs:125-127`), `:51-52`.
Skip: `adapt.md:5` (native routing; `_platforms.md` replaces it), `:201-318` (web reference).
Mode: Persuade and Experience keep the world in every context, never a generic reduction. Operate keeps every task complete; structure changes, type size does not; standard navigation stays. Read keeps the reading order, the wayfinding, a real measure and the body size.

#### C2 — `design/animate.md` (238 lines → about 253; budget 300)

| ID | Action | Ours | New rule | Upstream |
|---|---|---|---|---|
| ANIMATE-1 | ADD after `:48` | — | "## Motion thesis": before you build, write four lines: focal moment (the one sequence that earns authorship, or none); continuity (the changes that need a bridge); feedback (the controls and outcomes that need acknowledgment); budget (each expensive effect and how often it runs). Take the focal moment from this product. A generic fade-and-rise is not a thesis. Add the thesis to the design-note list at `:233`. | `animate.md:25-34` |
| ANIMATE-2 | ADD after `:82` | — | "On a Persuade or Experience focal moment, a paint property may carry the idea: blur, mask, clip or shadow. Bound it to one region. Confirm the frame budget on a real mid-range device." Cheap properties still govern Operate and Read. | `animate.md:36-46`; `craft-floor.md:13` |
| ANIMATE-3 | ADD after `:140` | — | "Keep content visible in its default state. An entrance starts from a state the person can already read. Content never waits on a script or an animation." | `animate.md:71` |
| ANIMATE-4 | ADD after `:144`, and a never-ship row | — | "Never give every section the same entrance. A fade-and-rise on each scrolled section is a template." Row: "The same entrance on every section → one authored moment". | `craft-floor.md:13` |
| ANIMATE-5 | ADD after `:156` | — | "Stop a non-essential loop when it is off screen or hidden. Respect the autoplay and sound settings." | `animate.md:75` |
| ANIMATE-6 | REPLACE in W7 | `:33`, `:119`, `:129-130`, `:205`, `:213`, `:217` | Register words become mode words. `:129` points to `_craft-floor.md`. Update the guard regex of `design-craft-port.test.mjs:77` in the same commit. | — |

Keep: the gates, the sweep, the tool ladder, the curve tokens `:104-106` and the per-element durations `:110-117` (they win over upstream `:54-61`), gestures, never-ship, the feel check.
Mode: Persuade and Experience: motion may carry the voice; prefer one rehearsed focal sequence; a focal entrance may take 400–800 ms; a spring may bounce 0.1–0.3. Operate: feedback, state and continuity; routine transitions 150–250 ms; no page-load sequence. Read: wayfinding only; nothing moves in the reading column.

#### C3 — `design/bolder.md` (80 lines → about 92)

| ID | Action | Ours | New rule | Upstream |
|---|---|---|---|---|
| BOLDER-1 | ADD "## Scope" after `:3` | — | "Bolder raises one named part to the conviction the rest already has. Touch only the named target. Leave its neighbors unchanged. Do not add a color, font, radius, shadow or primitive that the system does not own. When the system cannot express the direction, ask. Name the addition and its job." | `bolder.md:5-9` (`b3108c169`, `16feeb4c1`) |
| BOLDER-2 | ADD | — | "When a directions round is open, 'bolder' asks for another round further along the axis. Run [stage.md](stage.md) Step 3b item 5." | `bolder.md:3` |
| BOLDER-3 | ADD to `:17` | — | Compare the target with its neighbors; find the strong moves the system makes elsewhere that this part skips. Keep claims true; ask for missing evidence, never invent it. | `bolder.md:11-13,18` |
| BOLDER-4 | REPLACE | `:28-33` | `:28` push the lead element to the top of the existing scale; add a step only after the person agrees. `:29` weight contrast with the weights the face already ships. `:30` "Tighten display tracking to −0.02 to −0.03 em. Never go below −0.04 em." REMOVE `:31` (body line height is typeset's). `:33` "Do not swap the face. When it cannot carry the direction, ask." | `craft-floor.md:12,45` |
| BOLDER-5 | REPLACE | `:35-42` "upgrade it one tier" | "## Color at full strength": let a color the system owns take a larger region; commit color at region scale, not as scattered accents; do not add a hue without asking; reduce chroma as lightness nears black or white. | `bolder.md:9`; `new-work.md:65` |
| BOLDER-6 | ADD to `:49` | — | "Give the target its own rhythm: a shift in density or pace." | `bolder.md:20` |
| BOLDER-7 | REPLACE `:57`, ADD after `:59` | `:57` | "A texture or image from the subject's own world." Then: "Quiet everything around the move. If every element got louder, the section got flatter." | `craft-floor.md:48`; `bolder.md:19` |
| BOLDER-8 | ADD "## The skeleton test" | — | Remove the copy from the planned section. The bare structure still shows what the section is. If it works only with the words, the boldness is in the text size. An image placeholder names a job and its evidence. | `bolder.md:22-24` |
| BOLDER-9 | REPLACE | `:65` | Validate: everything outside the target is unchanged; no new color, font or primitive appeared without agreement; every action still works; it reads as the same product, only surer. | `bolder.md:26-31` |

Keep: the diagnosis taxonomy `:17-22`, spatial drama, one dominant choice, Never `:73-76`, "name the aesthetic lane" `:67` on Persuade only.
Skip: the concept-seed "bolder" re-roll register (engine). BOLDER-2 ports only its routing.
Mode: Persuade and Experience: bolder means distinctive, through hierarchy, pacing, proportion, copy, evidence and one committed idea. Operate: stronger hierarchy, weight contrast, sharper density, decisive priority; theatrics erode trust. Read: bolder lives in the frame (masthead, rail, section openers); the column stays calm.

#### C4 — `design/clarify.md` (79 lines → about 95): realign to UX copy

Clarify began as a copy command (`CHANGELOG.md:5423`) and drifted to visual clarity (`archived/DOC-SITE-DRIFT-AUDIT-2026-06-20.md:1018-1020`). Upstream clarify is UX copy (`9ffd3211d`, `5fbe37c97`). Rewrite the file in STE from upstream `clarify.md`:

| ID | Section | New rule | Upstream |
|---|---|---|---|
| CLARIFY-1 | Intro | "Rewrite unclear interface text. A person knows what happened, what matters and what to do next. Keep factual meaning, product terms and voice." | `clarify.md:3` |
| CLARIFY-2 | Audit the language | Read the whole path. Find ambiguity, jargon, missing consequences, inconsistent terms, repetition, and text that breaks at real widths. | `:7-18` |
| CLARIFY-3 | Message order | The fact now, the next action, the context that changes the decision, the tone. Say each idea once. | `:20-29` |
| CLARIFY-4 | Actions | Verb plus object. Name the object and the consequence of a destructive action. Prefer undo to a confirmation. Never Yes, No, OK or Submit. | `:33-37` |
| CLARIFY-5 | Forms | A persistent label, not a placeholder. Say why each item is asked. | `:39-43` |
| CLARIFY-6 | Errors | What failed, why, and how to recover. No internal codes. Keep the person's input. | `:45-53` |
| CLARIFY-7 | States | Loading, empty (first use, no results, filtered, no permission, failure), success. Absorbs our `:49-51`. | `:55-61` |
| CLARIFY-8 | Help text | Help text and the accessible names of icon-only controls. Absorbs our `:58`. | `:63-65` |
| CLARIFY-9 | Voice and language | Whole translatable messages; no sentence built from fragments; a terminology list. Point to harden §12 and the worst-case corpus for long translations. | `:67-78` |
| CLARIFY-10 | Verify | Each item answered with evidence. "200% zoom" becomes "the largest text size ([_platforms.md])". | `:80-92` |

Where the current content goes:

| Current | Destination |
|---|---|
| `:24-29` hierarchy, `:67` | `layout.md`: new "## Hierarchy and reading order" after `:33` (one primary element per view; three tiers by size, weight, color and space; the squint test) |
| `:24-29` | `critique.md` dimension 2: the squint test |
| `:31-36` cognitive load, `:64-65` | `critique.md` dimension 1: a cognitive-load check (W5) |
| `:41-42` scan path, `:44` tables | `layout.md` Alignment, "in the locale's reading direction" |
| `:59` minimum form fields | `distill.md` Step 5 |
| `:75` "spacious + flat is still flat" | `layout.md` Never |
| `:34`, `:35`, `:52`, `:56-57`, `:73-74` | Drop; each duplicates `distill.md`, `layout.md:33` or the floor |

Also update `_commands.md:19`, `docs/site/guides/design.html:184` and `docs/internal/capability-inventory/moved.json` (one entry for each moved check).
Mode: Persuade and Experience: the offer in one line; name the action the visitor came for; invent no claim. Operate: verb and object; plain system state; one term per concept on every screen. Read: headings answer the reader's question; link text works out of context.

#### C5 — `design/colorize.md` (97 lines → about 107)

| ID | Action | Ours | New rule | Upstream |
|---|---|---|---|---|
| COLORIZE-1 | REPLACE | `:3` | "Introduce color as hierarchy, meaning and atmosphere. Keep the confirmed brand and semantic conventions. Do not replace a visual world under the name of color." | `colorize.md:3` |
| COLORIZE-2 | REPLACE | `:15-20` | "## Audit before choosing": read DESIGN.md, the tokens, the themes and the states; list the commitments, the roles, where gray hides hierarchy, contrast failures and color-only signals; a new identity runs [stage.md](stage.md) Step 3b; give every color a purpose. | `colorize.md:12-23` |
| COLORIZE-3 | REPLACE | `:22-29`, `:75` (60/30/10) | Pick a strategy before a color: Restrained, Committed (one saturated color carries 30–60%), Full palette (3–4 named roles), Drenched. Name the temperature, the dominant relationship, the contrast range and the dosage. Follow the brief, not a percentage. | `colorize.md:25-27`; `new-work.md:65` |
| COLORIZE-4 | ADD | — | "Build roles, not swatches": canvas and raised surfaces; primary and secondary text; action, focus and selection; borders; success, warning, error, info; data series. A theme change remaps the roles. | `colorize.md:29-36,49` |
| COLORIZE-5 | REPLACE | `:34` fixed hues | "Give each state one stable meaning across the product. Take its hue from the platform, the domain and the palette." | `colorize.md:46` |
| COLORIZE-6 | REPLACE | `:46` warm-neutral example | "Tint a neutral toward the brand hue only when it creates cohesion. A plain neutral is valid. Never default to a cream or sand ground." | `colorize.md:44`; `new-work.md:69-73` |
| COLORIZE-7 | REPLACE | `:49` | "Use a gradient only from the world's material. Never use gradient text." | `craft-floor.md:33` |
| COLORIZE-8 | REPLACE | `:53` "Use OKLCH for all color" | "Use the project's color space. For a new palette, prefer a perceptual space such as OKLCH." | `colorize.md:38` |
| COLORIZE-9 | REPLACE | `:61` | Keep the depth rule; remove the CSS words. Add: "A shadow carries an offset and a soft blur." | `craft-floor.md:10` |
| COLORIZE-10 | ADD | — | "Compose the dark theme on its own. Never invert the light theme." | `colorize.md:48` |
| COLORIZE-11 | ADD to `:68-70` | — | "Separate data series by lightness, chroma, shape, label or pattern." | `colorize.md:47` |
| COLORIZE-12 | REPLACE | `:78-81`, `:91` | 3:1 for controls, icons and focus; check every state, overlays, text on images, disabled content and both themes; simulate common vision deficiencies; prefer an explicit color to a chain of translucent overlays; secondary text on a colored ground takes that hue. | `colorize.md:57-65` |
| COLORIZE-13 | REMOVE | `:86` "always add a subtle tint" | — | Reversed upstream (`colorize.md:44`) |
| COLORIZE-14 | REPLACE | `:89` "2–4 beyond neutrals" | "More hues than the strategy names." Resolves the "3–5" of `brand.md:32`. | — |
| COLORIZE-15 | ADD Verify | — | Every color has a stable role; attention lands on the intended action; the palette works in quiet, dense, error and empty states; both themes are composed; it reads as this product. | `colorize.md:67-74` |

Keep: `:38-43`, `:51-57`, the `:61` depth rule, `:63-66`, Never `:89-93`.
Skip: the live `color-amount` parameter.
Mode: Persuade and Experience: palette is voice; color may own regions; Committed, Full palette and Drenched are available. Operate: Restrained by default, and color still does real jobs (shell, state, data, selection); a gray screen with one accent is the category default, not restraint. Read: the world's color owns the frame; the reading column keeps a calm ground.

#### C6 — `design/delight.md` (119 lines → about 125)

| ID | Action | Ours | New rule | Upstream |
|---|---|---|---|---|
| DELIGHT-1 | REPLACE | `:1` | Context line: "the target moments, and the product's emotional range." | `delight.md:1` |
| DELIGHT-2 | ADD after `:19` | — | "## Define one delight thesis": one sentence naming what the person feels at this moment and why that feeling belongs to this product. Choose the smallest means that delivers it. Derive the means from the product. Record the thesis in the design note. | `:25-35` |
| DELIGHT-3 | ADD after `:27` | — | "## Build for the moment": success matches effort and consequence; waiting shows true progress, never fake work; empty and first use make the next action clear first; repeated use stays satisfying on the hundredth use; discovery rewards curiosity, never hides a required function. Generic whimsy is worse than neutral clarity. | `:37-46` |
| DELIGHT-4 | REPLACE | `:109` | I12: "Play or jokes on an error, a loss, money, privacy or blocked work. Lead with the problem and the recovery. Warm words are allowed." Fixes the `:40` conflict. | `:42` |
| DELIGHT-5 | ADD to Never after `:111` | — | Sound without consent, or sound that ignores the mute setting; a claim nobody asked for; an asset cost out of proportion to the moment; a non-essential loop that runs while hidden. | `:54-59` |
| DELIGHT-6 | REPLACE | `:33-35` | "Scale a pressed control to 0.96–0.97, then return it to 1. Use no overshoot on an Operate or Read surface." (Register words until W7.) | I3 |
| DELIGHT-7 | REPLACE | `:63-73` (CSS) | "### Press feedback": return the control on release with the ease-out curve token of `animate.md`; a spring with bounce 0.1–0.3 only where the direction calls for play; never fake a spring with an overshoot curve; platform form: **press feedback** in `_platforms.md`. | I3 |
| DELIGHT-8 | REMOVE | `:75-81` stagger CSS | "Stagger a group entrance per [animate.md](animate.md) → Choreography." | — |
| DELIGHT-9 | MOVE | `:83-94` optimistic UI | To HARDEN-2. `:56` keeps the one-line idea. | `harden.md:205` |
| DELIGHT-10 | REPLACE | `:100` media query | "Does each moment have a reduced-motion form per [animate.md](animate.md)?" | I3 |
| DELIGHT-11 | ADD to Validate | after `:101` | No neighboring product could use the moment unchanged; the interface stays clear without the flourish; repetition does not turn charm into friction; muted, keyboard, touch and translated paths work. | `:63-67` |

Keep: Philosophy `:15-19`, the frequency gate `:24`, performance delight `:52-59`, the Emil credit `:119`.
Mode: Persuade and Experience: personality through voice, composition, motion and discovery; springs may bounce 0.1–0.3. Operate and Read: delight at first use, completion, recovery and mastery; reliability carries the rest.

#### C7 — `design/distill.md` (79 lines → about 110)

| ID | Action | Ours | New rule | Upstream |
|---|---|---|---|---|
| DISTILL-1 | ADD before `:21` | — | "## Find the essence": name the one primary goal of the surface. When the code and the brief do not show it, ask. | `distill.md:18-24,32` |
| DISTILL-2 | ADD to Step 1 after `:27` | — | Count the variation (colors, sizes, weights, component variants). List each competing action and each extra path. | `:12,16` |
| DISTILL-3 | ADD Step 4b after `:51` | — | "### Simplify the system": remove each color, size and weight without a distinct role; one spacing scale; flatten nesting; ask whether three variants cover most cases; remove unused styles and components. Roles, not upstream's raw counts. | `:51-56,80-84` |
| DISTILL-4 | ADD to Step 5 after `:58` | — | One primary action per view; the common choice is the default; remove each step the flow can lose; ask only for the fields the first action needs (from clarify `:59`); for copy, apply `clarify.md`. | `:47,67-78` |
| DISTILL-5 | ADD after `:66` | — | "## Record removed complexity": each removed item, its reason, the new path to it when people still need it, the signal to watch after release. Write it in the design note. | `:104-109` |
| DISTILL-6 | ADD to Validate | `:63-66` | Does one element clearly lead? Does the surface load faster? | `:101-102` |
| DISTILL-7 | ADD to Never | after `:75` | Removing all hierarchy. Simplifying a complex domain below the real task complexity. | `:91-92` |

Do not port: `distill.md:59-63` ("remove sidebars", "full-width"). They conflict with Operate density (`operate.md:59-60`).
Mode: Persuade: one offer and one working action. Experience: cut interface until the work leads. Operate: cut to the task; density is a permission, not clutter. Read: cut chrome around the column; never cut wayfinding.

#### C8 — `design/harden.md` (148 lines → about 188)

The heading `### 11. Worst-case content` is pinned (`design-craft-port.test.mjs:120`). New sections go after it.

| ID | Action | Ours | New rule | Upstream |
|---|---|---|---|---|
| HARDEN-1 | REPLACE and ADD | `:74` "### 10. Error states" | "### 10. Error states and failures": map each server failure to a state: invalid input (field errors); not signed in (sign in, keep the input); no permission (say what is missing and who grants it); not found (a way back); rate limited (when to try again); server fault (plain message, retry, support path); offline, slow or timed out (the state and a retry). Keep the input after every error. When one component fails, the rest of the surface works. | `harden.md:141-172,324` |
| HARDEN-2 | ADD §13 | — | "### 13. Concurrent operations": one submit per action; disable or ignore a repeat while the request runs; a failed optimistic update restores the previous state and says what failed; out-of-order responses show only the latest; two editors of one item see the conflict. Test: press submit 10 times fast; expect one request. | `:202-206,336` |
| HARDEN-3 | ADD §14 | — | "### 14. Interrupted gestures": a gesture ends when the system cancels it, capture is lost, the pointer leaves the control, or the window loses focus. Clear the drag state and release capture. A second finger never takes over a drag. The next tap works without a reload. Name the evidence source. New row **interrupted gesture**. | `:208-211,312,337,341` |
| HARDEN-4 | ADD §12 | after `:112` | "### 12. Language and locale": lay out by start and end edges; mirror direction icons in a right-to-left language; format dates, numbers, currency and plurals with the platform locale formatter; never build a plural from a count test; leave 30–40% spare space for translation; never fix the width of a text container. New rows **start and end edges**, **locale formatter**. | `:88-136` |
| HARDEN-5 | ADD §15 | — | "### 15. Resource cleanup": when a view closes, stop its timers, cancel its subscriptions and pending requests, remove its listeners. A late response never updates a closed view. | `:282-286` |
| HARDEN-6 | ADD to §3 | after `:26` | "Test with the system high-contrast setting on. Every control, focus ring and state stays visible." New row **high-contrast setting**. | `:269-272` |
| HARDEN-7 | ADD to §8 | after `:61` | "On a phone, a text field below 16 px can zoom the page on focus. See [adapt.md](adapt.md)." | `:81` |
| HARDEN-8 | ADD to the States row | `:106` | "offline; a slow network; a request that times out". | `:15-16,302-303` |
| HARDEN-9 | ADD to Output | after `:129` | "### Failures and concurrency": one row per break: surface, case, what broke, fix. | — |
| HARDEN-10 | OPTIONAL | §4 `:28-34`, §5 `:36-43`, §6 `:47-50` | Rename to "Semantics and assistive technology" and write generic rules. New row **accessibility semantics**. I3 debt from before this plan. | — |

Keep: §1, §2, §7, §9, all of §11 (C8 of the craft port), the attribution `:148`.
Do not port: "works without JavaScript" (`:174-178`), polyfills (`:219-223`), JSX (`:93-99`), axe and WAVE (`:313-314`).
Mode: harden has no register section. Add none.

#### C9 — `design/layout.md` (98 lines → about 133, plus about 8 from clarify)

| ID | Action | Ours | New rule | Upstream |
|---|---|---|---|---|
| LAYOUT-1 | ADD before `:15` | — | "## Assess first": reading order by the squint test; grouping by proximity before containers; rhythm; structure (repeated cards truly equal); density for frequency, decision load and mode; focus order matches visual order at each size; extremes (long content, empty, overlays, safe areas). | `layout.md:13-23` |
| LAYOUT-2 | ADD | — | "## Set the spatial thesis": name the primary path, what groups and separates, the leading element, the density and rhythm, and how the structure changes across sizes and inputs. Record it in the design note. Change structure inside the current world. | `:11,33-43` |
| LAYOUT-3 | REPLACE | `:19` "4px or 8px" | "Use a 4-unit base. Extend the project's spacing tokens. Never add a parallel set." Same change at `_design-context.md:71`. | `:49` |
| LAYOUT-4 | REPLACE | `:21-31` | Keep the block, labelled "Web:". | I3 |
| LAYOUT-5 | REPLACE | `:37`, `:43` headings; px values | Mode headings in W7; units, not px, now. | I3 |
| LAYOUT-6 | REPLACE | `:50`, `:84` `max-width: 65ch` | "Limit a prose column to the measure of [_craft-floor.md](_craft-floor.md)." | I13 |
| LAYOUT-7 | REPLACE | `:70-74` breakpoints | "Make each responsive change structural. Reorder, collapse, reflow or reveal by importance. Prefer components that respond to their container. Check narrow, middle, wide, zoomed and translated states." | `:23,52-53` |
| LAYOUT-8 | ADD to Apply | after `:33` | Group by meaning before adding a container; depth only for state or hierarchy; repetition supports recognition; optical alignment only after you inspect the render. Plus the clarify "Hierarchy and reading order" block (C4). | `:47,56-59` |
| LAYOUT-9 | ADD Verify | before `:88` | The squint test still shows the order; the path is clear at every size; density matches frequency; extremes hold; keyboard, touch and screen-reader order match visual order. Each answer carries evidence. | `:61-72` |

Keep: `:33`, `:57-60`, `:62-66`, `:78-82`, Never `:92,94`.
Skip: `layout.md:25-31,70,76-84` (detector and live params); `gap` (web-only).
Mode: Persuade and Experience: asymmetric or disruptive composition when the world earns it. Operate: predictable structure, stable density; responsive change is structural. Read: a calm column at a real measure; the frame carries the world.

#### C10 — `design/onboard.md` (91 lines → about 119)

| ID | Action | Ours | New rule | Upstream |
|---|---|---|---|---|
| ONBOARD-1 | ADD before `:1` | — | Context line: "the first-value moment, and the people's experience level." | `onboard.md:1` |
| ONBOARD-2 | ADD after `:9` | — | "## Define first value": the one action that proves the value; the least a person must learn to reach it; the signal that shows onboarding worked. | `:9-26` |
| ONBOARD-3 | ADD to types after `:41` | — | "Cleared by the person: keep it light, make it easy to create again, do not teach again." | `:189` |
| ONBOARD-4 | ADD after `:70` | — | A tour has 3–7 steps; teach the workflow, not the control; sample data makes each step work; the person can replay the tour from help. | `:131-139` |
| ONBOARD-5 | ADD after `:76` | — | Record each finished or dismissed step. Never show the first-run flow to a returning person again. Never show a dismissed hint again. | `:211-221` |
| ONBOARD-6 | ADD after `:76` | — | Ask only for the information the first action needs. Say why you ask for each item. | `:71-72` |
| ONBOARD-7 | REPLACE | `:80` "~100ms … `translateY`" | "Stagger the chunks 30–80 ms apart per [animate.md](animate.md) → Choreography. Combine opacity, a small offset and a light blur." | `animate.md:144-145` |
| ONBOARD-8 | REPLACE | `:30-38` HTML block | A plain-text example of an empty state. | I3 |
| ONBOARD-9 | ADD "## Measure" after `:87` | — | The skip rate, the completion rate, the drop-off step, the time to first value. Write them in the design note. | `:223-232` |
| ONBOARD-10 | ADD to Validate | `:87` | Can a returning person reach their work with no onboarding in the way? | `:221` |
| ONBOARD-11 | REPLACE | `:72-76` header | Rename to "## Never". | — |

Keep: `:17-21`, `:23-28`, `:48-52`, `:56-60`, `:62-65`.
Mode: Persuade: the first run is the landing page; the action works. Experience: the work leads; no tours. Operate: a teaching path to first value; empty states teach; no page-load choreography. Read: onboarding is wayfinding.

#### C11 — `design/optimize.md` (120 lines → about 115)

| ID | Action | Ours | New rule | Upstream |
|---|---|---|---|---|
| OPT-1 | REPLACE | `:1` | "Treat performance as a feature. Find the real bottleneck on this surface. Fix it, then measure again. Do not optimize what is not slow." | `optimize.md:1,20` |
| OPT-2 | REPLACE | `:19-43` Step 1 | Measure first: load time, input response, layout shift, frame rate, memory, payload. For each problem: what is slow, the cause, how bad, who it affects. Tools: the **profiling tools** row of `_platforms.md` (move the commands there). | `:7-18` |
| OPT-3 | ADD | — | Measure on a real mid-range device with a slow network. Fix the largest bottleneck first. | `:236,244-245` |
| OPT-4 | REPLACE | `:58-66` Images, and the `:65` snippet | Never defer content in the first viewport. Load media below it on demand. Reserve each media size. Serve images at displayed size in the most efficient format. Remove `loading="lazy"` from the hero snippet. Rows **deferred media loading**, **reserved media size**. | `:28-34,243` |
| OPT-5 | REPLACE | `:68-72` Fonts | Show text in a fallback face while a custom face loads; never hide text; load only the weights and characters in use; prefer system faces on Operate and Read. Row **text shown during font load**. | `:64-69` |
| OPT-6 | REPLACE | `:74-97` CSS and Render | Remove unused styles and code; batch layout reads, then writes; render only the visible rows of a long list; skip off-screen work; throttle scroll, resize and input handlers; do not rebuild a view whose data did not change. Keep the read/write snippet as "Web:". Row **long-list virtualization**. | `:87-109,153-167` |
| OPT-7 | ADD "## Network" | — | Page the data; request only the fields shown; compress and cache; show an optimistic result while a save runs. | `:169-188` |
| OPT-8 | ADD "## Targets" | — | "Meet the platform's responsiveness targets. The web targets and their severities live in [web.md](../runtime-adapters/web.md). Verify measures them." No numbers in the move (I14). | — |
| OPT-9 | ADD to Output `:101-112` | — | Compare before and after on the same device and network; every function still works; accessibility did not get worse; record the device and the network. | `:238-256` |

Keep: `:13-17`, `:45-54` (C5), the output format, the attribution.
Note: upstream `optimize.md:37-43` has the same hero-lazy bug as ours. Do not port it.
Mode: Persuade and Experience: heavy media and effects need more performance work; the first viewport loads first. Operate: input response and dynamic data lead. Read: time to readable text and no layout shift while reading.

#### C12 — `design/overdrive.md` (126 lines → about 121)

| ID | Action | Ours | New rule | Upstream |
|---|---|---|---|---|
| OVR-1 | REPLACE | `:3` | "Make one part of the interface feel extraordinary: a transition, a large table, a form or a page. The surface and its mode decide what extraordinary means." | `overdrive.md:8-10` |
| OVR-2 | ADD after `:19` | — | "## Propose before you build": write two or three directions (name, technique, what the person sees and feels, cost on target devices, fallback). Ask the person to pick one per [_gate-question.md](../_gate-question.md). Do not write code before the pick. Load `_craft-floor.md` after the pick. | `:12-20` |
| OVR-3 | ADD | — | "Change how a feature feels, not what the product does. Route a new capability (offline, real-time collaboration) to `shape`." | `:82` |
| OVR-4 | REPLACE | `:21-81` toolkit | A toolkit by goal, in generic terms: cinematic transitions (shared-element transition, spring); scroll-linked motion; rendering beyond standard views (GPU drawing surface, worker thread, vector filters); live data (virtualized lists, GPU charts, animated data transitions); device (sound, sensors). DELETE `:35-37` (purple mesh), `:39-45` (gradient text), `:58-67` (section reveal), `:75-81` (weight pulse). Replace `:54` with "Use gradient text or decorative glass only when the brief names them." Add "Tie one authored moment to scroll. Never give every section the same entrance." Rows **shared-element transition**, **scroll-linked animation**, **GPU drawing surface**. | `:46-80`; `craft-floor.md:13,33-34` |
| OVR-5 | REPLACE | `:85-91` | Design against the 8.3 ms frame budget of `animate.md`; below 50 frames a second on the target device, simplify; start a heavy resource only near the viewport; stop an off-screen effect. Restate the cost list in generic terms. | `:104-107` |
| OVR-6 | REPLACE | `:97` | "Animate cheap properties on the render thread (see animate.md → Performance)." Bounce sentence: register words until W7. | C1 vocabulary |
| OVR-7 | ADD "## Progressive enhancement" | — | Check platform support before you use a technique. A device without support gets the fallback. The fallback looks finished. | `:86-100` |
| OVR-8 | REPLACE | `:108-114` Validate | "a mid-range phone of the audience"; "the reduced-motion setting"; check timing and smoothness on the running surface; remove the effect once, and if nobody misses it, delete it; ask whether it fits this audience. | `:22-24,109-127` |
| OVR-9 | ADD to Never | `:116-120` | Sound without an opt-in; an effect that hides weak layout or type; a new platform feature with no fallback. | `:113-118` |

Keep: Philosophy `:15-19`, the one extraordinary thing `:99-106`, the bounce allowance, the cost table in generic form.
Mode: Persuade and Experience: no taste ceiling; everything expensive earns its cost. Operate: one extraordinary moment in how a task feels (a dialog that grows from its trigger, a 100,000-row table that never stutters, an optimistic save). Read: invisible but felt (instant search, smooth navigation); nothing moves in the column.

#### C13 — `design/polish.md` (129 lines → about 164)

| ID | Action | Ours | New rule | Upstream |
|---|---|---|---|---|
| POL-1 | REPLACE | `:1` | "Polish refines. It never hides a redesign. Keep the established world, content, behavior and everything outside scope. When the concept is wrong, say so and recommend `bolder` or an amend." | `polish.md:3,5` |
| POL-2 | ADD "## Establish the system" before `:13` | — | Read DESIGN.md, the tokens, the shared components and the neighboring flows. Classify each drift: missing token, one-off, conceptual mismatch, local defect. Fix the cause at the narrowest correct level. Ask when a system principle is not clear. | `:7-18` |
| POL-3 | ADD "## Gather evidence" | — | Use the feature at representative sizes and device classes. Find the quality bar, the constraints and the work unfinished on purpose. Use a critique note in `design-notes/` as one input. | `:20-27` |
| POL-4 | ADD "## Triage" | — | Fix in order: 1 broken tasks, data loss, misleading state, inaccessible paths; 2 missing states; 3 flow, hierarchy, responsive and system drift; 4 visual and motion inconsistency; 5 code and asset cleanup. Do not perfect one corner while the rest is below the bar. | `:37-47` |
| POL-5 | ADD "## Flow and hierarchy" | — | Match the terms, disclosure and save behavior of neighboring flows; make the primary task and the current state obvious; connect arrival, empty and recovery paths. | `:51-55` |
| POL-6 | REPLACE | `:22-23` | "Hang the opening quotation mark of a block quote outside the text edge." Row **hanging punctuation**. "Control line breaks per [typeset.md](typeset.md) → Line breaks." | I3 |
| POL-7 | ADD to `:17-23` | — | Test measure, wrapping, translation length, zoom and font loading at every supported width. | `:61-62` |
| POL-8 | REPLACE | `:36-45`, `:59` | Add Success to the states. `:59` becomes "Load worst-case content per [harden.md](harden.md) §11." | `:73,76` |
| POL-9 | ADD "## Content and code" | — | Consistent terms, capitals and punctuation; ask before changing a factual claim; remove debug output, dead code, unused imports and obsolete styles; replace a custom part with the shared component; no token for one local exception. | `:78-83` |
| POL-10 | REPLACE | `:120`; ADD to `:61-65` | "System parts carry the design: text selection, caret, scrollbar, focus ring, link underline, table numerals. Theme their color. Never change their behavior." Never item: "Reinventing the behavior of a system part." Row **system-part colors**. | `craft-floor.md:15` |
| POL-11 | ADD to `:47-54` | — | "Do not add motion only to make polish visible." | `:75` |
| POL-12 | ADD to Validate `:103-113` | — | Walk the full path with mouse, keyboard and touch; check zoom, focus and screen-reader names; check runtime errors, layout shift and input response; check DESIGN.md and scope; run the floor's Verify list; end with a diff review that removes accidental changes and temporary files. | `:85-97` |
| POL-13 | OPTIONAL | `:78`, `:87`, `:90`, `:97` | Concepts in rule text; keep the fenced code as "Web:". | I3 |

Keep: `:25-34`, `:47-54`, `:56-65`, the Krehel block `:67-101`, `:119`, the attribution.
Skip: critique-storage `polish.md:29-35,99-105`; the detector `:95`.
Mode: Persuade and Experience: details surprising in their specificity. Operate: behaves exactly as a skilled user expects; no missing state. Read: a calm column; consistent wayfinding; known forms for code, tables and notes.

#### C14 — `design/quieter.md` (91 lines → about 116)

| ID | Action | Ours | New rule | Upstream |
|---|---|---|---|---|
| QUI-1 | REPLACE | `:3` | "Reduce intensity without losing personality. Quiet design needs more precision than bold design. Do not make the result generic." | `quieter.md:1,44` |
| QUI-2 | ADD to `:17-23` | — | Contrast noise (too many hard contrasts side by side); scale noise (every element large); the context questions: purpose, audience, what works, the core message. | `:18-29` |
| QUI-3 | ADD | — | "When the purpose, the audience or the core message is not clear from the code and the design record, ask per [_question-craft.md](../_question-craft.md). Do not guess." | `:31` |
| QUI-4 | ADD | — | "Generic quiet is gray text on white, one sans at one weight, and a grid of identical cards. That result fails. Restraint keeps a point of view." | `:33` |
| QUI-5 | REPLACE | `:44` "80%+ neutral" | "Keep the chosen color strategy. On a Restrained surface, keep 80% or more neutral. On a Committed, Full palette or Drenched surface, lower the chroma instead. Reduce a loud color's chroma to 70–85% of its value." | `:51,57` |
| QUI-6 | ADD to `:50-53` | — | "Step heavy weights down: 900 to 600, 700 to 500." | `:60` |
| QUI-7 | ADD to `:33-36` | — | Reduce extreme corner radii; flatten stacked layers; remove glows and stacked shadows. | `:65-69` |
| QUI-8 | REPLACE | `:59-63` | Shorten travel to 10–20 px; a strong ease-out curve token; never bounce; remove motion with no named purpose (animate.md Gate 2). | `:71-76` |
| QUI-9 | ADD "## Composition" | — | Reduce the jumps between sizes; align stray elements to the grid; even the spacing rhythm. | `:78-81` |
| QUI-10 | ADD to Validate | `:72-78` | Is it still distinctive? Does the point of view survive? Is long text easier to read? | `:94-97` |
| QUI-11 | ADD to Never | `:84-87` | Removing all color (quiet is not grayscale); making everything small and light. | `:85,88` |

Keep: the Diagnose taxonomy `:17-23`, "remove first, then reduce" `:27-36`, the semantic-color guard `:46`, Copy `:65-70`.
Mode: Persuade and Experience: more restraint and air; drama reduced, not removed. Operate and Read: less noise; the tool disappears into the task.

#### C15 — `design/typeset.md` (132 lines → about 152)

| ID | Action | Ours | New rule | Upstream |
|---|---|---|---|---|
| TYP-1 | REPLACE | `:3` | "Typography carries information, hierarchy and voice. Improve it inside the established world. A new identity runs through the design stage and updates DESIGN.md." | `typeset.md:1,11` |
| TYP-2 | REPLACE | `:15-20` | Heading "Font selection (brand register)" until W7, then "(Persuade and Experience)". List: Fraunces · Playfair Display · Cormorant · Lora · Crimson · Newsreader · Syne · Space Grotesk · Space Mono · IBM Plex · Inter as a display face · DM Sans · DM Serif · Outfit · Plus Jakarta Sans · Instrument Sans. "A face from this list needs a reason no other face meets. A subject association is never that reason. On Operate and Read surfaces, system faces and workhorse UI faces are correct." Make `brand.md:20` and `_design-context.md:57` point here: one list. | `new-work.md:67` |
| TYP-3 | ADD "## Assess" after `:20` | — | Answer each question with a file, a selector or a computed value: authority and fit; hierarchy; scale and consistency; reading; stress (long headings, translation, zoom, narrow containers, missing weights, fallback); delivery. | `:17-23` |
| TYP-4 | ADD "## Set the system" | — | Before you edit, state the roles, the contrast between roles, the measure, the faces and the constraints. Use the fewest roles and families that make the hierarchy clear. Name roles by purpose. | `:32-42` |
| TYP-5 | REPLACE | `:49` `7rem` | `6rem` maximum. Label the block "Web:". | `craft-floor.md:12` |
| TYP-6 | REPLACE | `:79`, `:122` | "Keep body prose at 65–75 characters per line. A narrow column may go down to 45. Give wider lines more line height." (I13) | `typeset.md:21,47` |
| TYP-7 | REPLACE | `:90` | "Compensate light text on a dark ground on three axes: 0.05–0.1 more line height, a little more tracking, one weight step up when the face needs it." | `:48` |
| TYP-8 | ADD | — | "Mark a paragraph boundary with spacing or a first-line indent. Do not use both." | `:55` |
| TYP-9 | REPLACE | `:96-99` | "## Line breaks": balanced wrap on headings and short centered blocks; even-last-line wrap on body text; a two-word last line is acceptable; when a column is too narrow, edit the copy or widen the column; break a heading by hand only between phrases and check that break at every width. Rows **balanced wrap**, **even-last-line wrap**. | `:59-67` (`6c96b3c89`) |
| TYP-10 | REPLACE | `:101-102` | Tabular numerals for numbers that update or align in columns, not for static numbers, phone numbers or versions. Row **tabular numerals**. | — |
| TYP-11 | MOVE | `:104-105` font smoothing | To `_platforms.md`, web column only. | I3 |
| TYP-12 | ADD to Spacing | — | Keep repeated roles identical across screens and states; respect zoom, the user's font settings and the largest text size; load faces per [optimize.md](optimize.md) → Fonts. | `:50-54` |
| TYP-13 | REPLACE | `:120` "16px (body text)" | "Body text below the platform body size (16 px on the web), unless a dense role, a platform convention or a user setting needs it." | `:46` |
| TYP-14 | ADD Verify | — | Roles read clearly without the copy; long text reads well at every width and language; loading causes no invisible text and no reflow; zoom and text scaling work. Evidence for each. | `:69-80` |

Keep: `:24-35`, Hierarchy `:64-71`, display tracking `:83,112`, Common problems, the Never items for 12 px captions, justified text and Thin weight, the attribution.
Skip: `detect --scope type` (`:24-30`), the detector rule names (`:67`), live params (`:82-90`).
Mode: Persuade and Experience: display type may carry the voice; ratio 1.25 or more; the reflex list applies. Operate: one family, a fixed scale at 1.125–1.2, system faces allowed. Read: the measure and a reading face lead; monospace only for code and labels.

#### C16 — `design/_platforms.md` (new rows)

The moves above add these generic terms. Each row gets a web, iOS, Android (Compose) and desktop form. **W0 checks every non-web form against current platform documentation**, as the craft port did.

| Term | From |
|---|---|
| minimum hit area | ADAPT-3 |
| window size class | ADAPT-6 |
| coarse pointer | ADAPT-11 |
| "## Idioms" table (navigation, controls, font stacks) | ADAPT-7 |
| interrupted gesture | HARDEN-3 |
| start and end edges | HARDEN-4 |
| locale formatter | HARDEN-4 |
| high-contrast setting | HARDEN-6 |
| accessibility semantics (optional) | HARDEN-10 |
| press feedback | DELIGHT-7 |
| profiling tools (extends `:55-62`) | OPT-2 |
| deferred media loading, reserved media size | OPT-4 |
| text shown during font load | OPT-5 |
| long-list virtualization | OPT-6 |
| shared-element transition, scroll-linked animation, GPU drawing surface | OVR-4 |
| hanging punctuation | POL-6 |
| system-part colors | POL-10 |
| balanced wrap, even-last-line wrap, tabular numerals, font smoothing (web only) | TYP-9, TYP-10, TYP-11 |

Extend the term list of `design-craft-port.test.mjs:33-36` with these terms. Extend its platform-name scan (`:42-53`) to the 15 moves only after the rows exist.

### 6. Changes outside the moves

#### 6.1 Design lane files

| File | Change |
|---|---|
| `design.md:34` | Keep the `_design-context.md` row. Add `design/_craft-floor.md` rows for `mode:stage`, `mode:audit`, `mode:critique`, `mode:upkeep`. |
| `design.md:84`, `:88`, `:96`, `:100` | Stage: the floor loads at Step 4. Import: add the floor. Upkeep: the record guard. Review: "Load [design/_craft-floor.md]…" in place of "→ Absolute bans". |
| `design/stage.md` | `:46` reword (3.4). Insert the floor load at `:53`. Move pass `:111`: read the floor as a checklist. `:21` keeps loading `_design-context.md`, without bans after W1. |
| `design/contract.md:148` | "…plus the refusals in `_craft-floor.md`". |
| `design/_lane.md:3`, `:69-72` | "(register, laws)"; the floor named in the implement, verify, review and retro duties. |
| `design/_output.md:35` | "confirm none of the refusals in `_craft-floor.md` were introduced". |
| `design/_commands.md:19-20` | New clarify description (C4). Drop "(border-stripe ABSOLUTE BAN)". |
| `design/audit.md:7`, `:56` | Accessibility from the floor's Verify list; "Load [_craft-floor.md] → Refuse". |
| `design/critique.md:46`, `:64` | Floor pointers. W5 adds more. |
| `design/record.md` after `:72` | New "Floor guard" section with a Load sentence. |
| `design/extract.md:134-139` | "Do not record a floor refusal as a system pattern." |
| `design/brand.md:9`, `:20`, `:52`; `design/product.md:47`, `:52` | Point to the floor; the reflex list points to TYP-2; `:52` scrollbars per 3.5. |
| `intake/brainstorm/_design.md` | "Do not load `design/_craft-floor.md`." |
| `intake/fix.md:66` | `.impeccable.md` becomes "PRODUCT.md and DESIGN.md when present". |

#### 6.2 Lifecycle stage files

| File | Change |
|---|---|
| `implement.md:43` | Add the row `design/_craft-floor.md | procedure | mode:ui`. |
| `implement.md:100` | Drop "absolute bans," from the sentence. |
| `implement.md:130` | Replace the inline floor paragraph with "Load [design/_craft-floor.md](…) before the first UI file edit of the slice." Delete the restated principles list (about 90 words). |
| `plan.md:66` | Drop "absolute bans,". |
| `slice.md:67` | "gives the design floor" becomes "gives the register". |
| `verify/_sub-agents.md:95` | "load `design/_craft-floor.md` → Verify and Refuse". |
| `review/_select.md:21` | "single-sourced from `…/_craft-floor.md`". |
| `retro.md` | Add the floor row (`mode:design`), or rely on `record.md`'s Load sentence (6.3). |

#### 6.3 Word budgets

Measured on 2026-10-20 with `node scripts/measure-load.mjs`:

| Key | Core now / target | Instructed now / target | Spare |
|---|---|---|---|
| implement | 4,801 / 4,850 | 15,800 / 23,950 | 49 core |
| plan | 6,458 / 6,500 | — | 42 core |
| verify | 5,644 / 5,650 | 10,925 / 12,700 | **6 core** |
| slice | 4,369 / 4,500 | — | 131 core |
| retro | 4,392 / 4,500 | 8,054 / 9,750 | 108 core |
| review | 3,365 / 4,500 | 17,221 / 18,700 | 1,479 instructed |
| design | 2,702 / 4,500 | — | 1,798 core |

A Requires row costs about 8 words, because the count splits on whitespace.
- `implement`: the deleted principles list at `:130` pays for the row and the Load sentence.
- `verify`: no room for a Requires row. Put the load in `verify/_sub-agents.md` only; the requires test does not scan sub-procedures.
- `retro`: put the guard in `record.md`, which retro already loads.
- `review` and `verify` instructed: keep `_craft-floor.md` at or under 1,200 words.

#### 6.4 Tests and generated files

| File | Change |
|---|---|
| `tests/unit/skills/claude5-prompting-repair.test.mjs:101-107` | The single holder of the ban heading becomes `_craft-floor.md`. |
| `tests/unit/skills/requires-tables.test.mjs` | Must pass: every Load sentence in a stage reference has a Requires row; every row exists on disk. |
| `hooks/mod/requires.ts` | Regenerate with `node scripts/build-requires.mjs`. `build-requires.test.mjs` runs `--check`. |
| `tests/unit/skills/design-craft-port.test.mjs` | `:69` forbids the literal `0.01ms` everywhere: rephrase the upstream reduced-motion "kill" check (audit, W5). `:77` regex in W7. `:120` harden heading kept. `:125-127` adapt checklist kept. `:33-36` term list extended. |
| `tests/unit/skills/design-lane.test.mjs:234-289` | Keep the pinned stage and contract phrases. |
| `tests/unit/skills/contract-graph.test.mjs` | Do not rename any `02c-craft.md` section that consumers cite. |
| `docs/internal/capability-inventory/prose-budget.json` | No exception needed if each file stays under 300 lines. Check the emphasis tokens. |
| `docs/internal/capability-inventory/moved.json` | Entries for the moved clarify checks. |
| `scripts/verify-host-neutrality.mjs` | Must pass: no "Codex" in the Model tells section. |

### 7. Critique and audit (W5, I9)

#### 7.1 Critique (`design/critique.md`, 142 lines)

Recommendation: add the parts that give coverage and a comparable number. Put the long reference material in a new `design/_heuristics.md` (300-line cap), so `critique.md` stays short.

| ID | Change | Upstream |
|---|---|---|
| CRIT-1 | A "Design specificity verdict" first: could a neighboring product ship this unchanged? | `critique.md:158-166` |
| CRIT-2 | Nielsen's 10 heuristics, each 0–4. Heuristics 7 (flexibility) and 10 (help) may be `n/a` on a Persuade or Experience surface; rescale the total. Bands: 36–40 excellent, 28–35 good, 20–27 acceptable, 12–19 poor, 0–11 critical. Rubrics in `_heuristics.md`. | `:133-157,437-657` |
| CRIT-3 | The cognitive-load check: 8 items; 0–1 failures low, 2–3 moderate, 4+ critical; flag a decision point with more than four visible options. Absorbs clarify `:31-36`. | `:366-399` |
| CRIT-4 | Personas: Alex (power user), Jordan (first-timer), Sam (accessibility), Riley (stress tester), Casey (distracted mobile). A selection table picks 2–3 by interface type. Each gives red flags. Riley points to the worst-case boards, not a new list. | `:676-854` |
| CRIT-5 | Severity: P0→blocker, P1→high, P2→medium, P3→low; `nit` for minor observations. The schema enum (`tests/frontmatter.schema.json:130-139`, `:1455`, `:3086`) does not change. | `:661-672` |
| CRIT-6 | Isolation: in `/wf review` the critique already runs as an isolated child reviewer. For freestanding `/wf design critique`, dispatch the design review to a fresh-context sub-agent per `_subagents.md`. Read `06-verify-*.md` evidence only after the review is written. Print a degraded-method line when isolation is not possible. | `:5-16,126-131` |
| CRIT-7 | Close with 2–4 targeted questions with concrete options, after the report. | `:270-292` |

Optional: new frontmatter fields `heuristics-score`, `heuristics-band`, `specificity-verdict`. The schema allows them (no `additionalProperties: false`), but `renderers/design-critique.mjs` does not show them. Showing them needs a renderer change, a `dist` rebuild and new snapshots.

Keep: §8 motion feel and the opportunity sweep (`:67-77`), §9 identity and direction (`:79-84`), the board comparison and the no-redraw rule (`:113-114`), "rejected candidates" (pinned, `design-craft-port.test.mjs:88`).

#### 7.2 Audit (`design/audit.md`)

| ID | Change | Upstream |
|---|---|---|
| AUD-1 | Dimension 5 becomes "Implementation integrity": drift from DESIGN.md, shortcuts, interchangeable structure, scored against the floor's Refuse list. | `audit.md:58-64` |
| AUD-2 | Add: broken touch interaction (mouse-only handlers, no touch handling, stuck drag state); the evidence names its source. | `:51` |
| AUD-3 | Add: a layer hint left on at rest; a global reduced-motion switch that sets every duration to zero. Do not write the literal `0.01ms` (test `:69`). | `:15,30` |
| AUD-4 | Reconcile `:27` with the floor's motion materials (3.5): a cost flag, not a ban. | — |

Keep: the reuse of verify measurements `:5`, the worst-case responsive check `:50`, the drift check `:63-68`, the verdict mapping `:70-79`, the board comparison `:119`.

### 8. Directions and the contract (W6)

#### 8.1 Step 3b directions (`design/stage.md:40-49`)

Today: three directions, one named axis each. Add anti-convergence pressure from upstream `new-work.md:45-51`, without the dice:

| ID | Change |
|---|---|
| DIR-1 | Before you choose, name the mechanism, the scene and the cultural home of the product. |
| DIR-2 | Name the rut: the page this category always ships, and its predictable opposite. Keep both out of the candidates. |
| DIR-3 | List seven candidates from the audience's culture. Span at least three material families. On an Operate or Read surface, never take a candidate from the tools the audience operates (the costume rule). |
| DIR-4 | Draw three of the seven as directions, one axis each (keep the current rule). Record the four you did not draw, with one line each. |
| DIR-5 | Add one canon card: the category standard, played straight, never recommended. It is the person's standing exit. |
| DIR-6 | After two rounds with no pick, ask what quality is missing. Do not draw a third round blind. |

The heading `## Step 3b — Directions` is pinned. Keep it.

#### 8.2 The contract (`design/contract.md:140-149`)

Add two sections to `02c-craft.md`. Do not rename existing sections (`contract-graph.test.mjs`).
- `## Thesis`: the default arrangement this design refuses, in one sentence.
- `## Own world`: what makes the design recognizable with all content removed.

Add a first-viewport memory test to `## North-star mock`: "Name the one thing a person remembers after five seconds." (upstream `new-work.md:128`).

### 9. Modes and templates (W7 and W8, I8 and I15)

#### 9.1 Register to modes (W7, I8)

Blast radius: 49 occurrences outside the moves, 19 inside.

| Area | Files |
|---|---|
| Schema (runtime payload) | `tests/frontmatter.schema.json:460,467,508,1408,1419`; read by `lib/runtime-store.mjs:41`, `hooks/post-write-verify.mjs:643` |
| Renderer | `renderers/design-contract.mjs:58`, `dist/renderers/design-contract.mjs:60` |
| Test fixture | `tests/unit/gap-closure/design-phase1.test.mjs:217` |
| Design lane | `design.md:113`; `_design-context.md` 3, 7, 11, 12, 22–37, 43, 55, 91, 97, 132; `setup.md:7,20-21,52-53`; `teach.md:34-35,60-61`; `brand.md`; `product.md`; `stage.md:21`; `contract.md:34,42,123`; `shape.md:64,102`; `critique.md:3-7,38,40,65`; `audit.md:56,58`; `_output.md:27,35,52`; `_lane.md:3,51`; `_commands.md:11` |
| Stages | `plan.md:66,67`; `implement.md:99,100,132`; `review/_select.md:22`; `review/_context.md:18`; `review/interface-craft.md:12,51`; `intake/brainstorm/_design.md:18` |
| Moves | The `## Register` section of 14 moves; `bolder:33`, `delight:35,45`, `overdrive:97`, `typeset:15` |
| Doc site | `docs/site/guides/design.html:109,152,220,247-251` |

Steps:
1. Schema: `mode: persuade|operate|read|experience`. Keep `register` as a deprecated optional field that the validator maps: brand → persuade, product → operate. Do not require either until a migration release.
2. The mode is chosen per surface. `02b-design.md` records one mode per surface in the content inventory. `02c-craft.md` carries `modes:` keyed by surface. PRODUCT.md no longer carries a register. A `## Register` section in an old PRODUCT.md is read as a hint and reported once as deprecated, with the reason (upstream `CLAUDE.md`: models keep a field told only that it is deprecated).
3. Replace `brand.md` and `product.md` with `mode-persuade.md` (Persuade and Experience), `mode-operate.md` and `mode-read.md`. Each holds `## Directions` and `## Boards`. Port from upstream `mode-*.md` and `operate.md`. Step 3b and Step 4 load the mode file of each surface.
4. Each move's `## Register` becomes `## Mode` with the outline in section 5.
5. `shape.md:102` asks "register (utilitarian / expressive / editorial)", a third vocabulary. Replace it with the mode question.
6. Renderer, `dist` rebuild, snapshots, the doc site.

#### 9.2 PRODUCT.md and DESIGN.md templates (W8, I15)

PRODUCT.md (`setup.md:49-73`, `teach.md:57-80`): add Positioning, Operating Context, Capabilities and Constraints, Brand Commitments, and **Evidence on Hand** ("absences future work must not fabricate"), from upstream `init.md:60-98`. Recommendation: move the aesthetic questions (three brand words, tone, references) out of setup into the brief round of `shape`, as upstream does (`init.md:41`).

DESIGN.md (`setup.md:79-99`): adopt upstream's eight section headings (Overview, Colors, Typography, Layout, Elevation & Depth, Shapes, Components, Do's and Don'ts). Do not adopt the token YAML frontmatter: `hooks/pre-write-validate.mjs:208-235` refuses a DESIGN.md frontmatter fence without `schema: sdlc/v1` and `type: project-context`.

### 10. Waves

| Wave | Content | Files | Needs |
|---|---|---|---|
| W0 | Re-check every anchor at HEAD. Check each new `_platforms.md` form against current platform documentation. Record the word budgets. | read only | — |
| W1 | The craft floor: create `_craft-floor.md` (3.2); cut `_design-context.md` (3.3); every load point (3.4, 6.1, 6.2); the floor pointer in all 15 moves; the anti-convergence block; tests and `requires.ts` (6.4). | design lane, stages, tests | I10, I11, I13 |
| W2 | Defect fixes (section 1, Problem 2): ADAPT-8, BOLDER-4, BOLDER-5, COLORIZE-3, -5, -6, -13, DELIGHT-4, ONBOARD-7, OPT-4, OVR-4 deletions, POL-10, QUI-5, TYP-2, TYP-5; `intake/fix.md:66`; `verify/_artifact.md:122` (I14). | 11 move files, `fix.md`, `verify/_artifact.md` | I12, I14 |
| W3 | Move ports C1–C3, C5–C15 (all IDs not in W2), and `_platforms.md` rows (C16). | 14 moves, `_platforms.md`, craft-port test | W0 platform check |
| W4 | Clarify realignment (C4) and its moves into layout, distill and critique. | clarify, layout, distill, critique, `_commands.md`, `moved.json`, doc site | — |
| W5 | Critique and audit (section 7). | critique, `_heuristics.md` (new), audit | I9 |
| W6 | Directions and contract (section 8). | `stage.md`, `contract.md` | — |
| W7 | Register to modes (9.1). | schema, renderer, dist, design lane, stages, moves, doc site | I8 |
| W8 | Templates (9.2). | setup, teach, `record.md`, `shape.md` | I15 |
| W9 | Docs and release: `docs/site/guides/design.html`, CHANGELOG (with the credit fix of I6), version bump. | docs, carriers | all built waves |
| W10 | Live runs: one design stage on a new surface (check that Steps 1–3b run without the floor and Step 4 loads it), one implement slice, one `/wf design critique`. | — | W9 |

W1 goes first: every later wave writes the floor pointer or cites `_craft-floor.md`. W2 can ship alone as a patch release right after W1. W3 and W4 touch different files and can run in parallel. W7 is last among the content waves because it rewrites the `## Register` section of every move: doing it last means each move is edited for modes once, after its content is settled.

### 11. Questions for the PO (answered)

All eight were answered on 2026-10-20: the PO accepted each recommendation. Section 2 records them as I8–I15.

| # | Question | Recommendation (accepted) | Wave |
|---|---|---|---|
| Q1 | Change the register (brand/product) to four modes (Persuade, Operate, Read, Experience), chosen per surface? | Yes. Docs and portfolio surfaces have no correct register today. Keep `register` readable for old workflows. | W7 |
| Q2 | Add back Nielsen scoring, cognitive load and personas, which v8.27 dropped? | Yes, in `_heuristics.md`, with P0–P3 mapped to our severities and Riley pointing to the worst-case boards. | W5 |
| Q3 | Keep the ban on `#000` and `#fff`? | No. Upstream removed it because it pushed pages toward cream (`9ffd3211d`), and our own floor refuses a cream default. | W1 |
| Q4 | Make the kicker or eyebrow label an absolute refusal, not "unless the brief names it"? | Yes. Upstream found that models ship them even when the floor is loaded (`861682eeb`, `33a1c5fca`). | W1 |
| Q5 | Delight on an error: keep our total ban, or adopt "warmth allowed, jokes not"? | Adopt upstream. It also fixes our `delight.md:40` conflict. | W2 |
| Q6 | Body measure: 65–75 characters (upstream floor) or 45–75 (upstream typeset)? | 65–75 for body prose in the floor; typeset allows 45 for a narrow column. | W1 |
| Q7 | Web vitals severity: `runtime-adapters/web.md:71` rates LCP and CLS as WARN; `verify/_artifact.md:122` rates all three HIGH. Which wins? | `web.md` is the measuring source; make `_artifact.md` agree with it. Small; can ride W3. | W3 |
| Q8 | PRODUCT.md: add Evidence on Hand, Positioning and Brand Commitments, and move the aesthetic questions to `shape`? DESIGN.md: adopt the eight section headings? | Yes to both, without the token frontmatter. | W8 |

### 12. Verification

1. `npm run build && npm test` in `plugins/sdlc-workflow`, after each wave.
2. `npm run verify:prose`, `verify:capabilities`, `verify:neutrality`, `verify`.
3. `node scripts/measure-load.mjs`: no key above its target (6.3).
4. `node scripts/build-requires.mjs --check`.
5. A grep shows no `_design-context.md` → Absolute bans pointer left, and no `## Absolute bans` heading outside `_craft-floor.md`.
6. A grep of the 15 moves shows no `.impeccable.md`, no `7rem`, no `−0.05`, no `animation-timeline`, no `background-clip: text`, no `60/30/10`.
7. W10 live run: the transcript shows no read of `_craft-floor.md` before design stage Step 4, and one read at Step 4.

### 13. Risks

| Risk | Mitigation |
|---|---|
| A stage skips the floor read. Upstream saw this: "a printed engine line is followed where an extra file read gets skipped". We have no engine line. | Put the Load sentence in the step that edits, not in a header. The W10 live run checks it. A hook (option 2) stays available if the read is skipped. |
| Removing bans from Steps 1–3b lets a direction use a refused device. | The boards at Step 4 are drawn against the floor; the person confirms them at Step 5. A direction is a sketch, not the design. |
| The verify core has 6 words spare. | The load lives in `verify/_sub-agents.md` (6.3). |
| Ported text carries web terms into generic rules (I3). | The `_platforms.md` rows and the extended platform-name scan. |
| W7 touches the runtime schema. | Keep `register` readable; map it; require nothing new until a later release. |
| Several sessions edit this tree; `lib/hub-config.mjs` and several docs are dirty now. | Stage by path. Never `git add -A`. |
