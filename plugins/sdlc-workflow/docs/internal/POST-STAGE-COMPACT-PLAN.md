# Post-stage auto compaction in the Claude Code mod — plan

Status: **SHIPPED v9.158.0 2026-09-22**; two live defects repaired after
it, in v9.161.1 (a sub-agent's `turn.complete` consumed the person's turn)
and in v9.161.2 (the compaction was called from a timer the
`turn.complete` hook started, and the engine refuses it there). **P-C1 is
answered: the engine accepts `session.compact` from a `turn.complete` hook
and refuses it from any later event.** The call now runs inside that
dispatch and there is no retry. The operator settled three points the same day (§11):
every landed stage compacts with no context floor, `review` is exempt, and
the toast stands (no ask). Departures from the draft: the turn-id guard of
W2 step 2 is not needed, because the hook nulls the turn bracket at the
first `turn.complete` and a second one for the same turn finds none; the
kit refuses a compaction input or result with an empty `messages` list, so
the tests carry one message each way; a rejected call reaches the mod as
a thrown error, not a `deny`. W0 was not run: probes P-C1, P-C2, P-C4, and
P-C6 stay open in MOD-FEATURES.md §5 (P-C1 is now answered by the live
run described above; the code covers both answers to P-C4 with the
sentence check);
P-C5 is settled (the kit raises `session.compact` with a bottom mock);
P-C3 fell with the floor. Every engine mechanism below is in the Claude
Code 2.1.271 mod contract (`.claude/types/claude-code.d.ts`) unless a line
says **probe**.

Related: [MOD-FEATURES.md](MOD-FEATURES.md) (what the mod does today),
[WF-MOD-UX-PLAN.md](WF-MOD-UX-PLAN.md) §5 (the `turn.complete` hook this
plan extends), [JEV-MOD-PLAN.md](JEV-MOD-PLAN.md) F6 (a `session.compact`
hook that scores messages; it composes with W3 below),
[PI-SDLC-MOD-PORT-CANDIDATES.md](PI-SDLC-MOD-PORT-CANDIDATES.md) C4 (the
keep-the-stage instruction, taken up here), `hooks/mod/` (the module),
[RELEASE-DISCIPLINE.md](RELEASE-DISCIPLINE.md).

## 1. Goal

When a `/wf` stage turn lands its artifact, the mod compacts the session
before the next stage runs, with instructions that keep the workflow's
position and the person's decisions. The person no longer reads "consider
compacting the session before `/wf verify`" and types `/compact` by hand.
The next stage starts on a summary plus the artifacts on disk, which every
`/wf` command re-reads itself (the orientation message left `SessionStart`
in 9.97.0).

## 2. Why the mod, and why now

- The skill prose in `plan.md` Step 7, `implement.md` Step 8, and
  `verify.md` Step 7 recommends a compaction before the next stage. The
  recommendation is advice; nothing acts on it.
- The engine compacts on its own only at the context threshold, in the
  middle of whatever turn reaches it. A compaction at a stage boundary
  sheds the stage's tool output and keeps its decisions; a compaction
  mid-stage sheds both.
- The contract exposes `$.session.compact({ instructions })`: the same
  path `/compact` takes, `trigger: 'plugin'`, callable between turns. The
  mod's `turn.complete` hook already knows the command that ran, the
  artifact it was expected to write, the paths it wrote, and the next
  invocation. Every input the decision needs is in hand at that point.
- The plugin's classic `PreCompact` hook was removed in v9.41.0 because a
  command hook cannot shape the summary. A mod can: `instructions` reaches
  the summarizer.

## 3. Decisions

These are fixed for the build. A wave that needs a different answer stops
and asks the operator.

1. **Aid, never gate.** The compaction never blocks the next stage. A call
   that rejects, resolves `{ skip }`, or throws leaves the session as it
   is and writes one log line.
2. **Between turns only.** The call is made after the `turn.complete`
   dispatch, from `$.clock.after`, never inside a hook's chain. The
   contract says the call rejects while a turn runs.
3. **Landed stages only.** The trigger fires for a stage whose artifact
   landed, by the same test the stage-landed check uses. A stage that
   ended without its artifact gets the toast the check already gives, and
   no compaction.
4. **One switch, on by default.** `stageCompact` in the manifest's
   `userConfig`, beside `suggestNext` and `stageCheck`. A person who
   prefers `/compact` by hand turns it off in `/config`.
5. **No floor.** Every landed stage compacts, whatever the context fill.
   The operator chose this on 2026-09-22: the skill prose recommends a
   compaction after every stage, and the stage boundary is the point
   where the shed context is noise. `$.session.usage()` is read for the
   toast's percent only, and a failed read leaves the percent out.
