# Status — Advise Mode (`/wf status advise [branch|pr#N | fast]`)

Load this file from `status.md` when Step 0 set advise-mode. It holds the cross-slug sequencing procedure (Steps A1–A5) and the Portfolio Advice render.

Advise answers the question the dashboard **cannot**: given every open workflow, *what should I do
next, in what order, and what should I stop doing.* It is the portfolio-level counterpart to `/wf
status <slug>`'s `## Next` — that routes one slug; advise routes the whole set. It is **read-only and
route-don't-act**: it recommends commands (including `/wf close`), never runs them, and never advances
a workflow. Its **only** write is the Step -1 registry reconcile shared by every mode — advise writes
no artifact of its own (see the render note at the end for why it stays ephemeral).

**Scope:**
- `/wf status advise` — every non-terminal workflow in the registry.
- `/wf status advise <branch|pr#N>` — only the slugs on that branch (the sequencing view of roster mode).
- `/wf status advise fast` — Tier-0 only (frontmatter; no artifact or code reads) — the quick sort
  when you don't need the semantic-dependency analysis.

The core is a **constrained sort**: HARD constraints fix the order, SOFT priorities rank within them,
and a WIP pass surfaces what to stop. Run the steps in order.

## Step A1 — Gather the portfolio (Tier 0, always)

From the just-reconciled `INDEX.md` and each `00-index.md`, collect per slug: `status`,
`current-stage`/`stage-number`, `branch`, `updated-at` (+ staleness, >7d), `open-questions`,
`progress` (slices-implemented/total), `runtime-evidence-deferrals`, probe compressed-slices with
`findings-count > 0`, and `intent-risks`. This is the same read the dashboard already does — no new
cost. Drop terminal slugs (`shipped`/`closed`/`abandoned`) **unless** one still carries open
carried-risk (an unresolved deferral, probe finding, or intent-risk), in which case keep it in the
carried-risk section only.

If advise-scope narrowed to a branch/`pr#N`, restrict the set to that branch's roster (resolve `pr#N`
via `gh pr view <N> --json headRefName -q .headRefName`, then filter the `branch` column).

## Step A2 — Build the constraint graph (Tier 1, skipped under `fast`)

For each non-terminal slug, read its `02-shape.md` and its **current** `04-plan-*.md` (latest by stage
number) to extract two things:
- **Stated dependencies** — "assumes X", "after Y ships", "needs the Z schema/module/endpoint" → a
  directed edge `producer → consumer` whenever *another* slug in the set produces that X/Y/Z.
- **Scope footprint** — the modules/paths/features it touches (the plan's files-to-change list + the
  shape's scope). Two slugs whose footprints intersect are **collision candidates**.

When many slugs are open, fan out one lightweight sub-agent per slug to return a compact
`{slug, dependencies[], footprint[]}` record; read inline when few. Assemble the edges into a
dependency graph (a cycle among edges is itself a finding — surface it as a "these N slugs are
mutually entangled; split or sequence deliberately" decision).

## Step A3 — Seek code truth when an edge is uncertain (Tier 2, on demand)

When A2 **suspects** an edge but the artifacts don't settle it — two footprints overlapping on the same
module, or a "needs X" with no obvious producer — **go to the codebase** and confirm or refute,
reusing Deep Mode's code-reality technique **scoped to the one question** (never a full-tree audit):
- **File existence + ownership** — list the paths both plans name; does the shared module already
  exist, and which branch last touched it (`git log -1 --format="%ai %an" -- <path>`)?
- **Symbol reality** — search for the symbol/export one slug "needs" and another "provides": already
  present → *no* edge (the dependency is already satisfied); absent → a *real* producer→consumer edge.
- **Branch divergence** — for two slugs sharing a branch, `git diff --name-only <base>...<branch>`
  to check whether their footprints actually collide in tracked changes (or only in plan intent).

Keep every probe bounded to the specific files/symbols the suspected edge turns on. If a probe instead
reveals **broad** drift (the world moved under a mid-flight slug), don't chase it here — record it and
recommend `/wf status <slug> deep`, which is the full drift audit. Attach each code-truth result to the
edge it settled so the sequencing note can cite it as evidence.

## Step A4 — Rank, serialize, and run the WIP pass

1. **Ready set** — non-terminal, not blocked (`status` ≠ `awaiting-input` AND no `open-questions`),
   and every dependency predecessor already satisfied (shipped, or ranked ahead this run).
2. **Rank the ready set** by descending weight: (a) steer.md priority (Step A5); (b) proximity to done
   (higher `stage-number` — closest to shippable value); (c) carried-risk paid-down soonest; (d) decay
   (staler first, within the same tier — resume before it rots); (e) least effort remaining (`progress`).
3. **Serialize** same-branch, footprint-colliding slugs: name which must precede which and *why*
   (from A2/A3). Independent slugs (disjoint footprints) are flagged as safe-to-parallelize.
4. **WIP pass** — the half users forget: flag every stale (>7d) slug that **nothing depends on** as a
   CLOSE-OR-COMMIT decision; and if the active in-flight count is high, name the few to focus and the
   rest to park. Advise is an anti-sprawl tool, not only a sequencer.

## Step A5 — Honor steering (steer.md)

If `steer.md` exists (per [_steering.md](../_steering.md)), read it as the priority overlay across **all**
slugs, not just one. When steering elevates a slug above where proximity/decay would place it, rank it
there **and state the tradeoff out loud** ("ranked #1 per your steering, though `<other>` is closer to
done"). Steering never overrides a HARD dependency — you cannot do B before its predecessor A no matter
the stated priority; if steering implies that, say so and keep the dependency order.

## Render (chat only — advise writes no artifact)

Lead with the single highest-leverage move, then the ranked plan, the blocked set, the decisions, and
the carried risk. **Every row carries a one-line rationale** so the ranking is auditable, and each
names a concrete next command that chains into the drivers (`/wf auto <slug>`, or `/wf yolo <slug>`
for autonomous where the host offers it — [_host-invocation.md](../_host-invocation.md)).

```
## Portfolio Advice — <N> open · <A> active · <B> blocked · <S> stale     (<date> · scope: <all | branch <b>>)

▶ If you do one thing: `<top-ranked next command>` — <one-line why>.

### Do next (ready, ranked)
| # | Next command | Stage | Why now |
|---|---|---|---|
| 1 | `/wf ship <slug>` | review | 0 blockers, ships in one step · 4d stale → land before it drifts |
| 2 | `/wf implement <slug> reviews` | implement | one fix-loop from done · 2 review blockers |

### Blocked — unblock first
| Slug | Blocker | Since | Unblock |
|---|---|---|---|
| <slug> | awaiting-input: "<question>" | <Nd> | answer it, then <next stage> |

### Decisions for you (advise won't make these silently)
- <slug> — <Nd> stale at <stage>, nothing depends on it → `/wf close <slug>` or `/wf <stage> <slug>`
- <slugA> + <slugB> share branch <b> and module <m> → serialize; <slugA> first (<why>)

### Carried risk
- <slug> — <N> open deferral(s) / probe-finding(s) / intent-risk(s) → clear before <stage>

### Sequencing notes (edges found)
- <slugA> before <slugB> — <slugB> needs <X> that <slugA> produces (confirmed: <code-truth evidence, if Tier-2>)
- safe to parallelize: <slugC>, <slugD> (disjoint footprints)
```

Advise is deliberately **ephemeral** — advice is about *now*, so it writes no report (a persisted plan
goes stale the moment you act on it, and re-running is cheap). For a durable per-slug drift record,
that is Deep Mode's `00-sync.md`, not this.
