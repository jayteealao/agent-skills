---
description: Root-cause analysis workflow. Investigates a reported issue using parallel diagnosis sub-agents, writes a structured RCA artifact with confidence, blast radius, and suggested fix shape, then recommends the right downstream command (/wf plan for non-trivial work, /wf intake fix for small fixes, /wf intake hotfix for active incidents). Does NOT write a fix. Synthesizes a minimal 02-shape.md so /wf plan can consume the workflow directory without modification.
argument-hint: <description-or-slug>
---

# Output boundary & shared context
Load `${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/intake/_intake-context.md` in full and apply it — the External Output Boundary, the narrative-fragment tier, and the workflow-registry / slug rules. Do not restate them here.

You are running `/wf intake rca`, a **root-cause analysis workflow** that investigates an issue and recommends the right downstream command, without writing a fix.

# Slug-mode (read before proceeding)

If the dispatcher selected **slug-mode** (the first token after `intake` matched a non-closed slug in `.ai/workflows/INDEX.md`), follow `${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/_compressed-slice.md` — it OVERRIDES the standalone instructions below. In short: write one `.ai/workflows/<slug>/03-slice-rca-<descriptor>.md` (`type: slice`, `slice-type: rca`, `compressed: true`, `origin: intake/rca`); no new workflow, no new branch, no standalone artifact, no new top-level `00-index.md`; additive index updates only; chat return `rca → compressed slice <slice-slug> on <slug>`.

If slug-mode was not selected, ignore this section and proceed standalone below.

# Pipeline
`1·symptom` → `2·investigate` → `3·synthesize` → `/wf plan` | `/wf intake fix` | `/wf intake hotfix`

| | Detail |
|---|---|
| Requires | Nothing — starts fresh. Pass an error description, stack trace, or an existing slug to resume. |
| Produces | `01-rca.md` (full RCA), `02-shape.md` (synthesized minimal shape so /wf plan works), `00-index.md` |
| Skips | No fix, no plan, no shape interview. The RCA *is* the shape. |
| Next | `/wf plan <slug>` (default — non-trivial fixes), `/wf intake fix <slug>` (small fixes), `/wf intake hotfix <slug>` (active production incidents). The artifact recommends one based on the diagnosis. |
| Escalate | If root cause is genuinely uncertain (confidence: low) AND blast radius is high → surface `human triage required` and stop without recommending a routing path. |

> **Auto second opinion (diagnosis).** Once the root-cause hypothesis is written
> (before the terminus recommendation), **auto-invoke** `/consult codex <is this
> root-cause sound? what else could explain the symptom?>` (pin `codex`/`claude`)
> unless the cause is already proven — a read-only panel whose repo-aware oracles
> check the hypothesis against the real code before you commit to a fix.

# CRITICAL — investigation discipline
You are a **diagnostician**, not a fixer.
- The **only** acceptable output is the RCA artifact, the synthesized shape, and the index. Do NOT edit application code. Do NOT propose a patch. Do NOT run code that would mutate state (DB writes, deployments, git commits).
- Read-only investigation only: `git log`, `git blame`, `Read`, `Grep`, log file inspection, dev-tooling inspection, and tests run in read-only modes.
- The "Suggested fix shape" section is **direction, not a plan** — 1 to 3 lines naming the area and approach. Do not enumerate steps.
- Ask at most **3 questions** in chat. No `AskUserQuestion`, no separate `po-answers.md` — answers go inline into the artifact.
- Follow the steps below exactly in order. Do not skip, reorder, or combine steps.

# Step 0 — Orient (MANDATORY)
1. **Resolve slug and mode** from `$ARGUMENTS`:
   - If the argument matches an existing `.ai/workflows/*/00-index.md` with `workflow-type: rca` → **resume mode**. Read that index. If `01-rca.md` is complete, the user likely meant to run the recommended next command — tell them and stop. If incomplete, pick up from the missing section.
   - Otherwise → **new RCA**. Derive a slug: `rca-<short-symptom>` (kebab-case, max 5 words, e.g., `rca-checkout-double-charge`). This is an ordinary `.ai/workflows/<slug>/` directory — there is no synthetic `__rca__` slug. The renderer discovers it via the standard workflow walk and projects `01-rca.md` through the `01-rca` → rca route, so no special-casing is needed in the view layer.
