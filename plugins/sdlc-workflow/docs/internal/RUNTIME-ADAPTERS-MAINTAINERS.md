# Runtime adapters: notes for maintainers

The agent reads `skills/wf/reference/runtime-adapters.md` (the registry) and the adapter files under `skills/wf/reference/runtime-adapters/`. This page holds the text that only a maintainer needs.

## The shape of an adapter file

Each adapter lives in its own file, `runtime-adapters/<key>.md`, with these sections:

| Section | Purpose |
|---|---|
| **Bootstrap** | Ordered steps that bring the running artifact up. Each step runs on its own. When a step fails after its resolution attempt, the caller writes an `awaiting-environment` slice (probe) or `result: blocked-runtime-evidence-missing` (verify), with the failed step and the remediation hint. |
| **Enumerate** | The recipe rung of the surface enumeration ladder (`_protocols.md`): how to inventory the surface of this platform before driving. |
| **Drive** | How to perform user actions against the running artifact. |
| **Observe** | How to capture observable output: screenshots, page snapshots, stdout, HTTP responses, log scrapes. |
| **Perturb** | The perturbations of this platform only. The shared rules are in the perturbation protocol of `_protocols.md`. |
| **Tear down** | How to leave the environment clean after the run. |
| **Evidence layout** | Where the caller writes the captured evidence files. |
| **Remediation hints** | One-line hints, matched to a bootstrap step, for a `bootstrap-failure`. |
| **Skill catalog hints** (optional) | Session skills and MCP servers that complement this adapter (for example `lazylogcat` for Android logcat). They are candidates that the person can choose, never required drivers. |

Detection lives only in the Adapters table of the registry. An adapter file has no "Detection signals" section.

## Adding a new adapter

1. Create `runtime-adapters/<key>.md` with the sections above.
2. Add its row, with its detection signals, to the Adapters table of `runtime-adapters.md`. `verify.md` and `probe.md` need no change: both read the registry and load adapters by key.
3. When the platform has a headless boot, add its row to the headless table of `runtime-adapters/_ladder.md`, with the real wall of the platform.
4. Submit it as one change, so reviewers can audit the recipe on its own.

## Why adapters are recipes

Adapters are recipes, not code. They are markdown sections that the agent reads and executes. This matches the rest of the workflow, and it adds no code-execution path that the plugin does not already have.
