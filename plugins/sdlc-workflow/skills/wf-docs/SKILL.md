---
name: wf-docs
description: "RETIRED — dissolved into `/wf docs`. This stub only redirects; it does no work. Use `/wf docs` (orchestrator) or `/wf docs <primitive>` (a single Diátaxis document)."
disable-model-invocation: true
argument-hint: "(retired — use /wf docs)"
---

# `/wf-docs` is retired — it is `/wf docs` now

The `wf-docs` skill was dissolved into the `/wf docs` router-key (same behavior, same two modes).
**This stub does no work** — it exists only to tell you the new command:

| Old `/wf-docs …` | New command |
|---|---|
| `/wf-docs` / `/wf-docs <slug>` / `/wf-docs --audit-only` / `/wf-docs <path>` | `/wf docs …` (orchestrator pipeline: discover → audit → plan → generate → review) |
| `/wf-docs <primitive> <args>` (`plan`/`tutorial`/`how-to`/`reference`/`explanation`/`readme`/`review`) | `/wf docs <primitive> <args>` (a single Diátaxis document) |

Tell the user the corrected command and STOP. Do not attempt to generate docs from this stub.
