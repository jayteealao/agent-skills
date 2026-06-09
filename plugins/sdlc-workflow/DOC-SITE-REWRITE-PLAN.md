# Doc-site rewrite plan — the user-facing narrative pass

**Authored:** 2026-06-09 · **Plugin version:** `9.49.0`
**Scope:** `plugins/sdlc-workflow/docs/site/**` — a full editorial rewrite of every user-facing page.
**Relationship to the other two docs:**
- `DOC-SITE-PLAN.md` (2026-05-10) — the *original build* plan. Settled the IA (Diátaxis), the build (`_build_pages.py`), the visualizations. Still the structural reference.
- `DOC-SITE-DEVIATIONS.md` (2026-06-09) — the *accuracy* audit. Fixed 116 factual deviations (stale versions, command→skill terminology, wrong counts, schema renames). All four phases DONE.
- **This doc** — the *legibility / narrative* pass. Orthogonal to both. The site is now structurally sound and factually correct, but written from inside the system's model for a reader who already shares it. This plan rewrites the *voice and framing* so a stranger can understand it.

> **One-line problem statement:** every page is accurate and Diátaxis-pure, yet a first-time user reads the site and understands nothing — because the prose describes the *machine*, not the *user's job*, and uses ~12 private terms before defining any of them.

---

## Decisions (locked 2026-06-09)

The four open forks (§4.1, §8.4, §9, §10) are settled. Execution follows these, not the "recommended/optional" hedges left inline below.

| # | Decision | Choice |
|---|---|---|
| **D1 — Orientation pages** | Full vs merged | **Full: three real pages** — `orientation/is-this-for-me.html`, `orientation/mental-model.html`, `orientation/first-10-minutes.html` — plus the `index.html` funnel rewrite. None are folded into sections. |
| **D2 — Scope** | All phases vs subset | **All seven phases** (0–7), one committed sweep (~8–9 days). Not the 0–3 subset. |
| **D3 — Reference source files** | Touch vs HTML-only | **HTML-only.** Rewrite voice in `_build_pages.py` / hand-authored bodies only. `skills/*/reference/*.md` keep insider voice this pass (no migration-manifest entanglement). |
| **D4 — Legibility lint** | Gate vs warning | **Warning-first, then gate.** Ship the first-mention lint non-failing through Phases 1–6; tune the term list/window; promote to a hard CI gate in Phase 7. |
| **D5 — Rewrite depth** | Opening vs full body | **Full prose rewrite of every page**, bodies included — reference and schema pages too. Promotes every `OPEN`/`TRIM`/`LIGHT` in §5 to `REWRITE`. **Hard guardrail (see §8.4):** voice may change; **facts may not** — every reference/schema page is re-verified field-by-field against its source-of-truth file after rewrite. Reference pages stay information-dense and scannable (clearer prose, not chatty narrative); Diátaxis reference discipline is relaxed on *warmth*, not on *completeness or order*. |

---

## 0. The diagnosis this plan acts on (recap)

