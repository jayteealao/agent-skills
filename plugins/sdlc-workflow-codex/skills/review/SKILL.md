---
name: review
description: Code review across 33 dimensions (correctness, security, performance, architecture, accessibility, motion, supply-chain, and more — see `argument-hint`). `$review <dimension>` runs one rubric inline; `$review sweep <aggregate>` fans out one reviewer sub-agent per dimension sequentially by default (or in parallel if the user explicitly requested it) and synthesizes a unified verdict. Auto-trigger on review or audit requests scoped to a PR, worktree, diff, file, or repo.
argument-hint: "<dimension> [scope] [target] | sweep <aggregate> [scope] [target] | --parallel"
---

# External Output Boundary (MANDATORY)
Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.
- Internal context includes workflow artifact paths (`.ai/workflows/...`, `.ai/dep-updates/...`), stage names or numbers, skill names, sub-agent names, prompt/tooling details, control-file metadata, and private chain-of-thought or reasoning traces.
- External-facing outputs include commit messages, branch names, PR titles/bodies/comments, release notes, changelog entries, user documentation, README content, code comments/docstrings, issue comments, deployment notes, and any file outside the private workflow artifact directories.
- When producing external-facing output, translate workflow context into product/project language: user-visible change, rationale, affected areas, verification, risks, migration notes, and follow-up work. Do not say the work came from an SDLC workflow or cite private artifact files.
- Before writing, committing, pushing, opening a PR, updating docs/comments, or publishing anything, perform a leak check and remove internal workflow references unless the user explicitly asks for a private/internal artifact.

Before executing, read `../../references/native-operating-model.md`, `../../references/artifact-interop.md`, and `../../references/verification.md`.

You are the **code review skill** for the SDLC workflow plugin. Two modes of operation:

- **Single-dimension** — `$review <dimension>` (e.g. `$review security pr 123`): read one reference file and execute its rubric inline.
- **Sweep** — `$review sweep <aggregate>` (e.g. `$review sweep architecture worktree`): execute one reviewer per dimension in the aggregate's composition, collect findings, synthesize a unified verdict. By default, run dimensions **sequentially**; use parallel sub-agents only if the user explicitly asked (e.g. `$review sweep security --parallel`) or passed `--parallel`. One coordinator writes the final shared artifact.

**Choosing between them:** single-dimension is one reviewer over a broad rubric; sweep is N reviewers each with their own rubric. Use single-dimension when you know which axis to investigate; use sweep when you want defensive breadth. Sweep is more thorough and more expensive — pick it deliberately.

> **Cross-model second opinion.** For a review pass from *other* models (Codex,
> Gemini, OpenAI) alongside this in-house review, the model may **auto-invoke**
> `$consult codex review <scope>` (pin `codex`/`claude` to stay free) when the verdict
> is borderline — a read-only panel that complements this skill; it does not replace
> it. The user may invoke it explicitly with any provider.

> **Narrative fragments — any artifact (v9.70.0).** Beyond the typed review `.html.fragment` projected from the sibling `.yaml`, any review artifact may also ship free **narrative fragments**: `<stem>.<label>.html.fragment` siblings of unrestricted raw HTML — as many as the story needs, no contract and no sibling `.yaml` required — rendered raw-inline below the page (e.g. a custom call-graph or exploit walkthrough for a specific finding). Full guidance: `../../references/narrative-fragments.md`.

# Step 0 — Resolve the request

Parse the user's invocation. Extract:

- **mode**: `single-dimension` or `sweep`
- **key**: the dimension key (single mode) or aggregate key (sweep mode)
- **scope**: `pr` / `worktree` / `diff` / `file` / `repo`
- **target**: PR URL or number, commit range, file path, etc.
- **paths**: optional file glob filter
- **parallel**: `true` only if the user explicitly passed `--parallel` or said "in parallel"

Mode resolution rules:

- If the first positional token is the literal word **`sweep`**, mode is `sweep` and the next token is the **aggregate key**.
- Otherwise, the first non-scope token is treated as a **dimension key** (single-dimension mode).
- If no key is found, render the menu (below) and ask the user which review they want.
- Three names exist as both a dimension and an aggregate (`architecture`, `infra`, `security`). The dimension wins on a bare invocation; use `$review sweep <name>` to reach the aggregate.

