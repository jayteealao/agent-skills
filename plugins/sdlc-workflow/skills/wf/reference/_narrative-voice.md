# Narrative voice — the story section every workflow artifact opens with

Every artifact this plugin writes opens with one prose section that **tells the story of what just happened**. This file is the single source of truth for that section: what it is, the voice it's written in, and a gallery of worked examples. Stage references point here instead of re-describing the rule — when this file changes, every stage inherits it.

## The principle

1. **It comes first.** The story section is the **first body section**, immediately under the frontmatter, before any structured section.
2. **It is named after the stage** — `## The <Subcommand>` (`## The Plan`, `## The Implementation`, `## The Review`, …). The mapping table is below.
3. **It is self-sufficient.** A reader who reads *only* this section understands what was produced, the load-bearing decisions and counts, and the top risk. The structured sections beneath it are drill-down — never a prerequisite for understanding.
4. **It is prose, not a form.** No bullet lists, no field labels, no heading-restatement. One to four short paragraphs.

The structured sections that follow *should stay terse and technical* — a files-touched table has no business telling a story, and the story has no business being a table. Separating the two jobs is the whole point: the reader gets a narrative they enjoy **and** scannable reference data, instead of a compromise that's bad at both.

## The voice — Sebastian Raschka

We write these in the voice of [Sebastian Raschka](https://magazine.sebastianraschka.com/)'s technical essays. It is warm, precise, and pedagogical — a senior engineer explaining a decision to a colleague they respect. The calibration signatures, each anchored to a real line of his:

- **Relevance first, mechanism second.** He opens by saying what this is and why you'd care — *"This article describes the four main approaches to building reasoning models…"* — never by diving into the how. This is the direct antidote to the banned `"This plan implements…"` opening.
- **Why before how.** He establishes the problem before walking through the procedure (with InstructGPT, *the harm* before the three training steps). Our stories name the *why* of a decision before its mechanics.
- **Punch-then-elaborate rhythm.** A short declarative lands after a longer technical sentence: *"Surprisingly, this approach was enough for the LLM to develop basic reasoning skills."* Vary sentence length; earn the short one.
- **Tradeoffs stated plainly, never buried.** *"more expensive… more verbose… sometimes more prone to errors due to 'overthinking.'"* He volunteers the downside. So do we — the deliberate shortcut, the unverified path, the risk — in plain words.
- **A concrete detail or analogy when it illuminates.** *"A rough analogy is how humans tend to generate better responses when given more time to think…"* One specific, biting detail beats three vague adjectives.
- **Collegial address; em-dash asides; precision intact.** He mixes *I / we / you*, signals who the content is for without condescension, and uses em-dashes for rhythm — *"taken the public attention by storm – no pun intended."* Plain phrasing wraps exact technical claims; he never dumbs down, he clarifies.

Source essays for calibration: [Understanding Reasoning LLMs](https://magazine.sebastianraschka.com/p/understanding-reasoning-llms), [Understanding Large Language Models](https://magazine.sebastianraschka.com/p/understanding-large-language-models).

## The craft levers (how to actually land it)

- **A thesis.** The writer has a take — *"wrong silently is the worst way for money code to fail"* — and the facts arrange themselves around it. A story without a point of view is a status report.
- **Causality over enumeration.** Connect facts with *because / but / so*, not *and… and… and*. The conflict between facts is the story.
- **One concrete detail that bites.** "Berlin at California rates," not "incorrect tax." The specific number, the named case.
- **Stakes you can feel.** What breaks if this is wrong, in human terms.
- **Respect the reader's time.** Enjoyable is not padded — engineers hate padding more than dryness. Every sentence earns its place.

## Banned tells (these read as dead-on-arrival)

- `"This PR / slice / plan / change implements…"` and any opening that restates the section heading.
- Passive voice as the default register ("was implemented", "is handled").
- The monotone march — every sentence the same medium length.
- Adjective-stacking and hype ("robust, scalable, elegant solution").
- Field-label prose ("Summary: …. Approach: …. Risk: …") — that's a form wearing a paragraph's clothes.

## Length

One to four short paragraphs. A trivial change earns one; a thorny slice earns four. Past four, you are writing the structured sections — stop, and let them do their job below.

## Section name per stage

The heading is `## The <Subcommand>`, title-cased:

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

Intake modes inherit the mode noun: `## The Fix`, `## The RCA`, `## The Investigation`, `## The Discovery`, `## The Hotfix`, `## The Refactor`, `## The Dependency Update`, `## The Ideation`. The drivers `auto` and `yolo` write no artifact of their own, so they have no story section — but their final chat summary uses this voice.

## Exemplar gallery

Each pair is the same facts written twice. The "before" is what the old contract produced; the "after" is what this file asks for. Study the *difference*, don't ape the template.

### The Plan

> **Before** — This plan implements the checkout-total slice. It touches 14 files across 5 modules. Per the build-avoidance ladder, it uses the native `<input type="date">` rather than a date-picker library. Tax surcharge calculation moves server-side. The primary risk is that region detection may resolve the wrong region, which would affect tax calculation. This is revision 3, updated after the cart-service refactor.

> **After** — The goal for this slice is the checkout total, and the first useful thing we found is that we don't need a date-picker library at all. Modern browsers ship `<input type="date">` — it handles the calendar, locale formatting, and keyboard entry that three candidate libraries wanted ~40kb to reproduce. That's rung 2 of the build-avoidance ladder, prefer the platform over a dependency, and it's the easy decision.
>
> The hard one is region detection. This round moves tax-surcharge calculation server-side, which is correct, but it sharpens a risk that was already there: if region detection resolves the wrong region, the surcharge is computed against the wrong tax table. Nothing crashes. The total is simply wrong — and wrong *quietly*, which for money code is the worst failure mode, because no error ever surfaces to tell anyone. So most of the 14 files here are the straightforward date swap; the handful that aren't, plus all three risk callouts, exist to make region detection fail loudly instead of silently.
>
> One caveat worth stating plainly: this is revision 3. The cart-service refactor landed after the first plan was written and moved several files we depend on, so the file list and integration points were re-derived against the current tree — not the one we started from.

### The Implementation

> **Before** — This slice implements the checkout total. 14 files changed (9 added, 5 modified). The native date input was used and tax surcharge was moved server-side. Region detection was hardened. All tests pass.

> **After** — The build came in close to the plan, with one deliberate shortcut worth flagging up front. The date input and the server-side surcharge move went in as designed — no surprises, about nine of the fourteen files. Region detection is where the time actually went: it now checks the resolved region against the active tax-table set and refuses to compute a surcharge it can't justify, so the Berlin-at-California-rates failure can't happen silently anymore.
>
> The shortcut: the region lookup is hard-coded for the four launch markets rather than loaded from config. It's marked with an `sdlc-debt:` note at the call site and recorded under Anything Deferred — enough for launch, but the fifth market will need the config path before it ships.

### The Verification

> **Before** — Verification ran lint, typecheck, unit and integration tests, and interactive checks. All passed except one. Convergence: converged after one fix round.

> **After** — Everything a user can see works, and the one thing we couldn't prove is the part worth your attention. The automated suite passed clean — lint, types, 212 unit tests, the checkout integration set. Driving the real checkout in a browser, the surcharge shows the right number for all four launch regions, and the empty-cart and rapid-resubmit cases that usually break payment flows held up fine.
>
> The gap is Berlin. Its region path depends on a geo-IP service we can't reach from this environment, so that one region's surcharge was verified against a mocked locale rather than the live service. It's recorded as a deferral — it won't block review, but it should be re-driven once against the real service before ship.

### The Review

> **Before** — Reviewed across 5 dimensions. 8 findings: 1 blocker, 2 high, 5 medium. The blocker was fixed. Verdict: ship after fixes.

> **After** — One finding genuinely scared us, and it's fixed; the rest are the ordinary texture of a payment change. The scare was a rounding bug in the surcharge — under one specific currency-conversion order it could overcharge by a cent, which on money code becomes a support ticket and a trust problem rather than a rounding footnote. Fixed, with a regression test that pins the order of operations.
>
> Of the remaining seven, two deserve a second look before ship — both about how we log the region decision, which is exactly what you'd want when debugging the Berlin deferral. The other five are style and can ride along. Verdict: ship once the two logging notes are addressed.

### The Shape

> **Before** — This shape defines the scope of the checkout-total work. In scope: surcharge calculation, region detection, and the date input. Out of scope: refund flows and multi-currency display. The main constraint is that tax tables are region-specific. Acceptance: the surcharge is correct for all four launch regions.

> **After** — What we're really deciding here is where the checkout-total work *stops* — because the feature touches money, and money invites scope creep. Surcharge calculation, region detection, and the date input are in; refund flows and multi-currency display are explicitly out. Not because they don't matter, but because each one roughly doubles the tax-table surface we'd have to get right, and we would rather ship four correct regions than eight shaky ones. The single constraint everything else bends around: tax tables are region-specific, so "which region is this?" becomes the question the whole feature leans on. Acceptance is deliberately narrow — the surcharge is correct for the four launch regions, and nothing past that line is promised.

### The Handoff

> **Before** — This handoff prepares the checkout-total slice for review. Suggested PR title: "Add checkout total with regional surcharge." 14 files changed, branch ready. Reviewers should focus on region detection.

> **After** — If you read one thing before reviewing this PR, make it the region-detection path — that's where the risk lives and where a second pair of eyes actually pays for itself. The rest is what it looks like: a date-input swap and a server-side surcharge move, fourteen files, mechanical and well-tested. Region detection is the part that decides which tax table a customer hits, so the questions worth asking are about its failure behavior, not its happy path. The branch is clean and rebased; the one open thread is the Berlin geo-IP deferral, flagged in the PR body so nobody rediscovers it in production.

### The Retro

> **Before** — This retro reviews the checkout-total work. Went well: the native date input saved time. Could improve: region detection took longer than estimated. Lesson: budget more time for geo-IP work.

> **After** — The one lesson worth carrying into the next money feature: we estimated the visible work and under-estimated the invisible work — and it was the invisible work that hurt. Swapping in the native date input went exactly as planned and shed a dependency; a clean win we'd repeat. Region detection was the opposite. The code was small, but the geo-IP integration, the per-region tax-table validation, and the one environment we couldn't reach from CI ate about twice the time we'd budgeted. Nothing here was a disaster — the slice shipped. But "how hard is the code" turned out to be the wrong question; "how hard is everything *around* the code" would have sized this honestly.

<!-- ROLLOUT NOTE: the gallery covers the seven stages with the most distinct narrative shapes — front scope (shape), the build trio (plan / implement / verify), judgment (review), and the terminal pair (handoff / retro). The stages not shown — intake, slice, ship, the augmentations (instrument / experiment / benchmark / profile), the intake modes, and design audit/critique — share the same voice; calibrate them against the nearest pair above (an intake mode against The Shape, a benchmark against The Verification, ship against The Handoff). Keep every example grounded in one consistent domain so the voice — not the facts — is what a reader compares. -->
