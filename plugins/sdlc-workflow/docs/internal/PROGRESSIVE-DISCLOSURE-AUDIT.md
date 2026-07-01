# Progressive-Disclosure Audit — `/wf` skill

**Date:** 2026-07-01
**Scope:** `plugins/sdlc-workflow/skills/wf/` (SKILL.md + 59 reference files), with parity spot-checks against the Codex mirror.
**Method:** mechanical scans (heading/pointer/link/orphan/duplication greps + block-hash drift detection) plus structural reading of the router and the largest leaves. Line numbers cite `skills/wf/reference/<file>` unless noted.

---

## Verdict

`/wf` is a **strong** progressive-disclosure system with a few localized regressions. The architecture is sound: ~15,100 lines of reference material exist, but a typical single dispatch loads only ~100–1,100 of them. The failures are not architectural — they are all one failure repeated: **the top-level stage references and `SKILL.md` do not follow the single-source discipline that the `design/` and `intake/` subtrees already model.** Nothing here is on fire; the fixes are cleanups that also close one genuine (if low-severity) correctness rot in a `MANDATORY` safety block.

---

## The tier map

| Tier | Content | Loaded when | Notes |
|---|---|---|---|
| **0** | `SKILL.md` frontmatter `description` (92 words) + `disable-model-invocation: true` | listing only; not model-triggered | reference files' own frontmatter is *not* a skill surface — it's read as content |
| **1** | `SKILL.md` router body (108 lines) | any `/wf` call | dispatch table + slug-resolution |
| **2** | `reference/<key>.md` stage bodies (120–897 lines) | only the one dispatched | 19 keys |
| **2.5** | Sub-dispatchers `intake.md` (196), `design.md` (298) + `_*-context.md` | only on those keys | two-hop dispatch |
| **3** | `reference/{intake,design}/<leaf>.md` | only the resolved mode/command | 8 intake modes, 21 design commands |
| **shared** | `_design-context`, `_intake-context`, `_compressed-slice`, `_narrative-voice`, `_fragment-authoring`, `_component-craft`, plugin-root `reference/narrative-fragments.md` | pulled by pointer, on demand | the single-source layer |

**Worst-case single dispatch** is a driver (`design craft`, `auto`, `yolo`): the dispatcher then loads `slice`→`plan`→`implement`→`verify` in sequence. That is inherent to a driver and acceptable — each stage still loads only when reached.

---

## What is done well (the exemplars)

These patterns are the reference standard the rest of the skill should be measured against:

1. **`design/` leaves carry zero boilerplate.** `design/animate.md`, `craft.md`, etc. contain no External Output Boundary block and no "load shared context" preamble. They assume `design.md` already loaded `_design-context.md` before dispatching. This is disclosure done right: the leaf holds only what is unique to the leaf.
2. **`_narrative-voice.md` is single-sourced by pointer, cited by 27 files, inlined by none.** Every citation is a link (`[_narrative-voice.md](_narrative-voice.md)` or `../_narrative-voice.md` from subdirs) resolving to the one canonical file. This is the model the boundary block should copy.
3. **Big leaves dispatch outward instead of inlining sub-tiers.** `review.md` (897 lines) does **not** inline the 33 dimension rubrics — it points to `${CLAUDE_PLUGIN_ROOT}/skills/review/reference/<name>.md` (line 207, 334). `verify.md` cites `runtime-adapters.md` (5×) rather than inlining adapter detail. The rubrics/adapters are a genuine on-demand tier.
4. **Two-hop dispatch keeps the router thin.** `intake` and `design` are themselves dispatchers, so `SKILL.md` never enumerates 8 modes × flow-spans or 21 design commands. Router stays at 108 lines.
5. **`${CLAUDE_PLUGIN_ROOT}` pointers all resolve.** Zero broken absolute pointers across SKILL.md + all references. The plugin correctly uses two `reference/` roots (`skills/wf/reference/` and plugin-root `reference/` for `narrative-fragments.md`); both resolve.
6. **Codex-mirror parity is intact by design.** Reference trees differ by exactly one file — `yolo.md` — which is the intentional Claude-only exclusion (Workflow-tool-based; `sync:codex` skips `skills/`). No structural drift.

---

## Findings (prioritized)

### F1 — The External Output Boundary block is copy-pasted 21× and has drifted into 4 versions *(the one real bug)*

The `# External Output Boundary (MANDATORY)` block is inlined verbatim in **21 files** (`grep -rln "^# External Output Boundary (MANDATORY)"`). Hashing the block across all 21:

