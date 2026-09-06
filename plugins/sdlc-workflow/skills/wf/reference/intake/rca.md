---
description: Root-cause analysis workflow. Investigates a reported issue using parallel diagnosis sub-agents, writes a structured RCA artifact with confidence, blast radius, and suggested fix shape, then recommends the right downstream command (/wf plan for non-trivial work, /wf intake fix for small fixes, /wf intake hotfix for active incidents). Does NOT write a fix. Synthesizes a minimal 02-shape.md so /wf plan can consume the workflow directory without modification.
argument-hint: <description-or-slug>
---

# Output boundary & shared context
Load `_intake-context.md` in full and apply it: the External Output Boundary, the narrative-fragment tier, and the workflow-registry / slug rules. Do not restate them here.

You are running `/wf intake rca`, a **root-cause analysis workflow** that investigates an issue and recommends the right downstream command, without writing a fix.

# Slug-mode (read before proceeding)

If the dispatcher selected **slug-mode** (the first token after `intake` matched a non-closed slug in `.ai/workflows/INDEX.md`), follow `../_compressed-slice.md`; it OVERRIDES the standalone instructions below. In short: write one `.ai/workflows/<slug>/03-slice-rca-<descriptor>.md` (`type: slice`, `slice-type: rca`, `compressed: true`, `origin: intake/rca`); no new workflow, no new branch, no standalone artifact, no new top-level `00-index.md`; additive index updates only; chat return `rca → compressed slice <slice-slug> on <slug>`.

If slug-mode was not selected, ignore this section and proceed standalone below.

# Pipeline
`1·symptom` → `2·investigate` → `3·synthesize` → `/wf plan` | `/wf intake fix` | `/wf intake hotfix`

| | Detail |
|---|---|
| Requires | Nothing; starts fresh. Pass an error description, stack trace, or an existing slug to resume; pass `<slug> <route>` to record the route and close. |
| Produces | `01-rca.md` (full RCA), `02-shape.md` (synthesized minimal shape so /wf plan works), `00-index.md`. Body templates: [intake/rca/_artifact.md](rca/_artifact.md). |
| Skips | No fix, no plan, no shape interview. The RCA *is* the shape. |
| Next | `/wf plan <slug>` (default: non-trivial fixes, same slug continues), `/wf intake fix "<suggested fix, one line>" from <slug>` (small fixes), `/wf intake hotfix "<symptom, one line>" from <slug>` (active production incidents). The artifact recommends one based on the diagnosis; recording the route (`# Route — decision closure`) is the terminus. |
| Escalate | If root cause is genuinely uncertain (confidence: low), climb the ladder before surrendering to triage: `/wf probe <slug> "<the runtime question the diagnosis hinges on>"` for a runtime fact, the `study-sources` skill for a dependency fact, `/consult` for a second model on the hypothesis. Human triage is the LAST rung, reached when low confidence survives those. |

> **Auto second opinion (diagnosis).** Once the root-cause hypothesis is written (before the terminus recommendation), **auto-invoke** `/consult codex <is this root-cause sound? what else could explain the symptom?>` (pin `codex`/`claude`) unless the cause is already proven: a read-only panel whose repo-aware oracles check the hypothesis against the real code before you commit to a fix.

> **Read the real source (diagnosis).** When the symptom trail leads *out of the repo* (a stack frame inside `node_modules`/`site-packages`/a cached JAR, an error string absent from the tree, version-specific behavior), invoke the `study-sources` skill to read that dependency's **actual installed source** before settling on a hypothesis. A root cause grounded in the real implementation beats one grounded in recalled API behavior, which is exactly where plausible-but-wrong RCAs come from. Reads land in gitignored `.scratch/`; no repo mutation, no fix.

# Investigation discipline
You are a **diagnostician**, not a fixer.
- The **only** acceptable output is the RCA artifact, the synthesized shape, and the index. Do not edit application code. Do not propose a patch. Do not run code that would mutate state (DB writes, deployments, git commits).
- Read-only investigation only: `git log`, `git blame`, your native file-reading and search tools, log file inspection, dev-tooling inspection, and tests run in read-only modes.
- The "Suggested fix shape" section is **direction, not a plan**: 1 to 3 lines naming the area and approach. Do not enumerate steps.
- Ask at most **3 questions** in chat. No structured gate question, no separate `po-answers.md`; answers go inline into the artifact.
- Respect the stated order only where a step consumes an earlier step's output or crosses a gate; reading and research may interleave freely.

