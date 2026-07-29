# `/wf task` — the generic-work key — Implementation Plan

> Status: **PROPOSED** (drafted 2026-07-24).
> Provenance: a capability question — the plugin has ten lifecycle stages, nine compressed
> intake modes, and three routers, and *every one of them* assumes the deliverable is a code
> change in this repository, verified by executing software and shipped through a PR. Work that
> is real but shaped differently — a docs reorganization, a key rotation, an RFC, a vendor
> follow-up, a one-shot backfill — has no home. It runs outside `/wf` and leaves no trace, or it
> gets forced into `/wf intake fix` where it immediately trips machinery built for something else.
> Scope: additive. One new key, one enum value on a frozen contract, two new evidence rungs, and
> recognition arms in the navigation and driver keys. No new artifact `type:`, no renderer work.

## The house-rule decision (read this first)

The intent-fidelity plan states an inherited house rule:
[*"no new skills, no new top-level `/wf` keys. The surface stays at 20 keys."*](INTENT-FIDELITY-HARDENING-PLAN.md:11)
That rule has already been consciously excepted once —
[OBSERVABILITY-ROUTER-PLAN.md](OBSERVABILITY-ROUTER-PLAN.md:14) added the 21st key and argued the
exception on the grounds that the capability *genuinely could not* live inside an existing key.
**This plan adds the 22nd** (`task`; Codex 20→21). The same test applies, and it passes:

- **It is not an intake mode.** Every intake mode is a *compressed standard lifecycle*. The
  contract in [`_intake-context.md`](../../skills/wf/reference/intake/_intake-context.md) is
  explicit: the mode authors the planning half, then "routes into the standard execution chain —
  `/wf implement` → `/wf verify` → `/wf review` → `/wf handoff` → `/wf ship` → `/wf retro`." A
  generic task structurally breaks that promise: it has no slices, usually no PR, and frequently
  no code at all. Filing it under `intake` would either lie about the contract or fork it.
- **It is not a router.** `ship-plan`, `docs`, and `observability` are project-level contracts
  with `init`/`build`/`audit` sub-keys. A task is a *unit of work with a slug*, not a project
  contract.
- **It is not `probe` or `simplify`.** Those observe or triage work that already exists. A task
  *does* work.

What it is: a **minimal lifecycle** — the fourth category on the roster, alongside stages,
standalone/drivers, and routers. The plan assumes the exception is granted. If it is declined,
the honest fallback is *not* an intake mode; it is to drop the capability, because the thing that
makes `task` worth building (§ D4, § D5) is exactly the thing an intake mode cannot carry.

---

## The gap this fills

Five classes of real work currently have nowhere to go:

| Class | Example | What breaks today |
|---|---|---|
| Repo chore, no behavior change | Archive `docs/internal/*-PLAN.md` into `archived/` | `verify`'s AC gate wants runtime evidence; there is no runtime |
| Environment / infra op | Rotate an API key, add a CI secret, set a DNS record | Nothing in `/wf` except `ship` reaches outside the repo — no authorization model exists |
| Non-code deliverable | Write an RFC, produce a license audit, draft a runbook | `build must-stay-green` and the 34 code review dimensions do not apply |
| Coordination | File an upstream issue, get legal signoff | No evidence vocabulary for "a human confirmed it" |
| Throwaway execution | Run a one-shot data backfill | The script never merges, so `handoff`/`ship` are meaningless |

The uncommitted working tree at the time of writing is itself an instance of class one: eleven
plan documents moved into `archived/`, tracked nowhere, with no record of intent or outcome.

The cost of the gap is not ceremony — it is **evidence**. Work that runs outside `/wf` produces
no artifact saying what was intended, what was done, and how anyone knows it worked. That is the
exact failure the evidence-rung machinery was built to prevent for code, and it is unprotected
everywhere else.

---

## Design decisions

### D1 — Placement: a top-level key with a minimal lifecycle

`/wf task <description|slug>`. It self-authors its whole lifecycle rather than routing into the
standard execution chain — precedent: `update-deps` is already the noted exception that
self-authors `05-implement`/`06-verify` because its execution is specialized
([`_intake-context.md`](../../skills/wf/reference/intake/_intake-context.md) L82–83).

