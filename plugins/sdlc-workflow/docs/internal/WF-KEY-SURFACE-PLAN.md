# WF-KEY-SURFACE-PLAN — fewer top-level keys

Status **BUILT W0–W6, uncommitted, not released** (2026-10-18; every decision made, A1 and A3 to A8 accepted, the four open points answered) · Date **2026-10-18** · Plugin **v9.189.0** (the prototype and ideate builds committed as `674b7f4b` and `05ce323c`) · Owner **jayte**

## 1. Why

`/wf` has 27 keys. Each key is a row in `skills/wf/SKILL.md`, a row in the picker, a word in the dispatcher's error message, and a pin in `surface-policy.json`. The person has to remember the words, and most keys are rarely typed.

The use was counted on 2026-10-18 with ripgrep over the session transcripts. The count is the number of distinct sessions in which a person typed `/wf <key>`. It covers 134 Claude Code sessions in 18 projects and 7 Codex sessions. Calls that a driver makes are not counted.

| Typed in many sessions | Typed in few sessions | Never typed |
|---|---|---|
| intake 46, yolo 28, plan 24, handoff 23, status 23, verify 21, implement 19, ship 19, probe 15 | slice 12, shape 12, campaign 11, review 11, brainstorm 10, design 9, ship-plan 8, retro 6, recap 3, task 3, observability 2, docs 1 | auto (1 Codex session), simplify, close, goal, optimize, prototype (new) |

Three more facts come from the same count:

- `/wf intake brainstorm` (12 sessions) and `/wf brainstorm` (10 sessions) are two ways into the same loop. `reference/brainstorm.md` (515 words) only forwards to `intake/brainstorm.md`.
- People typed `/wf adopt` and `/wf audit`. Both words are intake modes, not keys.
- Of the intake modes, people typed brainstorm 12, fix 10, investigate 7, adopt 2, audit 2, discover 1, rca 1, and update-deps 1.

## 2. Decisions

PO decisions of 2026-10-18:

| Avenue | Decision |
|---|---|
| A1 — goal, optimize and prototype become one key, `loop` | **Accepted** |
| A2 — auto, yolo and campaign become one driver key | Not taken |
| A3 — remove the `brainstorm` key; `/wf intake brainstorm` stays | **Accepted** |
| A4 — simplify becomes an intake mode (not a review aggregate) | **Accepted** |
| A5 — task becomes an intake mode | **Accepted** |
| A6 — recap moves under status | **Accepted** |
| A7 — close becomes an intake maintenance mode | **Accepted** |
| A8 — ship-plan and observability go under one key | **Accepted as 8a**: a `project` key |

The accepted avenues bring the keys from 27 to 19.

## 3. The end state

| Group | Keys |
|---|---|
| Stages (10) | intake, shape, slice, plan, implement, verify, review, handoff, ship, retro |
| Design and drivers (6) | design, probe, auto, yolo, campaign, loop |
| Navigation (1) | status |
| Routers (2) | project, docs |

| Key with sub-keys | Sub-keys |
|---|---|
| `loop` | `goal`, `optimize`, `prototype` |
| `status` | `recap` |
| `project` | `ship-plan`, `observability` |

The intake modes rise from 14 to 17: `simplify`, `task`, and the maintenance word `close`. The maintenance words are then `amend`, `modernize` and `close`.

## 4. The rule that keeps the load flat — sub-keys

A merge must not make a run read more. Today a key's core load is `SKILL.md` plus `reference/<key>.md`. If `loop goal` first read a `loop.md` router, every goal run would read that router too.

`SKILL.md` Step 0 gets a sub-key table. When the first token is a key with sub-keys and the second token is one of its sub-keys, the dispatcher loads the sub-key's file directly. The parent key has no file of its own to read first.

| Command | Loads |
|---|---|
| `loop goal …` | `reference/goal.md` |
| `loop optimize …` | `reference/optimize.md` |
| `loop prototype …` | `reference/prototype.md` |
| `status recap …` | `reference/recap.md` |
| `project ship-plan …` | `reference/ship-plan.md` |
| `project observability …` | `reference/observability.md` |

