---
name: uiproto
description: Prototype a UI component/screen from a prompt. Fans out to Stitch + an LLM by default (side-by-side); a provider keyword yields one. Writes a self-contained, sandboxed HTML fragment. Internal to `/wf design`; not user-invocable.
version: 1.0.0
user-invocable: false
argument-hint: "[stitch|llm] <prompt>"
---

Prototype a UI component or screen from a natural-language prompt and embed it as
a **sandboxed `<iframe srcdoc>`** fragment beside the design artifact. Google
Stitch is the primary engine; a self-contained LLM-HTML generator is the automatic
fallback. EXTERNAL-MODEL-DISPATCH-PLAN §3.3.

## Step 0 — Resolve

1. **Provider.** First token `stitch` or `llm` pins it; otherwise the whole
   argument is the prompt → **fan out to both** side-by-side.
2. **Consent for egress.** Both engines send the prompt to a third party, so they
   require `externalDispatch.enabled` in `~/.sdlc/hub-config.json`. If consent is
   off, STOP with the one-line opt-in notice (there is no no-egress fallback here).
3. **Output.** Generated HTML goes to a temp file; the fragment is
   `<stem>.uiproto.<provider>.html.fragment` next to the design artifact `<stem>.md`.

## Step 1 — Generate

- **`stitch`** — `node ${CLAUDE_PLUGIN_ROOT}/skills/uiproto/scripts/gen-stitch.mjs "<prompt>" <outHtml>`.
  Needs `STITCH_API_KEY` + `STITCH_PROJECT_ID` (a project pre-created in the Stitch
  UI — the SDK has no createProject) + the lazy `@google/stitch-sdk` dep. Any miss
  exits 1 → skip and fall through to `llm`.
- **`llm`** — `node ${CLAUDE_PLUGIN_ROOT}/skills/uiproto/scripts/gen-llm.mjs "<prompt>" <outHtml> [provider]`.
  A self-contained REST call (OpenAI / Gemini / gateway `<provider>/<model>`) that
  emits one self-contained HTML component. No CLI, no isolation. Exit 1 = no REST
  provider available.

Each generator prints the path to the written HTML on success.

## Step 2 — Fan-out (default) vs pin

- **Pinned** (`stitch` or `llm`): run that one; if `stitch` is unavailable, fall
  through to `llm`.
- **Bare**: run **both** side-by-side — a Stitch screen and an LLM component for
  the same prompt, so you can compare engines. Skip any that is unavailable and
  name it.

## Step 3 — Embed (sandboxed iframe)

Wrap each generated HTML file in a sandboxed iframe fragment:
`node ${CLAUDE_PLUGIN_ROOT}/skills/uiproto/scripts/embed-iframe.mjs <htmlPath> <fragmentPath> <provider> "<caption>"`.
Both Stitch screens AND the LLM component ride `<iframe sandbox srcdoc>` — a full
generated screen carries colliding CSS, so it must be isolated (raw-inlining would
leak styles). The sandbox runs no scripts: the served view's CSP blocks inline JS
in srcdoc frames anyway, so the preview is visual (layout + styling).

## Step 4 — Output

```
UIPROTO_RESULT:
  prototypes:
    - provider: <stitch|llm>
      fragment: <path to the .uiproto.<provider>.html.fragment>
      prompt: <exact prompt used>
  skipped: <provider (reason), … | none>
```

## Caller + cost

Invoked at the visual-contract step (`plan`, following `design/contract.md`) or a design transform, beside the `imagery` mock. Bare fan-out
calls **both** engines (per-token to your keys; Stitch needs its own provisioned
project). Pin `uiproto llm <prompt>` or `uiproto stitch <prompt>` for one engine.
Always opt-in; never hook- or serve-triggered.
