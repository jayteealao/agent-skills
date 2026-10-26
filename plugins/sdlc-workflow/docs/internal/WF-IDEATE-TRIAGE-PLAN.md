# WF-IDEATE-TRIAGE-PLAN — ideate triages, discusses, and steers

Status **BUILT 2026-10-26, not committed, not released** (T1 to T5 built; the live runs of T2, T3 and T4 are open; section 15) · Date **2026-10-25** · Plugin **v10.0.0-next.4** · Ships **after v10.0.0** (D3) · Owner **jayte**
Depends on: [WF-IDEATE-SOURCES-PLAN.md](WF-IDEATE-SOURCES-PLAN.md) (the pick, the memory of earlier runs, `refresh`, `confidence`), and the work packet list of v10 ([WF-PIECES-PLAN.md](WF-PIECES-PLAN.md)).

## 1. Why

`/wf intake ideate` runs once and stops. It scans, culls, ranks, and asks the person for the numbers of the ideas to act on (`skills/wf/reference/intake/ideate.md:162-185`). After that answer, the run writes the list and closes. Three things are missing (verified against the code on 2026-10-25).

**No triage.** An idea is picked or not picked. Nothing else can happen to it.

- The person cannot say "later", "drop it, because…", "merge these two", or "check this first".
- The culled ideas stay out of sight: "Do not show the log prominently in chat" (`ideate.md:152`). The person cannot rescue a cull.
- A `needs-verification` cull names a check (`ideate.md:136`), but no step runs the check.
- With 4 or more ideas, the decision is one chat reply of numbers (`ideate.md:183`).

**No discussion.** The person cannot ask why an idea is real, push on its evidence, or change its scope before the pick. Only brainstorm has a conversation loop (`intake/brainstorm.md:111-168`), and ideate never enters it.

**No steering.** To go deeper or in another direction, the person starts a new run, with a new slug and a new `01-ideate.md`.

- `refresh` checks the old ideas again (`ideate.md:225-234`). It does not look for new ideas around one idea.
- A resume of a complete run only tells the person how to record a pick (`ideate.md:75`).
- `classifyArgs` reads every token after the slug as a pick, except `refresh` (`lib/ideate.mjs:46-54`).

## 2. PO decisions (2026-10-25)

| # | Decision |
|---|---|
| D1 | A short discussion stays inside ideate. A discussion that grows past one idea goes to a brainstorm board, seeded from the idea (section 5.3). ideate does not get a second full brainstorm loop. |
| D2 | A steer adds a **round** to the same run. The slug, the `01-ideate.md` record and the roster stay the same. A new slug comes only from a new `/wf intake ideate` without a slug. |
| D3 | This ships after v10.0.0, as a minor release. v10 changes the pick and the work packets, and this plan builds on the v10 form. |

## 3. The loop

After Step 6 writes the records, the run goes into a new **Step 7 — the loop**. The records exist before the first question, so a lost session keeps the scan.

The loop has these invariants. They have no exceptions.

- **Only the person ends the loop.** The words `done` and `pause` end it. The agent never decides that triage is complete. When every idea has a triage state, the agent asks what is next, and the loop continues.
- **Plain words.** No question, option or chat line shows an idea id, a round number, or a roster key. The agent names an idea by its title, for example "the retry logic for the Stripe client". The ids stay in the records.
- **No commitments and no code.** The rule of `ideate.md:50` stays.
- **The records are the memory.** After every batch, the agent writes the changed ideas to `01-ideate.md` (`record set`, or get, change, draft and put).
- **No person, no loop.** In a non-interactive run (rung 3 of the ladder, for example yolo), the run skips Step 7 and ends as it does today.

Step 5 changes. It prints the ranked list, then asks one question with these options:

1. Go through the ideas one by one (recommended).
2. Take some ideas now: a free-text reply of numbers, for example `1 3`.
3. Look further or in another direction (section 6).
4. Save the list and decide later (`pause`).

