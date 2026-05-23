---
name: review
description: Code review across 31 dimensions (correctness, security, performance, architecture, accessibility, supply-chain, and more — see `argument-hint`). `/review <dimension>` runs one rubric inline; `/review sweep <aggregate>` fans out one reviewer sub-agent per dimension in parallel and synthesizes a unified verdict. Auto-trigger on review or audit requests scoped to a PR, worktree, diff, file, or repo.
---

# External Output Boundary (MANDATORY)
Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.
- Internal context includes workflow artifact paths (`.ai/workflows/...`, `.claude/...`, `.ai/dep-updates/...`), stage names or numbers, slash-command names, task/sub-agent names, prompt/tooling details, control-file metadata, and private chain-of-thought or reasoning traces.
- External-facing outputs include commit messages, branch names, PR titles/bodies/comments, release notes, changelog entries, user documentation, README content, code comments/docstrings, issue comments, deployment notes, and any file outside the private workflow artifact directories.
- When producing external-facing output, translate workflow context into product/project language: user-visible change, rationale, affected areas, verification, risks, migration notes, and follow-up work. Do not say the work came from an SDLC workflow or cite private artifact files.
- Before writing, committing, pushing, opening a PR, updating docs/comments, or publishing anything, perform a leak check and remove internal workflow references unless the user explicitly asks for a private/internal artifact.

You are the **code review skill** for the SDLC workflow plugin. Two modes of operation:

- **Single-dimension** — `/review <dimension>` (e.g. `/review security pr 123`): read one reference file and execute its rubric inline.
- **Sweep** — `/review sweep <aggregate>` (e.g. `/review sweep architecture worktree`): dispatch one reviewer sub-agent per dimension in the aggregate's composition, collect findings in parallel, synthesize a unified verdict.

**Choosing between them:** single-dimension is one reviewer over a broad rubric; sweep is N reviewers each with their own rubric. Use single-dimension when you know which axis to investigate; use sweep when you want defensive breadth. Sweep is more thorough and more expensive — pick it deliberately.

# Step 0 — Resolve the request

Parse the user's invocation. Extract:

- **mode**: `single-dimension` or `sweep`
- **key**: the dimension key (single mode) or aggregate key (sweep mode)
- **scope**: `pr` / `worktree` / `diff` / `file` / `repo`
- **target**: PR URL or number, commit range, file path, etc.
- **paths**: optional file glob filter

Mode resolution rules:

- If the first positional token is the literal word **`sweep`**, mode is `sweep` and the next token is the **aggregate key**.
- Otherwise, the first non-scope token is treated as a **dimension key** (single-dimension mode).
- If no key is found, render the menu (below) and ask the user which review they want.
- Three names exist as both a dimension and an aggregate (`architecture`, `infra`, `security`). The dimension wins on a bare invocation; use `/review sweep <name>` to reach the aggregate.

**Aggregate keys** — resolved at runtime via `${CLAUDE_PLUGIN_ROOT}/skills/review/router-metadata.json` `aggregates.<key>`:

| Aggregate | What it dispatches (one sub-agent per dimension) |
|---|---|
| `all` | Every dimension (~31 sub-agents — broadest sweep, most expensive) |
| `architecture` | architecture, performance, scalability, api-contracts |
| `infra` | infra, ci, release, migrations, logging, observability |
| `pre-merge` | correctness, testing, security, refactor-safety, maintainability |
| `quick` | correctness, style-consistency, dx, ux-copy, overengineering |
| `security` | security, privacy, infra-security, data-integrity, supply-chain |
| `ux` | accessibility, frontend-accessibility, frontend-performance, ux-copy |

**Dimension keys** — each resolves to `${CLAUDE_PLUGIN_ROOT}/skills/review/reference/<key>.md`:

`accessibility`, `api-contracts`, `architecture`, `backend-concurrency`, `ci`, `code-simplification`, `correctness`, `cost`, `data-integrity`, `docs`, `dx`, `frontend-accessibility`, `frontend-performance`, `infra`, `infra-security`, `logging`, `maintainability`, `migrations`, `observability`, `overengineering`, `performance`, `privacy`, `refactor-safety`, `release`, `reliability`, `scalability`, `security`, `style-consistency`, `supply-chain`, `testing`, `ux-copy`.

# Step 1a — Single-dimension execution

1. Read the reference file in full from `${CLAUDE_PLUGIN_ROOT}/skills/review/reference/<key>.md`.
2. Treat its content as your instructions for this invocation. Do not summarize, paraphrase, or skip — follow it verbatim.
3. The reference's `args:` frontmatter describes how it consumes scope/target/paths/session-slug.
4. When a workflow slice is active, write findings to `.ai/workflows/<slug>/07-review-<slice>-<dimension>.md` per the v8.30 per-slice review contract.

