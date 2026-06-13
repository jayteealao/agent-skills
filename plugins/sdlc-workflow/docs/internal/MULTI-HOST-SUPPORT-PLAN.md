# Multi-Host Support Plan: Codex + Antigravity (Gemini 3)

**Status:** Drafted 2026-05-23, corrected 2026-05-25. Awaiting execution after v9.23.0 Phase 4 settles.
**Authoring source:** Claude-native (canonical) — no migration to a host-neutral spec.
**Output model:** Build-only emitters per target host (`.codex-generated/`, `.antigravity-generated/` not tracked). Exception: `AGENTS.md` at repo root IS tracked in git.
**Predecessor docs:** [CODEX-PLUGIN-MIGRATION-PLAN.md](./archived/CODEX-PLUGIN-MIGRATION-PLAN.md), [ROUTER-MIGRATION-PLAN.md](./archived/ROUTER-MIGRATION-PLAN.md).

---

## 1. Goal

Extend `sdlc-workflow` to run with full feature parity on three hosts:

| Host | Status | Format consumed |
| --- | --- | --- |
| **Claude Code** | Existing canonical source | `.claude-plugin/` (read directly) |
| **OpenAI Codex CLI** | Existing via [generate-codex-plugin.mjs](../../../../scripts/generate-codex-plugin.mjs) | `.codex-generated/` + `.codex-plugin/plugin.json` + `.agents/plugins/marketplace.json` |
| **Google Antigravity (Gemini 3)** | **NEW — this plan** | `.antigravity-generated/` → installed into `<workspace>/.agents/{skills,workflows}/` |

"Full support" means: every Claude-side primitive (skills, slash commands, hooks, sub-agents, MCP) ships to each host or has a documented graceful degradation when the host lacks the primitive.

The original "port everything to a generic `.agents/`-as-universal-format" framing was **rejected** after verification: there is no universal plugin spec in 2026. `AGENTS.md` is the only universal *instruction* file. Each host has its own plugin/skill loader.

---

## 2. Research findings (verified 2026-05)

### 2.1 Antigravity (Google, May 2026 — Antigravity 2.0)

- Desktop IDE + CLI (`agy`) + SDK + Managed Agents tier in the Gemini API.
- **Skill discovery**:
  - Global: `~/.gemini/antigravity/skills/`
  - Workspace: `<workspace-root>/.agents/skills/<name>/SKILL.md`
- **Slash commands**: drop a markdown file into `<workspace>/.agents/workflows/<name>.md`. The filename becomes `/name`.
- **Hooks**: supported via plugin system (`PreToolUse`-style events; specific event names documented in Antigravity CLI plugin reference — confirm during Phase 4).
- **Subagents**: first-class concept in the plugin system, similar to Claude's `agents/`.
- **MCP**: first-class, with schema validation baked into extension manifests.
- **Permissions**: declarative read/write directory scopes.
- **`AGENTS.md`**: read since v1.20.3 (March 2026), alongside `GEMINI.md`.
- **Models**: Gemini 3 Pro (high tier), Gemini 3 Flash (cheap tier).

### 2.2 Codex CLI (OpenAI, ongoing)

- **Plugin bundles** with marketplace install, remote bundle caching, plugin-bundled hooks, external-agent config import.
- **Bundle contents**: skills, app integrations, MCP servers, lifecycle hooks.
- **Hooks**: `hooks.json` or inline `[hooks]` table in `config.toml`. Inspected via `/hooks`.
- **Slash commands**: built-ins (`/feedback /mcp /plan-mode /review /status`) + custom; enabled skills appear in palette and can be explicitly invoked with `$`.
- **`AGENTS.md`**: native consumer (Codex CLI originated the convention).
- **Models**: GPT-5.1-Codex (high), GPT-5.1-Codex-mini (cheap).

### 2.3 Universal layer

- **`AGENTS.md`** at repo root is read by Codex, Cursor, Gemini CLI, Antigravity, Windsurf, GitHub Copilot, Aider, Devin, Jules, Zed, Continue, Roo Code, Factory Droids, Sourcegraph Amp, Amazon Q. Stewarded by Agentic AI Foundation under the Linux Foundation.
- **MCP** is cross-host for tool/resource surface but does **not** cover UI primitives (`AskUserQuestion`, modal sub-agent dispatch).
- **`SKILL.md`** (Anthropic-originated) is increasingly portable — VS Code Copilot, kilo.ai, and Antigravity all consume some variant.

