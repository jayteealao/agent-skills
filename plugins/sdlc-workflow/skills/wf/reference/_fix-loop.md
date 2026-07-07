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
2. **User gate.** No stage silently auto-fixes. A human decision (triage answer,
   approval of a proposed CI fix) always precedes dispatch.
3. **Pinned dispatch.** One sub-agent per issue, with an explicit `model: sonnet`
   on every dispatch call. Rationale: read-finding-then-patch is the bounded
   profile Sonnet handles well; fix sub-agents must not silently inherit the parent session's (Opus) model. Stage-specific flags (e.g. verify's
   `isolation: worktree`) are additive requirements defined in the stage file.
4. **Minimal patch.** The sub-agent prompt always requires: apply the minimal
   fix for this one issue; do NOT refactor, reformat, or broaden scope;
   self-check the result (no new lint/type errors, surrounding code coherent)
   before returning a brief summary — never diffs or full file dumps.
5. **Orchestrator sanity check.** The orchestrator inspects each returned patch
   before accepting it (does it address the issue; does it obviously break
   sibling code). A wrong patch is discarded — never "improved" inline.
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
