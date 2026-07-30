# Investigate Decision-Lifecycle Plan — record the pick, forward the evidence

Status: **BUILT 2026-07-30 — shipped as v9.145.0, all waves W0–W6.** The three
PO proposals in §6 were accepted as written (30-day recency bound; implicit
pick closes with `decision-note: implicit`; discover stays slice-only). Built
exactly as planned except one addition: the intake dispatcher's investigate
row in `intake.md` was also updated (both trees), which the plan had not
listed as a touch point.
Origin: a holistic review of `/wf intake investigate` (2026-07-30). The verdict
of that review: the option set the command produces is good; the decision
around it is homeless. The `bed65dc0` restructure (two-wave sub-agents,
enumerate-then-select, status-quo baseline, constraint cross-check) fixed the
command's internal quality problems. The remaining gaps sit at the two edges:
what happens after the user picks, and what happens when the user cannot pick.
Related: [archived/INTAKE-SHAPE-HARDENING-PLAN.md](archived/INTAKE-SHAPE-HARDENING-PLAN.md) ·
[SINGLE-SOURCE-PLAN.md](SINGLE-SOURCE-PLAN.md) (interaction noted in §Risks).

---

## 1. Findings this plan answers

All findings were verified 2026-07-30 against the working tree at `203dfa4f`.

- **F1 — The handoff discards the investigation.** Section 5 of
  `skills/wf/reference/intake/investigate.md` routes the pick as a hand-typed
  one-liner (`/wf intake fix <option-label> — <one-line description>`).
  Neither `intake/fix.md` nor `intake/default.md` mentions investigate
  artifacts (grep-verified: zero matches). The downstream command receives one
  sentence and re-derives the architecture map, the tradeoff card, the named
  risks, and the `file:line` anchors that three sonnet sub-agents already
  produced. Contrast: `rca` writes a forwarding `02-shape.md`; investigate
  forwards nothing.
- **F2 — The workflow never closes and never records the decision.** Step 4
  writes `00-index.md` with `status: ready`, `current-stage: routing`; no step
  updates it. The slug stays open in `.ai/workflows/INDEX.md` forever: it
  pollutes `/wf status`, stays eligible for dispatcher slug-matching, and —
  the substantive loss — the chosen option and the reason for the choice are
  recorded nowhere. The command whose entire output is a pending decision
  keeps no record of the decision.
- **F3 — No experiment rung for a stalled pick.** Routing row 3 says "Stop and
  think… ask a human." A stalled pick usually hinges on one unverifiable
  assumption per option. The plugin already owns the right rungs — `discover`
  (yes/no truth question; slug-mode attaches it as a compressed slice on the
  investigate slug) and `study-sources` (API facts from real source) — and
  investigate points at neither.
- **F4 — User-constraint compliance is implicit.** Step 3 mandates a
  cross-check against *architectural* constraints; nothing verifies each card
  against the *user's* stated constraints from Step 1 question 3 ("no schema
  change", "no new dependency"). Selection "prefers" compliant options;
  no card states its compliance.
- **F5 — Index/artifact frontmatter disagree.** `01-investigate.md` carries
  `option-count`, `presented-count`, `option-ids` (all options);
  `00-index.md` carries `option-labels` for full cards only. Demoted options
  are invisible at the registry level.
- **F6 — Consult-ordering wording.** The auto-consult note fires "before
  Step 4 writes the index", but Step 3 has already written the artifact, so
  folding refutations in means editing a just-written file. Harmless in
  practice; the text should say so.

**Direction verdict (locked by the review): do not change direction.** The
sketcher identity — enumerate, characterize, refuse to pick — is correct.
This plan adds a decision lifecycle around the sketcher; it does not turn the
sketcher into a chooser.

## 2. Design principles

- **Convention over flags** (user-validated, standing preference): downstream
  linkage resolves from the `INDEX.md` registry and option labels, not from a
  new flag. An explicit `from <slug>` token exists as a disambiguator, not as
  the primary path.
- **Reuse existing machinery.** Closure uses the `close.md` field set
  (`status: closed`, `close-reason`, `superseded-by`, `closed-at`,
  `next-command: none`). The experiment rung uses existing intake slug-mode
  (compressed slices). No new commands, no new artifact types.
