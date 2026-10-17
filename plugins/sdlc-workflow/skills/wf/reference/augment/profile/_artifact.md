# Profile — artifact template (`augment/profile.md` Step 4)

Load this file from `profile.md` when you write `01-profile.md`.

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
