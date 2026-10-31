# Intake shared context

The single source of truth for the rules every `/wf intake` mode shares — the output boundary,
the workflow-registry / slug semantics, and the rule for `INDEX.md`. The dispatcher
(`reference/intake.md`), `intake/default.md`, and every mode reference under `intake/` defer to
this file rather than restating it. (Mirrors how the design commands defer to
`design/_design-context.md`.)

# Workflow registry & slug semantics

`.ai/workflows/INDEX.md` is the global workflow registry (format documented in
`../status.md`, the `/wf status` registry-reconcile spec). Columns:
`slug<TAB>status<TAB>workflow-type<TAB>branch<TAB>updated-at`, sorted alphabetically by slug,
closed rows retained.

**Slugs are stable.** Once intake establishes a slug it never changes, and a closed slug is never
reused by a new workflow.

**Slug-mode is not a collision.** When the token before the mode word names an existing workflow, the run attaches a slice on purpose, per [_compressed-slice.md](../_compressed-slice.md). No collision rule fires.

# New slug

Every mode that creates a workflow names it in three steps. A mode card cites this section and keeps only its own form and its exceptions.

1. **Derive.** The form is `<mode>-<descriptor>`: lowercase kebab-case, at most 5 words, from the description (for example `fix-checkout-button-spacing`). A dated mode adds the date: `<mode>-<descriptor>-<YYYYMMDD>` (`ideate`, `simplify`, `brainstorm`) or `<mode>-<YYYYMMDD>` (`update-deps`), from the date-only row of [_timestamp.md](../_timestamp.md) with the dashes removed. Default intake derives a kebab-case slug with no prefix, or uses the slug that the person gives.
2. **Reserved check.** The slug must not be one of the reserved words below. A slug with a mode prefix never matches, so the check stops a default slug, a given slug or a work packet slug. On a match, STOP and ask for another slug: *"`<slug>` is a `/wf` command word, so it cannot name a workflow. Re-run `/wf intake <new-slug> <description>`."*
3. **Collision.** Use the rule of the class of the mode:

| Class | Modes | When `record get "<root>" <slug> index` exits 0 |
|---|---|---|
| Default | default intake | the `INDEX.md` row check and the gate questions of `intake/default.md` Step 0 |
| Work packet | a work packet slug of a brainstorm or an ideate pick | ask the person for a new slug |
| Typed | `fix`, `hotfix`, `refactor`, `update-deps`, `optimize`, `adopt`, `rca`, `investigate`, `discover`, `audit`, `task` | the same `workflow-type` (or its legacy alias) is the resume of the mode's Step 0. Another type: WARN *"Workflow `<slug>` already exists with type `<existing-type>`. Choose a different description, or run `/wf status recap <slug>` to continue the existing workflow."* and stop. |
| Dated | `ideate`, `simplify`, `brainstorm` | append `-2`, `-3`, and so on, until `record get` exits 1 |

**Reserved words.** `wf/SKILL.md` reads a command word before it reads a slug, so a new
workflow's slug must not be one of these words:
<!-- generated from skills/wf/keys.json by npm run generate; edit keys.json -->
- the keys: `intake`, `shape`, `design`, `slice`, `plan`, `implement`, `verify`, `review`, `handoff`, `ship`, `retro`, `probe`, `yolo`, `campaign`, `loop`, `status`, `project`, `docs`;
- the sub-keys: `goal`, `optimize`, `prototype`, `recap`, `ship-plan`, `observability`;
- the intake mode words: `fix`, `rca`, `investigate`, `discover`, `audit`, `hotfix`, `refactor`, `update-deps`, `ideate`, `brainstorm`, `adopt`, `optimize`, `simplify`, `task`, `amend`, `modernize`, `close`.
<!-- end generated -->

An existing workflow with a reserved slug keeps its name. `node "<skill-dir>/scripts/wf.mjs" index "<root>" --check` and `/wf status` flag it.

# INDEX.md

Scripts write `.ai/workflows/INDEX.md`. Do not edit it, per [_records.md](../_records.md). The put of a new `00-index.md` adds the row of the workflow. Each later change of the index refreshes that row.
