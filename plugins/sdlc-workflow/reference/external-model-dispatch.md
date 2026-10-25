# External-Model Dispatch — operator reference

`consult` sends prompts to external AI models and returns their opinions. It is
model-invocable and runs on demand, with no consent flag.

| Skill | Invoke | Providers (bare = fan out to all available) | Role |
|-------|--------|---------------------------------------------|------|
| `consult` | `/consult [provider] <question>` (model-invocable; no `/wf` stage runs it as a step) | `codex`, `claude` (subscription CLIs, repo-aware), `gemini`, `openai`, `<provider>/<model>` (REST, prompt-only) | Read-only oracle panel — plan critique, code review, diagnosis, second opinion. Never edits. |

Its cost is bounded by pinning a free CLI on any model-initiated run (see Cost model).

## Secrets — env only (never config, never argv)

| Provider | Env | Billing |
|----------|-----|---------|
| `codex`, `claude` (CLIs) | none (cached `codex login` / `claude` OAuth) | **subscription** (free per call) |
| `openai` | `OPENAI_API_KEY` | per-token |
| `gemini` | `GEMINI_API_KEY` or `GOOGLE_API_KEY` | per-token |
| `<provider>/<model>` (gateway) | `AI_GATEWAY_API_KEY` | per-token |

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

Bare invocations **fan out to every available provider**: a consult opinion panel.
Subscription CLIs are free per call; the REST/API backends bill per-token on
**every** call. Pin a single provider to control spend: `/consult codex …`.
When the model self-initiates a `consult` it always pins a
free CLI (`codex`/`claude`) — the paid REST oracles are never fanned out unattended.

## Build/parity notes

The skill is pure `SKILL.md` + `scripts/*.mjs` invoked directly by `node`, so
it needs no build or version bump. The only hook change for this feature is
the hook sentinel early-exit. One tree serves every host: the skill carries
its `agents/openai.yaml` interface metadata beside the shared `SKILL.md`, and the
prose spells script invocations as `node "<skill-dir>/scripts/…"` per
`skills/wf/reference/_host-invocation.md`.
