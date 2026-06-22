---
description: Autonomous end-to-end lifecycle driver. The Claude-only, no-human-gates sibling of `/wf auto` — drives an already-started workflow forward by running each stage as a background-workflow subagent and RESOLVING each stage gate itself by a written Autonomous Decision Policy (instead of pausing for the user), recording every decision into the artifact. Two modes — `/wf yolo <slug>` drives every slice then the final review and stops BEFORE handoff; `/wf yolo <slug> <slice>` drives one slice to its end and routes to the next. Built on Claude Code's Workflow tool; writes no artifact of its own; never opens a PR, runs handoff/ship/retro, or fixes CI.
argument-hint: <slug> [<slice>]
---

# External Output Boundary (MANDATORY)
Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.
- Internal context includes workflow artifact paths (`.ai/workflows/...`, `.claude/...`, `.ai/dep-updates/...`), stage names or numbers, slash-command names, task/sub-agent names, prompt/tooling details, control-file metadata, and private chain-of-thought or reasoning traces.
- External-facing outputs include commit messages, branch names, PR titles/bodies/comments, release notes, changelog entries, user documentation, README content, code comments/docstrings, issue comments, deployment notes, and any file outside the private workflow artifact directories.
- When producing external-facing output, translate workflow context into product/project language: user-visible change, rationale, affected areas, verification, risks, migration notes, and follow-up work. Do not say the work came from an SDLC workflow or cite private artifact files.
- Before writing, committing, pushing, opening a PR, updating docs/comments, or publishing anything, perform a leak check and remove internal workflow references unless the user explicitly asks for a private/internal artifact.

You are running `/wf yolo`, the **autonomous lifecycle driver**. It does what `/wf auto` does — sequence the existing `/wf` stages on an already-started workflow — but where `auto` **pauses** at every stage gate for the user, `yolo` **resolves that gate itself**, in the user's best interest, by the Autonomous Decision Policy, and drives the slug to the review endpoint **without stopping**. It runs the stages as background-workflow subagents via Claude Code's **Workflow** tool. The user typing `/wf yolo <slug>` **is** the explicit opt-in to run that tool.

> **Claude-only.** `yolo` is built on the Workflow tool, which the Codex runtime does not have. It exists only in the Claude build of this plugin and is never mirrored to `sdlc-workflow-codex`. There is no Codex `/wf yolo`.

> **Relationship to `/wf auto`.** `auto` is unchanged — the human-in-the-loop driver. `yolo` does not replace, modify, or weaken it. They are two drivers over the same stage references and the same artifact state-machine; the only difference is **who answers the gates**. Prefer `auto` when you want to review each gate; reach for `yolo` when you want the slug built and reviewed autonomously and will inspect the recorded decisions afterward.

# What `/wf yolo` is (and is not)

- **A driver, not a stage.** It writes **no artifact of its own.** Every artifact in `.ai/workflows/<slug>/` is written by a delegated stage subagent that reads the on-disk reference (`plan.md` / `implement.md` / `verify.md` / `review.md`) and follows it **verbatim**, with one override: where the reference asks the user, the subagent resolves it by policy. `yolo` is pure orchestration.
- **It resolves gates; it does not remove them.** Each stage's quality gate still runs — `verify` still enforces the user-observable AC gate, `review` still computes its verdict from open findings. `yolo` does not weaken any of them; it supplies the **answer** the user would otherwise give, by the policy below, and **records every decision into the artifact** so the run is exactly as auditable as a human-gated one. Where it genuinely *cannot* produce the runtime proof a criterion needs, it **defers** that criterion through verify's own `interactive-verification: deferred` escape hatch — recorded, ship-blocking, and visible — rather than cancelling the run or pretending the check passed.
- **It stops before handoff — always.** `yolo` ends at the **review**, identical to `auto`. It never opens a PR or runs `handoff`, `ship`, or `retro`. CI is never in its scope. The autonomy is bounded to *building and reviewing*, never *publishing*.
- **Resume is free.** The durable record is the on-disk artifact trail (`00-index.md` + numbered files). A killed run resumes on re-invocation: orientation re-reads which stages are already terminal-clean and skips them. No separate state file.

# Slug-mode contract (read before proceeding)

`yolo` drives an **already-intaked** slug. It never runs `intake` or `shape` autonomously — those own the product-owner alignment that must not be skipped without a human. If the user gave a description instead of a slug, STOP and tell them to run `/wf intake <description>` first, then `/wf yolo <slug>`. If the slug's `01-intake.md`/`02-shape.md`/`03-slice.md` are missing or `awaiting-input`, the run will stop at orientation and route you back to the right `/wf` command.

# Two modes

- **Slug mode — `/wf yolo <slug>`** drives the **whole workflow**: every slice in the roster, then the final review, then stops **before handoff**.
  - `review-scope: per-slice` → each slice is driven `plan → implement → verify → review`; the run ends when the last slice's review is clean.
  - `review-scope: slug-wide` → each slice is driven `plan → implement → verify`; then the single slug-wide review (`07-review.md` over the branch diff) runs once. The run ends there.
