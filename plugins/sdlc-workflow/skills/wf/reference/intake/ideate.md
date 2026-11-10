# Output boundary & shared context
Apply `intake/_intake-context.md` — the External Output Boundary, and the workflow-registry / slug rules. Do not restate them here.

You are running `/wf intake ideate`, the **ideation mode**. It finds what is worth working on next, so the person does not start from a blank brief. It scans the codebase, and the sources when the person gives them. It writes ranked ideas, each with evidence from the code, and each ready to start with `/wf intake`.

# Slug-mode

When the dispatcher selected slug-mode, follow [_compressed-slice.md](../_compressed-slice.md) with `<op>` = `ideate`: it overrides the standalone steps below.

# Pipeline
`0·orient` → `1·sources and lenses` → `2·generate` → `3·filter` → `4·rank` → `5·present` → `6·write` → `7·loop` → `pick`

ideate writes its own light workflow: `00-index.md` and the lead `01-ideate.md`. It starts no build workflow and advances no other workflow. A pick writes a list; the campaign walk builds it.

| | Detail |
|---|---|
| Requires | See [## Requires](#requires). |
| Produces | A `type: workflow-index` slug workflow: `<wf-dir>/01-ideate.md` (`type: ideation`: the `ideas:` and `culled:` rosters and the ranked list) and a light `00-index.md` (`type: workflow-index`). An old off-pipeline run in `.ai/ideation/<focus>-<timestamp>.md` still renders through the ideation discovery. |
| Next | `/wf intake ideate <slug> <idea-id…>` picks ideas. The pick prints `/wf campaign <slug>`. |

## Requires

Read every row before you write the stage artifact. [_requires.md](../_requires.md) defines the check.

| Input | Kind | When | Sections |
|---|---|---|---|
| a git project (codebase, git log, existing workflow artifacts) | artifact | always | |
| `00-index.md` | artifact | on-resume | |
| `01-ideate.md` | artifact | on-resume | |
| `decisions.yaml` | artifact | if-present | |
| `intake/_intake-context.md` | procedure | always | |
| `intake/_light-index.md` | procedure | always | |
| `intake/ideate/_lenses.md` | procedure | always | |
| `intake/ideate/_artifact.md` | procedure | always | |
| `intake/ideate/_loop.md` | procedure | always | |
| `intake/ideate/_rounds.md` | procedure | mode:steer | |
| `intake/ideate/_sources.md` | procedure | mode:sources | |
| `intake/ideate/_pick.md` | procedure | mode:pick | |
| `_compressed-slice.md` | procedure | mode:slug | |
| `01-ideate.md` | writes | | |

# Role
You find opportunities and you challenge them. You do not solve them.
- Do not implement, plan or design anything. Make no code change.
- ideate is an analysis mode, not a build lifecycle. Its light `type: workflow-index` slug workflow has one artifact, the lead `01-ideate.md`. Do not write a build stage file (`02-shape.md`, `03-slice.md`, `04-plan.md`, `05-implement.md`, …).
- The work is: scan, generate candidates, challenge them, rank the survivors, present them, write the artifact, and triage them with the person in the loop (triage, discuss, steer).
- Keep the order of the steps where a step uses the output of an earlier step or crosses a gate.

---

# Step 0 — Orient

1. **Give each argument a kind.** Run `node "<skill-dir>/scripts/ideate-sources.mjs" args "<projectRoot>" "<the argument text>"`. The script applies these rules in order. The first rule that matches wins:

   | # | Shape | Kind |
   |---|---|---|
   | 1 | The first token is the slug of an existing ideate run | Resume, pick, or `refresh` (item 3) |
   | 2 | A `github.com/<o>/<r>/issues…` URL | Issue source |
   | 3 | Any other `http(s)://` URL | Web source |
   | 4 | A path to a file that exists | Document source |
   | 5 | `<name>@<version>` | Dependency changelog source |
   | 6 | `issues` or `issues:<query>` | Issue source |
   | 7 | `research` | The research scan ([_lenses.md](ideate/_lenses.md), Research) |
   | 8 | An integer | Count: the maximum number of ranked survivors. The default is 10 |
   | 9 | `quality`, `performance`, `security`, `dx`, `feature`, `architecture` | Lens filter: run only those lenses. With no filter, run all six |
   | 10 | Any other words | Topic, given to every lens |

   `research` and `issues` are reserved words. Quote a topic that is one of them.
2. **Name a new workflow.** Name it per "New slug" of [_intake-context.md](_intake-context.md), with the form `ideate-<focusSlug>-<YYYYMMDD>`. The script gives `focusSlug`: the lens filter, the topic, `sources` when only sources are given, or else `all`.
3. **Split an existing run** (kind 1). The `mode` of the script output decides:
   - `refresh`: go to `# Refresh`.
   - `steer` (a word of `deeper`, `similar`, `lens`, `direction`, `surprise` after the slug): run items 4 to 6, then the round per [_rounds.md](ideate/_rounds.md), then Step 7. Add `steer` to `modes:` of `01-ideate.md`.
   - `pick` (idea ids `IDEA-NNN`, or an idea title): set those ideas to `triage: take`, and run `# Pick — decision closure`. The prose after the ids is the decision note. When the index is already closed and the run has no list, warn the person, and end the run. When the run has a list, the pick appends to it. Quote an idea title that starts with a steer word.
   - `resume` (no token after the slug): when `01-ideate.md` is complete, go to Step 7, at its Resume section. When it is not complete, resume from the missing step.
4. **Find the existing workflows.** Read the index of each workflow under `.ai/workflows/` with `node "<skill-dir>/scripts/wf.mjs" record get "<root>" <slug> index`. Note which are active or recently completed. Step 3 culls an idea that repeats work in flight or work just shipped.
5. **Seed from the recorded history.** The repo already wrote down what needs doing, and the lenses do not derive it again blind. Make these cheap reads, and skip what is absent:
   - the retro action items: the action-item section of the `10-retro.md` record of each workflow, read with `record get`;
   - the `.ai/solutions/` entries;
   - the deferred review findings: the review ledger entries marked deferred;
   - the `sdlc-debt:` markers: `grep -rn 'sdlc-debt:' --include='*.{js,ts,py,go,rs,java,kt,md}'`, or the repo's equivalent.

   Give the harvest to every lens prompt as prior context, tagged `recorded-history`. A candidate that matches a recorded item cites it as evidence, and skips Challenge 1.
6. **Remember the earlier runs.** Read the `01-ideate.md` record of every earlier ideate workflow with `record get`, open and closed. Give their `ideas:` and `culled:` rosters to Step 3. A new candidate matches an earlier one by title or by evidence:
   - An earlier cull stays culled. The candidate comes back only when its evidence changed: a cited file changed since the earlier run, or a new source item supports it. Record `seen-in: <earlier slug>` and `changed: <what changed>`.
   - An earlier picked idea fails Challenge 2 (already in progress or shipped).
   - An earlier idea that was not picked records `seen-in:`, and keeps its rank logic.
7. **No code yet.** When the repo has no source code (only docs, config or `.ai/`) and no source argument, the lenses have nothing to scan. Propose a brainstorm instead, per [_gate-question.md](../_gate-question.md): the person types `/wf intake brainstorm <idea>`, or names the code to scan. Do not start the scan before the answer.
8. **Announce the plan in chat:**
   ```
   Scanning codebase for improvement opportunities.
   Arguments: <each argument with its kind>
   Focus: <lens filter, topic, or "all lenses">
   Sources: <S-ids with their origins, or "none">
   Target count: <N> ranked survivors
   Lenses: <list of active lenses, with Lens 7 when sources are present>
   ```

# Step 1 — Take in the sources, then explore

1. **Sources.** When Step 0 found a source argument or `research`, follow [_sources.md](ideate/_sources.md): read each source, save its reference copy, and write the `sources:` and `source-items:` rosters. Lens 7 then runs in item 2.
2. **Lenses.** Launch the exploration sub-agents in parallel, one per lens. Launch only the lenses of the focus, or all six when there is no focus. Each sub-agent returns structured findings: specific evidence from this codebase, not generic advice. `intake/ideate/_lenses.md` holds the six lens charters, Lens 7 (source fit, when the source roster is not empty), the research rules, the shared evidence rule, and the effort tiers.

---

# Step 2 — Generate the raw candidates

When every sub-agent is done, turn their findings into raw idea candidates. Generate every candidate that the findings support. Do not pad to a count. Each candidate:

- rests on at least one specific finding of a sub-agent (a file path and its evidence);
- is concrete work that someone can do: not "improve test coverage", but "add integration tests for the auth flow in `src/auth/login.ts`";
- has an entry point: the `/wf` command that starts the work.

Give each candidate these fields:
```
ID: IDEA-NNN
Category: quality | performance | security | dx | feature | architecture
Title: <verb phrase — e.g., "Add retry logic to the Stripe payment client">
Evidence: <file:line or file range from sub-agent findings>
Description: <2–3 sentences — what's wrong, what fixing it looks like, why now>
Effort: xs | s | m | l | xl
Impact: low | medium | high | critical
Entry: /wf intake <slug-suggestion> | /wf intake <existing-slug> <scope> (extension)
```

---

# Step 3 — Filter the candidates

Every raw candidate goes through the filter before it can enter the ranked list. Run each candidate through the challenges below. A candidate that fails a challenge is culled: record its id, its title and the reason, and leave it out of the survivors.

**Challenge 1 — Is it real?** Is the problem present in the codebase, or inferred from a generic pattern? A speculative finding ("this might be a problem if…") is not a specific one ("this file:line shows…"). Cull low-impact speculation. Do not cull a speculative candidate whose impact would be high if it is true: record it in the filter log as `needs-verification`, with the cheapest check that settles it. For a static truth the check is `/wf intake discover "<the falsifiable claim>"`. For a runtime question it is `/wf probe <slug> "<the runtime question>"`, once a workflow exists.

**Challenge 2 — Is it already in progress?** Check the workflows of Step 0, item 4. When the idea is in work or was just shipped, cull it, and note the workflow slug.

**Challenge 3 — Is the effort justified?** The improvement must be in proportion to the effort. An `xl` effort to fix a low-impact formatting inconsistency is not worth showing. Cull a candidate whose impact does not justify its effort.

**Challenge 4 — Is it specific enough to act on?** Someone must be able to run `/wf intake` on it now, with enough clarity to shape it. "Improve the architecture" and "write more tests" fail: they need to be split into concrete work first. Cull a candidate that is not specific enough to start as it is.

**Challenge 5 — Is this the right level?** Some findings show a symptom, not the root cause. When two candidates are symptoms of one problem, cull the symptom and keep the root cause, or merge them into one candidate that fixes the root.

**Challenge 6 — Is the item stable and available?** Sources only. Apply the rule in [_sources.md](ideate/_sources.md). Then confirm the result of every source item: each item ends with exactly one result.

**The filter log.** Write each culled candidate to the `culled:` roster. Do not show the log in chat: Step 5 gives only its count.

---

# Step 4 — Rank the survivors

1. For each survivor, record `impact`, `effort` and `feasibility`. `feasibility` is `clear` (no blockers), `needs-design` (a design decision comes first), or `external` (it depends on an outside team or system).
2. Rank the survivors by judgment. Weigh impact against effort. Rank an idea lower when it waits on a design decision or an outside team.
3. Give each idea its `confidence` by the table in `intake/ideate/_artifact.md`, and weigh it in the rank.
4. Record a one-line `rank-reason` for each idea that names the confidence.
5. Do not compute the `score` column: the renderer computes it from the three enums.
6. Cap the list at the count of the person (default 10). When two ideas rank equal, put security items and critical-impact items first.

---

# Step 5 — Present the ranked ideas

Print the ranked list in chat in this format:

```
## Ideation Results

Focus: <focus-area or "all lenses">
Raw candidates: <N>  |  Culled by filter: <N>  |  Survivors: <N>  |  Showing: <N>

### #1 — <Title> [<Category>] [Impact: <level>] [Effort: <level>]
**Evidence:** `<file:line>`
<Description>
**Entry:** `/wf intake <slug-suggestion>`

### #2 — ...
```

Then write the records (Step 6), and go to Step 7. The first question of the loop asks what happens next ([_loop.md](ideate/_loop.md), The first question): go through the ideas one by one, take some ideas now by number, look further, or save the list and decide later. The answer is a decision: the `triage` state of each idea holds it, and `selected:` holds the taken ideas at `done`.

# Step 6 — Write the artifact

The analysis modes root in a `type: workflow-index` slug workflow, and the lead is its only artifact. Write two records as drafts under `<wf-dir>/.draft/`, with the slug of Step 0, item 2. Then run `node "<skill-dir>/scripts/wf.mjs" record put "<root>" <slug>`.

Generate the `created-at` timestamp per [_timestamp.md](../_timestamp.md).

**`00-index.md`.** Write its draft from [_light-index.md](_light-index.md), the `ideate` row. The workflow stays open until the pick: `status: ready`, `next-command: user-picks`, `next-invocation: /wf intake ideate <slug>`. Never write it `complete` and parked.

**`01-ideate.md`** (`type: ideation`). Write its draft per the template in `intake/ideate/_artifact.md`:
- the frontmatter with the `ideas:` roster: per idea the `file:line` evidence, the `entry:` invocation, and `triage: open`;
- the `culled:` log;
- the `rounds:` list with its round-1 entry (`kind: initial`);
- with sources, the `sources:`, `source-items:` and `research:` rosters;
- then the ranked ideas, built from the roster, and the how-to-use footer.

After the put, run `ideate-sources.mjs check "<projectRoot>" <slug>`. It must return `ok: true`: every source item has a result, and the triage states and the links between ideas resolve.

# Step 7 — The loop

Follow [_loop.md](ideate/_loop.md). The person triages each idea, discusses an idea, and steers the scan into new rounds ([_rounds.md](ideate/_rounds.md)). Only the person's `done` or `pause` ends the loop. A `done` with taken ideas runs `# Pick — decision closure`. In a non-interactive run, skip this step.

# Pick — decision closure

The pick runs from the `pick` mode of Step 0 (`/wf intake ideate <slug> <idea-id...> [one-line reason]`), or from `done` in Step 7 with one idea or more at `triage: take`. Add `pick` to `modes:` of `01-ideate.md`, and follow [ideate/_pick.md](ideate/_pick.md) in full. It follows "Closure" of [_light-index.md](_light-index.md) with the `ideate` row, and writes one list with one work packet per selected idea.

# Refresh

`/wf intake ideate <slug> refresh` checks a finished run again:

1. Snapshot `01-ideate.md` to `history/`: write the output of `record get "<root>" <slug> 01-ideate.md`. Add a `revisions:` entry with `trigger: refresh`, per [_additive-write.md](../_additive-write.md).
2. Check the evidence of each survivor against the current code. Set its `refresh:` to `still-valid`, `stale` (the evidence is gone), or `done-elsewhere` (a later workflow or commit did it). Keep the `triage` state of each idea. A drop of the person stays dropped. When the cited code of a dropped idea changed, list it in one line, "you dropped this on <date>; its code changed", so the person can rescue it.
3. Read each source again ([_sources.md](ideate/_sources.md)). Compare the new item list with `source-items:`. A new item goes through Lens 7 and gets a result. A removed item gets `result: withdrawn`.
4. Rank again, write the draft of `01-ideate.md`, put it, and print only the changes.

On a closed run, `refresh` reopens the workflow (`status: ready`) only when it finds a new idea. Otherwise it reports, and the run stays closed. An open run goes into Step 7 after the refresh.

# Chat return contract
After you write the files, return per [_chat-return.md](../_chat-return.md): lead with the narrative (section *The narrative*), then this receipt:
- `wrote: <wf-dir>/01-ideate.md + 00-index.md`
- `ideas: <N> survivors from <M> raw candidates`
- `triage: <N> taken · <N> later · <N> dropped · <N> to brainstorm · <N> open`, and `rounds: <N>` when a steer ran
- `sources: <N> read, <N> unavailable; items by result`, and every research act, when sources ran
- the ranked list (the format of Step 5)
- `options:` the invocations of the pick after `done`; else `/wf intake ideate <slug>` to continue the loop, or `/wf intake ideate <slug> deeper <idea>` to look further
