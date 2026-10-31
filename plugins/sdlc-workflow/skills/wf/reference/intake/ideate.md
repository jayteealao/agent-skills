# Output boundary & shared context
Apply `intake/_intake-context.md` — the External Output Boundary, and the workflow-registry / slug rules. Do not restate them here.

You are running `/wf intake ideate`, a **pre-pipeline ideation utility** for the SDLC lifecycle.

# Slug-mode

When the dispatcher selected slug-mode, follow [_compressed-slice.md](../_compressed-slice.md) with `<op>` = `ideate`: it overrides the standalone steps below.

# Pipeline position
```
[wf-ideate] → wf-intake → 1·intake → 2·design → ... → 9·retro
```

This command does NOT start or advance any workflow. It discovers improvement opportunities in the codebase and produces ranked, evidence-grounded idea candidates that are ready to feed directly into `/wf intake`. Run it when you want to find what's worth working on next, rather than starting from a blank brief.

| | Detail |
|---|---|
| Requires | See [## Requires](#requires). |
| Produces | A `type: workflow-index` slug workflow: `<wf-dir>/01-ideate.md` (`type: ideation` — the `ideas:` and `culled:` rosters + the ranked list) + a lightweight `00-index.md` (`type: workflow-index`). (Legacy off-pipeline `.ai/ideation/<focus>-<timestamp>.md` runs still render via the retained ideation discovery.) |
| Next | `/wf intake <idea-title>` — kick off a workflow for any chosen idea |

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
| `_compressed-slice.md` | procedure | mode:slug | |
| `01-ideate.md` | writes | | |

# Role
You are an **opportunity discoverer and adversarial filter**, not a problem solver; respect the stated order only where a step consumes an earlier step's output or crosses a gate.
- Do not start implementing, planning, or designing anything, and do not make code changes.
- This is a **terminal analysis mode**, not a build lifecycle: it roots a lightweight `type: workflow-index` slug workflow whose **only** artifact is the `01-ideate.md` lead. Do not author build stage files (`02-shape.md`, `03-slice.md`, `04-plan.md`, `05-implement.md`, …) — ideation is not a build lifecycle.
- Your job is: **scan → generate candidates → challenge them → rank survivors → present → write artifact → the loop with the person** (triage, discuss, steer).

---

# Step 0 — Orient

1. **Give each argument a kind.** Run `node "<skill-dir>/scripts/ideate-sources.mjs" args "<projectRoot>" "<the argument text>"`. The script applies these rules in order; the first rule that matches wins:

   | # | Shape | Kind |
   |---|---|---|
   | 1 | The first token is the slug of an existing ideate run | Resume, pick, or `refresh` (2c) |
   | 2 | A `github.com/<o>/<r>/issues…` URL | Issue source |
   | 3 | Any other `http(s)://` URL | Web source |
   | 4 | A path to a file that exists | Document source |
   | 5 | `<name>@<version>` | Dependency changelog source |
   | 6 | `issues` or `issues:<query>` | Issue source |
   | 7 | `research` | The research scan ([_lenses.md](ideate/_lenses.md), Research) |
   | 8 | An integer | Count: the maximum number of ranked survivors. Default: **10** |
   | 9 | `quality`, `performance`, `security`, `dx`, `feature`, `architecture` | Lens filter: run only those lenses. With no filter, run all six |
   | 10 | Any other words | Topic, given to every lens |

   `research` and `issues` are reserved words: a topic that is one of them is quoted.
2b. **New slug:** name the workflow per "New slug" of [_intake-context.md](_intake-context.md), with the form `ideate-<focusSlug>-<YYYYMMDD>` and `focusSlug` from the script (the lens filter, the topic, `sources` when only sources are given, else `all`).
2c. **Resume / refresh / steer / pick split** (kind 1). The `mode` of the script output decides:
   - `refresh` → jump to `# Refresh`.
   - `steer` (a word of `deeper`, `similar`, `lens`, `direction`, `surprise` after the slug) → run sub-steps 3 to 3c, then the round per [_rounds.md](ideate/_rounds.md), then Step 7. Add `steer` to `modes:` of `01-ideate.md`.
   - `pick` (idea ids `IDEA-NNN` or an idea title) → set those ideas to `triage: take`, and jump to `# Pick — decision closure` (trailing prose is the decision note; if the index is already closed and the run has no list, WARN and end the run; with a list, the pick appends to it). An idea title that starts with a steer word is quoted.
   - `resume` (no token after the slug) and `01-ideate.md` complete → go to Step 7, at its Resume section. Incomplete → resume from the missing step.
3. **Discover existing workflows** — read the index of each workflow under `.ai/workflows/` (`node "<skill-dir>/scripts/wf.mjs" record get "<root>" <slug> index`). Note which are active or recently completed. Ideas that duplicate in-flight or just-shipped work should be flagged as such during adversarial filtering.
3b. **Seed from recorded history** — the repo already wrote down what needs doing; the lenses must not re-derive it blind. Cheap reads, skip whatever is absent: retro action items (the `10-retro.md` record of each workflow, read with `record get`, the action-item section), `.ai/solutions/` entries, deferred review findings (review ledger entries marked deferred), and `sdlc-debt:` markers (`grep -rn 'sdlc-debt:' --include='*.{js,ts,py,go,rs,java,kt,md}'` or the repo's equivalent). Pass the harvest to every lens prompt as prior context, tagged `recorded-history` — a candidate that matches a recorded item cites it as evidence and skips Challenge 1.
3c. **Remember earlier runs.** Read the `01-ideate.md` record of every earlier ideate workflow (`record get`), open and closed. Pass their `ideas:` and `culled:` rosters to Step 3. A new candidate matches an earlier one by title or by evidence:
   - An earlier cull stays culled. The candidate comes back only when its evidence changed: a cited file changed since the earlier run, or a new source item supports it. Record `seen-in: <earlier slug>` and `changed: <what changed>`.
   - An earlier picked idea fails Challenge 2 (already in progress or shipped).
   - An earlier idea that was not picked records `seen-in:` and keeps its rank logic.
3d. **No code yet.** When the repo has no source code (only docs, config, or `.ai/`) and no source argument, the lenses have nothing to scan. Propose a brainstorm instead, per [_gate-question.md](../_gate-question.md): the person types `/wf intake brainstorm <idea>`, or names the code to scan. Do not start the scan before the answer.
4. **Announce plan to chat:**
   ```
   Scanning codebase for improvement opportunities.
   Arguments: <each argument with its kind>
   Focus: <lens filter, topic, or "all lenses">
   Sources: <S-ids with their origins, or "none">
   Target count: <N> ranked survivors
   Lenses: <list of active lenses, with Lens 7 when sources are present>
   ```

# Step 0.5 — Take in the sources

When Step 0 found a source argument or `research`, follow [_sources.md](ideate/_sources.md): read each source, save its reference copy, and write the `sources:` and `source-items:` rosters. Lens 7 then runs in Step 1.

---

# Step 1 — Parallel Codebase Exploration

Launch exploration sub-agents in parallel. Each sub-agent gets a specific lens and must return **structured findings** — not generic advice, but specific evidence from this codebase. Launch only the lenses relevant to the focus area (or all six if no focus).

The six lens charters, Lens 7 (source fit, when the source roster is not empty), the research rules, the shared evidence rule, and the effort tiers are in `intake/ideate/_lenses.md`.

---

# Step 2 — Generate Raw Idea Candidates

After all sub-agents complete, synthesise their findings into **raw idea candidates**. Generate every grounded candidate the lens findings support; do not pad to a count. Each candidate must:

- Be grounded in at least one specific finding from the sub-agents (file path, evidence)
- Be a concrete, actionable piece of work (not "improve test coverage" but "add integration tests for the auth flow in `src/auth/login.ts`")
- Have a proposed entry point (which `wf-*` command starts this work)

Assign each candidate:
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

# Step 3 — Adversarial Filtering

**This step is mandatory.** Every raw candidate must pass the adversarial filter before being eligible for the ranked list.

For each candidate, run it through the following challenges. If it fails any challenge, cull it — record the ID, title, and reason, but do not include it in the survivor list.

**Challenge 1 — Is it real?**
Is this problem actually present in the codebase, or is it inferred from a generic pattern? If the sub-agent finding was speculative ("this might be a problem if…") rather than specific ("this file:line shows…"), do not silently cull a candidate whose *impact would be high if true* — route it to the cheapest check instead: record it under the filter log as `needs-verification` with the named check (`/wf intake discover "<the falsifiable claim>"` for a static truth, `/wf probe <slug> "<the runtime question>"` once a workflow exists for a runtime one). Low-impact speculation is culled outright.

**Challenge 2 — Is it already in progress?**
Check the active workflows discovered in Step 0. If this idea is already being worked on or was just shipped, cull it and note the workflow slug.

**Challenge 3 — Is the effort justified?**
Would fixing this produce a meaningful improvement proportional to the effort? An xl effort to fix a low-impact formatting inconsistency is not worth surfacing. Cull if impact/effort ratio is unjustifiable.

**Challenge 4 — Is it specific enough to act on?**
Can someone run `/wf intake` on this right now with enough clarity to shape it? Vague ideas like "improve the architecture" or "write more tests" fail this — they need to be decomposed into something actionable. Cull if not specific enough to intake as-is.

**Challenge 5 — Is this the right level?**
Some findings reveal symptoms rather than root causes. If two candidates are both symptoms of the same underlying problem, cull the symptom and keep the root cause (or merge them into one candidate that addresses the root).

**Challenge 6 — Is the item stable and available?** (sources only) Apply the rule in [_sources.md](ideate/_sources.md). Then confirm the result of every source item: each item ends with exactly one result.

**Output the filter log:** write each culled candidate to the `culled:` roster. Do not show the log prominently in chat.

---

# Step 4 — Rank Survivors

For each survivor, record `impact`, `effort`, and `feasibility`: `clear` (no blockers), `needs-design` (needs a design decision first), or `external` (depends on an external team or system). Rank the survivors by judgment: weigh impact against effort, and rank an idea lower when it waits on a design decision or an external team. Give each idea its `confidence` by the table in `intake/ideate/_artifact.md`, and weigh it in the rank. Record a one-line `rank-reason` for each idea that names the confidence. The renderer computes the `score` column from the three enums; do not compute it. Cap the list at the user's requested count (default 10). When two ideas rank equal, put security and critical-impact items first.

---

# Step 5 — Present Ranked Ideas

Print the ranked list to chat in this format:

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

Then write the records (Step 6), and go to Step 7. The first question of the loop asks what happens next ([_loop.md](ideate/_loop.md), The first question): go through the ideas one by one, take some ideas now by number, look further, or save the list and decide later. The answer is a decision, not chat exhaust: each idea's `triage` state holds it, and `selected:` holds the taken ideas at `done`.

# Step 6 — Write Artifact

The terminal analysis modes root in a `type: workflow-index` slug workflow (the lead is the only artifact). Write **two** records as drafts under `<wf-dir>/.draft/` (the slug derived in Step 0 sub-step 2b), run `node "<skill-dir>/scripts/wf.mjs" record put "<root>" <slug>`.

Generate a timestamp (UTC compact `<yyyymmdd>T<hhmmss>Z`) per [_timestamp.md](../_timestamp.md).

**`00-index.md`**: write its draft from [_light-index.md](_light-index.md), the `ideate` row. The workflow stays **open until the pick** — `status: ready`, `next-command: user-picks`, `next-invocation: /wf intake ideate <slug>`, never `complete`-and-parked.

Write the draft of **`01-ideate.md`** (`type: ideation`) per the template in `intake/ideate/_artifact.md`: frontmatter with the `ideas:` roster (per-idea `file:line` evidence, `entry:` invocation, and `triage: open`), the `culled:` log, the `rounds:` list with its round-1 entry (`kind: initial`), and with sources the `sources:`, `source-items:` and `research:` rosters, then the ranked ideas built from the roster, and the how-to-use footer. After the put, run `ideate-sources.mjs check "<projectRoot>" <slug>`. It must return `ok: true`: every source item has a result, and the triage states and the links between ideas resolve.

# Step 7 — The loop

Follow [_loop.md](ideate/_loop.md). The person triages each idea, discusses an idea, and steers the scan into new rounds ([_rounds.md](ideate/_rounds.md)). Only the person's `done` or `pause` ends the loop. `done` with taken ideas runs `# Pick — decision closure`. In a non-interactive run, skip this step.

# Pick — decision closure

Runs from Step 0 pick mode (`/wf intake ideate <slug> <idea-id...> [one-line reason]`), or from `done` in Step 7 with one or more ideas at `triage: take`. The ideas at `take` are the selected ideas; `later`, `drop`, `brainstorm`, and `open` ideas are not picked. The pick writes one list, with one work packet per selected idea, and closes the workflow. Steps 1, 2, 8 and 9 follow "Closure" of [_light-index.md](_light-index.md) with the `ideate` row; steps 3 to 7 are this mode's own.

1. **Stamp the artifact** (Closure step 1).
2. **Append `## Decision`** (Closure step 2). The culled siblings seed the out-of-scope list of a work packet.
3. **Agree the order.** With two ideas or more, propose an order from the rank, and ask the person to confirm it. For each idea after the first, ask why it comes after the ideas before it, and record the answer in the person's words.
4. **Write up each build work packet.** A build work packet has the form `intake`, `extension`, `fix` or `hotfix`. From the idea's card, write its goal, its in-scope and out-of-scope lines, its checkable acceptance criteria, its constraints and its risks, per "The write-up of a build work packet" in [brainstorm/_work.md](brainstorm/_work.md). Propose its `ux-impact`, its `try-out` and its `estimated-slices`. Detect the stack once: run the probes in `intake/default/_stack-fingerprint.md`.
5. **Confirm the list.** Ask one question per [_gate-question.md](../_gate-question.md) with the work packets in order, each with its form, its write-up, its `ux-impact` and its `try-out`, and the stack. The person confirms the grouping into work packets, `ux-impact`, `try-out` and the stack. Do not ask about the pick reason again. Two ideas of one family can become one work packet when the person says so (the Size rules of [brainstorm/_work.md](brainstorm/_work.md)).
6. **Write `ideate-work.json`** in the board shape of a brainstorm (`$defs.brainstormBoard`), so `campaign.mjs` reads it. The write hook validates it. Keys are lower-case words joined by dashes:
   - `schema: sdlc/v1`, `artifact: brainstorm-board`, `slug`, `topic` (the focus), `areas: []`, and `stack` (the confirmed stack, with `user-confirmed: true`).
   - `threads`: one per selected idea, `key: idea-<NNN>`, `name` (the title), `state: live`; and one `key: pick` thread for the pick.
   - `items`: each idea's evidence as `kind: finding` items on its thread (`evidence:` the `file:line` or the reference path `references/<kind>/<file>`, never a `.ai/…` path). The person's pick reason is ONE `kind: decision`, `scope: keep`, `source: person` item on the `pick` thread, with `session: 1` and `decided-at:` the `chosen-at` time. It is carried once, by the order-1 work packet, which carries it word for word. Do not copy it into every thread.
   - `work`: one work packet per idea: `key` and `slug` (the idea's slug suggestion), `title`, `shape` (the form of the idea's `entry:`: `intake`, `extension`, `fix`, `hotfix`, `rca`, `investigate`, `discover`, or `task`), `target-slug` for `extension`, `fix` and `hotfix`, `order` (1 to n, from step 3), `why-here` (after order 1; it names the pick), `design-form: none`, `items` (the order-1 work packet also lists the pick decision), and `state: proposed`. A build work packet also carries its write-up of step 4, with `ux-impact-confirmed: true`. `entry` is `/wf campaign <slug>` for a build work packet, and the command of its form for any other work packet. Do not copy the idea's `depends-on:` into the work packet: the walk builds the work packets in list order.
7. **Write the list.** Run `node "<skill-dir>/scripts/campaign.mjs" write "<wf-dir>/ideate-work.json"`. It checks the board, then writes one work packet file per work packet in `work/`, and `work/index.md` last. On an error, repair the board and run it again.
8. **Close the workflow** (Closure step 3).
9. **Print the invocations.** Print `/wf campaign <slug>` when the list has a build work packet. Print the command of each work packet of another form. When an idea's `depends-on:` names `/wf intake update-deps`, print that command first. Do not run them.

A later pick on a run that already has a list appends its work packets after the last work packet of the list, and runs steps 1 to 9 for them. A work packet that the walk started keeps its text ([brainstorm/_work.md](brainstorm/_work.md), "Reopening a list").

## Regroup (the migration of an old campaign)

The first `/wf campaign <slug>` on an ideate run with an old campaign ledger migrates it (`campaign/_migrate.md`), and the walk then runs the section "Regroup" of [brainstorm/_work.md](brainstorm/_work.md) on `ideate-work.json`, in its own session, with the person. Skip step 1 of that section: it is for a brainstorm board only. In its step 2, put every carried item into exactly one work packet. Write up each new build work packet and confirm the stack as in steps 4 and 5 above, and write the list as in step 7 above.

# Refresh

`/wf intake ideate <slug> refresh` checks a finished run again:

1. Snapshot `01-ideate.md` to `history/` (write the output of `record get "<root>" <slug> 01-ideate.md`), and add a `revisions:` entry with `trigger: refresh`, per [_additive-write.md](../_additive-write.md).
2. Check each survivor's evidence against the current code. Set its `refresh:` to `still-valid`, `stale` (the evidence is gone), or `done-elsewhere` (a later workflow or commit did it). Keep each idea's `triage` state. A person's drop stays dropped; when its cited code changed, list it in one line, "you dropped this on <date>; its code changed", so the person can rescue it.
3. Read each source again ([_sources.md](ideate/_sources.md)). Compare the new item list with `source-items:`. New items go through Lens 7 and get a result. A removed item gets `result: withdrawn`.
4. Re-rank, write the draft of `01-ideate.md` and put it, and print the changes only.

On a closed run, `refresh` reopens the workflow (`status: ready`) only when it finds a new idea. Otherwise it reports and leaves the run closed. An open run goes into Step 7 after the refresh.

# Chat return contract
After writing files, return per [_chat-return.md](../_chat-return.md): lead with the narrative (section *The narrative*), then this receipt:
- `wrote: <wf-dir>/01-ideate.md + 00-index.md`
- `ideas: <N> survivors from <M> raw candidates`
- `triage: <N> taken · <N> later · <N> dropped · <N> to brainstorm · <N> open`, and `rounds: <N>` when a steer ran
- `sources: <N> read, <N> unavailable; items by result` and every research act, when sources ran
- The ranked list (Step 5 format)
- `options:` — the pick's invocations after `done`; else `/wf intake ideate <slug>` to continue the loop, or `/wf intake ideate <slug> deeper <idea>` to look further
