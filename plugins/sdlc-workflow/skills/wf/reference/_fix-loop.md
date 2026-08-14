# Shared fix-loop invariants (single source)

Three surfaces dispatch fix sub-agents: `verify.md` (Step 7.6, single-round
user-gated loop), `review.md` (Step 4c, ledger-recorded dispatch), and handoff's
PR/CI machinery (`_pr-ci-handoff.md` — CI-red and comment-triage fixes). Their
triggers, triage protocols, round semantics, and prompt templates are
stage-specific and live in those files. The rules below are the invariants every
fix dispatch shares — they are stated **only here**; the stage references cite
this file instead of restating them.

1. **Orchestrator discipline.** The stage orchestrator never patches code
   inline. Every fix is delegated to a dispatched sub-agent; only the
   sub-agent's compact result returns to the orchestrator context. If you catch
   yourself editing code outside the stage's fix-dispatch step, STOP and return
   to the next unfinished workflow step.
2. **User gate, with a mechanical carve-out.** A human decision (triage answer,
   approval of a proposed CI fix) precedes dispatch for any finding that is
   scope-changing, behavior-changing, or unclassified. A finding whose class is
   **reversible, in-worktree, and mechanical** — `lint`, `format`,
   `marker-syntax` — dispatches without a human decision; the stage reports
   what was auto-fixed, with diffs, in its round summary. Nothing auto-fixed is
   ever silent.
3. **Pinned dispatch.** One sub-agent per issue, with an explicit `model: sonnet`
   on every dispatch call. Rationale: read-finding-then-patch is the bounded
   profile Sonnet handles well; fix sub-agents must not silently inherit the parent session's (Opus) model. Stage-specific flags (e.g. verify's
   `isolation: worktree`) are additive requirements defined in the stage file.
4. **Minimal patch, self-checked by command.** The sub-agent prompt always
   requires: apply the minimal fix for this one issue; do NOT refactor,
   reformat, or broaden scope; then **run a real check command the
   orchestrator passes in** and report its exit status before returning a
   brief summary — never diffs or full file dumps. "Self-check for no new
   lint/type errors" as prose is unenforceable and was satisfied by a fix
   agent that introduced a lint violation and pushed it; the stage passes the
   narrowest gate the fix's file type implies (or its configured pre-push
   check) so the claim has a exit code behind it.
5. **Orchestrator sanity check — issue AND method.** The orchestrator inspects
   each returned patch against **both** the issue (does it address it; does it
   obviously break sibling code) and the **method the proposed fix
   prescribed**. A diagnosis names *how*, not only *what*, and a patch that
   reaches the right file by the forbidden route is not a fix — it is the next
   round's bug. Every fix sub-agent therefore **leads** its return with
   `Method: as-prescribed | deviated` (a deviation disclosed in a trailing
   note is a deviation that gets missed). `Method: deviated` is **never
   auto-accepted**: surface it to the user with the diagnosis's own words
   alongside, before any push. When the diagnosis carried an explicit
   prohibition ("do not hand-add…", "regenerate, don't patch"), a deviation
   touching that prohibition is a **hard stop**, not a judgment call. A wrong
   patch is discarded — never "improved" inline.
6. **`COULD NOT FIX` stays visible.** A fix the sub-agent could not land is
   recorded with its reason and remains open in the stage's artifact/ledger; it
   never silently disappears, and it feeds the stage's escalation state
   (`convergence: escalated`, `could-not-fix`, `readiness-verdict: blocked`).
7. **Commit discipline.** When fixes landed and `branch-strategy` is
   `dedicated`/`shared`: stage ONLY the files the fix sub-agents touched and
   commit with the stage's `fix(<slug>): …` message template. Never push from
   the fix loop (handoff's orchestrator batch-push is the sanctioned exception,
   defined in `_pr-ci-handoff.md`). When `branch-strategy: none`, skip the
   commit — the fixes remain in the working tree.
