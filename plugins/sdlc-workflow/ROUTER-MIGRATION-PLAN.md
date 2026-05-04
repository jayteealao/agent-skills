# Router Migration Plan — sdlc-workflow

Status: draft, pre-implementation
Target plugin version after full landing: v8.36.0 (one minor bump per router PR + one for the Codex generator update)
Author: planning conversation, 2026-05-04
Pattern reference: [`.scratch/impeccable/plugin/skills/impeccable/SKILL.md`](../../.scratch/impeccable/plugin/skills/impeccable/SKILL.md), already proven in this repo by `wf-design` (shipped v8.27)

---

## 1. Why — context and decomposition

### 1.1 Current command surface

`plugins/sdlc-workflow/commands/` carries **73 user-invocable slash commands**:

- **42 `wf-*` lifecycle commands** at the top level (`wf-shape`, `wf-slice`, `wf-plan`, `wf-implement`, `wf-verify`, `wf-review`, `wf-handoff`, `wf-ship`, `wf-retro`, `wf-design`, `wf-next`, `wf-status`, `wf-resume`, `wf-sync`, `wf-announce`, `wf-amend`, `wf-extend`, `wf-ideate`, `wf-how`, `wf-quick`, `wf-rca`, `wf-investigate`, `wf-discover`, `wf-instrument`, `wf-experiment`, `wf-benchmark`, `wf-profile`, `wf-skip`, `wf-close`, `wf-hotfix`, `wf-update-deps`, `wf-docs`, `wf-refactor`, `wf-intake`).
- **31 `commands/review/<dim>.md`** per-dimension review files (already nicely namespaced under a folder).
- **7 `review-*` aggregates** (`review-all`, `review-architecture`, `review-infra`, `review-pre-merge`, `review-quick`, `review-security`, `review-ux`).
- **`setup-wide-logging.md`** (one-shot bootstrap; out of scope).

All 73 commands already carry `disable-model-invocation: true`, so they only fire on explicit slash-invocation. The pollution problem is the `/`-menu surface, not auto-trigger competition.

### 1.2 Why this matters

- **Slash-menu pollution.** Every command shows in the user's `/`-menu and consumes a name slot in the global slash namespace.
- **Boilerplate duplication.** The "External Output Boundary" preamble appears verbatim in roughly every command file. Editing it requires touching dozens of files.
- **Codex shadow tree.** `plugins/sdlc-workflow/.codex-generated/skills/<command>/SKILL.md` mirrors every command (produced by `scripts/generate-codex-plugin.mjs`). Each command emits a Codex skill, doubling the surface to maintain.

### 1.3 The pattern (impeccable)

Impeccable consolidates 23 commands into one router skill. Its dispatch is:

1. **One trigger surface** — `SKILL.md` frontmatter has a keyword-rich `description:` listing every action verb. The harness auto-trigger sees one skill, not 23.
2. **A short routing rule, not 23** — three sentences in `SKILL.md` body: no-arg → menu; first word matches → load `reference/<word>.md`; first word doesn't match → general invocation.
3. **Reference files loaded on demand** — `reference/polish.md`, `reference/audit.md`, etc. live next to `SKILL.md` but are *not* loaded until the routing rule fires.
4. **Pinning is a redirect shim** — `scripts/pin.mjs:90-106` writes a 10-line `SKILL.md` whose entire body is *"Invoke /impeccable {command}, passing along any arguments provided here."* The pinned skill never duplicates the reference content.
5. **Single-source metadata** — `scripts/command-metadata.json` is the source of truth for description + argument-hint per command. Both the build and `pin.mjs` read it.

The wf-design command in this repo (commands/wf-design.md, v8.27) is the same pattern, already shipped — 22 design sub-commands collapsed behind a single router. The retrofit generalizes that one win to the rest of the plugin.

### 1.4 Decomposition — 4 routers replacing ~73 commands