### D2 — Reuse every artifact `type:`; add exactly one `workflow-type`

The single most important scoping decision, because it collapses the blast radius. **No new
artifact type.** The lead artifact `01-task.md` carries `type: intake` — the same trick
`01-fix.md` already uses, where the filename carries the mode and the renderer dispatches on the
type. `06-verify.md` carries `type: verify`. `00-index.md` carries `type: index` plus
`workflow-type: task`.

Consequence: **no new renderer module, no new sibling-YAML schema, no snapshot churn.** Two edits
remain, and both are load-bearing:

1. **`tests/frontmatter.schema.json`** — add `task` to the `workflow-type` enum, which today reads
   `["feature","fix","quick","rca","investigate","rf","refactor","hotfix","dep-update","update-deps","docs","discover","standard","adopt"]`
   and is consumed by the wired `post-write-verify` hook. Until the enum accepts `task` and
   `dist/` is rebuilt, **every `/wf task` write is hard-blocked by the hook.**
2. **`renderers/_paths.mjs`** — add `'01-task': ['intake', null]` beside the existing change-mode
   leads at L34–38. This map is an **explicit allowlist, not a fallback**: the file's own comment
   warns that "without these entries `resolveViewPath` returns null and the orchestrator skips
   them entirely — the writeup is then never rendered and the slug overview has nothing to link
   to." Omitting this one line ships a key whose lead artifact silently never renders and whose
   overview intake card 404s. It is also why the change-mode leads all point at `intake/`: the
   overview's jump-rail links to a fixed `STAGE_NAV.intake.dir`.

Both `renderers/` and `hooks/` are `dist/` rebuild triggers, so this release rebuilds `dist/`,
changes `buildId`, and trips the render version-gate — the version bump is mandatory, not
cosmetic.

### D3 — Four artifacts; skipped stages marked honestly

```
00-index.md  →  01-task.md (type: intake)  →  [gate]  →  do the work
             →  05-implement.md  →  06-verify.md  →  (10-retro.md, on request)
```

`progress:` marks `shape`, `slice`, and `plan` as `skipped`; `review`, `handoff`, and `ship` are
`skipped` unless the task produced a repo diff worth reviewing or merging. `current-stage` stays
inside the standard enum (`implement` while working, `verify` while checking) — never a bespoke
label, per the compressed-lifecycle contract. `01-task.md` carries the steps inline rather than
minting a `04-plan.md`, because for a task, planning and briefing are one motion.

### D4 — The evidence contract: two new rungs on the frozen enum

This is the heart of the plan and the reason it is worth building.
[EVIDENCE-SCHEMA-CONTRACT.md](EVIDENCE-SCHEMA-CONTRACT.md) is **FROZEN** and its rung ladder —
`live | headless | emulator-or-container | cited-mock | uncited-mock | static | n-a` — is entirely
about *executing software*. Task acceptance criteria are about *observed outcomes*. The
adaptation needed is smaller than it first appears:

- **`live` already covers most of it**, with a gloss: re-reading the real system of record after
  acting *is* live observation. `ls` the directory, `curl` the DNS record, query the API, read
  the file back. No new rung needed — just an explicit statement that non-runtime systems of
  record count.
- **New: `attested`** — a named external party or human confirmed the outcome, recorded with a
  citation (vendor email, signoff comment, ticket URL). Weaker than `live`, but honest, and it is
  the only rung available for the coordination class.
- **New: `asserted`** — the agent claims the action succeeded with **no independent read-back**.
  This is task-land's `uncited-mock`: presumptively fictional, and it **cannot close an AC**.

That last rule is the whole point. It extends a proven, hook-enforced principle rather than
inventing a parallel ladder: the shipped `mockEvidenceGate` already hard-blocks `result: pass`
while a user-observable AC sits at `cited-mock`/`uncited-mock`/`static`. Adding `asserted` to
that blocking set means **"I moved the files" without an `ls` afterward fails the gate**, by the
same mechanism and the same code path that stops a mock-backed code pass.

Because the contract is frozen, this lands as a **contract revision** — a new §6 in
EVIDENCE-SCHEMA-CONTRACT.md, inherited by both plans that write the field.

### D5 — Blast radius and a scaled authorization gate