The files stay where they are. This keeps every relative link in `ship-plan/`, `observability/` and the other folders valid.

A key with sub-keys has no reference file of its own. When the second token is missing or is not a sub-key, the dispatcher renders the key's sub-key rows from the `SKILL.md` table and asks which one the person wants.

`measure-load.mjs` then counts a sub-key's core load as `SKILL.md` plus the sub-key's file. The load targets of the moved keys do not change.

### 4.1 A clean break

The PO decided on 2026-10-18: no moved-key table and no redirect. A removed key is an unknown key. `SKILL.md` Step 0.3 gives it the plain error, which lists the 19 keys.

| Removed key | New command |
|---|---|
| `goal`, `optimize`, `prototype` | `loop goal`, `loop optimize`, `loop prototype` |
| `brainstorm`, `simplify`, `task` | `intake brainstorm`, `intake simplify`, `intake task` |
| `close` | `intake <slug> close` |
| `recap` | `status recap` |
| `ship-plan`, `observability` | `project ship-plan`, `project observability` |

This table is for the CHANGELOG and the docs site. The dispatcher does not read it.

Every command that the plugin itself prints changes in the same pull request: the `next-invocation` templates, the usage blocks, the refusal texts, and the docs site. The tests in section 11 search the tree for the old commands.

The old commands stay in three places that the plugin cannot change: the person's habits (`/wf brainstorm` 10 sessions, `/wf ship-plan` 8, `/wf recap` 3, `/wf task` 3), artifacts that are already written in other repos (for example `next-invocation: "/wf optimize …"`, the retro `/wf recap` route, and the revival text of each `99-close.md`), and old chat output. There, the old command gets the unknown-key error. The CHANGELOG entry lists the table above.

## 5. The surface policy

SURFACE-POLICY §2 asks for five items when a pull request adds an intake mode. A4, A5 and A7 add three intake modes, but they add no new job: each mode replaces a key in the same pull request.

Add a §2a to SURFACE-POLICY.md: *A pull request that moves a key into an intake mode or a sub-key lowers the `keys` pin by one for each moved key, in the same pull request. The earn rule does not apply to the move, because no new job enters the surface.* The `intakeModes` pin rises by the same number.

Rewrite §4 (router extraction) in the same wave. The decision against separate skills stands. The new text says that ship-plan and observability are sub-keys of `project` inside `/wf`, and that a later project contract becomes a sub-key of `project` under the earn rule.

## 6. The moves

### 6.1 A1 — `loop`

Commands:

```
/wf loop goal <slug> [objective|resume|status|clear]
/wf loop optimize <slug>
/wf loop optimize <description>
/wf loop prototype <idea>
/wf loop prototype <slug> [request]
```

Nothing changes but the command words. The `workflow-type` values (`optimize`, `prototype`), the files, the scripts (`goal.mjs`, `optimize.mjs`, `prototype.mjs`) and the schema stay. The host limits stay: the optimize driver runs on Claude Code only, and `loop goal` carries the optimize loop on the other hosts.

The PO decided on 2026-10-18: explicit sub-keys only. A bare `/wf loop` or `/wf loop <slug>` lists the three sub-keys and asks; it never picks a loop from the slug. A goal and an optimize loop keep working over many turns, and a prototype depends on the person's rounds, so the start stays a deliberate word. `loop goal` on an optimize slug still picks kind `optimize` by itself (`goal.md`, the kind table).

Touches: the three references and their own command text; `auto.md`, `yolo.md` and `workflows/yolo.js` (the printed refusal commands); `status.md` (the driver line); `intake/optimize.md` (`next-invocation`); `lib/lifecycle-done.mjs` (the `NOT_DRIVEN` message); `catalog.ts`; the eval cases `goal-unknown-slug`, `optimize-intake` and `prototype`. The old names appear in about 79 lines of 36 files.

### 6.2 A3 — remove the `brainstorm` key

