---
name: imagegen
description: Generate a visual image from a text prompt using the best available image generation method. Capability waterfall: built-in image_gen tool (Codex/Claude Code native) → gpt-image-2 via codex exec (ChatGPT subscription) → nano-banana-pro via Gemini API (GEMINI_API_KEY) → text-only scene sentence fallback. Returns image file path and method used. Used internally by wf-design shape and craft sub-commands for north-star visual probes.
version: 1.0.0
user-invocable: false
argument-hint: "<prompt> [--output path] [--resolution 1K|2K|4K] [--count 1-4] [--skip-reason text]"
---

Generate an image from a natural language prompt using the best available method.

## Usage

Called internally by the `wf-design` command. Resolves the best available image generation
method at runtime and produces a visual artifact, or returns a structured text fallback.

Arguments parsed from `$ARGUMENTS`:
- First positional: image prompt (required, or use `--skip-reason`)
- `--output <path>` — file path (default: `.ai/design-probes/<timestamp>.jpg`)
- `--resolution <1K|2K|4K>` — image resolution (default: 1K)
- `--count <1-4>` — number of images to generate (default: 1)
- `--skip-reason <text>` — if provided, skip generation and return this as the skip reason

## Step 0 — Parse and validate

1. Parse `$ARGUMENTS` for the prompt and all flags.
2. If `--skip-reason` is provided → skip all generation, go to Method 4 output format with `method=skipped`.
3. Set output path: if `--output` not provided, use `.ai/design-probes/<unix-timestamp>-<count>.jpg`.
4. Create `.ai/design-probes/` directory if it does not exist.

## Step 1 — Capability waterfall

Try each method in order. Stop at the first success.

### Method 1: Built-in `image_gen` tool

If the `image_gen` tool appears in the available tools list for this session:

1. Call `image_gen` with the prompt.
2. Save the returned image data to the output path.
3. If successful → return `IMAGEGEN_RESULT` with `method=image_gen`.
4. If the tool errors or returns no image → fall through to Method 2.

This is the preferred path. It requires no API key, no subprocess, and no external dependency.

### Method 2: gpt-image-2 via `codex exec`

Requires: `codex` CLI available in PATH.

```bash
bash "$(dirname "$0")/scripts/gen-gpt-image-2.sh" "$PROMPT" "$OUTPUT_PATH"
```

- Exit code 0 = success → return `IMAGEGEN_RESULT` with `method=gpt-image-2`.
- Exit code 1 = codex not found → fall through to Method 3.
- Any other exit code → fall through to Method 3.

### Method 3: nano-banana-pro via Gemini API

Requires: `GEMINI_API_KEY` environment variable.

```bash
python3 "$(dirname "$0")/scripts/gen-nano-banana-pro.py" "$PROMPT" --output "$OUTPUT_PATH" --resolution "$RESOLUTION"
```

- Exit code 0 = success → return `IMAGEGEN_RESULT` with `method=nano-banana-pro`.
- Exit code 1 = GEMINI_API_KEY not set → fall through to Method 4.
- Any other exit code → fall through to Method 4.

Note: nano-banana-pro returns JPEG bytes regardless of extension requested. The script
handles this automatically by adjusting the extension.

### Method 4: Text-only fallback

When no image generation method is available, return a structured scene description.
This is always available. It lets design work proceed and records the prompt for later generation.

## Output Format

**On image success:**

```
IMAGEGEN_RESULT:
  method: <image_gen|gpt-image-2|nano-banana-pro>
  file: <path to generated image>
  prompt: <exact prompt used>
  scene_sentence: <one evocative sentence describing the visual>
```

**On text-only fallback or skip:**

```
IMAGEGEN_RESULT:
  method: <text-only|skipped>
  file: none
  skip_reason: <why image generation was unavailable or skipped>
  prompt: <exact prompt that would have been used>
  scene_sentence: <one evocative sentence describing the visual>
  to_generate_later: |
    GEMINI_API_KEY=<key> python3 .claude/skills/imagegen/scripts/gen-nano-banana-pro.py "<prompt>"
```

The caller (`wf-design shape` or `wf-design craft`) records the result in the design artifact
and sets `image_gate=pass` (for image success) or `image_gate=skipped:<reason>` (for text-only).

## Multiple images (`--count > 1`)

When `--count` is 2, 3, or 4, run the selected method once per count with the same prompt.
Number the output files: `<path>-1.jpg`, `<path>-2.jpg`, etc.
Return one `IMAGEGEN_RESULT` block per image.