2. **Collision check:** If `.ai/workflows/<slug>/00-index.md` already exists and `workflow-type` is NOT `rca` → WARN: "Workflow `<slug>` already exists with type `<existing-type>`. Choose a different description, or run `/wf recap <slug>` to continue the existing workflow." Stop.
3. **Branch posture (do NOT switch branches):**
   - Investigation is read-only — do not create or switch branches.
   - Record the current branch in the index as `branch` and `base-branch` so the eventual fix workflow knows where the diagnosis was performed.
4. **Read project context (lightweight):**
   - Read `README.md` (top 100 lines) for project shape.
   - Skim `.ai/workflows/*/00-index.md` (filenames only) to spot any related active workflows the symptom might be tied to.

# Step 1 — Symptom intake
Ask at most **3 questions** — stop as soon as you have enough to investigate:

1. **What is broken?** — Symptom: what is failing, where (URL, endpoint, page, component, service, log line), and for whom (all users, specific cohort, environment, account).
2. **What is the impact?** — Critical (outage, data risk), high (degraded), medium (annoyance), or low (cosmetic). How many users? Is data at risk?
3. **What changed recently?** — Deployments, migrations, config changes, dependency bumps in the last 24-72 hours that might be the cause.

If the user provided a stack trace or error message in `$ARGUMENTS`, treat it as partial answers — only ask remaining questions.

Do NOT write the artifact yet. Hold the answers in working memory and proceed to Step 2.

# Step 2 — Parallel root-cause investigation
Launch parallel sub-agents to identify the root cause. Do not proceed to synthesis until all complete.

**Model for every dispatched agent:** `sonnet`. REQUIRED on every `Task` call. Root-cause analysis is the defining judgment-heavy task: Code path investigation must reason about incorrect assumptions and race conditions, Recent change correlation must causally link diffs to symptoms, Blast radius must reason about coupling. Haiku underserves causal reasoning under uncertainty. Sonnet 4.6 is the right tier.

### Explore sub-agent 1 — Code path investigation

Prompt with ALL of the following:
- Identify the code path most likely to contain the bug from the symptom description and any error/stack trace.
- Read the implicated files in full. Look for: incorrect assumptions, missing null/undefined handling, race conditions, off-by-one errors, incorrect state transitions, mismatched contract between caller and callee.
- Check tests covering the implicated path. If tests exist, identify why they did not catch this. If tests do not exist, note the gap.
- Run `git log --oneline -20` on the implicated files; cross-reference with "recent changes" from the symptom intake.

Return as structured text:
- `implicated_files`: list of paths
- `most_likely_mechanism`: one paragraph naming the root cause mechanism
- `evidence`: 2-5 bullets citing file:line locations
- `confidence`: high | medium | low (with one-line justification)
- `test_coverage_gap`: description or "none"

### Explore sub-agent 2 — Recent change correlation

Prompt with ALL of the following:
- Run `git log --since="7 days ago" --oneline` and identify commits in or near the implicated path.
- For each candidate commit, read the diff and check whether it could plausibly cause the symptom.
- Check open PRs touching the implicated path: `gh pr list --search "path:<implicated-dir>"`.
- Check recent deployments, migrations, or feature flags if discoverable from the repo.

Return as structured text:
- `suspect_commits`: list of `<sha> <short-message>` with one-line "could it cause this?" assessment
- `concurrent_work`: list of open PRs touching the same area
- `external_changes`: any deploys/migrations/flag flips noted (or "none discovered")

### Explore sub-agent 3 — Blast radius

Prompt with ALL of the following:
- Given the implicated mechanism, identify what else might be silently affected: callers of the broken function, sibling code paths sharing the same flawed assumption, data already corrupted by past invocations, downstream systems consuming the bad output.
- Search the codebase for the same pattern that caused the bug, in case it exists in multiple places.

Return as structured text:
- `affected_callers`: list of `path:symbol` that may be affected
- `same_pattern_elsewhere`: list of paths where the buggy pattern repeats (or "none found")
- `data_at_risk`: description of any persisted state that may be corrupt (or "none")
- `radius`: low | medium | high (with one-line justification)

