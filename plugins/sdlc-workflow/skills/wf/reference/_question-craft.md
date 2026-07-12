# Shared question-craft contract (single source)

Every PO-facing question in this workflow — the intake batches, the shape and
slice interviews, the plan discovery rounds, and any ad-hoc structured decision —
is answered by a product owner who may be non-technical, or technical but new to
this codebase. A question is well-formed only if someone who cannot read the
code can still pick an answer confidently. Citing sites contribute their own
topics and round structure; this file owns how each question is written.

**Per-question requirements:**

1. **Frame the decision in outcome terms first.** Open with one or two
   plain-language sentences: what is being decided, why it surfaced now, and
   what the choice affects (delivery time, risk, cost, user experience, future
   flexibility). The technical mechanism comes second, never first.
2. **Name jargon AND translate it.** Keep the precise technical term — the
   artifact needs it — but attach a short gloss (≤10 words) on first use:
   *"extend the existing repository layer (the code that already talks to the
   database)"*. Never simplify by dropping the term, and never assume the term
   carries meaning on its own.
3. **Options state consequences, not just mechanisms.** Each option's
   description says what choosing it means in outcome terms — effort, risk,
   maintenance burden, what becomes easier or harder later — not merely the
   name of the approach. Two options whose descriptions differ only in jargon
   are one option; go find the real tradeoff.
4. **State reversibility.** Say whether the choice is cheap to change later or
   hard to unwind. Hard-to-reverse choices are flagged as such in the question
   framing, not buried in an option description.
5. **Recommend when a recommendation exists.** Put the recommended option
   first, mark it "(Recommended)", and give the reason in one clause.
   Impartiality (each interview's own rule) means presenting genuinely
   different directions — it does not mean withholding judgment the PO would
   want.
6. **Give an "if unsure" escape.** Make clear which option is safe for a PO
   who cannot evaluate the tradeoff (usually the recommended one), and that
   picking "Other" to ask for a deeper explanation is always a valid answer —
   answering a question about the question costs one round, guessing wrong
   costs a rebuild.
7. **Intent-bearing decisions state the runtime consequence, not the design
   label (INTENT-FIDELITY W10.2).** For any decision that classes as
   intent-bearing per [_decision-classes.md](_decision-classes.md) — one that
   assigns *control authority* or reframes what the product fundamentally *is* —
   each option MUST say, in one sentence, what the user or learner **experiences
   differently at runtime**, not the name of the architecture behind it:
   *"the model never decides what to ask next; a fixed 5-stage script asks the
   same questions in the same order every time"* — NOT *"state-machine-driven
   interview"*. The design label is exactly where the narrowing hides; naming
   the lived consequence is what lets a non-technical PO catch it before it
   ships.

**Scope of authority — a PO answer decides only the question it was asked (INTENT-FIDELITY W2.1).**
When an answer forecloses an *approach* (kills a vendor, a library, a budget), the *requirement*
that approach served does NOT silently degrade into being dropped. The stage MUST either (a) show
the requirement is still met another way, or (b) ask the PO a follow-up question about the
requirement itself. A vendor answer ("no Neon; only Cloudflare backends") does not authorise a
requirement change ("no sync in v1") — that is a second decision the PO never made. When recording
an answer to `po-answers.md`, append an explicit `scope:` line stating what it decides and what it
does NOT: *"scope: chooses the sync-backend vendor; does NOT decide whether v1 syncs."* Shape's
Intake Fidelity table and the intent-fidelity review dimension both read that scope line to catch
an over-read narrowing.

**Litmus test** — before sending a round, reread each question as someone who
has never opened this repository: could they choose without asking a follow-up?
If not, rewrite the framing. The fix is more context, not a simpler decision.

**Where the words go (AskUserQuestion):** the `question` field carries the
plain-language framing (it can be 2–3 sentences); option `label`s stay short;
option `description`s carry the consequence text and glosses. When a round
needs more setup than the fields comfortably hold, put a 1–2 line lead-in in
chat before the tool call saying what the round decides and why it matters.
Freeform chat questions follow the same six requirements in prose.
