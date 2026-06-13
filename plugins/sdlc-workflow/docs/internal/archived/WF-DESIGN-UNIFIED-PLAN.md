# wf-design Unified Architecture — Implementation Plan

## Goal

Collapse 14 standalone `design-*` skills and 5 `wf-design*` commands into:
- **1 command**: `commands/wf-design.md` (three invocation modes)
- **1 skill dispatcher**: `skills/design/SKILL.md`
- **26 reference docs**: `skills/design/reference/*.md`
- **1 imagegen skill**: `skills/imagegen/SKILL.md` + 3 scripts
- **4 imagegen scripts**: capability detection + 3 generators

---

## Invocation Modes

```
/wf-design <slug>                   → design stage 2b for an active workflow
/wf-design <slug> <sub-command>     → design sub-command in workflow context
/wf-design <sub-command>            → freestanding, no workflow required
```

Mode resolution order:
1. If arg 0 matches an existing `.ai/workflows/<slug>/00-index.md` AND no arg 1 → stage 2b mode
2. If arg 0 matches a slug AND arg 1 matches a sub-command → workflow-scoped design
3. If arg 0 matches a sub-command name → freestanding design
4. If arg 0 is unrecognized → STOP with usage hint

---

## Sub-command Inventory (22 total)

### Planning
| Sub-command | Source | SDLC stage |
|-------------|--------|------------|
| `shape` | impeccable/reference/shape.md | Produces 2b-design.md (replaces current wf-design bare) |
| `craft` | impeccable/reference/craft.md | Design-then-implement, wraps wf-implement intent |

### Analysis
| Sub-command | Source | SDLC stage |
|-------------|--------|------------|
| `audit` | wf-design-audit.md + impeccable/reference/audit.md | Read-only heuristic review |
| `critique` | wf-design-critique.md + impeccable/reference/critique.md | Prescriptive actionable feedback |
| `extract` | wf-design-extract.md + impeccable/reference/extract.md | Pull tokens/system from existing UI |

### Aesthetics
| Sub-command | Source | Notes |
|-------------|--------|-------|
| `animate` | design-animate/SKILL.md + impeccable/reference/animate.md | Fix outdated animation stance |
| `bolder` | design-bolder/SKILL.md + impeccable/reference/bolder.md | |
| `colorize` | design-colorize/SKILL.md + impeccable/reference/colorize.md | FIX: remove side-stripe border recommendation |
| `delight` | design-delight/SKILL.md + impeccable/reference/delight.md | |
| `layout` | design-layout/SKILL.md + impeccable/reference/layout.md | |
| `overdrive` | design-overdrive/SKILL.md + impeccable/reference/overdrive.md | |
| `quieter` | design-quieter/SKILL.md + impeccable/reference/quieter.md | |
| `typeset` | design-typeset/SKILL.md + impeccable/reference/typeset.md | |

### Clarity
| Sub-command | Source | Notes |
|-------------|--------|-------|
| `adapt` | design-adapt/SKILL.md + impeccable/reference/adapt.md | |
| `clarify` | design-clarify/SKILL.md + impeccable/reference/clarify.md | |
| `distill` | design-distill/SKILL.md + impeccable/reference/distill.md | |

### Quality
| Sub-command | Source | Notes |
|-------------|--------|-------|
| `harden` | design-harden/SKILL.md + impeccable/reference/harden.md | |
| `onboard` | impeccable/reference/onboard.md | New — empty state, first-run flows |
| `optimize` | design-optimize/SKILL.md + impeccable/reference/optimize.md | Fix outdated animation stance |
| `polish` | design-polish/SKILL.md + impeccable/reference/polish.md | Fix outdated animation stance |

### Setup / Knowledge
| Sub-command | Source | Notes |
|-------------|--------|-------|
| `setup` | wf-design-setup.md | Context gathering (PRODUCT.md + DESIGN.md) |
| `teach` | impeccable/reference/teach.md | PRODUCT.md authoring assistant |

---

## Preflight Protocol (mandatory for all sub-commands)