Genuinely new risk surface: nothing in `/wf` except `ship` reaches outside the repository, and
`ship` is protected by a ship-plan, Go/No-Go gates, and a rollback runbook. `task` can rotate a
key or email a vendor with none of that. So `01-task.md` carries a mandatory classification, and
the pre-execution gate scales to it:

| `blast-radius` | Gate |
|---|---|
| `repo-local` | May auto-proceed; decision recorded either way |
| `local-env` | Proceed with a recorded note |
| `shared-env` | **Stop for explicit human authorization.** No auto-proceed, ever |
| `external-party` | **Stop for explicit human authorization.** No auto-proceed, ever |
| `irreversible` | Named confirmation echoing exactly what will happen, plus a `rollback:` line per step or an explicit "no rollback exists" acknowledgement |

The bottom three rows are the piece an autonomous driver must **not** resolve by written policy —
see D6.

### D6 — `auto` and `yolo` do not drive `task` (R1)

`auto.md` already has the precedent verbatim for `update-deps`: *"auto does NOT drive them... If
the slug is not yet past verify, PAUSE and route the user."* `task` gets the same arm. `yolo.md`
classifies slugs into four `workflow-type` classes and already carries one genuine refusal
(`recommended-next: human-triage`); `task` joins it as a second. The reasoning is D5: the
`shared-env`/`external-party`/`irreversible` gates exist precisely because no policy should
resolve them unattended. A later release may allow `yolo` to drive `repo-local` tasks only; that
is deliberately out of scope for R1.

### D7 — Slug-mode: `/wf task <existing-slug> <description>` attaches a compressed slice

The shared [`_compressed-slice.md`](../../skills/wf/reference/_compressed-slice.md) contract
already generalizes — it is written for "an operation that produced the slice" and is shared by
`intake`'s modes, `probe`, and `simplify`. `task` joins as a fourth caller: first token is an
existing non-closed slug → write one `03-slice-task-<descriptor>.md` (`slice-type: task`,
`origin: wf/task`), no new workflow, no new branch, additive index updates only. This is the
idiomatic answer to "I'm mid-feature and need to rotate a key first."

Two edits to the shared contract: add `task` to the `<op>` enumeration (L14–16) and to the
`slice-type` comment enum (L36).

**One wrinkle to resolve in W3:** a compressed slice writes no `06-verify.md`, so a task slice has
nowhere to put its per-AC `evidence-rung` rows. Either the slice artifact carries them inline
(preferred — it already carries body sections), or slug-mode is restricted to `repo-local` tasks
in R1. Decide before writing `task.md`; do not leave it to the author's discretion at runtime,
because the `asserted` block is only meaningful if there is a defined place to record the rung.

### D8 — Boundary tripwires (warn-and-continue, never refuse)

Reusing the existing tripwire idiom — record the breach, write a valid artifact, offer escalation:

- Deliverable turns out to be a behavior change in product code → escalate to `/wf intake fix`
- Work needs more than one slice → it is a feature; escalate to `/wf intake`
- Work is read-only investigation → route to `/wf intake discover` or `investigate`
- Request contains more than one independent outcome → **`task` is not a todo list.** Enumerate
  the outcomes and have the user pick one, or escalate to a feature.

---

## Work items

### Edit topology — what is "both trees" and what is not

Worth stating up front, because the mirror is not a copy. `plugins/sdlc-workflow-codex` has
`skills/`, `hooks/`, `references/`, `tests/`, and `runtime/` — but **no `renderers/`, no `lib/`,
no `dist/`**. Its hooks are thin adapters over the shared bundle in `runtime/dist/`, and the
frontmatter schema is bundled there rather than mirrored as a file.

| Edit | Where it is authored | How it reaches Codex |
|---|---|---|
| `skills/wf/**` markdown (SKILL.md, `reference/*.md`) | **Hand-edit both trees** | **`sync:codex` does not mirror `skills/` at all** — no script, no CI diff guard. This is the single most-missed step |
| `renderers/_paths.mjs`, `hooks/post-write-verify.mjs`, `tests/frontmatter.schema.json` | **Claude tree only** | `npm run build` → `dist/` → `npm run sync:codex` → `runtime/dist/` (byte-for-byte copy, no transformation) |
| Doc-site | Claude tree only | Rides the codex sync payload — **regenerate before `sync:codex`**, not after |

