# Surface Sweep Plan — a defect-taxonomy mode for `/wf probe`

Status: **BUILT 2026-07-29 — W1–W6 all landed, unreleased.** 761 tests green in
the main tree (was 736; `tests/unit/skills/surface-sweep.test.mjs` adds 25),
23/23 in the codex tree including `verify-claudisms`. Both trees carry the
change. **No version bump yet** — a release is a shared act and a concurrent
session was committing in this tree during the build.
Built: new `skills/wf/reference/_surface-defects.md` (both trees) · `probe.md`
+46 lines (both) · `runtime-adapters.md` +142/+143 lines, 7 `Enumerate` and 7
`Perturb` sections plus the shared enumeration ladder and perturbation protocol
(both) · `SKILL.md` probe row (both) · taxonomy cited from `review/reliability`,
`review/correctness`, `review/ux-copy` and `verify.md` (both).
Source: the 2026-07-24 Playster `/wf probe editorial-reader-redesign` transcript
(session `640d82d2`, 18:23 → 20:46 UTC, ~198 assistant actions, 12 findings,
51 evidence files) — a free-text "drive the entire app surface" probe run on a
physical Galaxy Z Fold6 against production Firebase.
Related: [EVIDENCE-SCHEMA-CONTRACT.md](EVIDENCE-SCHEMA-CONTRACT.md) (evidence
rungs) · [INTENT-FIDELITY-HARDENING-PLAN.md](archived/INTENT-FIDELITY-HARDENING-PLAN.md)
(BUILT v9.126–131, mock-gate + RIM ledger) · wall-ownership release v9.140.0
(ownership triage, env-remediation rung).

Audit conclusion: **the run's value did not come from probe's designed path.**
`probe.md` describes an AC-driven verifier — resolve a target through four
layers, drive the matched ACs, compare evidence to AC text, note incidentals in
passing. Of the twelve findings that run produced, exactly **one** (F12, speed
pills clipped at 369dp) came from an AC. Three came from comparing observed
behavior to the slug's **charter constraints** — a block sitting at line 71 of
the same `00-index.md` that probe Step 0 parses six other keys out of and walks
straight past. The rest came from an unwritten defect taxonomy the model
carried in its head. Everything below makes those three sources — charter,
taxonomy, coverage — structural rather than a matter of the model's diligence.

Anchors verified against the source tree at **v9.140.0** on 2026-07-26. Line
numbers drift; step names, section headings and reserved keywords are the
durable reference. Every wave here touches shared reference prose, so **each
lands in both trees** (`plugins/sdlc-workflow/` and `plugins/sdlc-workflow-codex/`,
the latter with `$wf` in place of `/wf`).

---

## W0 — Already built (do not rebuild)

The platform layer is solved. `runtime-adapters.md` (602 lines) ships seven
adapters — `web`, `android`, `ios`, `cli`, `desktop`, `service`, `notebook` —
each with Bootstrap / Drive / Observe / Tear down / Evidence layout /
Remediation hints, plus a shared evidence protocol, shared accessibility checks
and the constraint-resolution ladder. Its closing section states the extension
contract explicitly: adding a platform is a single-file markdown append, and
"No changes are needed in `verify.md` or `probe.md` — both read this file and
discover adapters by section heading."

| Already present | Where | Consequence for this plan |
|---|---|---|
| Adapter registry + single-file extension contract | `runtime-adapters.md` §Adding a new adapter | New platforms are cheap and out of scope here. Do NOT make coverage a platform-count exercise. |
| Two-phase bootstrap → `status: awaiting-environment` | `probe.md` Step 4 | The refusal instinct exists. W4 extends it from *environment* to *decidability*. |
| Wall-ownership triage, env-remediation rung, attempt-before-declare | `runtime-adapters.md` §Constraint-resolution ladder (v9.140.0) | W4's decidability block is the same epistemics one level up — reuse the vocabulary, do not invent a parallel one. |
| Direction rule for prove-fail-closed ACs | `probe.md` Step 7 | W5 (perturbation) is its runtime generalization: a failure branch you can *induce*, not only wait for. |
| 34 static review dimensions | `reference/review/*.md` | W4's routing targets. The sweep must name the neighbouring cell, not annex it. |
| Slug + slug-less modes inside one key | `review.md`, `simplify.md` | Precedent for W3. No new router key is warranted. |
| Project-level read-only artifacts | `.ai/ship-plan-audit.md`, `.ai/observability-audit.md` | Precedent for W3.2's `.ai/surface-sweep-<date>.md`. |