Every `wf-design` invocation runs this gate sequence before any design or code work:

```
WF_DESIGN_PREFLIGHT:
  context=pass|missing          ← PRODUCT.md loaded (≥200 chars, no [TODO])
  register=brand|product        ← determined from task cue > surface > PRODUCT.md
  codebase=pass|skipped         ← codebase inspection sub-agents ran
  image_gate=pass|skipped:<reason>
  mutation=open|blocked
```

**context=missing** → stop, run `setup` sub-command, then resume.
**mutation** only opens when all gates above pass.

---

## Codebase Inspection Sub-Agents

Run in parallel before any design sub-command that edits files. Skipped for: `audit`, `critique`, `extract`, `setup`, `teach`.

### Agent 1: Token Scanner
Finds design tokens in the codebase.
- CSS custom properties (`--color-*`, `--spacing-*`, `--font-*`, `--radius-*`)
- `tailwind.config.*` — `theme.extend` colors, spacing, fonts
- `tokens.json`, `design-tokens.json`, Style Dictionary source files
- Returns: extracted token table (name, value, usage count)

### Agent 2: Framework + Component Detector
Identifies the UI framework and component patterns.
- Detect: React/Vue/Svelte/Angular/Lit/plain HTML from `package.json` + entry files
- Component library: shadcn/ui, Radix, Headless UI, MUI, Mantine, Ant Design, Chakra
- Tailwind: version, JIT, class grouping conventions
- Returns: framework, component-lib, css-approach, tailwind-version, sample-component-path

### Agent 3: Context Loader
Reads product context files.
- PRODUCT.md (project root, then `.agents/context/`, then `docs/`)
- DESIGN.md (same search order)
- `.impeccable.md` (legacy format — extract Design Context section if present)
- Returns: brand-personality, users, aesthetic-direction, register, design-principles

### Agent 4: Surface Ranger
Identifies the specific files and routes relevant to the task.
- If slug given: read `02-shape.md` for `files-in-scope`
- Otherwise: find active page/component files from task description (Glob + Grep)
- Returns: in-scope files list, primary component, related CSS file

**Sub-agent output is summarized** into a `## Codebase Context` block at the top of the design brief. Never re-run agents if their output is already in session history.

---

## Image Generation Skill (`skills/imagegen/SKILL.md`)

### Capability Waterfall

Try in order, stop at first success:

```
1. built-in image_gen tool          ← preferred (free in Codex env, no API key)
2. gpt-image-2 via codex exec       ← ChatGPT subscription required
3. nano-banana-pro via Gemini API   ← GEMINI_API_KEY required
4. text-only scene sentence         ← always available, always falls back here
```

### Capability Detection (`scripts/detect-capability.sh`)

```bash
#!/usr/bin/env bash
# Probe available image generation methods
# Outputs: IMAGEGEN_METHOD=image_gen|gpt-image-2|nano-banana-pro|text-only

# 1. Built-in tool available in Codex — check for image_gen in tool list (env hint)
if [ -n "$CODEX_SANDBOX" ] || [ -n "$CLAUDE_CODE_ENTRYPOINT" ]; then
  # The image_gen tool is available in Claude Code / Codex runtime
  # The skill itself will attempt the tool call; no shell probe possible
  echo "IMAGEGEN_METHOD=image_gen"
  exit 0
fi

# 2. codex CLI available for gpt-image-2
if command -v codex &>/dev/null; then
  echo "IMAGEGEN_METHOD=gpt-image-2"
  exit 0
fi

# 3. Gemini API key available for nano-banana-pro
if [ -n "$GEMINI_API_KEY" ]; then
  echo "IMAGEGEN_METHOD=nano-banana-pro"
  exit 0
fi

echo "IMAGEGEN_METHOD=text-only"
```

### Script 1: `scripts/gen-gpt-image-2.sh`

