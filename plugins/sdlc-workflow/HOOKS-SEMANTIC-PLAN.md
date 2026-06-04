# Semantic Hooks (Prompt + Agent) — Implementation Plan

## Summary

Every hook the plugin ships today is a deterministic Node script. They are the
plugin's **syntax floor**: filename conventions, YAML frontmatter shape, Ajv
schema validation, `git add`, HTML render. They cannot read *meaning* — a
commit message that leaks `.ai/workflows/...`, an artifact whose body never
answers the stage contract, an index whose `current-stage` lies about what is
on disk all pass today's hooks untouched.

Claude Code now supports two hook backends beyond `type: "command"`:

1. **Prompt hooks** (`type: "prompt"`) — an LLM judges the *tool call itself*
   (`$TOOL_INPUT`, `$USER_PROMPT`, `$TOOL_RESULT`, `$REASON`) and returns a
   decision. Cheap, fast (~30s budget), no file access.
2. **Agent hooks** — a sub-agent runs with tools, so it can `Read` the
   `.ai/workflows/<slug>/` artifacts and run `git diff` before deciding.
   Heavier, but the only option for cross-file judgments.

This plan adds a **semantic layer on top of** — never in place of — the
deterministic hooks. The deterministic hooks stay as the cheap, always-on
syntax gate; the semantic hooks add the judgment the plugin currently enforces
only through SKILL.md prose the model must remember to obey.

The headline win: the **External Output Boundary**
([skills/wf/SKILL.md:8-13](skills/wf/SKILL.md)) — today a MANDATORY *instruction* —
becomes an enforced wall. Plus 19 more gates across leak prevention, stage
ordering, artifact content quality, review rigor, and cross-document
consistency.

Companion to [HOOKS-NODE-AND-SERVE-PLAN.md](HOOKS-NODE-AND-SERVE-PLAN.md)
(which landed the Node hook toolchain this builds on) and
[QUALITY-GATES-PLAN.md](QUALITY-GATES-PLAN.md).

---

## Mechanics (confirmed against the hook-development reference)

| Property | Prompt hook | Agent hook |
|---|---|---|
| Backend | `type: "prompt"` | sub-agent invocation |
| Events | PreToolUse, UserPromptSubmit, Stop, SubagentStop (PostToolUse in examples) | same event surface |
| Inputs | interpolated `$TOOL_INPUT`, `$USER_PROMPT`, `$TOOL_RESULT`, `$REASON` | full tool access — reads artifacts, runs `git diff` |
| Decision (PreToolUse) | `hookSpecificOutput.permissionDecision: allow\|deny\|ask` + `systemMessage` | same |
| Decision (Stop/SubagentStop) | `decision: approve\|block` + `reason` + `systemMessage` | same |
| Decision (PostToolUse/UserPromptSubmit) | `systemMessage` injected into context | same |
| Budget | ~30s default | longer; counts as a sub-agent turn |
| Cost | one fast model call | a full agent run |

**Rule of thumb that drives the whole catalog below:** if the judgment needs
*only the tool input or the user prompt*, it is a **prompt** hook. If it needs
to *read artifacts on disk or the diff*, it is an **agent** hook.

---

## Current state (baseline)

Seven Node hooks are wired in [hooks/hooks.json](hooks/hooks.json). Every one
is deterministic:

| Hook | Event · matcher | What it enforces | What it is blind to |
|---|---|---|---|
| [session-start-orient.mjs](hooks/session-start-orient.mjs) | SessionStart | Lists active workflows; warns once on wrong branch (l.74-82) | Whether the index it reads still matches disk |
| [pre-compact-preserve.mjs](hooks/pre-compact-preserve.mjs) | PreCompact | Emits state-preservation instructions | Whether that state is still accurate |
| [pre-write-validate.mjs](hooks/pre-write-validate.mjs) | PreToolUse · Write | Filename convention + frontmatter shape (schema/type/slug) | Whether the body fulfills the stage contract |
| [post-write-auto-stage.mjs](hooks/post-write-auto-stage.mjs) | PostToolUse · Write\|Edit\|… | `git add` the artifact | — |
| [post-write-verify.mjs](hooks/post-write-verify.mjs) | PostToolUse · Write\|Edit\|… | Ajv deep-validate against `frontmatter.schema.json` | Anything below the YAML fence |
| [post-write-render.mjs](hooks/post-write-render.mjs) | PostToolUse · Write\|Edit\|… | Render HTML view | — |
| [render-on-artifact-write.mjs](hooks/render-on-artifact-write.mjs) | PostToolUse | Background render | — |