`/wf intake brainstorm [slug] [design] [idea]` becomes the one way in. `reference/brainstorm.md` resolves `design`, a slug, and `add`. Move that resolution into `intake/brainstorm.md` Step 0, then delete `reference/brainstorm.md`.

A brainstorm already starts through intake, so its load does not rise. The intake fast path (section 7.1) cuts the 3100 words of `intake.md` from each start and each resume.

Touches: `auto.md` already routes to `/wf intake brainstorm <slug>`. The `/wf brainstorm` text appears in about 40 lines of 16 files, among them the board's resume command, `campaign.md`, and the BRAINSTORM tests (`brainstorm-design.test.mjs`, `brainstorm-mode.test.mjs`).

### 6.3 A4 — simplify becomes an intake mode

simplify already has the intake shape. A standalone run roots a `workflow-index` slug and writes `01-simplify.md`. A slug first writes the compressed slice `03-slice-simplify-<descriptor>.md` per `_compressed-slice.md`. Note: the `SKILL.md` row says simplify writes "none", which is wrong.

Commands:

```
/wf intake simplify [branch [<base>] | commit <range> | plan <slug> <slice> | codebase [<path>]]
/wf intake <slug> simplify [scope]
```

Rules:

- simplify is never auto-proposed in branch 4. A description that only asks for a cleanup goes to `refactor`, as now.
- A description that starts with the word "simplify" ("simplify the parser") routes to the mode, the same way "fix the typo" routes to `fix`. Quoting the whole description routes it to the default intake.
- `intake.md` Step 2 gets a row: standalone writes `01-simplify.md` and a lightweight index, terminal; slug-mode writes a compressed slice.

The file moves to `intake/simplify.md`, and `simplify/` moves to `intake/simplify/`. Its relative links change one level. Touches: about 28 lines of 18 files, the contract-graph producer row for `01-simplify.md`, and the `requires-tables` stage list.

### 6.4 A5 — task becomes an intake mode

task already has the intake grammar.

```
/wf intake task <description>
/wf intake task <task-slug>              # resume
/wf intake <slug> task <description>     # compressed slice, intake branch 1
```

Rules:

- task is never auto-proposed. A task may act outside the repository, and its own gate (shared-env, external-party, irreversible) must not be reached by a guess.
- A description that starts with the word "task" routes to the mode. Quoting routes it to the default intake.
- The blast-radius gate and the evidence rungs do not change.

The file moves to `intake/task.md`. Touches: about 21 lines of 17 files, the contract-graph producers (`01-task.md`, `05-implement`, `06-verify`), and `status.md`.

### 6.5 A6 — recap moves under status

```
/wf status recap <slug|pr#N|branch> [slice|focus]
```

The sub-key loads `recap.md` directly (section 4), so a recap reads no `status.md`. `status` stops being "read-only apart from `INDEX.md`": the `recap` sub-key writes `90-recap.md`. The `SKILL.md` row says so.

Collision: a slug named `recap`. The sub-key word wins, so `/wf status recap` cannot show that slug's detail. Section 6.8 reserves the word.

Touches: about 30 lines of 19 files, `retro/_artifact.md` (`next-invocation`), and `catalog.ts`.

### 6.6 A7 — close as an intake maintenance mode

**What modernize does today.** `/wf intake <slug> modernize [dry-run]` brings a workflow that an older plugin release wrote up to the schema that the current references read. It is additive only. It fills an absent field from what the artifacts already say: the charter, the intent-risk ledger, `wall-ownership` and `clearing-event` on open deferrals, `slices[].status`, revision ledgers, the `INDEX.md` row, and more. It never changes a recorded decision, verdict, status or criterion. A field that the artifacts cannot answer stays absent and is reported. It reports before it writes and asks once. It stamps `schema-modernized-at` and `schema-absent-fields`, so intake stops offering it for those fields. It writes no numbered artifact.

`amend` is the other maintenance mode. It edits whitelisted config on `00-index.md` (branch strategy, branch, base, review scope, title, tags). Both modes need a slug, and both resolve in intake Step 0 branch 0, before the compressed-slice branch.

**How close fits.** `close` joins branch 0 as a third maintenance word. The tokens after `close` keep today's meaning, with the slice match first:

```
/wf intake <slug> close                    # workflow close; asks the reason
/wf intake <slug> close <reason>           # cancelled | superseded | deferred | completed-externally | merged-into
/wf intake <slug> close <slice> [reason]   # slice close: skip-slice-<slice>.md, the roster entry set to skipped
```

The slice behaviour does not change. A slice close writes `skip-slice-<slice>.md` and sets `status: skipped` in the `03-slice.md` roster and on `03-slice-<slice>.md`, or writes a stub when that file is missing. It advances `selected-slice`. Downstream prerequisites then treat the slice as resolved. A workflow close writes `99-close.md` and sets `status: closed`. Like amend and modernize, close never writes a compressed slice.

One rule differs from amend and modernize. A token0 of `amend` or `modernize` with no slug ends the run with an error. Many descriptions start with "close" ("close the dropdown on escape"), so a token0 of `close` with no slug is a description and goes to the default intake. When token1 is an existing slug (`/wf intake close my-slug`), intake ends the run and prints `/wf intake my-slug close`.

**Why it was taken.** Intake already owns every change to a workflow's record that is not a stage: entry, extension, amend and modernize. close is the same kind of act. close was never typed; most closures happen inside a mode (`ideas-packeted`, `verdict-recorded`, the rca routes).

**What it costs.** The word "intake" means "the way work comes in", and close is the way work goes out. The `intake.md` description must say that intake also keeps and ends a workflow's record. A close reads `intake.md` and `_intake-context.md` (3936 words) before `close.md` (1663 words).

The file moves to `intake/close.md`. The prototype exception moves with it: a `prototype` row closes in its worktree after `prototype.mjs exit <slug> close`.

Touches: about 40 lines in 20 files print `/wf close`. Among them are the revival text of `99-close.md`, the `next-invocation` of `intake/update-deps.md` and `intake/brainstorm.md`, `modernize.md` (the decision-lifecycle row), `recap.md`, `status.md`, and the contract-graph producers of `99-close.md` and `skip-slice-*.md`.

### 6.7 A8 — one key for the project contracts

`ship-plan` and `observability` are the same kind of key. Each owns one project-level file under `.ai/` (`ship-plan.md`, `observability.md`), and each routes `init`, `build` and `audit` (ship-plan also has `edit`). Neither reads a workflow artifact. ship-plan was typed in 8 sessions and observability in 2.

Three ways:

| Way | Commands | Keys saved | For | Against |
|---|---|---|---|---|
| 8a — a `project` key | `/wf project ship-plan init`, `/wf project observability audit` | 1 | A new project contract (for example a security or data policy) becomes a sub-key, not a key, so the key list stops growing | One more word to type |
| 8b — 8a, and docs joins | `/wf project docs [primitive\|slug\|path]` | 2 | docs was typed in one session | docs is not a contract. It also has a workflow mode (`docs <slug>`), and handoff uses its primitives |
| 8c — ship-plan under ship | `/wf ship plan init` | 1 | ship is the only reader of the plan | ship's first token is a slug, a PR or a branch, so `plan` becomes a reserved word there. observability stays a key |

The design record (`/wf design setup|teach|extract|direction|sync`) stays with `design`: `extract` with a slug writes into that slug.

SURFACE-POLICY §4 declined to move these routers out into separate skills. 8a keeps them inside `/wf`, so the three reasons of §4 do not apply. Section 5 rewrites §4.

The PO took 8a. docs stays a key.

Commands:

```
/wf project ship-plan <init|build|edit|audit> [args]
/wf project observability <init|build|audit> [args]
/wf project                     # lists the sub-keys and asks
```

`ship-plan.md` and `observability.md` keep their own sub-command step, so `project ship-plan` with no third token still renders the ship-plan usage. Their usage blocks print the new commands.

Touches: ship-plan appears in about 81 lines of 26 files, and observability in about 35 lines of 14 files. Among them are `ship.md`, `handoff.md` and `_ship-plan-readiness.md` (the shared readiness check), `augment/instrument.md` (it names the observability contract), the ship-plan and observability sub-references, and `catalog.ts`.

