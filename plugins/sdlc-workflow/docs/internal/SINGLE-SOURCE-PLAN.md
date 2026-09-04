# Single-Source Plan — one plugin tree serving Claude Code and Codex

Status: **BUILT AND SHIPPED 2026-09-03 as sdlc-workflow v9.153.0 (marketplace
1.179.0), W0–W8 in one release.** What landed, and where the build departed from
the text below:
- W0/W0a/W2: no CRLF file remained by build time (the W0 line is stale); the
  contract cluster was merged by hand first; `_host-invocation.md` is new.
- W1: the delta audit was executed as a re-runnable residual-diff pass (dialect
  normalized) rather than a written matrix; the numbers at build time were 181
  shared files, 70 identical, 5 dialect-only, 115 real (median 10 lines, 7%).
- W3: 65 files were normalized mechanically (paths, timestamps, the recurring
  gate-question phrasings), then fifteen parallel merge agents reconciled the
  115 real-difference files against the contract cluster under a written rubric.
  The canonical invocation spelling is `/wf`; `$wf` maps ONLY in
  `_host-invocation.md`. The Claude YAML question spec is treated as host-neutral
  data. The fifth (reserve) contract file is `yolo.md`. The imagery provider
  table names Codex's built-in `image_gen` as availability data.
- W4: the codex adapter scripts sit flat under `hooks/`; `seed-memory` is
  spawned by the Codex SessionStart adapter through `runBundled` (so the
  `SDLC_HOST` signal is present) instead of being a direct `dist/` hook command.
  `SDLC_HUB_STARTED_BY` is derived at the single spawn site and a guard rejects
  any other setter. The root `scripts/generate-codex-plugin.mjs` was deleted too.
- W5: every content page (25) carries a uniform host note; `reference/hosts.html` is new;
  `installation.html` carries both routes and the cutover box; `verify-doc-site`
  gained invariants (e) and (f). Codex-only `native-operating-model.md` and
  `verification.md` were dropped as generic guidance the stages already carry.
- W6: the burndown allowlist is EMPTY at cutover (the merge landed in full); the
  merge-base check treats a list absent at the merge base as the baseline.
  `verify-no-legacy-codex.mjs` was retired in favor of `tests/unit/single-source.test.mjs`.
- W7: step 0 preflight ran in a scratch `CODEX_HOME`; step 2 (per machine) is
  the operator's, in an interactive session, per `SINGLE-SOURCE-CUTOVER.md`.
- Live contract: `docs/internal/HOST-NEUTRALITY.md`.