Adapted from agentspace-so/gpt-image-2. Key details:
- Uses `codex exec --enable image_generation --sandbox read-only`
- CRITICAL: `--enable image_generation` flag required
- CRITICAL: do NOT use `--ephemeral` (prevents image extraction)
- Snapshots `~/.codex/sessions/` before run, diffs after
- Extracts base64 image payload from JSONL rollout
- Exit codes: 0=success, 1=no codex, 2=image_gen disabled, 3=no image in output, 4=write fail

```bash
#!/usr/bin/env bash
set -euo pipefail

PROMPT="${1:-}"
OUTPUT="${2:-output.png}"

if [ -z "$PROMPT" ]; then
  echo "Usage: gen-gpt-image-2.sh <prompt> [output.png]" >&2
  exit 1
fi

if ! command -v codex &>/dev/null; then
  echo "ERROR: codex CLI not found" >&2
  exit 1
fi

# Snapshot sessions before run
SESSIONS_DIR="$HOME/.codex/sessions"
mkdir -p "$SESSIONS_DIR"
BEFORE=$(ls "$SESSIONS_DIR" 2>/dev/null | sort)

# Run codex with image generation enabled
codex exec \
  --enable image_generation \
  --sandbox read-only \
  -- "Generate an image: $PROMPT. Save as output.png in the current directory." 2>/dev/null || true

# Diff sessions to find new session
AFTER=$(ls "$SESSIONS_DIR" 2>/dev/null | sort)
NEW_SESSION=$(comm -13 <(echo "$BEFORE") <(echo "$AFTER") | head -1)

if [ -z "$NEW_SESSION" ]; then
  echo "ERROR: No new codex session found — image generation may have failed" >&2
  exit 3
fi

# Extract base64 image from JSONL rollout
ROLLOUT="$SESSIONS_DIR/$NEW_SESSION/rollout.jsonl"
if [ ! -f "$ROLLOUT" ]; then
  echo "ERROR: Rollout file not found at $ROLLOUT" >&2
  exit 3
fi

# Parse image payload from rollout
python3 - <<EOF
import json, base64, sys

rollout = open("$ROLLOUT").readlines()
for line in reversed(rollout):
    try:
        event = json.loads(line)
        # Look for image content in tool output or message
        content = str(event)
        if 'image' in content.lower() and 'base64' in content.lower():
            # Navigate nested structure to find base64 data
            def find_b64(obj, depth=0):
                if depth > 10: return None
                if isinstance(obj, str) and len(obj) > 100:
                    try:
                        base64.b64decode(obj)
                        return obj
                    except: pass
                if isinstance(obj, dict):
                    for v in obj.values():
                        r = find_b64(v, depth+1)
                        if r: return r
                if isinstance(obj, list):
                    for v in obj:
                        r = find_b64(v, depth+1)
                        if r: return r
                return None
            b64 = find_b64(event)
            if b64:
                with open("$OUTPUT", "wb") as f:
                    f.write(base64.b64decode(b64))
                print(f"Image saved to $OUTPUT")
                sys.exit(0)
    except: pass
print("ERROR: No image data found in rollout", file=sys.stderr)
sys.exit(3)
EOF
```

### Script 2: `scripts/gen-nano-banana-pro.py`

Adapted from intellectronica/nano-banana-pro + ce-gemini-imagegen. Key details:
- Model: `gemini-3-pro-image-preview` (nano-banana-pro)
- CRITICAL: Gemini returns JPEG bytes, not PNG — save as `.jpg` or explicitly convert
- Supports `GEMINI_API_KEY` env var
- Resolutions: 1K (1024×1024), 2K (2048×2048), 4K (4096×4096)

