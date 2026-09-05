# Ship run artifacts

`ship.md` Steps 11, 13, and Z write these files. Frontmatter is the source of truth; every body table is regenerated from it.

## `09-ship-run-<run-id>.md` (Step 13)

```yaml
---
schema: sdlc/v1
type: ship-run
slug: <slug>                # the LEAD slug in batch mode
run-id: "<YYYYMMDDTHHMMZ>"
status: <complete | awaiting-input | failed | rolled-back>
plan-ref: ../../ship-plan.md
plan-version-at-run: <integer copied from plan at run-start>
created-at: "<ISO 8601>"
updated-at: "<ISO 8601>"
ship-scope: <slug | branch>          # branch = one atomic run for every slug on the branch
branch-slugs: [<slug-1>, <slug-2>, ...]   # the roster released together (present when ship-scope: branch)
environment: <env name>
version: "<chosen version>"
prior-version: "<last release tag, or 'none'>"
prefetched-answers:                 # Step 0.9 — asked BEFORE the atomic sequence opened; consumed by 1.2 / 3.1–3.3 / 10.3
  scope: "<slug|branch — the roster this run ships>"
  version: "<confirmed version>"
  rollout-strategy: "<confirmed strategy>"
  release-window: "<timing / blackout / on-call>"
  compliance-overrides: "<sign-off beyond the plan's list, or none>"
go-nogo: <go | conditional-go | no-go | pending>   # pending = paused before the step-5 gate (status: awaiting-input)
merge-strategy: <rebase | squash | merge | none>
ship-plan-readiness: <ok | acknowledged | amended-inline>   # ship-plan pre-check verdict (Step 0.4); missing/drift STOP before a run is written
ship-plan-amended-blocks: [<letter>, ...]   # amended-inline only — blocks the scoped inline edit touched
ship-plan-version-before-after: "<N>→<M>"   # amended-inline only
head-sha-at-start: "<sha>"                  # evidence fields are set as steps complete; absent = not yet run
pre-flight-status: <pass | warn | fail>
publish-dry-run-passed: <true | false | skipped>
merge-sha: "<sha or empty>"
release-tag: "<vX.Y.Z or empty>"
release-workflow-run-id: "<gh run id or empty>"
release-workflow-conclusion: <success | failure | cancelled | "">   # not-reached is the EMPTY STRING "" — never the literal word `empty`
post-publish-checks:
  - { kind: <kind>, status: <pass|fail|skip|pending>, observed-at: "<iso>", evidence: "<short>" }   # skip = did not run / not applicable — never recorded as pass
post-release-bump-sha: "<sha or empty>"
recovery-actions-taken: [<playbook-id>, ...]
rolled-back: <true | false>
rollback-sha: "<sha or empty>"
rollback-reason: ""
rollback-artifact: "<09-rollback-<run-id>.md or empty>"   # stamped by the rollback phase
announcements-sent: [<channel>, ...]
tags: []
refs:
  index: 00-index.md
  handoff: 08-handoff.md
  plan: ../../ship-plan.md
  reviews: [07-review-<slice-1>.md, ...]
next-command: wf-retro
next-invocation: "/wf retro <slug>"
---
```

Body, as `# Ship Run — <slug> @ <version> @ <environment>`, in order:
- `## The Ship` — first, and self-sufficient. Follow `_story-arc.md`: three beats in order (the state this stage inherited, the load-bearing decisions with reasons and counts, what this stage enables next plus the top open risk). Language follows `_ste-procedural.md` sections 1 and 3. No "This <stage> implements…" opening. 1–3 short paragraphs.
- `## Pre-flight` — ship-plan readiness (`ok` | `acknowledged`, with the drift signals and reason), branch + tree clean, version chosen (and prior), source-of-truth files updated, secrets verified (with staleness flags), changelog regenerated (yes/no, commit sha).
- `## Publish dry-run` — command, result, post-conditions checked with outcomes.
- `## Rollout decision` — strategy, release window, stakeholders, caveats.
- `## Freshness research delta` — platforms checked, new advisories since the prior run, CI/CD changes since the prior run.
- `## Go / No-Go` — decision and a one-paragraph rationale.
- `## Merge` — pr-number, merge-strategy, merge-sha.
- `## Tag + release` — tag, release URL, notes source.
- `## Release workflow watch` — workflow file, run id, conclusion, jobs with conclusions.
- `## Post-publish polling` — each check with kind, status, observed-at, evidence; the propagation window elapsed of max. Skips are listed distinctly.
- `## Post-release version bump` — next dev version, commit sha.
- `## Recovery actions taken` — `<playbook-id>`: steps confirmed by the user.
- `## Announcements` — channels notified.
- `## Recommended Next Stage` — Option A (default) `/wf retro <slug>`; Option B `/wf implement <slug> <slice>` (fix blockers or rebase conflicts); Option C `/wf verify <slug> <slice>` (re-verify stale evidence); Option D `/wf ship <slug>` (resume a paused run); each with its reason, when applicable.

## `09-ship-runs.md` (Step 11, append or refresh on every run)

```yaml
---
schema: sdlc/v1
type: ship-runs-index
slug: <slug>
updated-at: "<iso>"
runs:
  - { run-id: <id>, version: <ver>, environment: <env>, status: <status>, go-nogo: <go|conditional-go|no-go|pending>, notes: "<short — max 160 chars; the schema enforces the cap, so author within it>" }
  # follower slug in a batch ship — a pointer row, no local run artifact:
  - { run-id: <id>, version: <ver>, environment: <env>, status: <status>, go-nogo: <decision>, shipped-via: "<lead>/09-ship-run-<id>.md", notes: "shipped with <lead>" }
---

# Ship Runs

| Run | Version | Env | Status | Go/No-Go | Notes |
|---|---|---|---|---|---|
| <id> | <ver> | <env> | <status> | <decision> | <notes> |
```