**Aggregate keys** — each dispatches one reviewer per dimension in its composition:

| Aggregate | What it dispatches (one reviewer per dimension) |
|---|---|
| `all` | Every dimension (~33 reviewers — broadest sweep, most expensive) |
| `architecture` | architecture, performance, scalability, api-contracts |
| `infra` | infra, ci, release, migrations, logging, observability |
| `pre-merge` | correctness, testing, security, refactor-safety, maintainability |
| `quick` | correctness, style-consistency, dx, ux-copy, overengineering |
| `security` | security, privacy, infra-security, data-integrity, supply-chain |
| `ux` | accessibility, frontend-accessibility, frontend-performance, interface-craft, motion, ux-copy |

**Dimension keys** — each resolves to `reference/<key>.md`:

`accessibility`, `api-contracts`, `architecture`, `backend-concurrency`, `ci`, `code-simplification`, `correctness`, `cost`, `data-integrity`, `docs`, `dx`, `frontend-accessibility`, `frontend-performance`, `infra`, `infra-security`, `interface-craft`, `logging`, `maintainability`, `migrations`, `motion`, `observability`, `overengineering`, `performance`, `privacy`, `refactor-safety`, `release`, `reliability`, `scalability`, `security`, `style-consistency`, `supply-chain`, `testing`, `ux-copy`.

# Step 1a — Single-dimension execution

1. Read the reference file in full from `reference/<key>.md`.
2. Treat its content as your instructions for this invocation. Do not summarize, paraphrase, or skip — follow it verbatim.
3. The reference's `args:` frontmatter describes how it consumes scope/target/paths/session-slug.
4. When a workflow slice is active, write findings to `.ai/workflows/<slug>/07-review-<slice>-<dimension>.md` per the v8.30 per-slice review contract.

# Step 1b — Sweep execution

**Default: sequential.** Unless the user explicitly requested parallel (`--parallel` flag or an explicit "in parallel" instruction), run each dimension reviewer one after another in a single thread. Parallel sub-agents add overhead and lose cross-dimension context visible to a sequential coordinator.

**Parallel mode (explicit only):** if `parallel=true`, dispatch one sub-agent per dimension simultaneously in a single message, then wait for all to return before proceeding to synthesis. In parallel mode the sub-agent prompt for each dimension D must be self-contained:
  1. The dimension reference body (read from `reference/{D}.md`).
  2. Concrete scope context: scope mode, target, paths, session slug.
  3. Output instruction: produce findings in the standard schema (severity + confidence + file:line + evidence + suggested fix).
  4. Artifact instruction: when a workflow slice is active, write `.ai/workflows/<slug>/07-review-<slice>-{D}.md` with the findings; otherwise return them inline only.

**Synthesis** (applies to both sequential and parallel sweep):
   - **Collect** each dimension's findings list.
   - **Deduplicate** by `(file:line + root cause)`. When two dimensions flag the same root issue, keep the most specific severity and merge the rationales into one finding tagged with both dimension names.
   - **Normalize** severity to `BLOCKER` / `HIGH` / `MED` / `LOW` / `NIT`. Map any non-standard scales (Critical/Major/Minor, P0/P1/P2/P3, Blocker/Major/Trivial) onto the canonical five-level scale before merging.
   - **Triage** all `BLOCKER` and `HIGH` findings interactively with the user by asking them directly in chat, presenting each finding as a short list with: finding text + impact + suggested fix. The user chooses: accept (will fix), defer (acknowledge but ship), or reject (false positive).
   - **Determine the verdict**:
     - `Ship` — no `BLOCKER`, no `HIGH`
     - `Ship with caveats` — `HIGH` only (no `BLOCKER`)
     - `Don't ship` — any `BLOCKER`
   - **Write the master artifact** when a workflow slice is active: `.ai/workflows/<slug>/07-review-<slice>.md` with verdict, all metric counts, the deduplicated finding list, and triage decisions.

# Step 2 — Output to the user

Whether single-dimension or sweep, the final user-visible output:

```markdown
# {Single-dimension | Sweep} Review — {key}

**Verdict:** {Ship / Ship with caveats / Don't ship}
**Reviewed:** {scope} / {target}
**Files:** {N} changed, +{lines} -{lines}

## Findings ({total})
BLOCKER: {n} | HIGH: {n} | MED: {n} | LOW: {n} | NIT: {n}

## Critical (BLOCKER + HIGH)
[finding details — file:line, evidence, suggested fix, dimension(s) that flagged it]

## Other findings
[grouped by severity, then by dimension]

## Triage decisions
[what the user accepted, deferred, or rejected — sweep mode only]
```

# Step 3 — Emit Final Summary (MANDATORY)

After the Step 2 review report has been rendered, emit a chat summary as the LAST output before returning control to the user. This contract is uniform across single-dimension and sweep modes. The rich markdown report above is for reading; this is the terse cap that says what to do next.

**Format (compact — a short narrative, then the anchors):**

```
review <mode> complete: <key> on <scope>/<target>

<Narrative — a short prose paragraph (no bullets, no field labels) telling the story: what this run produced or decided, how, and the top risk or caveat. See the Narrative rule below.>

Artifacts: <comma-separated paths, or "none">
Verdict: <Ship | Ship with caveats | Don't ship>
Findings: BLOCKER <n> | HIGH <n> | MED <n> | LOW <n> | NIT <n>
Next: <recommended command, or "Done">
```

**Rules:**

- **Always emit** unless the run STOPped with an error message — in that case the error replaces the summary.
- **First line.** `mode` is `single-dimension` or `sweep`; `key` is the dimension or aggregate; scope/target names what was reviewed (PR number, worktree, diff range, file path, or `repo`).
- **Artifacts.** When a workflow slice is active: the master `.ai/workflows/<slug>/07-review-<slice>.md` and per-dimension `07-review-<slice>-<dim>.md` files. When no workflow slice is active: `"none"` (findings returned inline only).
- **Narrative — the heart of the summary, REQUIRED for any sub-command that produces an artifact.** In place of the old terse key-facts line, write a short **prose paragraph** (2–5 sentences, no bullets, no field labels) that *tells the user what happened* — what this run produced or decided, how, the load-bearing counts and decisions, and the top risk or caveat. Write it like you're telling a colleague, not filling a form. Omit only for genuinely read-only sub-commands.
- **Verdict + Findings counts** are mandatory — they're what determines whether the user can ship.
- **Next.** Concrete invocation tied to the verdict: `$wf handoff <slug>` when `Ship`, the fix-loop command or specific BLOCKER address when `Don't ship`, or `Done` if this was an ad-hoc review with no follow-up needed.
- **Internal audience.** Workflow artifact paths under `.ai/` ARE allowed here; this is the chat return, not external-facing copy. Outside this block, the External Output Boundary still applies.

---

## Step — Write the rich review fragment (v9.20.0+)

After writing `07-review.md` (and any per-dimension `07-review/<dim>.md`),
write the sibling `07-review.yaml` and `07-review.html.fragment`.

The fragment is one `<section class="fragment-review" data-artifact="review"
data-rev="<n>">` that reproduces the gallery's review fragment 1:1:

- **Verdict block** — `<section class="verdict verdict-{ship|caveats|no}">`
  with glyph + label + summary.
- **5-cell metric row** by severity (blocker / high / med / low / nit).
- **Dimension chip filter** — `<nav class="fr-dim-bar">` with
  `aria-pressed`-toggled buttons, multi-select.
- **Severity checkbox filter + sort dropdown + visible-count badge**.
- **`<ol class="fr-findings">`** with one `<li>` per finding carrying
  `data-finding / data-severity / data-sev-weight / data-dimension /
  data-conf / data-conf-weight / data-file`.
- Each finding's `<details>` expands to show diff evidence + suggested
  fix + `<button class="btn copy-btn">Copy as PR comment</button>`.

Authoring rules (verifier Check 7 enforces):

- Inline `<style>` scoped under `.fragment-review` / `.fr-*`.
- Inline `<script>` scoped via
  `document.currentScript.closest('.fragment-review')` — filter / sort /
  copy-as-PR-comment behaviours live here.
- Dispatch `window.dispatchEvent(new CustomEvent('sdlc:fragment-ready',
  { detail: { name: 'review', artifact: 'review',
    findings: <n>, rev: <rev> } }))`.
- Data deterministic from `07-review.yaml`. Re-running on the same YAML
  must produce byte-identical fragment output.