**W0.1 — Why this is not a new `/wf` key.** Every structural change since
v9.82.0 has been subsumption: `wf-quick` → intake modes, `wf-design` → one key
with command arguments, `wf-meta` + `wf-docs` → dissolved, `craft` → deleted
into the lifecycle, `/review` → `/wf review`. The router is at 21 keys and
`SKILL.md` calls that table "the authoritative roster". A `/wf bugfinder` would
duplicate probe's adapter selection, two-phase bootstrap, evidence protocol,
compressed-slice contract, deferral clearing and index bookkeeping — all of
which are comparison-basis-agnostic. Only Steps 2 and 5 of `probe.md` are
AC-specific. **That is the true surface area of this plan: two steps and a
rubric.** Recorded here so a future reader does not re-litigate it.

---

## Finding → wave map (provenance)

Playster finding IDs are from
`.ai/workflows/editorial-reader-redesign/03-slice-probe-device-fold6-2026-07-24.md`.

| # | Observation (Playster, session `640d82d2`) | Wave |
|---|---|---|
| 1 | F8, F10, F11 were found by comparing runtime behavior to charter C3/C4/C5 — and `grep -c constraint skills/wf/reference/probe.md` returns **0**. Probe is never told the charter exists. | W1 |
| 2 | F7 (raw `403 Forbidden` HTML rendered as editorial body copy, internal `/v1/jobs` path leaked), F9 (Transcript held `Loading` 45s+, never fell through to `Unavailable`), F10 (`videoCount × 21` constant presented as "2835H UNREAD"), F11 (`onClick = {}` on a shipped Download button) — four distinct, nameable, platform-generic defect classes, none declared by any AC | W1 |
| 3 | Screens were discovered by improvising a `probe.sh` tap/shot/logs harness and walking the nav; probe has no instruction to inventory the surface before driving it | W2 |
| 4 | Coverage was reported honestly but in prose ("Not probed, and honestly so: Transcript and Playlist unreachable, palette switching blocked, sign-out — your account"). Nothing structural forces that ratio to exist | W2 |
| 5 | The free-text target fell to Layer 4 `ad-hoc: true` while also fuzzy-matching 8 ACs — the grammar had no way to express "sweep everything by class" | W3 |
| 6 | The most valuable finding (F3, four screens collapse when one per-user read fails) was reframed from "consequence of a deployment gap" to "no tolerance for any brief unavailability" **only** because composite-index building happened to produce a 6-minute outage. Luck, not method | W5 |
| 7 | F1/F2 (rules and `searchTranscripts` never deployed) were invisible to every prior emulator probe — the emulator loads rules from disk and runs functions locally. No AC in the slug asserts deployment state | W2, W4 |
| 8 | A HIGH finding ("bottom-nav tap targets dead") was reproduced with raw `adb input` **and** Maestro **and** grounded in source — and was still wrong: a notification shade had stolen focus. Self-corrected only because the model happened to re-test from a clean state | W6 |
| 9 | Sign-out / Google sign-in correctly **not** driven — restoring the session required the user's personal account. A permanent, correct boundary | W4 |