- **The pick is a decision record.** Chosen option, timestamp, optional
  one-line reason, and successor slug — stamped into the artifact and the
  index, in the spirit of the intent-fidelity decision taxonomy.

## 3. Waves

### W0 — Baseline (small)

Confirm the current state of `intake/investigate.md` in BOTH trees (Claude +
codex mirror; the codex intake files are CRLF — preserve). Run the test suite
once before touching anything. Several sessions edit this tree concurrently;
re-read before editing, stage explicitly by path.

### W1 — Pick closure (the core of F2)

Extend investigate **resume mode** (Step 0.1). Today resume mode says: if
`01-investigate.md` is complete, tell the user and stop. New behavior — if the
invocation carries a token after the slug that matches an option id or label
(`/wf intake investigate <slug> B` or `… <slug> "In-process LRU cache"`), that
is a **pick**:

1. Stamp `01-investigate.md` frontmatter: `chosen-option: <id> — <label>`,
   `chosen-at: <UTC timestamp>`, and `decision-note: <one line>` if the user
   supplied any trailing prose.
2. Append a short **Decision** section to the artifact body: which option, why
   (verbatim from the user if given, else "user picked without a stated
   reason"), and which tripwires were live at pick time.
3. Close the workflow with the `close.md` field set: `status: closed`,
   `close-reason: option-picked`, `superseded-by: pending`,
   `closed-at`, `next-command: none`. (`superseded-by` is corrected by W2
   when the successor workflow is created; updating one field on a closed
   index is additive and safe.)
4. Print the exact next invocation, carrying provenance:
   `/wf intake fix "<label> — <one-line mechanism>" from <investigate-slug>`
   (or `/wf intake …` for medium+, per the existing routing table).

If the pick token is ambiguous (matches two labels), ask one question. A pick
on an already-closed investigate workflow warns and stops (close.md
convention). No new mode keyword; this is resume-mode behavior, so the
dispatcher needs no change.

### W2 — Downstream consumption (F1)

Add a Step-0 **investigate-provenance check** to `intake/fix.md` and
`intake/default.md`:

1. **Detect.** Provenance is explicit (`from <investigate-slug>` trailing
   token) or inferred: scan `INDEX.md` for `workflow-type: investigate` rows
   (open or closed within a bounded recency) whose artifact's option labels
   exactly match a phrase in the description. Exact-label match only — a loose
   match asks the user one confirm question rather than silently attaching.
2. **Consume.** Read `01-investigate.md`. Seed the shape pass with the chosen
   option's card: mechanism, files-touched estimate, top risks (into the risk
   inventory), constraint collisions, and the relevant slice of the
   architecture map. The downstream command re-verifies against the current
   tree; it does not treat the card as gospel (the investigation may be
   stale).
3. **Link back.** Record `origin-investigate: <slug>` in the new workflow's
   `00-index.md`. Write `superseded-by: <new-slug>` into the investigate
   index. If the investigate workflow is still open (the user routed without
   an explicit pick), this IS the implicit pick: perform W1 steps 1–3 first,
   with `decision-note: implicit — routed via /wf intake <mode>`.

This makes the decision record automatic on both paths: explicit pick (W1) or
direct routing (W2).

### W3 — Decisive unknown + experiment rung (F3)

1. Sub-agent 3 (tradeoff characterizer) gains one per-option output field:
   `decisive_unknown: {assumption, cheapest_check}` — the one assumption
   that, if false, kills the option, and the cheapest way to verify it. "None"
   is a valid value and must be earned, not defaulted.
2. The option card template gains a **Decisive unknown** line rendering that
   field.
3. Routing row 3 ("not sure which option") is rewritten as an escalation
   ladder: (a) if the stall is a truth question about the system, run
   `/wf intake <investigate-slug> discover <the decisive unknown>` — it
   attaches the answer as a compressed slice on the same investigate slug;
   (b) if the stall is an API fact, invoke `study-sources` and note the
   finding in the artifact; (c) if the stall is a product/policy call, ask the
   human who owns it (the existing `problem-not-engineering` framing). "Ask a
   human" stops being the only rung and becomes the correctly-scoped last
   rung.