Original status: **DRAFTED 2026-07-29 — investigation + coexistence spike complete, all
contract questions answered green. Proposals only; nothing built.**
**REVIEWED 2026-07-29** (in-tree review + external panel). The platform
contract survived review unchanged; the migration mechanics did not. Corrections
folded in: C6's snapshot sizes were wrong by ~6× (§2, §5), host detection by
path breaks silently at cutover (W1/W4, P1), the doc site is a whole
unaddressed workstream (new W5, P2), Claude-only keys have no enforceable
Codex exclusion (W3, P1), and 12 main-tree tests reach into the deleted tree
(W6, P1). Two external claims were corrected on mechanism rather than adopted
verbatim — see the P1 notes in W3 and W6.
**REASSESSED 2026-07-29 (second external audit, source-pinned to openai/codex
`78a61de904699beffcb033fe2b59a10c11f31caa`).** Three more corrections landed,
two of them reversals of claims this document previously asserted: C11's
fail-closed reading of a missing `openai.yaml` was **backwards** (Codex defaults
implicit invocation to ALLOW), the `yolo` exclusion is **instructional, not
enforceable** (Codex's catalog exposes skills, not sub-command keys), and the
rollout was **not atomic** — W7 published a SHA whose catalog pointed at a
deleted tree. Plus: `SDLC_HOST` was never the only host signal (§3.4),
allowlist monotonicity needs a merge-base check (W6), and cutover needs a
preflight and a rollback runbook (W7).
**SCOPED 2026-07-29 (PO challenge: "why double file size with per-host
sections — is one prose impossible?").** It is not impossible; it is what 93%
of the content already is. Measuring the trees settled it: after dialect
normalization the median differing file differs by **22 lines, 7% of itself**
(§1). The plan now states **neutrality-first with a hard budget — host-specific
text in at most 5 named files (§3.3)** — prefers a two-column table to two
prose sections, and adds **W0a, a merge spike** whose stop conditions are the
budget and file growth rather than a judgment call. Expected size effect on
stage files is SHRINKAGE, not growth.
**AUDITED AGAIN 2026-07-30 (third round) — readiness assessed at ~80%, and most
findings were this document contradicting ITSELF.** Fixed: the 5-file budget
forbade host text that W3 and W5 require, so it now scopes to **host-mechanics
prose under `skills/`** with an enumerated permanent-exception list (§3.3); the
spike's non-growth rule would have failed W0a's own targets, so it applies to
caller and stage files only, with contract files judged on duplication density;
two stale spots restored the disproven fail-closed `openai.yaml` reading (W3,
W8); W8 asked Codex for a key catalog that C10 says does not exist; the risk
section still claimed one host signal after §3.4 adopted two; the W7 rollout
opened a session with both plugin identities enabled. Also: the effort split is
**17+88+22+11**, the doc site is **24 of 25** pages, `runtime-parity.test.mjs`
is **rewritten** (decision made), and §1's measurement is now a committed,
re-runnable script rather than an unreproducible number. The PO
directive is a true single source that BOTH hosts read directly — explicitly
NOT a generated Codex mirror (that option was proposed and rejected). Every
platform fact below was verified this session against the Codex CLI 0.146.0
Rust source and a live sandboxed spike (toy merged
plugin, scratch `CODEX_HOME`, local marketplace install, headless `codex exec`
with `--dangerously-bypass-hook-trust`), plus `claude plugin validate --strict`.
Supersedes: the "Authoring source: Claude-native (canonical) — no migration to
a host-neutral spec" decision in
[MULTI-HOST-SUPPORT-PLAN.md](archived/MULTI-HOST-SUPPORT-PLAN.md) (2026-05, pre-dates
the v9.107.0 handwritten-codex cutover) and the v9.107.0 decision itself
(handwritten per-host trees). Antigravity remains out of scope here.
Related: [archived/CODEX-PLUGIN-MIGRATION-PLAN.md](archived/CODEX-PLUGIN-MIGRATION-PLAN.md) ·
`archived/CODEX-PLATFORM-GAPS.md` · the codex tree's `MIGRATION.md` (its "handwritten
for Codex" contract is what this plan retires).

---

## 1. Goal and current cost

Today two trees carry the same lifecycle: `plugins/sdlc-workflow` (Claude,
canonical) and `plugins/sdlc-workflow-codex` (handwritten Codex mirror). The
runtime payload (`dist/`, `assets/`, `components/`, `schemas/`, manifest) is
already byte-identical via `sync:codex` + parity gate — the duplication that
costs maintenance is **prose, hooks wiring, manifests, docs, tests**:

- Measured 2026-07-29: of 176 Claude skill files, **127 differ**, 9 are
  codex-only, 2 are Claude-only, and only 47 are byte-identical. 138 files need
  a decision. The transform is deliberately non-mechanical.
- **How MUCH they differ — this reframes the whole merge.** Reproduce with
  `node plugins/sdlc-workflow/scripts/measure-host-divergence.mjs --top=20`
  (read-only; committed precisely because these numbers steer the design and the
  effort split, so a later audit must be able to re-derive them rather than
  trust them). It normalizes the host dialect and NOTHING else: CRLF→LF;
  `$wf`/`/wf`→`<WF>`; `${CLAUDE_PLUGIN_ROOT}`/`${PLUGIN_ROOT}`/`<skill-dir>`→
  `<ROOT>`; trailing whitespace stripped. Per-file counts are a multiset
  symmetric difference over trimmed non-empty lines — line moves are free, and
  reflowed prose is slightly overstated, which is the safe direction. Delete the
  script in the same commit as the codex tree (W4). Across the 174 shared files:
  - 47 are already byte-identical;
  - 17 more become identical under dialect normalization ALONE;
  - 110 keep some differing line, but the **median is 22 differing lines — 7%
    of the file**;
  - only **22 files** differ by more than 20%;
  - 4,502 lines differ tree-wide, and the metric counts any reworded line, so
    much of that total is ordinary editing drift from months of separate
    maintenance, not host mechanics.

  So the two trees are **not two dialects of one document — they are the same
  document twice, with a few mechanism references spelled differently.** The
  typical file is 93% shared prose already. This is a reconciliation of two
  drifted copies, not a translation between hosts, and the plan must be read
  that way: the default outcome per file is ONE prose and no host sections.

  Worked example — `wf/reference/close.md`, ~200 lines, **5 differing lines**
  after normalization: a gate-question phrasing, two timestamp lines, and a
  path spelling. None needs a host section. The timestamp line is instructive:
  the CODEX copy is already the neutral form (`<real UTC timestamp per
  _timestamp.md>` — a citation) while the Claude copy inlines `date -u +…`.
  Neutralizing often means **adopting the existing codex spelling**, not
  inventing a third one.
- Accidental drift exists: `skills/wf/reference/_fix-loop.md:30` still reads
  "has a exit code" where the codex copy (line 33) reads "an" — and the same
  diff carries the *intentional* divergence two hunks above it (Claude `model:
  sonnet` pins vs Codex effort tiers). One file, both drift classes. No gate
  catches the accidental one: gates check runtime parity and claudisms, not
  prose parity.
- A version bump sweeps 2 trees (incl. 2 codex manifests no gate covers).
- Every prose improvement must be re-authored twice, in two host dialects.
- The claudism gate itself leaks: `sdlc-workflow-codex/skills/wf/reference/
  probe.md:81` ships `${CLAUDE_PLUGIN_ROOT}` today and `verify-claudisms` is
  clean, because none of its 7 families match plugin-root spelling.

End state: **one tree at `plugins/sdlc-workflow`** carrying both host
manifests, host-neutral skill prose with per-host contract sections, two hook
wiring files sharing one `lib/`, one `dist/`. `plugins/sdlc-workflow-codex`,
`sync:codex`, `runtime/`, `runtime-baseline.json` are deleted.

## 2. Verified platform contract (the load-bearing facts)

Every item here is what makes the single tree feasible. Cite before trusting —
Codex CLI moves fast; anchors are to **0.146.0 at `openai/codex`
`78a61de904699beffcb033fe2b59a10c11f31caa`**. "@ master" was the original
wording and is worthless as a citation: master moves, so a fact "verified
against master" cannot be re-checked or falsified later. Any future re-audit
records its own SHA here rather than overwriting this one — the point is to be
able to diff two known revisions when a claim stops holding.

| # | Fact | Evidence |
|---|---|---|
| C1 | Codex manifest discovery precedence: root `plugin.json` (only with agent-plugins `$schema`) → `.codex-plugin/plugin.json` → `.claude-plugin/plugin.json` → `.cursor-plugin/plugin.json`. A tree with both dot-manifests: Codex reads `.codex-plugin`, ignores `.claude-plugin`. | `codex-rs/utils/plugins/src/plugin_namespace.rs` (`DISCOVERABLE_PLUGIN_MANIFEST_PATHS`, test `preserves_codex_claude_cursor_legacy_precedence`) |
| C2 | `.codex-plugin/plugin.json` supports `"hooks"`: single path, array of paths, inline object, or inline list — paths resolved under plugin root, `./` prefix required. | `codex-rs/core-plugins/src/manifest.rs` (`RawPluginManifestHooks`) |
| C3 | **A declared `hooks` entry REPLACES conventional discovery.** `hooks/hooks.json` is only consulted when the manifest declares nothing (`DEFAULT_HOOKS_CONFIG_FILE` fallback in the `None` arm). | `codex-rs/core-plugins/src/loader.rs` `load_plugin_hooks()` — and proven live: spike plugin declared `./hooks/codex.hooks.json`; that hook fired (the `commandWindows` variant, so Windows-specific commands work), while a decoy `hooks/hooks.json` and the Claude hooks file were **not** loaded (0 decoy markers in the session rollout) |
| C4 | Codex tolerates Claude-only SKILL.md frontmatter (`disable-model-invocation: true`, `argument-hint`) — skill still discovered and cataloged. | Spike: `merged-toy:toy` listed under "Available skills" with that frontmatter present |
| C5 | Codex skill visibility is governed by the sibling `agents/openai.yaml` `policy.allow_implicit_invocation` — `false` hides the skill from the catalog entirely (re-confirmed the v9.107 gotcha, reproduced then fixed in the spike). | Spike runs 1 vs 2 |
| C6 | Codex install = **verbatim snapshot copy** of the plugin dir into `~/.codex/plugins/cache/<marketplace>/<plugin>/<version>/`, **once per version**. Git-marketplace snapshots come from the git tree → only committed files ship. **Sizes (corrected 2026-07-29, git object bytes): the Claude tree is 21.52 MB committed, the codex tree 6.45 MB.** The Codex snapshot therefore GROWS ~3.3× at cutover, and each release adds another ~21.5 MB to the cache. Driver: `bin/tray/` = **10.90 MB** (three-platform Go helper binaries), then `skills/` 2.89, `dist/` 2.14, `docs/` 2.08. The earlier "≈3.4 MB merged vs 8.1 MB today" figure was wrong; §5 re-decides on the real numbers. | `git ls-files -s` + `git cat-file --batch-check` per subtree |
| C7 | Codex discovers our plugin via the repo's `.agents/plugins/marketplace.json` (explicit catalog, `source: local` path per plugin) — NOT by scanning. Repoint one path to migrate. | Repo root `.agents/plugins/marketplace.json`; bundled-marketplace layout in `~/.codex/.tmp/bundled-marketplaces/` |
| C8 | Hook trust is keyed per `<plugin>@<marketplace>:<hooks-file-relpath>:<event>:<idx>:<idx>` with a content hash. Any path or content change ⇒ re-trust. | `~/.codex/config.toml` `[hooks.state.*]` entries |
| C9 | Standards track exists for later: root `plugin.json` with `$schema: https://agent-plugins.org/schemas/1.0.0/plugin.schema.json` parses as an "Agent Plugins" manifest; `.codex-plugin/plugin.json` then acts as an **overlay** whose `hooks`/`apps`/`interface` REPLACE the base (skills default `./skills`). Not needed for this plan; noted for the future. | `codex-rs/core-plugins/src/agent_plugin_manifest.rs` |
| C10 | **Visibility is per-SKILL, never per-key.** C5's `allow_implicit_invocation` hides a whole skill; there is no mechanism to hide one sub-command. `yolo` is a KEY of the shared `wf` skill (`skills/wf/reference/yolo.md` + `skills/wf/workflows/`), not a skill of its own — so an `openai.yaml` cannot exclude it. Claude-only KEYS need a prose+test contract (W3); `openai.yaml: false` is only the lever for a future Claude-only SKILL. | C5 + `skills/wf/` layout (one `SKILL.md`, `reference/`, `workflows/`) |
| C11 | The Claude tree has **zero** `agents/openai.yaml` files today; the codex tree has 6 (one per skill, all `allow_implicit_invocation: true`). W3 imports all 6 **for their `interface:` metadata** (display name, short description, default prompt) — NOT for visibility. | `find skills -name openai.yaml` in both trees |
| C12 | **CORRECTION to C11 as first drafted, and to the folk reading of C5: implicit invocation DEFAULTS TO ALLOW.** `SkillMetadata::allows_implicit_invocation()` is `unwrap_or(true)`, pinned by the test `empty_skill_policy_defaults_to_allow_implicit_invocation`. So a **missing** `openai.yaml` does NOT hide a skill — it loses only the interface metadata. Only an **explicit `allow_implicit_invocation: false`** hides one. This inverts the risk direction: the failure mode of a forgotten stub is a shabby catalog entry, not an invisible skill; and `false` becomes the one deliberate lever for hard exclusion (W3). | `codex-rs/skills/src/model.rs:23-27` @ `78a61de9`. NOT independently reproduced in this tree — no vendored Codex source here; re-verify at the pinned SHA before relying on it for a hard-exclusion decision. |
| A1 | Claude Code `plugin.json` supports a `"hooks"` field (path / array / inline) besides conventional `hooks/hooks.json`. We deliberately do NOT rely on it (see §3) so no unproven Claude surface is load-bearing. | docs.anthropic.com plugins-reference |
| A2 | Claude ignores unknown root dirs/files and unrecognized manifest fields (warnings at most); nested `skills/<name>/agents/` is NOT scanned for agent definitions (only root `agents/`). `claude plugin validate --strict` passes on the merged toy (with `.codex-plugin/`, `openai.yaml`, decoy root files) with zero warnings. | docs + spike validate runs |

## 3. Target layout

```
plugins/sdlc-workflow/
├── .claude-plugin/plugin.json      # unchanged role; Claude reads only this
├── .codex-plugin/plugin.json       # adds: "skills": "./skills/",
│                                   #       "hooks": "./hooks/codex.hooks.json"
├── hooks/
│   ├── hooks.json                  # CLAUDE wiring — stays put, conventional,
│   │                               # untouched (zero Claude-side risk; Codex
│   │                               # provably ignores it per C3)
│   ├── codex.hooks.json            # CODEX wiring (from codex tree, commands
│   │                               # repointed runtime/dist → dist)
│   ├── <claude entry scripts>.mjs  # existing
│   └── <codex entry scripts>.mjs   # _adapter.mjs, session-start.mjs, … —
│                                   # names are already disjoint from Claude's
├── skills/                         # ONE prose tree, host-neutral + per-host
│   └── …/agents/openai.yaml        # Codex interface + policy metadata
│                                   # (Claude ignores; absence ≠ hidden — C12)
├── dist|lib|assets|components|schemas|renderers|…   # unchanged, shared
└── (deleted elsewhere: plugins/sdlc-workflow-codex/, sync:codex,
     runtime-baseline.json, runtime/ copy)
```

Key design choices:

1. **Claude hooks stay at `hooks/hooks.json` unchanged.** The spike's decoy
   result (C3) means Codex never sees that file once `.codex-plugin` declares
   its own. This removes the only contract point that wasn't provable without
   a live Claude reinstall (Claude's `"hooks"` manifest field, A1) from the
   critical path entirely.
2. **Codex plugin identity becomes `sdlc-workflow`** (name in
   `.codex-plugin/plugin.json`), replacing `sdlc-workflow-codex`. The old
   install must be explicitly removed on each machine; `verify-deployment`
   already owns legacy-detection and gains one more check (§W6).
3. **Neutrality-first, with a hard budget on host-specific text.** One prose
   serves both hosts in the overwhelming majority of files — the 7% median in
   §1 is the evidence, not an aspiration. Host-specific text is a **rationed
   exception**, permitted in **at most 5 named files**:
   - `_gate-question.md` — Claude has the `AskUserQuestion` structured-choice
     tool; Codex does not. 45 files reference the ladder; all 45 get one
     neutral sentence and cite this file.
   - `_subagents.md` — `Task` with `model:` pins vs a subagent with effort
     tiers. 14 files cite it; the neutral instruction states the INTENT ("a
     bounded profile; do not inherit the parent's configuration").
   - `_timestamp.md` — already the citation target both trees point at.
   - `_host-invocation.md` — inherently a two-column mapping, and tiny.
   - One reserve slot, to be named in W1 if the delta audit finds a fifth
     genuine case. An unnamed sixth file is a design failure, not a request.

   **What the budget governs, precisely.** It covers **host-mechanics prose
   under `skills/`** — text that names a host's tools, commands, invocation
   syntax, or dispatch machinery, or explains how to operate them. It does NOT
   cover two other things that are host-aware by necessity, and conflating them
   makes the budget unimplementable:
   - **Availability annotations are data, not mechanics.** "This key runs on
     Claude only" states WHERE a capability exists; it does not explain a host
     mechanism. The shared dispatch table's host-availability column and
     `yolo.md`'s opening restriction line are therefore **permanent, named
     exceptions**, required by W3 rather than tolerated. Their form is
     constrained instead: a table column and a single stated restriction, never
     a prose passage explaining Claude's Workflow tool.
   - **Per-host wiring and host-routed documentation are out of scope.**
     `hooks/*.json`, `agents/openai.yaml`, and the W5 doc-site pages that
     deliberately give per-host install and invocation routes are not
     skill-prose and were never inside the budget.

   The complete permanent-exception list, which the W6 gate encodes verbatim:
   the ≤5 host-contract files · the dispatch table's availability column ·
   `yolo.md`'s restriction line · `hooks/hooks.json` · `hooks/codex.hooks.json` ·
   the 6 `agents/openai.yaml` files · the W5 host-routed doc-site pages.

   Three rules make the budget real:
   - **Prefer a two-column table to two prose sections.** A table cannot drift
     into two divergent explanations of one rule; two prose sections can, which
     is the exact failure this plan exists to end.
   - **Skill files outside the exception list carry no host-mechanics text at
     all** — they cite. A file that "needs" a host section is a file whose
     mechanism belongs in one of the 5.
   - **W6's gate enforces the list**, and the list is the allowlist: host
     mechanics outside it fails. Growing the list requires editing the gate,
     which makes the exception visible in review instead of silent in a diff.

   Prose still dispatches itself at read time — skills are model-interpreted, so
   a file with per-host rows or sections needs no build step, because the model
   knows its host. The budget governs how rarely that mechanism is used.
4. **Code dispatches on an explicit host signal, never on its own path.** Today
   `hooks/seed-memory.mjs:25` reads `import.meta.url.includes('sdlc-workflow-codex')`.
   Same-path hosting makes every such test permanently false. Host identity
   moves to an environment signal, set by the per-host hook wiring and defaulted
   in code — see W1's audit and W4's fix.

   **There are TWO signals today, not one, and calling `SDLC_HOST` "the single
   sanctioned signal" was wrong.** The tree also carries `SDLC_HUB_STARTED_BY`:
   `scripts/hub-serve.mjs:58` and `dist/hub-serve.mjs:58` read it with their own
   independent `|| 'claude'` default, `lib/hub-lifecycle.mjs:248` sets it when
   spawning the hub, and the codex adapter sets **both**
   (`_adapter.mjs:115-116`), with a codex test pinning that dual behavior
   (`tests/hooks.test.mjs:255-259`). Two variables with two defaults means a
   future entrypoint can set one and not the other and produce contradictory
   provenance — a hub attributed to `claude` in a Codex-only session, with
   nothing failing. Required decision before W4, and it is not a coin flip:
   they have genuinely different subjects (which host is running THIS process vs
   which host LAUNCHED the long-lived hub), and a hub outlives the session that
   started it, so collapsing them loses real information. So **document both
   with distinct semantics, derive `SDLC_HUB_STARTED_BY` from `SDLC_HOST` at the
   single spawn site rather than letting callers set it independently, and audit
   both in W1's table.** Whichever way it resolves, one place decides.
5. **Executables get a `<skill-dir>` placeholder, not a relative path.** Doc
   links can be relative; command lines the model *runs* cannot, because the
   shell's cwd is the project root. The codex tree already uses
   `node <skill-dir>/scripts/…` (codex `consult/SKILL.md:61`,
   `imagery/SKILL.md:31-34`) — that is the merged spelling, and W6's gate
   enforces it against the 46 files that currently say `${CLAUDE_PLUGIN_ROOT}`.

   **The placeholder only works because the prose explicitly tells the model to
   resolve it**, and that instruction is easy to lose in a merge. The codex tree
   states it per-skill — "Resolve this skill's own directory `<skill-dir>` (where
   this SKILL.md is loaded from)" (`consult/SKILL.md:57`), "Let `<skill-dir>` be
   the directory this SKILL.md loads from" (`imagery/SKILL.md:10`). In the merged
   tree that substitution rule becomes part of the shared host contract
   (`_host-invocation.md`), stated once, with each scripted skill citing it. Two
   consequences: **the literal string must never reach a shell** — an unresolved
   `<skill-dir>` is a hard error, not a path — and W8 smoke-tests one scripted
   skill (`consult` is the cheapest, being read-only) on BOTH hosts, because this
   is a contract between prose and a shell that no static gate can prove.

## 4. Waves

### W0 — Hygiene gate (cheap, do first)
- Normalize line endings: the codex tree's CRLF files
  (`skills/wf/reference/intake/{ideate,investigate}.md`) go LF. There is **no
  repo-root `.gitattributes`** — each tree carries its own
  (`plugins/sdlc-workflow/.gitattributes`, 416 B, and the codex one, 633 B).
  Decide explicitly which survives and diff the two policies before merging;
  the codex file exists because buildId hashing needs LF. CRLF poisons every
  merge diff in W3 and the buildId discipline.
- Fix the two class-(c) items already known, in both trees, before the merge
  starts: the `_fix-loop.md` "a exit code" typo and the `probe.md`
  `${CLAUDE_PLUGIN_ROOT}` leak. They are independent of everything else.
- **Run W3–W4 on a branch/worktree, not behind a freeze.** The original plan
  froze both trees for the duration; with the W3 volume below that window is
  weeks long on a tree several sessions edit concurrently, and a freeze is a
  coordination promise rather than a mechanism. A branch plus the W6 burndown
  gate lets clusters land incrementally. Reserve an actual freeze for the W4
  packaging cutover, which is short.

### W0a — Merge spike (falsify the PROSE-MERGE design before classifying 138 files)

Scope note: this spike falsifies **one** bet — neutral skill prose plus the
host-mechanics budget. It does not validate the packaging cutover (W4), and it
says nothing about W5's presentation contracts, which stay open by design:
whether `installation.html` splits or gains a sibling page, and which invocation
convention shared pages use, are W5 implementation decisions that the spike
neither tests nor blocks. Do not read a green spike as "the plan is proven".

The bet is unvalidated today. Not one file is merged in the new shape. W1
classifies 138 files against a target shape nobody has built, so its rubric is
guesswork until one cluster exists. Merge the cluster first; W1 then classifies
against something real.

Target: the shared `_*.md` reference cluster — `_fix-loop.md`, `_steering.md`,
`_output-boundary.md`, plus the three codex-only host-contract files
(`_subagents.md`, `_gate-question.md`, `_timestamp.md`). Chosen for four
reasons, in order of weight:
1. **First in dependency order.** These files ARE the host-contract set; every
   later cluster consists of citing them. Wrong shape here means 130 citations
   pointing at something wrong.
2. **It has a partial mechanical check** — more than most prose merges get, and
   less than proof. The drift-guard tests (`shared-reference-drift`, `steering`,
   `output-boundary`) fingerprint these files by distinctive sentence, verify
   citation integrity, and detect a duplicated body. They do NOT prove that every
   semantic requirement survived a reconciliation: a rule can be reworded into
   uselessness while its fingerprint sentence stays intact. So the tests are a
   **necessary gate, not the acceptance criterion**. The spike also needs a
   per-file requirement inventory — list each normative statement in both source
   copies, check it off in the merged file — and a review of **every removed
   hunk**, since deletion is the failure mode fingerprints cannot see.
3. **It exercises both drift classes in a small sample** (`_fix-loop.md` carries
   an accidental typo drift and an intentional model-pin/effort-tier divergence
   in adjacent hunks).
4. **It is cheap to abandon** — no manifest, no hook, no packaging; a branch.

Run it on a branch, then measure the merge time per file: that number replaces
the W3 estimate, which is currently the least-evidenced figure in §6.

**Stop conditions — scoped to the budget, not to taste.** The spike fails when
any one of these occurs:
- The merge requires host-mechanics text in a skill file OUTSIDE the permanent
  exception list of §3.3.
- A drift-guard test passes only after its assertion is weakened.
- **A caller or stage file grows.** Neutralization should shrink these, because
  extracting inlined mechanics into a cited contract file removes text (the
  "EOB block inlined 21×" lesson). Growth here means sections are being written
  where citations belong.

**Non-growth does NOT apply to the contract files themselves, and applying it
there would guarantee failure.** `_subagents.md`, `_gate-question.md`, and
`_timestamp.md` exist only in the codex tree, so relative to the Claude tree
they grow from zero by construction, and relative to their codex originals they
grow by exactly the Claude half this wave exists to add. Measure them on a
different axis: **duplication density** — each host's rows or sections state
only what genuinely differs, with every shared statement written once above the
per-host split. A contract file that repeats the same rule twice in two dialects
has failed even while satisfying every size check.

NOTE: the earlier stop condition was "most passages need a host section", which
was unmeasurable and set no ceiling. Two revisions later the growth clause had
the opposite defect — it was countable but wrong for a third of the spike's own
targets.

When a stop condition occurs, delete the branch and reopen the design decision —
the rejected generated-mirror option returns with evidence behind it.

### W1 — Delta audit (the merge matrix)
Classify every hunk of the ~125 differing skill files into:
  (a) **host vocabulary/mechanics** — `/wf` vs `$wf`, Task-tool + `model:`
      pins vs subagent + effort pins, `AskUserQuestion` vs gate question,
      `${CLAUDE_PLUGIN_ROOT}` vs relative paths;
  (b) **intentional behavior** — pre-write blocking vs Stop-time convergence,
      key roster (Claude 21 keys incl. `yolo`; Codex 20), SubagentStart;
  (c) **accidental drift** — typo/wording fixes that landed in one tree only;
  (d) **stale cross-tree references** — prose that names the other tree and
      becomes false on merge (e.g. `skills/wf/reference/yolo.md:16`: "never
      mirrored to `sdlc-workflow-codex`").
Output: a per-file merge matrix; class (c) is reconciled immediately
(best-text wins, both trees, no waiting for the merge).
The codex `verify-claudisms.mjs` scan families are half the class-(a) spec —
reuse them as the classifier seed, and note the gap they have: no family
matches `CLAUDE_PLUGIN_ROOT` (§1), so the classifier seed needs that family
added before it is trusted as a coverage measure.

**Volume, so W3 can be sliced honestly** (measured over 176 Claude skill files):
`/wf ` appears in **106**, `${CLAUDE_PLUGIN_ROOT}` in **46**,
`AskUserQuestion` in **45**, Task-tool/subagent mechanics in **14**. That is the
neutrality debt W6's gate must burn down, not a rounding error.

**P1 — host-detection audit (a required W1 output, feeding W4).** Enumerate
EVERY place host identity is inferred from a path or a plugin name, because
same-path hosting silently inverts all of them. Known seeds:
`hooks/seed-memory.mjs:25` and its build output `dist/seed-memory.mjs:190`
(`ON_CODEX = import.meta.url.includes('sdlc-workflow-codex')` — the live
breakage), codex `hooks/_adapter.mjs` (`PLUGIN_NAME`, `runtimeRoot`,
`SDLC_HOST` default at line 115), `lib/hub-lifecycle.mjs:36`,
`hooks/render-on-artifact-write.mjs:216`, `hooks/session-start-orient.mjs:132`,
codex `scripts/verify-deployment.mjs` and `verify-no-legacy-codex.mjs`, plus
comments and contract prose that assert the two-tree layout. The audit output is
a table: site → current signal → post-merge value → fix. Anything reading a
path is rewritten to `SDLC_HOST`; anything reading a plugin name is checked
against the rename to `sdlc-workflow`.

### W2 — Host-contract files (the budget list — extraction, not extension)

These are the ≤5 files of §3.3, and W0a builds the first cut of them. Within
each, prefer a two-column table over two prose sections; use sections only where
the per-host text is too long for a table row.

- All three adapters (`_subagents.md`, `_gate-question.md`, `_timestamp.md`)
  exist **only in the codex tree**; the Claude tree has no counterpart. So
  "add the Claude half" is really *extract* Claude mechanics from dozens of
  inline call sites and leave citations — 45 files for the gate-question
  ladder, 14 for subagents. This is the "EOB block inlined 21× and drifted"
  shape from PROGRESSIVE-DISCLOSURE-AUDIT.md, and it is wave-sized, not a
  1–2 day prelude. Treat W2 as the first slice of each W3 cluster rather than
  a phase that must complete first: extract the contract for a cluster, then
  merge that cluster's files against it.
- Add `_host-invocation.md` (one mapping line: `/wf` under Claude Code, `$wf`
  under Codex; neutral spelling rules for shared prose).
- Write the neutrality rules: host-specific tool names may appear ONLY inside
  the ≤5 budgeted host-contract files (§3.3) and the per-host wiring (hooks
  files, `openai.yaml`) — nowhere else, at any size. This is the contract W6's
  gate enforces. The rules must name
  three spellings explicitly: invocation (`/wf` ↔ `$wf` → the
  `_host-invocation.md` mapping), reference links (relative), and **executable
  command lines (`<skill-dir>/scripts/…`, per §3.5)** — the third is the one
  the original draft collapsed into "relative paths", which does not work for
  commands run from the project root.

### W3 — Prose merge (the long pole)
File-by-file per the W1 matrix, into the Claude tree:
- Fold codex-only content in; rewrite host-specific passages to point at the
  host-contract files; dispatch tables mark host availability per key
  (`yolo` — Claude-only; anything Codex-only likewise).
- Path style: relative links (`reference/…`, `../../references/…`) for prose
  references — they work under both hosts. Executable command lines use
  `<skill-dir>/scripts/…` (§3.5) — this covers `skills/consult/SKILL.md:87`,
  `skills/imagery/SKILL.md:42-47,65`, `skills/uiproto/SKILL.md:26,30,48`.
  `${CLAUDE_PLUGIN_ROOT}` survives ONLY inside `hooks/hooks.json` commands
  (Claude expands it there); all 46 skill-file occurrences are rewritten.
- Codex-only reference files move in as shared host-contract files; the codex
  `references/` docs fold into the main docs/reference set.
- All 6 per-skill `agents/openai.yaml` files copy over — the Claude tree has
  none today (C11). They carry **interface metadata and explicit policy**, NOT
  visibility: a missing file leaves the skill visible and merely strips its
  display name, short description, and default prompt (C12). Test their
  **metadata**, not their visibility — assert each of the 6 exists and carries a
  non-empty `interface.display_name` and `short_description`.

**P1 — Claude-only surface: name the exclusion honestly, then decide if
instructional is enough.** Prose saying "`yolo` is Claude-only" does not stop
Codex from reading the shared `wf` SKILL.md and attempting the key. The first
external finding proposed `allow_implicit_invocation: false` — the right lever
at the wrong granularity, since visibility is per-SKILL and `yolo` is a KEY of
the shared `wf` skill (C10). The reassessment then caught this document
overclaiming its own replacement: calling that replacement "enforceable" was
wrong too. Codex's catalog exposes **skills, not parsed sub-command keys**, so
there is no live assertion available of the form "the catalog contains 20 keys
and not `yolo`". What is actually available:

- **Instructional exclusion (the default, and what this plan adopts).** The
  shared dispatch table marks host availability per key; `yolo`'s reference file
  opens with the restriction; `_host-invocation.md` lists it in the Claude-only
  column. The test asserts a **plugin-owned host-filtered roster** — a data
  structure this repo controls, checked for internal consistency (dispatch table
  ↔ reference files ↔ host-invocation column) — NOT a Codex catalog query. Call
  it what it is: a strong convention that a determined model can still ignore.
  Residual risk if it is ignored: `yolo` is built on the Workflow tool, which
  Codex does not have, so the failure is a clean unavailable-tool error rather
  than a half-run driver. That is what makes instructional acceptable here.
- **Hard exclusion, if the residual risk is ever judged too high.** Promote
  `yolo` to its own skill (`skills/wf-yolo/` or similar) carrying
  `agents/openai.yaml` with `allow_implicit_invocation: false` — the one
  mechanism C12 confirms actually hides a skill. Cost: a second SKILL.md, a
  changed Claude invocation surface (`/wf yolo` would need to keep routing to
  it), and a per-key skill split that cuts against the one-command design. Do
  not do this preemptively; it is the escape hatch, recorded so the option is
  not rediscovered under pressure.
- **For a future Claude-only SKILL** (not key): `allow_implicit_invocation:
  false` plus a catalog test proving absence — that assertion IS available at
  skill granularity, and it is the C5 mechanism used deliberately rather than
  as the v9.107 footgun.
**Slice by divergence magnitude, not only by subtree.** The 7% median (§1)
means most files are a fast reconciliation — pick the better line, keep one —
while the work concentrates in the 22 files that differ by more than 20%. The
138 files decompose as **17 + 88 + 22 + 11**, and the slices follow that split:
1. shared `_*.md` refs (done in W0a — the host-contract set);
2. the **17 dialect-only files**: mechanical normalization, no judgment — they
   become identical once the invocation and plugin-root spellings are unified;
3. the **88 low-divergence files** (median 22 lines each): reconciliation
   against the contract set, fast, high volume;
4. the **22 high-divergence files** as their own slice, each a judgment call —
   `review/maintainability.md` (384 differing lines), `verify.md` (290),
   `handoff.md` (235), `ship.md` (172), `review/scalability.md` (146),
   `intake/default.md` (123), `ship-plan/init.md` (110), `intake.md` (109), and
   the script-invoking `consult`/`imagery`/`uiproto` SKILL.mds, which were
   rewritten independently and differ by more than their own line count;
5. the **11 moves** — 9 codex-only and 2 Claude-only files, which relocate
   rather than merge.
NOTE: this is judgment work, not sed — the v9.107 "don't sed-retransform"
lesson stands; the matrix tells you WHERE, not WHAT.

### W4 — Packaging cutover
- `.codex-plugin/plugin.json` lands in the Claude tree (name `sdlc-workflow`,
  `skills` + `hooks` declarations per §3); interface metadata carried over.
- `hooks/codex.hooks.json` + codex entry hooks move in. Repointing is NOT just
  the hooks.json commands — `runtime/` collapses into the plugin root in four
  more places the original draft missed:
  - `_adapter.mjs:93-97` — `runtimeRoot = join(root,'runtime')` and
    `distDir = runtimeRoot/dist` become the plugin root and `root/dist`;
  - `_adapter.mjs:232` — `readRuntimeIdentity` reads
    `runtime/runtime-manifest.json`; the merged tree has it at the root;
  - `session-start.mjs:85-87` — passes `runtimeRoot` as `--plugin-root` to the
    bundled `hub-ensure`; that argument's meaning changes;
  - codex `package.json` — `verify:runtime` points at `runtime/dist/`.
- **P1 — install the host signal (the cutover's silent breakage).**
  `hooks/seed-memory.mjs:25` / `dist/seed-memory.mjs:190` decide the host by
  path, so post-merge `ON_CODEX` is permanently false and the Claude-only
  `systemMessage` notice fires into Codex sessions. The fix is two-part,
  because the natural signal is not present on that spawn: codex `hooks.json`
  invokes `${PLUGIN_ROOT}/runtime/dist/seed-memory.mjs` **directly**, bypassing
  `_adapter.runBundled` — the only thing that injects `SDLC_HOST: 'codex'`
  (`_adapter.mjs:115`). So (a) `codex.hooks.json` passes the host explicitly
  (env or `--host codex`) on every direct `dist/` invocation, and (b) the code
  reads `SDLC_HOST` with a `claude` default. Rebuild `dist/` in the same commit
  (the dist-freshness rule) and add a guard test that asserts the notice is
  suppressed for `SDLC_HOST=codex` and emitted otherwise. Then close out every
  remaining row of W1's audit table.
- **Catalogs, with their real locations** (both live at the REPO ROOT, not
  inside the plugin dir — only the two `plugin.json` manifests are in-tree):
  - `.agents/plugins/marketplace.json` (Codex) → `"path":
    "./plugins/sdlc-workflow"` **and `"name": "sdlc-workflow"`**; the catalog
    carries the old name too, and the name is what `codex plugin add/remove`
    takes in W7.
  - `.claude-plugin/marketplace.json` (Claude) → version bump only; its
    `source` already points at `./plugins/sdlc-workflow`.
- **ATOMICITY (P1).** The tree deletion, both `plugin.json` versions, the root
  Claude catalog version, and the Codex catalog name+path are **one commit**.
  This is not tidiness: both marketplaces resolve a plugin at a pinned commit
  SHA, so any published SHA in which the catalog points at a path that no longer
  exists is a broken install for whoever syncs to it. Splitting "land the tree"
  from "bump the catalogs" — which W7 originally did — guarantees exactly one
  such SHA. There is no valid intermediate state to push.
- Delete: `plugins/sdlc-workflow-codex/`, `scripts/sync-codex-runtime.mjs`,
  `sync:codex`/`verify:codex` npm scripts, `runtime-baseline.json`, and
  `scripts/measure-host-divergence.mjs` (a migration instrument — it has no
  second tree to measure once this wave lands). Fold the
  codex `package.json`'s own scripts (`verify:claudisms`, `verify:deployment`,
  `verify:no-legacy`) into the merged `package.json` — they do not collide with
  any Claude script name.
- **Residual-reference sweep (acceptance check, not a spot fix).**
  `sdlc-workflow-codex` appears **104 times outside the codex tree**: live code
  (`hooks/seed-memory.mjs`, `dist/seed-memory.mjs`,
  `lib/runtime-manifest.mjs:5`), prose that becomes false
  (`skills/wf/reference/yolo.md:16`), 12 tests (W6), CHANGELOGs, and ~20
  internal docs. Classify each as rewrite / delete / historical-record
  (archived plan docs and CHANGELOG entries stay — they describe what was
  true). The wave is done when the remaining hits are all deliberate history.
  The codex `MIGRATION.md` content folds into docs per W5.

### W5 — Doc-site and docs-source host split (P2 — its own workstream)
The original draft handled the doc site in one clause ("MIGRATION.md's
host-difference section becomes the doc-site's multi-host page"). That is far
short of the work: the site is written for a Claude reader throughout. **24 of
the 25 HTML files mention `/wf`** — every content page; the sole exception is
`nav.html`, which carries only the sidebar and the version brand. 3 pages name
Claude Code directly;
`docs/site/start/installation.html:16-34` is Claude-specific end to end ("The
plugin runs inside Claude Code", `/plugin marketplace add …`, `/wf` as the
smoke test). A Codex reader arriving at that page is told to run commands that
do not exist on their host.

Correction to the external finding's mechanics: **the site is no longer
generated.** `_build_pages.py` was deleted in the 2026-07-29 rebuild; the 23
content pages plus `index.html` and `nav.html` are hand-authored, and
`nav.html` is the single source of both sidebar and version brand. So there is
nothing to "regenerate" — pages are edited directly, and
`scripts/verify-doc-site.mjs` enforces four structural invariants (brand
version, nav hrefs resolve, no orphan pages, sidebar mount) that any new page
must satisfy.

The wave:
- **Classify all 25 pages** as host-neutral, host-parameterized (same concept,
  two invocations), or host-specific (needs a per-host route). Expect
  `start/installation.html` and `start/your-first-workflow.html` in the third
  bucket, and most of `concepts/` in the first.
- **Two install/invocation routes.** Either split `installation.html` into a
  shared precondition section plus per-host install blocks, or add a sibling
  Codex page linked from nav. Same for the first-run walkthrough. Whichever
  shape, `guides/autonomous-drivers.html` must state that `yolo` is
  Claude-only (it already mentions Codex) so the doc surface matches W3's key
  contract.
- **Invocation dialect in shared prose.** Decide one convention for pages that
  serve both hosts (`/wf` with a stated `$wf` equivalence line, or a neutral
  "the `wf` skill" phrasing) and apply it uniformly — 25 pages is small enough
  to be consistent, and inconsistency here is what the reader notices first.
- **Fold the codex docs.** `sdlc-workflow-codex/docs/internal/` carries 6
  documents (`CLAUDISM-AUDIT.md`, `CODEX-PLATFORM-GAPS.md`,
  `CODEX-HOOK-SMOKE-TEST.md`, `CODEX-REMEDIATION-PLAN.md`, `CUTOVER.md`,
  `NATIVE-INTEROP-REWRITE-PLAN.md`) plus `MIGRATION.md` and `references/`.
  Each is kept-and-moved, archived, or deleted — `CLAUDISM-AUDIT.md` in
  particular becomes the spec behind W6's inverted gate and must survive.
- **Gate it.** Extend `verify-doc-site.mjs` with two content invariants: no
  page names a host-specific invocation without its counterpart or a
  host-scoped heading, and no page (or docs source outside `archived/`) still
  references `sdlc-workflow-codex`. Keep `verify-doc-legibility.mjs` passing —
  the STE-100 rules from v9.144.0 apply to any page you rewrite here.

### W6 — Gates repurposed
- `verify-claudisms` inverts into a **host-neutrality gate** over the shared
  tree: unqualified host-specific wording fails outside the designated
  host-contract files/sections. Same scan-family architecture, new polarity.
  Add the missing `plugin-root` family (§1) so `${CLAUDE_PLUGIN_ROOT}` outside
  `hooks.json` is a finding on both polarities.
- **The gate enforces the §3.3 budget, and the budget IS the allowlist.** The
  permanent allowlist is exactly the ≤5 named host-contract files plus the
  per-host wiring (`hooks/*.json`, `agents/openai.yaml`) — not a growing list of
  files that happen to need an exception. Two consequences worth stating,
  because they are the point: adding a sixth host-specific file requires editing
  the gate, so the exception surfaces in review instead of hiding in a diff; and
  the W3 burndown allowlist below is a SEPARATE, temporary list that shrinks to
  empty, distinct from this permanent one. Do not merge the two lists — one is
  the design, the other is unfinished work.
- **The gate lands as a burndown, not a cliff.** Inverted over today's tree it
  fails on 106 files at once, so it can only go green after W3 is 100% complete
  — which is what forced the open-ended freeze W0 now rejects. Land it early
  with a per-file allowlist seeded from the W1 matrix. Each W3 cluster's merge
  deletes its allowlist entries; the gate is fully armed when the list is empty.
- **Monotonicity needs a merge-base comparison, not a pinned count (P2).** A
  stateless entry-count or byte-count assertion cannot prove a list only shrinks
  — a contributor adds an entry and updates the pinned count in the same commit,
  and the test is green on a list that grew. The check has to be differential:
  compare the allowlist against the **merge base** in CI and fail on any added
  path. Three rules make it airtight: (a) **no path may be added after the
  initial baseline commit** — the baseline is the one privileged write; (b) a
  **stale entry is a failure too** (an allowlisted path whose file no longer
  matches any family, or no longer exists, means the list is lying about the
  remaining debt); (c) at cutover the file must be **empty or deleted**, which
  is the objective definition of W3 being complete. Note the local-run
  consequence: the merge-base check needs git context, so it degrades to
  baseline-only when run outside CI — say so in the failure message rather than
  skipping silently.
- Codex tree tests migrate into `tests/` (run-all.mjs auto-discovers — do NOT
  hand-list, per the v9.140.0 lesson), with three explicit dispositions:
  - codex `tests/run-all.mjs` — **deleted**, not migrated; the Claude tree has
    its own discovery runner at the same relative path.
  - codex `tests/runtime-parity.test.mjs` — **rewritten** (decided, not left
    open). Keep assertions 1 and 2 — bundled `verify-runtime` reports valid and
    the payload reproduces its declared buildId; `runtime-manifest.json` carries
    the shared identity surface — repointed from `runtime/` to the root `dist/`
    and root `runtime-manifest.json`. **Delete assertion 3**, which pins
    `runtime-baseline.json`, a file W4 removes.
  - codex `tests/hooks.test.mjs` — migrates under `tests/unit/hooks/` with a
    disambiguating name. Its lines 255-259 pin the **dual** host-env behavior
    (`SDLC_HOST` and `SDLC_HUB_STARTED_BY` both set, explicit caller values
    winning), so it must be updated to whatever §3.4's decision resolves to —
    this test is the current de-facto spec of that contract.
- **P1 — stale-path audit of the 12 existing main-tree tests.** Correction to
  the external finding's failure mode: they do **not** fail on deletion. All 12
  guard with `.filter((t) => existsSync(...))` — `test-discovery.test.mjs:32-35`
  on `package.json`, the other 11 on `skills/` (e.g. `steering.test.mjs:31-32`,
  `output-boundary.test.mjs:28-31`). They will pass, silently, having dropped
  half their coverage — which is the *quieter* version of the problem and
  exactly the "decorative guard" failure mode the v9.140.0 discovery lesson was
  written about. So the audit is still required, and its output is a per-test
  disposition: rewritten for the unified tree (drop the `codexRoot` half and the
  `trees` loop), re-pointed at host-contract assertions (where the guard's real
  subject was cross-host consistency), or deleted as obsolete. Affected:
  `test-discovery`, `steering`, `output-boundary`, `shared-reference-drift`,
  `surface-sweep`, `wall-ownership`, `intent-fidelity`, `intake-shape-hardening`,
  `handoff-ship-streamline`, `batch-handoff-ship`, `consult-trigger-coverage`,
  `ship-plan-drift-clears-on`. No test may keep a `sdlc-workflow-codex` path.
- Release guard (`verify-release-pushed` or a new sibling) asserts that **three
  in-tree files** carry the same version —
  `plugins/sdlc-workflow/.claude-plugin/plugin.json`,
  `plugins/sdlc-workflow/.codex-plugin/plugin.json`,
  `plugins/sdlc-workflow/package.json` — and separately checks the two
  **repo-root** catalogs, which are a different surface with different shapes:
  `.claude-plugin/marketplace.json` pins the plugin version explicitly (so it is
  a version check), while `.agents/plugins/marketplace.json` carries no version
  field at all (so it is a name+path check). Do not conflate the two locations —
  the plugin-dir manifests and the root catalogs are edited in different waves
  and only the manifests share the version. The version-bump surface shrinks from
  two trees to one and the "no gate covers the codex manifests" trap dies.
- **`verify-deployment` needs rewriting, not just an added legacy check.** Its
  identity assumptions are hard-coded throughout: `PLUGIN_NAME =
  'sdlc-workflow-codex'` (line 23) drives the `config.toml` enabled-entry regex
  (122-124) and the cache-dir lookup (139), and the **trust matcher regex embeds
  the literal hooks path** — `…:hooks/hooks\.json:<event>…` (167) — which becomes
  `hooks/codex.hooks.json` post-merge, so every trust assertion silently stops
  matching. Rewrite: primary identity → `sdlc-workflow`, cache path → the new
  plugin dir, manifest read (132, already `.codex-plugin/plugin.json`) →
  unchanged, hooks enumeration (161) → `hooks/codex.hooks.json`, trust matcher →
  the new relpath. THEN add the legacy check: FAIL if `sdlc-workflow-codex@…` is
  still installed/enabled; instruct `codex plugin remove` + `add
  sdlc-workflow@…`. Also retire `verify-no-legacy-codex.mjs` or rewrite its
  premise — it resolves a sibling `CLAUDE_PKG` at line 24 and exists to police a
  two-tree layout that will not exist.

### W7 — Rollout sequencing (marketplace pins a SHA — order matters)

**0. Preflight, before anything is published (P2).** The original sequence
removed a working install before proving the replacement works — on a
`.codex-plugin` layout, a renamed identity, a moved hooks file, and a collapsed
`runtime/` path, none of which had ever been exercised together outside a toy
spike. Against a scratch `CODEX_HOME` and a local marketplace pointing at the
merged tree, prove: the snapshot installs; **all 6 skills** appear in the
catalog; `yolo` behaves per W3's roster contract; the declared
`hooks/codex.hooks.json` hooks fire (and no Claude hook does — the C3 decoy
assertion, now with the real files); `verify-deployment` passes against the new
identity; and a `$wf status` round-trip adopts the same hub as a Claude session.
Preflight failure costs an afternoon; discovering the same failure after step 2
costs every machine's trust state.

1. **One atomic release commit** — merged tree, tree deletion, both manifest
   versions, both root catalogs (per W4) — then push. `origin/master` must carry
   it before any machine migrates (v9.137–140 lesson), and no intermediate SHA
   may exist in which a catalog points at the deleted tree.
2. Per machine, in one maintenance window with **no Codex session opened inside
   it**: `codex plugin marketplace upgrade` (so the new catalog entry exists),
   then `codex plugin add sdlc-workflow@agent-skills-marketplace`, then `codex
   plugin remove sdlc-workflow-codex@agent-skills-marketplace`, then **re-trust
   the hooks** (C8 — new file path + hashes; the 7-hooks manual-trust gotcha
   applies once). Verify in the first session AFTER the window.

   CAUTION: do not open a session while both identities are enabled. Two
   plugins would expose two `wf` skills and fire two SessionStart hook sets
   against the same repo — duplicated hub-ensure, memory-seed, and render-queue
   side effects, and a verification result you cannot attribute to either
   install. This corrects the previous "add, verify, then remove" ordering,
   which bought reversibility at the cost of an ambiguous dual-identity session.
   Installation is already proven by step 0's preflight, so there is nothing the
   overlap session would tell you that the scratch `CODEX_HOME` did not.

   **Point of no return: the `remove`.** Everything before it is additive and
   reversible; that command discards the old identity's trust state.
3. **Retain the old snapshot cache** (`~/.codex/plugins/cache/<mk>/
   sdlc-workflow-codex/`) until step 2's verification passes on that machine.
   Do not prune it in the same sitting.
4. **Rollback runbook** (write it before step 1, not during an incident): re-add
   `sdlc-workflow-codex@agent-skills-marketplace` from the last-good SHA,
   re-trust its 7 hooks, and confirm `verify-deployment` at that SHA. Note
   explicitly that trust state is NOT restored by re-adding — the hashes are
   keyed to file path + content (C8), so rollback pays the manual-trust cost a
   second time. That asymmetry is the reason step 0 exists.
5. Claude side re-syncs to the new SHA as usual.
6. One release later: nothing to delete (the old tree went in step 1) — but
   keep `verify-deployment`'s legacy check for a few releases.

### W8 — Post-cutover verification
- Both hosts on one machine: Claude session (hooks fire, `/wf status` works,
  render pipeline OK) + Codex session (`$wf status`, SessionStart activation,
  managed-artifact Stop convergence) against the SAME repo/hub — the shared
  runtime identity invariant (`{runtimeVersion, buildId}`) now holds by
  construction, but hub adoption should be observed once.
- Field-check C4 with the real `wf` SKILL.md (spike used a toy).
- **Observe the host signal in the field**, since W4's fix is the one change
  whose failure mode is silent: confirm the seed-memory notice appears in a
  Claude session and not in a Codex one, and that `enqueuedBy.host` on the
  render queue reads `codex` for Codex-originated writes.
- **Two separate roster checks, because they live in different places** (C10 —
  Codex catalogs skills, never `wf` sub-command keys, so there is no key catalog
  to interrogate):
  1. The Codex skill catalog lists all **6 skills**, each with its interface
     metadata from `agents/openai.yaml`.
  2. The **plugin-owned** host-filtered roster contains **20 Codex keys and no
     `yolo`** — a check against this repo's own dispatch data, not against
     anything Codex exposes.

## 5. Risks

- **Prose-quality regression** — the reason the codex tree was handwritten.
  Mitigation: the ≤5 host-contract files are the pressure valve for anything
  needing host-specific precision; the W6 gate makes them the only sanctioned
  place, so pressure cannot silently leak back into shared prose. The §1
  measurement lowers this risk substantially — a 7% median means the merge is
  mostly choosing between two versions of the same sentence, which is a
  reconciliation the tree's own drift-guard fingerprints can check.
- **Budget erosion** — the failure mode the budget exists to prevent. Each
  individual "this one file really does need a Codex note" is locally
  reasonable, and thirty of them reconstitute two interleaved trees inside one
  file, with none of the benefit and worse readability than today. The budget
  is deliberately small and gate-backed for that reason: the exception must
  cost an edit to the gate. W0a's stop condition tests this early, when
  abandoning costs a branch.
- **Silent host-behavior inversion** (the highest-severity finding of the
  review). Same-path hosting flips every path-derived host test at once, and
  every symptom is quiet: a notice on the wrong channel, a render-queue row
  attributed to the wrong host, a deployment doctor that stops recognizing its
  own install. Mitigation: W1's exhaustive audit table, the **two-signal
  contract of §3.4** — `SDLC_HOST` is the entrypoint signal, and
  `SDLC_HUB_STARTED_BY` is DERIVED from it at the single hub-spawn site, never
  set independently by a caller (the tests must reject an independent caller
  override) — a guard test per converted site, and the W8 field observation.
  Do not treat this as a W4 detail — it is the one class where "it worked in
  the spike" proves nothing, because the spike used a toy plugin with no
  host-conditional code.
- **Codex CLI contract drift** — C1–C3 are source-verified at 0.146.0 and
  live-verified, but Codex ships fast. The W6 deployment doctor plus a smoke
  assertion (hooks fired from `codex.hooks.json`, skill catalog contains
  `sdlc-workflow:wf`) catch a behavioral change early.
- **Concurrent sessions** during W3–W5 — a tree-wide restructure colliding
  with parallel work is the worst version of the known collision problem.
  Mitigation is now structural rather than social: run the merge on a branch,
  land cluster by cluster behind the W6 allowlist burndown, stage explicitly by
  path, and reserve a short freeze for the W4 packaging commit only.
- **Hook re-trust friction** on every machine at cutover (C8) — unavoidable,
  one-time; script the instructions into `verify-deployment` output.
- **Snapshot weight — DECIDED before W4 (it was left open, which is not a
  decision).** The Codex snapshot goes from 6.45 MB to ~21.5 MB **per cached
  version** (C6), so ten releases is ~215 MB under `~/.codex/plugins/cache/`.
  The dominant cost is `bin/tray/` at 10.90 MB — three-platform Go helper
  binaries for a Claude-only feature, dead weight in every Codex snapshot, and
  Codex has no exclusion mechanism. The three options are not equal:
  - *Commit only the host platform's binary* — **rejected.** A git tree is
    platform-agnostic and one snapshot serves every machine; per-platform
    content would require per-platform release artifacts, which this
    distribution model does not have.
  - *Stop committing the binaries, fetch or build on first tray use* — fixes the
    weight, but **reverses a deliberate prior decision**, which the reassessment
    could not have known: `plugins/sdlc-workflow/.gitignore` documents committing
    `bin/` precisely so "the tray runs on a fresh clone with zero `npm install`",
    with explicit un-ignore rules to defend it. Trading a working zero-install
    guarantee for cache size is a bad trade at 21 MB.
  - **Accept the 3.3×, with eyes open** — the adopted decision. 21.5 MB per
    version is unremarkable for a dev-machine cache, and the growth is bounded by
    however many versions Codex retains. Revisit only if cache growth is
    observed to actually bite, at which point option 2's fetch-on-demand is the
    move and the zero-install guarantee gets renegotiated on its own merits
    rather than as a side effect of this migration.
  `docs/` (2.08 MB) is the smaller half — splitting the doc site out, the
  original mitigation, does not solve this and is not pursued.
- **Doc-site half-migration** — a site that documents Claude invocation while
  the plugin serves both hosts is worse than one that documents a single host,
  because the reader cannot tell which pages they can trust. W5's classification
  pass plus the two new `verify-doc-site` content invariants are what keep the
  split from stalling at "we added a multi-host page".

## 6. Effort shape

Re-shaped after review, then re-scoped by the §1 measurement. **W3's estimate is
now the spike's output, not a guess** — W0a merges one cluster and measures the
per-file cost, and the 7% median plus the 88/22 split (low- vs high-divergence
files) means the distribution matters more than the file count: most files are
minutes, twenty-two are hours.

W0 hours · **W0a half a day (the merge spike — do this before W1)** · W1 a day
plus the host-detection audit
(agent fan-out for the classification, but the audit is read-the-code work, not
fan-out) · W2 no longer a standalone phase — it is the first slice of each W3
cluster · W3 the long pole, but a lighter one than first estimated: 138 files
needing a decision, split ~88 fast reconciliations (median 22 lines each) / 22
judgment merges / 11 moves, with 106 carrying invocation debt and 46 path debt
— run as its own `/wf` workflow, sliced by divergence magnitude · W4 a day,
plus the host-signal fix
and its guard test · **W5 a new 2–3 day workstream** (25 pages to classify, two
install routes to author, two gate invariants) · W6 2–3 days (gate inversion
plus 15 test dispositions: 12 main-tree, 3 codex, plus the merge-base allowlist
check and the `verify-deployment` identity rewrite) · W7 add half a day for the
scratch-`CODEX_HOME` preflight and the rollback runbook, both written BEFORE the
release commit · W7–W8 one release cycle.

The payoff is unchanged and still worth it: one tree per release, one dialect per
fix, and **duplicate cross-host prose drift becomes impossible** — the precise
claim. The earlier phrasing ("the accidental-drift class becomes structurally
impossible") overclaimed: drift between prose and code, between source and the
committed `dist/` bundles, between skills and the doc site, and between any of
those and the tests all remain possible. What dies is the specific class this
plan exists to kill — the same sentence maintained twice in two dialects. What the
review changed is the honesty of the shape — the original estimate omitted the
doc site entirely, treated W2 as a short prelude when it is an extraction of
inlined mechanics from ~60 files, and assumed a freeze the concurrency reality
of this tree will not grant.
