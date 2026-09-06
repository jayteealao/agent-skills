# Review stage — master ledger template and rich siblings (Steps 5, 5b, 5c of `_stage.md`)

Load this file from `_stage.md` Step 5. It holds the `07-review[-<slice-slug>].md` template (Step 5), the sweep-level sibling `.yaml` + fragment rules (Step 5b), and the per-dimension sibling rules (Step 5c).

## Step 5 — master ledger template

```yaml
---
schema: sdlc/v1
type: review
slug: <slug>
review-scope: <per-slice|slug-wide>
slice-slug: <slice-slug or "" if slug-wide>
status: complete
stage-number: 7
created-at: "<iso-8601>"        # first run's timestamp — PRESERVE across re-runs
updated-at: "<iso-8601>"        # this run's timestamp
verdict: <ship|ship-with-caveats|dont-ship>     # from OPEN findings with pre-existing: false only
commands-run: [correctness, security, ...]      # cumulative union of every dimension ever run
metric-commands-run: <N>
metric-findings-total: <N>       # OPEN findings (status open|deferred|could-not-fix)
metric-findings-raw: <N>         # raw findings collected this run, pre-dedup
metric-findings-blocker: <N>     # OPEN blockers with pre-existing: false. Handoff's blocker gate reads this field; pre-existing defects never count here.
metric-findings-pre-existing: <N> # OPEN findings with pre-existing: true (any severity) — the ## Pre-existing Debt bucket
metric-findings-high: <N>        # OPEN, pre-existing: false
metric-findings-med: <N>         # OPEN
metric-findings-low: <N>         # OPEN
metric-findings-nit: <N>         # OPEN
metric-findings-resolved: <N>    # findings cleared by a re-run (status resolved)
metric-findings-total-ever: <N>  # every finding ever recorded (open + closed) — ledger size
runs:                            # compact per-invocation audit trail (frontmatter only; append one entry per run)
  - at: "<iso-8601>"
    dimensions: [correctness, security, ...]    # commands run THIS invocation
    verdict: <ship|ship-with-caveats|dont-ship>  # verdict snapshot after this run
    fix-commit: "<SHA | null>"                   # review-time fix commit this run, if any
tags: []
refs:
  index: 00-index.md
  # Per-slice mode:
  slice-def: 03-slice-<slice-slug>.md
  implement: 05-implement-<slice-slug>.md
  verify: 06-verify-<slice-slug>.md
  sub-reviews: [07-review-<slice-slug>-correctness.md, 07-review-<slice-slug>-security.md, ...]
  # Slug-wide mode (replace the four per-slice keys above with these):
  shape: 02-shape.md
  slice-index: 03-slice.md
  implements: [05-implement-<slice-1>.md, 05-implement-<slice-2>.md, ...]
  verifies: [06-verify-<slice-1>.md, 06-verify-<slice-2>.md, ...]
  sub-reviews: [07-review-correctness.md, 07-review-security.md, ...]
next-command: <wf-handoff|wf-implement>
next-invocation: "<based on verdict>"
---
```

# Review

## The Review
<!-- STORY SECTION — first, and self-sufficient. must follow `../_story-arc.md`: three beats in order — the state this stage inherited, the load-bearing decisions with reasons and counts, then what this stage enables next plus the top open risk. Language must follow `../_ste-procedural.md` sections 1 and 3. No "This <stage> implements…" opening. 1–3 short paragraphs. -->

## Verdict