Two Codex-specific constraints on the hand-mirror of `task.md`:

- **`$wf task`, never `/wf task`.** Enforced by `sdlc-workflow-codex/scripts/verify-claudisms.mjs`,
  which also blocks Claude-tooling references, `AskUserQuestion`, and Anthropic naming.
- **Codex has three shared references the Claude tree lacks** — `_gate-question.md`,
  `_subagents.md`, `_timestamp.md`. The Codex `task.md` should cite `_gate-question.md` for the D5
  authorization gate (the Claude version uses `AskUserQuestion`, which is unavailable there) and
  `_timestamp.md` in place of the inline `date -u` instruction.

### W1 — Surface and dispatch (both trees)

| | |
|---|---|
| W1.1 | `skills/wf/SKILL.md` — **eleven sites per tree**, not three. Claude line numbers (Codex is offset by one and has no `yolo`): L3 `description:` frontmatter (names every key inline); L5 `argument-hint` pipe-alternation; L12 roster sentence with category counts (gains a sixth category); L20 "one of the 21 known keys"; the dispatch tables at L28–37 / L43–47 / L53–58 (a new **Minimal lifecycle** section); L64 resolution rule 1 (count **and** the slug-resolving key list); **L66 the not-a-known-key error roster**; L79 + L82–87 the Step 0.5 applies-to / does-not-apply lists; L89 the literal instruction *"Keep this list in sync with the 21-key table"*; L122 router-key list (no change — `task` is not a router); L144/146 chat-return read-only and terminal key lists. |
| W1.2 | New `skills/wf/reference/task.md`. Must **cite** `_output-boundary.md`, `_narrative-voice.md`, `_chat-return.md`, `_question-craft.md` and `_additive-write.md` rather than restate them — `output-boundary.test.mjs` and `shared-reference-drift.test.mjs` walk the reference directory and hard-fail on a duplicated rule body. |
| W1.3 | `status.md` L58: add `task` to the INDEX.md `workflow-type` column vocabulary. |
| W1.4 | `auto.md`: `workflow-type: task` → pause-and-route arm (mirror the `update-deps` arm at L60). `yolo.md`: `task` as a fifth class and a second genuine refusal. |
| W1.5 | `review/_stage.md` L55–61 carries an explicit per-`workflow-type` prerequisite table. Without a `task` arm, `/wf review <task-slug>` falls through to standard mode and hunts for a `03-slice.md`/`04-plan.md` that will never exist — a confusing failure, not a clean refusal. **Add the arm in R1 even though review is skipped by default**, stating that a task has no slice/plan records and routing the user to `/wf task <slug>` or, if the task left a reviewable diff, to ad-hoc `/wf review <dimension>`. |
| W1.6 | `close.md` / `recap.md`: confirm they handle a slug whose `progress` has six `skipped` stages. Expected to be free — both read the index generically — but must be exercised, not assumed. |

### W2 — The evidence contract revision

| | |
|---|---|
| W2.1 | `EVIDENCE-SCHEMA-CONTRACT.md`: new §6 adding `attested` and `asserted` to the `evidence-rung` enum, plus the `live` gloss for non-runtime systems of record. Mark the contract revision explicitly — the header says any change here is inherited by both writing plans. |
| W2.2 | `tests/frontmatter.schema.json`: extend the `evidence-rung` enum **and** the `workflow-type` enum (`+task`). |
| W2.3 | `hooks/post-write-verify.mjs` (L266–289): add `asserted` to the `mockEvidenceGate` blocking set and to its operator-facing message. **`dist/` rebuild trigger.** |
| W2.5 | `renderers/_paths.mjs` L34–38: `'01-task': ['intake', null]`. **`dist/` rebuild trigger.** Without it the lead never renders (D2). |
| W2.6 | `lib/leak-lexicon.mjs`: add `task` to `WF_KEYS` (L27–29) so `/wf task` matches the leak-guard command pattern, and `task` to `STAGE_NAMES` (L32–35) so the `01-task.md` stem is recognized in artifact-filename detection. **`dist/` rebuild trigger.** **Fix the pre-existing drift while here:** `observability` is missing from `WF_KEYS` and the comment still says "the 20 live /wf keys" — so `/wf observability` has never matched the leak guard. |

