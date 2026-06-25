# External-Model Dispatch — operator reference

Three opt-in skills send prompts to external AI models and embed the results into
your work. Full design: `docs/internal/EXTERNAL-MODEL-DISPATCH-PLAN.md`.

| Skill | Invoke | Providers (bare = fan out to all available) | Role |
|-------|--------|---------------------------------------------|------|
| `consult` | `/consult [provider] <question>` | `codex`, `claude` (subscription CLIs, repo-aware), `gemini`, `openai`, `<provider>/<model>` (REST, prompt-only) | Read-only oracle panel — plan critique, code review, diagnosis, second opinion. Never edits. |
| `imagery` | internal to `/wf design` | `image_gen` (built-in, no egress), `openai` (gpt-image-2), `gemini` (nano-banana), `openai-sub` (gpt-image-2 via codex subscription, explicit-only) | Image generation → variant set. Supersedes `imagegen` (D14). |
| `uiproto` | internal to `/wf design` | `stitch` (Google Stitch), `llm` (self-contained HTML) | UI component/screen prototype → sandboxed `<iframe srcdoc>`. |

## Consent — one machine-wide flag (off by default)

Dispatch is a privacy/egress boundary. Nothing sends until you opt THIS machine in:

```json
// ~/.sdlc/hub-config.json
{ "externalDispatch": { "enabled": true } }
```

The skill runners re-check this flag themselves (the script, not just the SKILL.md,
is the trust boundary): consult's `dispatch.mjs`, imagery's `gen-openai`/`gen-gemini`,
and uiproto's `gen-stitch`/`gen-llm` each exit early when it is off, so a direct
`node …` invocation cannot bypass consent. The built-in `image_gen` path and the
text fallback never egress and work with the flag off; the `openai-sub` (gpt-image-2
via the codex subscription) path is explicit-keyword-only and SKILL.md-gated. Egress
consent is this one flag — there is no per-run `.ai/` marker (D7).

## Secrets — env only (never config, never argv)

| Provider | Env | Billing |
|----------|-----|---------|
| `codex`, `claude` (CLIs) | none (cached `codex login` / `claude` OAuth) | **subscription** (free per call) |
| `openai`, `openai-sub` (gpt-image-2) | `OPENAI_API_KEY` / codex subscription | per-token / subscription |
| `gemini` (nano-banana) | `GEMINI_API_KEY` or `GOOGLE_API_KEY` (+ `npm i @google/genai` for images) | per-token |
| `<provider>/<model>` (gateway) | `AI_GATEWAY_API_KEY` | per-token |
| `stitch` | `STITCH_API_KEY` + `STITCH_PROJECT_ID` (project pre-created in the Stitch UI) + `npm i @google/stitch-sdk` | per-token |

The optional SDKs (`@google/genai`, `@google/stitch-sdk`) are lazy-imported — a
missing dep degrades that one provider, it does not crash the skill.

## Read-only & isolation guarantees (`consult`)

The CLI oracles run strictly read-only and isolated:

- **Claude**: `--tools "Read,Glob,Grep"` (the real toolset restriction — removes
  Edit/Write/Bash; **not** `--allowed-tools`, which is only an auto-approval list)
  + `--strict-mcp-config` (no MCP) + `--permission-mode plan` + `--max-turns`.
  Subscription is forced by SCRUBBING `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN`
  (+ the cloud-provider vars) so OAuth wins; `CLAUDE_CONFIG_DIR` is kept.
- **Codex**: `--sandbox read-only` (a real OS sandbox) + an isolated `CODEX_HOME`
  (auth.json copied) + `CODEX_API_KEY` scrubbed for the subscription path.
- **Hook isolation**: `SDLC_DISPATCH_ACTIVE=1` is set on the child, and every SDLC
  hook early-exits on it. This sentinel is the **primary** hook suppression —
  verification (2026-06) could not confirm the plan's `--settings {disableAllHooks}`
  key, and the confirmed `--bare` breaks subscription OAuth, so the sentinel (fully
  under our control) is relied on instead, with `--sandbox` / `--tools` as the
  enforcement. C3 (codex hook-disable knob) remains unverified — the read-only
  sandbox is the codex guarantee.

The REST oracles (`gemini`, `openai`, gateway) are **prompt-only** — they see only
what the prompt inlined. `consult` labels each opinion's evidence scope so a
prompt-only oracle's "disagreement" is weighted as possible missing context, not
true dissent.

## Cost model

Bare invocations **fan out to every available provider** (D16): a consult opinion
panel, an imagery variant set (one image per distinct model — `openai-sub` excluded
to avoid double-billing gpt-image-2), or both uiproto engines. Subscription CLIs are
free per call; the REST/API backends bill per-token on **every** call. Pin a single
provider to control spend: `/consult codex …`, `imagery gemini …`, `uiproto llm …`.

## Build/parity notes

The skills are pure `SKILL.md` + `scripts/*.mjs` invoked directly by `node` — NOT
esbuild-bundled, so they need no build/`sync:codex`/version bump. The only `dist/`
change for this feature is the `externalDispatch` flag + the hook sentinel
early-exit (landed in v9.93.0). Each skill is hand-mirrored into the Codex tree
(`plugins/sdlc-workflow-codex/skills/<name>/`, scripts byte-identical, +
`agents/openai.yaml`).
