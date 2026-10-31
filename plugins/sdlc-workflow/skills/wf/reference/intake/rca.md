# Output boundary & shared context
Apply `intake/_intake-context.md`: the External Output Boundary, and the workflow-registry / slug rules. Do not restate them here.

You are running `/wf intake rca`, a **root-cause analysis workflow** that investigates an issue and recommends the right downstream command, without writing a fix.

# Slug-mode

When the dispatcher selected slug-mode, follow [_compressed-slice.md](../_compressed-slice.md) with `<op>` = `rca`: it overrides the standalone steps below.

# Pipeline
`1·symptom` → `2·investigate` → `3·synthesize` → `/wf plan` | `/wf intake fix` | `/wf intake hotfix`

| | Detail |
|---|---|
| Requires | See [## Requires](#requires). Pass an error description, stack trace, or an existing slug to resume; pass `<slug> <route>` to record the route and close. |
| Produces | `01-rca.md` (full RCA), `02-shape.md` (synthesized minimal shape so /wf plan works), `00-index.md`. Body templates: [intake/rca/_artifact.md](rca/_artifact.md). |
| Skips | No fix, no plan, no shape interview. The RCA *is* the shape. |
| Next | `/wf plan <slug>` (default: non-trivial fixes, same slug continues), `/wf intake fix "<suggested fix, one line>" from <slug>` (small fixes), `/wf intake hotfix "<symptom, one line>" from <slug>` (active production incidents). The artifact recommends one based on the diagnosis; recording the route (`# Route — decision closure`) is the terminus. |
| Escalate | If root cause is genuinely uncertain (confidence: low), climb the ladder before surrendering to triage: `/wf probe <slug> "<the runtime question the diagnosis hinges on>"` for a runtime fact, the `study-sources` skill for a dependency fact. Human triage is the LAST rung, reached when low confidence survives those. |

## Requires

Read every row before you write the stage artifact. [_requires.md](../_requires.md) defines the check.

| Input | Kind | When | Sections |
|---|---|---|---|
| `00-index.md` | artifact | on-resume | |
| `01-rca.md` | artifact | on-resume | |
| `decisions.yaml` | artifact | if-present | |
| `intake/_intake-context.md` | procedure | always | |
| `intake/_light-index.md` | procedure | always | |
| `intake/_intake-provenance.md` | procedure | always | |
| `intake/_intake-provenance-consume.md` | procedure | mode:from | |
| `intake/rca/_research.md` | procedure | always | |
| `intake/rca/_artifact.md` | procedure | always | |
| `_compressed-slice.md` | procedure | mode:slug | |
| `01-rca.md` | writes | | |
| `02-shape.md` | writes | | |

> **Read the real source (diagnosis).** When the symptom trail leads *out of the repo* (a stack frame inside `node_modules`/`site-packages`/a cached JAR, an error string absent from the tree, version-specific behavior), invoke the `study-sources` skill to read that dependency's **actual installed source** before settling on a hypothesis. A root cause grounded in the real implementation beats one grounded in recalled API behavior, which is exactly where plausible-but-wrong RCAs come from. Reads land in gitignored `.scratch/`; no repo mutation, no fix.

# Investigation discipline
You are a **diagnostician**, not a fixer.
- The **only** acceptable output is the RCA artifact, the synthesized shape, and the index. Do not edit application code. Do not propose a patch. Do not run code that would mutate state (DB writes, deployments, git commits).
- Read-only investigation only: `git log`, `git blame`, your native file-reading and search tools, log file inspection, dev-tooling inspection, and tests run in read-only modes.
- The "Suggested fix shape" section is **direction, not a plan**: 1 to 3 lines naming the area and approach. Do not enumerate steps.
- Ask at most **3 questions** in chat. No structured gate question. Record each answer with `decide add` per [_decisions.md](../_decisions.md), and also write it inline into the artifact.
- Respect the stated order only where a step consumes an earlier step's output or crosses a gate; reading and research may interleave freely.

# Step 0 — Orient
1. **Resolve slug and mode** from `$ARGUMENTS`:
   - If the first token names an existing workflow whose index (`node "<skill-dir>/scripts/wf.mjs" record get "<root>" <slug> index`) has `workflow-type: rca`, the workflow exists. Split on three sub-cases:
     - **A token after the slug matches a route** (`plan`, `fix`, `hotfix`, `human-triage`) → **route mode**. Jump to `# Route — decision closure` below; any trailing prose is the decision note. A closed index stops the run, per "Closure" of [_light-index.md](_light-index.md).
     - **`01-rca.md` is complete and no route token is present** → tell the user the diagnosis is ready and how to record the route (`/wf intake rca <slug> <plan|fix|hotfix|human-triage> [one-line reason]`) and stop.
     - **`01-rca.md` is incomplete** → **resume mode**: pick up from the missing section.
   - Otherwise → **new RCA**. This is an ordinary `.ai/workflows/<slug>/` directory; there is no synthetic `__rca__` slug. The renderer discovers it via the standard workflow walk and projects `01-rca.md` through the `01-rca` → rca route.
   - **Inbound provenance:** apply `_intake-provenance.md` on an explicit `from <source-slug>` token. A `discover` verdict routed here carries ranked counter-hypotheses that are literally candidate root causes; seed Step 2's sub-agent prompts with them and record `origin-discover` on the index.
2. **New slug:** name it per "New slug" of [_intake-context.md](_intake-context.md), with the form `rca-<short-symptom>`.
3. **Branch posture (do not switch branches):** investigation is read-only; create no branch and switch no branch. Record the current branch in the index as `branch` and `base-branch` so the eventual fix workflow knows where the diagnosis was performed.
4. **Read project context (lightweight):** `README.md` (top 100 lines) for project shape; `AGENTS.md` if present for conventions; the workflow folder names under `.ai/workflows/` to spot related active workflows the symptom might be tied to.

# Step 1 — Symptom intake
Ask at most **3 questions**; stop as soon as you have enough to investigate:

1. **What is broken?** Symptom: what is failing, where (URL, endpoint, page, component, service, log line), and for whom (all users, specific cohort, environment, account).
2. **What is the impact?** Critical (outage, data risk), high (degraded), medium (annoyance), or low (cosmetic). How many users? Is data at risk?
3. **What changed recently?** Deployments, migrations, config changes, dependency bumps in the last 24-72 hours that might be the cause.

If the user provided a stack trace or error message in `$ARGUMENTS`, treat it as partial answers; only ask remaining questions. Do not write the artifact yet. Hold the answers in working memory and proceed to Step 2.

# Step 2 — Parallel root-cause investigation
Launch parallel read-only sub-agents to identify the root cause. Do not proceed to synthesis until all complete. The three charters (code path investigation, recent change correlation, blast radius), the effort tier, the return shapes, and the local-symptom skip rule are in `intake/rca/_research.md`.

# Step 3 — Synthesize and write `01-rca.md`

Write the body per the section templates in `intake/rca/_artifact.md`: `## Symptom` through `## Tripwire warnings`, including the `## Recommended next command` routing table that names the exact invocation for each route. Write the record to the draft `.ai/workflows/<slug>/.draft/01-rca.md`, then run `node "<skill-dir>/scripts/wf.mjs" record put "<root>" <slug>`.

**`01-rca.md` frontmatter:**
```yaml
---
schema: sdlc/v1
type: rca
slug: <slug>
workflow-type: rca
symptom: <one-line description>
impact: <critical|high|medium|low>
root-cause-confidence: <high|medium|low>
blast-radius: <low|medium|high|skipped>
recommended-next: <plan|fix|hotfix|human-triage>
status: ready-for-fix-routing
created-at: <real UTC timestamp per _timestamp.md>
next-command: <user-picks until the route is recorded>
next-invocation: "/wf intake rca <slug> <route>"
recommended-routes: [{invocation: "/wf intake rca <slug> <route>", reason: "<one phrase>", default: true}]
---
```

# Step 4 — Synthesize `02-shape.md`

Write the draft of a minimal `02-shape.md` and put it, so `/wf plan <slug>` can consume the workflow directory without modification. The body template is in `intake/rca/_artifact.md`.

**`02-shape.md` frontmatter:**
```yaml
---
schema: sdlc/v1
type: shape
slug: <slug>
workflow-type: rca
status: complete            # the shape enum has no `ready` — the synthesis is complete when written
stage-number: 2
derived-from: 01-rca.md
created-at: <timestamp>
updated-at: <timestamp>
docs-needed: false
docs-types: []
tags: []
refs:
  rca: 01-rca.md
  index: 00-index.md
next-command: wf-plan                 # wf-design when design is needed (Step 5)
next-invocation: "/wf plan <slug>"    # "/wf design <slug>" when design is needed
recommended-routes: [{invocation: "/wf plan <slug>", reason: "the same slug continues", default: true}]
---
```

If the recommended next command is `/wf intake fix` or `/wf intake hotfix`, still write `02-shape.md`. Those commands ignore it, but it preserves the option to switch routing to `/wf plan` later without losing the synthesis.

# Step 5 — Write `00-index.md`

Write the draft of `00-index.md` from [_light-index.md](_light-index.md), the `rca` row, and put it. Add these keys, and add the two extra `progress` entries:

```yaml
branch: <current-branch-recorded-at-step-0>
base-branch: <current-branch-recorded-at-step-0>
recommended-routes:
  - {invocation: "<route>", reason: "<one phrase>", default: true}
  - {invocation: "<route>", reason: "<one phrase>"}
stack:
  detected-at: "<iso-8601>"
  platforms: []
  languages: []
  build: []
  testing: []
  user-confirmed: false
ux-impact: <none|visual|flow|new-surface>
ux-impact-confirmed: false
progress:
  rca: complete
  shape-synthesized: complete
  design: <not-started|skipped>
```

**UX impact.** Classify the suggested fix per `design/_lane.md`. When the value is `none`, also write `design-skip-reason:` (one line). When design is needed, the `plan` route goes through the design stage first: set `next-command: wf-design` and `next-invocation: "/wf design <slug>"`. The design stage confirms `ux-impact` with the person, writes the brief, and settles the design before plan.

Body: one-line description + a short pointer to `01-rca.md` and the routing recommendation. The rules of [_light-index.md](_light-index.md) apply: no `selected-slice`, and `progress` in the object form.

# Step 6 — Hand off to user

Return per [_chat-return.md](../_chat-return.md): lead with the narrative (section *The narrative*), then the structured anchors below.

```
wf intake rca complete: <slug>
Symptom: <one-line>
Root cause: <one-line, citing file:line>
Confidence: <root-cause-confidence> root cause / <fix-shape-confidence> fix shape
Blast radius: <low|medium|high|skipped>
Tripwires: <none | comma-separated list>
Recommended next: <route> — <one-sentence justification>
Record it: /wf intake rca <slug> <route>   (then run the invocation it prints)
Alternates: <comma-separated list of other viable routes>
RCA artifact: .ai/workflows/<slug>/01-rca.md
```

If the recommendation is `human-triage`, replace the `Recommended next:` line with:

> ⚠ Human triage required — confidence is low and blast radius is high, and the escalation ladder (probe / study-sources) did not raise confidence. Read `01-rca.md` and decide manually before routing to a fix workflow.

# Route — decision closure

Runs only from Step 0 route mode (`/wf intake rca <slug> <plan|fix|hotfix|human-triage> [one-line reason]`). Follow "Closure" of [_light-index.md](_light-index.md) with the `rca` row. Step 3 of that section applies to the `fix` and `hotfix` routes only: their successor is a NEW workflow, so this one closes, and its registry row becomes `closed`. The other two routes keep the workflow open:

- **`plan`**: the SAME slug continues into the standard chain. Run `record set "<root>" <slug> index next-command=wf-plan "next-invocation=/wf plan <slug>"`. When design is needed and not settled per `design/_lane.md`, set `next-command: wf-design` and `next-invocation: "/wf design <slug>"` instead.
- **`human-triage`**: the workflow waits for the human. Run `record set "<root>" <slug> index next-command=user-picks "next-invocation=user-picks — human triage; see 01-rca.md ## Confidence"`.

Step 4 prints the invocation of the `## Recommended next command` table: `/wf plan <slug>`, `/wf intake fix "<suggested fix, one line>" from <slug>`, or `/wf intake hotfix "<symptom, one line>" from <slug>`.

# Routing notes (read carefully)

- **`/wf plan <slug>` is the cleanest downstream path**: it reads the synthesized `02-shape.md` and the workflow directory without any modification, and the Step 5 index carries the `stack:` block plan requires. Use it as the default unless the diagnosis clearly fits hotfix or fix.
- **`fix` and `hotfix` routes start fresh workflows** that inherit this diagnosis via `_intake-provenance.md`: the printed `… from <slug>` invocation carries the root cause, blast radius, and `## Verification` (which becomes the successor's acceptance criteria). Never print a bare `intake fix <slug>` form: a slug in that position parses as a description and dead-ends in the collision warning.

# What this command is NOT

- **Not a fixer.** RCA edits no application code, runs no mutating command, and does not commit, push or open a PR.