**Deliberately unchanged, recorded so it reads as a decision rather than an oversight:**
`hooks/post-write-verify.mjs` L380–420 (the intake-ledger lint) hardcodes `base !== '01-intake.md'`,
so `01-task.md` is silently exempt. That is **correct** — a task has no PO-interview ledger to
lint — but it must be stated, because the same hardcoding is what makes a *new intake mode*
silently exempt by accident. `hooks/pre-write-validate.mjs:132`'s `type:` roster also needs no
edit (we add no new artifact type), though it is already stale by roughly nine live types.
| W2.4 | `verify.md` (both trees): one paragraph placing the two new rungs on the existing ladder. Cite the contract; do not restate it. |

### W3 — `reference/task.md` body

The pipeline: `0·orient` → `1·brief` → `[gate]` → `2·execute` → `3·evidence` → `4·hand off`.

| Step | Content |
|---|---|
| 0 | Slug resolution (`task-<short-description>`), collision check, branch decision (default `branch-strategy: none` — most tasks do not warrant a branch, inverting the `fix` default), lightweight project-context read. |
| 1 | Author `00-index.md` + `01-task.md`: restated request, **blast radius**, ≤5 steps each with its own outcome check, ACs each naming *how it will be observed*, rollback line per step above `repo-local`, assumptions, open questions. At most 2 chat questions, answered inline. |
| gate | The D5 table. `AskUserQuestion` (Proceed / Adjust / Escalate). |
| 2 | Do the work. Write `05-implement.md` recording what actually happened per step, including deviations. |
| 3 | Write `06-verify.md`: per-AC evidence with `evidence-rung`. **Re-observe; never assert.** Any AC at `asserted` blocks `result: pass` via the hook. |
| 4 | Narrative chat return per `_chat-return.md`, then the structured anchors. |

Plus the standard sections every reference carries: a slug-mode block at the top (D7 — it
**overrides** the standalone flow), tripwires (D8), "what this command is NOT", crash-safe/resume
behavior, and the free narrative-fragment tier.

W3.1 — `_compressed-slice.md` (both trees): add `task` to the `<op>` list and the `slice-type`
enum, and resolve the D7 evidence-placement wrinkle in the contract itself so all four callers
read one rule.

### W4 — Consult trigger

Per the v9.135–139 sweep, the trigger must be an **objective** condition, never discretionary
vocabulary — `consult-trigger-coverage.test.mjs` pins that. Auto-invoke `/consult codex` at the
gate when ANY of: `blast-radius` is `shared-env`, `external-party`, or `irreversible`; the task
touches credentials, billing, or production data; no rollback exists for any step.

### W5 — Doc-site and mirror

Key roster 21→22. The doc-site has **three authoring regimes** and the live roster sites fall into
two of them — the handling is different and getting it backwards silently reverts the work:

| Site | Regime | How to edit |
|---|---|---|
| `_build_pages.py:312` (the key-count sentence) | generator | Edit here, then regenerate |
| `orientation/mental-model.html` | **A — generated** | **Never hand-edit.** Edit the literal in `_build_pages.py`; a direct edit is reverted on the next run |
| `reference/wf.html` (canonical roster + per-key table) | **C — hand-maintained** | Hand-edit the `.html`. The generator ignores it entirely |
| `reference/skills.html` | **C — hand-maintained** | Hand-edit the `.html` |
| `how-to/choose-a-command.html`, `whats-new.html` | **A — generated** | Edit in `_build_pages.py` (`whats-new` body at `:689+`) |

The roster sweep found the surface is **wider than the key count alone** — these also enumerate
keys or the `workflow-type` enum, all regime C unless noted:

| Site | What needs saying |
|---|---|
| `reference/wf.html:96` | The lede's full category breakdown ("21 keys … 5 standalone/drivers … 3 routers") |
| `reference/wf.html:98`, `:102–119` | "This page deep-dives…" scope sentence, and the `<div class="toc">` with one `<li>` per documented key |
| `reference/commands.html:144`, `:149–165`, `:196–202` | Dispatch prose, the per-key sub-command table, and the navigation/lifecycle key table |
| `reference/skills.html:107` | One-line key roster |
| `reference/glossary.html:142` | Mode roster (only if `task` is described there) |
| **`reference/00-index-schema.html:137`** | **Mirrors the `workflow-type` enum verbatim** — W2.2's schema edit is incomplete without it |
| `reference/types.html:106–241` | Eight artifact-type tables; needs a `task` row only if the lead is documented by filename |
| `how-to/start-workflow.html:114–177`, `:199–209` | Per-mode scenario blocks and the mermaid decision tree |

`scripts/verify-doc-site.mjs` checks **only** version-brand parity and pager/nav adjacency — there
is **no automated drift guard on key or mode counts anywhere.** Every site above is caught by
review or not at all, which is why the 2026-07-12 and 2026-07-13 audits found so much drift. Treat
this table as the checklist.

If `task` earns its own sidebar entry, edit `SIDEBAR` in `_build_pages.py` (`:34+`, `/wf`
sub-entries at `:72–76`), regenerate, then hand-patch the inlined `<aside>` in all 24 regime-C
pages and fix every affected pager — `verify-doc-site.mjs` checks pager adjacency against
`nav.html` order.

**Do not sed the digit.** `whats-new.html` and `_build_pages.py:758–759` also contain "20 keys" —
those are *historical changelog entries* for v9.98–9.102 and must stay wrong-by-design. Match on
the live roster sentence, not the number.

Regenerate the site **before** `npm run sync:codex` (`docs/site` rides the synced payload — the
v9.96.0 gotcha), then re-establish parity.

### W6 — Surface descriptions that enumerate the roster

Six more places state the key count or list the keys, none of which the doc-site work touches:

| File | What |
|---|---|
| `tests/wf-fixtures.json` | Routing-resolution fixtures — add `/wf task` → `skills/wf/reference/task.md`; its `description` field hardcodes "21-key surface" |
| `plugins/sdlc-workflow/README.md` (~L716–780) | Command reference section |
| `plugins/sdlc-workflow-codex/README.md` (L19) | Roster + count |
| `.claude-plugin/plugin.json` | `description` states the key count |
| `.claude-plugin/marketplace.json:12` | Plugin-entry `description` |
| `sdlc-workflow-codex/.codex-plugin/plugin.json` | `description` **and** `interface.longDescription` both enumerate the roster |
| `sdlc-workflow-codex/skills/wf/agents/openai.yaml` | Native Codex interface — `display_name` / `short_description` / `default_prompt`; no Claude-tree analogue |

### W7 — Test hygiene (folded in, not incidental)

Three test files exist on disk but are **absent from the `npm test` script**:
`consult-trigger-coverage.test.mjs`, `intake-shape-hardening.test.mjs`, `steering.test.mjs`.
The first is the one pinning discretion-vocabulary extinction across stage files — it is not
running. Wire all three in.

This is not optional bookkeeping for this release. `consult-trigger-coverage.test.mjs:40`
enumerates reference files **by name** (`'observability/init.md', …`), so W4's consult block
requires an entry there — and the file that would check it does not run. Shipping W4 without W7
ships an unguarded trigger *and* an un-run guard.

**One existing test needs a line, not a new file.** `tests/sunflower.test.mjs:55–65` is
`test('resolveViewPath: compressed change-mode leads all land at intake/')` and asserts
`01-fix`/`01-hotfix`/`01-refactor`/`01-update-deps`/`01-adopt` → `intake/INDEX.html`. Add
`01-task`. This is the test that would have caught the `_paths.mjs` omission in D2, so it is the
single highest-value edit in W7.

New guards to add: a `task`-key roster drift test (the reference exists in both trees, the
dispatch table lists it, the error message names it) and a schema round-trip asserting a
`workflow-type: task` index validates. `output-boundary.test.mjs` and
`shared-reference-drift.test.mjs` auto-discover the new file across **both** trees, so citation
discipline is enforced for free — but only if the Codex mirror actually exists.