**{Ship / Ship with caveats / Don't Ship}**

{3-4 sentence rationale. Name the most critical finding. State whether any blockers exist.}

## Domain Coverage

| Domain | Command | Status |
|--------|---------|--------|
| {domain} | `{command}` | {Clean / Issues / Blockers} |

## All Findings

ALL findings ever recorded — open AND closed. Resolved / fixed / dismissed rows are kept for history; they sort last within their severity.

| ID | Sev | Conf | Status | Pre | Surfaced | Source | File:Line | Issue |
|----|-----|------|--------|-----|----------|--------|-----------|-------|

**Open:** BLOCKER: {X} | HIGH: {X} | MED: {X} | LOW: {X} | NIT: {X}   **Pre-existing:** {X}
**Closed:** resolved: {X} | fixed: {X} | dismissed: {X}   **Ledger size (ever):** {N}
*(This run: {A} net-new, {B} re-confirmed, {C} resolved; merged from {M} raw findings across {K} commands)*

## Findings (Detailed)

### {ID}: {Title} [{SEVERITY}]

**Location:** `{file}:{line-range}`
**Source:** {command(s) that flagged this}

**Evidence:**
```
{snippet}
```

**Issue:** {description}

**Fix:** {suggestion for HIGH+}

**Severity:** {level} | **Confidence:** {High/Med/Low} | **Pre-existing:** {true/false}
**Status:** {status} | **Surfaced:** {surfaced-at} | **Last seen:** {last-seen-at}  {— **Resolved:** {resolved-at} / **Fixed:** {fixed-at} when applicable}

## Pre-existing Debt

Findings whose defect exists on the base branch untouched by this diff (`pre-existing: true`, determined by diff test with `git blame` as tiebreaker). They do NOT count toward the verdict or blocker gate but are real debt — must not be silently dropped. Route each to `/wf intake fix <description>` (defects) or `/wf intake refactor <description>` (structural). Omit this section when no pre-existing findings exist.

| ID | Sev | Source | File:Line | Issue | Suggested routing |
|----|-----|--------|-----------|-------|-------------------|
| {ID} | {SEV} | {command} | {file}:{line} | {one-line issue} | `/wf intake fix\|refactor <desc>` |

## Triage Decisions

Accumulates across runs — decisions persist until re-triaged (Step 4b or `/wf review <slug> triage`). Update rows by ID; never drop a prior row.

| ID | Sev | Source | Decision | Notes |
|----|-----|--------|----------|-------|
| {ID} | {SEV} | {command} | {fix/defer/dismiss} | {user's reason or —} |

{All BLOCKER/HIGH/MED findings ever triaged. LOW/NIT listed as "untriaged".}

## Fix Status

Present once any finding has been through the fix loop. **Accumulating per-finding ledger** (one row per finding ever marked `Fix`), keyed by ID — update in place; never start a new per-run "round" table. Omit only when no finding has ever been fixed.

| ID | Sev | Source | Status | Fixed-at | Commit | Notes |
|----|-----|--------|--------|----------|--------|-------|
| {ID} | {SEV} | {command} | fixed / could-not-fix | {fixed-at} | {SHA or —} | {one-line summary} |

{List each `could-not-fix` finding under `## Recommendations → Must Fix (remaining)` with the
sub-agent's stated reason so the next stage knows what is still open.}

## Recommendations

### Must Fix (triaged "fix")
{List with finding IDs and estimated effort}

### Should Fix (MED triaged "fix")
{List}

### Deferred (triaged "defer")
{List — re-triage later via `/wf review <slug> triage`}

### Dismissed
{List with finding IDs and reason}

### Consider (LOW/NIT — not triaged)
{List}

## Recommended Next Stage
- **Option A:** `/wf handoff <slug>` — no OPEN blockers; all slices complete, ready for PR [reason]
- **Option B:** `/wf review <slug> [<slice>]` — OPEN blockers or `could-not-fix` findings remain; re-invoke to re-check the fixed code and merge fresh findings into the ledger (it resolve-sweeps what the fixes cleared) [reason, only if applicable]
- **Option C:** `/wf implement <slug> [<slice>] reviews` — escape hatch; remaining findings need stage-5 fix UI [reason, only if applicable]
- **Option D:** `/wf plan <slug> <next-slice>` or `/wf implement <slug> <next-slice>` — more slices to implement before handoff [reason, if applicable]
- **Option E:** `/wf ship <slug>` — skip handoff [reason, if applicable]
- **Option F:** `/wf intake <slug> from-review` — add new slices from findings (extension) [reason, if applicable]
- **Option G:** `/wf plan <slug> <slice> <correction>` — correct an *unbuilt* slice's plan directly (a built slice's correction is a new slice via Option F) [reason, if applicable]

---

## Step 5b — the sweep-level rich fragment (do not skip)

The sunflower view renders the review page from a sibling `.yaml` + `.html.fragment`. **Without them the page silently degrades to plain prose** — the Σ severity-heatmap, dimension chips, severity filter, and findings list never appear. Managed-artifact enforcement ([_host-invocation.md](../_host-invocation.md)) **BLOCKS the `.md` write when the sibling `.yaml` is missing** — author the `.yaml` first (or in the same turn) while findings are in context.

For each review `.md` written (`07-review.md` slug-wide, or `07-review-<slice-slug>.md` per-slice):

1. Write **`<stem>.yaml`** — structured data: `dimensions:` (severity × dimension heatmap matrix), `verdict:`, `findings:` (id, severity, dimension, file, line, message, evidence/diff, triage, **status**, **surfaced-at**), and metric counts. Schema: `siblingYamlSchemas.review` in `tests/frontmatter.schema.json`. **`findings:` and `counts:` = OPEN findings only** (open|deferred|could-not-fix) — resolved/fixed/dismissed history lives in the `.md` body. Bump `rev:` by 1 each run (first write = 1).
2. Write **`<stem>.html.fragment`** — one `<section class="fragment-review" data-artifact="review" data-rev="<n>">` carrying the **interactive layer**: Σ severity-heatmap, dimension chips + severity filter, findings list with per-finding evidence/diff/copy controls. **Body-only** (see `../_fragment-authoring.md` → "Scope"): `review.mjs` already renders the heading, verdict block, and metric-row — do **not** repeat them; start at the heatmap.

Authoring rules (verifier Check 7 enforces these):

- Inline `<style>` scoped under `.fragment-review` / `.fr-*`.
- Inline `<script>` scoped via `document.currentScript.closest('.fragment-review')`.
- Dispatch `window.dispatchEvent(new CustomEvent('sdlc:fragment-ready', { detail: { name: 'review', artifact: 'review', counts: { findings: <n>, blockers: <n> } } }))`.
- Inline SVG only; no remote anything.
- All data deterministic from `.yaml` — same YAML → byte-identical output.

Full contract in [`reference/fragment-author-contract.md`](../../../../reference/fragment-author-contract.md); gallery at [`reference/fragments-gallery.html`](../../../../reference/fragments-gallery.html).

---

## Step 5c — per-dimension rich fragments (do not skip)

Step 5b covers the sweep-level review page. Each **per-dimension** file — `07-review-<command>.md` (slug-wide) or `07-review-<slice-slug>-<command>.md` (per-slice) — renders through `review-dimension.mjs`. **Without a sibling `.yaml` it falls back to `renderSimple`** (plain prose, no interactive findings); managed-artifact enforcement ([_host-invocation.md](../_host-invocation.md)) BLOCKS a `type: review-command` `.md` written without it.

Per-dimension siblings are authored by the **Step-3 review sub-agent** (which holds the findings in context). This section is the shape spec that sub-agent follows. At Step 5b, confirm every per-dimension `.md` has its `.yaml` (or `fragment: none` for a clean dimension) and author any the sub-agent missed. For each per-dimension review `.md`:

1. Write **`<stem>.yaml`** — schema `siblingYamlSchemas.review-dimension` in `tests/frontmatter.schema.json`: `artifact: review-dimension`, `dimension`, `parent` (the sweep `07-review.md`), `rev`, `verdict` (`ship|caveats|no`), `summary`, `counts` (blocker/high/med/low/nit), `findings` (id, severity, file, line, confidence, action, msg, evidence, fix, **status**, **surfaced-at**) — scoped to this dimension only. `findings:` + `counts:` = OPEN findings only; bump `rev:` by 1 each run.
2. Write **`<stem>.html.fragment`** — one `<section class="fragment-review-dimension" data-artifact="review-dimension" data-rev="<n>">` carrying the **interactive layer**: severity-filter pill bar, sortable findings list (by severity / file:line), per-finding expandable evidence→fix rows. **Body-only**: `review-dimension.mjs` already renders the heading, verdict block, and metric-row, and suppresses its static findings list when a fragment is present (see `renderers/review-dimension.mjs` lines 64–67) — start at the filter bar, do not repeat the chrome.

Authoring rules (verifier Check 7 enforces these):

- Inline `<style>` scoped under `.fragment-review-dimension`. Use a **distinct prefix** (e.g. `.rd-*`) — both fragments can appear on one slug page.
- Inline `<script>` scoped via `document.currentScript.closest('.fragment-review-dimension')`.
- Dispatch `window.dispatchEvent(new CustomEvent('sdlc:fragment-ready', { detail: { name: 'review-dimension', artifact: 'review-dimension', dimension: '<dim>', counts: { findings: <n>, blockers: <n> } } }))`.
- Inline SVG only; no remote anything.
- All data deterministic from `.yaml` — same YAML → byte-identical output.

Load `../_fragment-authoring.md` first; full contract in [`reference/fragment-author-contract.md`](../../../../reference/fragment-author-contract.md).