6. **The main loop only.** A `turn.complete` that carries `agentId` is a
   sub-agent's turn; the trigger ignores it.
7. **Not during a driver.** `auto` and `yolo` are excluded: the driver runs
   in the background past its own turn, and the stages it runs land as
   sub-agent turns the trigger already ignores.
8. **The instructions name what to keep, not what to write.** The text
   asks the summarizer to keep the slug, the slice, the next invocation,
   the artifact paths written this turn, and any decision or answer not yet
   in an artifact. It never asks for a format.
9. **Codex and pi see nothing.** `hooks/hooks.json`'s `modules` entry is
   Claude Code's alone. The skill prose keeps its "consider compacting"
   lines for those hosts.

## 4. The engine contract the build uses

| Need | Mechanism | Where in the contract |
| --- | --- | --- |
| Start a compaction from code | `$.session.compact({ instructions })` → `SessionCompacted \| { skip }`; rejects while a turn runs | line 2188, `SessionCompactArgs` line 6814 |
| Know the context fill, for the toast | `$.session.usage()` → `{ context: { percent } }`; the plain call costs nothing | line 2170 |
| Know that a stage turn ended | `turn.complete` with `reason`, `turnId`, `agentId?`, `usage?` | `TurnCompleteInput` line 8391 |
| Run after the dispatch | `$.clock.after(0, fn)` (already bound as `engine.later`) | `Host.later` in `register.ts` |
| Steer any compaction | `on('session.compact', ($, e, next) => next({ ...e, instructions }))`; `trigger` is `manual \| auto \| plugin \| precompute` | line 3109, `SessionCompactTrigger` line 6913 |
| Tell the person | `$.ui.toast`, `$.ui.log`, `$.ui.status` (already bound) | `Host` in `register.ts` |

## 5. What the person sees

After `/wf implement alpha-flow auth` lands `05-implement-auth.md`, the
toast reads `wf: compacting after implement (context 62%)`. The engine's
own compaction notice follows. The prompt box then shows
`/wf verify alpha-flow auth` dim, as it does today; Tab takes it.

When the usage read fails, the toast reads `wf: compacting after
implement`. When a hook vetoes the compaction, one log line reads
`wf: compaction skipped: <reason>`. After `/wf review`, nothing happens:
a review with open findings often continues into a fix turn that wants
the findings in context, so `review` is exempt.

## 6. Shared foundation (W1)

### 6.1 Pure helpers — `hooks/mod/active.ts`

- `stageLanded(turn, command, mtime)`: the test now inline in the
  `turn.complete` hook, moved out so the check and the trigger share it.
  Answers `true` when the expected artifact is in `turn.writes` or its
  mtime is later than `turn.startedAt`. When `expectedArtifactOf` answers
  `null` (`plan <slug> all`, a key without an artifact), answers `true`
  only when `turn.writes` holds at least one path under the workflow.
- `compactEligible(command, workflow, e)`: `true` when every condition
  holds: `e.reason === 'answer'`, `e.agentId` is absent, `command.slug`
  is not null, `command.key` is in `COMPACT_KEYS`, `workflow` is not
  terminal, and `workflow.nextInvocation` is not null.
  `COMPACT_KEYS` = `shape`, `slice`, `plan`, `implement`, `verify`,
  `handoff`, `ship`, `retro`. `intake` is out: its next step is a
  question round, not a stage. `review` is out by the operator's decision
  (§11): its findings feed the fix turn that follows.
- `compactInstructionsOf(workflow, command, writes)`: the text of §6.3.

### 6.2 Settings

- `Settings` gains `stageCompact: boolean`, default `true`, in
  `SETTING_NAMES` and `DEFAULT_SETTINGS`.
- The manifest gains the field under `userConfig`:
  `type: boolean`, `title: "Compact after a stage"`,
  `description: "After a /wf stage turn lands its artifact, compact the session with instructions that keep the workflow's position and the person's decisions."`,
  `default: true`.
- `config.set` needs no new branch: the existing handler stores any
  boolean field by name.

### 6.3 The instructions text

One paragraph, built from the workflow entry and the turn:

> The /wf `<key>` stage of workflow `<slug>` is complete. Keep the
> workflow slug `<slug>`, the selected slice `<slice>`, and the next
> invocation `<nextInvocation>`. Keep the paths of the artifacts written
> this turn: `<path>`, `<path>`. Keep verbatim every decision, acceptance
> criterion, blocker, and answer the person gave that is not yet written
> to an artifact. Drop tool output, test logs, and file contents; the next
> stage re-reads the artifacts from disk.

