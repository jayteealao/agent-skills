# Shared STE-procedural contract (single source)

Controlled-language rules for procedural and external-facing text, distilled
from ASD-STE100 Issue 9 (Simplified Technical English, Part 1 writing rules)
and rewritten for this workflow's domain. STE rule numbers appear in
parentheses for traceability; the wording and examples here are original.

**Scope.** These rules apply to ALL text this workflow writes: every document
`/wf docs` or the diataxis skill writes, every section of every workflow
artifact — the story section and the structured sections alike — reader-visible
text in view fragments (both tiers), runbook and how-to steps, user-facing
product copy (labels, errors, empty states), external-facing outputs (release
notes, PR bodies, announcements), and the chat summary each stage returns.
Nothing is exempt. Each passage follows the sections that govern its kind of
text: section 1 (word discipline) everywhere; sections 2–3 wherever the text
gives steps, commands, or warnings; section 4 in story sections and chat
summaries, in addition to sections 1 and 3.

Citing sites reference the section they need, not the whole file.

## 1. Word discipline

- **W1 — One term per concept, everywhere.** (STE 1.11, 9.4) Pick one name for
  each item, action, and state, and never vary it for elegance. A reader who
  sees "the ledger", "the acks file", and "the readiness record" must not have
  to guess whether these are one thing or three.
  - Bad: step 2 says "run the build", step 5 says "regenerate the bundle"
    (same command).
  - Good: both steps say "run the build".
- **W2 — One meaning per term.** (STE 1.3, 9.2) Do not reuse a word in a
  second sense inside the same document. If "check" means a verification step
  in one sentence, do not also use it to mean a checkbox.
- **W3 — Verbs for actions, not nominalizations.** (STE 3.7) The action lives
  in the verb, not in an abstract noun.
  - Bad: "Perform the removal of the stale lock file."
  - Good: "Remove the stale lock file."
- **W4 — Prefer a single verb over a phrasal verb.** (STE 9.3) Phrasal verbs
  carry idiomatic second meanings that non-native readers and agents misread.
  Write "remove" not "take out", "continue" not "carry on", "distribute" not
  "hand out".
- **W5 — Write every word.** (STE 4.2, 4.5) No contractions ("do not", never
  "don't" in procedures), no telegraphic omissions of subjects, verbs, or
  articles.
  - Bad: "Feature flag to OFF." / "If present, delete the lock file."
  - Good: "Set the feature flag to OFF." / "If a lock file is present, delete
    it."
- **W6 — No Latin abbreviations.** (GR-6) Write "for example", "that is", "and
  so on" — not "e.g.", "i.e.", "etc."
