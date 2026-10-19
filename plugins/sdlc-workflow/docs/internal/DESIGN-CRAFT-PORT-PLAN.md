# DESIGN-CRAFT-PORT-PLAN — current motion and robustness craft, for every platform

Status **BUILT W0–W7 on 2026-10-19 (section 12); the doc-site pages, the two rubrics and the release wait for a peer commit; W8 live runs open** · Date **2026-10-19** · Plugin **v9.190.0** · Owner **jayte**
Source: Emil Kowalski, `emilkowalski/skills`, commit `2d22863` (2026-10-11), MIT license.
Depends on: the design lane (archived/DESIGN-LANE-PLAN.md) and DESIGN-BOARDS-PLAN.md. Neither changes its rules here.

## 1. Why

The `animate` move and the motion rules around it came from an older form of Emil Kowalski's design-engineering skill. His current repository splits that skill into 15 skills with newer rules. A read on 2026-10-19 compared the current skills with HEAD `a1760611` and found three problems.

**Problem 1: our motion rules disagree with the source and with each other.**

| # | Our rule | Source rule now | Our other files |
|---|---|---|---|
| 1 | `ease-in` for exits (`design/animate.md:94`, `:97`, `:159`) | Entering or exiting uses `ease-out`. Never `ease-in` on UI. | `review/interface-craft.md:28` rates `ease-in` on UI as HIGH. |
| 2 | Reduced motion is a global `0.01ms !important` kill switch, under a "motion-first stance" (`animate.md:15-19`, `:187-200`) | Reduced motion is fewer and gentler motion, not zero. Keep opacity and color. Remove movement. | `design/harden.md:69` and `review/interface-craft.md:33` already say "gentler, not zero". |
| 3 | Stagger 100–150 ms, chunks about 100 ms apart (`animate.md:53`, `:157`) | 30–80 ms between items. A stagger never blocks interaction. | — |
| 4 | Three broad duration bands, for example 250–400 ms for a modal (`animate.md:86-88`) | One duration for each element. UI motion stays under 300 ms. | — |
| 5 | Hover scale 1.02–1.05 with no pointer gate (`animate.md:59`) | Hover motion only for a fine pointer that can hover. | Only `harden.md:72` has the gate. |
| 6 | An exit moves a small fixed distance upward (`animate.md:159`) | An element exits on the path it entered. | — |

`design/optimize.md:58` also says that `filter` and `clip-path` are paint-tier properties and need `will-change`. The source now puts `filter`, `clip-path` and `background-color` in the composite tier of current Chrome and Firefox. It adds a layer hint only after a visible shift.

**Problem 2: the workflow has no home for four jobs that the source does well.**

- **Restraint before motion.** `animate.md:34-48` lists opportunities and asks for a hero moment. It has no gate that rejects a candidate. The source skill `find-animation-opportunities` gates every candidate and lists the rejected ones.
- **Frame-budget diagnosis.** The source skill `animation-performance` names the cause before it changes code. Nothing in the workflow does that for motion.
- **Worst-case content.** The source skill `break-ui` loads a surface with the worst real data. No stage, move or rubric does that. `reference/shape.md:103` asks "what can go wrong" about bugs, not about content.
- **Divergent directions.** The design stage draws one board for each surface (`design/stage.md:40-48`). When the direction is open, the person sees one answer and cannot compare. The source skill `prototype` builds three directions on named axes.

**Problem 3: every motion rule is web-only.** The rules name CSS properties, media queries, Framer Motion props and React patterns. A workflow on an iOS, Android, React Native or desktop surface gets rules it cannot apply. The source has one separate skill for Expo. It has no single vocabulary that works on every platform.

## 2. PO decisions

