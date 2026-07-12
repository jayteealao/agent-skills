# Memory-Seed Kernel — force a minimal `/wf` rule set into the agent memory files (Implementation Plan)

> Status: **SHIPPED v9.125.0** (2026-07-12; drafted + built same day, `@import` research below drove the
> canonical-AGENTS.md structure). `lib/memory-seed.mjs` + bundled `dist/seed-memory.mjs`, wired into both
> trees' SessionStart, `memory.seedRules` config (default on), 19-case unit suite (incl. CRLF idempotence),
> both hosts verified end-to-end (Claude seeds+notifies; Codex seeds silently).
> Provenance: the user asked whether a *minimal set of rules around `/wf`* could be **force-inserted into the
> Claude/Codex memory files if not present** — e.g. "use `study-sources` to ground facts." Today nothing the
> plugin ships lands in a memory file; the closest concept is per-workflow `steer.md`, and
> [`_steering.md:41`](../../skills/wf/reference/_steering.md) *already names the slot this plan fills*:
> *"Project-level standing conventions… belong in `CLAUDE.md` or `sdlc-config.json`, not here."*
> This plan automates the population of that slot. Baseline: v9.124.0 (`faf72c7`). Codex mirror:
> `plugins/sdlc-workflow-codex/`.

## The decisions already taken (read this first)

Four forks were weighed with the user; all are settled, and the plan assumes them.

1. **Durable write, not ephemeral inject.** The kernel is written *once* into the memory files behind a
   versioned fence — not re-asserted into context every session. This is deliberate: v9.97.0 **stripped the
   SessionStart orientation `systemMessage`** ([`session-start-orient.mjs`](../../hooks/session-start-orient.mjs)
   emits none today) precisely because always-on context injection read as noise. A durable memory block costs
   nothing per session beyond what any memory line already costs, and it is user-visible and user-editable —
   the opposite posture from the one that was rejected.

