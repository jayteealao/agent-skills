# Profile — artifact template and sibling YAML (`augment/profile.md` Step 4 and the Sibling YAML step)

Load this file from `profile.md` when you write `01-profile.md` and its sibling `01-profile.yaml`.

## `01-profile.md` (Step 4)

**`01-profile.md` frontmatter:**
```yaml
---
schema: sdlc/v1
type: profile
run-id: <run-id>
target: <description of what was profiled>
language: <detected>
profiling-method: static | dynamic-cpu | dynamic-memory | hybrid | fallback-timing
hotspots-found: <N>
optimization-candidates: <N>
confidence: <high|medium|low>
created-at: <real UTC timestamp per _timestamp.md>
next-command: wf-intake
next-invocation: "/wf intake investigate <domain>"
recommended-routes:            # from profile.md Step 4's table
  - invocation: "/wf intake investigate <domain>"
    reason: "<one phrase>"
    default: true
---
```

**Body — use this exact structure** (downstream commands depend on it):

```
## Profile analysis: <area>

### Profiling method
static | dynamic-cpu | dynamic-memory | hybrid | fallback-timing

### Language & toolchain
<language> — profiling via <tools used or "static only">

### Hotspot functions
| Rank | Function | File:line | Estimated cost | Evidence |
|------|----------|-----------|----------------|---------|
| 1 | <name> | <path:line> | high | <static pattern or dynamic % self-time> |
| 2 | ... | ... | medium | ... |

### Allocation hotspots
| Location | File:line | Pattern | Severity |
|----------|-----------|---------|---------|
| <name> | <path:line> | <e.g., "string concat in loop"> | high/medium/low |

### Critical path
<entry point> → <step 1 (~Xms or "unknown")> → <step 2> → <leaf>

### Optimization candidates
| Candidate | Approach | Estimated improvement | Confidence |
|-----------|----------|----------------------|-----------|
| <area> | <1-line approach> | <e.g., "30-50% latency reduction"> | high/medium/low |

### Confidence
<high|medium|low> — <one sentence justifying: dynamic data / static inference only / limited scope>

### Limitations
<list what was NOT profiled: async I/O timing, DB query plans, network latency, GC pressure, etc.>
```

## Step — Sibling YAML `profile`

After writing `.ai/profiles/<run-id>/01-profile.md`, write
`.ai/profiles/<run-id>/01-profile.yaml` next to it with `artifact: profile`.
The view-layer renderer projects this YAML as a hotspots-table page at
`/sdlc/profiles/<run-id>/` — optional before/after comparison figure (when
`comparisons:` is populated), optimization candidates list with confidence
chips. Without this YAML the page falls back to a plain frontmatter card.

Do not write the typed `01-profile.html.fragment`: the renderer generates it from the `.yaml`, per [_fragment-authoring.md](../../_fragment-authoring.md) Step F1.

(If no hotspots were found you do not write the `profile` sibling YAML; the
simple-renderer fallback is correct.)

Shape:

```yaml
# 01-profile.yaml
artifact:        profile
run_id:          "20260520T1430Z"
target:          "POST /api/checkout"
language:        "typescript"
method:          dynamic-cpu       # static | dynamic-cpu | dynamic-memory | hybrid | fallback-timing
confidence:      high              # high | medium | low
measured_at:     "2026-05-20T14:30:00Z"
baseline_commit: "a3f7d12"
hotspots:
  - id:        H1
    function:  "validateCart"
    file:      "src/cart/validate.ts"
    line:      24
    cost_pct:  32.4
    candidate: true
  - id:        H2
    function:  "computeTaxes"
    cost_pct:  11.0
optimization_candidates:
  - id:                 OC1
    hotspot:            H1
    intent:             "Memoize per-request validators by cart-shape hash."
    estimated_gain_pct: 18.0
    confidence:         high
comparisons:                       # optional — omit when no after-data exists
  - metric:    "p50_ms"
    before:    124
    after:     92
    unit:      ms
    direction: lower-is-better
  - metric:    "rps"
    before:    310
    after:     420
    unit:      req/s
    direction: higher-is-better
```

Authoring rules:
- `hotspots[]` must include at least one entry. If none were found, do
  NOT write a `profile` sibling YAML — the artifact is informational
  text only, the simple-renderer fallback is appropriate.
- `comparisons[]` is optional. Include it only when a meaningful
  before/after measurement exists (re-run after a candidate landed, or
  baseline-vs-current on the same workload). Each metric needs the
  `direction:` enum so the renderer can color "improved" vs "regressed".
- `optimization_candidates[]` is optional but recommended — each
  candidate should reference a `hotspot:` id so the renderer can draw
  the visual connection.