A reply of numbers takes those ideas, sets every other idea to `later`, and goes to `done` (section 7). This keeps the fast path of today.

## 4. Part T — triage

### 4.1 The triage states

Each idea in the `ideas:` roster gets a `triage` state.

| State | Meaning | Set by |
|---|---|---|
| `open` | Not triaged yet. Every new idea starts here. | the agent |
| `take` | The idea goes into the pick at `done`. | the person |
| `later` | The idea stays in the run, and the pick does not take it. | the person |
| `drop` | The person removes the idea. It moves to the `culled:` roster with `source: person` and the person's reason. | the person |
| `brainstorm` | The idea went to a brainstorm board (section 5.3). The pick does not take it. | the person |

### 4.2 A triage batch

The agent asks about up to 4 ideas per batch, in rank order, per the batch clause of `_gate-question.md`. For each idea, the question text gives the title, two plain sentences of what the evidence shows, the effort and the impact in words, and the agent's view with its reason. The options are:

- Take it
- Later
- Drop it
- Talk about it (section 5)

The agent marks the option that its rank supports as recommended. ideate ranks the ideas, so the agent has a view. This is different from brainstorm, where a question has no right answer.

A free-text answer can do more:

- **A reason** after "drop" is recorded word for word as `triage-reason`. With no reason, the record says "no reason given".
- **`merge <idea> <idea>`** joins two ideas into one card. The card keeps the higher-ranked id, and the other idea gets `merged-into:`. The agent writes the joined title and description, and asks the person to confirm them.
- **`split <idea>`** proposes two to four child ideas, each with `parent:`. The person confirms the split. The parent gets `merged-into:` set to the first child.
- **`check <idea>`** runs the check of section 4.3.

### 4.3 Run the check

`check <idea>` runs the cheapest check that can settle the idea's claim:

1. When the claim is static, run one bounded read of the code and cite `file:line`.
2. When the code does not settle it, run one research act per the rules of `intake/ideate/_lenses.md`, Research. The act counts against the limit of 8 research acts in one run.
3. When the claim is a runtime claim, do not run it here. Record that `/wf probe` must answer it after a workflow exists, and say so.

The result changes the idea's `confidence` by the table in `intake/ideate/_artifact.md`. When the check shows the claim is false, the agent says so and recommends "Drop it" in the next question. The person decides.

A cull with `needs-verification` can be checked the same way: `check` works on a culled idea too. A check that confirms the claim rescues the idea (section 4.4).

### 4.4 Show the culls and rescue one

The control word `culled` shows every culled idea, one plain line each, with its reason. `rescue <idea>` brings a culled idea back into the roster with `triage: open`, `rescued: true`, and the filter's reason kept as `culled-reason`. The next batch asks about it first.

### 4.5 The memory of earlier runs

Step 3c (`ideate.md:78-81`) reads the `culled:` roster of earlier runs. A person's drop is stronger than a filter cull:

- A filter cull comes back when its evidence changed, as today.
- A person's drop stays dropped, even when its evidence changed. When its evidence changed, the next run lists it in one line, "you dropped this on <date>; its code changed", and the person can rescue it.
- A `later` idea of an earlier run counts as "proposed and not picked". It keeps `seen-in:` and its rank logic, as today.

## 5. Part D — discussion

### 5.1 A discussion turn

"Talk about it" or `discuss <idea>` opens a discussion on one idea. The agent follows the talk rules of `intake/brainstorm/_talk.md` and these Craft rules of `intake/brainstorm.md`: Start from the problem, Explain then ask, Be the counterweight, and Make the options choose.

1. Explain the idea in plain words: what the evidence shows, with `file:line`, what the fix looks like, and why it matters now.
2. Ask up to 4 questions about this idea only. Good questions are: is the problem real for you; what is in scope and what is not; what does done look like; which risk worries you; is it worth the effort.
3. Check each checkable statement with one bounded read. `look it up` runs one research act, as in section 4.3.
4. Continue until the person chooses a triage state, or says `back`.

