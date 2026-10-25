# Intake shared context

The single source of truth for the rules every `/wf intake` mode shares — the output boundary,
the workflow-registry / slug semantics, and the registration in `INDEX.md`. The dispatcher
(`reference/intake.md`), `intake/default.md`, and every mode reference under `intake/` defer to
this file rather than restating it. (Mirrors how the design commands defer to
`design/_design-context.md`.)

# External Output Boundary
Apply the boundary rule in [_output-boundary.md](../_output-boundary.md) to every external-facing output
this operation produces: translate workflow context to product language and leak-check before publishing.

> **Standing steer.** Only when the decision store holds a live `steer` entry (`decide list --kind steer`, per [_decisions.md](../_decisions.md)): apply it. Honor the user's standing instructions, never
> above a mandatory gate, and inject the relevant entries into every sub-agent prompt you dispatch.

# Workflow registry & slug semantics

`.ai/workflows/INDEX.md` is the global workflow registry (format documented in
`../status.md`, the `/wf status` registry-reconcile spec). Columns:
`slug<TAB>status<TAB>workflow-type<TAB>branch<TAB>updated-at`, sorted alphabetically by slug,
closed rows retained.

**Slugs are stable.** Once intake establishes a slug it never changes, and a closed slug is never
reused by a new workflow.

**Collision detection** (a *new* workflow whose derived slug already exists) is owned by
`intake/default.md` Step 0 — it prompts catch-up (recap) / add-scope (extend) / pick-different / cancel and never silently
proceeds. **This is distinct from slug-mode:** when the dispatcher detects that the *first
positional token* is an exact existing-slug match, that is an *intentional* attach handled by
`../_compressed-slice.md` — no collision prompt fires.

**Reserved slug names.** `wf/SKILL.md` reads a command word before it reads a slug, so a new
workflow's slug must not be one of these words:
<!-- generated from skills/wf/keys.json by npm run generate; edit keys.json -->
- the keys: `intake`, `shape`, `design`, `slice`, `plan`, `implement`, `verify`, `review`, `handoff`, `ship`, `retro`, `probe`, `yolo`, `campaign`, `loop`, `status`, `project`, `docs`;
- the sub-keys: `goal`, `optimize`, `prototype`, `recap`, `ship-plan`, `observability`;
- the intake mode words: `fix`, `rca`, `investigate`, `discover`, `audit`, `hotfix`, `refactor`, `update-deps`, `ideate`, `brainstorm`, `adopt`, `optimize`, `simplify`, `task`, `amend`, `modernize`, `close`.
<!-- end generated -->

When a derived or given slug is in this set, ask for another slug with the "Pick a different slug"
option of the `intake/default.md` collision prompt. Every mode that creates a workflow applies this
rule. An existing slug keeps its name, and `/wf status` flags it.

# Register the workflow in INDEX.md

This is the additive bootstrap. Every mode that creates a new workflow registers it in `.ai/workflows/INDEX.md`. Do this after `00-index.md` is final. Read the index again with `node "<skill-dir>/scripts/wf.mjs" record get "<root>" <slug> index` (per [_records.md](../_records.md)), so the row has the final values. Branch, status, and workflow-type can change between Step 0 and the end of the run.

- **If `.ai/workflows/INDEX.md` does NOT exist**, create it with the header comment (exactly from the [`/wf status` reconcile spec](../status.md)) followed by exactly one row for this workflow. Use the canonical column order: `slug<TAB>status<TAB>workflow-type<TAB>branch<TAB>updated-at`. Header line:
  ```
  # .ai/workflows/INDEX.md — global workflow registry. Reconciled by /wf status (bootstrap+refresh) and additively touched by slug-mode compressed-slice writes from /wf intake/probe/simplify (updated-at only) and by /wf intake (append self if absent). Columns: slug<TAB>status<TAB>workflow-type<TAB>branch<TAB>updated-at. Sorted alphabetically by slug. Closed workflows are retained.
  ```
  Surface in the chat return: *"Bootstrapped `.ai/workflows/INDEX.md` with this workflow's row. Positional slug detection (compressed-slice attach via `/wf intake`/`/wf probe`/`/wf intake simplify`) is now enabled."*
- **If `.ai/workflows/INDEX.md` exists AND the slug is already present**, do nothing. A matching row means this is a resume on a row that an earlier intake run wrote. Leave the existing row in place so sync owns updates.
- **If `.ai/workflows/INDEX.md` exists AND the slug is missing**, append a single new row for this workflow, then **re-sort the file alphabetically by slug** (preserving the header line at the top). Surface in the chat return: *"Added `<slug>` to `.ai/workflows/INDEX.md`."*
- **Mutate no other row.** Status/branch/updated-at drift on other workflows is sync's responsibility, not intake's. Intake's contract here is strictly *append self if absent*.
- **A build work packet of a list is not registered here.** `campaign.mjs open` writes its folder and its row (`campaign.md`, step 3).