If the symptom is clearly local (a single component, a single endpoint, no shared utilities), Sub-agent 3 may be skipped — but state in the RCA artifact that it was skipped and why.

# Step 3 — Synthesize and write `01-rca.md`

Merge findings from the sub-agents. **Do not invent root causes the agents did not surface.** If the agents disagree or returned low confidence, the RCA records that — uncertainty is data.

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
recommended-next: </wf plan|/wf intake fix|/wf intake hotfix|human-triage>
status: ready-for-fix-routing
created-at: <run `date -u +"%Y-%m-%dT%H:%M:%SZ"` to get the real timestamp>
---
```

**Body sections (in order):**

## The RCA
<!-- STORY SECTION — first, and self-sufficient. A reader who reads only this section understands what was produced, the load-bearing decisions and counts, and the top risk; the structured sections below are drill-down, not a substitute. Write it in the voice defined in `../_narrative-voice.md` (Sebastian Raschka register: relevance first, why before how, tradeoffs stated plainly, varied rhythm — NO "This RCA implements…" openings). 1–4 short paragraphs. -->

## 1. Symptom

The user-reported issue, verbatim where possible. ≤3 sentences. Cite the original error message or stack trace if provided.

## 2. Scope

- **Who is affected:** all users / cohort / specific account / specific environment.
- **When it started:** first known occurrence (commit, deploy, time window) or "unknown".
- **Reproduction:** specific steps if reliably reproducible, or "intermittent — see Step 4 evidence".

## 3. Investigation summary

A short bulleted list of what was checked. ≤6 bullets. Mention what each sub-agent inspected and what was ruled out as well as what was confirmed. Ruling things *out* is data — record it.

## 4. Root cause

The actual cause, written as a mechanism: "X happens because Y, which causes Z." Cite specific `file:line` locations. ≤5 sentences. If multiple plausible causes survive investigation, list them in priority order with the evidence supporting each.

## 5. Contributing factors

Secondary issues that made the bug worse, harder to detect, or harder to recover from. Examples: missing test coverage, no observability on the affected code path, retry logic that masked early failure, error handling that swallowed the original exception. ≤4 bullets.

## 6. Blast radius

- **Currently visible:** what is broken right now.
- **Possibly affected (silent):** other code paths or persisted data that may be corrupt or behaving unexpectedly because of this same root cause.
- **Same pattern elsewhere:** other locations in the codebase where the same flawed pattern exists and should be checked or fixed alongside this work.

If sub-agent 3 was skipped, write: "Blast radius investigation skipped — symptom is local to <component>. If the fix turns out to require changes outside <component>, run `/wf intake rca` again or escalate to `/wf intake`."

## 7. Suggested fix shape

**Direction, not a plan.** 1 to 3 lines naming the area and the approach. Do NOT enumerate implementation steps — that belongs in `/wf plan` or `/wf intake fix`. Examples of the right shape:

> "Fix the off-by-one in `cart/total.ts:checkout()` — apply discount before tax, not after. One-line change. Add a regression test in `cart.test.ts`."

> "Add idempotency keys to the checkout webhook handler. New middleware in `webhooks/checkout/`. Deduplicate by `(provider_event_id, order_id)`. Migration to add an index. Estimate 3-5 files."

## 8. Verification

How will we know the fix worked? List:
- **Test:** specific assertion or test command that should pass post-fix.
- **Manual:** specific URL, flow, or visual check.
- **Log signal:** specific log line, metric, or absence-of-error that confirms the bug is gone.

This section becomes the acceptance criteria for the downstream fix workflow.

## 9. Confidence

- **Root cause confidence:** high | medium | low. One sentence justifying.
- **Fix shape confidence:** high | medium | low. One sentence justifying.

If either is `low`, this section MUST also recommend whether to fix anyway (with monitoring) or to escalate to human triage / further investigation.

## 10. Recommended next command

Pick **one** primary recommendation based on the diagnosis. Routing logic:

| Conditions | Recommendation |
|---|---|
| `impact: critical` AND production-affecting AND root-cause-confidence ≥ medium AND blast-radius ≤ medium AND suggested-fix-shape is small | `/wf intake hotfix <slug>` |
| Suggested fix shape touches ≤3 files, ≤5 steps, no new dependency, no architecture change | `/wf intake fix <slug>` |
| Anything else — including any architectural change, new dependency, cross-cutting work, or blast radius is `high` | `/wf plan <slug>` |
| `root-cause-confidence: low` AND `blast-radius: high` | **`human-triage`** — recommend escalation, do not auto-route |

State the recommendation clearly with one sentence of justification. Then list the alternatives in priority order. The user makes the final call.

## 11. Tripwire warnings (only if any fired)

Tripwires are **warn-and-continue** — record them, do NOT refuse to write the RCA. Tripwires:

- **Confidence breach:** root-cause-confidence is `low`.
- **Blast radius breach:** blast-radius is `high` (regardless of confidence).
- **Multiple plausible root causes:** Section 4 listed >1 cause and the sub-agents could not narrow further.
- **Concurrent work conflict:** Sub-agent 2 found an open PR touching the implicated path — fixing this may collide with that work.
- **Same-pattern elsewhere:** the buggy pattern repeats in other locations and the fix scope expands beyond the originally implicated code.

For each fired tripwire, write one line: `[tripwire-name]: <what specifically tripped it>`. Then add a single closing line:

> One or more wf-rca tripwires fired. The RCA is still valid, but the downstream fix workflow should account for the recorded warnings before proceeding.

# Step 4 — Synthesize `02-shape.md`

Write a minimal `02-shape.md` so `/wf plan <slug>` can consume the workflow directory without modification. This file is intentionally short — it is a *forwarding contract*, not a duplicate of the RCA.

**`02-shape.md` frontmatter:**
```yaml
---
schema: sdlc/v1
type: shape
slug: <slug>
workflow-type: rca
status: ready
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

