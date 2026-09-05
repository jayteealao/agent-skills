# Shared protocols (`runtime-adapters/_protocols.md`)

Load this file with the registry, [../runtime-adapters.md](../runtime-adapters.md), for every adapter run. It holds the surface enumeration ladder, the perturbation protocol, the evidence protocol, and the accessibility checks.

## Surface enumeration ladder (climb before driving)

A sweep's coverage claim needs a **denominator**: what surface exists, not only
what was reached. A per-adapter `Enumerate` recipe is the top rung, not the only
one — an adapter with no recipe is **NOT unsupported**. Climb down and RECORD
the rung reached, exactly as the constraint-resolution ladder does for
environment walls. Silent degradation is the failure to prevent: an unqualified
`enumerated: 5` from a run that merely reached five things is a claim the method
cannot support.

| Rung | `enumeration-method` | Method | Denominator quality |
|---|---|---|---|
| 1 | `recipe` | The adapter's `Enumerate` section | Authoritative — from a declared source |
| 2 | `static` | Read the app's navigation/route model in source with no recipe | Authoritative if the model is centralized; misses dynamic destinations |
| 3 | `traversal` | Bounded breadth-first drive from the entry point, recording distinct states | **A FLOOR, not a total** — cannot know what it never found a door to |
| 4 | `named` | The caller supplies the surface list | As good as the list |

Rungs 2-3 need no per-platform authoring, so **every adapter in this registry
can be swept from day one** at a declared, lower-confidence denominator. A
`traversal` run states that its count is a floor **wherever the count is
rendered** — in the artifact and in the chat return, not only one of them.

Two independent axes, kept separate because they have different cures: *can the
surface be driven* (bootstrap, `bootstrap-failure`) versus *is its correctness
decidable by watching* (`_surface-defects.md` → Decidability boundary). A
missing `Enumerate` recipe is a tooling gap that degrades a number; a continuous
real-time surface is a method gap that invalidates the answer.

## Perturbation protocol (shared across all adapters)

Some defect classes cannot be found by driving a healthy system —
`dependency-collapse` and `branch-gap` in particular. Perturbation induces the
failure branch instead of waiting for it. It is the runtime generalization of
the direction rule for prove-fail-closed criteria: a green happy path does not
exercise a guard.

Bounded by **authority, not effort** — the same boundary as the env-remediation
rung in [_ladder.md](_ladder.md), which this cites rather than restates:

- **One dependency at a time.** Two simultaneous faults produce an unattributable
  observation.
- **Always reversible, always restored** before teardown. Record the
  perturbation AND the restore in evidence.
- **Never state the run does not own.** Do not stop a process the run did not
  start, mutate host configuration, or edit product code to induce a fault.
- **Never against a shared or production backend without explicit
  authorization.** Inducing a failure is a different act from observing one.
  Absent authorization, perturb only harness-owned dependencies and record what
  was skipped.

## Evidence protocol (shared across all adapters)

1. For each criterion or probe target, produce: a screenshot or output capture, a pass/fail determination, and a brief explanation of what was observed.
2. If a screenshot or capture shows unexpected behavior, describe exactly what is wrong.
3. Store evidence files in:
   - `verify`: `.ai/workflows/<slug>/verify-evidence/<slice-slug>/`
   - `probe`: `.ai/workflows/<slug>/probe-evidence/<descriptor>/`
4. Reference evidence files in the calling artifact's report.

## Accessibility checks (shared across all UI adapters)

- If an accessibility linter exists, run it on affected components.
- Check that new/modified interactive elements have appropriate ARIA attributes, labels, keyboard handling.
- Verify color contrast, focus indicators, and screen reader compatibility if tools are available.
