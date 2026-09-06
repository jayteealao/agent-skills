# Discover research charters (Step 2 of `intake/discover.md`)

Step 2 of `/wf intake discover` dispatches the three sub-agents below simultaneously. Every dispatch is read-only.

**Effort tier for every dispatched agent:** **low** (per [_subagents.md](../../_subagents.md)) — each agent does targeted code reading + structured-output extraction (FOR / AGAINST / counter-hypotheses), the bounded-rubric profile the low tier handles cleanly. **Exception:** when Step 1 question 3 says a large decision rides on the verdict (a major refactor, an architecture choice, a plan's premise), raise the tier to **medium** — "dig harder" is a judgment instruction, and the tier must match it. State the chosen tier on every dispatch.

Each sub-agent receives the same two inputs: the exact hypothesis from Step 1 and the starting area from Step 1 question 2. Every returned item cites `file:line` with a snippet of 5 lines or fewer.

### research sub-agent 1 — Evidence FOR

Charter: build the strongest possible case that the hypothesis holds — read implementations, follow call chains, and find tests that pin the claimed behavior. Do not search for contradicting evidence; that is sub-agent 2's job. Return structured text with four keys: `direct_support`, `indirect_support`, `tests_that_pin_the_behavior`, and a one-paragraph `strength_assessment`. Label each item direct (the code enacts the claim) or indirect (consistent but not proof).

### research sub-agent 2 — Evidence AGAINST

Charter: falsify the hypothesis — search for contradicting code, bypass paths, runtime flags and branches the claim ignores, and recent git history that invalidated it. Return structured text with four keys: `direct_contradictions`, `partial_contradictions`, `historical_drift_signals` (cite a commit sha or `file:line`), and a one-paragraph `strength_assessment`. For each item, state precisely why it contradicts the claim ("this function does X instead").

### research sub-agent 3 — Counter-hypotheses

Charter: propose 1 to 3 alternative explanations that fit the same observable behavior, ranked by plausibility — not "the claim is wrong" (sub-agent 2's job) but "what is happening instead". Return structured text with two keys: `alternative_hypotheses` (each entry: statement, supporting `file:line` evidence, how it differs observably from the original, plausibility high|medium|low) and boolean `no_alternatives_found`. When no plausible alternative exists, set `no_alternatives_found: true` — that absence is itself a signal the hypothesis is likely correct.