- **18 are byte-identical.**
- **3 have diverged:** `ship.md`, `simplify.md`, `_intake-context.md`.

The divergence is in the *enumerated allowlist* of internal path prefixes:

- `ship.md` adds `.ai/ship-plan.md`
- `simplify.md` adds `.ai/simplify/...`
- `_intake-context.md` adds `.ai/ideation/...`, `.ai/simplify/...`

**Why this is a bug, not just a smell:** the block enumerates the very paths it must prevent leaking. The 18 "canonical" copies are now **stale** — when `plan.md` or `review.md` loads, its boundary lists `.ai/dep-updates/` but omits `.ai/simplify/` and `.ai/ideation/`. A `MANDATORY` leak-prevention rule is under-specifying the paths it exists to catch, and the specialization proves the enumerated list **cannot** stay complete under copy-paste.

**Compounding redundancy:** `SKILL.md` is always in context when a Tier-2 reference loads, and `SKILL.md` already carries the full block. So every `/wf` dispatch carries the block **≥2×** (SKILL + reference); `/wf intake` (default) carries it **3×** (SKILL + `_intake-context.md` + `default.md`).

**Steelman considered:** (a) repeating a safety rule can be deliberate reinforcement; (b) spawned sub-agents get fresh contexts without `SKILL.md`. Both are real but neither justifies *four drifting versions of an enumerated list* — sub-agents are driven by stage-authored spawn prompts, not by loading the reference wholesale, so the reference-level copy protects the main thread, which already has the block.

**Fix:** extract to one `reference/_output-boundary.md`; replace the 21 inlines with a by-name citation (exactly what `intake/fix.md` already does: *"Load `_intake-context.md` … Do not restate them here."*). **Generalize the rule from an enumerated list to a predicate** — "any path under `.ai/**`, plus stage names, slash-command names, sub-agent names, control-file metadata, reasoning traces" — so it is complete-by-construction and cannot rot when a new `.ai/` subdir appears.

### F2 — No single convention is applied (the meta-finding)

Three conventions coexist for the same job — getting shared context into a leaf:

- **`design/` leaves:** inline nothing, rely on the dispatcher *(best)*.
- **`intake/` leaves:** reference shared context by name, "do not restate" *(good)*.
- **Top-level stage refs + `SKILL.md`:** inline the full block *(the rotting path — F1)*.

Progressive disclosure is not just "have tiers" — it is applying *one* rule for where each fact lives. The correct convention already exists in-repo; it simply has not been propagated to the 20 top-level references. **F1 and F2 are the same fix**: adopt the design/intake convention everywhere.

### F3 — The chat-summary contract is split across 13 places with overlapping framing rules

`SKILL.md` Step 2 defines the uniform "Emit Final Summary" contract. **12 references** *also* carry a `# Chat return contract` section (`handoff, implement, plan, retro, review, shape, ship, slice, simplify, verify, intake/default, intake/ideate`).

This is **partly legitimate and partly duplicated**:

- *Legitimate/local:* the per-stage **receipt fields** (`plan.md` lists `slug / wrote / options`; `verify` differs) genuinely belong in the leaf.
- *Duplicated:* the **framing rules** — "lead with substance then receipt", "narrative in the story voice → `_narrative-voice.md`", the "return ONLY means receipt fields, not a waiver of the substance summary" caveat — are restated per file and already owned by `SKILL.md` Step 2 (which explicitly reconciles the conflict at line 108).

Lower severity than F1: no `MANDATORY` safety content, and `SKILL.md` is aware of and compensates for the per-reference sections. But the invariant framing could be single-sourced (e.g., `reference/_chat-return.md`) with leaves contributing only their receipt-field list.

### F4 — Large leaves bundle conditional machinery that loads 100% every time

This is the **defining characteristic** of `/wf`'s disclosure model and its main improvement lever. The skill enforces **binary per-tier disclosure**: "load in full" (26×), "do not summarize/paraphrase/skip" (31×), "verbatim" (42×). Once a reference is selected it is loaded entirely; there is no partial read. That is a deliberate fidelity mechanism — but it makes **reference size the primary disclosure cost**, and several leaves bundle spans that are only conditionally relevant:

| Leaf | Conditional span | Approx lines | Fires only when |
|---|---|---|---|
| `handoff.md` (703) | CI-watch + PR-comment-triage + fix-subagent contract (377–573) | ~196 | a GitHub PR with CI/bots exists |
| `verify.md` (804) | verify-owned fix loop (469–570) | ~101 | a check/AC fails |
| `review.md` (897) | review-owned fix loop + triage (491–598) | ~107 | findings need a decision/fix |