Add a `tests/wf-fixtures.json` fixture too, with eyes open: the file has **no `.mjs` consumer and
is not wired into `npm test`**, and it has already drifted (no `wf-intake-adopt` fixture exists
despite `adopt` shipping). As a regression guard it is currently dead weight. Either wire it to a
consumer as part of W7 or record that adding the fixture is documentation, not protection —
do not let it read as coverage it does not provide.

---

## Sequencing

Split by risk, following the observability precedent:

| Release | Contents | Rationale |
|---|---|---|
| **R1 `v9.140.0`** | W2 (contract + schema + hook) first, then W1, W3–W7 | The schema and hook **must land first or in the same commit** — until the enum accepts `task`, the hook hard-blocks every artifact the key writes. Ship `repo-local` and `local-env` tasks fully; `shared-env`/`external-party`/`irreversible` are classified and gated but the gate simply stops for a human. |
| **R2 (later)** | Richer authorization: per-class credentials policy, rollback verification, an audit trail for external-party actions | The genuinely risky surface, iterable one class at a time without blocking the core. |
| **R3 (later)** | `yolo` drives `repo-local` tasks only | Needs R1 in real use first to know whether the gate classification is reliable enough to automate around. |

**Per-release mechanics.** Version bump is **seven hand-edited spots** (verified against the
v9.132.0 observability release, the direct precedent for adding a key):

| # | File | Line |
|---|---|---|
| 1 | `sdlc-workflow/.claude-plugin/plugin.json` | 3 |
| 2 | `sdlc-workflow/package.json` | 3 |
| 3 | `sdlc-workflow/renderers/_shell.mjs` | 10 — `PLUGIN_VERSION`, the only hardcoded JS literal; v9.138.0 missed it |
| 4 | `sdlc-workflow-codex/.codex-plugin/plugin.json` | 3 |
| 5 | `sdlc-workflow-codex/package.json` | 3 |
| 6 | `.claude-plugin/marketplace.json` | 15 — plugin entry |
| 7 | `.claude-plugin/marketplace.json` | **4 — top-level marketplace version, bumped independently** (1.165.0 → 1.166.0) |

Repo-root `package.json` (1.48.0) is **not** bumped. Then sed the brand across **51** doc-site
HTML files (line 17; line 18 on `index.html` and two tutorials; line 5 on `nav.html`) —
`scripts/verify-doc-site.mjs` asserts every page's brand equals `plugin.json`'s version.

**`dist/` rebuild is unavoidable and double-triggered:** W2.3/W2.5 touch `hooks/` and
`renderers/`, and separately `_shell.mjs` carrying `PLUGIN_VERSION` means *every* bump moves
`renderers/` — so even a prose-only release rebuilds. That changes `buildId`, forces the render
version-gate, and mandates `npm run sync:codex`. `dist/` must ride the same commit; the
`sdlc-build-freshness` CI gate and the local pre-commit hook both enforce it.

---

## Acceptance criteria (plan-level)

1. `/wf task <description>` writes a schema-valid `00-index.md` + `01-task.md` that survives the
   `post-write-verify` hook, on a fresh repo, in both trees.
2. A task whose AC is evidenced only by `asserted` **cannot** reach `result: pass` — the hook
   blocks it, demonstrated by a test, not by inspection.
3. A `shared-env` task stops for human authorization even when every other signal says proceed.
4. `/wf status` lists a task slug with the right type; `/wf recap` and `/wf close` handle it.
   `/wf task <existing-slug> <description>` writes exactly one compressed slice and creates no
   new workflow, branch, or top-level index.
5. `/wf auto <task-slug>` and `/wf yolo <task-slug>` both pause and route rather than driving.
6. `npm test` runs all three previously-orphaned test files, green.
7. Doc-site key count reads 22 on all four live roster sites, generator and rendered page together,
   with the v9.98–9.102 history entries left untouched.
8. **A rendered task slug shows its lead.** `01-task.md` resolves to `intake/`, the overview's
   intake card links to a page that exists, and the slug overview is not missing a station. This
   is the silent-failure criterion — the one defect that produces no error, only an absent page.

---

## Open questions

1. **Does a task ever want a PR?** A repo-local task produces a diff that arguably deserves
   `review` + `handoff`. R1 marks them `skipped` and leaves the diff on the branch. If that
   proves wrong in use, the fix is an opt-in `→ /wf review <slug>` hand-off at step 4, not a
   structural change.
