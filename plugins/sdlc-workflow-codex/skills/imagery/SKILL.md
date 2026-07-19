---
name: imagery
description: Generate images from a text prompt. Fans out to all available providers by default (built-in image_gen, gpt-image-2, nano-banana) → a variant set; a provider keyword yields one. Supersedes the imagegen skill. Internal to `$wf design`; not user-invocable.
argument-hint: "[image_gen|openai|gemini|openai-sub] <prompt> [skip <reason>]"
---

Generate an image (or a fan-out variant set) from a prompt, then embed it.
Supersedes the former `imagegen` skill (direct API calls + fan-out). **Keeps the
`IMAGEGEN_RESULT` output contract** so the `$wf design` image gate is unchanged.
Let `<skill-dir>` be the directory this SKILL.md loads from.

## Step 0 — Resolve (positional, no flags)

1. **Provider.** First token `image_gen` / `openai` / `gemini` / `openai-sub` pins
   it; otherwise the whole argument is the prompt → **fan out**. Trailing
   `skip <reason>` → text fallback (`method=skipped`).
2. **Output path.** Default `.ai/design-probes/<unix-ts>[-<provider>].<ext>`; the
   generators set `<ext>` from the actual bytes (PNG for gpt-image-2, JPEG for
   Gemini — A3) and print the real path. Create `.ai/design-probes/` if needed.
3. **Tier (no flag).** Infer from the prompt or invoking context: a
   north-star / hi-res / 2K cue → **2K**, else **1K**. Pass it as the generator's
   positional `<1K|2K>` (it never enters the image prompt).
4. **Consent for egress.** `openai` / `gemini` / `openai-sub` send the prompt to a
   third party → require `externalDispatch.enabled` in `~/.sdlc/hub-config.json`.
   Built-in `image_gen` and the text fallback never egress and are always available;
   if consent is off, use only those.

## Step 1 — Methods

- **`image_gen`** — built-in tool, no egress/key: call it, save the bytes.
- **`openai`** — `node <skill-dir>/scripts/gen-openai.mjs "<prompt>" <outBase> <1K|2K>` (exit 1 = `OPENAI_API_KEY` unset).
- **`gemini`** — `node <skill-dir>/scripts/gen-gemini.mjs "<prompt>" <outBase> <1K|2K>` (exit 1 = no key or `@google/genai` missing).
- **`openai-sub`** — `bash <skill-dir>/scripts/gen-openai-codex.sh "<prompt>" <outPath>` (gpt-image-2 via codex subscription).
- **text fallback** — `bash <skill-dir>/scripts/gen-text-fallback.sh "<prompt>" "<scene_sentence>" "<reason>"`.

## Step 2 — Fan-out vs pin

- **Pinned**: run that provider; on failure fall through `image_gen → openai/openai-sub → gemini → text`.
- **Bare**: run every available **distinct-model** provider in parallel. **Exclude
  `openai-sub`** (same model as `openai`, different billing → double-render). None
  succeed → text fallback once.

## Step 3 — Embed

`node <skill-dir>/scripts/embed-img.mjs <imagePath> <fragmentPath> <label> "<caption>"`
→ a data-URI `<stem>.<label>.html.fragment` (MIME sniffed). A fan-out renders as a
comparison strip.

## Output — MUST stay `IMAGEGEN_RESULT` (contract)

`method` carries the provider id. On success: `method` / `file` / `prompt` /
`scene_sentence`. On text-only/skip: `method` (`text-only`|`skipped`) / `file: none`
/ `skip_reason` / `prompt` / `scene_sentence` / `to_generate_later`. The caller sets
`image_gate=pass` or `image_gate=skipped:<reason>`.

**Cost.** Bare fan-out = N images / N charges per call (built-in `image_gen` free;
the API backends bill per-token). Pin a provider (`imagery gemini …`) for one image.