### 5.2 What a discussion writes

The discussion changes the idea card, not a separate board:

- The new description, scope, effort, impact or confidence replace the old values.
- `notes:` gets one plain sentence per change, with the old value and the reason, and the time.
- `discussed: true`.
- The body of `01-ideate.md` gets a `#### Discussion` part under the idea, built from `notes:`.

A changed effort or impact changes the rank. The agent ranks the list again after the discussion ends, and says in one line when the idea moved.

### 5.3 Hand a discussion to brainstorm (D1)

A discussion grows past one idea when it opens a second problem, when the person brings a new idea of their own, or when the person says `brainstorm`. Then the agent offers one choice: keep the discussion on this idea, or start a brainstorm from it.

When the person chooses the brainstorm:

1. Set the idea's `triage: brainstorm` and `routed-to:` the new brainstorm slug.
2. Print `/wf intake brainstorm <idea title> from <ideate-slug>`. Do not run it.
3. Return to the loop.

The brainstorm consumes `from <ideate-slug>` per `intake/_intake-provenance-consume.md`. Its Step 0 seeds the first thread with the idea's evidence as findings, and the discussion notes as decisions with `source: person`. The brainstorm writes its own list at its own `done`. The ideate pick never takes the idea.

## 6. Part S — steer (D2)

### 6.1 Rounds

The first scan is round 1. Each steer adds one round. A round runs Step 1 to Step 4 of `ideate.md` on the new candidates only, with these inputs:

- the memory of earlier runs (Step 3c);
- this run's own `culled:` roster and the person's drops, so a round does not propose an idea the person removed;
- the ideas already in the roster, so Challenge 5 can join a new symptom to an existing root cause.

The new survivors enter the roster with `round:` and `triage: open`. The agent then ranks the whole roster again. A triage state never changes in a re-rank. The count of the run caps the new survivors that one round shows; the default for a steer round is **5**. The roster holds every survivor.

Before a round dispatches its agents, the agent prints one line: the kind of round, the target, and the number of agents. The person asked for the round, so the agent does not ask again.

### 6.2 The kinds of round

| Word | What the round does | Agents |
|---|---|---|
| `deeper <idea>` | Scans the idea's evidence files and the files one import step away. Runs the lens of the idea's category, plus Lens 6 (architecture). The new ideas get `parent:` set to the idea. | up to 2 lens agents, effort tier low |
| `similar <idea>` | Looks for the same pattern in other places of the code. A hit that is the same problem becomes evidence on the idea. A hit that is a different problem becomes a new idea with `parent:`. | 1 agent, effort tier medium |
| `lens <name>` | Runs a lens that this run did not run. When the lens already ran, the agent says so and offers `deeper` on that lens's best idea. | 1 lens agent, effort tier low |
| `direction <words>` | Points the scan at a new topic. Runs the active lenses with the new topic. The topic goes into `rounds:`. | the active lenses, effort tier low, waves of at most 6 |
| `surprise me` | The agent proposes three to five angles that the person did not raise: the user's view, a newcomer's view, a reversed case, a comparison with another product, "what would you delete". The person picks angles in one question. Each picked angle becomes a `direction` round. | none until the person picks |

A source argument of WF-IDEATE-SOURCES-PLAN is not a steer word. To add a source, the person starts a new run, or runs `refresh` after the source changes.

### 6.3 Steer from the command line

The steer words also work after the slug, so the person can steer a run from a new session:

```
/wf intake ideate <slug> deeper "retry logic for the Stripe client"
/wf intake ideate <slug> direction payments
/wf intake ideate <slug> surprise me
```

The run does the round, then goes into the loop.

## 7. Close, pause, resume

### 7.1 `done`

`done` ends the loop.

