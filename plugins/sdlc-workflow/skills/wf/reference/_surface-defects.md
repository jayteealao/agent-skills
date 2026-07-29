# Surface defect taxonomy (shared)

Platform-generic defect classes for **runtime observation** of a user-facing
surface, plus the decidability boundary that says when observing is a valid way
to know at all.

Read by `/wf probe` (target mode and `sweep` mode), by `/wf verify`'s runtime
sub-agent, and cited by the `reliability`, `correctness`, `ux-copy` and
`ste-compliance` review dimensions. Adapters supply *how to reach* a surface (`runtime-adapters.md`);
this file supplies *what to ask once you are looking at it*.

The questions below are **surface-shaped, not app-shaped** — "is there a control
whose handler does nothing?" needs no domain knowledge, which is why the same
rubric works on an Android screen, a web page, a CLI command and an HTTP route.
Anything that needs domain knowledge comes from the workflow's `charter:`
constraints instead, not from here.

---

## The classes

Each class carries a detection question, a severity anchor, and platform
manifestations. Record the class id on every finding it produces.

### `dead-affordance`
**Question:** is there an interactive control whose handler does nothing?
**Anchor:** `medium` on a shipped screen; `high` if it advertises a capability
the product does not have or a constraint forbids.

| Platform | Manifestation |
|---|---|
| android / ios | `onClick = {}`, a no-op `IBAction`, a disabled-looking control that is actually live |
| web | `<button>` with no listener, an `href="#"` that never routes |
| cli | a flag that parses and changes nothing; a documented subcommand that returns 0 and no-ops |
| service | a documented request parameter the handler never reads |
| desktop | a menu item wired to an empty handler |

### `error-surface-leak`
**Question:** is any upstream or internal error rendered as user-facing content?
**Anchor:** `high` when internal detail (endpoint paths, hostnames, stack
frames, credentials) is disclosed; `medium` when it is merely unhandled.

| Platform | Manifestation |
|---|---|
| android / ios / web | an upstream HTML error page rendered as body copy; a stack trace in the DOM |
| cli | a language traceback on stdout where a message belonged |
| service | an internal path or driver error echoed in the response body |
| notebook | a raw exception left as the cell's presented output |

### `ambiguous-copy`
**Question:** can a reader act wrongly on this surface's visible text — one
concept under two names, a reference with two possible referents, or an
instruction readable two ways?
**Anchor:** `medium`; `high` when the ambiguity sits on a destructive or
irreversible control, or when a charter constraint names the wording.

The check method is the word-discipline section (section 1) of
[_ste-procedural.md](_ste-procedural.md) — cite the W-rule on every finding.
This is the runtime counterpart of the `ste-compliance` review dimension:
that dimension audits text at rest; this class records what an observer catches
on the live surface.

> Provenance: this row was seeded by the adoption of the controlled-language
> contract (PO-directed), not by a real run — a deliberate exception to the
> growth rule below. If sweeps consistently fail to produce it, strike the row.

| Platform | Manifestation |
|---|---|
| android / ios / web | a dialog whose confirm/cancel labels don't answer the question asked; the same feature named differently on two screens |
| cli | `--force` help text that doesn't say what is forced; an error naming a flag that the usage text calls something else |
| service | an error body whose remedy refers to "the token" when the request carried two |
| desktop | a menu item and its confirmation dialog using different names for the same action |

### `terminal-wait`
**Question:** can this loading state be entered and never left?
**Anchor:** `medium`; `high` when the state has no escape affordance (no back,
no retry, no cancel).

A loading branch with no timeout, no error transition and no fall-through to an
empty/unavailable state. Look for the *absence* of the third branch, not for
slowness.

| Platform | Manifestation |
|---|---|
| android / ios / web | a `Loading` state with no timeout and no path to `Empty`/`Error` |
| cli | a progress indicator on a call with no deadline |
| service | a request with no timeout on its own downstream call |

### `fabricated-value`
**Question:** is any displayed statistic derived from a constant, a placeholder
or an assumption rather than from data?
**Anchor:** `medium`; `high` when it is presented as a headline figure or when a
charter constraint asserts real data.

The tell is a rendered number that survives when the underlying field is empty.
Trace every prominent figure back to its source before accepting it.

| Platform | Manifestation |
|---|---|
| any UI | a count or duration computed as `n × <constant>`; a hardcoded ETA; a stubbed rating |
| cli | a reported total that is a default, not a measurement |
| service | a synthesized response field with no backing store |

### `dependency-collapse`
**Question:** does one unavailable source take down surface that does not
depend on it?
**Anchor:** `high` — blast radius beyond the failing dependency is the defect,
independent of why it failed.

Usually found by perturbation (`runtime-adapters.md` → `Perturb`), not by
watching a healthy system. The severity case is unrelated local state dying with
a remote read.

| Platform | Manifestation |
|---|---|
| android / ios | a `combine(...)` over a flow that closes on error, collapsing whole-screen state |
| web | an error boundary swallowing a subtree; one failed fetch blanking a page |
| cli | aborting the command because an *optional* config source was unreadable |
| service | one degraded dependency turning every route 500 |