---

## 3. Locked-in decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| **Authoring model** | Claude-native source → per-host emitters | Lowest risk; reuses working Codex pattern; no big-bang migration of existing skills. |
| **Generated content shape** | Thin adapters pointing at canonical source — NOT transform-and-copy | Matches Codex emitter's proven pattern ([generate-codex-plugin.mjs:370-419](../../../../scripts/generate-codex-plugin.mjs:370)). Hosts read the same canonical SKILL.md Claude reads; single source of truth at runtime. |
| **Antigravity output location** | Build output only (`.antigravity-generated/`), not tracked | Matches `.codex-generated/` convention. Users install via plugin marketplace or copy into their `.agents/`. |
| **Codex hooks** | Remain off (`includeHooks: false`) until separately decided | Current overrides deliberately disable them. Flipping requires verifying Codex 2026 hook contract maturity — out of scope for this plan. |
| **Antigravity hooks** | Emit on Antigravity only, Phase 4 | Antigravity plugin system supports hooks first-class; safe to enable in Phase 4 without affecting Codex path. |
| **AGENTS.md** | Tracked in git at repo root | Other hosts read it at workspace-open before any build runs. Tracked copy means users get it on clone; generator (`--check` mode) keeps it in sync. |
| **Model references** | Abstract tiers (`high` / `cheap`) resolved at build time | Single source bumps cleanly across hosts; future-proof model upgrades. |
| **Timing** | After v9.23.0 Phase 4 settles | Avoid architectural changes on top of active feature rollout. |

---

## 4. Architecture

### 4.1 Source tree (canonical, Claude-native)

```
plugins/sdlc-workflow/
├── .claude-plugin/              # consumed directly by Claude Code (unchanged)
│   └── plugin.json
├── .codex-plugin/               # generated by existing emitter
│   └── plugin.json
├── .codex-plugin.overrides.json # host-specific metadata for Codex
├── .codex-generated/            # build output (Codex), gitignored
│
├── .antigravity-plugin.overrides.json   # NEW: host-specific metadata for Antigravity
├── .antigravity-generated/              # NEW: build output, gitignored
│
├── skills/<name>/SKILL.md       # PRIMARY entry points — skill-mode routers
│                                #   wf, wf-quick, wf-meta, review are router skills;
│                                #   these become slash commands on non-Claude hosts
├── commands/<name>.md           # NON-router slash commands (currently: setup-wide-logging.md only)
├── hooks/
│   ├── hooks.json               # Claude hook config (PreToolUse + PostToolUse only)
│   ├── render-sunflower.json    # Second Claude hook config (PostToolUse, artifact renders)
│   └── scripts/*.mjs            # cross-platform hook impls (partial — .sh files remain until Phase 1)
└── package.json                 # plugin-scoped; add build scripts here (see section 4.4)
```

> **Note:** There is no `agents/` directory in this plugin. Sub-agents used by the workflow are user-scoped (`~/.claude/agents/`) not plugin-bundled. See section 9 (out of scope) for rationale.

### 4.2 Emitters

```
scripts/
├── generate-codex-plugin.mjs             # EXISTING — refactor to use _shared/
├── generate-antigravity-plugin.mjs       # NEW
├── generate-agents-md.mjs                # NEW — universal front door
└── _shared/                              # NEW — extracted common code
    ├── tiers.mjs                         # high/cheap → per-host model id
    ├── hooks-map.mjs                     # Claude event → host event (active events only)
    ├── adapter-builder.mjs               # builds thin adapter SKILL.md content per host
    │                                     #   (frontmatter normalise + source ref + boundary block)
    └── manifest-helpers.mjs              # frontmatter parse/serialize utils
```

> **Note:** There is no `skill-transform.mjs` or `command-transform.mjs`. Generated skills are **thin adapters** that reference canonical source by relative path — the same pattern Codex uses (see [generate-codex-plugin.mjs:370-419](../../../../scripts/generate-codex-plugin.mjs:370)). Frontmatter normalisation (stripping Claude-only keys, resolving tiers) happens in `adapter-builder.mjs`, not via content transformation of the source body.

### 4.3 Build outputs