| # | Decision | Date |
|---|---|---|
| D1 | Port the four agreed changes: `animate.md`, `optimize.md`, the `motion` section of `interface-craft.md`, and `frontend-performance` in `performance.md`. Port the four further items: worst-case content, native feel, divergent directions, gesture physics. | 2026-10-19 |
| D2 | **Every rule is generic and works beyond the web.** A rule names a concept, not a CSS property. | 2026-10-19 |
| D3 | **A pass runs through its move: `/wf design <slug> <move>`.** The motion opportunity sweep runs as `/wf design <slug> animate`. The worst-case pass runs as `/wf design <slug> harden`. No focus word is added to `audit` or `critique`. (Was Q1.) | 2026-10-19 |
| D4 | **A worst-case board is drawn when the person asks for it. Otherwise, each new surface in the slug that shows data gets one.** (Was Q2.) | 2026-10-19 |
| D5 | **The platform map covers the web, iOS, Android and desktop.** (Was Q3. On 2026-10-19 the PO first chose the web and Android, then kept iOS and desktop.) React Native is not a target. | 2026-10-19 |
| D6 | **The Android column covers Jetpack Compose only.** (Was Q4.) | 2026-10-19 |
| D7 | **Implement the plan in full**, W0 to W7. W8 is the person's live run. | 2026-10-19 |

Recommendations for the PO to confirm. Each one is the plan's default.

