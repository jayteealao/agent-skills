---
name: wf
description: The single entry point for the SDLC lifecycle. Runs one SDLC operation per key — a canonical stage (intake → shape → slice → plan → implement → verify → review → handoff → ship → retro), a standalone/driver (design, probe, simplify, auto), a navigation query (status, recap), lifecycle control (close), or a router (ship-plan, docs) — and writes its artifact (when it has one) to `.ai/workflows/<slug>/`. `intake` also dispatches compressed entry modes (fix, rca, investigate, discover, hotfix, refactor, update-deps, ideate) and auto-routes extension (`$wf intake <existing-slug> <new scope>`). `review` is the single review surface (workflow stage AND ad-hoc dimension/sweep). Navigation (`status`/`recap`), lifecycle control (`close`), the ship-plan pipeline (`ship-plan`), and documentation (`docs`) are all keys now — the former `$wf-meta` and `$wf-docs` skills are dissolved into this one skill.
disable-model-invocation: true
argument-hint: "<intake|shape|slice|plan|implement|verify|review|handoff|ship|retro|design|probe|simplify|auto|status|recap|close|ship-plan|docs> [args...]"
---

# External Output Boundary (MANDATORY)
Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.
- Internal context includes workflow artifact paths (`.ai/workflows/...`, `.ai/dep-updates/...`), stage names or numbers, skill names, sub-agent names, prompt/tooling details, control-file metadata, and private chain-of-thought or reasoning traces.
- External-facing outputs include commit messages, branch names, PR titles/bodies/comments, release notes, changelog entries, user documentation, README content, code comments/docstrings, issue comments, deployment notes, and any file outside the private workflow artifact directories.
- When producing external-facing output, translate workflow context into product/project language: user-visible change, rationale, affected areas, verification, risks, migration notes, and follow-up work. Do not say the work came from an SDLC workflow or cite private artifact files.
- Before writing, committing, pushing, opening a PR, updating docs/comments, or publishing anything, perform a leak check and remove internal workflow references unless the user explicitly asks for a private/internal artifact.

Before executing, read `../../references/native-operating-model.md`, `../../references/artifact-interop.md`, and `../../references/verification.md`.

You are the **single SDLC dispatcher** for the plugin. `$wf` runs **one SDLC operation per key** — not every key writes a numbered stage artifact, and that is by design (Step 2 already tolerates read-only members via `none`). The 19 keys fall into families: the ten canonical **stages**; four **standalone/drivers** (`design` — a compressed design workflow that produces UI/UX artifacts and then drives the downstream stages itself; `probe` — runtime-truth verification of already-built work; `simplify` — read-only review-and-route triage; `auto` — the end-to-end lifecycle driver); two **navigation** members (`status` — the cross-workflow dashboard, single-workflow detail, exact-next-command router, and registry reconciler; `recap` — the plain-language catch-up / explain skill); one **lifecycle-control** member (`close` — end a workflow, or terminate one slice); and two **routers** (`ship-plan` — the project release-pipeline pipeline; `docs` — the documentation subsystem). `intake` is itself a **mode dispatcher**: plain `$wf intake <description>` runs stage 1, a mode keyword routes a compressed entry flow, and an existing slug followed by free scope auto-routes to extension. Your only job is to identify which key the user wants, load its reference body, and follow it verbatim.