```python
#!/usr/bin/env python3
"""nano-banana-pro: Gemini image generation via google-genai SDK."""
import argparse, base64, os, sys
from pathlib import Path

def generate(prompt: str, output: str, resolution: str = "1K") -> None:
    try:
        from google import genai
        from google.genai import types
    except ImportError:
        print("Installing google-genai...", file=sys.stderr)
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", "google-genai", "-q"])
        from google import genai
        from google.genai import types

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("ERROR: GEMINI_API_KEY not set", file=sys.stderr)
        sys.exit(1)

    res_map = {"1K": (1024, 1024), "2K": (2048, 2048), "4K": (4096, 4096)}
    width, height = res_map.get(resolution, (1024, 1024))

    client = genai.Client(api_key=api_key)
    response = client.models.generate_images(
        model="gemini-3-pro-image-preview",
        prompt=prompt,
        config=types.GenerateImagesConfig(
            number_of_images=1,
            output_mime_type="image/jpeg",
            aspect_ratio="1:1",
        ),
    )

    if not response.generated_images:
        print("ERROR: No image returned", file=sys.stderr)
        sys.exit(1)

    image_data = response.generated_images[0].image.image_bytes
    # Gemini returns JPEG — ensure output path reflects this
    out_path = Path(output)
    if out_path.suffix.lower() == ".png":
        # Silently redirect to .jpg (JPEG bytes in a .png file breaks viewers)
        out_path = out_path.with_suffix(".jpg")
        print(f"Note: Saving as {out_path} (Gemini returns JPEG, not PNG)", file=sys.stderr)

    out_path.write_bytes(image_data)
    print(f"Image saved to {out_path}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("prompt")
    parser.add_argument("--output", "-o", default="output.jpg")
    parser.add_argument("--resolution", "-r", default="1K", choices=["1K", "2K", "4K"])
    args = parser.parse_args()
    generate(args.prompt, args.output, args.resolution)
```

### Imagegen Skill SKILL.md (`skills/imagegen/SKILL.md`)

```markdown
---
name: imagegen
description: Generate a visual image from a text prompt using the best available image generation method. Capability waterfall: built-in image_gen tool (Codex/Claude Code native) → gpt-image-2 via codex exec (ChatGPT subscription) → nano-banana-pro via Gemini API (GEMINI_API_KEY) → text-only scene sentence fallback. Returns the image file path and method used.
version: 1.0.0
user-invocable: false
argument-hint: "<prompt> [--output path] [--resolution 1K|2K|4K]"
---

Generate an image from a natural language prompt using the best available method.

## Usage

Called internally by wf-design `shape` and `craft` sub-commands for north-star visual probes.
Can also be invoked by other skills (wf-investigate for visual wireframe direction, etc.).

Arguments:
- `$ARGUMENTS[0]` — image prompt (required)
- `--output` — file path (default: `.ai/design-probes/<timestamp>.jpg`)
- `--resolution` — 1K / 2K / 4K (default: 1K for probes, 2K for final mocks)
- `--count` — number of variants 1–4 (default: 1)
- `--skip-reason` — if provided, skip generation entirely and return this reason

## Capability Waterfall

### Method 1: Built-in image_gen tool (preferred)

Use the `image_gen` tool if available. This is the preferred path — no API key, no subprocess,
works natively in Claude Code and Codex environments.

```
<invoke_tool name="image_gen">
  <prompt>{{prompt}}</prompt>
</invoke_tool>
```

If the `image_gen` tool is not available (not listed in available tools), fall through to Method 2.

### Method 2: gpt-image-2 via codex exec

Requires: `codex` CLI available in PATH.

```bash
bash .claude/skills/imagegen/scripts/gen-gpt-image-2.sh "$PROMPT" "$OUTPUT"
```

Exit code 0 = success. Any other code = fall through to Method 3.

### Method 3: nano-banana-pro via Gemini API

Requires: `GEMINI_API_KEY` environment variable.

```bash
python3 .claude/skills/imagegen/scripts/gen-nano-banana-pro.py "$PROMPT" --output "$OUTPUT" --resolution "$RESOLUTION"
```

Exit code 0 = success. Any other code = fall through to Method 4.

### Method 4: Text-only fallback

When no image generation is available, return a structured scene sentence that describes
the visual intent in enough detail for a human designer or a future image generation call.

Format:
```
IMAGE_GATE_SKIPPED: method=none
Scene sentence: <one evocative sentence describing the target visual>
Prompt template: <the exact prompt that would have been used>
To generate later: GEMINI_API_KEY=<key> python3 .claude/skills/imagegen/scripts/gen-nano-banana-pro.py "<prompt>"
```

## Output Format

On success:
```
IMAGEGEN_RESULT:
  method: <image_gen|gpt-image-2|nano-banana-pro|text-only>
  file: <path or "none">
  prompt: <prompt used>
  scene_sentence: <one sentence description>