4. Note in Step 0 resume mode: a discover slice landing on an investigate
   slug re-opens nothing; it is drill-down on a still-open decision.

### W4 — User-constraint compliance per card (F4)

1. The option card gains **Honors stated constraints:** `yes` /
   `violates <constraint> — <one line>`.
2. Step 3's mandatory cross-check extends: verify every surviving option
   against the user constraints from Step 1 question 3, not only the
   architectural constraints. A violation goes into the card's top risks and
   biases the presentation-cap selection against the option (existing
   "preferring options that honor the user's constraints" language becomes
   checkable instead of vibes).
3. No new tripwire — a constraint-violating option is information, not an
   anomaly.

### W5 — Frontmatter reconciliation + wording (F5, F6)

1. `00-index.md` gains `option-count` and `presented-count` (mirroring the
   artifact) and splits labels: `option-labels` (full cards) +
   `demoted-labels` (presentation-cap demotions). Demoted options become
   visible at the registry level.
2. W1/W2 fields join the index schema notes: `chosen-option`,
   `origin-investigate`, `superseded-by` usage for investigate.
3. Consult note wording: state explicitly that fold-in edits the
   already-written Step 3 artifact before Step 4 writes the index.

### W6 — Mirror, docs, release

1. Port W1–W5 to the codex tree by hand (non-mechanical transforms; preserve
   CRLF on codex intake files; never bulk-copy).
2. Doc-site sweep: every page that describes investigate routing or the
   "user picks" terminus (the 2026-07-29 rebuild made all 23 pages
   hand-authored — grep for "investigate" and update in place). The routing
   story changes from "user picks, then hand-type the next command" to "user
   picks, the pick is recorded, the successor inherits the evidence".
3. STE compliance pass on every edited surface (review dimension 35).
4. Release per the standing rules: version bump in all locations (including
   the two codex manifests and `_shell.mjs` PLUGIN_VERSION), dist rebuild in
   the same commit if any script/lib is touched (expected: none — this plan
   is skill-md + docs only), `npm run sync:codex`, tests green, marketplace
   catalog bump, **push** (a release is not done until `origin/master`
   carries it).

## 4. Effort

Skill-md and docs only; no runtime code, no schema validators expected.
W1+W2 are the bulk (the two downstream files must be edited carefully — they
are long and other sessions touch them). Rough split: W0 ½h · W1 2h · W2 3h ·
W3 1½h · W4 1h · W5 1h · W6 3h (mirror + docs + release mechanics).
One release.

## 5. Risks and interactions

- **Registry-match false positives (W2).** Inference by option-label match
  can attach the wrong provenance. Mitigation is in the design: exact-label
  match only, one confirm question on anything looser, explicit `from <slug>`
  always wins.
- **SINGLE-SOURCE-PLAN interaction.** That plan (drafted, not built) will
  merge the two trees. This plan lands first and adds divergence to 3 intake
  files in both trees. Mitigation: write the new prose dialect-neutrally
  (no host-specific mechanics — none is needed here) so the later merge sees
  near-identical lines.
- **Concurrent sessions.** Standing risk in this tree. Stage explicitly by
  path; never `git add -A`; re-read files immediately before editing.
- **Closed-index field update (W1→W2 `superseded-by: pending` → real slug).**
  `close.md` treats closed workflows as resolved; verify no lint or hook
  rejects a post-close additive field edit before relying on it (check
  `intakeLedgerLint` and the two wired validation hooks).
- **Scope creep toward chooser.** W3's decisive unknown must stay
  characterization, not recommendation. The command still never picks.

## 6. Open questions (PO)

1. **Recency bound for W2 inference** — how old may an open/closed investigate
   workflow be and still auto-match? Proposal: 30 days; older requires the
   explicit `from <slug>` token.
2. **Implicit pick on direct routing (W2.3)** — acceptable to close the
   investigate workflow as a side effect of creating the successor, or should
   it warn and leave the close to the user? Proposal: close, with the
   `decision-note: implicit` marker; it is exactly the bookkeeping the user
   skipped.
3. **Should `discover`'s answer auto-update the option card** it was launched
   to disambiguate, or only sit as a slice? Proposal: slice only in this
   release; card write-back is a follow-up if it proves annoying.