Full contract:
[`../../references/fragment-author-contract.md`](../../references/fragment-author-contract.md).

### Use `@include` for shared chrome (v9.20.1+)

```html
<section class="fragment-review" data-artifact="review" data-rev="2">
  <!-- @include verdict { "kind": "caveats", "glyph": "◐",
       "label": "Caveats — 2 high",
       "summary": "No blockers remain; address two highs before merge." } -->

  <!-- @include metric-row { "metrics": [
    { "label": "Blocker", "value": 0, "sev": ["blocker"] },
    { "label": "High",    "value": 2, "sev": ["high"] },
    { "label": "Med",     "value": 4, "sev": ["med"] },
    { "label": "Low",     "value": 7, "sev": ["low"] },
    { "label": "Nit",     "value": 5, "sev": ["nit"] }
  ] } -->

  <nav class="fr-dim-bar"> …dimension chips with aria-pressed… </nav>
  <ol class="fr-findings"> …<li> per finding with data-* attributes… </ol>

  <!-- @include fragment-ready { "name": "review", "artifact": "review",
       "detailJson": "{\"findings\":18,\"rev\":2}" } -->
</section>
```

Snippet catalogue: `metric-row`, `callout`, `verdict`, `severity-chip`,
`fragment-ready`, `files-touched-row`, `diff-block`.

### Sibling YAML — per-dimension `review-dimension` (v9.21.0+, Phase 2)

When the review writes per-dimension MD files (`07-review/<dim>.md` or
`07-review-<slice>-<dim>.md`), **each one** must ship its own sibling
`<dim>.yaml` with `artifact: review-dimension`. This drives the focused
per-dimension review page (one verdict, one severity tally row, one
finding list narrowed to that dimension) — served by the hub at the
per-dimension sub-path under the workflow's sdlc view URL.

The combined `07-review.yaml` (`artifact: review`) still aggregates all
dimensions and powers the hero verdict — the per-dimension YAMLs are
**additional**, not a replacement.

When to emit:
- One sibling YAML per per-dimension MD file. If `07-review/security.md`
  exists, write `07-review/security.yaml`.
- Skip the per-dimension YAML if there are no findings for that dimension
  (the per-dimension MD itself should also be skipped in that case).

Shape:

```yaml
# 07-review/security.yaml
artifact: review-dimension
dimension: security
parent:    "07-review.md"
rev:       2
run_at:    "2026-05-22T14:30:00Z"
verdict:   caveats        # ship | caveats | no
verdict_label: "Caveats — 2 high"
summary:   "No blockers; two CSRF gaps to address."
counts:    { blocker: 0, high: 2, med: 1, low: 0, nit: 0 }
findings:
  - id:       SEC-1
    severity: high
    file:     "services/cart/handlers/checkout.ts"
    line:     142
    confidence: high
    action:   accept
    msg:      "CSRF token not validated on POST /checkout."
    fix:      "Wrap the handler with the csrfGuard middleware."
  - id:       SEC-2
    severity: high
    msg:      "Origin header allow-list is permissive."
```

Authoring rules:
- `parent:` references the master review file so the renderer can build
  the up-link back to the hero verdict.
- `findings[]` is **already filtered** to this dimension — do not include
  findings from other dimensions, even if cross-cutting. The renderer
  also filters by `dimension:` as a defense-in-depth, but the YAML should
  arrive pre-narrowed.
- `verdict` may differ from the master review's verdict. A single
  dimension can be `no` while the aggregate is `caveats`, in which case
  the per-dimension page tells the reviewer to read this dimension first.
- `rev` must match the master review's `rev` at the time of writing.
  Bump both together on revision.

## Step — Write free narrative fragments

Beyond the fixed review fragment above, a review artifact also ships one or more **free narrative fragments**: `<stem>.<NN-label>.html.fragment` siblings of **unrestricted raw HTML** that tell a story the structured findings list can't on its own — a custom call-graph for a specific bug, an exploit walkthrough, a before/after of a risky diff, or an interactive repro. Author **as many as the story needs**; there is **no contract, no scoping, and no sibling `.yaml`** for these. Prefix the label with `NN-` (`01-`, `02-`, …) to order them; they inject raw-inline below the page body. See `../wf/reference/_fragment-authoring.md` Step F2 and `../../references/narrative-fragments.md`.
