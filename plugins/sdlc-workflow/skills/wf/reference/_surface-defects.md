# Surface defect taxonomy (shared)

Platform-generic defect classes for **runtime observation** of a user-facing surface, plus the decidability boundary that says when observing is a valid way to know at all. Read by `/wf probe` (target mode and `sweep` mode), by `/wf verify`'s runtime sub-agent, and cited by the `reliability`, `correctness`, `ux-copy`, and `ste-compliance` review dimensions. Adapters supply *how to reach* a surface (`runtime-adapters.md`); this file supplies *what to ask once you are looking at it*.

The questions are **surface-shaped, not app-shaped**: "is there a control whose handler does nothing?" needs no domain knowledge, which is why the same rubric works on an Android screen, a web page, a CLI command, and an HTTP route. Anything that needs domain knowledge comes from the workflow's `charter:` constraints instead, not from here.

## The classes

Each class carries a detection question and a severity anchor. Record the class id on every finding it produces. The detection notes and per-platform manifestations of every class are in [probe/_surface-defect-classes.md](probe/_surface-defect-classes.md); read that file before driving a surface.

| Class | Detection question | Severity anchor |
|---|---|---|
| `dead-affordance` | Is there an interactive control whose handler does nothing? | `medium` on a shipped screen; `high` if it advertises a capability the product lacks or a constraint forbids |
| `error-surface-leak` | Is any upstream or internal error rendered as user-facing content? | `high` when internal detail (paths, hostnames, stack frames, credentials) is disclosed; `medium` when merely unhandled |
| `ambiguous-copy` | Can a reader act wrongly on the visible text (one concept under two names, a reference with two referents, an instruction readable two ways)? | `medium`; `high` on a destructive or irreversible control, or when a charter constraint names the wording |
| `terminal-wait` | Can this loading state be entered and never left? | `medium`; `high` when the state has no escape affordance |
| `fabricated-value` | Is any displayed statistic derived from a constant, a placeholder, or an assumption rather than from data? | `medium`; `high` as a headline figure or when a charter constraint asserts real data |
| `dependency-collapse` | Does one unavailable source take down surface that does not depend on it? | `high`; the blast radius is the defect, independent of why the dependency failed |
| `branch-gap` | Is a guarantee present only in the happy branch? | `high` when a charter constraint, a safety/ToS property, or a security control asserts it; else `medium` |
| `boundary-overflow` | Does layout or output exceed the real target dimension? | `low`; `medium` when it makes a control unreachable or truncates meaning |
| `env-interference` | Could ambient state, not the artifact, have produced what I just saw? | Not a product finding by default; it explains a withdrawn or downgraded finding |

The `ambiguous-copy` check method is the word-discipline section (section 1) of [_ste-procedural.md](_ste-procedural.md); cite the W-rule on every such finding. It is the runtime counterpart of the `ste-compliance` review dimension, which audits text at rest.

## Severity discipline

- A class that produced **no** finding gets **one line** in the coverage table, never a paragraph of reassurance.
- The anchors above are normative. Do not inflate an `incidental` (log spam, cosmetic warning) to pad a run, and do not deflate a charter violation.
- A run reporting more than ~15 findings **leads with the top five** and says so. A ranked short list is more actionable than an exhaustive flat one.
- A finding names what was observed, not what was inferred. Source reading supports a finding; it does not substitute for observing the surface.

## Growth rule

A class earns a row here only when a **real run produced it**. No speculative additions: a taxonomy that grows by imagination becomes a checklist, and a checklist is what the severity discipline above exists to prevent.

## Decidability boundary (read BEFORE driving)

The binding constraint on a runtime sweep is not which platforms have adapters. It is: **there must be a drivable surface whose correctness is decidable by observation, within a session.** No amount of adapter-writing relaxes it; a statistical application on the fully supported `web` adapter is *less* coverable than a CLI on a hand-written recipe. Two independent axes, kept as separate artifact blocks because they have different cures:

- **Can it be driven?** → bootstrap, `bootstrap-failure`. A missing adapter or a missing `Enumerate` recipe is a *tooling* gap: it costs coverage confidence.
- **Is watching it a valid way to know?** → this section, `decidability`. A continuous or statistical surface is a *method* gap: it invalidates the answer.

Conflating them yields either needless refusals or false confidence.

### Standing not-observable set

Declare these before driving whenever they apply to the artifact under test. Each routes somewhere; the sweep **names the neighbouring surface, it does not annex it**.

| Not observable by a session-length drive | Why | Route to |
|---|---|---|
| Statistical / generative correctness (ranking, recommenders, ML, LLM apps) | Output is observable; *rightness* is not decidable by looking | `review` dimensions; the project's eval harness |
| Long-horizon behavior (cron, batch, retention, billing, eventual consistency, backup/restore) | A sweep is session-length; these fail over hours to months | `/wf observability`: instrument for these, do not drive them |
| Concurrency and load (lost updates, deadlocks, stampedes) | One actor, one path | `review/correctness.md` (backend-concurrency), `review/performance.md` (scalability) |
| Absence properties ("there is no injection here") | Not observable from a happy path plus one perturbation | `review/security.md`, or a dedicated security-review skill when the host provides one |
| Library / SDK / compiler / runtime correctness | No user surface; the surface is an API and its consumers are code | `review/api-contracts.md`, the project's own suite |
| Embedded / real-time / continuous surfaces (firmware, robotics, games, frame timing, input latency) | Screenshot-and-compare is the wrong instrument for a continuous surface | out of scope; say so plainly |
| Perceptual accessibility and design judgment | Genuinely perceptual | the constraint-resolution ladder's residual rung |
| Anything needing credentials or state the run may not hold | A correct permanent boundary, not a gap | `out-of-authority` in the coverage table |

### Refuse rather than under-report

When the artifact's **primary** correctness class is in the set above, say so **first**, at the top of the artifact and in the chat return, before any finding. Still report what the wrapper shows (a generative app can absolutely have a `dead-affordance` and a `terminal-wait`); do not let that read as a verdict on the thing the wrapper wraps. This is the same move `status: awaiting-environment` already makes for a room the run cannot enter, pointed at a question the method cannot answer.