The slice sentence is omitted when `selectedSlice` is null. The path list
holds at most 12 paths; past 12, the sentence reads
`<n> artifacts under .ai/workflows/<slug>/`.

## 7. W2 — the trigger at `turn.complete`

**Mechanism.**

1. After `await next(e)` and the existing stage-landed check, compute
   `landed = stageLanded(turn, command, mtime)` once and let the check
   use it too.
2. When `settings.stageCompact`, `landed`, and
   `compactEligible(command, workflow, e)` all hold, and
   `compactedTurnId !== e.turnId`, set `compactedTurnId = e.turnId` and
   schedule the compaction with `engine.later`.
3. The scheduled function:
   1. Reads `$.session.usage()` for the percent. A failed read or an
      absent `context.percent` leaves the percent out of the toast.
   2. Toasts `wf: compacting after <key> (context <n>%)`, or
      `wf: compacting after <key>` without a percent.
   3. Calls `engine.compact(instructions)`. The `Host` gains
      `compact: (instructions: string) => Promise<{ skip?: string }>`,
      bound to `$.session.compact({ instructions })`.
   4. On `{ skip }`, logs `wf: compaction skipped: <skip>`.
   5. On rejection, retries once after 500 ms (`$.clock.after`), because
      the first call may still be inside the turn (probe P-C1). On a
      second rejection, logs the message and stops.
   6. Then proposes the next invocation with `engine.suggest`, as the
      suggestion does today. The suggestion moves behind the compaction
      so the dim text is proposed on the compacted session (probe P-C2).
4. When the trigger does not fire, the suggestion is proposed as today.

**Order inside the hook.** Cost row → `refreshActive` → stage-landed
check → compaction or suggestion. The cost row and the check stay as they
are.

**Kit tests** (`hooks/mod/tests/register.test.ts`), with a bottom mock
for `session.compact` and `session.usage` registered in the seat before
the first `$` call (probe P-C5):

- A stage turn that writes its artifact, at 62 percent, calls
  `session.compact` once with instructions that name the slug, the slice,
  the next invocation, and the path; the toast reads as §5; the suggestion
  follows the compaction.
- The same turn at 8 percent calls `session.compact` once: there is no
  floor.
- The same turn with a rejecting `session.usage` calls `session.compact`
  once, and the toast carries no percent.
- A `/wf review` turn that writes `07-review-auth.md` calls nothing; the
  suggestion is proposed as today.
- A turn that writes nothing calls nothing; the check's toast still shows.
- An interrupted turn (`reason: 'aborted'`) calls nothing.
- A sub-agent turn (`agentId` present) calls nothing.
- A `/wf status` turn calls nothing.
- A `/wf auto` turn calls nothing.
- A `{ skip: 'off' }` answer logs the reason and still proposes the
  suggestion.
- A first rejection then a success calls `session.compact` twice; two
  rejections log once and stop.
- With `stageCompact` false, nothing is called.

**Harness tests** (`tests/unit/mod/wf-picker.harness.mjs`): `stageLanded`
over the four cases (in writes, mtime later, neither, no expected
artifact with and without writes); `compactEligible` over each condition
false in turn; `compactInstructionsOf` with and without a slice, and past
12 paths.

## 8. W3 — the keep-the-stage instruction on every compaction

Candidate C4's second half. A `session.compact` hook on the main loop
(`agentId` absent) prepends one sentence to `e.instructions` while a
workflow is active:

> Keep the active /wf workflow `<slug>`, its stage `<currentStage>`, its
> slice `<slice>`, its next invocation `<nextInvocation>`, and the paths
> under `.ai/workflows/<slug>/`.

Then `next({ ...e, instructions })`. `messages` is never rewritten. The
hook runs on `manual` and `auto` triggers, and on `plugin` when the caller
is another plugin (probe P-C4 says whether the mod's own call reaches its
own hook; when it does, the sentence is not added twice because the W2
text already names each item). On `precompute`, the hook passes `e`
through untouched.

Switch: the same `stageCompact`. A person who turns off the trigger loses
the sentence too; a second switch for one sentence is not worth a row in
`/config`.

Composition with JEV-MOD-PLAN F6: F6's hook, when built, prepends the
message indexes to keep. Both hooks prepend; the order between them does
not matter.

Kit tests: a `manual` compaction while a workflow is active gains the
sentence; one while none is active passes through; a `precompute` passes
through; a sub-agent's compaction passes through.

## 9. Files