| # | Recommendation |
|---|---|
| R1 | **One platform map.** A new file `design/_platforms.md` maps each generic term to its form on each platform. Rules never name a platform API. Examples may show one platform and point to the map. |
| R2 | **No new command, no new move and no focus word.** The 15 moves and the 10 commands stay (D3). |
| R3 | **Keep the deliberate differences from the source:** `bounce: 0` in product UI (`_design-context.md:97`), the brand-register timings, and Jakub Krehel's icon values. |
| R4 | **Record the source commit** in the attribution of each ported file, so a later read can check for drift. |
| R5 | **Do not port** `pick-ui-library` (one person's library list), `ask-sonner` (one product), `write-swift` (not design), `animation-vocabulary` (a glossary for prompts), `animate-expo` (React Native is not a target, D5), or the Before/After review table of `emil-design-eng` (our rubrics write findings YAML). |

## 3. The generic vocabulary

Each rule uses these terms and only these terms (STE rule W1). The platform map gives each term its form on each platform.

| Term | Meaning |
|---|---|
| **cheap property** | A visual property that the renderer can change without new layout or new paint: offset, scale, rotation, opacity. |
| **paint property** | A property that redraws the element each frame but does not move other elements: color, shadow, corner radius. |
| **layout property** | A property that changes size or position in the layout, so other elements move: width, height, padding, margin, constraints. |
| **render thread** | The thread or process that composites frames. Motion that runs there stays smooth while the app is busy. |
| **app thread** | The thread that runs the app's code and its layout. Motion that runs there drops frames when the app is busy. |
| **frame budget** | The time for one frame: 16.7 ms at 60 Hz, 8.3 ms at 120 Hz. Design against 8.3 ms. |
| **retargetable animation** | An animation that starts again from its current value and velocity when its target changes. |
| **restarting animation** | An animation that jumps to its start value when it runs again. |
| **curve token** | A named easing curve stored as four cubic Bézier control points. |
| **spring** | A physical animation with a duration and a bounce. Bounce 0 has no overshoot. |
| **trigger origin** | The point that a scale or rotation grows from. |
| **entry without a mount flag** | A declared start state for an element that appears, with no extra state to start the animation. |
| **reduced-motion setting** | The operating-system or browser setting that asks for less motion. |
| **hover pointer** | A pointer that can hover without a press: a mouse, a trackpad or a hovering stylus. Touch is not a hover pointer. |
| **per-frame value** | A value that changes on every frame during a gesture or an animation. |
| **layer hint** | A request to the renderer to give an element its own layer before it animates. |
| **press feedback** | The visible, and where the platform has it, tactile, response to a press. |
| **feel check** | A check of motion at 2–5 times its duration, frame by frame, and on a real device. |

## 4. The platform map (`design/_platforms.md`)

The new file holds one table. Each row is a term from section 3. The columns are the web, iOS, Android with Jetpack Compose, and desktop (D5, D6). The table below shows the web and Compose columns; `design/_platforms.md` holds all four after W0. W0 checks every API name against current platform documentation before W1 writes it. The draft below is the starting point, not the checked result; section 12 lists the nine W0 corrections, and `design/_platforms.md` is the source.

| Term | Web | Android (Jetpack Compose) |
|---|---|---|
| cheap property | `transform`, `opacity`; in current Chrome and Firefox also `filter`, `clip-path`, `background-color` | `Modifier.graphicsLayer { translationX/Y, scaleX/Y, rotationZ, alpha }` |
| paint property | `color`, `box-shadow`, `border-radius` | `Modifier.drawBehind { }` content, `shadow` elevation, shape changes |
| layout property | `width`, `height`, `padding`, `margin`, `top`, `left` | `Modifier.size`, `.padding`, and `.offset(dp)` read in composition; `animateContentSize()` |
| render thread | The compositor | `RenderThread` |
| app thread | The main thread | The main thread (composition, layout and draw) |
| retargetable animation | CSS transition, WAAPI | `animate*AsState`, `Animatable.animateTo`, `updateTransition` |
| restarting animation | CSS `@keyframes` | `keyframes { }` spec, `rememberInfiniteTransition` |
| curve token | `cubic-bezier(x1, y1, x2, y2)` | `CubicBezierEasing(x1, y1, x2, y2)` |
| spring | Motion `{ type: "spring", duration, bounce }` | `spring(dampingRatio, stiffness)`; damping ratio = 1 − bounce |
| trigger origin | `transform-origin`; `var(--transform-origin)` in Base UI | `graphicsLayer { transformOrigin = TransformOrigin(x, y) }` |
| entry without a mount flag | `@starting-style` | `AnimatedVisibility(enter = …, exit = …)` |
| reduced-motion setting | `prefers-reduced-motion` | "Remove animations" (`Settings.Global.ANIMATOR_DURATION_SCALE` = 0) |
| hover pointer | `@media (hover: hover) and (pointer: fine)` | Hover events from a mouse or stylus only (`Modifier.hoverable`, `PointerEventType.Enter`) |
| per-frame value | Write the element's style or a motion value, not component state | Read the value in the layout or draw phase (`graphicsLayer { }`, `offset { }` lambda), not in composition |
| layer hint | `will-change: transform` | `graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }` |
| press feedback | Scale on `:active` | Scale from `interactionSource` press state, plus `LocalHapticFeedback` |
| system back and gestures | Browser back and history | Predictive back (`PredictiveBackHandler`), system gesture insets |
| insets and system bars | `env(safe-area-inset-*)`, `viewport-fit=cover`, `theme-color` | Edge-to-edge, `WindowInsets.safeDrawing`, system bar colors |
| feel check tools | DevTools Animations and Performance panels | Developer option "Animator duration scale"; Perfetto; Layout Inspector recomposition counts |

Rules for the map:
1. A rule that needs a platform form names the term and links the map row.
2. A value in a rule stays platform-neutral: a duration in ms, a curve as four numbers, a spring as duration and bounce.
3. A platform that the map does not cover, for example React Native or Android Views, gets the generic rule only. The rule still applies. A later plan can add a column.
4. A terminal UI has no motion row. The gate, worst-case content and native-feel rules still apply.

## 5. Changes, file by file

### C1 — `design/animate.md` (rewrite, sub-procedure budget 300 lines)

Keep the register section and the attribution. Replace the rest with this order, which follows the source `animate` build sequence:

1. **Hard rules.** Run the gates in order. Use no approximated value. Extend the project's motion tokens; never add a parallel set. Ship the reduced-motion form and the hover-pointer gate with the motion. "Do not animate this" is a valid result.
2. **Gate 1 — frequency.** The existing table. The keyboard rule stays.
3. **Gate 2 — purpose.** Feedback, spatial consistency, state indication, preventing a jarring change, explanation, or delight (rare tier only). Add the **function** check: data that a person reads or acts on does not move for style.
4. **Opportunity sweep** (from `find-animation-opportunities`). Replaces lines 34–48. Hunt six seams: feedback gaps, teleporting state, missing spatial story, group entrances, gesture seams, the delight budget. Gate every candidate. Keep at most 5–7 for an app. List 2–5 rejected candidates, each with the gate that rejected it.
5. **The tool ladder.** Use the first that works: retargetable animation on a state change → entry without a mount flag → render-thread animation → programmatic animation API → animation library.
6. **Properties.** Cheap properties only. Clip is the sanctioned extra. A layout property is tolerated only for an accordion. Never scale from 0; start at 0.9–0.97 with opacity 0. Scale from the trigger origin; modals stay centered. Offsets relative to the element's own size.
7. **Easing and duration.** The full decision table: enter or exit `ease-out`; move on screen `ease-in-out`; hover and color `ease`; constant motion `linear`. The three curve tokens as control points. The duration for each element. UI under 300 ms.
8. **Springs.** Duration and bounce. Bounce 0 in product (R3); 0.1–0.3 on brand surfaces.
9. **Interruption and exit.** Retargetable animation for anything triggered fast. Springs for gestures. Exit on the entry path, shorter and with less distance. Asymmetric timing for a hold.
10. **Reduced motion and the hover pointer.** Fewer and gentler, not zero. Delete the global kill switch and the motion-first stance.
11. **Gestures** (adds the source `apple-design` rules). Velocity dismissal at about 0.11 px/ms. Velocity handoff from drag to spring. Momentum projection to where the gesture goes. Rubber-banding past an edge. Pointer capture. Multi-touch protection.
12. **Performance** (from `animation-performance`). The frame budget. The three property tiers. The swaps: a size change becomes scale; a position change becomes offset; a shadow animates as a pre-rendered shadow's opacity. App-thread motion during heavy work moves to the render thread. Per-frame values never go through component state. A value that every child inherits never drives one child's motion. Animated blur stays under 20 px. A layer hint only after a visible shift. Name the cause before a fix. Never conclude "smooth" from a fast machine.
13. **Never ship.** The 13-row self-check table, in generic terms.
14. **Cohesion and the feel check.** Keep the current text.
15. **In the workflow.** The design note `design-notes/animate-<timestamp>.md` records the gate result, the ingredients, the rejected candidates and the feel check.

The six conflicts of section 1 resolve as follows: 1 → `ease-out`; 2 → gentler, not zero; 3 → 30–80 ms; 4 → the duration for each element; 5 → the hover-pointer gate; 6 → the entry path, shorter and closer.

### C2 — `design/_motion-recipes.md` (new, sub-procedure)

The 14 source recipes in generic form. Each recipe states the ingredients first: the trigger, the properties, the curve token, the duration or spring, the origin, and the reduced-motion form. A web snippet follows. The platform map gives the other forms. `animate.md` loads this file when the request matches a recipe.

### C3 — `design/_platforms.md` (new, sub-procedure)

The table of section 4 and its four rules.

### C4 — `design/_design-context.md`

- Line 81: replace "design for motion first" with the reduced-motion rule of C1 step 10.
- Line 86: update the motion summary to the generic terms, and add the hover-pointer gate and the frame budget.

### C5 — `design/optimize.md`

Replace lines 50–75 (the property tiers and `will-change`) with a pointer to `animate.md` → Performance. Keep the "transition only what changes" rule, in generic words. Update the attribution with the source commit.

### C6 — `review/interface-craft.md`, section `motion` (rubric budget 100 lines; now 58)

- Write each rule in generic terms.
- Add these triggers: scale from the center on a trigger-anchored popover (MED); hover motion with no hover-pointer gate (MED); symmetric timing on a hold (LOW); app-thread motion during heavy work (HIGH); one inherited value that drives a child's motion (MED); a weak built-in curve on a deliberate animation (LOW); a group that enters all at once where a stagger belongs (LOW).
- Add the **justified-motion** rule: motion with no named purpose on a surface seen tens of times a day or more is HIGH.
- Replace line 40 with the source fix order of 9 steps: delete, reduce, fix the easing, fix the origin, make it retargetable, move it to cheap properties, make the timing asymmetric, polish, then reduced motion and cohesion.

### C7 — `review/performance.md`, section `frontend-performance` (now 86 lines)

Add two rules:
- **A layout-property animation, or app-thread motion during navigation, loading or hydration, is HIGH.**
- **A per-frame value that goes through component state, and so rebuilds the view tree each frame, is HIGH.**

### C8 — Worst-case content (from `break-ui`)

- **`design/harden.md`:** add section "Worst-case content" with the source catalog in nine groups: people and names; emails, URLs and identifiers; labels and copy from data; numbers and money; collections; time; images and media; states; environment. Add platform-neutral environment rows: the largest system text size, a right-to-left language, a long translation, the narrowest supported window. Make the hover rule at line 72 generic.
- **`design/stage.md` Step 4 and `design/_boards.md`:** draw one more state board, `<surface>--worst`, in two cases (D4):
  - for each surface that the person asks for, at any `ux-impact`;
  - otherwise, for each new surface in the slug that shows data from people or from the system.

  The person sees the worst boards at Step 5 with the other boards. A changed surface that already exists gets no worst board unless the person asks.
- **`design/contract.md`:** the mock fidelity inventory lists each worst board that was drawn.
- **`design/_lane.md`, duties table:** `implement` makes the worst-case data loadable in development, with the stack's own means (a fixture, a story, a preview, a seed). `verify` captures `<surface>--worst` when that data loads, or records `worst-case: not-captured:<reason>`.

### C9 — Native feel (from `mobile-native`), `design/adapt.md`

Add section "Feel native on the target platform". Generic principles first:
- System gestures and system back win over app gestures.
- Content respects the safe areas and the system bars, and the bar colors match the surface.
- A focused text field never zooms or jumps the page.
- Touch gets press feedback, never hover motion.
- A press responds within one frame of the touch.
- Text selection stays off controls and on content.
- Test on real hardware. A desktop simulation does not count.

Then one checklist for each target in the map (D5): a web app on a phone (the 11 source fixes, for example the `100vh` bug, input zoom below 16 px and the tap highlight), iOS (safe areas, the interactive back swipe, Dynamic Type, haptics), Android with Compose (edge-to-edge, predictive back, system bar colors, the keyboard insets), and desktop (keyboard reach, window resize, hover, the system reduced-motion setting). Each item names the generic principle that it serves. Another platform gets the generic principles only.

### C10 — Divergent directions (from `prototype`), the design stage

- **`design/stage.md`, new Step 3b "Directions":** when no confirmed direction exists and `ux-impact` is `new-surface`, ask one gate question per `_gate-question.md`: draw three directions of the main surface first, or draw the boards at once. On "directions", draw three directions (at most five). Each direction has a name and a named axis: layout, density, personality, motion or interaction model. No two directions share a position on an axis. The person picks one, or asks for a new round around one direction.
- The directions are sketches: `design/sketches/direction-<name>.html`. `design-boards.mjs render` with no key already renders sketches. W5 checks whether the contact sheet shows sketches. When it does not, W5 adds a directions section to `renderSheet` in `lib/design-boards.mjs` and rebuilds `dist/` in the same commit.
- **`design/contract.md`:** `02c-craft.md` gets `## Directions considered`: each direction, its axis, and why the person chose or rejected it. The frontmatter gets an optional `directions:` list. This is a new optional property on the existing `design-contract` branch of `tests/frontmatter.schema.json`, not a new type.

### C11 — A move on a confirmed design, `design/stage.md` Step 0, `design.md`, `design/_commands.md`, `design/audit.md`, `design/critique.md`

A pass runs through its move (D3). Today, `stage.md` Step 0 item 5 stops only when the invocation names no move, so a move on a confirmed design starts the whole stage again. The plan defines that case:

- **When the design is confirmed and the invocation names a move,** run the move's pass and write `design-notes/<move>-<timestamp>.md`. The pass reads the frozen boards, and the built UI when it exists. Do not draw or freeze boards.
  - `animate` runs the gates and the opportunity sweep of C1 step 4. It reports opportunities and rejected candidates.
  - `harden` runs the worst-case pass of C8. It reports each break with a fix.
  - Every other move runs its own checks, as its file states.
- **When the pass proposes a change to a confirmed board,** ask one gate question per `_gate-question.md`: amend the design now, or keep the note for later. On "amend", run Amend for the surfaces that the note names.
- **When the design is not confirmed,** the move focuses the stage, as now.
- `design.md` usage and `design/_commands.md` describe this behavior for the move rows.
- A full `audit` adds worst-case content to its responsive dimension, and points to `harden.md` for the catalog. The score stays 0–4. A full `critique` adds one motion section, and points to `animate.md` for the sweep.
- `design/audit.md:27` (expensive animations) is rewritten in generic terms.

### C12 — Documentation and release

- `docs/site/reference/commands.html` (design rows), `docs/site/reference/review-dimensions.html` (interface-craft motion, frontend-performance).
- `CHANGELOG.md`.
- Minor version bump per `plugin_version_bump_locations`.

## 6. What stays

- The 15 moves, the 10 commands, the human rule, the board folder, the freeze and amend.
- The review key surface: `/wf review motion` still resolves to `interface-craft` with focus `motion`.
- The surface pins: keys 19, intake modes 17, rubrics 11, aggregates 7, frontmatter types 74. No pin rises, so the earn rule does not apply (SURFACE-POLICY §2). C10 adds an optional property, not a type.

## 7. The command surface after this plan

| Invocation | Now | After |
|---|---|---|
| `/wf design <slug>` | Draws one board per surface and state; the person confirms; freezes; writes `02c-craft.md` | Same, plus Step 3b directions when the direction is open, and a `--worst` board for each new data surface or each surface the person asks for |
| `/wf design <slug> <move>`, design not confirmed | Focuses the stage on one move | Same |
| `/wf design <slug> <move>`, design confirmed | Starts the whole stage again | Runs the move's pass and writes its design note. No boards are drawn. A proposed board change asks whether to amend. |
| `/wf design <slug> animate` | One of the 15 moves | The gates and the opportunity sweep, with rejected candidates |
| `/wf design <slug> harden` | One of the 15 moves | Adds the worst-case pass and its catalog |
| `/wf design <slug> adapt` | One of the 15 moves | Adds native feel for a web app on a phone, iOS, Android with Compose, and desktop |
| `/wf design <slug> amend` | Reopens a confirmed design | Same; an amend can also redo the directions |
| `/wf design <slug> import …` | Turns outside work into boards | Unchanged |
| `/wf design [slug] audit` | Five scored dimensions | Same, with worst-case content inside the responsive dimension |
| `/wf design [slug] critique` | Design-decision feedback | Same, plus one motion section |
| `/wf design <move> <instructions>` | Starts a new workflow with the move | Unchanged |
| `/wf design setup\|teach\|extract\|direction\|sync` | Maintains the design record | Unchanged |

## 8. Waves

| Wave | Content | Files | Depends on |
|---|---|---|---|
| W0 | Check every API name of section 4 against current platform documentation. Record the source and date of each check in the wave notes. | none | — |
| W1 | C3 and C4 | `design/_platforms.md`, `design/_design-context.md` | W0 |
| W2 | C1 and C2 | `design/animate.md`, `design/_motion-recipes.md` | W1 |
| W3 | C5, C6, C7 | `design/optimize.md`, `review/interface-craft.md`, `review/performance.md` | W2 |
| W4 | C8 (harden, stage, boards, contract, lane) and C10 (directions, schema, possible `lib/` change) | `design/harden.md`, `design/stage.md`, `design/_boards.md`, `design/contract.md`, `design/_lane.md`, `tests/frontmatter.schema.json`, possibly `lib/design-boards.mjs` and `dist/` | W1 |
| W5 | C9 | `design/adapt.md` | W1 |
| W6 | C11 | `design/stage.md` (Step 0 only), `design.md`, `design/_commands.md`, `design/audit.md`, `design/critique.md` | W2, W4 |
| W7 | Guard tests, then C12 and the release | `tests/`, `docs/site/`, `CHANGELOG.md`, version carriers | W3–W6 |
| W8 | Live runs: one web workflow and one Android Compose workflow | none | W7 |

W2, W4 and W5 touch disjoint files, so they can run in parallel sessions after W1. W4 and W6 both edit `design/stage.md`: W4 edits Steps 3b and 4, and W6 edits Step 0 after W4 lands. Several sessions edit this tree. Stage files by path; never use `git add -A`.

## 9. Verification

- `npm test`, `npm run verify:prose` and `npm run verify:surface` pass. The surface gate prints no raised pin.
- **New guard test, red first:** the rule sections of `animate.md`, `_motion-recipes.md`, `optimize.md` and the `motion` section of `interface-craft.md` contain no platform API name outside fenced code blocks and links to `_platforms.md`. The test reads its word list from the backticked forms in the map's platform columns.
- **New guard test:** no file under `skills/wf/reference/` says `ease-in` for an exit, and none sets a global reduced-motion duration of 0.
- **New guard test:** the board validator accepts a `<surface>--worst` key, and the schema accepts `directions:` on a design contract.
- **New guard test:** `design/stage.md` Step 0 routes a move on a confirmed design to the move's pass, not to Step 1.
- If C10 changes `lib/design-boards.mjs`, `tests/unit/lib/design-boards.test.mjs` covers the directions section, and `dist/` is rebuilt in the same commit.
- W8 records, for each live run: the gate results, the rejected candidates, the worst board and its capture, and whether the person used the directions step.

## 10. Risks

- **Generic words lose precision.** The map keeps the exact forms, and each value stays a number. The guard test stops platform names from leaking back into rules.
- **The map goes stale as platforms change.** W0 records the date of each check. The attribution records the source commit. A later recheck compares both.
- **`animate.md` exceeds 300 lines.** C2 moves the recipes out, and C3 moves the platform forms out.
- **The directions step slows a person who already knows the answer.** The step asks first, and it runs only for `new-surface` with no confirmed direction.

## 11. Open questions

None. The PO answered Q1–Q4 on 2026-10-19 (D3–D6).

## 12. Build record (2026-10-19)

**W0 — the platform check.** A read-only check against MDN, developer.chrome.com, developer.apple.com, developer.android.com, learn.microsoft.com, motion.dev and base-ui.com corrected nine cells of the section 4 draft. `design/_platforms.md` holds the checked result.

| # | Correction | Effect |
|---|---|---|
| 1 | Chrome composites `transform`, `opacity` and `filter` by default. `clip-path` and `background-color` are not shipped as composited in Chrome or Firefox. | They are paint properties in the map and in `animate.md`. Clip stays the sanctioned extra because it never re-lays out. |
| 2 | Motion documents its `x`, `y`, `scale` shorthands as hardware-accelerated, like a `transform` string. Only a transform driven by a CSS variable is not. | The source's "shorthands drop frames" rule is not ported. The inherited-value trap covers the real case. |
| 3 | SwiftUI springs always kept their velocity; iOS 17 made a spring the default animation. | Wording only. |
| 4 | Damping ratio = 1 − bounce holds for bounce ≥ 0; it is 1 / (1 + bounce) for bounce < 0. | Both forms are in the map. |
| 5 | Compose `offset` changes placement, not size. | It moved from the layout row to the per-frame row. |
| 6 | Compose `shadow` is a `graphicsLayer` property. | The paint example is `drawBehind`. |
| 7 | Compose back handling is now `NavigationBackHandler` (`androidx.navigationevent`). | `PredictiveBackHandler` and `BackHandler` are listed as the older APIs. |
| 8 | WinUI 3 uses `Microsoft.UI.Composition`; `KeyFrameAnimation` is a base class. | The typed `Create*KeyFrameAnimation` methods are listed. |
| 9 | Compose has no phone-level reduce-motion API; `MotionDurationScale` follows the system "Remove animations" setting. | The map says so, with `ValueAnimator.areAnimatorsEnabled()` as the check. |

**Further conflicts found while building.** `design/polish.md:50` said `ease-in` for leaving elements, and `design/polish.md:54`, `design/optimize.md:13-15` and `reference/implement.md:130` kept the motion-first stance. All four now follow `animate.md`. The guard test scans every reference for both rules.

**What is built.**
- W1: `design/_platforms.md` (new), `design/_design-context.md`.
- W2: `design/animate.md` (rewritten, 238 lines), `design/_motion-recipes.md` (new).
- W3 (part): `design/optimize.md`, `design/polish.md`, `reference/implement.md`.
- W4: `design/harden.md` (worst-case content), `design/stage.md` (Step 3b, worst boards, Move pass), `design/_boards.md`, `design/contract.md`, `design/_lane.md`, `design/_output.md`, `tests/frontmatter.schema.json` (`directions`), `lib/design-boards.mjs` (`directionSketches`, the Directions section of the sheet), `scripts/design-boards.mjs`.
- W5: `design/adapt.md` (native feel on four targets).
- W6: `design.md`, `design/_commands.md`, `design/audit.md`, `design/critique.md`.
- W7 (part): `tests/unit/skills/design-craft-port.test.mjs` (new), `tests/unit/lib/design-boards.test.mjs`.

**What waits.** Another session owns uncommitted edits to `review/interface-craft.md`, `review/performance.md`, `docs/site/reference/commands.html`, `docs/site/reference/review-dimensions.html` and `capability-inventory/prose-budget.json`. C6, C7 and the doc-site part of C12 wait for that commit. `dist/` and `runtime-manifest.json` also hold a second session's uncommitted build, so the bundle commit waits for the owner of `lib/hub-config.mjs`.
