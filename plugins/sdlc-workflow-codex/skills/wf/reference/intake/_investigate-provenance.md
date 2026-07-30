# Investigate provenance — consume a prior option sketch

Shared contract for the standalone entry modes that can inherit a `$wf intake investigate`
decision (`intake/default.md`, `intake/fix.md`). Slug-mode runs skip this file entirely. The
point: `$wf intake investigate` spends three sub-agents building an architecture map and
tradeoff cards — when the user routes a chosen option here, that evidence must arrive with it,
not die in the investigate artifact.

## Detect

Provenance is explicit or inferred — explicit always wins:

1. **Explicit:** `$ARGUMENTS` ends with `from <investigate-slug>`. Strip those two tokens from
   the description before deriving the new slug. If the named slug does not resolve to a
   `workflow-type: investigate` workflow, WARN ("`<slug>` is not an investigate workflow —
   proceeding without investigation context") and continue without provenance.
2. **Inferred:** if `.ai/workflows/INDEX.md` exists, scan its `workflow-type: investigate` rows
   whose `updated-at` is within the last **30 days** (older investigations require the explicit
   `from <slug>` token). For each candidate, read the option labels from its
   `01-investigate.md`. Attach only on an **exact label match** — the description contains an
   option label verbatim (case-insensitive). A partial or fuzzy resemblance is NOT a match. If
   exactly one workflow matches, ask ONE confirmation question ("This description matches option
   `<id> — <label>` from investigate workflow `<slug>`. Use that investigation as context?") and
   attach on yes. If several match, ask which one (or none). Zero matches → proceed without
   provenance; that is the common case and costs nothing.

## Consume

With provenance attached, read `.ai/workflows/<investigate-slug>/01-investigate.md` and seed the
planning pass from the **chosen option's card** (the picked option, or the matched option when
the pick is implicit):

- The card's **mechanism** and **sketch** seed the restated request / shape direction.
- The **files-touched estimate** seeds research targeting. The research sub-agents re-verify
  against the current tree — the investigation may be stale; re-verify, do not copy.
- The **top risks**, **constraint collisions**, and **decisive unknown** seed the risk
  inventory / known unknowns.
- The relevant entries of the **architecture map** (artifact section 2) go into the research
  sub-agents' prompts as prior context.
- The user's **stated constraints** (artifact section 1) carry into this workflow's constraints.

## Link back

1. Record `origin-investigate: <investigate-slug>` in the new workflow's `00-index.md`
   frontmatter (optional field; omit when there is no provenance).
2. Update the investigate workflow's `00-index.md`: set `superseded-by: <new-slug>`. Updating
   this one field on a closed index is additive and safe.
3. If the investigate workflow is still **open** (the user routed without recording a pick),
   this IS the implicit pick: apply steps 1–3 of `investigate.md` → `# Pick — decision closure`
   first, with `decision-note: implicit — routed via $wf intake <mode>`, then set
   `superseded-by: <new-slug>` in place of `pending`.