| Router | Replaces | Old count | New files |
|---|---|---|---|
| `/review` | `review-all`, `review-architecture`, `review-infra`, `review-pre-merge`, `review-quick`, `review-security`, `review-ux`, `review/<31 dims>` | 38 | 1 router + 1 skill + 38 references + 38 shims |
| `/wf-quick` | `wf-quick`, `wf-rca`, `wf-investigate`, `wf-discover`, `wf-hotfix`, `wf-update-deps`, `wf-docs`, `wf-refactor`, `wf-ideate`, `wf-intake` | 10 | 1 router + 1 skill + 10 references + 10 shims |
| `/wf-meta` | `wf-next`, `wf-status`, `wf-resume`, `wf-sync`, `wf-amend`, `wf-extend`, `wf-skip`, `wf-close`, `wf-how`, `wf-announce` | 10 | 1 router + 1 skill + 10 references + 10 shims |
| `/wf` (lifecycle) | `wf-shape`, `wf-slice`, `wf-plan`, `wf-implement`, `wf-verify`, `wf-review`, `wf-handoff`, `wf-ship`, `wf-retro`, `wf-instrument`, `wf-experiment`, `wf-benchmark`, `wf-profile` | 13 | 1 router + 1 skill + 13 references + 13 shims |
| `/wf-design` | (already a router, stays) | 1 | (no change) |

Untouched: `setup-wide-logging.md`. Total old surface: 73 → new surface: 5 routers + 1 unchanged + 71 thin shims.

---

## 2. Migration plan

### 2.1 Non-goals

- **No semantic edits to command bodies during migration.** Word-for-word relocation only. This makes verification a `diff`, not a behavioral comparison.
- **No changes to `setup-wide-logging` or any non-`wf-*`/non-`review*` command.**
- **No changes to skills.** Skills auto-trigger via `description:` and don't pollute the slash menu.
- **No changes to `release-automation`, `diataxis`, `daily-carry`, `daily-tags`.** None have command sprawl at sdlc-workflow's scale.

### 2.2 Hard constraints (from the inventory probe)

- **939 cross-references** to `/wf-*` and `/review` strings exist across 157 files in the plugin tree. Migration must preserve every existing slash invocation as a working alias, or rewrite every reference. The plan chooses preservation (pinned shims).
- **The `.codex-generated/` mirror** is real and consumed by Codex installs. The generator must be updated in lockstep so Codex users don't see different behavior than Claude users.

### 2.3 Phasing

Five PRs. Each independently revertable. Order ascending by blast radius — smallest first so the verification harness gets stress-tested on simpler PRs before the highest-blast PR lands.