- **One idea or more is `take`.** Run `# Pick — decision closure` (`ideate.md:197-215`) with the taken ideas as `selected:`. The proposed order of step 3 is the rank order. `decision-note:` holds the reasons that the person gave during triage, in the person's words.
- **No idea is `take`.** Ask one question: keep the run open and decide later, or close it with no list. A close sets `close-reason: no-pick`.

The `later` ideas stay in the roster after the close.

### 7.2 `pause`

`pause` writes the records, tells the story of this sitting per the session-story rules of `intake/brainstorm/_talk.md`, and returns. The index keeps `status: ready`, with `next-invocation: /wf intake ideate <slug>`.

### 7.3 Resume

`/wf intake ideate <slug>` with a complete `01-ideate.md` goes into the loop. Today it only prints how to record a pick (`ideate.md:75`). The agent first shows where we are: the taken ideas, the open ideas, the later ideas, and the rounds, in plain words. Then the first batch asks about the open ideas.

A resume of a closed run with `later` ideas reopens the run (`status: ready`), as `refresh` does when it finds a new idea. A later pick appends its work packets to the list, as today (`ideate.md:215`).

## 8. Control words

| Word | Effect |
|---|---|
| `discuss <idea>` | Open a discussion on the idea (section 5). |
| `back` | End the discussion, and return to triage. |
| `check <idea>` | Run the cheapest check (section 4.3). |
| `merge <idea> <idea>` · `split <idea>` | Join two ideas, or split one (section 4.2). |
| `culled` · `rescue <idea>` | Show the culls, or bring one back (section 4.4). |
| `deeper` · `similar` · `lens` · `direction` · `surprise me` | Run a round (section 6). |
| `brainstorm` | Offer the brainstorm hand-off for the idea under discussion (section 5.3). |
| `list` | Show where we are (section 7.3). No question this batch. |
| `pause` | Save, tell the story, and return (section 7.2). |
| `done` | Go to the pick (section 7.1). |

The person names an idea in words or by its rank number. A word that names no known idea gets the titles back and changes nothing.

## 9. Record changes

### 9.1 `01-ideate.md` frontmatter

New keys on each entry of `ideas:`:

| Key | Type | Rule |
|---|---|---|
| `triage` | `open \| take \| later \| drop \| brainstorm` | Required on every idea of a run that this plan writes. A legacy run without it reads as `open`. |
| `triage-reason` | string | Required when `triage` is `drop`. |
| `triage-at` | ISO 8601 | The time of the last triage change. |
| `round` | integer ≥ 1 | The round that found the idea. Absent means round 1. |
| `parent` | idea id | Must resolve to an idea in `ideas:` or `culled:`. |
| `merged-into` | idea id | Must resolve to an idea in `ideas:`. An idea with `merged-into` is not shown and is not picked. |
| `rescued` · `culled-reason` | boolean · string | Set together by `rescue`. |
| `discussed` | boolean | Set by a discussion. |
| `notes` | list of `{at, text}` | One plain sentence per discussion change. |
| `routed-to` | slug | Required when `triage` is `brainstorm`. |

New keys on each entry of `culled:`: `source: filter | person` (absent means `filter`), `round`, and `dropped-at` for a person's drop.

A new top-level `rounds:` list:

```yaml
rounds:
  - n: 2
    kind: <initial|deeper|similar|lens|direction>
    target: IDEA-004          # deeper and similar only
    lenses: [quality, architecture]
    topic: "<words>"          # direction only
    raw: <N>
    culled: <N>
    survivors: <N>
    at: "<ISO 8601>"
```

`selected:` stays. At `done`, it is the list of the taken ideas.

### 9.2 `01-ideate.md` body

- `## Ranked Ideas` marks each idea with its triage state in words, for example "Taken", "Later".
- A new `## Triage` section lists the taken ideas, the later ideas, and the drops with their reasons.
- A new `## Rounds` section gives one line per round: what it looked at and what it found.
- `#### Discussion` under an idea, per section 5.2.