### 6.8 Reserved slug names

The PO decided on 2026-10-18 to reserve the command words as slug names.

The collision is wider than `status recap`. Intake tests for an existing slug (branches 0 to 2) before it tests for a mode word (branch 3). A slug named `close`, `task` or `simplify` would turn `/wf intake close the dropdown on escape` into an extension of that slug, silently. The same gap exists today for the current mode words: a slug named `fix` takes over `/wf intake fix …`. No rule reserves a word today. Most modes add a prefix to their slugs (`discover-…`, `refactor-…`), but the default intake makes a kebab-case slug from the description (`intake/default.md` Step 0, item 1), and a packet uses the person's `work-slug`.

The rules:

1. `_intake-context.md` gets the reserved set: every key, every sub-key (`goal`, `optimize`, `prototype`, `recap`, `ship-plan`, `observability`), and every intake mode word, the maintenance words included.
2. When a new slug is in the reserved set, intake asks for another slug through the collision prompt that `intake/default.md` Step 0 already owns. A packet's `work-slug` follows the same rule (`intake/_packet.md` item 4).
3. `status` flags an existing slug whose name is in the reserved set, and names the command that the slug blocks. It renames nothing: slugs are stable.

`loop` and `project` take no slug as their first token, so they cannot collide.

## 7. Load

Word counts of the core load, measured on 2026-10-18:

| Run | Today | After, with the fast path (section 7.1) |
|---|---|---|
| `loop goal`, `loop optimize`, `loop prototype` | `SKILL.md` + the reference | the same (sub-key) |
| `status recap` | `SKILL.md` + `recap.md` (4264) | the same (sub-key) |
| `project ship-plan`, `project observability` | `SKILL.md` + the router | the same (sub-key) |
| `intake task` | `SKILL.md` + `task.md` (3792) | + `_intake-context.md` (4628) |
| `intake simplify` | `SKILL.md` + `simplify.md` (4175) | + 836 (5011) |
| `intake brainstorm` (start or resume) | `SKILL.md` + `intake.md` + `_intake-context.md` + the mode | 3100 fewer |
| `intake fix`, `intake investigate` and the other explicit modes | the same as brainstorm | 3100 fewer |
| `intake <slug> close` | `SKILL.md` + `close.md` (3382) | + `intake.md` + `_intake-context.md` (7318); a slug-first form does not take the fast path |

### 7.1 The intake fast path

The PO decided on 2026-10-18 to build it in this plan (wave W5).

1. When the first two tokens are `intake <mode-word>`, and `<mode-word>` is an intake mode word that is not a maintenance word, the dispatcher loads `intake/_intake-context.md` and `intake/<mode>.md`. It does not load `intake.md`.
2. Every other intake form loads `intake.md` as now: a plain description (branch 4, which can suggest a mode), a slug first (branches 0 to 2), a packet path, a maintenance word, and `close` with no slug.
3. The rule is written once, in `SKILL.md` Step 0. `intake.md` branch 3 says only that the dispatcher resolves that form. A test checks that the mode list of `SKILL.md` and the mode keyword set of `intake.md` are the same.
4. The reserved slug names (section 6.8) make the rule safe: a new slug cannot be a mode word, so the dispatcher needs no slug check. An old slug with such a name gets the `status` flag.
5. Each mode reference that cites "the dispatcher loaded `_intake-context.md`" stays true. A mode reference that relies on another part of `intake.md` moves that part into `_intake-context.md`. W5 starts with a read of every mode reference for such a reliance.

The explicit modes were typed in about 36 sessions. The fast path saves 3100 words on each of those runs.

## 8. Open points

1. **Decided 2026-10-18: a clean break** (section 4.1). No moved-key table, no redirect.
2. **Decided 2026-10-18: explicit sub-keys only** (section 6.1). No `loop.md` router.
3. **Decided 2026-10-18: reserve the command words as slug names** (section 6.8), and `status` flags an existing slug with such a name.
4. **Decided 2026-10-18: build the intake fast path in this plan** (section 7.1).