| File | Change |
| --- | --- |
| `hooks/mod/active.ts` | `stageLanded`, `compactEligible`, `compactInstructionsOf`, `COMPACT_KEYS`, `stageCompact` in `Settings` |
| `hooks/mod/register.ts` | `Host.compact`, `compactedTurnId`, the trigger in `turn.complete`, the `session.compact` hook |
| `.claude-plugin/plugin.json` | the `stageCompact` field |
| `hooks/mod/tests/register.test.ts` | the kit tests of §7 and §8 |
| `tests/unit/mod/wf-picker.harness.mjs` | the harness tests of §7 |
| `docs/internal/MOD-FEATURES.md` | one inventory row, one engine fact per settled probe |
| `docs/site/reference/hooks.html` | the switch in the list of mod switches |
| `CHANGELOG.md` | the release heading |

The skill prose (`plan.md`, `implement.md`, `verify.md`) does not change:
Codex and pi still need the advice, and on Claude Code the toast tells
the person the compaction ran.

## 10. Waves

### W0 — Probes (before any build)

| Probe | Question | Feeds |
| --- | --- | --- |
| P-C1 | Is a call from `$.clock.after(0)` scheduled inside the `turn.complete` dispatch "between turns", or does it reject? If it rejects, what delay is enough? | W2 step 3.5 |
| P-C2 | Does a compaction clear a `$.prompt.suggest` proposed before it? | W2 step 3.6 |
| P-C4 | Does the mod's own `$.session.compact` call run the mod's own `session.compact` hook? ("every hook but the calling one") | W3 |
| P-C5 | Does the kit's mock seat carry `session.compact` and `session.usage` as bottom ops? | W2 tests |
| P-C6 | What does the engine show after a `plugin`-triggered compaction: the same notice as `/compact`, or nothing? | §5 |

Each probe is one live session on the fixture repository
(`scripts/mod-fixture.mjs <dir>`) with `SDLC_HOOK_DEBUG=1`, and its answer
goes in MOD-FEATURES.md §4.

### W1 — Foundation

§6. Gate: harness tests green; `npm run verify:versions` unchanged.

### W2 — The trigger

§7. Gate: kit tests green; one live run on the fixture repository shows
the toast, the engine's notice, and the suggestion, in that order.

### W3 — The instruction on every compaction

§8. Gate: kit tests green; one live `/compact` while a workflow is active
shows the sentence in the summary.

### W4 — Docs and release

§9's doc rows, then one minor release under
[RELEASE-DISCIPLINE.md](RELEASE-DISCIPLINE.md): gates, changelog heading,
catalog line, `npm version minor`, commit and tag by hand, push with tags,
reinstall the four hosts.

## 11. Operator decisions (2026-09-22)

The draft asked three questions. The operator answered the same day.

1. **No floor.** Every landed stage compacts, whatever the context fill.
   Decision 5 and W2 step 3.1 record it.
2. **`review` is exempt.** A review with open findings often continues
   into a fix turn that wants the findings in context. `COMPACT_KEYS`
   leaves `review` out.
3. **No ask.** The toast stands; `$.ui.ask` is not used. A keystroke per
   stage is not wanted.

A wave that needs a different answer to one of these stops and asks.

## 12. Risks

- **The call rejects at `turn.complete`.** P-C1 answers this first. The
  fallback is a delay; the last fallback is a `prompt.suggest`-time call,
  which is later than wanted but still before the next turn.
- **The summary drops a decision.** The instructions ask to keep every
  decision not yet in an artifact; a summarizer can still drop one. The
  artifacts on disk are the record; the `/wf` commands re-read them. The
  decisions the person gave in a questionnaire are in `01-intake.md` and
  `02-shape.md` before the stage ends.
- **A compaction the person did not want.** The switch is in `/config`,
  and the toast names the cause. A fresh session with a short first stage
  is compacted too; the summary of a short session is short, and the cost
  is one summarizer call.
- **Two compactions in a row.** `compactedTurnId` stops a second call for
  one turn. The engine's own threshold compaction after the mod's is
  possible only when the summary itself exceeds the threshold, which a
  summary does not.

## 13. Sources

- `.claude/types/claude-code.d.ts` (Claude Code 2.1.271): `$.session.compact`
  line 2188, `SessionCompactArgs` line 6814, `SessionCompactInput` line
  6853, `SessionCompactTrigger` line 6913, `session.compact` event line
  3109, `TurnCompleteInput` line 8391.
- `hooks/mod/register.ts` `turn.complete` hook, lines 824–861, at
  `9e275206`.
- `hooks/session-start-orient.mjs` header: the orientation message was
  removed in 9.97.0; the `/wf` commands re-read `00-index.md` themselves.
- Memory note `sdlc-precompact-hook-removed`: the classic `PreCompact`
  hook could not shape the summary and was deleted in v9.41.0.