**Body:**

```markdown
# Shape (synthesized from RCA)

This shape was generated by `/wf intake rca` from the diagnosis in `01-rca.md`. The full investigation context, evidence, and fix-shape rationale lives there — read it before planning.

## Problem

<copy Section 1 (Symptom) and Section 4 (Root cause) summary from 01-rca.md>

## Scope (in)

<copy Section 7 (Suggested fix shape) from 01-rca.md, plus the implicated files from Section 4>

## Scope (out)

- Anything not directly required to remediate the root cause identified in `01-rca.md`.
- Refactoring, cleanup, or unrelated improvements in the implicated files. If those are needed, file separately.
- Same-pattern-elsewhere fixes (Section 6 of `01-rca.md`) — these are noted but require their own scoping decision before being added here.

## Acceptance criteria

<copy Section 8 (Verification) from 01-rca.md as bulleted criteria>

## Open questions

<list any items from Section 9 (Confidence) that the user still needs to decide; or "none">
```

If the recommended next command is `/wf intake fix` or `/wf intake hotfix`, still write `02-shape.md` — those commands ignore it, but it preserves the option for the user to switch routing to `/wf plan` later without losing the synthesis.

# Step 5 — Write `00-index.md`

Standard index file:

```yaml
---
schema: sdlc/v1
type: workflow-index
slug: <slug>
workflow-type: rca
current-stage: fix-routing
status: ready
selected-slice: <slug>
branch-strategy: none
branch: <current-branch-recorded-at-step-0>
base-branch: <current-branch-recorded-at-step-0>
next-command: <recommended next command from Section 10>
next-invocation: <recommended next command with slug>
recommended-routes:
  primary: <command>
  alternates: [<command>, <command>]
open-questions: []
progress:
  - rca: complete
  - shape-synthesized: complete
created-at: <timestamp>
---
```

Body: one-line description + a short pointer to `01-rca.md` and the routing recommendation.

# Step 6 — Hand off to user

Lead with a short **narrative** paragraph (prose, no bullets) telling the story — what was found, built, or measured, and what it means for the user — then the structured anchors below.

Emit a compact chat summary:

```
wf intake rca complete: <slug>
Symptom: <one-line>
Root cause: <one-line, citing file:line>
Confidence: <root-cause-confidence> root cause / <fix-shape-confidence> fix shape
Blast radius: <low|medium|high|skipped>
Tripwires: <none | comma-separated list>
Recommended next: <command> — <one-sentence justification>
Alternates: <comma-separated list of other viable next commands>
RCA artifact: .ai/workflows/<slug>/01-rca.md
```