### 9.3 The check

A new function `triageProblems(fm)` in `lib/ideate.mjs` returns one problem for each of these:

- a `drop` with no `triage-reason`;
- a `brainstorm` with no `routed-to`;
- a `parent` or `merged-into` that does not resolve;
- a `merged-into` chain that loops;
- a `round` that is not in `rounds:`.

`hooks/post-write-verify.mjs` runs it on every write of a `type: ideation` record, not only when sources are present (`hooks/post-write-verify.mjs:418` limits the source check today). The checks mode decides block or warn, as for the source check.

## 10. Arguments

`classifyArgs` (`lib/ideate.mjs:42-55`) keeps rule 1. The tokens after an ideate slug get these modes, in this order:

| `rest` | Mode |
|---|---|
| empty | `resume` (the loop) |
| `refresh` | `refresh` |
| a steer word: `deeper`, `similar`, `lens`, `direction`, `surprise` | `steer`, with `steer:` the word and `target:` the rest |
| any other token | `pick`, as today |

An idea title that starts with a steer word must be in quotes to be a pick.

## 11. Files

| File | Change |
|---|---|
| `skills/wf/reference/intake/ideate.md` | Step 0 2c (resume enters the loop, steer mode), Step 5 (the first question), Step 7 (a pointer to `_loop.md`), the pick reads `take`, `refresh` keeps triage states, the chat return gives the triage counts. Frontmatter `argument-hint` adds the steer words. |
| `skills/wf/reference/intake/ideate/_loop.md` | New: sections 3, 4, 5, 7 and 8. |
| `skills/wf/reference/intake/ideate/_rounds.md` | New: section 6. |
| `skills/wf/reference/intake/ideate/_artifact.md` | The new keys and body sections of section 9. |
| `skills/wf/reference/intake/ideate/_lenses.md` | The scope of a `deeper` and a `similar` round. |
| `skills/wf/reference/intake/brainstorm.md` | Step 0 consumes `from <ideate-slug>` and seeds the first thread (section 5.3). |
| `skills/wf/reference/intake/_light-index.md` | The `ideate` row: `next-invocation` is the resume command while the run is open. |
| `schemas/frontmatter.schema.json` | `ideationFrontmatter`: the keys of section 9.1. |
| `lib/ideate.mjs` | `classifyArgs` modes, `STEER_WORDS`, `triageProblems`. |
| `hooks/post-write-verify.mjs` | Run `triageProblems` on every ideation write. |
| `docs/commands.html` | The ideate guide (`#ideate-guide`): the loop, the control words, the steer forms. |
| `CHANGELOG.md` | The entry, through the release command. |

## 12. Tests (red first)

| Test | Proves |
|---|---|
| `tests/unit/ideate-sources.test.mjs` → `classifyArgs` cases | An ideate slug alone is `resume`. `<slug> deeper "x"` is `steer`. `<slug> "deeper caching"` is `pick`. `<slug> refresh` stays `refresh`. |
| `tests/unit/ideate-triage.test.mjs` (new) | `triageProblems` finds each problem of section 9.3, and returns nothing for a valid record. A legacy record with no `triage` passes. |
| `tests/unit/hooks/prototype-ideate-hooks.test.mjs` | The write hook refuses a `drop` with no reason on a run with no sources. The opt-out lets it through. |
| `tests/unit/lib/foundation.test.mjs` | The schema accepts every new key, and refuses a wrong `triage` value. |
| `npm run lint:drift` · `npm run verify:docs` | The links of the new files resolve, and the command page matches. |

## 13. Stages