- **W7 — Every pronoun has exactly one possible referent.** (GR-3, GR-4) If
  "it", "this", or "they" could point at two nouns, repeat the noun.
  - Bad: "If the hook rejects the payload, restart it." (The hook? The
    payload's producer?)
  - Good: "If the hook rejects the payload, restart the hub."
- **W8 — Concrete over abstract.** (STE 4.1) State the checkable condition or
  the specific quantity, not a general truth.
  - Bad: "No stale locks are permitted." / "Load changes the timeout."
  - Good: "Make sure that there are no stale locks." / "When load increases,
    increase the timeout to 30 seconds."

## 2. Instruction rules

- **I1 — Instructions are imperative.** (STE 5.3) "Run the tests", not "the
  tests should be run", "you will want to run the tests", or "the tests can
  be run". Non-imperative phrasing leaves the reader unsure whether the step
  is required, already done, or someone else's job.
- **I2 — One instruction per sentence.** (STE 5.2) Combine two actions only
  when they genuinely happen together ("Hold the flag file open and read the
  version"). Sequential actions get sequential numbered steps.
- **I3 — Sentence caps: 20 words procedural, 25 descriptive.** (STE 5.1, 6.3)
  Over the cap, split the sentence — do not compress by deleting words (that
  violates W5).
- **I4 — Condition first, then command, separated by a comma.** (STE 5.4) The
  reader must know the condition before reading the action.
  - Bad: "Delete the worktree when CI is green."
  - Good: "When CI is green, delete the worktree."
- **I5 — Active voice.** (STE 3.6) In procedures, always. In descriptions,
  passive is permitted only when the agent is genuinely unknown ("at some point
  the cache entry was evicted" — nothing in view did it).
- **I6 — Simple tenses only.** (STE 3.2, 3.4) Simple present, simple past,
  simple future. No perfect tenses, no stacked auxiliaries ("the config is to
  be updated" → "update the config").
- **I7 — Use vertical lists for sequences and enumerations.** (STE 4.3) Three
  or more items or actions in one sentence become a list. Never mix
  instructions and description in the same list. In prohibitions, repeat the
  negation on every item ("Do not edit X. Do not delete Y."), so no item can
  be read as permitted.
- **I8 — Notes inform; they never instruct.** (STE 5.5) A NOTE contains
  information only — no imperative, no requirement, no limit. If the reader
  cannot complete the procedure correctly with every note deleted, the
  misplaced content moves into a numbered step. Self-test: read the procedure
  without its notes and confirm it still works.
- **I9 — A limit or expected result follows its action, in the same step.**
  (STE 5.5) Never in a note, never in a later step.
  - Good: "Run the health check. The response time must be under 200 ms."

## 3. Warnings and document structure

- **S1 — Grade the risk and say the grade first.** (STE 7.1) Use a level word
  before the text: WARNING-class for unrecoverable outcomes (data loss,
  irreversible external effects), CAUTION-class for recoverable damage. When
  both risks exist, use the higher grade.
- **S2 — The warning comes before the step it protects, and starts with the
  command or condition.** (STE 7.2) A caveat after the destructive step has
  already failed its reader.
- **S3 — Every warning explains the consequence.** (STE 7.3) A reader who
  knows why is more careful than one who only knows what.
  - Bad: "CAUTION: do not run `git add -A`."
  - Good: "CAUTION: do not run `git add -A`. It stages parallel sessions'
    uncommitted work into your commit."
- **S4 — Descriptive text: one topic per paragraph, topic sentence first,
  at most six sentences, information given gradually.** (STE 6.1–6.6) Each
  sentence adds one increment; repeat the key words that carry the thread
  rather than eleganting them into synonyms (see W1).
- **S5 — Identical operations get identical wording.** (STE 9.4) If four
  runbook steps install a component, all four use the same sentence pattern.
  Variation signals a difference; where there is no difference, do not
  signal one.

## 4. Story sections and chat summaries (the arc)

This section is the workflow's own extension — it has no ASD-STE100 source.
Every substantive artifact opens with one prose section, immediately under the
frontmatter and before any structured section. The chat summary each stage
returns opens with the same prose, compressed. The renderer lifts this section
to the top of the rendered page, so the heading pattern in A1 is load-bearing.
The prose reports a trajectory, not a status: where the work came from, the
road it took, and where it goes next.

- **A1 — The heading is `## The <Subcommand>`, title-cased.**

  | Subcommand | Heading | Subcommand | Heading |
  |---|---|---|---|
  | intake | `## The Intake` | ship | `## The Ship` |
  | shape | `## The Shape` | retro | `## The Retro` |
  | slice (master) | `## The Slices` | instrument | `## The Instrumentation` |
  | slice (per-slice) | `## The Slice` | experiment | `## The Experiment` |
  | plan | `## The Plan` | benchmark | `## The Benchmark` |
  | implement | `## The Implementation` | profile | `## The Profile` |
  | verify | `## The Verification` | design | `## The Design` |
  | review | `## The Review` | probe | `## The Probe` |
  | handoff | `## The Handoff` | simplify | `## The Triage` |

  Intake modes inherit the mode noun: `## The Fix`, `## The RCA`,
  `## The Investigation`, `## The Discovery`, `## The Hotfix`,
  `## The Refactor`, `## The Dependency Update`, `## The Ideation`,
  `## The Adoption`. The drivers `auto` and `yolo` write no artifact of their
  own; their final chat summary follows A6.
- **A2 — Three beats, in this order, every time.**
  1. **Origin.** The state this stage inherited: what the previous stage
     handed over, or the problem that started the work.
  2. **Road.** The load-bearing decisions, in the order they were made, each
     with its reason. Include the decisive counts.
  3. **Destination.** What this stage enables next, and the top open risk in
     concrete terms.
- **A3 — One to three short paragraphs.** One paragraph per beat when the
  material warrants it. A small change compresses all three beats into one
  paragraph, in the same order. S4 governs each paragraph; sections 1 and 3
  govern the language; the 25-word descriptive cap (I3) applies.
- **A4 — Self-sufficient.** A reader who reads only this section knows what
  was produced, the load-bearing decisions and counts, and the top risk. The
  structured sections beneath it are drill-down, never a prerequisite.
- **A5 — Never restate the heading.** Do not open with "This <stage>
  implements…" or any sentence that repeats the heading. The origin beat opens
  the section, so the first sentence names the inherited state or the problem.
- **A6 — Chat-summary form.** Two to five sentences, no bullets, no field
  labels, the same three beats in the same order. The receipt fields
  (`Deltas:`, `Artifacts:`, `Next:`) sit beneath it.
