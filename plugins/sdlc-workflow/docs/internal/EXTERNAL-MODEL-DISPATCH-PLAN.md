# External-Model Dispatch — Plan

Status: **BUILT — v9.93.0, 2026-06-23, on master (Phases 0–3 landed).** See §13 build log.
(Originally DRAFT planning; branch target master, jayte 2026-06-17.)
Date: 2026-06-16 (decisions appended 2026-06-17). Author: planning pass with jayte.

> **Addendum 2026-07-01 (v9.96.0) — `consult` made autonomous, consent gate dropped.**
> Reversing D12's "always opt-in, never auto" posture *for `consult` only*: it is now
> **model-invocable** (`disable-model-invocation: false`) and **auto-runs** at the
> plan / design / review / diagnosis judgment points, including inside `/wf auto` and
> `/wf yolo`. The `externalDispatch.enabled` re-check is **removed from
> `consult/dispatch.mjs`** (§5 rule 1 no longer applies to consult); cost is instead
> bounded by the rule that any model-initiated run **pins a free CLI (`codex`/`claude`)**
> and never fans out to paid REST unattended. `imagery` and `uiproto` are unchanged —
> they keep the consent flag and the script-level trust boundary. The read-only
> sandbox / credential scrub / hook-isolation guarantees for consult are untouched;
> only *consent* was removed, not *safety*.

Add the ability, *as part of the SDLC workflow*, to send prompts to external AI
models — coding sub-agents (Codex / Claude), image models (gpt-image-2,
nano-banana family), and a UI-component prototyper (Google Stitch) — and embed
the results into rendered artifacts. Dispatch lives in a **shared `lib/` module
invoked by skills**, not in the hub daemon (no new hub network surface).

---

## 1. Decisions locked (from Q&A 2026-06-16)

