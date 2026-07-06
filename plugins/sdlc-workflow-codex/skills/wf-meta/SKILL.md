---
name: wf-meta
description: "RETIRED — dissolved into `$wf`. The lifecycle-navigation members are now `$wf` keys. This stub only redirects; it does no work. Use `$wf status`, `$wf recap`, `$wf close`, `$wf ship-plan`, or `$wf intake <slug> <scope>`."
disable-model-invocation: true
argument-hint: "(retired — use $wf)"
---

# `$wf-meta` is retired — its members are `$wf` keys now

The `wf-meta` skill was dissolved into the single `$wf` dispatcher (the third and final subsume, after
`$wf-quick` and `$wf-design`). **This stub does no work** — it exists only to tell you the new skill.
Re-run using the mapping below:

| Old `$wf-meta …` | New skill |
|---|---|
| `$wf-meta status [slug]` | `$wf status [slug]` — dashboard/detail; also **absorbs `next`** (it prints the exact next command) and **`sync`** (it reconciles `.ai/workflows/INDEX.md`). Deep drift check: `$wf status <slug> deep`. |
| `$wf-meta next [slug]` | `$wf status <slug>` (the detail view's `## Next` is the routing) |
| `$wf-meta sync [slug]` | `$wf status` (registry reconcile runs automatically); `$wf status <slug> deep` for the reality-drift report |
| `$wf-meta resume <slug>` | `$wf recap <slug>` — renamed; recaps what's been done in plain language (also **explains** a plan/shape/review/findings: `$wf recap <slug> <focus>`) |
| `$wf-meta how …` | `$wf recap <slug> <focus>` (explain a workflow artifact) · the `$deep-research` skill (codebase / web research) |
| `$wf-meta skip <slug> <stage>` | `$wf close <slug> <slice>` — skipping is now **slice-scoped**, not stage-scoped |
| `$wf-meta close <slug> [reason]` | `$wf close <slug> [reason]` |
| `$wf-meta amend …` | **removed** — there is no in-place amend. Add a new slice: `$wf intake <slug> <scope>`. Correct an *unbuilt* slice's plan: `$wf plan <slug> <slice> <correction>`. Edit the ship plan: `$wf ship-plan edit`. |
| `$wf-meta extend <slug> …` | `$wf intake <slug> <new scope>` — an existing slug + free scope auto-routes to extension |
| `$wf-meta announce <slug>` | `$wf ship <slug> announce` — comms is a phase of `ship` |
| `$wf-meta init-ship-plan …` | `$wf ship-plan init …` |
| `$wf-meta build-pipeline …` | `$wf ship-plan build …` |

Tell the user the corrected skill and STOP. Do not attempt to perform the operation from this stub.