## Step Z — the rich sibling `.yaml` and `.html.fragment`

The sunflower view renders the ship-run page from a sibling `.yaml` + `.html.fragment` next to `09-ship-run.md`. Without the `.yaml` the page degrades to plain prose (no deploy timeline, no checks matrix, no rollback panel; `ship-run.mjs` returns `renderSimple`). Managed-artifact enforcement ([../_host-invocation.md](../_host-invocation.md)) blocks the `.md` write when the sibling `.yaml` is missing, so author it first or in the same turn. Set `fragment: none` in frontmatter to opt out for a genuine no-op run. Files are flat in the slug dir: `09-ship-run-<run-id>.{yaml,html.fragment}`, not a `ship/<run-id>/` subtree.

1. Write the sibling **`09-ship-run-<run-id>.yaml`**. The schema is validated at write time (enforcement blocks the write on a violation), so the required shape is stated here in full: the canonical file (`siblingYamlSchemas['ship-run']` in `tests/frontmatter.schema.json`) lives inside the plugin install, not in the project repo.

   **Required top-level keys:** `release`, `run_at`, `stages`, `checks`, `rollback`.

   | Key | Shape | Notes |
   |---|---|---|
   | `artifact` | `ship-run` | optional, but write it |
   | `release` | string | the release identity, `v3.2.0` |
   | `run_at` | ISO-8601 | a real timestamp per [../_timestamp.md](../_timestamp.md), never a guessed or `T00:00:00Z` value |
   | `stages[]` | requires `name`, `status`; optional `started_at`, `ended_at` | the deploy timeline |
   | `checks[]` | at least one entry; each requires `name`, `kind`, `results` | the check matrix |
   | `checks[].results` | map of env-name → `{ status, duration_s? }` | `status` ∈ `pass \| fail \| flake \| skip \| running \| pending`; `duration_s` is a number or `null` |
   | `checks[].logs` | map of env-name → string | optional; feeds the click-to-reveal log panel |
   | `rollback` | requires `window_minutes` (integer ≥ 0), `target_release`; optional `approvers[]` | the rollback panel |

   Minimal valid skeleton (one stage, one check):

   ```yaml
   artifact: ship-run
   release: "v3.2.0"
   run_at: "2026-07-26T14:03:11Z"
   stages:
     - { name: build, status: pass, started_at: "2026-07-26T14:03:11Z", ended_at: "2026-07-26T14:07:02Z" }
   checks:
     - name: unit
       kind: test
       results:
         ci: { status: pass, duration_s: 84 }
   rollback:
     window_minutes: 60
     target_release: "v3.1.0"
     approvers: []
   ```

   Two field-shape traps that have each cost a blocked write: `release-workflow-conclusion` in the `.md` frontmatter takes an empty string `""`, not the word `empty`; and `notes` is capped at 160 characters.
2. Write the sibling **`09-ship-run-<run-id>.html.fragment`**: one `<section class="fragment-shiprun" data-artifact="ship-run" data-release="<release>">` that reproduces the gallery's ship-run fragment 1:1: a deploy-timeline SVG (build → test → stage → canary → prod, segments tinted by status); `<table class="sr-checks">` with rows = checks, columns = envs, cells carrying `.is-pass / .is-fail / .is-flake / .is-skip / .is-running`; `<aside class="sr-log-panel" hidden>` that reveals on cell click; `<div class="sr-actions">` with `.btn-primary "Promote to 100%"` and `.btn-danger "Roll back"`. Authoring rules (verifier Check 7 enforces): inline `<style>` scoped under `.fragment-shiprun` / `.sr-*`; inline `<script>` scoped via `document.currentScript.closest('.fragment-shiprun')`; dispatch `window.dispatchEvent(new CustomEvent('sdlc:fragment-ready', { detail: { name: 'ship-run', artifact: 'ship-run', counts: { checks: <n>, stages: <n> }, status: '<latest-stage-status>' } }))`; inline SVG only; data deterministic from `09-ship-run.yaml`. Full contract: [`reference/fragment-author-contract.md`](../../../../reference/fragment-author-contract.md); gallery: [`reference/fragments-gallery.html`](../../../../reference/fragments-gallery.html).

The fragment is body-only ([../_fragment-authoring.md](../_fragment-authoring.md) → "Scope"): `ship-run.mjs` owns the page heading and metric-row, so the fragment carries only the interactive layer. Use `@include` for shared chrome:

```html
<section class="fragment-shiprun" data-artifact="ship-run" data-release="v3.2.0">
  <!-- No heading, no metric-row here — the page owns them. -->
  <svg class="sr-timeline" viewBox="…"> …deploy timeline (pulse on live stage)… </svg>
  <table class="sr-checks"> …clickable check matrix → log panel… </table>
  <div class="sr-actions">
    <button class="btn btn-primary">Promote to 100%</button>
    <button class="btn btn-danger">Roll back</button>
  </div>
  <!-- @include fragment-ready { "name": "ship-run", "artifact": "ship-run",
       "detailJson": "{\"counts\":{\"checks\":4,\"stages\":5}}" } -->
</section>
```

Snippet catalogue: `metric-row`, `callout`, `verdict`, `severity-chip`, `fragment-ready`, `files-touched-row`, `diff-block`.

Then author free narrative fragments for any beat the structured page cannot tell, per [../_fragment-authoring.md](../_fragment-authoring.md) **Step F2** (unrestricted raw HTML, no contract or sibling `.yaml`, `NN-` label ordering).
