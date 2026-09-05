# Implement artifacts

`implement.md` Steps 8 and 9 write these two files. Frontmatter is the machine-readable state; the body is narrative.

## `05-implement.md` (master index)

```yaml
---
schema: sdlc/v1
type: implement-index
slug: <slug>
status: in-progress
stage-number: 5
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
slices-implemented: <N>
slices-total: <N>
metric-total-files-changed: <N>
metric-total-lines-added: <N>
metric-total-lines-removed: <N>
tags: []
refs:
  index: 00-index.md
  plan-index: 04-plan.md
next-command: wf-verify
next-invocation: "/wf verify <slug> <slice-slug>"
---
```

Body, as `# Implement Index`: `## Cross-Slice Integration Notes` (bullets) and `## Recommended Next Stage`.

## `05-implement-<slice-slug>.md` (per-slice implementation record)

```yaml
---
schema: sdlc/v1
type: implement
slug: <slug>
slice-slug: <slice-slug>
status: complete
stage-number: 5
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
metric-files-changed: <N>
metric-lines-added: <N>
metric-lines-removed: <N>
metric-deviations-from-plan: <N>
metric-review-fixes-applied: 0
commit-sha: "<sha or empty if branch-strategy is none>"
tags: []
refs:
  index: 00-index.md
  implement-index: 05-implement.md
  slice-def: 03-slice-<slice-slug>.md
  plan: 04-plan-<slice-slug>.md
  siblings: [05-implement-<other>.md, ...]
  verify: 06-verify-<slice-slug>.md
next-command: wf-verify
next-invocation: "/wf verify <slug> <slice-slug>"
---
```

Body, as `# Implement: <slice-name>`, in order:
- `## The Implementation` — first, and self-sufficient. Follow `_story-arc.md`: three beats in order (the state this stage inherited, the load-bearing decisions with reasons and counts, what this stage enables next plus the top open risk). Language follows `_ste-procedural.md` sections 1 and 3. No "This <stage> implements…" opening. 1–3 short paragraphs.
- `## Summary of Changes` — bullets.
- `## Files Changed` — `path: what changed and why`, one line per file.
- `## Shared Files (also touched by sibling slices)` — bullets.
- `## Notes on Design Choices` — bullets.
- `## Verification Seams Built` — the seams the plan's `## Verification Strategy` named to make each user-observable AC observable: seeded fixtures, deterministic clocks, `data-testid` / accessibility ids, emulator or test config, exported test hooks, authorized tool install. `verify` relies on these; list each as `<AC id / text> → <seam built> at <file:line> (enables <tool / method> to observe it)`. If none were needed, write "None needed — [reason]."
- `## Visual Contract Honored (only if `02c-craft.md` was present)` — for each item in `02c-craft.md` → `## Mock fidelity inventory`, `<inventory item> — honored at <file:line> | deviation: <what differs and why>`.
- `## Deviations from Plan` — a deviation of kind "planned API not found" (the plan assumed a capability the installed source does not expose) names the source file read that established the absence: the `node_modules/` or vendored path, the failing repro, or the upstream issue. A bare "the API did not work" is not a recorded deviation.
- `## Anything Deferred` — capabilities deferred by shape's Round 5 restraint or the plan's ladder, plus any `sdlc-debt:` shortcut, each with its ceiling and upgrade path.
- `## Known Risks / Caveats` — any `sdlc-debt:` shortcut whose ceiling is live in shipped code (global lock, O(n²) scan, naive heuristic, hard-coded value).
- `## Freshness Research` — source, relevance, takeaway.
- `## Recommended Next Stage` — **Option A (default):** `/wf verify <slug> <slice-slug>` with its reason; **Option B:** `/wf review <slug> <slice-slug>` (skip verify) with its reason, if applicable.

## Free narrative fragments

Author **free narrative fragments** for any beat the structured page cannot tell. Follow [../_fragment-authoring.md](../_fragment-authoring.md) **Step F2** for rules (unrestricted raw HTML, no contract or sibling `.yaml`, `NN-` label ordering).