| # | Decision | Choice |
|---|----------|--------|
| D1 | Where dispatch lives | **Shared `lib/` + skills.** No HTTP endpoint on the hub; credentials read from env at call time. Mirrors the proven `imagegen` pattern. |
| D2 | Model routing | **Pluggable router, subscription-first.** Codex via ChatGPT subscription (CLI/app-server); Claude via subscription (headless `claude`, API-key env scrubbed); **plus** a Vercel AI Gateway backend as the per-token / fallback route. *(Superseded in part: D12 reframes the primary intent as a read-only **oracle**, not code-writing; D8 defers Flue — the gateway alone covers per-token. Read D2 as "how dispatch routes," D12 as "what it's for.")* |
| D3 | v1 scope | **All four:** coding sub-agent dispatch, image generation, UI prototyping, and the shared embedding + dispatch core. |
| D4 | UI-prototyping engine | **Google Stitch SDK/MCP** (`@google/stitch-sdk`), with LLM-HTML as a graceful fallback (reuses the dispatch core). |
| D5 | Branch | **master** (no feature branch off `feat/sdlc-runtime-store`). |
| D6 | Default image model | **`gemini-3.1-flash-image`** (Nano Banana 2, ~$0.067/1K img). `gemini-3-pro-image` available opt-in. |
| D7 | Egress consent | **Opt-in config flag is sufficient.** No separate `.ai/` consent marker. |
| D8 | Flue in v1 | **Deferred (confirmed 06-17).** Gateway-via-fetch covers the per-token/multi-model need; Flue lacks a one-shot API + has unverifiable transitive deps (§10). Revisit post-1.0. |
| D9 | Worktree base | **Seed with uncommitted work.** Worktree off HEAD, then **`git stash create`** (non-mutating — builds a dangling stash commit without disturbing the main working tree) + apply that SHA into the worktree, so mid-edit slice delegation works. Race-safe AND sees in-progress work. (NB: use `stash create`/`store`, NOT plain `git stash` — the latter mutates the user's tree and is not race-safe.) |
| D10 | Stitch role | **Stitch primary; provision a project ID.** `STITCH_PROJECT_ID` is required config; LLM-HTML remains the automatic fallback when Stitch is unavailable/unauthed. |
| D11 | Dispatch UX | **Propose diff for approval.** (Write-mode only.) Capture the sub-agent's diff and present it for review; do NOT auto-apply to the working tree. |
| D12 | Dispatch intent | **Consultative oracle, NOT code-writing (jayte 06-17).** Primary mode (v1) = read-only opinions: plan critique, code/implementation review, design analysis, diagnosis, second opinion. The write/delegate path (worktree+diff, D9/D11) is DEFERRED/opt-in, not the default expectation. |
| D13 | Delivery model | **Individual self-contained skill folder per deliverable** (`skills/consult/`, `skills/imagery/`, `skills/uiproto/`; the `imagegen` "Vehicle 1" pattern). NOT folded into `/wf` as keys (jayte 06-18 — "I didn't say move under wf"); NO shared `_dispatch` folder — each skill self-contained. No build/`buildId`/`sync`/bump for the skills — only codex hand-mirror. The opt-in flag is the sole `lib/`→`dist/` edit. |
| D14 | `imagegen` | **Deprecated (jayte 06-17).** Superseded by the `imagery` skill (direct API). Repoint `/wf design`; thin alias one release; then delete (both trees + marketplace skill list). |
| D15 | No flags | **Use `wf`-style positional subcommands, not flags (jayte 06-18).** Each skill's `SKILL.md` does a Step-0 positional resolve: first token = optional provider keyword, rest = request; intent/paths inferred from prose + env (as `intake`/`design` do). The skills are NOT moved into `/wf` — just borrow its arg idiom. |
| D16 | Fan-out default | **All available providers in parallel by default (jayte 06-17); a provider keyword narrows to one.** `consult` → opinion panel; `imagery` → variant set (cost note: N images/call); `uiproto` → Stitch + LLM side-by-side. Unavailable providers skipped + named. |

### Subscription billing caveat (must be designed for, stated once)
- **Codex**: `codex exec` / `codex app-server` reuse a cached `codex login` (ChatGPT) session → subscription, no per-token billing. Already how `imagegen` Method 2 works today.
- **Claude**: headless `claude -p` uses subscription OAuth **only if** `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN` are **absent** from the child env (credential priority: cloud creds > `ANTHROPIC_AUTH_TOKEN` > `ANTHROPIC_API_KEY` > apiKeyHelper > OAuth). The Claude backend therefore **scrubs those vars** when auth=`subscription`.
- **Flue + Gateway**: per-token only (`AI_GATEWAY_API_KEY`, zero markup). No subscription path. Used when the user opts into the gateway route or for non-Codex/Claude models.
- **Watch item**: Anthropic's June-15-2026 "Agent SDK credit pool" change was *paused*, not cancelled. Keep auth pluggable so a flip to API-key/Gateway is a config change, not a rewrite.

---

## 2. Architecture

### 2.1 Module layout (CONCEPTUAL — physical delivery is §11/D13)

> **Delivery note:** the tree below shows the *logical* module boundaries. Per D13/§11 the actual
> code ships as **three standalone skill folders** (`skills/consult/`, `skills/imagery/`,
> `skills/uiproto/`, each a `SKILL.md` + self-contained `scripts/`, using `wf`-style positional
> subcommands) — NOT as this `lib/` subtree, NOT folded into `/wf`, and with NO shared `_dispatch`
> folder. The only piece that is genuinely `lib/`→`dist/` engine code is the opt-in config flag in
> `lib/hub-config.mjs`. Read this section for *what the pieces are*; read §11/§12 for *where they live*.

```
lib/
  dispatch/
    index.mjs           # public: dispatch({kind, task, repoRoot, backend?, schema?, sandbox?})
    router.mjs          # backend selection by policy + availability probe
    credentials.mjs     # env resolution + subscription env-scrub; never argv, never plaintext config
    backends/
      codex.mjs         # codex exec / app-server (subscription) — dep-free (CLI)
      claude.mjs        # headless `claude -p --output-format json` (subscription) — dep-free (CLI)
      gateway.mjs       # Vercel AI Gateway via fetch (OpenAI-compatible) — dep-free
      flue.mjs          # Flue harness over gateway/providers — lazy `import('flue')`
  image/
    index.mjs           # generate({prompt, size, aspectRatio, provider?, outputPath})
    backends/
      builtin.mjs       # session image_gen passthrough (Method 1, unchanged)
      openai-image.mjs  # gpt-image-2 REST via fetch — dep-free
      gemini-image.mjs  # nano-banana family via @google/genai — lazy import
  uiproto/
    index.mjs           # prototype({prompt, outputPath}) -> HTML fragment
    stitch.mjs          # @google/stitch-sdk — lazy import
    llm-fallback.mjs    # reuses dispatch/ to emit self-contained HTML
  embed/
    fragment.mjs        # write <stem>.<label>.html.fragment; data-URI / srcdoc embedding
```

### 2.2 Backend abstraction

Every dispatch backend implements:

```js
// returns { ok, text, structuredOutput?, costUsd?, sessionId?, diff?, error? }
async function run({ task, repoRoot, schema, sandbox, signal, env }) { ... }
// availability probe — cheap, no network. e.g. `which codex`, `which claude`,
// presence of AI_GATEWAY_API_KEY, or a require.resolve for an optional dep.
async function available() { ... }
```

"Routing" picks a backend by: explicit provider keyword → config default → first `available()` in a
preference order. Preference order (subscription-first): `codex` (CLI oracle), `claude` (CLI
oracle), `gateway` (per-token / other models). **Caveat (C2):** under **fan-out-by-default (D16)**
this preference order only governs the *narrowed* case (a provider keyword pins one); the **bare**
default hits **every** available provider in parallel, so subscription-first ordering is largely
moot for the common path. **Physical note (B3):** there is no shared `router.mjs` — per D13 this
selection logic lives inside each skill's runner (`consult/scripts/dispatch.mjs`). It is still the
single seam that honors D2; it's just per-skill, not a `lib/` module.

### 2.3 Dependency strategy (preserves "engine is dep-free")

| Backend | Dep | Delivery |
|---------|-----|----------|
| codex / claude (CLI oracle, subscription) | **none** (CLI on PATH) | nothing to install |
| gateway (oracle / other models) | **none** (`fetch` to `https://ai-gateway.vercel.sh/v1`) | nothing to install |
| openai-image (`gpt-image-2`) | **none** (`fetch` to `/v1/images/generations`) | nothing to install |
| gemini-image (nano-banana) | `@google/genai` **v2.8.0** | lazy import (mirror today's pip-install-if-missing) |
| stitch | `@google/stitch-sdk` **v0.3.5** (needs project ID) | lazy import, degrade → LLM fallback |
| ~~flue~~ | ~~`@flue/runtime`~~ | **DEFERRED out of v1 — see §10** |

Every lazy backend, when its dep/CLI is missing, returns
`{ ok:false, error:"<dep> not installed; run npm i <pkg>" }` and the router falls
through. Same fail-open posture as the view layer.

---

## 3. Capability detail

### 3.1 Model consultation / oracle dispatch (`lib/dispatch/`)

Purpose: from a workflow step, consult a headless Codex or Claude sub-agent **as an oracle /
second opinion** — plan critique, implementation & code review, design trade-off analysis,
diagnosis — and bring back its written opinion. **This is a read-only advisory capability, NOT
a code-writing one** (jayte 2026-06-17, D12). It generalizes the existing `codex:rescue` +
`/review` patterns into a pluggable, multi-model oracle.

**Modes:**
- **(A) Oracle — read-only, returns an opinion (PRIMARY, v1).** The sub-agent reads the live
  repo + the artifact/plan/diff under discussion and returns prose (a review, critique,
  diagnosis, recommendation). No edits, no patch. `cwd=repoRoot` — sees uncommitted work
  naturally, **no worktree, no diff machinery needed**. Sandbox: Codex `--sandbox read-only`;
  Claude **`--tools "Read,Glob,Grep"`** — the toolset restriction (Edit/Write/Bash absent from
  the model's context entirely), **NOT `--allowed-tools`** (that is only an auto-approval
  allowlist — it leaves Write/Bash available and a prompt-required write would *abort* a headless
  `-p` run, not be cleanly denied). `--permission-mode plan` is belt-and-suspenders on top, not
  the restriction itself. (A1, fresh-eyes pass 2026-06-19.)
- **(B) Write / delegate — worktree + diff + propose (DEFERRED, opt-in).** The rarer case where
  the oracle should actually produce changes. Uses the write-mode model below. Not a v1 default;
  built only if/when explicitly wanted.

**Backends** (shared by both modes; mode only changes the sandbox/tool surface):
- **Codex**: `codex exec --json --output-schema <schema>` (validated v1 path; `codex app-server`
  is the richer-but-riskier upgrade — defer). Subscription via cached `codex login`. SDK shape if
  used: `new Codex()` → `startThread({workingDirectory})` → `thread.run(prompt,{outputSchema})`;
  thin CLI wrapper, auth env `CODEX_API_KEY` (per-token only).
- **Claude**: `claude -p --output-format json --tools "Read,Glob,Grep" [--permission-mode plan]
  --max-budget-usd N`. Use **`--tools`** to bound the available toolset (the read-only guarantee);
  `--allowed-tools` is only an auto-approval allowlist and does NOT remove Write/Bash (A1).
  `--max-budget-usd` and `--max-turns` are both real headless spend caps. **Subscription auth is
  CLI-only**: `@anthropic-ai/claude-agent-sdk` is contractually **API-key-only** (claude.ai login
  prohibited for SDK products), so the subscription path MUST be the `claude` CLI, and the
  env-scrub must keep `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN` OUT of the child env (they outrank
  OAuth). Capture `result`, `session_id`, and `total_cost_usd` (the first two are documented schema
  fields; confirm `total_cost_usd`'s exact key empirically — D3).
- **Gateway**: per-token, dep-free `fetch` POST `https://ai-gateway.vercel.sh/v1/chat/completions`
  with `model:"anthropic/…"`/`"openai/…"`, bearer `AI_GATEWAY_API_KEY`. Covers models beyond
  Codex/Claude. **Flue DEFERRED** (§10).

**Hook isolation (BOTH modes).** Any headless `claude`/`codex` sub-session boots the repo's SDLC
`SessionStart` hook (hub adopt/register/bootstrap-render) and would fire write hooks if it wrote —
so every dispatch:
  - Claude: **`--settings <{disableAllHooks:true}>`** is the load-bearing suppression (it disables
    ALL hooks including plugin-provided ones) + `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` — do NOT
    relocate `CLAUDE_CONFIG_DIR` when auth=subscription (OAuth `.credentials.json` lives there);
  - Codex: `CODEX_HOME=<isolated>` + copied `auth.json` (issue #15410). **VERIFY (C3):** the exact
    Codex hook-disable knob (`config.toml [features] hooks=false`?) and `--ignore-user-config` /
    `--ignore-rules` are NOT yet doc-confirmed — give the Codex side the same verification the
    Claude flags got before relying on them;
  - sets `SDLC_DISPATCH_ACTIVE=1` (a sentinel the SDLC hooks also early-exit on) as
    **defense-in-depth, not the primary guard** — for read-only mode A the sub-agent never writes
    (write hooks never fire) and `disableAllHooks`/Codex `hooks=false` already suppress
    `SessionStart`, so the sentinel only matters if those flags regress or for the deferred
    write mode. Cheap insurance; don't treat it as the thing that makes isolation work;
  - **Windows spawn**: `spawn('cmd.exe',['/d','/s','/c',bin,...args])`; resolve the shim via `where.exe`.

**Write-mode (B) execution — worktree + diff (DEFERRED).** When changes are wanted:
`git worktree add .sdlc-dispatch/<id> HEAD` seeded with uncommitted work (D9) via **`git stash
create`** — which builds a dangling stash commit **without touching the user's working tree** — then
apply that SHA into the worktree. (Plain `git stash` mutates the main working tree and re-applies,
which is NOT race-safe and contradicts D9's stated goal — use `stash create`/`store`, not
`stash`.) → spawn with `cwd=<worktree>`, Codex `--sandbox workspace-write` / Claude
`--permission-mode acceptEdits` → capture `git -C <wt> diff HEAD` + `ls-files --others` → **propose
the diff for approval (D11), never auto-apply** → `git worktree remove --force`. Eliminates index
contention/render storms by construction.

- **Result (oracle)**: `{ opinion, structuredOutput?, costUsd, backend }` — prose surfaced to the
  user and/or embedded as a review fragment (§3.4). **Result (write-mode)**: adds `{ diff, newFiles }`.

Workflow wiring: a consult step in `/wf plan` & `/wf design` (critique the plan/design), in
`/review` (a second-model review pass), and as a **conceptual** generalization of `codex:rescue` so
Claude is a peer oracle — i.e. `consult` *supersedes the pattern*; it does NOT edit the separate
`codex` plugin (that plugin is out of this plan's file-change scope, §9). NOT auto-invoked by
hooks/serve.

### 3.2 Image generation (`lib/image/`) — hardens existing `imagegen`

Today `imagegen` scrapes `gpt-image-2` output from `~/.codex/sessions/.../rollout.jsonl`
and runs a Gemini Python script. Replace the brittle scrape with direct calls:

- `openai-image.mjs`: `fetch` POST `https://api.openai.com/v1/images/generations`,
  `model:"gpt-image-2"`, decode `data[0].b64_json` → write PNG. (No URL response mode
  for gpt-image-2; always base64.) Auth `OPENAI_API_KEY`. **Note**: this path is
  per-token API, *not* the Codex subscription — keep the old `codex exec` image path as
  an alternate for users who want subscription image gen.
- `gemini-image.mjs`: `@google/genai` `generateContent`, `responseModalities:["TEXT","IMAGE"]`,
  `responseFormat.image.imageSize:"1K"` (UPPERCASE K required — this is the *resolution tier*, not a
  pixel count), iterate **all** parts for `inlineData`. Default model `gemini-3.1-flash-image`
  (Nano Banana 2, ≈$0.067 **per 1K-tier image** — clarify the unit, it is per-image-at-1K, not
  per-1000-images); `gemini-3-pro-image` for premium. Auth `GEMINI_API_KEY` (or `GOOGLE_API_KEY`).
  (There is **no** "Nano Banana Pro 2"; the family is 2.5-flash-image → 3.1-flash-image →
  3-pro-image.) **Byte format (A3):** this path returns **JPEG bytes regardless of requested
  extension** (today's `imagegen` already special-cases this) — sniff the magic number and set the
  file extension + embed MIME to match the actual bytes; do not assume PNG.
- Unified `generate()` normalizes size: `imageSize`+`aspectRatio` for Gemini, `size` for
  OpenAI. Returns `{ path, provider, costUsdEstimate }`.
- Behavior split (D16 changed this from `imagegen`'s waterfall): **bare = fan-out** — run every
  available distinct-model provider in parallel → a variant set (NOT stop-at-first). A provider
  keyword narrows to one. The old waterfall ordering survives only as (a) the single-provider
  availability fallback and (b) the terminal **text-only** fallback when *no* provider yields an
  image: builtin `image_gen` → openai-image / codex-exec → gemini-image → text-only.

### 3.3 UI prototyping (`lib/uiproto/`)

- `stitch.mjs`: `new Stitch({ apiKey: STITCH_API_KEY })` → `stitch.project(<projectId>)` →
  `project.generate(prompt)` → `screen.getHtml()`/`getImage()` return **download URLs**;
  `fetch` them to get bytes. **Requires a pre-existing Stitch project ID** — the SDK has NO
  `createProject`; projects are made in the Stitch UI first and the ID is config. v0.3.5,
  pre-1.0, "not officially supported," ~1h OAuth token expiry — wrap in try/catch and fall
  through to the LLM-HTML path.
- `llm-fallback.mjs`: calls `dispatch/` with a "emit a self-contained HTML component"
  prompt; returns HTML string. Framework-agnostic, dep-free.
- Output → the model `Write`s a `<stem>.uiproto.<provider>.html.fragment` next to the design
  artifact (per-skill, no shared embed module — §12.0/§12.3). **Both** Stitch screens **and** the
  LLM component are sandboxed in `<iframe srcdoc>` (the authoritative §12.3 choice — iframe for
  parity + CSS isolation; this supersedes the "raw `<section>`" note in §3.4, which predates the
  decision to iframe uiproto output).

Workflow wiring: a step in `/wf design` (shape/craft) producing component prototypes
embedded in the design page, beside the existing imagegen mock.

### 3.4 Embedding (CONCEPTUAL — physical delivery is per-skill, §11/§12)

> **Delivery note (B3):** there is **no shared `lib/embed/fragment.mjs`**. Per D13/§11/§12 each
> skill embeds for itself — `consult` and `uiproto` `Write` their `.html.fragment` directly; only
> `imagery` carries a ~20-line base64 helper. The `embedFragment(...)` signature below describes the
> *shape of that per-skill logic*, not a real shared module. Read this for *what gets embedded*.

The renderer already injects free fragments (`<stem>.<label>.html.fragment`) raw-inline
with `@scope` CSS containment — **zero renderer changes** needed. *(Verify the free-fragment path
specifically applies `@scope`; if free fragments are truly raw with no scoping, the consult panel
and inline LLM components could leak CSS — uiproto already mitigates via `<iframe srcdoc>`.)*

- **Images**: embed as `data:<sniffed-mime>;base64,…` inside the fragment by default — **set the
  MIME from the actual bytes** (gpt-image-2 → `image/png`, Gemini → `image/jpeg`; do NOT hardcode
  `image/png`, A3). Decouples from the hub's path-serving, survives clean/additive renders. Offer an
  asset-copy-into-viewDir mode for large images.
- **Stitch HTML screens AND uiproto LLM components**: `<iframe srcdoc="…" sandbox>` to isolate
  their CSS/JS (both, per §12.3 — a full generated component can carry colliding CSS, so don't
  raw-inline it). *(This replaces the earlier "raw `<section>`" plan for LLM components.)*
- **Consult review panels**: markdown→HTML raw-inline (`<section class="nfrag">`) — low CSS-leak
  risk since it's formatted prose, not a styled component.
- **Oracle opinions (§3.1 mode A)**: a model's review/critique/diagnosis embeds as a
  `<stem>.review.<label>.html.fragment` "second opinion" callout (markdown → HTML), and/or is
  surfaced inline in chat. This is the main consumer of the embed seam for the dispatch capability.
- Per-skill helper shape (NOT a shared module — B3): `embedFragment({ mdPath, label,
  html|imagePath|markdown, mode })` → writes the `.html.fragment`, returns its path. Ordering via
  `NN-` label prefix.

---

## 4. Security model

New capability = first outbound network calls + headless agents with file/exec access.
Treat as a privacy/security boundary:

1. **Opt-in, off by default.** A `hub-config`/env flag (e.g. `externalDispatch.enabled`)
   gates everything. Default off. **Enforce it in `dispatch.mjs` itself, not only in the SKILL.md
   prose** — a direct `node dispatch.mjs …` call must re-check the flag and exit, or the consent
   boundary is bypassable (the script, not just the model, is the trust boundary).
2. **Never hub/hook/serve-triggered.** Only user-initiated workflow steps dispatch.
   Preserves the "no request-weaponizable work" stance.
3. **Secrets in env only.** `credentials.mjs` reads `OPENAI_API_KEY`, `GEMINI_API_KEY`,
   `AI_GATEWAY_API_KEY`, `STITCH_API_KEY`, etc. from env. **Never** written to plaintext
   `~/.sdlc/hub-config.json`; **never** passed via argv (visible in process list) — passed
   to children via `env` like `SDLC_HUB_TOKEN`.
4. **Sandbox the sub-agents.** Oracle mode (primary, D12) is **read-only**: Codex `--sandbox
   read-only` (a real OS-level sandbox), Claude **`--tools "Read,Glob,Grep"`** — the toolset
   restriction that actually removes Edit/Write/Bash from the model's context (NOT `--allowed-tools`,
   which is only an auto-approval allowlist and leaves write tools present — A1). `--permission-mode
   plan` is an extra layer, not the guarantee. Note the asymmetry: Codex's read-only sandbox is
   OS-enforced; Claude's is enforced only by the restricted toolset, so get the `--tools` flag right.
   Deferred write-mode tightens via worktree + `workspace-write`/`acceptEdits` + budget caps
   (`--max-budget-usd`, `--max-turns`). Read-only by default removes most of the blast radius.
5. **Egress disclosure.** Dispatching sends artifact/repo content to a third party.
   Skills must state this and require explicit invocation. **The opt-in config flag is the
   consent boundary (D7)** — no separate per-run `.ai/` marker.
6. **Prompt-injection awareness.** Repo/artifact text fed to a sub-agent may carry
   injected instructions; the sandbox + budget caps + no-network egress contain blast radius.

---

## 5. Build / parity / versioning

- New `lib/` files are esbuild-bundled into `dist/` → **`buildId` changes** → `npm run build`
  in the same commit (dist-freshness gate) + **`npm run sync:codex`** to carry dist into the
  Codex runtime (not CI-gated; fails silently if skipped).
- Skills exist in **both trees** (Claude `plugins/sdlc-workflow/skills/` and Codex
  `plugins/sdlc-workflow-codex/`). `sync:codex` mirrors `dist/`, **not** `skills/` — edit
  skill prose by hand in both trees; verify parity via `grep -h | sort -u`.
- Version bump = 5 source/config spots + marketplace top-level + 53 doc brands (per
  `plugin_version_bump_locations`). A template/CSS change would force it; a pure-lib add
  still needs the build + buildId bump.
- Lazy deps (`@google/genai`, `@google/stitch-sdk`, `flue`) are **optional** — add to
  `package.json` as optionalDependencies or document `npm i` hints; do **not** bundle into
  `dist/` (heavy, some carry native binaries). Engine stays dep-free.

---

## 6. Testing

*(Targets are the per-skill scripts, not shared `lib/` modules — B3. Run the scripts directly.)*

- Routing selection (`consult/scripts/dispatch.mjs`): explicit keyword > config > availability
  order; subscription-first ordering applies only when narrowed (C2).
- Credential handling (`consult/scripts/isolate.mjs`): env precedence; **env-scrub** removes
  `ANTHROPIC_API_KEY`/`_AUTH_TOKEN` when auth=subscription; secrets never in argv; Claude uses
  `--tools` (not `--allowed-tools`) for the read-only toolset (A1).
- Embedding (per-skill): data-URI image embedding with **MIME sniffed from bytes** (A3);
  `srcdoc` iframe for Stitch; `NN-` ordering; `@scope` containment intact.
- Graceful degradation: missing CLI / missing optional dep → `{ok:false}` + fall-through.
- Backends mocked (no live API/CLI in tests): mock `fetch`, mock `child_process.spawn`,
  mock dynamic `import()`. Live calls only behind a manual `*.live.test` opt-in.
- Keep the suite green (≈432 unit at time of writing + verify:docs/codex; confirm the current
  count before landing — it drifts with each release).

---

## 7. Phasing (each phase shippable)

- **Phase 0 — Flag + the `consult` runner.** The Phase-0 engine edits (three, B4): `lib/hub-config.mjs`
  opt-in flag + config-schema field + the `SDLC_DISPATCH_ACTIVE` early-exit in the existing hooks
  (→ `npm run build` + `sync:codex` + version bump, ONCE). Plus `skills/consult/scripts/`
  (`dispatch.mjs` with fan-out, `isolate.mjs`) + tests. No user-facing skill yet.
- **Phase 1 — `consult` skill (oracle, read-only, fan-out).** `codex` + `claude` CLI providers
  (subscription, Codex `--sandbox read-only` / Claude `--tools "Read,Glob,Grep"` — A1, NOT
  `--allowed-tools`) + `gemini`/`openai` REST.
  `skills/consult/SKILL.md` (`wf`-style positional parse); wire into `/wf plan` & `/review` +
  generalize `codex:rescue` to a multi-model panel. Opinions embed as a review panel fragment.
  **Write-mode deferred, not v1.** Hand-mirror to the codex tree; no build.
- **Phase 2 — `imagery` skill (deprecate `imagegen`, D14).** `image_gen` + `gpt-image-2` (fetch) +
  nano-banana (`gemini-3.1-flash-image`, lazy `@google/genai`) + text fallback; fan-out variant set;
  embed via data-URI. Repoint `/wf design`; alias-then-remove `imagegen`. Hand-mirror; no build.
- **Phase 3 — `uiproto` skill.** Stitch (lazy `@google/stitch-sdk`, provisioned `STITCH_PROJECT_ID`)
  + LLM-HTML (self-contained REST `gen-llm.mjs`); fan-out side-by-side; wire a `/wf design`
  prototype step; embed via `<iframe srcdoc>`. Hand-mirror; no build.

---

## 8. Open risks / watch items

- **Anthropic subscription policy in flux** — keep Claude auth pluggable (sub ↔ API ↔ gateway).
- **`gpt-image-2` and GPT-5.5 are API-key-only for some surfaces** — subscription image gen
  must stay on the `codex exec` path; direct REST is per-token.
- **Stitch SDK is pre-1.0 / unsupported** — wrap defensively, always have the LLM fallback.
- **Concurrency** — neither provider publishes hard limits; cap parallel sub-agents (start 3–5)
  and honor 429/overloaded signals.
- **Codex `--json-log` not shipped** (issue #2288) — capture `--json` NDJSON stream or session
  JSONL for `codex exec`; app-server avoids this.

---

## 9. File-change inventory (estimate)

New skill folders (both trees, hand-mirrored — SKILL.md + scripts + codex `agents/openai.yaml`):
`skills/consult/` (`SKILL.md`, `scripts/dispatch.mjs`, `scripts/isolate.mjs`); `skills/imagery/`
(`SKILL.md`, `scripts/gen-openai.mjs`, `gen-gemini.mjs`, `gen-openai-codex.sh`, `embed-img.mjs`,
`gen-text-fallback`); `skills/uiproto/` (`SKILL.md`, `scripts/gen-stitch.mjs`, `gen-llm.mjs`).
**Engine edits (the ONLY `dist/` churn — 3 changes, B4):** `lib/hub-config.mjs` opt-in flag +
config-schema field + **`SDLC_DISPATCH_ACTIVE` early-exit** in the existing hooks. Repoints (A2 —
bigger than shape/craft): `imagegen`→`imagery` across `shape.md`, `craft.md`, `design.md`,
`_design-context.md`, each a flag→prose rewrite (`--output`/`--resolution 2K`) preserving the
`IMAGEGEN_RESULT` gate contract; `/wf plan` + `/review` gain a consult step. Deprecate-then-remove
`skills/imagegen/`. Tests (~6, run scripts directly with mocked `fetch`/`spawn`).
Build/`sync:codex`/version bump: **once, for the flag (Phase 0)** — the skills need none. Docs:
this plan + a short reference page.

---

## 10. Verification log (2026-06-17)

Adversarial pass against npm/official docs + local ground-truth. Corrections that change
implementation:

**Local environment (confirmed):** Node **v22.15.0** (global `fetch` stable ≥21 ✓; plugin
`engines.node>=20`, zero runtime deps ✓). `codex` on PATH (fnm node-versions). `claude` on
PATH (`~/.local/bin`). `core.hooksPath` UNSET → no auto-rebuild pre-commit hook; `npm run
build` + freshness check is manual.

**Package facts (verified/corrected):**
- `@anthropic-ai/claude-agent-sdk` v0.3.179 — `query()` + `outputFormat:{type:'json_schema'}`
  confirmed; bundles a 4.76 MB native binary; **API-key-only, claude.ai login prohibited** →
  subscription path is the `claude` CLI, not this SDK.
- `@openai/codex-sdk` v0.140.0 — `new Codex()` → `startThread({workingDirectory})` →
  `thread.run(prompt,{outputSchema})`; thin (77 KB) wrapper spawning the `@openai/codex` CLI
  (Rust binary); auth env `CODEX_API_KEY` (not `OPENAI_API_KEY`), per-token.
- `@google/genai` v2.8.0 — image `generateContent` shape confirmed; `responseFormat.image
  .imageSize` uppercase (`"1K"`); `gemini-3.1-flash-image` valid; reads `GEMINI_API_KEY`/`GOOGLE_API_KEY`.
- `@google/stitch-sdk` v0.3.5 — **`createProject()` does NOT exist**; real API is
  `new Stitch({apiKey})` → `stitch.project(<existingId>)` → `project.generate()` →
  `screen.getHtml()/getImage()` (download URLs). **A Stitch project must be pre-created in the
  UI; its ID is required config.**
- Vercel AI Gateway — `https://ai-gateway.vercel.sh/v1` OpenAI-compatible, `provider/model`
  strings, bearer `AI_GATEWAY_API_KEY` confirmed. `gpt-image-2` confirmed on OpenAI Images API.
- **`@flue/runtime`** (v1.0.0-beta.1, public since 2026-05-14) — **DEFERRED.** No one-shot API
  (`dispatch()` returns a receipt; result needs HTTP poll/`observe()`); HTTP-server-first, not
  an inline library; transitive deps `@earendil-works/pi-ai`/`pi-agent-core` not confirmed
  publicly installable (hard install risk); gateway routing unconfirmed; "experimental, APIs may
  change." Revisit post-1.0.

**Integration risks resolved (folded into §3.1 execution model + §4):**
- Headless `claude -p`/`codex exec` **fire the repo's plugin hooks** with no auto-suppression →
  must isolate (Claude `--settings {disableAllHooks:true}` — confirmed; Codex `CODEX_HOME` with a
  hook-disable knob, *provisionally* `[features] hooks=false` but **UNVERIFIED — see the C3 item in
  the fresh-eyes block below**). Tension: full config-dir isolation breaks subscription auth (creds
  live in the config dir) → Claude keeps `CLAUDE_CONFIG_DIR`, disables hooks via `--settings`;
  Codex copies `auth.json` into the isolated `CODEX_HOME`.
- **Worktree** is the only race-free, Windows-safe execution + diff-capture model (vs. live
  tree: `.git/index.lock` contention, render storms).
- **Windows spawn**: `spawn('cmd.exe',['/d','/s','/c',bin,...args])`; resolve shim via `where.exe`.

**All open questions RESOLVED 2026-06-17** (D8–D11): Flue deferred; worktree seeded with
uncommitted work; Stitch primary with provisioned `STITCH_PROJECT_ID` (LLM-HTML fallback);
diff proposed for approval (no auto-apply).

### Fresh-eyes correction pass (2026-06-19)

A second adversarial review (claims re-checked against Claude Code docs + the live `imagegen`
caller contract). Corrections folded into the sections above:

- **A1 (sandbox bug, was wrong).** The read-only oracle's Claude sandbox was specified as
  `--permission-mode plan --allowed-tools "Read,Glob,Grep"`. Per the docs, `--allowed-tools` is an
  **auto-approval allowlist, not a toolset restriction** — Write/Bash stay available and a
  prompt-required write *aborts* a headless `-p` run. The real restriction is **`--tools
  "Read,Glob,Grep"`**. Fixed in §3.1/§4/§12.0/§12.1. (Codex `--sandbox read-only` was already a true
  OS sandbox — unaffected.)
- **A2 (deprecation contract).** "`imagegen`→`imagery` caller change is one-word" was false: the
  `/wf design` gate branches on `method=text-only` and `scene_sentence` and the callers pass
  `--output`/`--resolution 2K` flags. `imagery` must keep the `IMAGEGEN_RESULT` contract and the
  repoint is a flag→prose rewrite across four files. Fixed in §9/§11/§12.2.
- **A3 (image MIME).** Gemini returns **JPEG**, not PNG — don't hardcode `data:image/png`; sniff the
  bytes. Fixed in §3.2/§3.4/§12.2.
- **A4 (worktree race).** D9's `git stash` mutates the user's tree; use non-mutating `git stash
  create`. Fixed in D9/§3.1 (deferred write-mode).
- **Confirmed CORRECT (no change):** `--max-budget-usd` exists; `--settings
  '{"disableAllHooks":true}'` exists and disables plugin hooks; `CLAUDE_CONFIG_DIR` holds OAuth
  `.credentials.json` (relocating breaks subscription auth); the `ANTHROPIC_API_KEY`/`_AUTH_TOKEN` >
  OAuth precedence and the env-scrub requirement.
- **Still OPEN to verify before Phase 0:** Codex hook-disable knob (`[features] hooks=false`?) +
  `--ignore-user-config`/`--ignore-rules` + `codex exec --output-schema` (C3); that the renderer's
  **free**-fragment path actually applies `@scope`; the exact `total_cost_usd` JSON key (D3).
- **Consistency sweeps:** `/wf-design`→`/wf design` (command retired); D2 reconciled with D8/D12;
  the `lib/` router/credentials/embed modules marked conceptual (physical = per-skill scripts, D13);
  "ONE engine edit"→three Phase-0 changes; test count 418→≈432; `codex:rescue` framing clarified as
  conceptual supersession; consult fan-out cost note added.

Plan is decision-complete and ready for Phase 0 **once the C3/@scope/D3 verifications land** (none
block authoring; they gate the Codex isolation + image embedding details).

---

## 11. Code delivery & wiring

**Delivery model (D13): one self-contained skill folder per deliverable** — `skills/consult/`,
`skills/imagery/`, `skills/uiproto/`, each a standalone skill (the `imagegen` "Vehicle 1" pattern):
a `SKILL.md` + skill-local `scripts/`. They are **NOT** folded into `/wf` as keys, and there is
**no shared `_dispatch` folder** — each skill is self-contained. (This revises the `lib/`-subtree
sketch of §2.1; only the opt-in flag is true `lib/`→`dist/` engine code.)

**Use `wf`-style subcommands, not flags (D15).** Each skill's `SKILL.md` parses its arguments the
way `/wf` resolves a sub-command (a Step-0 positional resolve), **not** with `--flags`. The first
token is an optional **provider keyword**; everything after it is the request. No
`--model`/`--kind`/`--output`/`--size` surface — intent is inferred from the request prose (as
`intake`/`design` infer from a freeform description) and paths/IDs come from context + env.

**Fan-out to all providers by default (D16).** With **no** provider keyword the request fans out to
**every available provider in parallel** (creds/CLI present) and returns all results — a panel of
opinions for `consult`, a variant set for `imagery`/`uiproto`. A provider keyword **narrows to
one**: `consult gemini …`, `imagery openai …`, `uiproto stitch …`. Unavailable providers are
skipped and named in the summary.

**The three skill folders:**

| Skill | Invocation | Providers (bare = all) | Invocable | Supersedes |
|-------|-----------|------------------------|-----------|------------|
| `consult` | `consult [provider] <question>` | `codex`, `claude`, `gemini`, `openai` (+ `<provider/model>`) | user-invocable (also `/wf plan`, `/review`, `/wf design`) | — |
| `imagery` | `imagery [provider] <prompt>` | `image_gen`, `openai` (gpt-image-2), `openai-sub` (codex subscription), `gemini` (nano-banana) | internal to `/wf design` | **`imagegen` (deprecated, D14)** |
| `uiproto` | `uiproto [provider] <prompt>` | `stitch`, `llm` | internal to `/wf design` | — |

Each mirrors by hand into `plugins/sdlc-workflow-codex/skills/<name>/` (SKILL.md + scripts + the
codex `agents/openai.yaml` descriptor — copy the existing `wf` skill's shape).

**Self-contained, no shared folder.** Each skill carries only the scripts it needs; the small
overlaps don't justify a shared `_dispatch` folder (rejected) or `lib/` churn:
- `consult` owns the only non-trivial shared concern — spawning **isolated, read-only CLI
  sub-agents** with the §3.1 hook-isolation — in `consult/scripts/` (`dispatch.mjs` + `isolate.mjs`).
- `imagery` and `uiproto` mostly make self-contained REST/SDK calls (image APIs, Stitch, the
  gateway for LLM-HTML) — no repo read, so **no isolation needed**; they don't depend on `consult`.
- **Embedding** is per-skill: the model writes HTML fragments directly (consult's review panel,
  uiproto's `<iframe srcdoc>`); only `imagery` needs binary→base64, a ~20-line helper it carries
  itself. No cross-skill script references.

**The Phase-0 engine edits — opt-in flag + the hook early-exit (D7).** This is the only `dist/`
churn, but it is **three changes, not one** (B4): (a) `externalDispatch.enabled` default in
`lib/hub-config.mjs`, (b) the matching config-schema field, and (c) the `SDLC_DISPATCH_ACTIVE`
early-exit in the existing hooks (defense-in-depth per §3.1/C1). All three bundle into `dist/` → they
DO require `npm run build` + `sync:codex` + version bump. Land them once in **Phase 0**; after that
the skills are pure `SKILL.md` + script authoring. Auth/secrets read from env in the scripts
(`OPENAI_API_KEY`, `CODEX_API_KEY` [per-token only], `GEMINI_API_KEY`/`GOOGLE_API_KEY`,
`AI_GATEWAY_API_KEY`, `STITCH_API_KEY`, `STITCH_PROJECT_ID`); subscription CLIs need none; never
written to hub-config, never argv (§4).

**Deprecating `imagegen` (D14):**
1. New `imagery` skill supersedes it — direct API per §3.2/§12.2, replacing the `rollout.jsonl`
   scrape, now fan-out-capable. **It keeps `imagegen`'s output contract** (`IMAGEGEN_RESULT` block;
   `method`/`file`/`prompt`/`scene_sentence`/`skip_reason`/`to_generate_later`) so the gate logic
   keeps working — see §12.2 step 4 (A2).
2. Repoint the `/wf design` callers — **more than shape/craft, and not a one-word swap (A2):** the
   `imagegen` name and its contract appear in `shape.md` (invocation + `method=text-only` branch),
   `craft.md` (invocation + `--resolution 2K`), `design.md` (image-gate prose), and
   `_design-context.md` (`image_gate` semantics). Each invocation also passes `--output`/`--resolution`
   flags that the no-flags `imagery` (D15) does not accept → rewrite to positional/prose, and
   reproduce the `2K` tier via prose inference (else the north-star image downgrades to 1K). Mirror
   every repoint in the codex tree.
3. Mark `skills/imagegen/SKILL.md` deprecated — frontmatter `deprecated: true` + a one-line
   "superseded by `imagery`" banner; keep it a thin alias for ONE release, then delete the folder
   (both trees + the marketplace skill list / available-skills description).
4. No `buildId` impact; the only release motion is the hand-mirror and the eventual removal.

**"Add a skill" recipe:**
1. `skills/<name>/SKILL.md` — frontmatter (`name`, `description`, `user-invocable`,
   `argument-hint`) + a Step-0 positional resolve (`[provider]` + request, `wf`-style) + the
   fan-out/embed flow + the summary.
2. `skills/<name>/scripts/*` — dep-free; lazy `import()` the optional SDKs (`@google/genai`,
   `@google/stitch-sdk`) with a graceful "run `npm i <pkg>`" miss.
3. Subscription CLIs via the `cmd.exe` wrapper; reference scripts as
   `${CLAUDE_PLUGIN_ROOT}/skills/<name>/scripts/…`.
4. Hand-mirror the folder → `plugins/sdlc-workflow-codex/skills/<name>/` (+ `agents/openai.yaml`).
5. Wire callers (`/wf plan`, `/review`, `/wf design`) to invoke the skill.
6. Tests: run the scripts directly with mocked `fetch`/`spawn` — **no build needed**.

Net: only the Phase-0 config flag touches `dist/`; everything else is skill-folder authoring +
codex hand-mirror.

---

## 12. Skill designs — the `consult` / `imagery` / `uiproto` skills

Each is a standalone skill (`skills/<name>/SKILL.md` + skill-local `scripts/`), in the `imagegen`
shape but with **`wf`-style positional parsing** (a Step-0 resolve of an optional provider keyword,
no flags) and **fan-out by default**. The model executes the SKILL.md prose (parse, fall-through,
format); the scripts do only what prose can't (spawn an isolated sub-agent, hit a REST API, decode
bytes). Uniform script exit contract: `0` ok · `1` unavailable → skip · `2+` error.

### 12.0 Scripts — self-contained per skill (no shared folder)

- **`consult/scripts/dispatch.mjs`** — the model runner with fan-out:
  `node dispatch.mjs <read-only|write> <repoRoot> <promptFile> [provider...]`; bare → all available
  in parallel. REST providers (`gemini`/`openai`/`<provider/model>`) → `fetch` the gateway/provider
  (content inline, no repo read). CLI providers (`codex`/`claude`) → **`isolate.mjs`** then spawn
  (`read-only` = Codex `--sandbox read-only` / Claude **`--tools "Read,Glob,Grep"`** [+ optional
  `--permission-mode plan`] — `--tools` is the real toolset restriction; `--allowed-tools` would NOT
  remove Write/Bash, A1). Prints `[{provider, ok, text, costUsd, error}]`. Read-only fan-out is
  concurrency-safe on the live tree. `isolate.mjs`: Claude `--settings {disableAllHooks:true}` (the
  load-bearing hook suppression) + `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` (keeps `CLAUDE_CONFIG_DIR` so
  OAuth survives) + scrubs `ANTHROPIC_API_KEY`/`_AUTH_TOKEN`; Codex isolated `CODEX_HOME` (copied
  `auth.json`; hook-disable knob + `--ignore-user-config`/`--ignore-rules` **unverified — C3**);
  `SDLC_DISPATCH_ACTIVE=1` as defense-in-depth (C1); `cmd.exe` wrapper on win32.
- **`imagery/scripts/`**: `gen-openai.mjs` (gpt-image-2 fetch), `gen-gemini.mjs` (lazy
  `@google/genai`), `gen-openai-codex.sh` (subscription alternate), `embed-img.mjs` (~20-line
  image→data-URI fragment writer, MIME sniffed from bytes — A3), `gen-text-fallback`.
- **`uiproto/scripts/`**: `gen-stitch.mjs` (lazy `@google/stitch-sdk`), `gen-llm.mjs` (a
  self-contained REST HTML-gen call via gateway/gemini/openai — **no CLI, no isolation needed**).
- **Embedding is per-skill:** `consult` and `uiproto` write HTML fragments directly (the model
  formats the panel / wraps the `<iframe srcdoc>` and `Write`s the `.html.fragment`); only `imagery`
  needs the base64 helper. No cross-skill script references.

### 12.1 `consult [provider] <question>` — oracle / second opinion (PRIMARY, read-only)

```yaml
name: consult
description: Consult external models as READ-ONLY oracles — plan critique, code/implementation
  review, design analysis, diagnosis, second opinion. Fans out to all available providers by
  default (a provider keyword narrows). Returns a panel of opinions; never edits the repo.
version: 1.0.0
user-invocable: true
argument-hint: "[codex|claude|gemini|openai] <question>"
```
SKILL.md flow:
1. **Step 0 — resolve.** If the first token is a provider keyword, pin it; else it's part of the
   question → fan-out. Gate on `externalDispatch.enabled` (off → one-line notice + stop). Infer
   what to read (a path/`diff`/`repo`) and the intent (review/critique/diagnose/compare) from the
   question prose + the artifact in context — no flags.
2. **Build the prompt** (preamble for the inferred intent + question; ask for verdict → findings →
   recommendation) → temp file; inline a named file/diff for REST providers.
3. **Dispatch read-only (fan-out).** `node ${CLAUDE_PLUGIN_ROOT}/skills/consult/scripts/dispatch.mjs
   read-only <repoRoot> <tmp> [provider]` → parse the JSON array; skipped providers are named.
4. **Synthesize + embed.** Present a panel (per provider: verdict + key points) + a one-line
   consensus/divergence line. **Evidence-asymmetry caveat:** CLI providers (`codex`/`claude`) read
   the live repo (`cwd=repoRoot`), while REST providers (`gemini`/`openai`) see only what step 2
   inlined into the prompt — so a REST oracle's "divergence" may just be missing context, not real
   disagreement. Flag each opinion's evidence scope (repo-aware vs prompt-only) in the panel so the
   synthesis weights them honestly. If an artifact target exists, the model writes a
   `<stem>.review.<NN>.html.fragment` panel directly.
5. **Output** `CONSULT_RESULT` (providers, skipped, one-line synthesis verdict, fragment, cost) +
   the narrative-first summary.

Callers: `/wf plan`, `/review`, `/wf design`; **conceptually** generalizes `codex:rescue` to a
multi-model panel (supersedes the pattern; does not edit the `codex` plugin — C4). Always
explicit/opt-in — never hook- or serve-triggered.

*(Cost note, C2: bare `consult` fans out to all available providers, so it spends per-token on
`gemini`/`openai` on **every** call (the subscription CLIs `codex`/`claude` don't), the same
per-result spend flagged for `imagery`. A provider keyword narrows to one. Tell me to default
`consult` to subscription-CLI-only (free) with REST providers opt-in if preferred.)*

### 12.2 `imagery [provider] <prompt>` — image generation (supersedes `imagegen`, D14)

```yaml
name: imagery
description: Generate images from a prompt. Fans out to all available providers by default
  (image_gen, gpt-image-2, nano-banana) → a variant set; a provider keyword yields one. Supersedes
  imagegen. Internal to /wf design.
version: 1.0.0
user-invocable: false
argument-hint: "[image_gen|openai|gemini|openai-sub] <prompt> [skip <reason>]"
```
SKILL.md flow:
1. **Step 0 — resolve.** Provider keyword pins; else fan-out. Default output
   `.ai/design-probes/<ts>[-<provider>].<ext>` where `<ext>` is **set from the actual bytes** (PNG
   for gpt-image-2, JPEG for Gemini — A3), not assumed. Resolution: with no `--resolution` flag
   (D15), **infer the tier from the prompt prose** ("hi-res / north-star / 2K" → 2K, else 1K) — see
   the deprecation note below; do NOT silently drop the 2K control the craft step relies on.
   Trailing `skip <reason>` → text fallback.
2. **Run providers** (independent; unavailable → skipped): `image_gen` (built-in), `openai`
   (`gen-openai.mjs`), `gemini` (`gen-gemini.mjs`, default `gemini-3.1-flash-image`, `imageSize`
   UPPERCASE, iterate all parts). None → text fallback. **`openai-sub` (`gen-openai-codex.sh`) is
   the *same model* (gpt-image-2) via the codex subscription, so it is an EXPLICIT-keyword route
   only — exclude it from bare fan-out** (else gpt-image-2 renders twice on two billing paths). Bare
   fan-out = one image per *distinct* model.
3. **Embed** each via `embed-img.mjs` (data-URI, sniffed MIME); a fan-out set renders as a comparison strip.
4. **Output — MUST stay contract-compatible with the `imagegen` caller (A2).** The `/wf design`
   shape/craft steps branch on `method=text-only` and consume `scene_sentence`, and the caller sets
   `image_gate` from the result ([shape.md:112](../../skills/wf/reference/design/shape.md),
   [_design-context.md:93](../../skills/wf/reference/design/_design-context.md)). So `imagery`
   **keeps the `IMAGEGEN_RESULT` block name and its `method` / `file` / `prompt` / `scene_sentence` /
   `skip_reason` / `to_generate_later` fields** (with `method` carrying the provider id). Renaming
   the block to `IMAGERY_RESULT` or the field to `provider`, or dropping `scene_sentence`, is NOT a
   "one-word caller change" — it breaks the gate. If a rename is wanted, it is a deliberate caller
   migration (every `imagegen` ref in `shape.md`, `craft.md`, `design.md`, `_design-context.md`),
   not a repoint.

*(Cost note: fan-out = N images/call — the one place "all by default" spends per result. A provider
keyword gives one; tell me to flip the default to single-best if preferred.)*

*(Caller-migration scope, A2: the callers pass flags today — `--output <path>.jpg`, `--resolution
2K`. Under no-flags (D15) the `--output` path becomes inferred/positional and the `--resolution 2K`
control must be reproduced via prose inference (step 1) or the craft north-star image silently
downgrades to 1K. Budget the repoint as a flag→prose rewrite at every call site, not one word.)*

### 12.3 `uiproto [provider] <prompt>` — UI component prototyping

```yaml
name: uiproto
description: Prototype a UI component/screen from a prompt. Fans out to Stitch + an LLM by default
  (side-by-side); a provider keyword yields one. Writes a self-contained HTML fragment. Internal to
  /wf design.
version: 1.0.0
user-invocable: false
argument-hint: "[stitch|llm] <prompt>"
```
SKILL.md flow:
1. **Step 0 — resolve.** Provider keyword (`stitch|llm`) pins; else both. Stitch project =
   `STITCH_PROJECT_ID` env. Default fragment `<stem>.uiproto.<provider>.html.fragment`.
2. **`stitch`** — `gen-stitch.mjs`: `new Stitch({apiKey}).project(STITCH_PROJECT_ID).generate(prompt)`
   → `screen.getHtml()` URL → `fetch` → HTML. Needs key + project ID + dep; else skipped. (No
   `createProject`; §10.)
3. **`llm`** — `gen-llm.mjs`: a self-contained REST call (gateway/gemini/openai) "emit one
   self-contained HTML component, inline CSS, no external deps, for: <prompt>" → HTML. No CLI / no
   isolation.
4. **Embed** each as `<iframe sandbox srcdoc>` (the model wraps + `Write`s the fragment) — Stitch
   returns a full *screen* so the iframe stops its CSS/JS leaking; the LLM component rides the same
   iframe for parity.
5. **Output** `UIPROTO_RESULT` — one row/prototype (`provider`, `fragment`, `prompt`).

Caller: a `/wf design` shape/craft step, beside the `imagery` mock.

**Small open choices (defaults taken; tell me to change):** the consult intent taxonomy (inferred,
not a keyword); `imagery` fan-out spending N images/call vs. single-best default; LLM UI in an
iframe vs. inline. None block Phase 0.

---

## 13. Build log (2026-06-23, v9.93.0, master)

All four phases implemented end-to-end. Tests: 479 total (477 pass, 2 live-only
skips) — +40 new across `tests/unit/skills/{consult-dispatch,imagery,uiproto}.test.mjs`.
`verify:docs` green (53 pages stamped v9.93.0), `verify:codex` parity OK (187 files).

- **Phase 0** — `externalDispatch.enabled` (default false) added to `HUB_CONFIG_DEFAULTS`;
  `SDLC_DISPATCH_ACTIVE` early-exit added to all 5 hook entrypoints; `consult/scripts/{dispatch,isolate}.mjs`.
  Single build+`sync:codex`+bump (9.92.0→9.93.0; marketplace 1.118.0→1.119.0; `_shell.mjs`; 53 doc stamps).
- **Phase 1** — `consult` skill (both trees, scripts byte-identical, codex `agents/openai.yaml`);
  advisory wiring in `/wf plan` + `/review`.
- **Phase 2** — `imagery` skill (both trees) with `_img.mjs`/`gen-openai.mjs`/`gen-gemini.mjs`/
  `gen-openai-codex.sh`/`gen-text-fallback.sh`/`embed-img.mjs`; `imagegen` marked `deprecated: true`
  (thin alias one release); design callers repointed imagegen→imagery in BOTH trees
  (`shape.md`, `craft.md`, `_design-context.md`, `design.md`). `IMAGEGEN_RESULT` contract preserved.
- **Phase 3** — `uiproto` skill (both trees) with `gen-stitch.mjs`/`gen-llm.mjs`/`embed-iframe.mjs`;
  optional `/wf design` craft step wired in both trees; `reference/external-model-dispatch.md` added.

### Deviations from the plan (all verified, all deliberate)

1. **Hook-isolation model INVERTED (load-bearing).** A docs check (claude-code-guide, 2026-06)
   could NOT confirm the `--settings {"disableAllHooks":true}` key, and the confirmed alternative
   `--bare` breaks subscription OAuth. So the `SDLC_DISPATCH_ACTIVE` sentinel + the SDLC-hook
   early-exits (confirmed by construction, zero auth risk) are the **PRIMARY** hook suppression for
   `consult`, not defense-in-depth. `--settings disableAllHooks` is NOT passed (an unknown key could
   abort the run). `--sandbox read-only` / `--tools` remain the enforcement.
2. **Confirmed `--tools "Read,Glob,Grep"`** as the real toolset restriction (A1), and added
   **`--strict-mcp-config`** (the plan missed that `--tools` does not gate MCP tools).
3. **Scrub list extended** beyond `ANTHROPIC_API_KEY`/`_AUTH_TOKEN` to the cloud-provider vars
   (`CLAUDE_CODE_USE_BEDROCK`/`VERTEX`/`FOUNDRY`) — all outrank OAuth.
4. **`consult` frontmatter** uses `disable-model-invocation: true` (slash-invocable, no model
   auto-fire) instead of the plan's `user-invocable: true` — honors "always explicit/opt-in" and
   avoids surprise per-token spend. Codex side: `allow_implicit_invocation: false`.
   **(REVERSED 2026-07-10: on codex-cli 0.143.0, `allow_implicit_invocation: false` hides the
   skill from the model entirely — explicit `$name` invocation stops working too, unlike Claude's
   `disable-model-invocation`. All four codex `agents/openai.yaml` flags now read `true`; the
   spend guard is the description text plus the script-level `externalDispatch.enabled` re-check.)
5. **`imagery`/`uiproto` egress gated at the SKILL level AND (as of the 2026-06-24 review, §13.1)
   the SCRIPT level** — `gen-openai`/`gen-gemini`/`gen-stitch`/`gen-llm` each re-check
   `externalDispatch.enabled` themselves; the built-in `image_gen` + text fallback never egress and
   stay available — preserves imagegen's zero-config behavior for non-opted-in users.
6. **Open items resolved/owned:** the renderer's FREE-fragment path DOES apply `@scope` containment
   (`renderers/_paths.mjs` + `render-sunflower.mjs scopeFragmentCss`), so consult panels / imagery
   strips raw-inline safely; uiproto still iframes (full screen = colliding CSS + CSP-blocked JS).
   C3 (codex hook-disable knob) remains UNVERIFIED — no speculative config injected; isolated
   `CODEX_HOME`+copied `auth.json` with graceful fallback, read-only sandbox as the guarantee.
   Codex tree had a pre-existing dangling `imagegen` reference (no skill folder) — repointing to
   the now-mirrored `imagery` fixes it.

### 13.1 Fresh-eyes review pass (2026-06-24) — 1 critical bug fixed, no bump

A post-build review found a **critical wiring bug** plus two smaller issues; all fixed in the
skill source (source-read → no rebuild/bump; v9.93.0 unchanged). Tests 479→**483** (481 pass, 2
live-skip); `verify:docs` + `verify:codex` still green at the **unchanged** buildId `0de9b410f4b7`;
all three `scripts/` dirs re-diffed byte-identical across trees.

1. **🔴 CRITICAL — `consult/dispatch.mjs` `runCli` never passed the hardened child env to `spawn()`.**
   `buildClaudeEnv`/`buildCodexEnv` were assigned to a local `childEnv` that `spawn(cmd, cmdArgs, {cwd,
   stdio, windowsHide})` then ignored — so the child inherited the parent env. This **silently defeated
   all three** isolate.mjs guarantees: the `SDLC_DISPATCH_ACTIVE` sentinel was never set on the child
   (→ the repo's SDLC hooks would fire inside the spawned oracle — i.e. the headline hook-isolation
   deviation was inert), API keys were never scrubbed (→ per-token billing instead of subscription),
   and the isolated `CODEX_HOME` was computed but unused (temp dir leaked). It slipped past the suite
   because `runFanout`'s test injects a fake `run` seam and the sentinel test sets the env by hand —
   the real `runCli`→`spawn` wiring was exercised by nothing. **Fix:** extracted a pure, exported
   `buildCliSpawn()` that returns the exact `{cmd, cmdArgs, options, tempHome}` handed to `spawn`
   (so `options.env` is now asserted in tests and cannot silently regress); `runCli` spawns with it
   and `rmSync`-cleans the temp `CODEX_HOME` (which holds an `auth.json` copy) on close/error.
2. **🟠 Stale comments** in `isolate.mjs` (header + the sentinel line) and `session-start-orient.mjs`
   still described the pre-inversion model (`--settings disableAllHooks` "load-bearing", sentinel
   "defense-in-depth"). Reworded to match deviation #1 — the sentinel is the primary mechanism.
3. **🟡 Consent enforced in-script only for `consult`.** `imagery`/`uiproto` egress generators gated
   on API-key presence but not on `externalDispatch.enabled`, contradicting the operator reference's
   "the script is the trust boundary" claim. Added a `dispatchEnabled` gate to `gen-openai`/`gen-gemini`
   (via `imagery/_img.mjs`) and `gen-stitch`/`gen-llm` (via new `uiproto/scripts/_consent.mjs`), each
   exiting `1` (= skip) when off; reference doc made precise (the bash `openai-sub` path stays
   explicit-keyword + SKILL.md gated). +4 unit tests (2 spawn-wiring regression guards, 2 consent gates).