Decided 2026-10-18: A7 is taken, and A8 is taken as 8a.

## 9. Shared touch points

Every move changes these, in the same pull request:

- `skills/wf/SKILL.md`: the tables, the key count, the Step 0 list, the argument hint, the sub-key table, and the description;
- `hooks/mod/catalog.ts`: the picker keeps one row per job (for example `loop goal`). The rows fall from 27 to 23: brainstorm, simplify, task and close leave the catalog, and the six sub-keys become two-word rows;
- `lib/leak-lexicon.mjs`: the key list;
- `docs/internal/surface-policy.json` and `SURFACE-POLICY.md`: `keys` falls, `intakeModes` rises;
- `prose-budget.json` and the load baseline (`node scripts/measure-load.mjs --write`);
- `hooks/mod/requires.ts` (`node scripts/build-requires.mjs`) and `dist/` (`npm run build`);
- the count tests: `single-source.test.mjs`, `capability-inventory.test.mjs`, `brainstorm-design.test.mjs`, `wf-picker.harness.mjs`, `requires-tables.test.mjs`, `contract-graph.test.mjs`, `prototype-guards.test.mjs`;
- `_host-invocation.md`: the key availability table;
- the docs site (`reference/commands.html`, `reference/intake-modes.html`, `guides/autonomous-drivers.html`, and the pages that print the old commands), `README.md`, both `plugin.json` descriptions, and `CHANGELOG.md`.

## 10. Waves

All waves edit `SKILL.md`, so they run one after another.

| Wave | Content | Depends on |
|---|---|---|
| W0 | SURFACE-POLICY §2a and the §4 rewrite | — |
| W1 | The sub-key table in `SKILL.md`; `measure-load.mjs` and the picker learn sub-keys; red tests first | W0 |
| W2 | A1 `loop` | W1 |
| W3 | A6 `status recap`; A3 removes `brainstorm`; the reserved slug names (section 6.8) | W1 |
| W4 | A4, A5 and A7: the `simplify`, `task` and `close` intake modes | W1 |
| W5 | A8 `project`; the intake fast path (section 7.1) | W1, W3 (reserved names) |
| W6 | Docs site, README, manifests, CHANGELOG, evals, pins; one release | W2–W5 |

## 11. Tests (red first)

- The dispatcher: each removed key gets the unknown-key error and loads no reference; each sub-key loads only its own file.
- No file under `skills/`, `hooks/`, `lib/`, `scripts/`, `renderers/` or `docs/site/` prints a removed command (`/wf goal`, `/wf optimize <`, `/wf prototype`, `/wf brainstorm`, `/wf simplify`, `/wf task`, `/wf recap`, `/wf close`, `/wf ship-plan`, `/wf observability`). The CHANGELOG and `docs/internal/` are exempt.
- `measure-load`: a sub-key's core is `SKILL.md` plus its file; the key count matches the tables.
- Intake Step 0: `simplify` and `task` resolve in branch 3 and in branch 1 (slug first); neither is auto-proposed; a quoted description that starts with either word goes to the default intake.
- A7: `<slug> close <slice>` closes the slice; `<slug> close deferred` closes the workflow; `close the dropdown` is a description; `close <slug>` prints the right order.
- A8: `project ship-plan init` loads only `ship-plan.md`; `project` alone lists the two sub-keys; `ship.md` and `handoff.md` print `/wf project ship-plan init` when the plan is missing.
- The fast path: `intake fix …` loads `_intake-context.md` and `intake/fix.md` and not `intake.md`; `intake <slug> fix …`, a plain description, `intake <slug> close` and `intake close the dropdown` load `intake.md`; the mode list of `SKILL.md` equals the mode keyword set of `intake.md`.
- Reserved slugs: a new slug `close`, `recap` or `fix` gets the collision prompt; a packet with `work-slug: task` gets it too; `status` flags an existing slug named `recap`.
- The picker: one row per job, and a sub-key row submits the two words.
- The evals: the prompts of `goal-unknown-slug`, `optimize-intake` and `prototype` use the new commands.
