# Intake provenance — Consume and Link back

Read this file only when a source attached in Detect ([_intake-provenance.md](_intake-provenance.md)). The stage artifact that you write then lists `from` in `modes:`, and each mode that reads this file has a `mode:from` row for it in its `## Requires` table.

## Consume

With provenance attached, read the source's lead artifact and seed the new workflow from
the row that matches the source's `workflow-type`. In every row the rule is the same:
**re-verify, do not copy** — the source may be stale against the current tree; its evidence
targets the research, it does not replace it. One exception: a brainstorm **decision** is the
person's answer, not a fact. It travels word for word, and nobody asks it again: the person
decided it in the brainstorm.

| Source `workflow-type` | Read | Seed |
|---|---|---|
| `investigate` | `01-investigate.md`, the **chosen option's card** (the picked option, or the matched option when the pick is implicit) | The card's mechanism + sketch seed the restated request / shape direction. The files-touched estimate targets research. Top risks, constraint collisions, and the decisive unknown seed the risk inventory / known unknowns. The relevant architecture-map entries (section 2) go into research sub-agent prompts as prior context. The user's stated constraints (section 1) carry into this workflow's constraints. |
| `rca` | `01-rca.md` | `## Root cause` seeds the restated request — the fix targets the named mechanism, not the symptom. `## Blast radius` (same-pattern-elsewhere) seeds scope and the risk inventory. `## Contributing factors` seeds known unknowns / follow-up scope decisions. `## Verification` seeds the acceptance criteria unchanged — it was written to be them. |
| `discover` | `01-discover.md` | The verdict and its evidence seed the restated request's factual ground. The ranked counter-hypotheses seed the diagnosis candidates (they are literally candidate root causes when the successor is an rca). Recorded contradictions seed the risk inventory. |
| `ideate` | The work packet file of the pick when it exists: read it as the `brainstorm` row does. Otherwise `01-ideate.md`, the **chosen idea's card** | The idea's description + `evidence:` (`file:line` anchors) seed the restated request and research targeting. The rationale that culled its sibling ideas seeds the out-of-scope list — what was considered and rejected, so the successor does not re-widen. |
| `brainstorm` | The work packet file `work/<packet-slug>.md` (`type: packet`) when it exists ([../intake.md](../intake.md), "List work packet"): its goal, its scope, its acceptance criteria, its constraints, its risks, and its `carried-decisions`. Otherwise `brainstorm-board.json`, the **work packet** (`work[]`) whose `slug` is this slug: its kept items (`items:`), its threads' assumptions and tensions, and its title. A legacy board without the JSON file: the routed candidate in the `01-brainstorm.md` frontmatter | A work packet file's goal seeds the restated request, and its acceptance criteria seed the success criteria word for word. The title and the kept decisions and findings seed the restated request; each kept decision goes into the Known Constraints word for word with its source `<board path>#<item-key>`, and `origin-items` in `00-index.md` lists the carried keys; a `scope: cut` item never seeds it, and a `scope: later` item joins the out-of-scope list. The named and confirmed assumptions seed the risk inventory. A contradicted finding and each open tension seed known unknowns. The parked and dropped threads join the out-of-scope list, so the successor does not re-widen. When the work packet records `ux-impact`, propose that value in the stack question; the person confirms it. A work packet file's `ux-impact` is already confirmed: write it with `ux-impact-confirmed: true`, and do not ask it again. Its design items (`design: true`) and carried sketches stay on the board: shape's brief and the design stage read them there (`design/_carried.md`). |
| `update-deps` (a prior run) | The prior run's `02-shape.md` Hold tier + `05-implement.md` Blocked list | Hold/Blocked packages, their reasons, revisit conditions, and `changelog-source:` citations seed this run's research — re-check the revisit condition instead of cold-rescanning last month's findings. A citation is re-used only after confirming the target version is unchanged. |
| an **escalated change-mode** (`fix`/`hotfix`/`refactor`/`update-deps` closed with `close-reason: superseded`) | Its `01-<mode>.md` and `02-shape.md` | The brief, diagnosis/baseline, and recorded tripwire breaches seed the successor's intake — the reason the mode escalated is the first risk entry. |

For `simplify` findings routed into `refactor` there is no source *workflow*: the finding
entry itself (id, files, rationale, severity) travels in the invocation text per
`refactor`'s Step 0 and seeds the brief directly.

## Link back

1. Record `origin-<source-type>: <source-slug>` in the new workflow's `00-index.md`
   frontmatter (`origin-investigate`, `origin-rca`, `origin-discover`, `origin-ideate`,
   `origin-brainstorm` — optional field; omit when there is no provenance).
2. When the source is a **decision-shaped** workflow whose decision this new workflow
   executes (`investigate` pick, `ideate` pick, `rca` route to a fix), update the source's
   `00-index.md`: set `superseded-by: <new-slug>`. Updating this one field on a closed
   index is additive and safe. A `discover` source is not superseded — its verdict stands
   on its own; the `origin-discover` key alone records the lineage. A `brainstorm`
   source, and an `ideate` source with a list, is never superseded. When the successor starts from a
   work packet file, record `origin-packet: <packet path>` and `origin-items` (every carried key) in `00-index.md`.
   Set `state: open` in the work packet file and on the work packet in the board file, and change no other field of
   the work packet file. The campaign walk sets `done` when the workflow completes (`campaign.md`, step 5).
   Set each thread of the work packet to `routed` when no other work packet draws on the thread. Updating those
   fields on an open board is additive; the board stays open until `/wf intake <slug> close`.
3. If a decision-shaped source is still **open** (the user routed without recording the
   pick/route), this IS the implicit decision: apply the source mode's decision-closure
   section (investigate `# Pick`, ideate `# Pick`, rca `# Route`) first, with
   `decision-note: implicit — routed via /wf intake <mode>`, then set
   `superseded-by: <new-slug>` in place of `pending`.