If the recommendation is `human-triage`, replace the `Recommended next:` line with:

> ⚠ Human triage required — confidence is low and blast radius is high. Read `01-rca.md` and decide manually before routing to a fix workflow.

# Routing notes (read carefully)

- **`/wf plan <slug>` is the cleanest downstream path** — it reads the synthesized `02-shape.md` and the workflow directory without any modification. Use this as the default unless the diagnosis clearly fits hotfix or quick.
- **`/wf intake fix <slug>` and `/wf intake hotfix <slug>`** are designed to start fresh workflows. They will detect the existing `00-index.md` and warn about a collision. To use them after `/wf intake rca`, the user can either: (a) accept the collision warning and proceed manually, copying the relevant context from `01-rca.md` into the fresh workflow's brief; or (b) run `/wf plan <slug>` instead, which preserves continuity and is usually fine even for small fixes. The recommendation surfaces the cleanest option for the diagnosis.
- **Future enhancement:** `/wf intake fix` and `/wf intake hotfix` may add an "inherit from RCA" mode that consumes an existing `01-rca.md`. Until then, `/wf plan` is the seamless path.

# What this command is NOT

- **Not a fixer** — `/wf intake rca` produces an RCA artifact and a routing recommendation. It does not edit application code. It does not run mutating commands. It does not commit, push, or open a PR.
- **Not a hotfix** — `/wf intake hotfix` is what you run *after* `/wf intake rca` recommends it. `/wf intake rca` decides whether the situation warrants the hotfix path.
- **Not a how/explain** — `wf-how` is for explaining existing code or artifacts on demand. `/wf intake rca` is for *finding* a cause that is not yet explained.

---

## Step — Write the rich `.yaml` + fragment (MANDATORY — do not skip)

The sunflower view renders the RCA page from a sibling `.yaml` + `.html.fragment`
written next to the RCA `.md`. **Without the `.yaml` the page silently degrades to
plain prose** — the incident timeline, the causal chain, the severity heatmap, and
the metric row never appear (`rca.mjs` returns `renderSimple` when the sibling YAML
is absent). The `post-write-verify` hook reminds you if you forget; author them here,
now, while the incident is still in context.

For the RCA `.md` you just wrote (`01-rca.md`, or `augmentations/<rca-id>.md` for an
RCA augmentation):

1. Write the sibling **`<stem>.yaml`** — the structured data: `incident:`, `title:`,
   `started_at:`, `resolved_at:`, `metrics:` (duration, time_to_detect,
   time_to_mitigate, user_failures, revenue_impact), `timeline:` (at, kind, title,
   who), `chain:` (causal steps, root last), `heatmap:` (buckets, systems[name][bucket]).
   Schema: `siblingYamlSchemas.rca` in `tests/frontmatter.schema.json`.
2. Write the sibling **`<stem>.html.fragment`** — the body-only interactive layer.

The fragment is one `<section class="fragment-rca" data-artifact="rca"
data-incident="<INC-id>">` that reproduces the gallery's RCA fragment 1:1:

- **5-metric row** — duration / time-to-detect / time-to-mitigate /
  user-failures / revenue impact.
- **Horizontal SVG timeline** — circles per event (alert / escalation /
  deploy / mitigation / resolution), each wrapped in `<a href="#evt-N">`
  so the right-side `<aside class="rca-detail-panel">` swaps on `:target`.
- **Causal-chain SVG** — 4 boxes + arrows; the root-cause box uses the
  `--blocker` colour.
- **Severity heatmap grid** — rows = systems, columns = 30-min buckets,
  cells tinted `s0`–`s3` from the YAML's `heatmap.systems[name][bucket]`.
- Contributing-causes and mitigations-applied as `.callout-warn` /
  `.callout-info` blocks.

Authoring rules (verifier Check 7 enforces):

- Inline `<style>` scoped under `.fragment-rca` / `.rca-*`.
- Inline `<script>` scoped via `document.currentScript.closest('.fragment-rca')`.
  CSS-only `:target` navigation drives the detail panel; JS only enhances
  hover/focus and Esc-to-reset.