**Not a finding — worth protecting.** The severity distribution was honest:
2 critical / 3 high / 4 medium / 2 low / 1 incidental, with `PlaylistDoc` setter
warning spam correctly labelled incidental rather than inflated. A taxonomy
invites checklist-grinding; W1.4 exists to stop this plan from trading that
honesty away.

---

## Wave 1 — The comparison basis (highest payoff, standalone)

Files: `skills/wf/reference/probe.md`, new
`skills/wf/reference/_surface-defects.md`, both trees.

**W1.1 — Probe reads the charter.** `probe.md` Step 0 item 1 currently parses
`branch`, `selected-slice`, `current-stage`, `status`, `workflow-files`,
`runtime-evidence-deferrals`, `compressed-slices` and `stack:` from
`00-index.md`. Add `charter:` to that list, and add a line to Step 5's
comparison: *observed behavior is compared against the matched AC text **and**
against every charter constraint whose subject the observation touches.* A
constraint violation is a finding at the constraint's own weight, independent of
whether any AC covers it. Record the constraint id (`C4`) on the finding.

Rationale: ACs are per-slice and get marked `cleared`; charter constraints are
PO-ratified, cross-slice and durable. A runtime observer that reads the receipts
and ignores the contract will keep missing the F10/F11 class. This is the
cheapest high-value change in the plan — roughly two paragraphs of reference
prose.

**W1.2 — Author `_surface-defects.md`.** The taxonomy, written
platform-generic with per-adapter manifestations. Each class carries: a
one-line definition, a severity anchor, the observation that detects it, and
three-to-five platform instantiations. Seed set, every one derived from a real
Playster finding:

| Class | Definition | Android | Web | CLI | Service |
|---|---|---|---|---|---|
| `dead-affordance` | An interactive control whose handler does nothing | `onClick = {}` (F11) | `<button>` with no listener | flag parses, changes nothing | documented param ignored |
| `error-surface-leak` | An upstream/internal error rendered as user content | 403 HTML as body copy (F7) | stack trace in the DOM | traceback on stdout | internal path in the response |
| `terminal-wait` | A loading state with no timeout, error branch or escape | `Loading` forever (F9) | spinner, no error boundary | progress bar on a hung call | request with no deadline |
| `fabricated-value` | A displayed statistic derived from a constant, not data | `videoCount × 21` (F10) | hardcoded ETA | stubbed count | synthesized field |
| `dependency-collapse` | One unavailable source takes down unrelated surface | `combine()` over a throwing flow (F3) | boundary swallows the tree | abort on optional config | one bad dep → 500 |
| `branch-gap` | A guarantee present only in the happy state | embed only in `Available` (F8) | banner only on success | `--json` correct only on 0 | header only on 200 |
| `boundary-overflow` | Layout/output exceeds the real target dimension | 2× pill clipped at 369dp (F12) | overflow at 375px | help wider than 80 cols | payload past a documented cap |
| `env-interference` | An observation corrupted by ambient state, not the artifact | notification shade steals focus (#8) | extension/overlay | tty vs pipe | proxy/VPN |

The file is **shared**, not sweep-private: `review/reliability.md`,
`review/correctness.md` and `review/ux-copy.md` should cite it, and verify's
runtime sub-agent should too. Growth rule: a class earns a row only when a real
run produced it — no speculative additions.

**W1.3 — Declare the comparison basis in the artifact.** Frontmatter gains
`comparison-basis: [ac, charter, taxonomy]` (sweep) or `[ac]` (targeted probe),
so a reader can tell which contract a run was held to.

**W1.4 — Anti-grind rule (MANDATORY, in `_surface-defects.md`).** A class that
produced no finding gets **one line in the coverage table**, never a paragraph
of reassurance. Severity anchors are normative: `dead-affordance` on a shipped
screen is at least `medium`; log spam is `incidental` and stays there. A run
reporting more than ~15 findings must lead with the top five and say so — the
Playster set was useful *because* twelve findings were ranked honestly.

---

## Wave 2 — Enumeration and coverage accounting

Files: `skills/wf/reference/runtime-adapters.md`, `skills/wf/reference/probe.md`,
both trees.

**W2.1 — An `Enumerate` section per adapter**, alongside Bootstrap / Drive /
Observe / Tear down. How to inventory the drivable surface *before* driving it:

- `web` — router config, sitemap, or a crawl bounded to same-origin routes
- `android` — the nav graph (`EditorialRoutes`-style route enum, `NavHost`
  destinations), plus the bottom-nav / drawer roster
- `ios` — storyboard segues or the SwiftUI navigation model
- `cli` — recursive `--help` walk, or the `bin` manifest / subcommand registry
- `desktop` — the menu tree
- `service` — the route table or `openapi.yaml` paths
- `notebook` — the cell graph and its parameterization surface

**W2.1a — The enumeration ladder (an adapter with no recipe is NOT unsupported).**
A recipe is the top rung, not the only one. Absent one, the sweep climbs down
and **records the rung it reached** — the same discipline the
constraint-resolution ladder already enforces for environment walls. Silent
degradation is the failure to prevent: an unqualified `enumerated: 5` from a
run that merely reached five things is a claim the method cannot support.

| Rung | Method | Denominator quality |
|---|---|---|
| 1 `recipe` | The adapter's `Enumerate` section | Authoritative — from a declared source |
| 2 `static` | Read the app's navigation model in source with no recipe (iOS: storyboard segues, SwiftUI `navigationDestination`, `UITabBarController` items) | Authoritative if the model is centralized; misses dynamic destinations |
| 3 `traversal` | Bounded breadth-first drive from the entry point, recording distinct states reached | **A floor, not a total** — cannot know what it never found a door to |
| 4 `named` | The user supplies the surface list | As good as the list |

`enumeration-method: recipe | static | traversal | named` is recorded in
frontmatter, and a `traversal` run states in the artifact and the chat return
that its coverage figure is a floor. Rungs 2–3 need no per-platform authoring,
so **every adapter in the registry can be swept from day one** — `ios`,
`desktop` and `notebook` included — at a declared, lower-confidence denominator.

Note the two independent axes this exposes, kept as separate artifact blocks on
purpose: *can the surface be driven* (bootstrap, `bootstrap-failure`) and *is
its correctness decidable by watching* (W4, `decidability`). An unwritten
`Enumerate` recipe is a tooling gap that degrades a number; a continuous
real-time surface is a method gap that invalidates the answer. Conflating them
yields either needless refusals or false confidence.

**W2.2 — Coverage frontmatter.** The probe slice gains:

```yaml
surface-coverage:
  enumeration-method: recipe | static | traversal | named
  enumerated: <N>          # a FLOOR when enumeration-method is `traversal`
  driven: <N>
  unreached:
    - { surface: "<name>", reason: "<why>", class: blocked | out-of-authority | not-decidable }
```

`out-of-authority` is a first-class, non-shameful outcome — the Playster run's
refusal to drive Google sign-in belongs there (#9), not in a prose apology.

**W2.3 — A zero-finding run must show its work.** `probe.md` Step 6 currently
says: if `findings-count == 0`, write "No findings." For `comparison-basis`
including `taxonomy`, that is insufficient — a zero-finding sweep must render
the coverage table and the per-class line. The difference between "I found no
bugs" and "I enumerated 6 surfaces, drove 6, and here are the 2 I couldn't reach
and why" is the difference between a sweep you can ship on and one you can't.

**W2.4 — Environment provenance on the artifact.** F1/F2 (#7) were invisible to
every prior emulator probe because the emulator loads rules from disk and runs
functions locally. The slice already records `backend-under-test:` in practice;
make it schema. Add `environment-class: production | staging | local-emulated |
mocked` and require the sweep to state which classes of defect that choice makes
structurally invisible. A `local-emulated` sweep cannot observe deployment
state — that belongs in the decidability block (W4), sourced from here.

---

## Wave 3 — The `sweep` mode

Files: `skills/wf/reference/probe.md`, `skills/wf/SKILL.md` (argument hint only),
both trees.

**W3.1 — Reserved keyword in the target position.** `/wf probe <slug> sweep`.
`sweep` joins the small set of reserved positional keywords (intake's mode
words, design's command words); every other target string keeps today's
four-layer resolution untouched. Naming note, recorded to prevent re-opening:
**not** `bugfinder` — that names the outcome, and licenses the failure mode
where a run finding nothing concludes there was nothing to find. `sweep` names
the method (exhaustive fan-out, consistent with `review sweep`) and makes the
null result an auditable coverage claim.

**W3.2 — Slug-less form.** `/wf probe sweep [path]` runs with no workflow at
all — the mode that makes this usable on any app being built, which is the
whole point of generalizing it. Probe owns its own first-token resolution
(`sweep` as token 1 ⇒ slug-less; otherwise token 1 is a slug), exactly as
`review` and `simplify` already do. Output is a project-level
`.ai/surface-sweep-<utc-date>.md` — read-only, no workflow bookkeeping, no
`00-index.md` mutation, per the `.ai/ship-plan-audit.md` precedent. With no
charter available, `comparison-basis` is `[taxonomy]` and the artifact says so.

**W3.3 — Routing.** Slug mode keeps probe's existing table
(`/wf plan <slug> probe-<descriptor>` for cross-cutting, `/wf intake fix` for
≤3 files). Slug-less mode routes to `/wf intake fix <description>` or
`/wf intake rca <description>` — the sweep creates no slug of its own.

**W3.4 — What sweep does NOT change.** It is still not a fixer, still writes no
code, still runs the same bootstrap and evidence protocol, still clears
deferrals per Step 7. Only Steps 2 and 5 differ.

---

## Wave 4 — The decidability declaration (must land with W3)

Files: `skills/wf/reference/probe.md`, `skills/wf/reference/_surface-defects.md`,
both trees.

The sweep's real boundary is not "which platforms have adapters" — it is:
**there must be a drivable surface whose correctness is decidable by
observation, within a session.** Every genuine gap violates that sentence, and
no amount of adapter-writing relaxes it. An ML app on the fully-supported `web`
adapter is *less* coverable than a CLI on a hand-written recipe.

The failure mode to design against is not missing firmware. It is a sweep run
against an ML application that reports three findings and a clean coverage
table, from which a reader concludes the model is fine. A method that speaks
confidently about the fraction it can see, while silent about the fraction it
cannot, is worse than one that refuses.

**W4.1 — A structured decidability block, stated before driving:**

```yaml
decidability:
  observable: [<defect classes this artifact's surface can be driven for>]
  not-observable:
    - { class: <what kind of truth>, why: "<reason>", covered-by: "<other surface>" }
```

**W4.2 — The standing not-observable set** (in `_surface-defects.md`, so every
caller inherits it):

| Not observable by a session-length drive | Why | Route to |
|---|---|---|
| Statistical / generative correctness (ML, recommenders, ranking, LLM apps) | Output is observable; *rightness* is not decidable by looking | `review` dimensions; eval harnesses |
| Long-horizon behavior (cron, batch, retention, billing, eventual consistency, backup/restore) | A sweep is session-length; these fail over hours to months | `/wf observability` — you instrument for these, you don't drive them |
| Concurrency and load (lost updates, deadlocks, stampedes) | One actor, one path | `review/backend-concurrency.md`, `review/scalability.md` |
| Absence properties (no injection here, no leak here) | Not observable from a happy path plus one perturbation | `/security-review`, `review/security.md` |
| Library / SDK / compiler / runtime correctness | No user surface — the surface is an API and its consumers are code | `review/api-contracts.md`, the project's own suite |
| Embedded / real-time / continuous surfaces (firmware, robotics, games, frame timing, input latency) | Screenshot-and-compare is the wrong instrument for a continuous surface | out of scope; say so plainly |
| Perceptual accessibility and design judgment | Genuinely perceptual | the ladder's existing residual rung |
| Anything needing credentials or state the run may not hold | Correct permanent boundary, not a gap | `out-of-authority` in W2.2 |

**W4.3 — Refuse rather than under-report.** When the artifact's primary
correctness class is in the not-observable set, the sweep says so **first**, in
the chat return and at the top of the artifact, before any finding. It still
reports what it found on the wrapper (a generative app can absolutely have a
dead affordance and a terminal wait) — it must not let that read as a verdict on
the thing the wrapper wraps. This is the same move `status: awaiting-environment`
already makes for a room the run can't enter, pointed at a question the method
can't answer.

---

## Wave 5 — Perturbation

Files: `skills/wf/reference/runtime-adapters.md`, `skills/wf/reference/probe.md`,
both trees.

`dependency-collapse` and `branch-gap` cannot be found by driving the happy
path. The Playster run found F3's true severity only because composite-index
building produced an accidental 6-minute controlled experiment (#6). Make it
deliberate.

**W5.1 — A `Perturb` section per adapter** — how to break exactly one
dependency and re-observe: `web` offline / 500 one route via request
interception; `android` airplane mode, revoked rule, killed backing service;
`cli` removed config file, no network, read-only FS; `service` one dependency
down, one slow; `notebook` missing input dataset.

**W5.2 — Scope discipline.** Perturbation is **one dependency at a time, always
reversible, never a mutation of state the run does not own** — the same
authority boundary as v9.140.0's env-remediation rung, and it must cite that
rung rather than restate it. Restore before teardown; record the perturbation
and the restore in evidence.

**W5.3 — Relationship to Step 7's direction rule.** Step 7 already refuses to
clear a prove-fail-closed AC on happy-path evidence. W5 is its generalization: a
failure branch you can *induce* rather than wait for. Cross-reference both ways
so a reader finds one from the other.

---

## Wave 6 — Observation hygiene (smallest, highest trust-per-line)

Files: `skills/wf/reference/probe.md`, both trees.

**W6.1 — The re-observation rule.** Any finding above `low` whose evidence is a
**single observation on an interactive surface** must be re-observed from a
clean state (fresh launch, dismissed system UI, known route) before it is
recorded. On divergence, the finding is downgraded or dropped and the
divergence itself is recorded.

Provenance (#8): a HIGH finding survived corroboration by two independent
tools *and* a source reading, and was still wrong — a notification shade had
stolen focus. Corroboration by tools does not defeat ambient interference,
because both tools observed the same corrupted state. Only a clean-state
re-observation does.

**W6.2 — `env-interference` is a named class** (W1.2 table) so the retraction
has somewhere to live: the artifact records what interfered, not just that the
finding was withdrawn.

**W6.3 — Retraction is a first-class artifact section.** The Playster run's
in-chat correction was excellent and left no structural trace. Add
`retracted-findings:` to frontmatter — `{claim, why-withdrawn, evidence}` — so
the honesty survives the session.

---

## Build order and sizing

| Wave | Size | Depends on | Rationale for position |
|---|---|---|---|
| W1 comparison basis | M (1 new ref + probe Steps 0/5 + tests) | — | Improves targeted probe *today*, before any mode exists. W1.1 alone is ~2 paragraphs for 3 of 12 findings. |
| W6 observation hygiene | S (probe prose + frontmatter key) | — | Cheapest trust gain in the plan; independent of everything |
| W2 enumeration + coverage | M (7 adapter sections + frontmatter + tests) | W1 (classes to count against) | Makes any sweep result auditable; also improves verify's runtime leg |
| W4 decidability | S–M (ref prose + standing table) | W1.2 (lives in the same file) | **Must land no later than W3** — a sweep that can't say what it can't see is the thing to avoid shipping |
| W3 sweep mode | M (probe grammar + slug-less artifact + router hint) | W1, W2, W4 | The visible feature, deliberately last: it is a thin wrapper over three layers that must exist first |
| W5 perturbation | M (7 adapter sections + scope rule) | W1.2, W2.1 | Additive; the classes it targets are already detectable passively when luck cooperates |

Suggested release slicing: **W1 + W6** as one probe-fidelity release (no new
surface, immediate field value), **W2 + W4** as the coverage/honesty release,
**W3 + W5** as the sweep-mode release. Write the W2.1 / W5.1 recipes first for
the platforms actually shipped — `web`, `android`, `cli`, `service` — and let
the registry's single-file-append path carry `ios` / `desktop` / `notebook`
when a project needs them. **An adapter with no recipe is not unsupported**: per
W2.1a it sweeps at rung 2 or 3 with `enumeration-method` declared, so the
recipe backlog costs denominator confidence, never the run. Per W0, coverage is
not a platform-count exercise.

Per [plugin_version_bump_locations] discipline every release bumps all five
source/config spots plus doc-site brands; per the marketplace-pin lesson, no
release is done until `origin/master` carries it. These waves touch reference
markdown only — no `lib/`, `dist/` or `buildId` implications — but shared
reference files are mirrored, so every wave runs `npm run sync:codex` and
verifies the codex tree took the `$wf` substitution.

---

## Tests

New suite `tests/unit/skills/surface-sweep.test.mjs`, following the
`wall-ownership.test.mjs` shape: iterate both trees, pin the load-bearing
phrases so a future edit cannot silently drop a gate.

- **W1** — `probe.md` Step 0 names `charter:`; Step 5 states the charter
  comparison; `_surface-defects.md` exists and contains every seeded class id;
  the anti-grind rule and severity anchors are present.
- **W2** — every adapter section that ships a recipe has an `Enumerate` heading;
  the four-rung enumeration ladder and `enumeration-method` are documented, and
  a `traversal` denominator is described as a floor **wherever the count is
  rendered** (artifact and chat return — assert both); `probe.md` requires the
  coverage table on a zero-finding sweep; `environment-class` is documented with
  its four values. Guard the degrade path explicitly: an adapter with no
  `Enumerate` section must not be reachable by any "unsupported" wording.
- **W3** — `sweep` is documented as a reserved keyword; the slug-less path and
  its `.ai/surface-sweep-<date>.md` destination are named; `SKILL.md`'s probe
  argument hint matches `probe.md`'s grammar (drift guard).
- **W4** — the decidability block is required *before* driving (ordering
  assertion, as `wall-ownership.test.mjs` does for triage-before-climb); every
  row of the standing not-observable table names a `covered-by` route, and each
  route resolves to a file that exists.
- **W5** — every adapter has a `Perturb` heading; the one-dependency /
  reversible / not-our-state rule cites the env-remediation rung rather than
  restating it.
- **W6** — the re-observation threshold (`above low`, interactive surface,
  clean state) is present; `retracted-findings` is in the frontmatter block.

---

## Open questions for the PO

1. **Slug-less scope.** `/wf probe sweep` with no workflow is the form that
   generalizes across projects — but it puts a runtime driver in repos with no
   `.ai/workflows/` at all. Ship it in the same release as slug mode, or hold it
   a release and let slug mode prove the taxonomy first?
2. **Taxonomy ownership.** `_surface-defects.md` is proposed as shared with the
   34 review dimensions. Do the overlapping dimensions (`reliability`,
   `correctness`, `ux-copy`) *cite* it, or does the taxonomy get absorbed into
   them and the sweep reference them instead? The former keeps one runtime home;
   the latter avoids a second place to look.
3. **Perturbation default.** Is W5 on by default in sweep mode, or opt-in? It
   induces real failures against whatever backend is under test — and the
   Playster run was pointed at **production**.