1. **PR-1: `/review` router** (38 → 1). Largest mechanical scope; lowest semantic coupling (review commands don't invoke each other).
2. **PR-2: `/wf-quick` router** (10 → 1). Standalone entry points; no inter-stage deps.
3. **PR-3: `/wf-meta` router** (10 → 1). Lifecycle navigation; mostly small files.
4. **PR-4: `/wf` lifecycle router** (13 → 1). Highest blast radius; many internal docs reference these. Lands last with the longest pin-shim window.
5. **PR-5: Codex generator update**. Updates `scripts/generate-codex-plugin.mjs` to consume the new structure, regenerates `.codex-generated/`. Generator is updated once and re-run per PR; PR-5 is the formal landing of the regenerated tree.

### 2.4 Per-PR mechanics (worked example: PR-1 `/review`)

Other routers follow the identical recipe.

#### Step 1 — Build the reference tree

For each old command file `commands/review-all.md` and `commands/review/<dim>.md`:

1. **Copy the file body byte-for-byte** (everything below frontmatter) into `skills/review/reference/<key>.md` where `<key>` is:
   - `review-all` → `_aggregate-all.md`
   - `review-architecture` → `_aggregate-architecture.md` (and the other six aggregates similarly, prefixed `_aggregate-` to keep them distinct from per-dimension files)
   - `review/security.md` → `security.md`
   - … one-to-one mapping
2. **Strip `disable-model-invocation: true`** from the relocated frontmatter (no longer a slash command).
3. **Strip `name:`** (no longer addressable on its own).
4. **Keep `description:` and `args:`** — these become metadata that the router reads.

Result: 38 reference files whose **bodies are byte-identical to the corresponding command body**. This invariant is the load-bearing claim of the verification plan.

#### Step 2 — Build the router

Create `commands/review.md` modeled on `commands/wf-design.md`:

```markdown
---
name: review
description: Code review router. /review <dimension> for a per-dimension review (security, correctness, …); /review <aggregate> for a multi-dimension pass (all, architecture, infra, pre-merge, quick, security, ux). 31 dimensions, 7 aggregates.
argument-hint: "[scope] [dimension|aggregate]"
disable-model-invocation: true
---

[External Output Boundary block — copied verbatim from review-all.md once]

# Step 0 — Resolve dimension or aggregate

Parse $ARGUMENTS. First token that matches a known key wins.

Known dimensions: accessibility, api-contracts, architecture, …
Known aggregates: all, architecture, infra, pre-merge, quick, security, ux

# Step 1 — Load reference

If aggregate: read $CLAUDE_PLUGIN_ROOT/skills/review/reference/_aggregate-<name>.md
If dimension: read $CLAUDE_PLUGIN_ROOT/skills/review/reference/<name>.md

Follow its instructions verbatim. The remaining tokens after the matched key are the scope/target/paths.
```

Router body target: ≤80 lines. **No semantic logic moves into the router.** It parses, it loads, it hands off.

#### Step 3 — Build the skill manifest

`skills/review/SKILL.md`:

```markdown
---
name: review-references
description: (loaded by /review router; not user-invocable)
user-invocable: false
---

Reference library for /review. Each file under `reference/` is the original body
of a former /review-* or /review/* command, relocated unchanged.
```

`skills/review/review-metadata.json`: single source of truth for description + argument-hint per dimension/aggregate. Used by shim generator and any future codegen.

#### Step 4 — Build the pin shims

Adapt `.scratch/impeccable/plugin/skills/impeccable/scripts/pin.mjs:90-106` into `plugins/sdlc-workflow/scripts/router-shim.mjs`. For each old command name (`review-all`, `review-architecture`, …, `review/security`, …), write a 10-line shim at the original path:

```markdown
---
name: review-architecture
description: "(Pinned shortcut for /review architecture) Comprehensive architecture review …"
argument-hint: "[scope] [target]"
disable-model-invocation: true
---
<!-- sdlc-workflow-pinned-shim -->
Invoke `/review architecture`, passing along any arguments provided here, and follow its instructions.
```

For nested commands (`commands/review/security.md`), the shim sits at the same nested path so existing references keep resolving.

The shim's `description` is **copied verbatim** from the original. Auto-trigger behavior is unchanged because the description text is unchanged. (Auto-trigger is moot here because `disable-model-invocation: true`, but identical description prevents user-visible drift in `/`-menu listings.)

#### Step 5 — Update plugin metadata

- `plugins/sdlc-workflow/.claude-plugin/plugin.json` `description`: trim the per-dimension list, advertise `/review`.
- `plugins/sdlc-workflow/CHANGELOG.md`: bump per PR (`v8.32.0` for PR-1, `v8.33.0` for PR-2, …).
- `.claude-plugin/marketplace.json` plugin `version` field: bump match.

#### Step 6 — Update the Codex generator (lands in PR-5)

`scripts/generate-codex-plugin.mjs` currently reads each `commands/*.md` and emits `.codex-generated/skills/<name>/SKILL.md`. After migration, shims would become Codex skills with empty redirect bodies — useless on Codex. Two options:

- **Option A (recommended)**: skip files matching the `<!-- sdlc-workflow-pinned-shim -->` marker; emit one Codex skill per *router* and bundle the reference files alongside.
- **Option B**: leave the generator alone and let it emit shim-only Codex skills. Simpler but produces empty Codex behavior.

Plan adopts Option A. PR-5 ships the generator change and the regenerated tree together.

### 2.5 Rollback plan

Each router PR is a single squash-merge commit. Rollback = `git revert <commit>`. Safe because:
- Reference files are *additions* (no destructive moves).
- Old command files are *replaced with shims*, not deleted — the original bodies live in git history.
- Plugin.json / marketplace.json description bumps revert cleanly.

The verifier script (Section 3.1) runs in revert direction too — a revert that misses a file fails CI just as forwards do.

### 2.6 Effort estimate

| PR | LOC moved | LOC written (router + shims + script) | Verification work |
|---|---|---|---|
| PR-1 review (38 cmds) | ~6,000 | ~300 (router) + ~380 (shims) + ~250 (verifier) | First-time harness build: ~1 day |
| PR-2 wf-quick (10) | ~3,500 | ~120 + 100 + 0 | ~2 hours |
| PR-3 wf-meta (10) | ~2,000 | ~120 + 100 + 0 | ~2 hours |
| PR-4 wf lifecycle (13) | ~5,500 | ~150 + 130 + 0 | ~half day (high-blast smoke test) |
| PR-5 Codex gen | n/a | ~80 (generator update) | regen + spot-check |

Total: ~17,000 LOC relocated + ~1,500 LOC of new infrastructure. Pure-relocation churn dominates; new logic concentrates in 5 router files.

### 2.7 Risks and mitigations

| Risk | Mitigation |
|---|---|
| Router parsing rejects an arg-shape some old command accepted (e.g. `/wf-implement reviews <slice>` where "reviews" is a special token) | Layer 2 fixtures (Section 3.2) cover special tokens; the router's metadata.json carries per-stage `special-tokens` lists that the parser checks before treating the second positional as a slug |
| Shim's pinned `description` differs by even one character from the pre-migration version → harness drift | Verifier diffs `description:` text byte-equal vs the git history of the original file |
| `.codex-generated/` drift across PR-5 | Codex generator runs in CI; PR-5 fails if regenerated files differ from committed ones |
| Hooks reference command paths (e.g. `wf-validate` pre-write hook keys off invocation context) | Audit `plugins/sdlc-workflow/hooks/` before PR-1 lands; if hooks key off command names, shims preserve those names so hooks keep firing — verify in Layer 3 (real-workflow smoke test) |
| User custom prompts/macros referencing old slash commands | Shims preserve every old name; only user-visible change is *new* options (`/wf shape`, `/review architecture`) appearing alongside |
| Per-slice review artifact contracts (v8.30 work) regressing | Layer 2 fixtures include `wf-review` and `wf-handoff` invocations exercising the per-slice frontmatter contract; static equivalence already guarantees the body that produces those artifacts is unchanged |

### 2.8 Out of scope (followups)

- **Removing shims.** Once external docs migrate to new syntax, shims can be dropped behind a `--legacy-shims` flag in the marketplace install. Not part of this migration.
- **Consolidating boilerplate further.** Some stage references could share a preamble file. Risk-add for no win during migration; revisit in a later cleanup PR.
- **Migrating other plugins.** None have the slash-command pollution problem at sdlc-workflow's scale.

---

## 3. Verification plan

The migration's correctness claim:

> For any user invocation `<old-command> <args>`, the resulting model behavior is equivalent to invoking `<router> <subcommand> <args>`.

"Equivalent" is precisely defined below. Verification has four layers, each catching a different failure class.

### 3.1 Layer 1 — Static equivalence (mechanical, runs in CI)

A new script `plugins/sdlc-workflow/scripts/verify-router-migration.mjs` checks five invariants:

1. **Body preservation.** For every old command in the migration scope, the original body (everything below frontmatter) is **byte-equal** to the corresponding `skills/<router>/reference/<key>.md`. The verifier reads the pre-migration file from `git show <pre-migration-sha>:plugins/sdlc-workflow/commands/<file>.md`. Failures print the diff.
2. **Shim coverage.** Every old command path still exists. Each shim file:
   - Has the `<!-- sdlc-workflow-pinned-shim -->` marker.
   - Has identical `description:` and `argument-hint:` to the pre-migration version.
   - Has body matching the canonical shim template (modulo whitespace).
3. **Router resolves all keys.** For each shim's old name, the corresponding key in `skills/<router>/<router>-metadata.json` exists, and the router file references that metadata.
4. **No orphaned references.** Grep all `*.md` files in the plugin for `/wf-*` and `/review*` strings; verify every match resolves to (a) an existing shim, (b) an existing router invocation pattern, or (c) a documented allowlist (changelog entries describing history). New unresolved references fail CI.
5. **External Output Boundary preserved.** The five-line boundary block is present in either the router or the reference (verify by string match) for every flow that originally had it.

The script runs locally as `node plugins/sdlc-workflow/scripts/verify-router-migration.mjs` and in a GitHub Action. The action runs on every PR touching `plugins/sdlc-workflow/`.

**Why this is load-bearing:** the migration's claim that "no semantic edits during relocation" reduces to a `diff`. The verifier doesn't need a markdown parser; it needs `diff`. If body preservation passes, the only remaining variation between old and new is the routing wrapper itself — which is a small, manually-reviewable file.

### 3.2 Layer 2 — Behavioral equivalence (recorded transcripts)

Static equivalence proves *the same instructions get into context*. It doesn't prove *the model behaves the same when given those instructions via a router*. The router adds a parsing step that could trip up the model on edge cases (ambiguous tokens, mistyped subcommand, etc.).

#### 3.2.1 Fixture set

`plugins/sdlc-workflow/tests/migration-fixtures.json`:

```json
[
  {"id": "review-security-pr",      "old": "/review-security pr 123",            "new": "/review security pr 123"},
  {"id": "review-all-worktree",     "old": "/review-all worktree",               "new": "/review all worktree"},
  {"id": "review-correctness-file", "old": "/review correctness src/foo.ts",     "new": "/review correctness src/foo.ts"},
  {"id": "review-no-args-menu",     "old": "/review-quick",                      "new": "/review quick"},
  {"id": "review-nested-path",      "old": "/review/security pr 123",            "new": "/review security pr 123"},
  {"id": "wf-shape-slug",           "old": "/wf-shape add-onboarding",           "new": "/wf shape add-onboarding"},
  {"id": "wf-implement-resume",    "old": "/wf-implement add-onboarding",        "new": "/wf implement add-onboarding"},
  {"id": "wf-implement-reviews",   "old": "/wf-implement reviews onboarding-1",  "new": "/wf implement reviews onboarding-1"},
  {"id": "wf-status-no-args",      "old": "/wf-status",                          "new": "/wf-meta status"},
  {"id": "wf-quick-bug",           "old": "/wf-quick fix flaky test",            "new": "/wf-quick quick fix flaky test"},
  {"id": "wf-rca-incident",        "old": "/wf-rca payment-timeout 2026-04-30",  "new": "/wf-quick rca payment-timeout 2026-04-30"},
  {"id": "wf-design-craft",        "old": "/wf-design craft hero",               "new": "/wf-design craft hero"}
]
```

Aim for ≥3 fixtures per router (happy path, no-arg → menu, malformed-arg) plus at least one fixture per *category* of edge case the routing rule has to disambiguate (special tokens like `reviews` in wf-implement, nested paths, slug-vs-subcommand ambiguity).

#### 3.2.2 Replay harness

A new script `plugins/sdlc-workflow/scripts/replay-fixtures.mjs` uses the **Claude Agent SDK** to:

1. Spawn an isolated agent with the plugin loaded.
2. For each fixture, send the invocation as a user prompt.
3. Capture the agent's first 5 tool calls (most invocations route + load context within 5 calls).
4. Capture the first text response.
5. Hash and store as a fixture transcript.

Run twice:

- Once on the **pre-migration** branch → produces `tests/transcripts/baseline/<fixture-id>.json`.
- Once on the **post-migration** branch → produces `tests/transcripts/migrated/<fixture-id>.json`.

Diff. The diff tool normalizes irrelevant variation:

- File paths in tool calls (the router adds a `Read skills/.../reference/<x>.md` step that the baseline lacks — that's expected and *allowed*; it's annotated and ignored).
- Timestamps and run IDs.
- Model-level rephrasing in *text* responses is allowed if **tool-call sequences match** modulo the allowlisted Read.

A fixture passes when the post-migration tool-call sequence equals the baseline's, with at most one extra `Read` of a `reference/<x>.md` file inserted near the start.

### 3.3 Layer 3 — Smoke test on a real workflow

Pick one in-flight workflow under `.ai/workflows/` and run a complete `wf-shape → wf-slice → wf-plan → wf-implement → wf-verify → wf-review → wf-handoff` sequence end-to-end on the migrated branch, **using the shim invocations** (`/wf-shape`, `/wf-slice`, …). The whole flow must complete without the user touching the new `/wf` syntax.

This proves the shims are load-bearing for backwards compat, not just lab-passing. If shim flow works: the migration is invisible to existing users. They opt into `/wf <stage>` if they want; old keys keep working.

### 3.4 Layer 4 — Manual review per router

A reviewer reads the *router file* line-by-line for each PR. The router is the only file with new logic; references are byte-equal to history. Review checklist:

- Routing rules match the metadata.json keys exactly.
- Argument forwarding preserves `$ARGUMENTS` semantics — the reference body expects either "subcommand stripped" or "raw $ARGUMENTS"; both work, but the router's parsing must match what each reference assumes.
- The External Output Boundary block is preserved verbatim.
- `disable-model-invocation: true` is present.

This catches the one class of bug the static and behavioral layers can't: subtle differences in how the router formats handoff context to the reference body.

### 3.5 Acceptance gates

| Gate | Threshold | Action on fail |
|---|---|---|
| Layer 1 static equivalence | 100% | Block PR merge |
| Layer 2 fixture pass rate | ≥95% (allowing 1 fixture flake out of ~20) | Investigate failures; only merge after each non-flake failure has a documented root cause |
| Layer 3 real-workflow smoke | full lifecycle completes via shims | Block merge until reproduced and fixed |
| Layer 4 manual router review | reviewer sign-off per PR | Block merge until addressed |
| Plugin metadata version bumped | mandatory | Block merge |
| Codex generator regeneration clean | mandatory after PR-5 | Block merge |

---

## 4. First concrete artifacts

If this plan is greenlit, PR-1 (`/review`) is built in this order:

1. Write `plugins/sdlc-workflow/scripts/verify-router-migration.mjs` and the GitHub Action that runs it.
2. Adapt `.scratch/impeccable/plugin/skills/impeccable/scripts/pin.mjs` into `plugins/sdlc-workflow/scripts/router-shim.mjs`.
3. Build `commands/review.md`, `skills/review/SKILL.md`, the 38 reference files, the 38 shims, the `review-metadata.json`.
4. Write the 5 review-related fixtures + the replay harness using the Claude Agent SDK.
5. Run Layer 1 + Layer 2 against the PR. If green: hand to the user for Layer 3 smoke test on a real review.
6. Squash-merge. Tag v8.32.0.

PR-2 through PR-4 reuse infrastructure from PR-1 (verifier, shim generator, replay harness) and ship in days, not weeks each.
