---
name: uiproto
description: Prototype a UI component/screen from a prompt. Fans out to Stitch + an LLM by default (side-by-side); a provider keyword yields one. Writes a self-contained, sandboxed HTML fragment. Internal to `$wf design`; not user-invocable.
argument-hint: "[stitch|llm] <prompt>"
---

Prototype a UI component/screen from a prompt and embed it as a **sandboxed
`<iframe srcdoc>`** fragment beside the design artifact. Stitch is primary; a
self-contained LLM-HTML generator is the fallback. Let `<skill-dir>` be the
directory this SKILL.md loads from.

## Step 0 — Resolve

1. **Provider.** First token `stitch` or `llm` pins it; otherwise the whole
   argument is the prompt → **fan out to both** side-by-side.
2. **Consent.** Both engines egress, so require `externalDispatch.enabled` in
   `~/.sdlc/hub-config.json`; if off, STOP with the opt-in notice (no no-egress
   fallback here).
3. **Output.** HTML → temp file; fragment → `<stem>.uiproto.<provider>.html.fragment`.

## Step 1 — Generate

- **`stitch`** — `node <skill-dir>/scripts/gen-stitch.mjs "<prompt>" <outHtml>`.
  Needs `STITCH_API_KEY` + `STITCH_PROJECT_ID` (project pre-created in the Stitch UI;
  the SDK has no createProject) + lazy `@google/stitch-sdk`. Any miss → exit 1 → fall to `llm`.
- **`llm`** — `node <skill-dir>/scripts/gen-llm.mjs "<prompt>" <outHtml> [provider]`.
  Self-contained REST (OpenAI / Gemini / gateway `<provider>/<model>`) emitting one
  self-contained HTML component. No CLI, no isolation. Exit 1 = no REST provider.

## Step 2 — Fan-out vs pin

- **Pinned**: run that one; if `stitch` is unavailable, fall through to `llm`.
- **Bare**: run **both** for the same prompt (compare engines); skip + name any unavailable.

## Step 3 — Embed (sandboxed iframe)

`node <skill-dir>/scripts/embed-iframe.mjs <htmlPath> <fragmentPath> <provider> "<caption>"`.
Both Stitch screens and the LLM component ride `<iframe sandbox srcdoc>` for CSS/JS
isolation. The sandbox runs no scripts (the served view's CSP blocks inline JS in
srcdoc frames anyway) — the preview is visual.

## Step 4 — Output

```
UIPROTO_RESULT:
  prototypes:
    - provider: <stitch|llm>
      fragment: <path>
      prompt: <exact prompt>
  skipped: <provider (reason), … | none>
```

Caller: the visual-contract step (`plan`, following `design/contract.md`) or a design transform, beside the `imagery` mock. Bare fan-out
calls both engines (per-token to your keys; Stitch needs a provisioned project).
Pin one for a single engine. Always opt-in.