```
plugins/sdlc-workflow/.codex-generated/         # Codex install target (gitignored)
plugins/sdlc-workflow/.antigravity-generated/   # Antigravity install target (gitignored — NEW)
  ├── skills/<name>/SKILL.md                    # thin adapter per router skill
  ├── skills/<name>/agents/gemini.yaml          # Antigravity metadata (model tier, display name)
  ├── workflows/<name>.md                       # thin adapter per router skill (slash entry)
  ├── plugin.json
  └── README.md                                 # install instructions
AGENTS.md                                        # repo root, universal — TRACKED in git
```

**`.gitignore` additions needed:**
```
plugins/sdlc-workflow/.antigravity-generated/
```
(`.codex-generated/` should already be gitignored — verify.)

**Build scripts** — add to `plugins/sdlc-workflow/package.json` (existing, plugin-scoped):
```json
"scripts": {
  "build:codex":       "node ../../scripts/generate-codex-plugin.mjs",
  "build:antigravity": "node ../../scripts/generate-antigravity-plugin.mjs",
  "build:agents-md":   "node ../../scripts/generate-agents-md.mjs",
  "build":             "npm run build:codex && npm run build:antigravity && npm run build:agents-md",
  "check":             "npm run build:codex -- --check && npm run build:antigravity -- --check && npm run build:agents-md -- --check"
}
```

### 4.4 Install paths (for end users)

| Host | Install action |
| --- | --- |
| Claude Code | Plugin marketplace (existing flow) |
| Codex CLI | Plugin marketplace (existing flow) |
| Antigravity | Plugin marketplace **or** manual copy of `.antigravity-generated/` contents into `<workspace>/.agents/` |

---

## 5. Phase-by-phase implementation

### Phase 1 — Finish `.mjs` hook port (task #1)

**Goal:** Cross-platform hooks running on Windows without `bash`/`yq`/`jq`. Pre-req for emitters (they assume `.mjs`-only).

**Files affected:**
- `plugins/sdlc-workflow/hooks/scripts/auto-stage.sh` → `auto-stage.mjs`
- `plugins/sdlc-workflow/hooks/scripts/pre-compact.sh` → `pre-compact.mjs`
- `plugins/sdlc-workflow/hooks/scripts/workflow-discovery.sh` → `workflow-discovery.mjs`
- `plugins/sdlc-workflow/hooks/scripts/validate-workflow-write.sh` → `validate-workflow-write.mjs`
- `plugins/sdlc-workflow/hooks/scripts/verify-workflow-postwrite.sh` → `verify-workflow-postwrite.mjs`
- `plugins/sdlc-workflow/hooks/hooks.json` — update `command` paths.

**Implementation notes:**
- Use `node:fs/promises` for file IO.
- Use `node:child_process` (`execFile`, not `exec`) for `git`/external calls.
- Replace `yq` with a small YAML parser (e.g. `js-yaml` already a dependency) or hand-rolled frontmatter splitter (existing pattern in [renderers/_markdown.mjs](../../renderers/_markdown.mjs)).
- Replace `jq` with native `JSON.parse` / `JSON.stringify`.
- Read stdin hook payload via `process.stdin` reader (Claude passes JSON via stdin).

**Phase-4-safe:** Does not change source shape; `hooks.json` trigger contract unchanged.

**Verification:** Re-run any existing `/wf` flow that triggers each hook; confirm same observable behavior. Test on Windows PowerShell explicitly.

---

### Phase 2 — Tier abstraction (task #2)

**Goal:** Source files reference abstract model tiers; emitters resolve to host-specific model ids at build time.

**New file:** `scripts/_shared/tiers.mjs`

```js
export const MODEL_TIERS = {
  claude: {
    high: "claude-sonnet-4-6",
    cheap: "claude-haiku-4-5-20251001",
  },
  codex: {
    high: "gpt-5.1-codex",
    cheap: "gpt-5.1-codex-mini",
  },
  antigravity: {
    high: "gemini-3-pro",
    cheap: "gemini-3-flash",
  },
};

export function resolveModel(host, tier) {
  const map = MODEL_TIERS[host];
  if (!map) throw new Error(`Unknown host: ${host}`);
  const id = map[tier];
  if (!id) throw new Error(`Unknown tier '${tier}' for host '${host}'`);
  return id;
}
```

**Source-side change:** Where a skill or command currently hardcodes a model (audit with `grep`), replace with frontmatter `tier: high` or `tier: cheap`. Emitters substitute at build time.

**Audit needed:** `rg -n 'sonnet|haiku|claude-(sonnet|haiku|opus)' plugins/sdlc-workflow/` to find current hardcoded refs.