```

The caller (wf-design shape/craft) is responsible for presenting the image to the user
and collecting direction feedback before proceeding.
```

---

## Imagegen Probes in wf-design

### In `shape` sub-command (`reference/shape.md`)

After Phase 1 (Discovery Interview) is complete and the scene sentence is confirmed:

**Image Probe Gate** (new phase, runs before brief is finalized):

```
Phase 2.5: Visual Direction Probes

1. Extract the confirmed scene sentence from the discovery interview.
2. Construct 2–3 prompt variants from the scene sentence:
   - Variant A: literal interpretation — exact scene, realistic lighting
   - Variant B: elevated interpretation — same scene, premium/editorial direction
   - Variant C: contrast direction — pick a complementary register

3. Invoke imagegen skill for each variant (--count 1 each, resolution 1K):
   - imagegen "<variant A prompt>" --output .ai/design-probes/<slug>-shape-a.jpg
   - imagegen "<variant B prompt>" --output .ai/design-probes/<slug>-shape-b.jpg
   - imagegen "<variant C prompt>" --output .ai/design-probes/<slug>-shape-c.jpg

4. Present results to user:
   > "Three visual direction probes based on your scene sentence:
   > [A] <description>  [B] <description>  [C] <description>
   > Which direction resonates, or should we blend? (You can also skip this)"

5. Record the user's choice in the design brief under `## Visual Direction`.
6. If imagegen returns method=text-only: include the scene sentence + prompt template
   in the brief's Visual Direction section, mark image_gate=skipped:no-method-available.
```

### In `craft` sub-command (`reference/craft.md`)

Before any file editing, after shape brief is confirmed:

**Final Mock Gate:**

```
Pre-implementation visual confirmation:

1. Read the confirmed shape brief's Visual Direction section.
2. If image probes were already generated and user selected one → use that as reference.
3. If no probes were generated during shape → run imagegen with the final brief's
   scene sentence at resolution 2K for a final reference mock.
4. Display the reference image or scene sentence.
5. Ask: "Does this match your expected visual direction? (yes to proceed, no to adjust)"
6. Record image_gate=pass in preflight after confirmation.
```

---

## Unified Command (`commands/wf-design.md`)

### Architecture

```
wf-design
├── Mode resolution (Step 0)
│   ├── Mode A: bare slug → shape sub-command in workflow context
│   ├── Mode B: slug + sub-command → sub-command in workflow context
│   └── Mode C: sub-command only → freestanding
│
├── Preflight gate (Step 1, all modes)
│   ├── context: load PRODUCT.md + DESIGN.md
│   ├── register: detect brand vs product
│   ├── codebase: run inspection sub-agents (4 parallel)
│   └── image_gate: will be resolved in sub-command
│
├── Sub-command dispatch (Step 2)
│   └── Load reference/<sub-command>.md and execute
│
└── Workflow integration (Step 3, modes A and B only)
    ├── Write artifact to .ai/workflows/<slug>/
    └── Update 00-index.md