### `branch-gap`
**Question:** is a guarantee present only in the happy branch?
**Anchor:** `high` when the guarantee is asserted by a charter constraint, a
safety/ToS property, or a security control; else `medium`.

For each state a surface can occupy (loading, empty, error, unavailable,
offline, unauthorized), ask whether the promise still holds there.

| Platform | Manifestation |
|---|---|
| android / ios / web | a required element passed only into the success branch |
| cli | `--json` emitting valid JSON on success and bare prose on failure |
| service | a security or cache header set only on `200` |

### `boundary-overflow`
**Question:** does layout or output exceed the real target dimension?
**Anchor:** `low`; `medium` when it makes a control unreachable or truncates
meaning.

Drive at the dimension the artifact actually meets, not the one the mock used.

| Platform | Manifestation |
|---|---|
| android / ios | a control row clipped at the device's real width; text ellipsized past legibility |
| web | overflow at the narrowest supported viewport |
| cli | help or table output wider than 80 columns |
| service | a payload past a documented size cap |

### `env-interference`
**Question:** could ambient state — not the artifact — have produced what I just
saw?
**Anchor:** not a product finding by default. Record it to explain a withdrawn
or downgraded finding; promote only if the artifact itself provokes it.

System UI stealing focus, an overlay, a browser extension, a proxy, a tty-vs-pipe
difference, a stale install. **Corroboration by two tools does not defeat this**
— both tools observe the same corrupted state. Only a clean-state re-observation
does. See the re-observation rule in `probe.md`.

---

## Severity discipline (MANDATORY)

- A class that produced **no** finding gets **one line** in the coverage table —
  never a paragraph of reassurance.
- The anchors above are normative. Do not inflate an `incidental` (log spam,
  cosmetic warning) to pad a run, and do not deflate a charter violation.
- A run reporting more than ~15 findings **leads with the top five** and says so.
  A ranked short list is more actionable than an exhaustive flat one.
- A finding must name what was observed, not what was inferred. Source reading
  supports a finding; it does not substitute for observing the surface.

## Growth rule

A class earns a row here only when a **real run produced it**. No speculative
additions — a taxonomy that grows by imagination becomes a checklist, and a
checklist is what the severity discipline above exists to prevent.

---

## Decidability boundary (read BEFORE driving)

The binding constraint on a runtime sweep is not which platforms have adapters.
It is: **there must be a drivable surface whose correctness is decidable by
observation, within a session.** No amount of adapter-writing relaxes it — a
statistical application on the fully-supported `web` adapter is *less* coverable
than a CLI on a hand-written recipe.

Two independent axes, kept as separate artifact blocks because they have
different cures:

- **Can it be driven?** → bootstrap, `bootstrap-failure`. A missing adapter or a
  missing `Enumerate` recipe is a *tooling* gap: it costs coverage confidence.
- **Is watching it a valid way to know?** → this section, `decidability`. A
  continuous or statistical surface is a *method* gap: it invalidates the answer.

Conflating them yields either needless refusals or false confidence.

### Standing not-observable set

Declare these before driving whenever they apply to the artifact under test.
Each routes somewhere; the sweep **names the neighbouring surface, it does not
annex it**.

| Not observable by a session-length drive | Why | Route to |
|---|---|---|
| Statistical / generative correctness (ranking, recommenders, ML, LLM apps) | Output is observable; *rightness* is not decidable by looking | `review` dimensions; the project's eval harness |
| Long-horizon behavior (cron, batch, retention, billing, eventual consistency, backup/restore) | A sweep is session-length; these fail over hours to months | `/wf observability` — instrument for these, do not drive them |
| Concurrency and load (lost updates, deadlocks, stampedes) | One actor, one path | `review/backend-concurrency.md`, `review/scalability.md` |
| Absence properties ("there is no injection here") | Not observable from a happy path plus one perturbation | `/security-review`, `review/security.md` |
| Library / SDK / compiler / runtime correctness | No user surface — the surface is an API and its consumers are code | `review/api-contracts.md`, the project's own suite |
| Embedded / real-time / continuous surfaces (firmware, robotics, games, frame timing, input latency) | Screenshot-and-compare is the wrong instrument for a continuous surface | out of scope — say so plainly |
| Perceptual accessibility and design judgment | Genuinely perceptual | the constraint-resolution ladder's residual rung |
| Anything needing credentials or state the run may not hold | A correct permanent boundary, not a gap | `out-of-authority` in the coverage table |

### Refuse rather than under-report

When the artifact's **primary** correctness class is in the set above, say so
**first** — at the top of the artifact and in the chat return, before any
finding. Still report what the wrapper shows (a generative app can absolutely
have a `dead-affordance` and a `terminal-wait`); do not let that read as a
verdict on the thing the wrapper wraps.

This is the same move `status: awaiting-environment` already makes for a room
the run cannot enter, pointed at a question the method cannot answer.