**Verification:** Confirm each emitter resolves correctly by inspecting generated manifests.

---

### Phase 3 — `generate-antigravity-plugin.mjs` (task #3)

**Goal:** New emitter mirroring [generate-codex-plugin.mjs](../../../../scripts/generate-codex-plugin.mjs).

**New files:**
- `scripts/generate-antigravity-plugin.mjs`
- `plugins/sdlc-workflow/.antigravity-plugin.overrides.json`

**Overrides schema (`.antigravity-plugin.overrides.json`):**
```json
{
  "antigravity": {
    "version": "9.23.0",
    "generatedSkillsPath": "./.antigravity-generated/skills/",
    "generatedWorkflowsPath": "./.antigravity-generated/workflows/",
    "routerSkills": ["wf", "wf-quick", "wf-meta", "review"],
    "includeHooks": true,
    "hooksPath": "./hooks/hooks.json"
  },
  "interface": {
    "displayName": "SDLC Workflow",
    "shortDescription": "Slug-driven SDLC pipeline with design, plan, ship, review",
    "category": "development",
    "capabilities": ["interactive", "write", "hooks"],
    "brandColor": "#8B5CF6"
  }
}
```

> **`routerSkills` note:** Matches current canonical Codex set (`wf`, `wf-quick`, `wf-meta`, `review`). `wf-design` and `setup-wide-logging` are candidates for future extension but are not router skills today — do not add them without also registering them in the Codex overrides for consistency.

> **No `subagentMap`:** Sub-agents used by this plugin are user-scoped (`~/.claude/agents/`) and are not plugin-bundled. Sub-agent dispatch in SKILL.md prose (instructions for the host to orchestrate) stays as-is — the host's native agent capabilities handle it. Plugin-bundled sub-agents are out of scope for this plan.