# Step 0 — Orient
1. **Resolve slug and mode** from `$ARGUMENTS`:
   - If the first token matches an existing `.ai/workflows/*/00-index.md` with `workflow-type: rca`, the workflow exists. Split on three sub-cases:
     - **A token after the slug matches a route** (`plan`, `fix`, `hotfix`, `human-triage`) → **route mode**. Jump to `# Route — decision closure` below; any trailing prose is the decision note. If the index is already `status: closed`, WARN: "Workflow `<slug>` is closed (chosen-route: `<value>`)." and stop.
     - **`01-rca.md` is complete and no route token is present** → tell the user the diagnosis is ready and how to record the route (`/wf intake rca <slug> <plan|fix|hotfix|human-triage> [one-line reason]`) and stop.
     - **`01-rca.md` is incomplete** → **resume mode**: pick up from the missing section.
   - Otherwise → **new RCA**. Derive a slug: `rca-<short-symptom>` (kebab-case, max 5 words, for example `rca-checkout-double-charge`). This is an ordinary `.ai/workflows/<slug>/` directory; there is no synthetic `__rca__` slug. The renderer discovers it via the standard workflow walk and projects `01-rca.md` through the `01-rca` → rca route.
   - **Inbound provenance:** apply `_intake-provenance.md` on an explicit `from <source-slug>` token. A `discover` verdict routed here carries ranked counter-hypotheses that are literally candidate root causes; seed Step 2's sub-agent prompts with them and record `origin-discover` on the index.
2. **Collision check:** If `.ai/workflows/<slug>/00-index.md` already exists and `workflow-type` is NOT `rca`, WARN: "Workflow `<slug>` already exists with type `<existing-type>`. Choose a different description, or run `/wf recap <slug>` to continue the existing workflow." Stop.
3. **Branch posture (do not switch branches):** investigation is read-only; create no branch and switch no branch. Record the current branch in the index as `branch` and `base-branch` so the eventual fix workflow knows where the diagnosis was performed.
4. **Read project context (lightweight):** `README.md` (top 100 lines) for project shape; `AGENTS.md` if present for conventions; `.ai/workflows/*/00-index.md` filenames to spot related active workflows the symptom might be tied to.

# Step 1 — Symptom intake
Ask at most **3 questions**; stop as soon as you have enough to investigate:

1. **What is broken?** Symptom: what is failing, where (URL, endpoint, page, component, service, log line), and for whom (all users, specific cohort, environment, account).
2. **What is the impact?** Critical (outage, data risk), high (degraded), medium (annoyance), or low (cosmetic). How many users? Is data at risk?
3. **What changed recently?** Deployments, migrations, config changes, dependency bumps in the last 24-72 hours that might be the cause.

If the user provided a stack trace or error message in `$ARGUMENTS`, treat it as partial answers; only ask remaining questions. Do not write the artifact yet. Hold the answers in working memory and proceed to Step 2.

# Step 2 — Parallel root-cause investigation
Launch parallel read-only sub-agents to identify the root cause. Do not proceed to synthesis until all complete. The three charters (code path investigation, recent change correlation, blast radius), the effort tier, the return shapes, and the local-symptom skip rule are in [intake/rca/_research.md](rca/_research.md).

# Step 3 — Synthesize and write `01-rca.md`

Write the body per the section templates in [intake/rca/_artifact.md](rca/_artifact.md): the RCA story, Sections 1–11 (symptom through tripwires), including the Section 10 routing table that names the exact invocation for each route.

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
---
```

# Step 4 — Synthesize `02-shape.md`

Write a minimal `02-shape.md` so `/wf plan <slug>` can consume the workflow directory without modification. The body template is in [intake/rca/_artifact.md](rca/_artifact.md).

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
next-command: wf-plan
next-invocation: "/wf plan <slug>"
---
```

If the recommended next command is `/wf intake fix` or `/wf intake hotfix`, still write `02-shape.md`. Those commands ignore it, but it preserves the option to switch routing to `/wf plan` later without losing the synthesis.

# Step 5 — Write `00-index.md`

Standard index file:

```yaml
---
schema: sdlc/v1
type: workflow-index
slug: <slug>
title: "RCA: <one-line symptom>"
workflow-type: rca
current-stage: fix-routing
status: ready
branch-strategy: none
branch: <current-branch-recorded-at-step-0>
base-branch: <current-branch-recorded-at-step-0>
next-command: <route from Section 10, e.g. wf-plan; user-picks until recorded>
next-invocation: "<the Section 10 invocation for that route>"
recommended-routes:
  primary: <route>
  alternates: [<route>, <route>]
stack:                      # cheap fingerprint per _change-mode-tail.md stack policy, user-confirmed: false —
  detected-at: "<iso-8601>" # the plan route STOPs on a MISSING stack block, so rca must write one
  platforms: []
  languages: []
  build: []
  testing: []
  user-confirmed: false
open-questions: []
progress:
  rca: complete
  shape-synthesized: complete
created-at: <timestamp>
updated-at: <timestamp>
---
```

Body: one-line description + a short pointer to `01-rca.md` and the routing recommendation. No `selected-slice`: an rca has no slice roster, and a key naming a slice that never exists misleads every reader. `progress` is the stage→status **object** form; the renderer silently drops a YAML list.