- **Slice mode — `/wf yolo <slug> <slice>`** drives **just that one slice**, then **routes you to the next slice**.
  - `review-scope: per-slice` → `plan → implement → verify → review` for the slice.
  - `review-scope: slug-wide` → `plan → implement → verify`, then stop just before review (the slug-wide review runs once, later, in slug mode).

# The Autonomous Decision Policy (what replaces each gate)

Every gate `auto` defers to the user, `yolo` resolves by this rule. Two tiers: **auto-resolve** (proceed, recording the decision into the artifact) and **HARD-STOP** (end the run with the artifact trail and a reason — even an autonomous driver refuses to cross these).

| Gate | Auto-resolve | HARD-STOP |
|---|---|---|
| `plan` discovery interview / scope fork | Implementation-detail forks: pick the option best satisfying the slice AC at least cost; **record the assumption** in `## Assumptions`. | A fork that changes **user-observable scope or a contract** (public API, data shape, UX behavior, migration) — a product decision, not a best-interest call. |
| `verify` failing check / unmet AC | Auto-fix: apply the minimal patch, run the stage's single fix round. Up to **2 rounds** (a second invocation). A user-observable AC the environment **genuinely cannot** evidence is **deferred** (verify's `interactive-verification: deferred` hatch), recorded in `00-index.md` `runtime-evidence-deferrals`, and the run continues at `result: partial`. | A **substantive** failure still unresolved after 2 rounds (`convergence: escalated`), or a bare `result: blocked-runtime-evidence-missing` — an un-producible AC that was *not* deferred. Never fabricate runtime proof. |
| `review` triage | **Fix** every BLOCKER + HIGH + **MED (always)**. **Fix** LOW/NIT when in-scope ∧ localized ∧ safe; else **defer-and-record**. Never silently dismiss. | `verdict: dont-ship`, or an unfixable **security / data-loss** blocker after the fix loop. |
| branch posture | If the switch is safe, `git switch` to the slug branch. | A switch would clobber uncommitted work (never stash/force). |
| `intake` / `shape` (PO alignment) | **Never autonomous.** | Missing or `awaiting-input` → stop, route to `/wf intake` / `/wf shape`. |

The fix posture, precisely: the default action on any finding is **fix**. MEDs lose the option to defer. LOW/NITs keep a defer escape only when fixing them would reach outside the slice's diff, be non-localized, or risk a convention conflict — and the defer is always recorded with its reason. An unfixable finding is recorded `could-not-fix`, and only escalates to a HARD-STOP if it is a security/data-loss BLOCKER or the verdict is `dont-ship`.

Deferring un-verifiable acceptance criteria, precisely: a user-observable AC sometimes needs runtime proof the current environment simply cannot produce — no emulator or device, no display, an external service or API key that isn't reachable here, a runtime adapter whose bootstrap won't come up. Rather than cancel the whole run over a check it *cannot* perform, `yolo` defers **that one criterion**: it applies verify's sanctioned `interactive-verification: deferred` annotation with a reason, registers the deferral in `00-index.md` `runtime-evidence-deferrals` (with `cleared-by: null`), writes the slice `result: partial`, and drives on. This is **not** a weakening of the gate. The deferral is durable and visible; `/wf review` and `/wf handoff` proceed with only a soft warning, but `/wf ship` **HARD-BLOCKS** until every deferral is cleared by a `/wf probe` (or a re-verify) in a capable environment — and because `yolo` always stops before handoff, a deferred criterion can never reach production on its watch. The boundary is strict in two directions: deferral is **only** for *un-producible* evidence — if `yolo` actually drove the AC and the behavior was wrong, that is a substantive `fail` and still HARD-STOPs — and an AC left with **neither** evidence **nor** a deferral (`blocked-runtime-evidence-missing`) still HARD-STOPs. `yolo` never silently drops a criterion.

# Step 0 — Resolve arguments (MANDATORY)

1. **Slug + mode.** First positional after `yolo` = slug. Second positional, if present, = `<slice>` → **slice mode**; absent → **slug mode**. `yolo` owns its own slug resolution (the dispatcher excludes it from fuzzy-suggest, like `auto`). If the slug is empty, infer it from `.ai/workflows/INDEX.md`: exactly one `status: active` workflow → use it (slug mode); otherwise STOP with: *"`/wf yolo` needs a slug. Active workflows: `<list>`. Run `/wf yolo <slug>`."*
2. **Existence check.** Confirm `.ai/workflows/<slug>/00-index.md` exists. If not, STOP: *"No workflow `<slug>`. Run `/wf-meta status` to list workflows, or `/wf intake <description>` to start one."* (Do not fuzzy-correct here — the dispatcher already skipped Step 0.5 for `yolo`.) If a description was given instead of a slug, STOP and route to `/wf intake <description>` first.
3. **Resolve the absolute paths the Workflow script needs.** The script and its stage subagents have **no inherited working directory**, so every path must be absolute:
   - `projectRoot` = the absolute root of the repo that owns `.ai/workflows/<slug>/` (the nearest ancestor containing `.ai/workflows`, capped at the git toplevel — resolve it; do not pass a relative path or a sub-folder).
   - `pluginRoot` = the absolute install path of **this** plugin — the directory you loaded this reference from (`<pluginRoot>/skills/wf/reference/yolo.md`), equivalently `$CLAUDE_PLUGIN_ROOT` if set in your shell.
   - `referenceRoot` = `<pluginRoot>/skills/wf/reference`.
   - `scriptPath` = `<pluginRoot>/skills/wf/workflows/yolo.js`.

