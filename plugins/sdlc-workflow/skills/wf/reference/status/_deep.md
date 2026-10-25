# Status — Deep Mode (`/wf status <slug> deep`)

Load this file from `status.md` when Step 0 set deep-mode. It holds the reality-drift procedure and the `00-sync.md` write.

`deep` runs a reality reconciliation: it checks whether
referenced code, tests, PRs, branches, and dependencies actually exist or have drifted, and writes a
`00-sync.md` report. Run it when a workflow has been idle mid-flight (stages 4–7) and you suspect the
world moved underneath it. Plain `/wf status <slug>` (no `deep`) does **not** run this — it stays a
read-only detail view.

1. **Inventory references** from every stage record in `workflow-files` (read each with
   `node "<skill-dir>/scripts/wf.mjs" record get "<root>" <slug> <name>`, per [_records.md](../_records.md)): code file paths, test paths,
   git refs (branch, base, PR, SHAs), dependency/package names, external tickets/APIs. Record source + type.
2. **Check code reality** — file existence (file listing); freshness (`git log -1 --format="%ai" -- <file>`);
   flag files modified after the referencing stage as `⚠ drifted`. Test files: existence + pattern validity (content search).
3. **Check git reality** — branch existence (`git branch --list` / `-r`), current-branch match,
   ahead/behind (`git rev-list --left-right --count <base>...<branch>`), PR status
   (`gh pr view <n> --json state,mergeable,reviewDecision,statusCheckRollup` if `gh` present), SHA existence.
4. **Check dependency reality** — package present in lockfile/manifest; version drift; config-file freshness.
4b. **Check steering reality** — when the decision store holds live `steer` entries (`decide list
   --kind steer`; see [_decisions.md](../_decisions.md)), read them as **signal, not drift**: their mere
   presence is normal, expected state and is never a finding. A finding arises only when a **stage artifact contradicts a steering entry** —
   e.g. steering says "never touch `config/loader.ts`" but an `05-implement` diff or a plan decision
   did. Surface each contradiction as a `⚠ steering-violation` drift finding under a **Steering**
   category; no live `steer` entry → skip this check silently, no category, no counts.
4c. **Check intent-risk reality (RIM ledger)** — read `intent-risks` from the index (`record get "<root>" <slug> index`; the Intent-Risk
   ledger, same machinery as `runtime-evidence-deferrals`; may be absent → skip silently). Render each
   entry **beside the deferrals ledger** as a compact row — `id` · `severity` (high|medium|low) ·
   `status` (open|adjudicated|carried). A finding arises when an entry is still `status: open`
   **after shape is complete** (shape should have adjudicated it): surface each as a `⚠ intent-risk-open`
   drift finding under an **Intent-Risk** category. Adjudicated/carried entries are normal state, not
   findings.
5. **Assess health** — per-category totals (Code, Test, Git, Deps, External, Steering, Intent-Risk) with ✓/⚠/✗/? counts. Rate:
   `in-sync` (no ✗, ≤2 ⚠) · `minor-drift` (no ✗, 3+ ⚠) · `significant-drift` (any ✗) · `stale` (>7d old AND drift).
6. **Write the draft `.ai/workflows/<slug>/.draft/00-sync.md`** (`type: sync-report`, `regenerable: true`, `health: <rating>`)
   with the summary table, per-category tables, drift details, and recommended actions, then run
   `node "<skill-dir>/scripts/wf.mjs" record put "<root>" <slug>`. **Overwrite
   freely** each run (no history append).
7. **Bookkeeping touch:** add `00-sync.md` to `workflow-files` with
   `record set "<root>" <slug> index "workflow-files=[<current entries>, 00-sync.md]"`
   (and set the matching `updated-at` column in `INDEX.md`). Do not change `status`/`current-stage`.

Recommended-actions in the report point at real commands: `/wf plan <slug>` (stale plan refs),
`/wf intake <slug> <scope>` (new scope surfaced), `/wf status <slug> deep` (re-check after fixes).