2. **Single canonical source via `@import`, not duplicate fences.** `AGENTS.md` holds the *literal* kernel;
   `CLAUDE.md` holds only a `@AGENTS.md` import directive that expands the kernel into Claude's context at
   session start. The kernel text therefore exists in exactly one place. Rationale under
   [Research: the `@import` mechanism](#research-the-import-mechanism).

3. **Append placement.** In an existing `CLAUDE.md` / `AGENTS.md`, the managed region is appended after a
   blank line — no top-anchor heuristic, no reflow of user content.

4. **One-time notice on first insert.** The write is silent on every subsequent session (idempotent no-op), but
   the *first* time it seeds a repo it surfaces a single `systemMessage` naming the file(s) it wrote and the
   opt-out flag. Rationale under [First-run visibility](#first-run-visibility-decided-one-time-notice).

5. **Plan first, build second.** This document is the decision artifact; no code lands until it's ratified.

## Research: the `@import` mechanism

Confirmed against the [Claude Code memory documentation](https://code.claude.com/docs/en/memory.md):

- **Syntax** `@path/to/file`. The docs show `@AGENTS.md` at the top of a `CLAUDE.md` as a first-class pattern.
- **Expansion time** — imported files are *"expanded and loaded into context at launch alongside the CLAUDE.md
  that references them."* So an imported file's contents become part of always-loaded memory.
- **Path resolution** — relative paths resolve from the *importing* file's location; a root `CLAUDE.md` with
  `@AGENTS.md` therefore pulls the root `AGENTS.md`. Absolute and `@~/…` home paths also work.
- **Recursion** — nested imports allowed, **max 4 hops**.
- **Not evaluated inside** fenced code blocks, inline code spans (backticks keep `@` literal), or HTML
  comments (stripped before injection). ← our fence *sentinels* are HTML comments, so the `@AGENTS.md` must sit
  in the fence *body*, between the sentinels, never inside them.
- **Claude-only.** *"Claude Code reads `CLAUDE.md`, not `AGENTS.md`."* The `@` directive is a Claude Code
  feature; the native Codex CLI is **not** documented to evaluate `@` imports.

**Why this pins the architecture.** Codex reads `AGENTS.md`'s *literal* contents natively — it needs no import.
Claude reads `CLAUDE.md` and can import `AGENTS.md`. So the only structure that gives *both* platforms the
kernel from *one* source is: **`AGENTS.md` canonical (literal kernel), `CLAUDE.md` importing it.** A dedicated
third file would fail Codex, which won't follow an `@import` — it would force the kernel to be duplicated back
into `AGENTS.md` anyway, defeating the single-source goal.

## What this is — and the boundary it crosses

`CLAUDE.md` and `AGENTS.md` are **user-owned, committed, hand-authored files.** Every other artifact this
plugin writes goes to gitignored `.ai/` scratch. Writing into a *tracked* user file is a genuinely different
posture, and the plan treats that boundary as the central constraint. The safety of the whole feature rests on
one contract: **the plugin owns exactly one fenced region per file and never touches a byte outside it.**

### The gap this fills

| Scope | Served by | What it does |
|---|---|---|
| **Per-workflow standing constraints** | [`steer.md`](../../skills/wf/reference/_steering.md) | User-owned free prose, one workflow slug; stages read it, never author it. |
| **Project-level durable `/wf` invariants** | *nothing* | The 3–5 always-loaded rules that make the model reach for the right tool by default — grounding, artifact locations, generated-output discipline. |

`steer.md` (per-workflow, user-authored) and this kernel (project-level, plugin-authored) are complementary;
`_steering.md:41` already draws the line between them, and this plan is the other half of that sentence.

## The two-file structure

```
AGENTS.md  (canonical)                         CLAUDE.md  (pointer)
┌───────────────────────────────────────┐      ┌───────────────────────────────────────┐
│ <user content…>                        │      │ <user content…>                        │
│                                        │      │                                        │
│ <!-- sdlc:wf-rules v1 START … -->      │◀─────│ <!-- sdlc:wf-rules-import START … -->   │
│ ## Working in this repo …              │  @   │ @AGENTS.md                              │
│  - /wf … - study-sources … - steer.md  │      │ <!-- sdlc:wf-rules-import END -->        │
│ <!-- sdlc:wf-rules v1 END -->          │      └───────────────────────────────────────┘
└───────────────────────────────────────┘
   literal kernel — Codex reads natively,          version-independent pointer — written once,
   Claude reads via the import                     never rewritten on kernel bumps
```

Two consequences worth naming:

- **The pointer never version-bumps.** `CLAUDE.md`'s fence body is the invariant string `@AGENTS.md`. When the
  kernel evolves (v1→v2), only `AGENTS.md`'s fence is version-replaced; `CLAUDE.md` is untouched.
- **`@AGENTS.md` imports *all* of `AGENTS.md`,** not just the kernel span — that is the intended semantics of
  the agents file (one cross-tool source Claude now honors too), but it is a behavior note: Claude will see the
  user's other `AGENTS.md` content as well. Acceptable, and arguably a feature, but stated explicitly.

## The managed-block contract

One idempotent writer per file, governed by:

1. **Fenced, versioned region (AGENTS.md).**
   ```
   <!-- sdlc:wf-rules v1 START — managed by sdlc-workflow; edit outside this fence -->
   … kernel …
   <!-- sdlc:wf-rules v1 END -->
   ```
   The `vN` is load-bearing — it lets the kernel evolve without a migration script, the same idea as the render
   version-gate (`PLUGIN_VERSION` in `.last-render`).

2. **Idempotent, surgical (AGENTS.md).** Fence absent → append after a blank line (create the file with only
   the fence if it doesn't exist). Fence present at current version → **no write** (byte-identical → no dirty
   git tree). Fence at an older version → replace *only the fenced span*. Never parse or reflow content outside
   the fence.

3. **Ensure-import, not version-replace (CLAUDE.md).** The `CLAUDE.md` writer's job is "guarantee this file
   imports `AGENTS.md`." If an `@AGENTS.md` (or `@./AGENTS.md`) already appears outside a code block —
   user-authored or ours — **no-op**. Otherwise append the `sdlc:wf-rules-import` fence. This is a smarter
   idempotency check than pure fence-presence: it won't add a duplicate import a user already wrote by hand.

4. **Fail-open, always.** A memory seed must never break or slow session start. Wrapped in the same
   try/catch-and-continue discipline as `healAutostartLauncher()` / `healRunningTray()`. Read-only repo,
   permission error, locked file → silently skip. Orientation is sacred.

5. **Opt-out via config, on by default.** `sdlc-config.json` → `memory.seedRules: false` disables it entirely,
   read through [`loadConfig`](../../lib/config.mjs). Convention over flags: no new CLI surface. Default-on is
   the point — the feature is inert if it only fires when asked.

## The kernel content (keep it a kernel, not a manifesto)

The single largest failure mode is drift-by-growth: a 3-line nudge swells into a restatement of the skill docs,
forks across versions, and rots — exactly what the plugin fights in the EOB single-source work and what
`_steering.md` enforces with "cite by name, don't restate." The kernel obeys the same discipline: **each line
points at a skill; it does not reproduce one.** It lives in `AGENTS.md`, so it is platform-neutral prose (read
by both Codex natively and Claude via import) — no Claude-only or Codex-only phrasing.

```markdown
<!-- sdlc:wf-rules v1 START — managed by sdlc-workflow; edit outside this fence -->
## Working in this repo (sdlc-workflow)

- `/wf` is the lifecycle entry point. Workflow artifacts live under `.ai/`; treat rendered or generated
  output as read-only — regenerate, don't hand-edit.
- Ground facts in real source instead of guessing: reach for **study-sources** before asserting how a
  library, framework, SDK, or API actually behaves.
- Durable per-workflow constraints (vetoes, preferences) go in `.ai/workflows/<slug>/steer.md`.
<!-- sdlc:wf-rules v1 END -->
```

Why each earns its place — and nothing else does:

- **`/wf` + `.ai/` + generated-output** — the one structural fact a fresh model in this repo can't infer and
  most often gets wrong (hand-editing a rendered artifact).
- **study-sources grounding** — the user's motivating case. Its value over the skill's own trigger description
  is that a memory line is *always loaded*, so it shifts the prior toward "verify, don't guess" rather than
  leaving the reach-for-it decision to the model in the moment.
- **steer.md pointer** — closes the loop with the per-workflow slot so the two mechanisms are discoverable
  together.

Anything beyond these three faces the durability filter retro applies: if it isn't a project-wide invariant a
fresh session would otherwise violate, it doesn't belong in always-loaded memory.

## First-run visibility (decided: one-time notice)

The write is silent on every session after the first — but the *first* insert into a repo emits a single
`systemMessage`, e.g.:

> sdlc-workflow added a `/wf` rules block to `AGENTS.md` (imported by `CLAUDE.md`). Edit outside the fence, or
> set `memory.seedRules: false` in `sdlc-config.json` to disable.

Why this and not silence: the v9.97.0 strip removed *every-session* orientation noise; a first-insert-only
message fires ~once per repo, so it does not reintroduce that problem. But this write touches a **committed,
tracked** file that will surface in `git status` — silently editing a user's `CLAUDE.md`/`AGENTS.md` with no
word reads as "why did a plugin change my file?" One line naming what it wrote and how to opt out is the
courtesy that crossing that boundary earns. Signalled via a marker (e.g. `.ai/.wf-rules-seeded`) so "first
insert" is detected exactly once and never re-announced.

## Where it hooks

[`session-start-orient.mjs`](../../hooks/session-start-orient.mjs) is the seam — it already resolves
`projectRoot`, loads config, and is rigorously fail-open. Add one call in `main()` beside the existing heals:

```js
const seeded = seedMemoryKernel(projectRoot, config);   // fail-open; false when disabled/already-present
// if `seeded` is a first-insert, emit the one-time systemMessage
```

New module `lib/memory-seed.mjs` owns all managed-block logic: fence detect / insert / version-replace for
`AGENTS.md`, ensure-import for `CLAUDE.md`, and the first-insert marker. It is pure fs + string surgery —
trivially unit-testable without a live session, which matters because the blast radius is a user's committed
file.

## Test surface (the blast radius demands it)

**AGENTS.md (canonical):**
- Absent file → creates it with only the fence.
- Existing user content, no fence → appends after a blank line; user bytes preserved.
- Fence at current version → **zero writes** (assert no fs write fired).
- Fence at v0 with user text on both sides → only the span between sentinels changes; neighbors intact.

**CLAUDE.md (pointer):**
- Absent file → creates it with the import fence.
- Existing content, no import → appends the import fence.
- Existing hand-written `@AGENTS.md` outside a code block → **no-op** (no duplicate import).
- `@AGENTS.md` mentioned only inside a fenced code block → still inserts (code-block mention isn't a real
  import).

**Cross-cutting:**
- Opt-out (`memory.seedRules: false`) → neither file touched, no marker written.
- fs error (simulated permission failure) → returns cleanly, orientation continues.
- First insert → marker written, notice signalled once; second session → marker present, silent.

## Open questions to ratify before build

1. **Creating `AGENTS.md` in a Claude-only repo.** Canonical-AGENTS.md means a repo with only `CLAUDE.md` gets
   a *new* `AGENTS.md`. Defensible — `AGENTS.md` is a broad cross-tool convention and seeding it is useful — but
   it is the plugin creating a file the user didn't. Alternative (Claude-only fallback: put the literal kernel
   in `CLAUDE.md` when no `AGENTS.md` exists and don't create one) reintroduces duplication logic. Leaning
   canonical-AGENTS.md for uniformity; flag for a conscious call.
2. **Import scope.** `@AGENTS.md` pulls *all* of `AGENTS.md` into Claude context. Accept (recommended — it's
   the agents-file's purpose) vs. a narrower structure that imports only the kernel span (not natively possible
   with `@` — would need a dedicated file and thus Codex duplication). Recommend accept.

## Release shape

`lib/memory-seed.mjs` + hook wiring + config schema line + unit tests, one release. Standard full bump: the
version-bump spots, `npm run build`, `npm run sync:codex`, both Codex manifests, gates green. `lib/` changed →
buildId moves → `sync:codex` is not optional.