A first-time user — a developer who installed the plugin, does not know its internals, does not know Diátaxis, just wants to get work done — bounces off the site for these reasons (each is a symptom of one root cause: *written from inside the system's conceptual model, for a reader who already shares it*):

1. **Jargon before definition.** `index.html`'s first sentence uses *stage*, *artifact*, *spike* as if known; the body adds *slug, slice, shape, handoff, augmentation, router, readiness gate, orchestrator discipline, fragment / rich tier, hub, sunflower view*. The glossary exists but is the **last** Reference item and is never linked on first use.
2. **System-framing, not job-framing.** Headings read *"Shape is the deepest interview stage," "Review is a dispatch orchestrator,"* not *"I want to add a feature," "there's a bug."* The one job-framed section on the whole site — the "By scenario" list in `how-to/start-workflow.html` — is the most usable thing on it, and it's buried.
3. **The pipeline is never earned.** "Every change flows through 10 stages, each producing an artifact" is presented as a given. The honest user reaction — *"that's a lot of ceremony for a one-line fix; why not just ask Claude?"* — is never answered. The "why this exists" callout gives the *author's* motivation (AI forgets), not the *user's* payoff.
4. **The front door is six equal doors + a changelog wall.** Six equal-weight tiles at the moment the reader has the least context, then "What's new" (15+ maintainer-grade version entries) as the largest landing-page section. Signal ratio inverted.
5. **A taxonomy thicket.** ~10 category words for things-you-invoke (*stage, augmentation, flow, sub-command, router, skill, primitive, dimension, sweep, mode*) and no page that says "there are really only six things you ever type."
6. **Placeholder/fiction examples.** "a fictional server," `<feature description>`, `<slug>`; files introduced by internal naming with no model of why. No single vivid real run with real output.

**Diátaxis amplifies all of this for the disoriented reader.** Its four quadrants assume you already know whether you need to learn / do / look up / understand. A user who "understands nothing" cannot self-route, so the site's primary navigation is unusable for exactly the person who most needs help. The fix is an **orientation layer in front of the quadrants** plus a **voice rewrite across them** — not a replacement of Diátaxis.

---

## 1. Goals & non-goals

### 1.1 Goals

1. **A cold reader gets oriented in 5 minutes.** Someone who has never seen the plugin can, after the landing page + one orientation page, state in their own words: what it is, whether it's for them, the six things they type, and what their next click is.
2. **Every page leads with the user's job.** The first paragraph of every page answers "what do *you* want, and does this page serve it?" before any internal noun appears.
3. **No undefined private term.** Every plugin-specific term is grounded in plain language on first use on each page, and linked to the glossary.
4. **The pipeline is earned, not assumed.** A plain "with vs. without / here's the pain removed" passage precedes any 10-stage diagram.
5. **One front door, one obvious first action.** The landing page funnels, it doesn't fan out.
6. **The "when do I use which command (and sub-command)?" question has one home.** The scenario format generalized into a usage map that reaches sub-command depth.
7. **Voice is for a learner, not a peer.** Elegant peer-to-peer sentences ("sibling on the runtime axis") are unpacked or cut.

### 1.2 Non-goals

- **Not a re-architecture.** Diátaxis stays. Most pages are rewritten *in place*; the structural change is additive (an orientation layer) plus relocating the changelog.
- **Not a developer/internals guide.** Per the user, this pass is *user-facing only*. The README's "what's NOT in the site" exclusion of contributor docs stands. (A developer guide is a separate, later decision.)
- **Not an accuracy re-audit.** Facts were reconciled in `DOC-SITE-DEVIATIONS.md` today. We preserve that accuracy; we don't re-derive it. (Caveat — §8.4: where a rewrite changes a claim, re-verify against the named source-of-truth file.)
- **Not a marketing site.** No testimonials, no IDE screenshots. (Original non-goal, retained.)
- **Not a search/versioned-docs project.** Out of scope (original open questions 1–2).

---

## 2. The editorial contract — guiding principles (THE CORE)

The problem is voice, so the plan's center of gravity is a small set of **testable** writing rules. Every rewritten page must pass all of them. These become the rubric for the cold-read review in Phase 7.

| # | Rule | Test (binary, checkable) |
|---|---|---|
| **P1** | **Job before machine.** The first 1–2 sentences of every page state the reader's goal in their own words. Internal nouns appear only after. | Read sentence 1. Is the subject the *user's intent* or the *plugin's anatomy*? Anatomy = fail. |
| **P2** | **Define on first use.** Each plugin-specific term is grounded in a plain phrase the first time it appears on a page, and linked to the glossary. | Grep each page for the controlled-vocabulary terms (§3). First occurrence must be within N words of a plain-language gloss or a glossary link. |
| **P3** | **Plain-stranger gate.** No sentence requires a concept introduced later or assumed from outside. | "Could a developer who installed the plugin 10 minutes ago parse this sentence?" Any "no" = rewrite. |
| **P4** | **Earn the abstraction.** Any heavy concept (the 10-stage pipeline, artifacts, augmentations) is preceded by the concrete pain it removes. | Before the first pipeline diagram on a page, is there a with/without or pain→relief sentence? No = fail. |
| **P5** | **One real example, real output.** Tutorials/how-tos use one concrete, relatable scenario with real commands and shown output. `<placeholders>` only in Reference, where the placeholder *is* the subject. | Count `<...>` placeholders and the word "fictional" in tutorial/how-to bodies. Target: 0. |
| **P6** | **The small tree.** Where commands are introduced, anchor on "six things you type" first; every other category word is framed as a branch under one of the six. | Does the page name a category word (flow/augmentation/dimension/…) without first tying it to one of the six routers? Yes = fail. |
| **P7** | **Progressive disclosure.** Plain layer first; depth is reachable but never front-loaded. Maintainer-grade detail (frontmatter keys, exit codes, hashes) lives below the fold or in Reference. | Does the landing/orientation/tutorial content surface implementation detail (`disable-model-invocation`, `REGISTRY_VERSION`, exit 2) above the first task? Yes = fail. |
| **P8** | **Learner's register.** Short sentences. One idea per sentence. No "sibling-on-the-axis" compression that assumes both poles are held. | Flag sentences that define one unknown in terms of another unknown. |
| **P9** | **Every page answers "where next."** Each page ends with the 1–3 most likely next moves *for the reader's journey* (not just nearest Diátaxis siblings). | Does the closing block phrase links as reader-intents ("Now actually run one →") rather than bare titles? |

> **Why a rubric and not just "write better":** the accuracy audit worked because it was checkable (`Doc says → Actual`). Legibility fails silently unless it's also checkable. P1–P9 turn "a stranger should understand this" into pass/fail gates a reviewer (human or a cold-context Claude) can apply page by page.

---

## 3. Controlled vocabulary

The taxonomy thicket (diagnosis #5) is fixed by choosing **one canonical user-facing word per concept** and retiring synonyms from prose (Reference may still note the precise internal term once, in a "the precise name is…" aside). This table is the authority; the glossary is generated to match it.

| Concept | Canonical user-facing term | Retire / down-rank in prose | Plain-language gloss (the define-on-first-use phrase) |
|---|---|---|---|
| The six invocables | **command** (you type `/wf`, `/wf-quick`, …) | "skill router", "router" (keep "skill" for the *Reference* mechanics page only) | "the six things you type — `/wf`, `/wf-quick`, `/wf-meta`, `/wf-design`, `/wf-docs`, `/review`" |
| A step of `/wf` | **stage** | "primitive" (reserve for docs primitives only) | "one step of the full `/wf` lifecycle, like *plan* or *review*" |
| A `/wf-quick` mode | **quick command** | "compressed flow", "flow" | "a shortcut command for small changes — fewer steps than the full lifecycle" |
| A `/wf-meta`/`/wf-design`/`/review` option | **sub-command** | "mode", "operator", "dimension", "sweep" (define each once where it lives) | "an option under a command, e.g. `/wf-design colorize`" |
| The files each stage writes | **artifact** (a "workflow note") | — | "a small markdown file the plugin writes next to your code that records what it decided and why" |
| The work's stable name | **slug** | — | "the short, stable name for one piece of work, like `add-health-endpoint`" |
| A thin deliverable unit | **slice** | — | "a thin, independently shippable piece of the work" |
| instrument/experiment/benchmark/profile | **add-on** (or keep "augmentation" *with* gloss) | unglossed "augmentation" | "an optional extra pass — performance, observability, A/B — bolted onto a slice" |
| The local HTML viewer | **the dashboard** (sunflower) | unglossed "sunflower view", "hub", "serve daemon" | "a local web page that shows your workflows at a glance" |
| handoff→ship contract | **the readiness check** | unglossed "readiness gate/verdict" | "the check that must say *ready* before the plugin will ship" |

**Rule:** any term in column 1 used in user-facing prose (tutorials, how-to, explanation, tips, landing, orientation) must, on first use per page, carry the column-4 gloss or a glossary link. Reference pages may use the precise internal term but still link the glossary on first mention.

---

## 4. Information architecture changes

Minimal, additive. The four quadrants stay; we add an **Orientation** spine in front of them and relocate the changelog.

### 4.1 New top-of-nav section: "Orientation" (the spine — meant to be read in order)

| Page | Status | Job it does |
|---|---|---|
| `index.html` | **rewrite** (hand-authored body) | One plain sentence: what it is + who it's for. **One** primary call-to-action ("Start the 5-minute tour →"). A 3-bullet "is this for you?" Demote everything else. |
| `orientation/is-this-for-me.html` | **NEW** | The problem in *user* terms; with-vs-without; honest "when NOT to use it / when it's overkill." Earns the whole product before any mechanics. (Absorbs the *plain* half of `why-this-exists`.) |
| `orientation/mental-model.html` | **NEW** | The single "how it all fits" page. The concept map (command → writes artifacts → dashboard renders them; ship-plan governs ship). The **six things you type**. The "earn the pipeline" passage. This is the page whose absence the whole site currently feels. |
| `orientation/first-10-minutes.html` | **NEW** *(or promote `quick-fix-workflow`)* | The fastest real win: one concrete change, start to PR, in ten minutes, real output shown. Lower commitment than the full `first-workflow` tutorial. |

> **Locked (D1):** all three orientation pages are real, standalone pages — not sections. `mental-model.html` and the `index.html` funnel are the disorientation fix; `is-this-for-me.html` and `first-10-minutes.html` get the room to do their jobs without crowding the first two.

### 4.2 New how-to: the usage map

| Page | Status | Job |
|---|---|---|
| `how-to/choose-a-command.html` | **NEW** | The diagnosis-#2 fix generalized: the "By scenario" format extended **down to sub-command depth**. "I want to recolor a design → `/wf-design colorize`; tighten it → `polish`; which review dimension for my change? → …". The single home for the "where" question. `start-workflow.html` becomes the top of this; this page goes deeper. |

### 4.3 Relocate the changelog off the landing page

| Page | Status | Job |
|---|---|---|
| `whats-new.html` (or `reference/changelog.html`) | **NEW (move)** | "What's new" leaves `index.html` and lives here, rewritten as *user-readable* highlights (P7/P8), linking the real `CHANGELOG.md` for depth. |

### 4.4 Glossary moves up

`reference/glossary.html` is promoted to the **top** of the Reference group (or surfaced from Orientation) and is the link target for every define-on-first-use. Rewrite each entry to the column-4 gloss style (plain first, precise second).

### 4.5 Net page-count change

+5 to +6 pages (3 orientation + 1 usage map + 1 changelog, optionally split). All additions go through `SIDEBAR` so pagers/verify stay consistent (§8). No deletions; `why-this-exists` is kept but trimmed (its plain half moves to `is-this-for-me`).

---

## 5. Per-page disposition

Action codes: **REWRITE** = full voice+framing rewrite; **OPEN** = rewrite the opening/framing + define-on-first-use, keep the exhaustive body; **NEW**; **MOVE**; **TRIM** = cut/relocate maintainer detail; **LIGHT** = pager/nav/term touch-ups only.

> **D5 supersedes the action codes below.** Every `OPEN`, `TRIM`, and `LIGHT` in this section is promoted to a full-body **REWRITE**. The original codes are retained as a record of *how much each page's body needs* (a `LIGHT` page is a fast rewrite; an `OPEN` reference page needs its facts re-verified, not just rephrased), and as the fallback map if D5 is ever scaled back. Read every code below as "REWRITE, with this much body work."

### Landing / Orientation
| Page | Action | Target framing |
|---|---|---|
| `index.html` | REWRITE (hand body) | Plain what+who; one CTA; demote tiles to a small "other doors" list; remove "What's new" (→ §4.3). |
| `orientation/is-this-for-me.html` | NEW | With/without; when-not-to; the payoff in the user's week. |
| `orientation/mental-model.html` | NEW | Concept map + six-things + earn-the-pipeline. |
| `orientation/first-10-minutes.html` | NEW/MOVE | Fast real win (may fold `quick-fix-workflow`). |

### Tutorials (learn-by-doing → P5 real example)
| Page | Action | Target framing |
|---|---|---|
| `tutorials/installation.html` (hand body) | OPEN | Job: "get it working and prove it." Replace stale-feeling hook descriptions with current behavior; bump version floor; no `validate-workflow-write.sh`-era prose. |
| `tutorials/first-workflow.html` (hand body) | REWRITE | Keep the strong skeleton; rewrite headings job-first ("Stage 7 — Review" → "Stage 7 — Catch problems before a human does"); gloss every artifact filename on first use; add the "why this beats just-ask-Claude" callout once. |
| `tutorials/quick-fix-workflow.html` | REWRITE/MERGE | Possibly becomes `first-10-minutes`. Real one-file fix, real diff shown. |

### How-to (task-first)
| Page | Action | Target framing |
|---|---|---|
| `how-to/start-workflow.html` | REWRITE | Lead with the scenario list (currently buried); decision tree second. Becomes the top of the usage map. |
| `how-to/choose-a-command.html` | NEW | Sub-command-depth usage map (§4.2). |
| `how-to/navigate-workflows.html` | OPEN | "Find / resume / what's next / repair" as user verbs; full `/wf-meta` cheat-sheet. |
| `how-to/amend-or-extend.html` | OPEN | "The spec was wrong" vs "new scope appeared" — user situations first. |
| `how-to/use-augmentations.html` | REWRITE | Rename concept per §3 ("add-ons"); lead with "I want to measure/flag/benchmark X." |
| `how-to/use-design.html` | OPEN | "Add design to a change" — three modes as three user situations. |
| `how-to/triage-pr-comments.html` | OPEN | "A bot/human left comments — now what." Keep the T5.x detail below the fold. |
| `how-to/author-ship-plan.html` | OPEN | "Set up how this repo releases, once." A–K explained as plain release concerns. |
| `how-to/run-a-release.html` | OPEN | "Actually ship it." The 13 steps as reassurance, not a wall. |
| `how-to/resume-paused-work.html` | OPEN | "I walked away / a ship stalled — pick it back up." |
| `how-to/close-workflows.html` | OPEN | "I'm done (shipped/abandoned/…) — close cleanly." |

### Reference (OPEN by default — exhaustive body stays; opening + first-use gloss rewritten)
| Page | Action | Notes |
|---|---|---|
| `reference/pipeline.html` | OPEN | Add a one-line "read this if you want the full contract" framing. |
| `reference/commands.html` | OPEN | Open with the six-things anchor (P6) before the per-router tables. |
| `reference/wf.html` `wf-quick.html` `wf-meta.html` `wf-design.html` `wf-docs.html` `review.html` | OPEN ×6 | Each opens with "you reach for this when…" then the exhaustive table. `wf-design`/`review` get a short "which sub-command/dimension when" intro (links the usage map). |
| `reference/skills.html` | OPEN | Keep router/support split; move `disable-model-invocation` detail below the fold (P7). |
| `reference/artifacts.html` `types.html`(hand) `00-index-schema.html` `08-handoff-schema.html` `09-ship-run-schema.html` `ship-plan-schema.html` | OPEN | One-line "this page is for when you need the exact format"; gloss terms once; bodies unchanged. |
| `reference/hooks.html` `serve.html`(hand) `tray.html` | OPEN | Lead with "what this does for you" before config keys/timeouts. |
| `reference/glossary.html` | REWRITE + MOVE | Promote to top of Reference; rewrite every entry plain-first (§3/§4.4). |

### Explanation (now *supports* the mental-model page; rewrite openings, trim front-loaded detail)
| Page | Action | Notes |
|---|---|---|
| `explanation/why-this-exists.html` | TRIM | Plain half → `is-this-for-me`; keep the deeper "AI-memory" argument here, linked from orientation. |
| `explanation/artifacts-over-memory.html` `orchestrator-discipline.html` `adaptive-routing.html` `augmentations-model.html` `branch-strategy.html` `idempotency-in-ship.html` `the-readiness-gate.html` `diataxis-integration.html` `build-and-dist.html` | OPEN ×9 | Each opens "you don't need this to use the plugin, but if you want to understand *why X*…"; one unknown per sentence (P8). |

### Tips
| Page | Action | Notes |
|---|---|---|
| `tips/escape-hatches.html` `anti-patterns.html` `tricks.html` `faq.html` | OPEN ×4 | `faq.html` reframed as real first-timer questions ("Why does ship refuse to start?"). Keep sharp/opinionated voice — this quadrant is allowed to assume more. |

### Changelog
| Page | Action | Notes |
|---|---|---|
| `whats-new.html` | NEW/MOVE | §4.3. |

**Tally (under D5):** every page is a full-body **REWRITE** — ~6 NEW/MOVE + ~42 existing pages reworded top to bottom. The original codes (~6 REWRITE, ~30 OPEN, a few TRIM/LIGHT) now read as *body-effort tiers* within a uniform rewrite, and as a per-page accuracy-risk signal: the ~24 reference/schema/explanation pages carry the most facts, so they get the mandatory source re-verify (§8.4) that the narrative pages don't need as heavily.

---

## 6. The reusable page pattern

Every rewritten page follows one skeleton so the voice is consistent and P1/P2/P9 are structurally guaranteed:

```
[breadcrumb] [quadrant badge]
<h1> — job-phrased where the quadrant allows (Reference keeps noun titles)

<p class="lede">  ← P1: the reader's goal in their words, 1–2 sentences, zero undefined nouns.

[how-to/tutorial only] <div class="summary"> Pre-conditions · Goal · You'll produce </div>

<body>
  - first use of any §3 term → glossed inline or linked to glossary (P2)
  - heavy concept → preceded by pain→relief sentence (P4)
  - maintainer detail → below the fold or a <details>/"the precise mechanics" aside (P7)

<div class="related">  ← P9: 1–3 next moves phrased as reader intents, not bare titles
```

A new CSS class `.lede` (one rule in `style.css`) marks the mandatory job-first opening so reviewers and a lint can find it. The summary/related blocks already exist.

---

## 7. Validation & acceptance criteria

Legibility must be measured, not asserted (mirrors the audit's measure-twice culture).

1. **Cold-read test (primary gate).** Hand the built site to a fresh-context reader (a teammate, or a Claude session given *only* the rendered HTML and no repo access) and ask the **orientation questions**:
   - In one sentence, what does this plugin do and who is it for?
   - What are the (at most) six things you type?
   - You have a one-line typo to fix — which command, and why not the others?
   - What does the plugin actually *give* you that just asking Claude doesn't?
   - What's your next click from the landing page?
   A page set passes only when a cold reader answers all five correctly from the Orientation spine + `start-workflow`.
2. **First-mention lint (automatable).** Extend `verify-doc-site.mjs` (or a sibling `verify-doc-legibility.mjs`) with a check: for each controlled-vocab term (§3), its first occurrence in a user-facing page must be within K characters of a glossary `href` or a known gloss phrase. Fails CI like the version/pager checks. *(This is the durable de-rot guard for legibility, analogous to L5 in the deviations doc.)*
3. **Jargon-density spot metric.** For landing + orientation + each tutorial's first screen, count undefined §3 terms per 100 words; target ≤ 1. Tracked per phase.
4. **Placeholder count.** `<...>` placeholders and "fictional" in tutorial/how-to bodies → 0 (P5).
5. **Existing gates stay green.** `npm run verify` (router migration + doc-site version/pager) and `npm test` must pass after every regeneration. `npm run verify:docs` specifically for the doc-site invariants.

---

## 8. Build & execution mechanics (do not skip)

### 8.1 Everything goes through `_build_pages.py`
Edit the `PAGES` literal (or `SIDEBAR`) in `_build_pages.py`, then `cd plugins/sdlc-workflow/docs/site && python3 _build_pages.py`. **Never hand-edit generated `.html`** — the next regen clobbers it. (README + generator docstring.)

### 8.2 The five hand-authored bodies
`index.html`, `tutorials/installation.html`, `tutorials/first-workflow.html`, `reference/serve.html`, `reference/types.html` have hand-maintained bodies; the generator only patches their sidebar. Rewrites to these are direct edits to the `.html`, but their **sidebar and pager must still match** what the generator produces from `SIDEBAR`. After editing `SIDEBAR`, re-run the generator so it re-patches their sidebars, then hand-thread their pagers to nav order.

### 8.3 Adding/moving pages without breaking CI
1. Add the new page's body to `PAGES` and its nav entry to `SIDEBAR` (with the `{base}`/`{active}` placeholders).
2. Re-run `python3 _build_pages.py` — it regenerates `nav.html` and **auto-derives every generated page's Prev/Next from `SIDEBAR` order**, so pagers stay consistent for generated pages.
3. For the 5 hand-authored pages, hand-update their pager `prev`/`next` to the new nav order.
4. Run `npm run verify:docs` — it fails if any brand ≠ `plugin.json` or any pager ≠ `nav.html` order (the two invariants in `scripts/verify-doc-site.mjs`).

### 8.4 The source-of-truth caveat (important)
The reference files `skills/*/reference/*.md` are the declared *input* to the docs, and **they are themselves written in the insider voice.** Two consequences:
- **Do not regenerate content from them blindly.** A naive `/wf-docs` regeneration would re-import the system-framing this plan is removing. The voice rewrite is an **editorial layer on top of**, not a re-derivation from, the reference files.
- **But preserve accuracy — now mandatory per page (D5).** A full-body rewrite of a reference/schema page can silently *drop a field, arg, or enum value* far more easily than an opening-only pass. So every reference/schema/pipeline page rewrite ends with a field-by-field diff against its named source-of-truth file (`skills/*/reference/*.md`, `schemas/*.json`, `lib/registry.mjs`, `router-metadata.json`, `hooks/hooks.json`). The `DOC-SITE-DEVIATIONS.md` evidence citations are the map; the rewrite must not re-open any `D-NN` that audit just closed. This is the single biggest risk D5 introduces — treat the re-verify as part of "done," not optional cleanup.
- **Optional second front:** if the goal is durable, give `skills/*/reference/*.md` their own lighter voice pass later — but note that editing those files invalidates the router migration-manifest `bodyHash` (the `verify-router-migration` gate) and must be re-migrated. Out of scope for this pass; flagged so it's a conscious decision.

### 8.5 Version stamping
No hardcoded versions in bodies (Phase 1/L1 already enforced). The `serve.html` health example uses a version-neutral placeholder. New pages inherit the brand automatically. After any plugin bump, re-run the generator.

---

## 9. Phasing

Seven phases, each independently shippable and each leaving the site better than it found it. Order is by leverage: orientation first (it fixes the most disorientation per page).

**Phase 0 — Ratify the contract (½ day).**
Lock §2 (P1–P9), §3 (controlled vocabulary), and the §4 IA decisions (which orientation pages are real pages vs sections). Write the `.lede` CSS rule. Decide the §7 lint's exact term list. *Exit:* this doc's §2–§4 are agreed and frozen; no page is rewritten before the rubric exists, or the rewrite re-rots.

**Phase 1 — The orientation spine + landing funnel (1–1.5 days). HIGHEST LEVERAGE.**
Rewrite `index.html` (one CTA, demote tiles, remove "What's new"); create `orientation/mental-model.html` (concept map + six-things + earn-the-pipeline) and `orientation/is-this-for-me.html`; create `whats-new.html` and move the changelog there; promote + rewrite `glossary.html`. Wire all into `SIDEBAR`; regenerate; re-thread the hand pages; `verify:docs` green. *Exit:* a cold reader passes §7.1 questions 1, 2, 4, 5 from these pages alone.

**Phase 2 — Tutorials + the fast win (1 day).**
Rewrite `first-workflow.html` (job-first headings, glossed artifacts, earn-the-pipeline callout); build `first-10-minutes.html` (real one-file change, real output); OPEN `installation.html`. *Exit:* §7.4 placeholder count = 0 in tutorials; the fast-win path is followable cold.

**Phase 3 — How-to + the usage map (1.5 days).**
Rewrite `start-workflow.html` (scenarios first); create `choose-a-command.html` (sub-command-depth map); OPEN the remaining 8 how-tos. *Exit:* §7.1 question 3 ("which command for a typo, and why not the others") answerable; every how-to opens job-first.

**Phase 4 — Reference openings + first-use gloss (1.5–2 days).**
OPEN all ~19 reference pages: job-first lede, six-things anchor on `commands.html`, "which sub-command when" intros on `wf-design`/`review`, demote maintainer detail. Bodies unchanged. *Exit:* §7.2 first-mention lint passes on Reference.

**Phase 5 — Explanation rewrite-openings (1 day).**
TRIM `why-this-exists`; OPEN the other 9 with "you don't need this to use it, but if you want to understand *why X*…" and one-unknown-per-sentence. *Exit:* P8 holds on explanation pages.

**Phase 6 — Tips/FAQ (½ day).**
OPEN the 4 tips pages; reframe `faq.html` around real first-timer questions. *Exit:* FAQ answers the §7.1 questions a confused user actually asks.

**Phase 7 — Cross-link, lint, cold-read, de-rot guard (1 day).**
Re-thread all `.related` blocks as reader-intents (P9); land the §7.2 legibility lint in CI; run the full §7.1 cold-read test (ideally a fresh Claude session given only the rendered site); fix what it surfaces; final `npm run verify` + `npm test`. *Exit:* cold-read passes all five; both CI gates green; lint wired.

**Total (under D5):** ~12–15 working days of focused editorial work — the full-body rewrites of the ~24 reference/explanation pages (each with a source re-verify) roughly double the Phase 4–5 estimates versus the original opening-only plan. Front-loaded value is unchanged: Phases 0–1 (~2 days) still resolve the core "I understand nothing" complaint; the added days land in Phases 4–5. This is the point where running the sweep as a **workflow** (one agent per page, rubric-applied, with a verifier stage) pays for itself — see §10 risk #3 and the execution note.

---

## 10. Risks & open decisions

| # | Risk / decision | Recommendation |
|---|---|---|
| 1 | **Diátaxis purists will object to the Orientation spine** (it's "explanation that also onboards"). | Accept it. The orientation layer is *additive* and clearly labeled; the four quadrants keep their purity. Diátaxis itself acknowledges a landing/overview layer. |
| 2 | **Scope creep into the reference source files** (§8.4). | Keep this pass HTML-only. Treat `skills/*/reference/*.md` voice as a separate, later, manifest-aware effort. |
| 3 | **Regeneration vs `/wf-docs` dogfooding.** The deviations doc recommended driving via `/wf-docs`; that's right for *accuracy* but wrong for *voice* (it re-imports insider framing). | Hand-author the voice via `PAGES`. Optionally use `/wf-docs --audit-only` afterward to confirm no accuracy regressed. |
| 4 | **Page-count growth** (+6) raises maintenance. | **Resolved (D1): accepted** — three full orientation pages. Maintenance offset by the §7.2 lint + the generator carrying nav/pagers automatically. |
| 5 | **"Rewrite everything" vs high-traffic subset.** | **Resolved (D2): rewrite everything** — all seven phases in one committed sweep. The subset fallback is not taken. |
| 6 | **The legibility lint could be noisy** (false positives on legitimate term use). | Start it as a warning (non-failing) for one phase, tune the term list and window, then promote to a hard gate in Phase 7. |
| 7 | **Hand-authored pages drift from generated voice.** | The 5 hand pages get the same `.lede`/`.related` pattern; the cold-read test covers them; consider folding more of them into the generator over time. |
| 8 | **Accuracy regression from full-body rewrites (D5).** Rewording a schema/reference body can silently drop a field/arg/enum the audit just fixed. | The §8.4 per-page source re-verify is mandatory and part of "done." Keep `DOC-SITE-DEVIATIONS.md` open while rewriting reference pages; after each, confirm no `D-NN` reopened. Run `npm run verify` + `npm test` per phase, not just at the end. |

---

## 11. What "done" looks like

- A stranger opens `index.html`, clicks one button, reads `mental-model.html`, and can explain the plugin and name the six commands.
- Every page's first screen is about *their* job; every private term is glossed on first use; the glossary is one click from anywhere.
- The pipeline is earned before it's diagrammed; the changelog no longer greets newcomers.
- "Which command (and sub-command) do I use?" has one authoritative, scenario-shaped home.
- Both existing CI gates stay green, and a new legibility lint keeps the voice from re-rotting — the same way the version/pager guards keep accuracy from re-rotting.

---

*Plan authored 2026-06-09. Execution not started. This is the legibility counterpart to `DOC-SITE-DEVIATIONS.md`; land §7.2's lint in the same spirit as that doc's L1/L5 guards or the voice re-rots at the next feature.*