# Step 1b — Sweep execution (parallel sub-agent dispatch)

1. **Resolve the composition.** Read `${CLAUDE_PLUGIN_ROOT}/skills/review/router-metadata.json` and look up `aggregates.<aggregate-key>` to get the array of dimension keys to dispatch.

2. **Prepare one Task invocation per dimension.** For each dimension key D in the composition:
   - `subagent_type`: `general-purpose`
   - `model`: resolve from `router-metadata.json` `models` block — `models.overrides[D]` if present, otherwise `models.default`. Pass the resolved value (`"haiku"` or `"sonnet"`) as the Task tool's `model` parameter. Do not omit this; reviewers must not silently inherit the parent's model.
   - `description`: `"review-{D}"` (3-5 words, satisfies the Task tool's description constraint)
   - `prompt`: a self-contained prompt assembled as:
     1. The dimension reference body (read from `skills/review/reference/{D}.md`).
     2. Concrete scope context: scope mode, target, paths, session slug.
     3. Output instruction: produce findings in the standard schema (severity + confidence + file:line + evidence + suggested fix).
     4. Artifact instruction: when a workflow slice is active, write `.ai/workflows/<slug>/07-review-<slice>-{D}.md` with the findings; otherwise return them inline only.

   **Why the model split.** Rubric-bound dimensions (the default) run on Haiku 4.5: bounded input, fixed output schema, no cross-dimension reasoning needed — Haiku follows the schema cleanly at a fraction of the cost. The three `overrides` (`architecture`, `refactor-safety`, `security`) call for subjective tradeoff judgment, abstraction critique, or threat modeling, so they get Sonnet 4.6. Synthesis (Step 5 below) keeps the parent model — cross-finding dedup, severity-scale mapping, and interactive triage benefit from the stronger reasoner.

3. **Dispatch in parallel.** Issue ONE assistant message containing all N `Task` tool calls. Sequential dispatch defeats the purpose of sweep mode and is forbidden.

4. **Wait for all sub-agents to return.** Do not begin synthesis until every dispatched sub-agent has completed (or timed out).

5. **Synthesize** the sub-agent outputs:
   - **Collect** each sub-agent's findings list.
   - **Deduplicate** by `(file:line + root cause)`. When two dimensions flag the same root issue, keep the most specific severity and merge the rationales into one finding tagged with both dimension names.
   - **Normalize** severity to `BLOCKER` / `HIGH` / `MED` / `LOW` / `NIT`. If a sub-agent used a different scale (Critical/Major/Minor, P0/P1/P2/P3, Blocker/Major/Trivial), map onto the canonical five-level scale before merging.
   - **Triage** all `BLOCKER` and `HIGH` findings interactively with the user via `AskUserQuestion`. For each, present finding text + impact + suggested fix; let the user accept (will fix), defer (acknowledge but ship), or reject (false positive).
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

**Format (max 8 lines):**

```
review <mode> complete: <key> on <scope>/<target>
Artifacts: <comma-separated paths, or "none">
Verdict: <Ship | Ship with caveats | Don't ship>
Findings: BLOCKER <n> | HIGH <n> | MED <n> | LOW <n> | NIT <n>
Next: <recommended command, or "Done">
```

**Rules:**

- **Always emit** unless the run STOPped with an error message — in that case the error replaces the summary.
- **First line.** `mode` is `single-dimension` or `sweep`; `key` is the dimension or aggregate; scope/target names what was reviewed (PR number, worktree, diff range, file path, or `repo`).
- **Artifacts.** When a workflow slice is active: the master `.ai/workflows/<slug>/07-review-<slice>.md` and per-dimension `07-review-<slice>-<dim>.md` files. When no workflow slice is active: `"none"` (findings returned inline only).
- **Verdict + Findings counts** are mandatory — they're what determines whether the user can ship.
- **Next.** Concrete invocation tied to the verdict: `/wf handoff <slug>` when `Ship`, the fix-loop command or specific BLOCKER address when `Don't ship`, or `Done` if this was an ad-hoc review with no follow-up needed.
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
[`reference/fragment-author-contract.md`](../../reference/fragment-author-contract.md).
Gallery reference (bundled with plugin): `reference/fragments-gallery.html`.

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
finding list narrowed to that dimension) under
`/sdlc/<slug>/review/<dimension>/`.

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
model:     "claude-opus-4-7"
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