**The gap in one sentence:** the plugin can prove an artifact is *well-formed*
but never that it is *correct, in-order, honest, or leak-free*. Those are the
five semantic dimensions the catalog below covers.

These deterministic hooks already gate on `config.hooks.{autoStage,
validateOnWrite, verifyOnWrite}` ([lib/config.mjs:43-47](lib/config.mjs)). The
semantic hooks get a parallel gate (§ Config gate).

---

## Design principles

1. **Additive, not replacing.** Deterministic hooks run first as the cheap
   syntax floor. A semantic hook never re-checks what a Node hook already
   proved (no duplicate frontmatter parsing) — it judges only what the Node
   hook can't.
2. **Fail-open.** Every existing hook exits 0 on its own error
   (`main().catch(... process.exit(0))`). Semantic hooks inherit this: an LLM
   timeout or malformed decision must `allow`/`approve`, never block work on
   infrastructure failure.
3. **Opt-in by default.** Unlike the syntax hooks (default-on), semantic hooks
   carry latency and token cost, so they default **off** and the user opts in
   per-hook via `.ai/sdlc-config.json`. (Contrast: serve/hub flipped to
   default-on in v9.34.0 *because* they're free at rest.)
4. **Latency-budgeted.** PreToolUse semantic hooks sit in the user's critical
   path. Keep prompt hooks lean; reserve agent hooks for Stop/SubagentStop
   (off the keystroke path) or for genuinely high-value PreToolUse gates
   (commit leak-check, handoff blocker).
5. **The hooks themselves honor the External Output Boundary.** A leak-check
   hook's `systemMessage` must not itself echo internal paths into any
   surface that could leak. Decision reasons name the *category* of leak and
   the offending token, scoped to chat.
6. **Advisory-first rollout.** New gates ship as `ask`/`systemMessage`
   (advisory) before any graduate to `deny`/`block`, mirroring the
   "Step 0.5 is purely advisory — it never auto-corrects" stance in
   [skills/wf/SKILL.md:69](skills/wf/SKILL.md).

---

## The catalog — 20 semantic hooks

Grouped into five themes. **Type** = prompt (P) or agent (A). **Reads** = what
the hook must inspect: `input` (tool args / prompt only — cheap), `artifact`
(must read `.ai/workflows/…`), `diff` (must run git).

### Theme 1 — Leak prevention (External Output Boundary, enforced)

The plugin's single largest "instruction the model must remember" becomes a
wall. All three judge whether internal vocabulary (`.ai/workflows/...` paths,
stage names/numbers, `/wf*` command names, slugs, sub-agent/task names) is
about to cross into an external-facing surface.

| # | Hook (event · type) | Reads | What it judges → decision | User-facing benefit |
|---|---|---|---|---|
| 1 | PreToolUse · Bash · **P** | input | `git commit -m`, `gh pr create`, `git push` args contain an internal token → **deny** with the leaked token | Public git history / PRs never expose workflow internals |
| 2 | PreToolUse · Write\|Edit · **P** | input | Writes to paths **outside** `.ai/` (README, CHANGELOG, code comments) contain internal vocabulary → **ask** | Docs read like product copy, not SDLC jargon |
| 3 | PreToolUse · Bash · **P** | input | Ship-time `gh release`/tag: changelog text still in stage vocabulary (`instrument`, `benchmark`) → **deny** | Release notes ship in user language |

*Why deterministic can't:* "is this token an internal reference in this
context" is a natural-language judgment — a regex blocklist either misses
paraphrases or false-positives on legitimate prose.

### Theme 2 — Stage-gate ordering & honesty

| # | Hook (event · type) | Reads | What it judges → decision | User-facing benefit |
|---|---|---|---|---|
| 4 | PreToolUse · Skill · **A** | artifact | `/wf ship` invoked while `00-index` shows handoff incomplete → **deny**, name the prerequisite | Stages can't be run out of order; instant, cheap gate independent of the model re-reading files |
| 5 | PreToolUse · Skill (`/wf handoff`) · **A** | artifact | Any slice's `07-review-<slice>.md` `## Fix Status` has unresolved blockers → **deny** with slice + finding | Operationalizes handoff's "refuses on unresolved blockers" as a guardrail, not a hope |
| 6 | Stop · **P** | input | Turn ends claiming `convergence: converged` / `stage-status: complete` while failing test output is in context → **block** | "Converged" never lies |

*Why deterministic can't:* ordering and "is this claim backed by the evidence
in context" require reading both the artifact state and the conversation.

### Theme 3 — Artifact content quality (below the YAML fence)

`post-write-verify.mjs` proves the frontmatter is schema-valid. These prove the
*body* earns its frontmatter.

| # | Hook (event · type) | Reads | What it judges → decision | User-facing benefit |
|---|---|---|---|---|
| 7 | PostToolUse · Write · **A** | artifact | After writing shape/slice/plan, body fulfills the stage contract (intake has AC; shape answered the 20 PO questions; plan has the reuse scan) → **systemMessage** | Half-baked artifacts flagged at write time, not at handoff |
| 8 | PreToolUse · Write (`03-slice`) · **P** | input | Proposed slices are independently shippable vs. horizontal layers → **ask** | A bad decomposition is caught before four plans build on it |
| 9 | PostToolUse · Write (`po-answers.md`) · **P** | input | PO prose log leaves shape questions ambiguous/unanswered → **systemMessage** | The frontmatter-exempt prose log (v9.34.2 carve-out) finally gets inspected; gaps caught before slicing inherits them |
| 10 | UserPromptSubmit · **P** | input | `/wf intake <one-liner>` lacks user/outcome/constraint → inject a nudge naming the missing dimensions | Fewer PO question round-trips; intake starts richer |

*Why deterministic can't:* "did this prose answer the question / is this slice
vertical" is irreducibly semantic.

### Theme 4 — Implement-phase guardrails

| # | Hook (event · type) | Reads | What it judges → decision | User-facing benefit |
|---|---|---|---|---|
| 11 | PreToolUse · Write\|Edit · **A** | artifact | Target path is far outside the active slice's declared `files-touched` → **ask** | Enforces the "surgical changes" principle live, not in review |
| 12 | SubagentStop · **A** | diff | Implement sub-agent finished; an acceptance criterion has no corresponding change in the diff → **block** | No slice silently ships missing an AC |
| 13 | PreToolUse · Bash (`git commit`) · **A** | artifact | Commit on a branch ≠ the workflow's `branch` in `00-index` → **deny** | Enforces branch correctness *at commit time* (session-start only warns once at startup) |
| 14 | PreToolUse · Bash · **A** | artifact+diff | `git reset --hard` / `checkout -- .` / branch delete while a workflow has uncommitted slice work → **ask**, name what's lost | Destructive git ops can't quietly wipe in-flight work |

### Theme 5 — Review rigor & cross-document consistency

| # | Hook (event · type) | Reads | What it judges → decision | User-facing benefit |
|---|---|---|---|---|
| 15 | SubagentStop · **P** | input | A review sub-agent returns a verdict with no `file:line` evidence → **block** | Anti-rubber-stamp; operationalizes IDEAS-3's "stub detection / metronome" |
| 16 | Stop · **P** | input | Verify's single-round fix loop ended with a triaged "Fix" that has no recorded re-run → **block** | The user-gated fix loop actually closes |
| 17 | Stop · **A** | artifact | `00-index` `progress`/`current-stage`/`recommended-next-invocation` ≠ which artifacts exist on disk → **systemMessage** | Protects the orientation + PreCompact machinery that *reads this frontmatter* from misdirecting after compaction |
| 18 | PostToolUse · Write (`00-index`) · **P** | input | `recommended-next-invocation` isn't the real in-order next stage given progress → **systemMessage** | "Next" never points at ship when only slice is done |
| 19 | SessionStart / UserPromptSubmit · **A** | hub | Summarize the multi-repo hub cross-repo inbox into one actionable line | The v9.33 multi-repo feature becomes legible, not a raw dump |
| 20 | Stop · **A** | artifact | After `10-retro.md`, surface any learning durable enough to become a memory/rule and prompt to capture it | Lessons compound instead of evaporating (IDEAS-3 "knowledge compounding") |

---

## Prompt vs. agent split (the cost map)

| | Prompt (cheap, input-only) | Agent (reads artifacts/diff) |
|---|---|---|
| **IDs** | 1, 2, 3, 6, 8, 9, 10, 15, 16, 18 | 4, 5, 7, 11, 12, 13, 14, 17, 19, 20 |
| **Count** | 10 | 10 |
| **Where they fire** | mostly PreToolUse/Stop on input | Stop/SubagentStop, plus high-value PreToolUse gates |
| **Latency posture** | safe on the keystroke path | keep off the keystroke path except #4/#5/#13 |

---

## Config gate

Extend [lib/config.mjs](lib/config.mjs) `DEFAULT_SDLC_CONFIG.hooks` with a
`semantic` block (default **off**, opt-in), and admit it in
[schemas/sdlc-config.schema.json](schemas/sdlc-config.schema.json):

```jsonc
"hooks": {
  "autoStage": true,
  "validateOnWrite": true,
  "verifyOnWrite": true,
  "semantic": {
    "enabled": false,            // master switch — off by default
    "mode": "advisory",          // "advisory" (ask/systemMessage) | "enforce" (deny/block)
    "leakCheck": true,           // #1-3   — recommended first opt-in
    "stageGates": true,          // #4-6
    "contentQuality": false,     // #7-10
    "implementGuards": false,    // #11-14
    "reviewConsistency": false   // #15-20
  }
}
```

Each semantic hook reads its group flag *and* `semantic.enabled`, then early-
returns `allow`/`approve` if off — identical to how the existing hooks early-
return on `validateOnWrite === false`.

---

## Phased rollout

### Phase 0 — Foundation (no new gate yet)

Shared scaffolding all semantic hooks consume.

Files to create:
```
plugins/sdlc-workflow/lib/
├── semantic-config.mjs    # read config.hooks.semantic, resolve group flag + mode
├── leak-lexicon.mjs       # canonical internal-vocabulary categories the prompt cites
└── active-slice.mjs       # resolve active slug+slice+files-touched from 00-index (for #11-13)
plugins/sdlc-workflow/hooks/
└── semantic/              # one file per hook, mirroring the deterministic hook layout
```

- `semantic-config.mjs` mirrors the `config.hooks.*` early-return pattern.
- Decide prompt-template storage: inline `prompt` string in `hooks.json` vs.
  a sidecar `.md` the wrapper reads (the latter keeps long prompts reviewable
  and diff-able — recommended).
- **Exit criteria:** config block lands + schema admits it + foundation unit
  tests; zero behavior change with `semantic.enabled: false`.

### Phase 1 — Leak prevention (#1-3)

The flagship. Three prompt hooks, `leakCheck` group, ship in `advisory` mode
first.

- Wire #1/#3 under the `PreToolUse` Bash matcher; #2 under `Write|Edit`.
- **Exit criteria:** golden test set of leaking vs. clean commit messages / PR
  bodies / changelog lines; false-positive rate measured on a corpus of real
  commits from this repo; graduate to `enforce` only after FP rate is
  acceptable.

### Phase 2 — Stage gates (#4-6)

Two agent hooks (#4, #5) + one prompt hook (#6). Highest correctness value:
they prevent out-of-order and dishonest stage transitions.

- #4/#5 need `PreToolUse` on the Skill tool — confirm the matcher can target
  `/wf` skill invocations (open question below).
- **Exit criteria:** fixture workflows in each pre/post state; deny fires only
  when prerequisite genuinely unmet.

### Phase 3 — Content quality (#7-10)

One agent hook (#7) + three prompt hooks. All advisory (`systemMessage`/`ask`)
— never block on a subjective quality judgment.

- #9 is notable: `po-answers.md` is exempt from *every* deterministic check
  (the v9.34.1→9.34.2 carve-out), so this is the first inspection it ever gets.
- **Exit criteria:** content critic catches a deliberately gutted artifact
  fixture; no false block on a terse-but-complete one.

### Phase 4 — Guards + consistency + hub/retro (#11-20)

The long tail. Mostly Stop/SubagentStop agent hooks (off the keystroke path) +
#13 (commit-time branch gate) and #19 (hub inbox).

- #17 (index↔disk consistency) is load-bearing — both
  [session-start-orient.mjs](hooks/session-start-orient.mjs) and
  [pre-compact-preserve.mjs](hooks/pre-compact-preserve.mjs) trust this
  frontmatter; landing #17 protects everything downstream of compaction.
- #19 depends on the v9.33 hub/registry surface — confirm headless/cron runs
  expose the inbox.
- **Exit criteria:** each hook has a fixture; Stop-hook latency stays within
  budget when several fire together.

---

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| **Latency on the keystroke path** | Only #4/#5/#13 are agent hooks on PreToolUse; everything heavier moves to Stop/SubagentStop. Prompt hooks stay lean. |
| **False positives blocking real work** | Advisory-first (`ask`/`systemMessage`) → graduate to `deny`/`block` only after measured FP rate. Master switch + per-group flags + per-repo opt-out. |
| **Fail-closed on LLM error** | Inherit the existing `catch → exit(0)` contract: any timeout/malformed decision resolves to allow. |
| **The leak-check hook leaking** | Decision `systemMessage` names the *category* + offending token, scoped to chat; never echoes full internal paths into git-bound surfaces. |
| **Duplicating deterministic checks** | Semantic hooks never re-parse frontmatter; they run *after* the Node syntax floor and judge only what it can't. |
| **Token cost** | Default-off; `leakCheck` recommended as the single highest-value first opt-in. Prompt hooks (10 of 20) are one fast-model call each. |
| **Skill-tool matcher support** | Verify PreToolUse can match Skill invocations before committing #4/#5 to that surface; fall back to a Stop-hook post-check if not. |

---

## Open questions

1. **Skill-tool PreToolUse matching** — can a `PreToolUse` matcher target a
   specific skill invocation (`/wf ship`) reliably, or do #4/#5 need to be
   Stop-hook post-checks instead?
2. **Prompt storage** — inline in `hooks.json` vs. sidecar `.md` files read by
   a thin command wrapper. Sidecar is more reviewable but adds a file read.
3. **PostToolUse prompt-hook support** — the reference lists the canonical
   four events (PreToolUse, UserPromptSubmit, Stop, SubagentStop) but shows
   PostToolUse prompt examples; confirm before relying on #7/#9/#18 as
   PostToolUse (fallback: fold them into a Stop-hook sweep).
4. **Advisory→enforce graduation criteria** — what FP rate per group flips
   `mode: advisory` → `enforce`? Needs a measurement harness on this repo's
   own commit/artifact history.
5. **Interaction with `disable-model-invocation`** — the `/wf` router sets it
   ([skills/wf/SKILL.md:4](skills/wf/SKILL.md)); confirm semantic hooks fire
   normally for skill-dispatched work.