A local-branch handoff with no remote loads all ~196 lines of GitHub CI/bot machinery and uses none. Note `handoff.md` even self-labels these as shared blocks (*"# CI watch procedure (shared by T5.0 and T5.3)"*, *"# Fix-subagent contract (shared by 7a CI-red and 7b triage)"*) — shared *within* the file.

**Tension to respect:** splitting too aggressively reintroduces the skip-risk that "verbatim" defends against. So the recommendation is narrow — extract only the **externally-conditioned** machinery (GitHub CI/bot handling in `handoff`, which is *already* gated by `00-index.md` project config), not the always-applicable gates.

### F5 — The three fix-loops are structurally duplicated with no shared reference

`verify.md`, `review.md`, and `handoff.md` each independently implement a *snapshot → triage → dispatch fix sub-agent → re-check → commit* loop (~100–200 lines each; fix-dispatch mentions: verify 19, review 25, handoff 8). **No shared `reference/_fix-loop.md` exists.** The trigger differs per stage, but the sub-agent spawn contract and commit discipline are the same shape repeated three times — a distributed-duplication cousin of F1. Candidate for a shared `_fix-loop.md` that each stage parameterizes (inputs, re-check scope, commit message), consumed by pointer.

### F6 — Minor observations (leave-as-is unless touching the file anyway)

- **Narrative-fragment blockquote inlined 3×** (`SKILL.md`, `design.md`, `implement.md`), each pointing at the same canonical `narrative-fragments.md`. Could be one-line pointers. Low stakes.
- **`SKILL.md` states the stage roster 3× in the always-loaded tier** — frontmatter `description`, opening prose paragraph (line 15), and the dispatch table. The table is load-bearing; one prose restatement could compress to a table pointer.
- **`SKILL.md` Step 0.5 (~22 lines of Levenshtein slug-suggestion)** is always loaded but fires only on a slug miss. Candidate to demote to `reference/_slug-resolution.md`. *Lean: leave it* — it must run pre-dispatch and is self-contained.
- **`profile.md` is the only reference with 0 inbound cross-references** — reachable solely via SKILL.md's `<key>.md` template dispatch. Not an orphan bug; just the most-isolated key (a standalone tool writing `.ai/profiles/`, in no flow).

---

## Recommendations (in priority order)

1. **F1 + F2 together — the high-payoff change.** Extract `reference/_output-boundary.md`, rewrite the rule as a `.ai/**` predicate (not an enumerated list), replace all 21 inlines with a by-name citation matching `intake/fix.md`. Kills the drift, makes the leak rule complete-by-construction, trims every dispatch, and establishes the one convention F2 asks for. Reference-`.md`-only → no `dist` rebuild, but **both trees** (`sdlc-workflow` + `sdlc-workflow-codex`) and a `sync:codex` pass; verify parity.
2. **F5 — shared `_fix-loop.md`.** Extract the common snapshot→dispatch→re-check→commit contract; have `verify`/`review`/`handoff` cite it and supply only their trigger + re-check scope. Removes ~200 lines of triplicated prose and a real drift surface.
3. **F4 — hoist `handoff`'s GitHub CI/bot machinery** into `reference/_pr-ci-handoff.md`, loaded only when the PR/CI path is active (it is already config-gated). Shrinks the always-loaded portion of the most-bundled stage without weakening the always-applicable gates.
4. **F3 — single-source the chat-return framing** into `reference/_chat-return.md`; leaves keep only their receipt-field list.
5. **F6 — opportunistic.** Fold when already editing the file; not worth a dedicated pass.

## The through-line

The repo already contains its own answer. `design/` leaves + `_narrative-voice.md` show the target state — leaves hold only what is unique, invariants live once and are cited. Every finding above is a place where an older top-level file predates that discipline. The work is not inventing a pattern; it is propagating the one the plugin already proved.

**Deeper lesson worth keeping:** duplicated instructions are a *correctness* hazard, not merely a token cost — the boundary block's rot was invisible until all 21 copies were diffed; nothing errored, the stale copies just silently under-specified a `MANDATORY` rule. And **enumerated allowlists are the anti-pattern inside the anti-pattern**: even single-sourced, "list every internal path prefix" drifts from reality as `.ai/` grows. A predicate is both shorter and self-maintaining — the disclosure win and the correctness win point the same way.