> **Navigation, ship-plan, and docs are keys now (the dissolve).** The former `$wf-meta` and `$wf-docs`
> skills are retired — their members live here: `status` (absorbs `next` + `sync`), `recap` (renamed
> from `resume`, absorbs `how`'s explain modes), `close` (absorbs `skip`, slice-scoped), `ship-plan`
> (`init`/`build`/`edit`, the last from the dropped `amend ship-plan`), and `docs`. There is **no
> `amend`** — corrections are a new slice (`$wf intake <slug> <scope>`) or a fix; **no separate
> augmentation keys** (`instrument`/`experiment`/`benchmark`/`profile` are a `shape` decision applied by
> `plan`/`implement`/`verify`); and **no `announce`/`sync`/`next`/`how`/`skip` keys** (folded as above).

> **Narrative fragments — any artifact (v9.70.0).** Beyond the typed `.html.fragment` the rich stages project from a sibling `.yaml`, *any* artifact you write may also ship free **narrative fragments**: `<stem>.<label>.html.fragment` siblings of unrestricted raw HTML — as many as the story needs, no contract and no sibling `.yaml` required — rendered raw-inline below the page. Author one whenever a bespoke diagram, flow, comparison, or widget tells the story better than prose. Full guidance: `../../references/narrative-fragments.md`.

# Step 0 — Resolve the sub-command

Parse `$ARGUMENTS`. The first token must be one of the 19 known keys below; the remaining tokens are passed verbatim to the loaded reference as `$ARGUMENTS` for the underlying operation.

**Known sub-command keys** — each resolves to `reference/<key>.md`:

### Stages

| Key | Argument hint | What it does (one line) |
|---|---|---|
| `intake`     | `[slug] [mode] <description>` | **Entry dispatcher.** Plain `$wf intake <description>` runs stage 1 of 10. A mode keyword (`fix`, `rca`, `investigate`, `discover`, `hotfix`, `refactor`, `update-deps`, `ideate`) routes a compressed entry flow; an existing slug before a mode attaches a compressed slice; an existing slug + free scope **auto-routes to extension** (adds net-new slices — this replaces the old `extend`/`amend`). See `reference/intake.md`. |
| `shape`      | `[slug] [hint]`           | Feature discovery via product-owner questions; writes 02-shape.md. **Authors the Documentation Plan AND the Augmentation Plan** (`augmentations-needed`) that downstream stages honor. |
| `slice`      | `<slug>`                  | Decompose the shape into 1–N shippable slices; writes 03-slice.md and per-slice 03-slice-<slug>.md files. |
| `plan`       | `<slug> [slice]`          | Per-slice implementation plan with parallel reuse scan; writes 04-plan-<slice>.md. **Applies the augmentation plan** — authors 04b-instrument/04c-experiment/05c-benchmark from `shape`'s decision (loading `reference/augment/<type>.md`). |
| `implement`  | `<slug> [slice\|reviews]` | Code the slice; writes 05-implement-<slice>.md. Wires any shape-decided augmentations. Second arg `reviews` triggers fix-blockers mode. |
| `verify`     | `<slug> [slice]`          | Run tests, lints, typecheck; apply the user-observable AC gate; own a single-round, user-gated fix loop; re-check augmentations (benchmark compare). Writes 06-verify-<slice>.md. |
| `review`     | `<slug> [slice\|triage]` · or ad-hoc `<dimension>` / `sweep <aggregate>` | **The single review surface.** `$wf review <slug>` runs the workflow STAGE (accumulating-ledger dispatch, per `review-scope`). `$wf review <dimension>` / `$wf review sweep <aggregate>` (no slug) runs **ad-hoc** review — one rubric inline or a parallel fan-out (absorbs the former standalone review skill). Owns its own first-token resolution (slug vs dimension). See `reference/review.md`. |
| `handoff`    | `<slug>`                  | Aggregate completed slices into a PR description; writes 08-handoff.md. Refuses if any required review has unresolved blockers. |
| `ship`       | `<slug> [env\|announce]`  | Release via `.ai/ship-plan.md`; writes 09-ship-run-<run-id>.md + updates 09-ship-runs.md. Its post-publish **announce phase** drafts stakeholder comms; `$wf ship <slug> announce` re-runs comms only (absorbs the former `announce`). |
| `retro`      | `<slug>`                  | Post-mortem across the workflow; writes 10-retro.md. |

### Standalone / drivers

| Key | Argument hint | What it does (one line) |
|---|---|---|
| `design`     | `[slug] <command> [instr]` | **Compressed design workflow / ad-hoc design operators.** The 20 design commands (15 transforms, `audit`, `critique`, `extract`, `setup`, `teach`) are *arguments*, never their own keys. First token is an optional slug (existence-checked). See `reference/design.md`. |
| `probe`      | `<slug> [target]`         | **Runtime-truth verification** of already-built work — drives the running artifact through AC, captures observable output, writes findings as a compressed slice. Slug-only; never writes code. See `reference/probe.md`. |
| `simplify`   | `[branch [<base>] \| commit <sha-or-range> \| plan <slug> <slice> \| codebase [<path>]]` | **Review-and-route triage.** Three parallel sub-agents review one of four scopes, classify findings, route them downstream. Never writes code. Owns its own first-token resolution. See `reference/simplify.md`. |
| `auto`       | `<slug> [<slice>]`        | **End-to-end lifecycle driver.** Drives each stage in-process, pausing only when a stage's own gate fires; stops before handoff. Writes no artifact of its own. See `reference/auto.md`. |

### Navigation · lifecycle control · routers

| Key | Argument hint | What it does (one line) |
|---|---|---|
| `status`     | `[slug] [deep]`           | **Dashboard + detail + router + registry keeper.** Cross-workflow dashboard; `$wf status <slug>` shows detail AND the exact next command (absorbs the old `next`); reconciles `.ai/workflows/INDEX.md` on drift (absorbs `sync`); `$wf status <slug> deep` runs a reality-drift check + writes a sync report. See `reference/status.md`. |
| `recap`      | `<slug> [slice \| plan\|shape\|slice\|review\|findings]` | **Plain-language catch-up / explain** (renamed from `resume`). Recaps what a workflow has done so far (whole or one slice), or explains a plan/shape/review/findings artifact (the former `how` explain modes). Writes 90-recap.md; does not advance. See `reference/recap.md`. |
| `close`      | `<slug> [<slice> \| reason]` | **Lifecycle termination.** `$wf close <slug> [reason]` archives the whole workflow (99-close.md); `$wf close <slug> <slice>` closes/skips one slice (absorbs the old `skip`, slice-scoped). See `reference/close.md`. |
| `ship-plan`  | `<init\|build\|edit> [args]` | **Project release-pipeline router.** `init` authors `.ai/ship-plan.md`; `build` brings the repo/CI into compliance; `edit` block-edits the plan (the former `amend ship-plan`). See `reference/ship-plan.md`. |
| `docs`       | `[<primitive> \| <slug> \| --audit-only \| <path>]` | **Documentation router** (the former `$wf-docs`). Orchestrator pipeline (discover→audit→plan→generate→review), or a single Diátaxis primitive (`plan`/`tutorial`/`how-to`/`reference`/`explanation`/`readme`/`review`). See `reference/docs.md`. |

**`$wf review` is the whole review surface.** `$wf review <slug>` is the workflow stage; `$wf review <dimension>` / `$wf review sweep <aggregate>` is ad-hoc review (no slug). The former standalone `$wf review` skill is dissolved into this key — there is no separate review skill anymore.

**Resolution rules:**

1. If the first positional token matches one of the 19 keys, mode is **dispatch** and the remaining tokens become the sub-command's `$ARGUMENTS`. For `design`, `intake`, `probe`, `auto`, `status`, `recap`, `close`, `review`, `ship-plan`, and `docs`, the remaining tokens carry a slug (or a router sub-key / dimension) as their own first token, resolved **inside the loaded reference** (its Step 0) by exact existence check — not here.
2. If `$ARGUMENTS` is empty, render the menu above and ask the user which key they want.
3. If the first token is *not* a known key, **do not** silently treat it as a slug. Tell the user: *"`<token>` is not a known wf key. Pick one of: intake, shape, slice, plan, implement, verify, review, handoff, ship, retro, design, probe, simplify, auto, status, recap, close, ship-plan, docs."* Then handle the retired surfaces:
   - If the token is `quick` or a former `$wf-quick` sub-command: *"`$wf-quick` was retired — `fix`, `rca`, `investigate`, `discover`, `hotfix`, `refactor`, `update-deps`, and `ideate` are now `$wf intake <mode>`; `probe` and `simplify` are `$wf probe` and `$wf simplify`."*
   - If the token is a former `$wf-meta` member (`next`, `sync`, `resume`, `amend`, `extend`, `skip`, `how`, `announce`, `init-ship-plan`, `build-pipeline`): *"`$wf-meta` was dissolved into `$wf`. `status`→`$wf status` (it also absorbs `next` and `sync`); `resume`→`$wf recap`; `skip`→`$wf close <slug> <slice>`; `how`→`$wf recap <slug> <focus>` (explain) or the `$deep-research` skill (research); `announce`→`$wf ship <slug> announce`; `init-ship-plan`/`build-pipeline`→`$wf ship-plan init`/`$wf ship-plan build`; `amend`→there is no amend — add a new slice via `$wf intake <slug> <scope>` (or `$wf ship-plan edit` for the ship plan); `extend`→`$wf intake <slug> <new scope>`."*
   - If the token is a former `$wf-docs` invocation: *"`$wf-docs` is now `$wf docs` — same behavior (orchestrator or a Diátaxis primitive)."*
   - If the token is a former augmentation key (`instrument`, `experiment`, `benchmark`, `profile`): *"Augmentations are no longer separate skills — `shape` decides them (`augmentations-needed`) and `plan`/`implement`/`verify` apply them. Ad-hoc profiling is available via `$wf probe`."*

# Step 0.5 — Fuzzy-suggest unknown slugs (v9.11.0)

After sub-command resolution, before dispatch: if the user passed a positional slug arg and it doesn't match any row in `.ai/workflows/INDEX.md`, surface a typo suggestion instead of letting the reference fail later with an opaque "workflow not found" error.

**Applies to** these **slug-consuming** sub-commands:

`shape`, `slice`, `plan`, `implement`, `verify`, `handoff`, `ship`, `retro`, `status`, `recap`, `close`

**Does NOT apply** to keys that own their own first-token resolution or take a non-slug first arg:
- `intake` — resolves its first token by exact existence check inside `reference/intake.md` (slug-mode / extension / mode keyword / description), never a typo'd slug.
- `review` — owns its slug-vs-dimension resolution (`reference/review.md` Step 00): an exact slug is the stage, a known dimension/`sweep` is ad-hoc. A non-matching first token is a dimension or the ad-hoc menu, not a typo.
- `design`, `probe`, `auto` — each resolves an *optional* slug by exact existence check / single-active inference inside its reference; a non-matching first token is a design command / slug-required STOP / a route-to-intake, handled there.
- `simplify` — its first positional is a scope keyword (`branch`/`commit`/`plan`/`codebase`), not a slug.
- `ship-plan`, `docs` — **routers**: their first token is a sub-key / primitive / path / flag resolved inside the router reference, not a slug.

*Keep this list in sync with the 19-key table — exclude any future key that creates a new slug, takes a non-slug first arg, or resolves its slug by its own existence check. `status`/`recap`/`close` take an **optional** slug and fall through to single-active inference when none is passed, so Step 0.5 only fires for them when a non-matching slug arg is actually present.*

**Procedure:**

1. Identify the slug candidate — for the applies-to keys it is `$1` of the sub-command's `$ARGUMENTS`. If `$1` is empty (no slug passed), skip Step 0.5 — slug resolution falls through to the reference's single-active inference.
2. If `.ai/workflows/INDEX.md` does not exist → skip Step 0.5 (no registry → no candidate set). The reference handles the missing-slug case downstream.
3. Search `INDEX.md` for an exact match: `grep -P "^<candidate>\t" .ai/workflows/INDEX.md`. If hit → slug is real, dispatch normally.
4. **On miss**, fuzzy-match against every row's slug column (including closed rows):
   - Levenshtein edit distance ≤ 2, then substring inclusion (either direction).
   - If no slug satisfies any condition → STOP: *"Unknown slug `<candidate>`. Run `$wf status` to list all workflows, or `$wf intake <description>` to start a new one."*
5. If a best match exists, STOP with: *"Unknown slug `<candidate>`. Did you mean `<best-match>`<closed-suffix>? (Run `$wf status` to list all workflows.)"* — `<closed-suffix>` is ` (closed)` iff the best-match row's status is `closed`. Show the corrected command verbatim: *"Retry: `$wf <sub-command> <best-match> <remaining args>`"*.
6. Step 0.5 is purely advisory — it never auto-corrects. The user must re-invoke with the suggested slug.

# Step 1 — Execute

1. Read the reference file in full from `reference/<key>.md`.
2. Treat its content as your instructions for this invocation. Do not summarize, paraphrase, or skip — follow it verbatim.
3. The reference body contains the operation's full definition (preamble, prerequisites, conditional inputs, output contract, adaptive routing). Honor every conditional input and every artifact write it describes. Router keys (`design`, `ship-plan`, `docs`) resolve a sub-key and load a further reference; follow that chain.
4. The remaining `$ARGUMENTS` after the matched key are the sub-command's own arguments — pass them through verbatim.

# Step 2 — Emit Final Summary (MANDATORY)

After the reference's logic completes, emit a chat summary as the LAST output before returning control to the user. This contract is uniform across every key this router dispatches; the reference may carry its own chat-return content, but this section governs the shape.

**Format (compact — a short narrative, then the anchors):**

```
wf <sub-command> complete: <slug-or-scope>

<Narrative — a short prose paragraph (no bullets, no field labels) telling the story: what this run produced or decided, how, and the top risk or caveat. See the Narrative rule below.>

Artifacts: <comma-separated paths, or "none">
Next: <recommended command, or "Done">
```

**Rules:**

- **Always emit** unless the reference STOPped with an error message — in that case the error replaces the summary.
- **Verb-first first line.** Name the sub-command and the workflow slug (or other scope: `area` for a profile run, a dimension for ad-hoc `review`, etc.).
- **Artifacts** are the paths created or modified in this invocation. Use `"none"` for read-only sub-commands (`status` dashboard, ad-hoc `review`, `recap`, `simplify` standalone) — note that some read-only members still write one bookkeeping file (`status` may reconcile `INDEX.md`; `recap` writes `90-recap.md`); surface those honestly.
- **Narrative — the heart of the summary, REQUIRED for any sub-command that writes a substantive artifact.** A short **prose paragraph** (2–5 sentences, no bullets, no field labels) that *tells the user what happened*. Weave the load-bearing counts, decisions, and the top risk into the prose. Write it in the voice defined in [reference/_narrative-voice.md](reference/_narrative-voice.md) — relevance first, why before how, tradeoffs stated plainly, never a "This <stage> implements…" opening. Omit only for genuinely read-only sub-commands with nothing to narrate.
- **Next** is a concrete invocation, or `Done` for terminal sub-commands (`ship`, `retro`, `close`). Never vague like "consider your next step".
- **Internal audience.** Workflow artifact paths under `.ai/` ARE allowed here; this is the chat return, not external-facing copy. Outside this block, the External Output Boundary still applies.
- If the reference defines its own "Chat return contract" or "Hand off to user" step, treat that as the *content* spec — pick the load-bearing fields and keep it compact. **A reference that says to "return ONLY" a receipt (slug / wrote / options) means only those *receipt fields* — it does NOT waive the substance summary above. Always surface what the artifact says — its key decisions, counts, verdict, top risk — not merely the paths it wrote.** Keep the *full* detail in the artifact; the chat summary carries the gist.