## Step 5b — Write the rich `.yaml` + fragment (do not skip)

Author the sibling `01-rca.yaml` (diagnosis set: `incident:`, `title:`, `chain:`, `timeline:`; the resolution set and `heatmap:` only for a post-incident RCA) and the body-only `01-rca.html.fragment` per [intake/rca/_view.md](rca/_view.md), which also holds the `@include` chrome rules and the optional `five_whys[]` block. Without the `.yaml` the page degrades to plain prose.

# Step 6 — Hand off to user

Return per [_chat-return.md](../_chat-return.md): narrative lead (what was found and what it means for the user), then the structured anchors below.

```
wf intake rca complete: <slug>
Symptom: <one-line>
Root cause: <one-line, citing file:line>
Confidence: <root-cause-confidence> root cause / <fix-shape-confidence> fix shape
Blast radius: <low|medium|high|skipped>
Tripwires: <none | comma-separated list>
Recommended next: <route> — <one-sentence justification>
Record it: /wf intake rca <slug> <route>   (then run the Section 10 invocation it prints)
Alternates: <comma-separated list of other viable routes>
RCA artifact: .ai/workflows/<slug>/01-rca.md
```

If the recommendation is `human-triage`, replace the `Recommended next:` line with:

> ⚠ Human triage required — confidence is low and blast radius is high, and the escalation ladder (probe / study-sources / consult) did not raise confidence. Read `01-rca.md` and decide manually before routing to a fix workflow.

# Route — decision closure

Runs only from Step 0 route mode (`/wf intake rca <slug> <plan|fix|hotfix|human-triage> [one-line reason]`). Recording the route is the workflow's decision record. It never starts the successor: it prints the invocation and stops.

1. **Stamp the artifact.** Add to `01-rca.md` frontmatter: `chosen-route: <route>`; `routed-at:` set to the real UTC timestamp (per [_timestamp.md](../_timestamp.md)); and `decision-note: <the trailing prose>` if the user supplied any (omit the key otherwise).
2. **Append a `## Decision` section** to the artifact body: which route was picked; why (the user's exact reason, else "user routed without a stated reason"); which tripwires were live at route time (from Section 11, or "none").
3. **Close or continue, by route:**
   - **`fix` / `hotfix`**: the successor is a NEW workflow, so this one closes. Update `00-index.md` with `status: closed`, `close-reason: route-recorded`, `superseded-by: pending`, `closed-at: <timestamp>`, `next-command: none`, `next-invocation: "none — route recorded"`; update the registry row to `closed`. The successor's link-back (`_intake-provenance.md`) corrects `superseded-by: pending`.
   - **`plan`**: the SAME slug continues into the standard chain; the workflow stays open. Set `next-command: wf-plan`, `next-invocation: "/wf plan <slug>"`, refresh `updated-at`.
   - **`human-triage`**: the workflow stays open awaiting the human. Set `next-command: user-picks`, `next-invocation: "user-picks — human triage; see 01-rca.md §9-10"`.
4. **Print the next invocation** per the Section 10 table (`/wf plan <slug>`, or `/wf intake fix "<suggested fix, one line>" from <slug>`, or `/wf intake hotfix "<symptom, one line>" from <slug>`) and stop. Do not run it.

# Routing notes (read carefully)

- **`/wf plan <slug>` is the cleanest downstream path**: it reads the synthesized `02-shape.md` and the workflow directory without any modification, and the Step 5 index carries the `stack:` block plan requires. Use it as the default unless the diagnosis clearly fits hotfix or fix.
- **`fix` and `hotfix` routes start fresh workflows** that inherit this diagnosis via `_intake-provenance.md`: the printed `… from <slug>` invocation carries the root cause, blast radius, and Section 8 verification (which becomes the successor's acceptance criteria). Never print a bare `intake fix <slug>` form: a slug in that position parses as a description and dead-ends in the collision warning.

# What this command is NOT

- **Not a fixer**: `/wf intake rca` produces an RCA artifact and a routing recommendation. It does not edit application code, run mutating commands, commit, push, or open a PR.
- **Not a hotfix**: `/wf intake hotfix` is what you run *after* `/wf intake rca` recommends it. `/wf intake rca` decides whether the situation warrants the hotfix path.
- **Not an explainer**: `/wf recap <slug> <focus>` (or a plain research conversation outside `/wf`) explains existing code or artifacts on demand. `/wf intake rca` is for *finding* a cause that is not yet explained.

## Step — Write free narrative fragments

Author free narrative fragments for this artifact as described in the narrative-fragment tier of `_intake-context.md`: `<stem>.<NN-label>.html.fragment` siblings of unrestricted raw HTML, as many as the story needs, ordered with an `NN-` prefix, rendered raw-inline below the page.