| Stage | Content | Gate |
|---|---|---|
| T1 | Schema, `lib/ideate.mjs`, the hook check, the tests of section 12. | `npm test` green. |
| T2 | `_loop.md`, the Step 5 and Step 7 changes, the pick on `take`, pause and resume. | One live run on a real repo: triage of 10 ideas, one `drop` with a reason, one `later`, one `check`, `done` writes the list. |
| T3 | Discussion and the brainstorm hand-off. | One live discussion changes an idea's effort and its rank. One hand-off starts a brainstorm whose first thread holds the idea's evidence. |
| T4 | `_rounds.md`, the steer words, the command-line steer. | One `deeper` round and one `direction` round on the run of T2. No new idea repeats a person's drop. The slug stays the same. |
| T5 | `docs/commands.html`, the release after v10.0.0. | `npm run verify:docs` green. |

## 14. Open points

1. **Brainstorm reads `from`.** SETTLED in the build: brainstorm did not consume `from <slug>`. Its Step 0 now has a seeded-from-an-idea form for an ideate source only (section 15).
2. **The count of a steer round.** The default of 5 new survivors is a guess. Measure it in the T4 live run.
3. **Cost.** A `direction` round with all six lenses costs as much as a new run. Decide after T4 whether a `direction` round runs fewer lenses by default.
4. **The recommended option in triage.** Section 4.2 lets the agent mark an option as recommended. Check in the T2 live run that the person does not take every recommendation without reading it. If the person does, remove the mark and keep the view in the question text.

## 15. Build notes (2026-10-26)

What was built, and where it differs from the sections above.

| Part | Files |
|---|---|
| T1 | `lib/ideate.mjs` (`STEER_WORDS`, `TRIAGE_STATES`, `ROUND_KINDS`, the `steer` mode of `classifyArgs`, `triageProblems`), `hooks/post-write-verify.mjs` (`enforceIdeateRecord` replaces `enforceSourceCoverage`), `scripts/ideate-sources.mjs` (`check` runs the triage check), `schemas/frontmatter.schema.json`, `tests/unit/ideate-triage.test.mjs` (new), `tests/unit/ideate-sources.test.mjs`, `tests/unit/hooks/prototype-ideate-hooks.test.mjs`. |
| T2, T3 | `skills/wf/reference/intake/ideate/_loop.md` (new), `intake/ideate.md` (Step 0 2c, Step 5, Step 7, the pick on `take`, refresh, the chat return), `ideate/_artifact.md`, `intake/_light-index.md`, `intake/brainstorm.md` (the seeded form), `_gate-question.md` (the loop's control words). |
| T4 | `skills/wf/reference/intake/ideate/_rounds.md` (new), `ideate/_lenses.md` (the scope of a later round). |
| T5 | `docs/commands.html` (the ideate guide: Triage and discussion, Look further). No release. |

Differences from the plan:

1. **No opt-out key.** The plan named `hooks.ideateTriageCheck: false`. The source check that it extends has no working opt-out either: `hooks.ideateSourceCoverage` was only a comment. Both checks follow the checks mode.
2. **The loop runs `ideate-sources.mjs check` after each batch.** The loop writes with `record set` and `record put`, and a script write does not pass through the write hook. The `check` command now runs `triageProblems` as well as the source check.
3. **A drop stays in `ideas:` too.** A dropped idea keeps its row in `ideas:` with `triage: drop`, and also gets a row in `culled:` with `source: person`. The rank list can then say what the person dropped, and Step 3c reads the `culled:` row.
4. **The brainstorm seed.** Brainstorm Step 0 consumes `from <ideate-slug>` only for an ideate source. The idea's evidence becomes findings with `source: code` (the board's `source` enum has no `ideate` value), the discussion notes become decisions with `source: person`, and the index gets `origin-ideate`. The new Requires row is `mode:from`.
5. **`_rounds.md` is a `mode:steer` row.** A run that ran a round lists `steer` in `modes:` of `01-ideate.md`. `_loop.md` is an `always` row.

Checks run: `npm test` (713 pass), `npm run lint:drift` (no drift), `npm run verify:docs` (OK). The live runs of section 13 are not run: they need a person in the loop.