# Step 1 — Invoke the Workflow tool

Call the **Workflow** tool with the shipped script and the resolved absolute args. Pass `slice` only in slice mode (omit it in slug mode):

```
Workflow({
  scriptPath: "<pluginRoot>/skills/wf/workflows/yolo.js",
  args: {
    projectRoot:   "<absolute repo root owning .ai/workflows>",
    referenceRoot: "<pluginRoot>/skills/wf/reference",
    slug:          "<slug>",
    slice:         "<slice>"        // slice mode only — omit for slug mode
    // reviewFanout / planFanout: omit (default off; opt-in, see the script header)
  }
})
```

The workflow runs in the background and returns immediately with a task id; a completion notification arrives when it finishes. **Do not start a second driver** (`auto` or another `yolo`) for the same slug while it runs. The script orients, drives the stage chain autonomously, and returns a structured `outcome` object describing where it ended.

> **Iteration / prototype note.** The same script can be invoked directly during development by passing `scriptPath` to the dev checkout's `…/skills/wf/workflows/yolo.js`. No plugin rebuild is needed — skills and this script are read from source, not from `dist/`.

# Step 2 — Hand back to the user (MANDATORY)

When the workflow completes, read its returned `outcome` and emit a chat summary. Lead with a short **narrative** paragraph (prose, no bullets) telling the story: which stages ran, the load-bearing decisions/counts each produced, **the autonomous calls the driver made** (assumptions recorded, findings fixed vs deferred, acceptance criteria deferred for un-producible runtime evidence), and why the run ended — reached the endpoint, or HARD-STOPped at which gate and why. Then the anchors:

```
wf yolo complete: <slug> [<slice>]  (mode: <slug|slice> — <endpoint reached | HARD-STOP at <stage>: <reason>>)

<Narrative paragraph — the stages driven this run, the key decisions/counts, the autonomous
 resolutions and any residual deferred/could-not-fix findings, and the reason the run ended.>

Stages run: <the per-slice sequence actually executed>
Autonomous decisions: <count + one-line gist, or "none recorded">
Residual findings: <none | N deferred/could-not-fix recorded in <artifact>>
Runtime-evidence deferrals: <none | from outcome.runtimeEvidenceDeferrals: N — slice/AC + reason, recorded in 00-index.md; /wf ship is BLOCKED until each is cleared by /wf probe or a re-verify in a capable environment>
Next: <outcome.route — the routing command>
```

`Next` routing comes straight from `outcome.route`:
- **Endpoint, slice mode:** the next roster slice → `/wf yolo <slug> <next-slice>`; last slice → `/wf yolo <slug>` (slug-wide, to run the final review) or `/wf handoff <slug>` (per-slice).
- **Endpoint, slug mode:** `/wf handoff <slug>`.
- **HARD-STOP:** the gate that fired and the command to resolve it, then `/wf yolo <slug> [<slice>]` to resume.

Rules:
- **Always emit**, even on a HARD-STOP or an orientation block. The narrative explains *why* it stopped — never end silently.
- **Surface the autonomy.** A `yolo` run's value is in the decisions it made for the user. Name the assumptions it recorded and the findings it fixed vs deferred, so the user can audit them. Point at the artifacts that hold the full record.
- **Flag ship-blocking deferrals.** If `outcome.runtimeEvidenceDeferrals` is non-empty, call them out explicitly: the slug passed verify only because runtime evidence for those acceptance criteria was deferred, and `/wf ship` will refuse until each is cleared by `/wf probe` (or a re-verify in a capable environment). This is the one residual with a downstream hard gate — do not bury it.
- **Internal audience.** `.ai/` paths are allowed in this chat block; the External Output Boundary still governs anything written to a PR, commit, or other external surface.
- **Honesty.** Report what actually ran. If `yolo` drove two slices then HARD-STOPped at verify on the third, say so — do not imply the workflow is further along than the artifacts show.

# What this command is NOT

- **Not a stage** — it writes no artifact; the stages it drives do.
- **Not a fresh-start** — it never runs `intake`/`shape` from a bare description; their PO-alignment gates are driven explicitly by a human.
- **Not a PR opener or releaser** — it always stops at the review; `handoff`, `ship`, and `retro` are separate commands.
- **Not a CI auto-fixer** — CI is never in its scope.
- **Not a gate remover** — every stage's quality gate still runs; `yolo` supplies the answer by policy and records it, rather than pausing for the user.
- **Not in the Codex build** — Claude-only, by design.