```

### SDLC Artifact Mapping

When invoked with a workflow slug, sub-command outputs write to:

| Sub-command | Artifact | Stage |
|-------------|----------|-------|
| `shape` | `02b-design.md` | Stage 2b |
| `craft` | Code + `05-implement.md` note | Stage 5 augmentation |
| `audit` | `07-design-audit.md` | Stage 7 augmentation |
| `critique` | `07-design-critique.md` | Stage 7 augmentation |
| All others | `design-notes/<sub-command>.md` | Freestanding artifact |

---

## Collapsed Skill Structure

```
plugins/sdlc-workflow/skills/design/
├── SKILL.md                    ← unified dispatcher
└── reference/
    ├── shape.md                ← design discovery interview + brief + imagegen probes
    ├── craft.md                ← design-to-code with imagegen confirmation gate
    ├── audit.md                ← heuristic review (a11y lives here per impeccable)
    ├── critique.md             ← prescriptive actionable feedback
    ├── extract.md              ← pull tokens/system from existing UI
    ├── animate.md              ← UPDATED: modern motion design (no "use transitions sparingly")
    ├── bolder.md
    ├── clarify.md
    ├── colorize.md             ← FIX: remove side-stripe border recommendation
    ├── delight.md
    ├── distill.md
    ├── harden.md
    ├── layout.md
    ├── onboard.md              ← NEW from impeccable
    ├── optimize.md             ← UPDATED: remove animation avoidance language
    ├── overdrive.md
    ├── polish.md               ← UPDATED: remove animation avoidance language
    ├── quieter.md
    ├── typeset.md
    ├── adapt.md
    ├── setup.md                ← context gathering (PRODUCT.md + DESIGN.md authoring)
    ├── teach.md                ← NEW from impeccable: PRODUCT.md authoring assistant
    ├── brand.md                ← register reference: marketing/landing surfaces
    └── product.md              ← register reference: app/dashboard surfaces
```

### `skills/design/SKILL.md` Dispatcher Structure

```
---
name: design
description: [auto-trigger optimized, covers all 22 sub-commands]
version: 1.0.0
user-invocable: false
argument-hint: "[shape|craft|audit|critique|extract|animate|bolder|clarify|colorize|delight|distill|harden|layout|onboard|optimize|overdrive|polish|quieter|typeset|adapt|setup|teach] [target]"
---

## Setup (non-optional)
[preflight gate — same structure as wf-design command]

## Register
[brand vs product detection — same logic as impeccable SKILL.md]

## Shared design laws
[from impeccable SKILL.md — color, typography, spacing, layout, motion, components]

## Sub-command reference table
[router table: sub-command → load reference/<name>.md]

## Commands
[22-entry command menu]
```

---

## Fixes Required

### 1. design-colorize → `reference/colorize.md`

**Bug**: Current `design-colorize/SKILL.md` recommends:
> "Add colored left/top borders to cards or sections"

**Fix**: The impeccable source lists side-stripe borders as an absolute anti-pattern.
Remove all recommendations for colored left/top borders. Replace with:
- Colored backgrounds at low opacity on card surfaces
- Accent color in typographic elements (colored headings, callout text)
- Border colors only as full-perimeter neutral strokes, never decorative single-side stripes

### 2. Outdated animation stance → `reference/animate.md`, `reference/optimize.md`, `reference/polish.md`

**Bug**: Current skills recommend "use animations sparingly" and "prefer reduced-motion" as primary guidance. This was conservative guidance from 2022-era accessibility over-correction.

**Fix**: Replace with modern stance from impeccable:
- Purposeful motion is a design tool, not an accessibility liability
- `@media (prefers-reduced-motion: reduce)` handles the accessibility case — do not let it dictate the default design
- Animate to communicate state, guide attention, and express brand personality
- Duration: 150ms–400ms for UI transitions, 400ms–1200ms for page-level choreography

### 3. Add register sections to all sub-command references

Every reference file that produces different output for brand vs product surfaces should include a `## Register` section listing the behavioral divergence. Minimum required:

| Reference | Divergence |
|-----------|-----------|
| `typeset.md` | Brand: expressive display fonts, editorial scale. Product: functional scale, data density |
| `animate.md` | Brand: theatrical, cinematic. Product: instant-feedback, functional |
| `bolder.md` | Brand: full-drenched, visual maximalism. Product: one-accent-at-a-time |
| `colorize.md` | Brand: committed-to-drenched palette. Product: restrained with functional accent |
| `layout.md` | Brand: asymmetric, editorial. Product: grid-first, scannable |
| `delight.md` | Brand: surprise-and-delight at rest. Product: micro-interactions on action |
| `quieter.md` | Brand: reduce to essentials. Product: reduce visual noise without losing data |

---

## Deletion List

