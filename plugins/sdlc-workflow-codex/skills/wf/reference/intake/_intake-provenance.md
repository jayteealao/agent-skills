# Intake provenance — consume a prior analysis workflow's evidence

Shared contract for every intake mode that can inherit evidence from a prior analysis
workflow. The terminal analysis modes (`investigate`, `rca`, `discover`, `ideate`) and the
research half of `update-deps` spend real sub-agent work building maps, diagnoses, verdicts,
and tradeoff cards — when the user routes the follow-on work here, that evidence must arrive
with it, not die in the source artifact. Slug-mode runs skip this file entirely.

## Detect

Provenance is explicit or inferred — explicit always wins:

1. **Explicit:** `$ARGUMENTS` ends with `from <source-slug>`. Strip those two tokens from
   the description before deriving the new slug. Resolve the named slug against
   `.ai/workflows/<source-slug>/00-index.md` and read its `workflow-type`. If the type has
   no row in the Consume table below, WARN ("`<slug>` has workflow-type `<type>` — no
   provenance contract for it; proceeding without inherited context") and continue.
2. **Inferred (labeled sources only):** inference applies only to `investigate` and
   `ideate` sources — they are the two whose artifacts carry machine-matchable labels.
   If `.ai/workflows/INDEX.md` exists, scan its `workflow-type: investigate` and
   `workflow-type: ideate` rows whose `updated-at` is within the last **30 days** (older
   sources require the explicit `from <slug>` token). For each candidate, read the option
   labels (investigate) or idea labels (ideate) from its lead artifact. Attach only on an
   **exact label match** — the description contains a label verbatim (case-insensitive).
   A partial or fuzzy resemblance is NOT a match. If exactly one workflow matches, ask ONE
   confirmation question ("This description matches `<id> — <label>` from `<type>` workflow
   `<slug>`. Use that analysis as context?") and attach on yes. If several match, ask which
   one (or none). Zero matches → proceed without provenance; that is the common case and
   costs nothing. All other source types (`rca`, `discover`, `update-deps`, an escalated
   change-mode) carry no label vocabulary — they attach only via the explicit token.

## Consume

With provenance attached, read the source's lead artifact and seed the new workflow from
the row that matches the source's `workflow-type`. In every row the rule is the same:
**re-verify, do not copy** — the source may be stale against the current tree; its evidence
targets the research, it does not replace it.

| Source `workflow-type` | Read | Seed |
|---|---|---|
| `investigate` | `01-investigate.md`, the **chosen option's card** (the picked option, or the matched option when the pick is implicit) | The card's mechanism + sketch seed the restated request / shape direction. The files-touched estimate targets research. Top risks, constraint collisions, and the decisive unknown seed the risk inventory / known unknowns. The relevant architecture-map entries (section 2) go into research sub-agent prompts as prior context. The user's stated constraints (section 1) carry into this workflow's constraints. |
| `rca` | `01-rca.md` | Section 4 (root cause) seeds the restated request — the fix targets the named mechanism, not the symptom. Section 6 (blast radius, same-pattern-elsewhere) seeds scope and the risk inventory. Section 5 (contributing factors) seeds known unknowns / follow-up scope decisions. Section 8 (verification) seeds the acceptance criteria verbatim — it was written to be them. |
| `discover` | `01-discover.md` | The verdict and its evidence seed the restated request's factual ground. The ranked counter-hypotheses seed the diagnosis candidates (they are literally candidate root causes when the successor is an rca). Recorded contradictions seed the risk inventory. |
| `ideate` | `01-ideate.md`, the **chosen idea's card** | The idea's description + `evidence:` (`file:line` anchors) seed the restated request and research targeting. The rationale that culled its sibling ideas seeds the out-of-scope list — what was considered and rejected, so the successor does not re-widen. |
| `update-deps` (a prior run) | The prior run's `02-shape.md` Hold tier + `05-implement.md` Blocked list | Hold/Blocked packages, their reasons, revisit conditions, and `changelog-source:` citations seed this run's research — re-check the revisit condition instead of cold-rescanning last month's findings. A citation is re-used only after confirming the target version is unchanged. |
| an **escalated change-mode** (`fix`/`hotfix`/`refactor`/`update-deps` closed with `close-reason: superseded`) | Its `01-<mode>.md` and `02-shape.md` | The brief, diagnosis/baseline, and recorded tripwire breaches seed the successor's intake — the reason the mode escalated is the first risk entry. |

For `simplify` findings routed into `refactor` there is no source *workflow*: the finding
entry itself (id, files, rationale, severity) travels in the invocation text per
`refactor`'s Step 0 and seeds the brief directly.

## Link back

1. Record `origin-<source-type>: <source-slug>` in the new workflow's `00-index.md`
   frontmatter (`origin-investigate`, `origin-rca`, `origin-discover`, `origin-ideate` —
   optional field; omit when there is no provenance).
2. When the source is a **decision-shaped** workflow whose decision this new workflow
   executes (`investigate` pick, `ideate` pick, `rca` route to a fix), update the source's
   `00-index.md`: set `superseded-by: <new-slug>`. Updating this one field on a closed
   index is additive and safe. A `discover` source is not superseded — its verdict stands
   on its own; the `origin-discover` key alone records the lineage.
3. If a decision-shaped source is still **open** (the user routed without recording the
   pick/route), this IS the implicit decision: apply the source mode's decision-closure
   section (investigate `# Pick`, ideate `# Pick`, rca `# Route`) first, with
   `decision-note: implicit — routed via $wf intake <mode>`, then set
   `superseded-by: <new-slug>` in place of `pending`.
