---
name: imagery
description: Generate images from a text prompt. Fans out to all available providers by default (built-in image_gen, gpt-image-2, nano-banana) → a variant set; a provider keyword yields one. Internal to `/wf design`; invoke it through that key.
version: 1.0.0
user-invocable: false
argument-hint: "[image_gen|openai|gemini|openai-sub] <prompt> [skip <reason>]"
---

Generate an image (or a fan-out variant set) from a natural-language prompt, then
embed it. This skill calls the image APIs directly, and it is fan-out-capable. It
**emits the `IMAGEGEN_RESULT` output contract** that the `/wf design` image gate reads.
`<skill-dir>` resolves per [_host-invocation.md](../wf/reference/_host-invocation.md).

## Step 0 — Resolve (positional, no flags)

1. **Provider.** If the first token is a provider keyword — `image_gen` (built-in
   tool), `openai` (gpt-image-2 REST), `gemini` (nano-banana), `openai-sub`
   (gpt-image-2 via the codex subscription) — pin it; the rest is the prompt.
   Otherwise the whole argument is the prompt → **fan out** (see Step 2).
2. **Skip.** A trailing `skip <reason>` → go straight to the text fallback
   (Method T) with `method=skipped`.
3. **Output path.** Default `.ai/design-probes/<unix-ts>[-<provider>].<ext>` —
   `<ext>` is **set from the actual bytes** by the generators (PNG for gpt-image-2,
   JPEG for Gemini — A3), so pass a base path; the result reports the real path.
   Create `.ai/design-probes/` if needed.
4. **Resolution tier (no `--resolution` flag, D15).** Infer from the prompt prose
   **or the invoking context**: a **north-star / hi-res / high-res / 2K** cue → the
   **2K** tier; else **1K**. Pass the tier as the generator's positional `<tier>`
   argument (`1K` or `2K`; it never enters the image prompt). The contract north-star
   step says "2K" in its instruction — honor it; do not silently drop to 1K.
5. **Consent for egress.** The egress providers (`openai`, `gemini`, `openai-sub`)
   send the prompt to a third party, so they require `externalDispatch.enabled` in
   `~/.sdlc/hub-config.json`. The text fallback never egresses and is **always** available; the built-in
   `image_gen` never egresses and is available only where the host offers it
   (provider table below). If consent is off, run only `image_gen` (where present)
   and the text fallback, and note that the API backends need opt-in.

## Step 1 — Provider methods

| Provider | Model / billing | Hosts | Method |
|---|---|---|---|
| `image_gen` | host built-in tool; no egress, no key | Only a session whose tool list includes `image_gen` — a host surface, see [_host-invocation.md](../wf/reference/_host-invocation.md) | Call the tool with the prompt and save the returned bytes to the output base path. Preferred when present. |
| `openai` | gpt-image-2 REST; per-token | both | `node "<skill-dir>/scripts/gen-openai.mjs" "<prompt>" <outBase> <tier>` — exit 1 = `OPENAI_API_KEY` unset → skip; 2/3 = error → skip |
| `gemini` | nano-banana; per-token | both | `node "<skill-dir>/scripts/gen-gemini.mjs" "<prompt>" <outBase> <tier>` — exit 1 = no key or `@google/genai` not installed → skip |
| `openai-sub` | gpt-image-2 via the codex subscription (same model as `openai`, different billing path) | both | `bash "<skill-dir>/scripts/gen-openai-codex.sh" "<prompt>" <outPath>` |
| Method T — text fallback | no model; no egress | both (always available) | `bash "<skill-dir>/scripts/gen-text-fallback.sh" "<prompt>" "<scene_sentence>" "<reason>"` |

Each generator prints the final image path on success (extension already corrected
to the sniffed bytes).

## Step 2 — Fan-out (the default) vs pin

- **Pinned** (a provider keyword): run that one provider; on failure fall through
  `image_gen → openai/openai-sub → gemini → text` (the legacy waterfall, single best).
- **Bare** (no keyword): run every available **distinct-model** provider in
  parallel → a variant set. **Exclude `openai-sub` from the bare fan-out** — it is
  the *same model* (gpt-image-2) as `openai` on a different billing path, so
  including both double-renders and double-bills. `openai-sub` is explicit-keyword
  only. If no provider yields an image, emit the text fallback once.

## Step 3 — Embed

Embed each generated image as a data-URI fragment (MIME sniffed from the bytes):
`node "<skill-dir>/scripts/embed-img.mjs" <imagePath> <fragmentPath> <label> "<caption>"`
→ `<stem>.<label>.html.fragment`. A fan-out set renders as a comparison strip (one
figure per provider). The caller (`/wf design`) decides where the fragment lives
next to its design artifact.

## Output Format — must stay `IMAGEGEN_RESULT` (contract, A2)

The visual-contract step (`plan`, following `design/contract.md`) and standalone
design transforms branch on `method=text-only` and consume `scene_sentence`, and the
caller sets `image_gate` from this block. So keep the block name and fields exactly —
`method` carries the provider id:

**On image success (one block per image; a fan-out emits several):**

```
IMAGEGEN_RESULT:
  method: <image_gen|openai|gemini|openai-sub>
  file: <path to the generated image>
  prompt: <exact prompt used>
  scene_sentence: <one evocative sentence describing the visual>
```

**On text-only fallback or skip:**

```
IMAGEGEN_RESULT:
  method: <text-only|skipped>
  file: none
  skip_reason: <why generation was unavailable or skipped>
  prompt: <exact prompt that would have been used>
  scene_sentence: <one evocative sentence describing the visual>
  to_generate_later: |
    GEMINI_API_KEY=<key> node "<skill-dir>/scripts/gen-gemini.mjs" "<prompt>" .ai/design-probes/probe 2K
```

The caller records the result(s) and sets `image_gate=pass` (image success) or
`image_gate=skipped:<reason>` (text-only).

## Cost note

A bare fan-out generates **one image per available distinct model** — N images,
N charges, on every call. The built-in `image_gen` is free; `openai`/`gemini`/
`openai-sub` bill per-token to your key. To get a single image, pin a provider:
`/imagery gemini <prompt>`. (Tell me to flip the default to single-best if preferred.)