### Commands (4 files — wf-design is rewritten, not deleted)
```
plugins/sdlc-workflow/commands/wf-design-audit.md
plugins/sdlc-workflow/commands/wf-design-critique.md
plugins/sdlc-workflow/commands/wf-design-extract.md
plugins/sdlc-workflow/commands/wf-design-setup.md
```

### Skills (14 directories)
```
plugins/sdlc-workflow/skills/design-adapt/
plugins/sdlc-workflow/skills/design-animate/
plugins/sdlc-workflow/skills/design-bolder/
plugins/sdlc-workflow/skills/design-clarify/
plugins/sdlc-workflow/skills/design-colorize/
plugins/sdlc-workflow/skills/design-delight/
plugins/sdlc-workflow/skills/design-distill/
plugins/sdlc-workflow/skills/design-harden/
plugins/sdlc-workflow/skills/design-layout/
plugins/sdlc-workflow/skills/design-optimize/
plugins/sdlc-workflow/skills/design-overdrive/
plugins/sdlc-workflow/skills/design-polish/
plugins/sdlc-workflow/skills/design-quieter/
plugins/sdlc-workflow/skills/design-typeset/
```

---

## New Files to Write (30 total)

### Command (1)
- `commands/wf-design.md` — REWRITE (unified dispatcher, three modes)

### Design Skill (27)
- `skills/design/SKILL.md`
- `skills/design/reference/shape.md`
- `skills/design/reference/craft.md`
- `skills/design/reference/audit.md`
- `skills/design/reference/critique.md`
- `skills/design/reference/extract.md`
- `skills/design/reference/animate.md`
- `skills/design/reference/bolder.md`
- `skills/design/reference/clarify.md`
- `skills/design/reference/colorize.md`
- `skills/design/reference/delight.md`
- `skills/design/reference/distill.md`
- `skills/design/reference/harden.md`
- `skills/design/reference/layout.md`
- `skills/design/reference/onboard.md`
- `skills/design/reference/optimize.md`
- `skills/design/reference/overdrive.md`
- `skills/design/reference/polish.md`
- `skills/design/reference/quieter.md`
- `skills/design/reference/typeset.md`
- `skills/design/reference/adapt.md`
- `skills/design/reference/setup.md`
- `skills/design/reference/teach.md`
- `skills/design/reference/brand.md`
- `skills/design/reference/product.md`

### Imagegen Skill (5)
- `skills/imagegen/SKILL.md`
- `skills/imagegen/scripts/detect-capability.sh`
- `skills/imagegen/scripts/gen-gpt-image-2.sh`
- `skills/imagegen/scripts/gen-nano-banana-pro.py`
- `skills/imagegen/scripts/gen-text-fallback.sh` (outputs scene sentence + prompt template)

---

## Implementation Order

1. **imagegen skill** — write first (dependency of wf-design probes)
2. **design/reference/*.md** — 25 reference docs (merge impeccable source + our skills content)
3. **design/SKILL.md** — dispatcher after all references exist
4. **commands/wf-design.md** — command rewrite (depends on skill dispatcher)
5. **Delete** old skills and commands
6. **Update manifests** — `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, `.claude-plugin/marketplace.json`
   - Remove 14 design-* skill names
   - Remove 4 wf-design-* command names
   - Add imagegen skill
   - Update wf-design description to reflect unified architecture
   - Bump version to 8.27.0

---

## Version Bump

Plugin version: `8.26.0` → `8.27.0`

Changelog entry:
> v8.27: Unified wf-design architecture — 14 standalone design-* skills and 5 wf-design* commands
> collapsed into a single wf-design command (22 sub-commands) + skills/design/ dispatcher +
> 25 reference docs. New imagegen skill with capability waterfall (built-in image_gen → gpt-image-2
> → nano-banana-pro → text fallback). Imagegen probes in shape and craft sub-commands.
> Parallel codebase inspection sub-agents before design work. Register-aware brand vs product
> divergence in all relevant reference docs. Fixed: design-colorize side-stripe anti-pattern,
> outdated animation avoidance stance in animate/optimize/polish.