2. **`task` vs the adjacent research gap.** A task whose *work* is investigation ("find out
   whether vendor X supports SSO") wants an external-evidence source that does not exist yet.
   That is a separate proposal (a `research` skill completing the
   `consult` / `study-sources` oracle triad); `task` should cite it if it lands, and use
   `attested` in the meantime.
3. **Should `attested` require a machine-checkable citation?** A URL can be verified to exist; an
   email quote cannot. R1 requires a citation string but does not validate it. Worth revisiting
   if `attested` becomes a laundering route around `asserted`.

---

## Appendix A — confirmed free (no edit needed)

Recorded so the next reader does not re-derive it. Each was checked, not assumed:

| Surface | Why it needs nothing |
|---|---|
| `renderers/index.mjs:21–32` `STAGE_NAV` | Maps stage → artifact `type`s + view dir. `01-task.md` carries `type: intake` and lands at `intake/`, an existing entry |
| `renderers/index.mjs:13–16`, `dashboard.mjs:20–23` `STAGES` | The ten canonical stages are unchanged; a task index simply marks six `skipped`, an existing `progress` enum value |
| `tests/frontmatter.schema.json:112–118` `current-stage` | D3 keeps `current-stage` inside the existing enum |
| `tests/e2e/acceptance.mjs:49–63` `NOT_RENDERED` | Schema-driven over artifact `type`s; we add none |
| `tests/unit/snapshots/_fixtures.mjs` `CASES` | One entry per *renderer*; no new renderer, so no new case or golden |
| `scripts/render-sunflower.mjs:64–69` `OFF_PIPELINE_BUCKET` | For analysis modes with their own off-pipeline root; `task` is a normal slug workflow under `.ai/workflows/` |
| `hooks/pre-write-validate.mjs:132` `type:` roster | No new artifact type (already stale by ~9 types regardless) |
| `lib/hook-utils.mjs:107–125` path→type map | For project-level files (`.ai/ship-plan.md` etc.); `task` writes slug artifacts |
| `slice-type` schema enum | Does not exist — `slice-type` is free-form; D7's `task` value needs only the prose comment edit |
| `codex/scripts/verify-claudisms.mjs:46` | Alternation of *retired* `$wf-<key>` spellings; `task` has no retired form |

## Appendix B — ship order

1. Author `skills/wf/reference/task.md` (Claude), then hand-mirror to Codex with `$wf` phrasing
   and `_gate-question.md` / `_timestamp.md` citations
2. `skills/wf/SKILL.md` — all eleven sites, both trees (W1.1)
3. Remaining reference edits: `status.md:58`, `auto.md`, `yolo.md`, `review/_stage.md`,
   `_compressed-slice.md` — both trees
4. `tests/frontmatter.schema.json` (both enums), `renderers/_paths.mjs`, `lib/leak-lexicon.mjs`,
   `hooks/post-write-verify.mjs` — Claude tree only
5. `EVIDENCE-SCHEMA-CONTRACT.md` §6 revision
6. Surface descriptions (W6): both READMEs, both `plugin.json` descriptions, `marketplace.json:12`,
   `openai.yaml`, `wf-fixtures.json`
7. Doc-site: edit `_build_pages.py` → regenerate → hand-edit every regime-C page in the W5 table
8. Version bump: 7 hand spots + 51 brand seds
9. `npm run build` → `npm run sync:codex` (**after** doc-site regen)
10. Gates: `npm test && npm run test:e2e && npm run verify:docs && npm run verify:legibility &&
    npm run verify:codex && npm run verify:runtime`, plus the Codex suite, plus the three
    orphaned test files explicitly until W7 wires them
11. `CHANGELOG.md` entry (Claude tree only)
12. Commit atomically — `dist/` must ride the same commit or the CI freshness gate fails

**Most likely to be missed**, in order: the Codex `skills/` hand-mirror (no script, no CI diff
guard); the regime-C doc-site pages the generator silently ignores; `marketplace.json:4`, the
top-level marketplace version bumped independently of the plugin; and `_shell.mjs`'s
`PLUGIN_VERSION`, which v9.138.0 already missed once.