- Dispatch `window.dispatchEvent(new CustomEvent('sdlc:fragment-ready',
  { detail: { name: 'rca', artifact: 'rca', incident: '<INC-id>',
    counts: { events: <n>, causes: <n>, mitigations: <n> } } }))`.
- Inline SVG only. Data deterministic from the sibling `.yaml`.

Full contract:
[`reference/fragment-author-contract.md`](../../../reference/fragment-author-contract.md).
Gallery reference (bundled): [`reference/fragments-gallery.html`](../../../reference/fragments-gallery.html).

### Use `@include` for shared chrome (v9.20.1+)

The fragment is **body-only** (see `_fragment-authoring.md` → "Scope"): `rca.mjs`
already emits the heading and the metric-row, and draws the timeline + causal-chain
figures (suppressing its static copies when the fragment is present). Do **not**
repeat the metric-row in the fragment — start at the interactive timeline:

```html
<section class="fragment-rca" data-artifact="rca" data-incident="INC-2026-0512">
  <!-- page owns the heading + metric-row (body-only) — fragment starts at the timeline -->

  <svg class="rca-timeline"> …incident timeline (anchors → :target panels)… </svg>
  <aside class="rca-detail-panel"> …per-event detail blocks… </aside>
  <svg class="rca-chain"> …4-box causal chain… </svg>
  <table class="rca-heatmap"> …systems × buckets, s0–s3 tinted cells… </table>

  <!-- @include callout { "kind": "warn", "title": "Load-test gate not enforced", "body": "…" } -->
  <!-- @include callout { "kind": "info", "title": "Mitigation: memoise Stripe", "body": "…" } -->

  <!-- @include fragment-ready { "name": "rca", "artifact": "rca",
       "detailJson": "{\"incident\":\"INC-2026-0512\",\"counts\":{\"events\":5,\"causes\":3,\"mitigations\":2}}" } -->
</section>
```

Snippet catalogue: `metric-row`, `callout`, `verdict`, `severity-chip`,
`fragment-ready`, `files-touched-row`, `diff-block`.

### Sibling YAML — `five_whys[]` block (v9.21.0+, Phase 2)

When the RCA artifact reaches a definite root cause through a sequential
ladder of questions (the classic 5-whys technique), record the chain in the
sibling `<rca-id>.yaml` under a top-level `five_whys:` key. The view-layer
renderer expands this into a collapsible drill panel below the causal-chain
figure. Without this block the panel is omitted — the rest of the RCA still
renders normally.

When to emit:
- Root cause confidence is `high` or `medium` AND the diagnosis actually
  laddered through ≥3 questions.
- Skip when the root cause was named directly from a stack trace with no
  intermediate reasoning steps (the 5-whys structure would be artificial).

Shape (between 1 and 7 steps; mark the final step as `root: true`):

```yaml
# excerpt from <rca-id>.yaml — riding alongside the existing artifact: rca block
five_whys:
  - question: "Why did checkout return 500 for 12k users?"
    answer:   "Stripe webhook handler timed out at p99."
  - question: "Why did the webhook handler time out?"
    answer:   "Each event re-fetched the full customer record."
  - question: "Why did each event re-fetch?"
    answer:   "The memoisation key included a request-scoped trace id."
  - question: "Why was the trace id in the key?"
    answer:   "Copy-pasted from a per-request cache. Nobody noticed in review."
    root: true
```

Authoring rules:
- Each `answer` is one sentence — long enough to be a causal claim, short
  enough to read in the collapsed-detail panel without scrolling.
- Set `root: true` on exactly one step (the final one). If multiple plausible
  roots survived investigation, pick the strongest and note the alternatives
  in Section 4 of `01-rca.md` instead.
- The chain must end where Section 4 ("Root cause") points; if they
  disagree, fix Section 4 first.

## Step — Write free narrative fragments

Author free narrative fragments for this artifact as described in the narrative-fragment tier of `_intake-context.md` — `<stem>.<NN-label>.html.fragment` siblings of unrestricted raw HTML, as many as the story needs, ordered with an `NN-` prefix, rendered raw-inline below the page.
