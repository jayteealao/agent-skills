# Consult — the panel, the consensus line, and the embedded fragment (`consult/SKILL.md` Step 3)

Load this file from `SKILL.md` Step 3 after the runner returns.

1. **Panel.** For each `ok` result, present the provider, its **evidence scope**
   badge (`repo-aware` vs `prompt-only`), its one-line verdict, and 2–4 key
   points. Name every `skipped` provider with its reason. Name any provider whose
   `ok` is false with its error (don't hide failures).

1a. **A degraded panel must announce itself.** When fewer providers returned than
   were requested, **lead the panel with the degradation**, do not bury it in a
   trailing note:

   > **Panel of 1** — `<provider>` unavailable (auth): not logged in. Treat this as one
   > opinion, not a consensus.

   This matters because the whole value of a panel is independent judgment: a
   silently single-generator "panel" reads with the confidence of agreement it
   never earned. Every plan critique and pre-mortem on one host ran
   single-generator for weeks because the degradation surfaced, at best, as a
   residual note.

   Each failed result carries `errorKind` (`auth` | `sandbox` | `not-found` |
   `unknown`) and, for `auth`, a `remedy` — **print the remedy**. An `auth`
   failure is fixed by one command and will otherwise recur on every future
   consult on that host. Do not describe an `auth` failure as an environmental
   wall to plan around: it is a login, and the dispatcher now says which one.

2. **Consensus / divergence — weighted by evidence (the asymmetry caveat).** Add
   one line summarizing where the oracles agree and where they diverge. **A
   `prompt-only` oracle's "disagreement" may just be missing context, not real
   dissent** — weight `repo-aware` opinions more heavily on repo-specific claims,
   and say so when a divergence looks like an evidence artifact rather than a true
   difference of judgment.

3. **Embed (only when consulting ON an artifact).** If the question targets a
   workflow artifact `<stem>.md`, write the panel as a free narrative fragment
   next to it: `<stem>.NN-consult.html.fragment` (e.g.
   `04-plan.01-consult.html.fragment`). It is raw-inlined below the rendered page
   with `@scope` CSS containment (no contract, no sibling `.yaml`) — see
   [narrative-fragments.md](../../reference/narrative-fragments.md), and read
   [artifact-interop.md](../../reference/artifact-interop.md) before embedding an
   opinion into an `.ai/` artifact. Keep it self-contained — semantic HTML, one
   small scoped `<style>` if needed. For a standalone consult with no artifact
   target, skip the fragment.

`panel-size` is what makes a degraded run auditable after the fact: a reader
scanning recorded consults can see which critiques were actually panels and
which were one model with a panel's framing.