**Emitter responsibilities:**
1. Read Claude manifest (`.claude-plugin/plugin.json`) + overrides.
2. Build Antigravity `plugin.json` for `.antigravity-generated/plugin.json`.
3. For each entry in `routerSkills`, read `skills/<name>/SKILL.md`. Using `adapter-builder.mjs`, emit a **thin adapter** to `.antigravity-generated/skills/<name>/SKILL.md`. The adapter contains:
   - Normalised frontmatter: `name`, `description` only (strip `disable-model-invocation`, `allowed-tools`, `argument-hint`, `user-invocable`; resolve `model`/`tier` to Antigravity model id via `tiers.mjs`).
   - **When To Use** section (same pattern as Codex adapters).
   - **Canonical Source** reference — relative path pointing back at `skills/<name>/SKILL.md`.
   - **External Output Boundary** block (verbatim from Codex adapter template — prevents leaking workflow artifact paths into commits/PRs/docs).
   - **Antigravity Compatibility Rules** section (analogous to Codex's "Codex Compatibility Rules" block).
   - Emit `agents/gemini.yaml` per skill (display name, short description, model id, `allow_implicit_invocation`).
4. For each non-router `commands/<name>.md` (currently: `setup-wide-logging.md`), emit a matching thin adapter to `.antigravity-generated/workflows/<name>.md`.
5. For each `routerSkill`, also emit a thin adapter to `.antigravity-generated/workflows/<name>.md` — this is what registers the `/name` slash entry in Antigravity's chat interface.
6. Translate active hooks from `hooks/hooks.json` and `hooks/render-sunflower.json` via `hooks-map.mjs` to Antigravity hook config format; emit `.antigravity-generated/hooks.json`. Hook scripts (`*.mjs`) are referenced by path relative to the **plugin root** (not the generated dir).
7. Emit `.antigravity-generated/README.md` with install instructions (copy/symlink into `<workspace>/.agents/`).
8. Support `--check` mode that diffs generated content against current filesystem state (CI parity check — mirror Codex `--check` logic).

**Pattern to copy from Codex emitter:** the `filesToWrite` map + final write loop in [generate-codex-plugin.mjs:51-82](../../../../scripts/generate-codex-plugin.mjs:51).

**Verification:** Inspect generated tree; run `node scripts/generate-antigravity-plugin.mjs --check` in CI.

---

### Phase 4 — Hook translation layer (task #4)

**Goal:** Same `.mjs` hook scripts fire on Antigravity via its native hook system. Codex hooks stay off (`includeHooks: false`) pending a separate decision to enable them.

**Scope:** Antigravity only. The Codex hook path is not modified here.

**New file:** `scripts/_shared/hooks-map.mjs`

```js
// Active events: events actually used in hooks.json + render-sunflower.json today.
// Reserved events: defined here for future use; not emitted unless a hook config references them.

export const HOOK_EVENT_MAP = {
  claude: {
    // --- active ---
    PreToolUse: "PreToolUse",
    PostToolUse: "PostToolUse",
    // --- reserved (pre-compact.sh exists but is Claude-only; no non-Claude equivalent) ---
    PreCompact: "PreCompact",   // emitted for Claude only; null on all other hosts
  },
  antigravity: {
    // --- active ---
    PreToolUse: "pre_tool",     // confirm event name against Antigravity CLI v2 plugin ref
    PostToolUse: "post_tool",
    // --- reserved ---
    PreCompact: null,           // no equivalent; pre-compact.sh is Claude-only
  },
};

// Reserved for when Codex hooks are enabled (separate decision):
export const CODEX_HOOK_EVENT_MAP = {
  PreToolUse: "on_tool_request",
  PostToolUse: "on_tool_result",
  PreCompact: null,
};

export function translateHookConfig(claudeHooksJson, targetHost) {
  // walks each hook entry in claudeHooksJson;
  // for null mapping, emit a console.warn and skip;
  // returns host-specific hook config object
}
```

**Inputs:** `hooks/hooks.json` (PreToolUse: validate-workflow-write; PostToolUse: auto-stage, verify-workflow-postwrite) and `hooks/render-sunflower.json` (PostToolUse: render-on-artifact-write).

**Per-host config emission:**
- Antigravity: emit `.antigravity-generated/hooks.json` per Antigravity plugin schema (confirm exact schema against Antigravity CLI v2 plugin reference — see open question #1).
- Codex: **no change** — `includeHooks` stays false; Codex path not touched in this phase.

**`PreCompact` degradation:** `pre-compact.sh`/`.mjs` is Claude-only. On Antigravity the event has no equivalent. Document in the generated `README.md`: context-compaction guards run on Claude only.

**Verification:** Trigger each active event on Antigravity (write to a slug file → `pre_tool` validation runs; write to artifact file → `post_tool` render runs). Confirm hook scripts execute and produce the expected output.

---

### Phase 5 — Adapter frontmatter normalisation (task #5)

**Goal:** `adapter-builder.mjs` emits correct, host-appropriate frontmatter for every generated adapter. Claude-only frontmatter keys are stripped; model/tier references are resolved; the source body is never transformed — only the adapter shell around it changes.

**Primary file:** `scripts/_shared/adapter-builder.mjs`

**Frontmatter keys to handle (confirmed present in source via grep):**

| Key | Action on non-Claude hosts |
| --- | --- |
| `name` | Keep — emitted as-is (only `name` and `description` go into generated frontmatter) |
| `description` | Keep |
| `disable-model-invocation` | Strip from adapter frontmatter; gate `gemini.yaml`/`openai.yaml` emission same way the Codex emitter does |
| `allowed-tools` | Strip — host manages tool permissions separately |
| `argument-hint` | Strip — Claude Code skill discovery hint, not meaningful on other hosts |
| `user-invocable` | Strip — same as above |
| `model: <literal-claude-id>` | Replace with resolved tier model id; if the literal id is unrecognised, warn and fall back to `cheap` tier |
| `tier: high \| cheap` | Resolve via `tiers.mjs` for target host |

**What is NOT transformed:** The canonical source body (`skills/<name>/SKILL.md` content below the frontmatter) is **never read or modified by the emitter**. Adapters reference the source by path; the host reads it at runtime. Claude-only narrative (mentions of `AskUserQuestion`, `Agent` tool invocations written as prose instructions) is intentionally left as-is — hosts follow the prose and use their own native mechanisms.

**Audit for Phase 2 work:** `rg -n 'model:\s+claude|sonnet|haiku' plugins/sdlc-workflow/skills plugins/sdlc-workflow/commands` identifies source files where a literal model id needs replacing with `tier:` in the source frontmatter (Phase 2 job). Phase 5 only normalises what the source *emits*; Phase 2 cleans up the source itself.

**Verification:** Inspect generated adapter frontmatter for each router skill; confirm no Claude-only keys survive. Confirm tier resolution produces correct Antigravity model id from `tiers.mjs`.

---

### Phase 6 — `AGENTS.md` generator (task #6)

**Goal:** Single universal instruction file at repo root, auto-built from workflow metadata. Read by every modern coding agent.

**New file:** `scripts/generate-agents-md.mjs`

**Output (`AGENTS.md` at repo root):**

```markdown
# Agent Instructions

This repository hosts `sdlc-workflow`, a slug-driven SDLC pipeline that runs as a plugin
on Claude Code, OpenAI Codex CLI, and Google Antigravity.

## Entry points
- `/wf intake` — start a new workflow slice
- `/wf-meta status` — pipeline status
- `/wf-design …` — design phase
- `/wf-quick rca` — root cause analysis
- `/review <dimension>` — code review

## Conventions
- Workflow state lives under `.ai/workflows/<slug>/`
- Each slice has a YAML stage manifest (`.ai/workflows/<slug>/00-index.md`)
- Hooks live in `plugins/sdlc-workflow/hooks/`
- Do not edit `.codex-generated/` or `.antigravity-generated/` — both are build output

## Build
- `node scripts/generate-codex-plugin.mjs`
- `node scripts/generate-antigravity-plugin.mjs`
- `node scripts/generate-agents-md.mjs`     # regenerates this file

## Host-specific install
See `plugins/sdlc-workflow/.codex-generated/README.md` and
`plugins/sdlc-workflow/.antigravity-generated/README.md`.
```

Content sourced from `plugin.json`, command frontmatter, and stage manifests so it stays in sync.

**Verification:** Open in Cursor / Codex / Antigravity / Gemini CLI and confirm each picks it up (`AGENTS.md found` log line or equivalent).

---

### Phase 7 — Verification (task #7)

**Manual smoke tests per host:**
1. Install plugin (host-native method).
2. Run `/wf-meta status` — confirm parses, returns pipeline state.
3. Run `/wf intake` on a fresh slug — confirm full intake flow.
4. Trigger `PreToolUse` hook: write to a slug file → `validate-workflow-write` hook runs and validates correctly.
5. Trigger `PostToolUse` hook: write to a workflow artifact → `auto-stage` + `verify-workflow-postwrite` run; confirm git staging occurs.
6. Run `/review sweep` — confirm skill fan-out works (sub-agents are host-native, not plugin-bundled; test that the host handles the dispatch instructions in the skill prose).

**CI:**
- Extend the existing Codex `--check` step to also run `node scripts/generate-antigravity-plugin.mjs --check` and `node scripts/generate-agents-md.mjs --check`.
- Fail the build if any generated artifact drifts from source.

**Acceptance:** All three hosts complete one plan→ship cycle with no manual intervention beyond install.

---

### Phase 8 — Source audit (task #8, optional)

After parity is real, audit the canonical Claude source for places where:
- A primitive degrades poorly on Codex/Antigravity.
- The rewrite to a portable form doesn't hurt the Claude experience.

Examples:
- Replace `<invoke_tool name="AskUserQuestion">` blocks with narrative "ask the user" prose where the structured-question UI isn't load-bearing.
- Replace hardcoded model refs with `tier:` (catch any missed in Phase 2).
- Move Claude-only guidance into clearly-scoped sections that emitters can strip per host.

Do **not** migrate to a host-neutral authoring spec — decision is locked.

---

## 6. Risks & mitigations

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Antigravity hook event name strings are wrong | High (unverified) | `pre_tool`/`post_tool` are placeholders — verify against Antigravity CLI v2 plugin reference before Phase 4. Bump in `hooks-map.mjs` if they differ. |
| Antigravity hook config JSON schema differs from guess | Medium | Confirm schema (event name, script path, timeout, matcher) early in Phase 4; emitter writes the config, so a schema mismatch breaks silently until test. |
| Adapter prose instructions don't work on Antigravity | Medium | Claude-only narrative (`AskUserQuestion`, `Agent` tool invocations) stays as prose in canonical source; Antigravity reads it and interprets with its own primitives. Smoke-test in Phase 7 — if a skill step fails, the fix is to rewrite that section of prose in Phase 8. |
| Tier model ids drift (Gemini 3.1, GPT-5.2, etc.) | High over time | Centralised in `tiers.mjs` — single-file bumps. |
| Build output not picked up by Antigravity workspace | Medium | Document the copy/symlink step in generated `README.md`; later: ship a `npm run install:antigravity` script. |
| CI parity check flakes on line endings (Windows) | Medium | Normalize EOL to LF in emitters; configure `.gitattributes` for generated paths. |
| Codex generator regression from `_shared/` extraction | Low | Refactor in a single commit with `--check` passing pre- and post-; full re-emit diff is the safety net. |

---

## 7. Sequencing & dependencies

```
Phase 1 (.mjs port) ──┐
                      ├──► Phase 3 (Antigravity emitter) ──► Phase 4 (hooks) ──► Phase 5 (shims) ──► Phase 7 (verify)
Phase 2 (tiers) ──────┘                                                                              ▲
                                                                                                     │
Phase 6 (AGENTS.md) ────────────────────────────────────────────────────────────────────────────────┘
                                                                                                     │
                                                                              Phase 8 (audit) ───────┘
```

- Phases **1** and **2** are Phase-4-rollout-safe (no shape change to source) — can land in parallel with v9.23.0 cleanup.
- Phases **3–6** require Phase 4 v9.23.0 to settle (they touch the same source files).
- Phase **7** is the gate to ship.
- Phase **8** is post-ship hygiene.

---

## 8. Open questions to confirm during implementation

1. **Antigravity hook event names** — the `hooks-map.mjs` uses `pre_tool` / `post_tool` as placeholders. Verify the exact event name strings against Antigravity CLI v2 plugin reference before implementing Phase 4.
2. **Antigravity hook config schema** — confirm the exact JSON schema Antigravity expects for `.antigravity-generated/hooks.json` (event name, script path format, timeout fields, matcher syntax).
3. **Antigravity plugin marketplace mechanics** — the Codex emitter writes `.agents/plugins/marketplace.json` for Codex discovery. Confirm whether Antigravity reads the same file or requires a separate entry point for plugin marketplace installation.
4. **Codex hooks (future)** — if Codex hook support has matured and you want to enable them: flip `includeHooks: true` in `.codex-plugin.overrides.json`, extend `CODEX_HOOK_EVENT_MAP` in `hooks-map.mjs`, and verify the Codex hook trigger config format. Track as a separate task; do not block this plan's scope on it.
5. **`npm run check` in CI** — confirm whether CI currently invokes the existing Codex `--check` via a root-level script, a plugin-level script, or directly. Ensure the new `check` npm script in `plugins/sdlc-workflow/package.json` is wired into the same CI step.

---

## 9. Out of scope

- Migration to a host-neutral authoring spec (rejected — Claude-native source stays canonical).
- Tracking `.antigravity-generated/` or `.codex-generated/` in git (build output only; `AGENTS.md` is the one tracked exception).
- Inventing a `.agents/plugins/*` plugin format that all hosts read (does not exist in 2026).
- Supporting hosts beyond Claude / Codex / Antigravity in this iteration (Cursor, Windsurf, etc. get `AGENTS.md` coverage in Phase 6 but no native plugin emission).
- **Plugin-bundled sub-agents.** Sub-agents used by `sdlc-workflow` are user-scoped (`~/.claude/agents/`), not plugin-bundled. Shipping sub-agent definitions as part of the plugin bundle (so they install automatically) requires a new design decision and host-specific research; out of scope here.
- **Enabling Codex hooks.** Current overrides set `includeHooks: false` deliberately. Enabling them requires verifying Codex's 2026 hook contract maturity and is a separate follow-on task.

---

## 10. References

- [generate-codex-plugin.mjs](../../../../scripts/generate-codex-plugin.mjs) — reference implementation for emitter pattern.
- [CODEX-PLUGIN-MIGRATION-PLAN.md](./archived/CODEX-PLUGIN-MIGRATION-PLAN.md) — prior Codex migration history.
- [.codex-plugin.overrides.json](../../.codex-plugin.overrides.json) — overrides schema to mirror for Antigravity.
- [Antigravity: Build with Google Antigravity](https://developers.googleblog.com/build-with-google-antigravity-our-new-agentic-development-platform/)
- [Antigravity Skills tutorial (Google Cloud Community)](https://medium.com/google-cloud/tutorial-getting-started-with-antigravity-skills-864041811e0d)
- [Codex CLI Hooks reference](https://developers.openai.com/codex/hooks)
- [Codex CLI Slash Commands reference](https://developers.openai.com/codex/cli/slash-commands)
- [AGENTS.md spec](https://agents.md/)
