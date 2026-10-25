> **Additional context needed**: the target platform, performance constraints, target devices.

Decide where motion earns its place, reject the rest, and build what remains so it survives a strict review. The rules use the generic terms of [_platforms.md](_platforms.md); that file maps each term to its form on the web, iOS, Android (Compose) and desktop. Values stay platform-neutral: durations in ms, curves as four control points, springs as a duration and a bounce. Recipes live in [_motion-recipes.md](_motion-recipes.md).

---

## Design mode

Persuade and Experience: motion may carry the voice. Prefer one rehearsed focal sequence to scattered micro-interactions. A focal entrance may take 400–800 ms. A spring may bounce 0.1–0.3.

Operate: motion carries feedback, state and continuity. Routine transitions take 150–250 ms. No page-load sequence: people are in a task and do not wait for it.

Read: motion serves wayfinding only. Nothing moves in the reading column.

---

## Hard rules

1. **Run the gates in order.** Gates 1 and 2 decide whether anything animates. Do not choose a curve before they pass.
2. **No approximated values.** Every curve, duration and spring comes from this file. Do not invent a curve because it looks familiar.
3. **Extend the project's motion tokens.** When the project already has an ease or duration scale, use it. A parallel set is a defect.
4. **The reduced-motion form and the hover-pointer gate ship with the motion**, never as a follow-up.
5. **Use the cheapest tool that works.** Do not add an animation library for a fade.
6. **"This should not animate" is a valid result.** Say it plainly and offer the non-motion alternative: an instant state change or a static affordance.

## Gate 1 — Frequency

| Frequency | Decision |
|---|---|
| 100+ times/day (keyboard shortcuts, command-palette toggle, core navigation) | **No animation. Ever.** Stop here. |
| Tens/day (hover, list navigation, frequent toggles) | Near-imperceptible only — fast and subtle, or nothing |
| Occasional (modals, drawers, toasts, settings) | Standard animation |
| Rare / first-time (onboarding, success, celebration) | The delight budget lives here |

**Keyboard-initiated actions are a disqualifier, not a judgment call.** They repeat hundreds of times a day, and motion makes them feel slow and disconnected from the key press. (Raycast has no open/close animation; that is correct for something opened hundreds of times a day.) On a Persuade or Experience surface where motion is the message, this gate relaxes; the performance, accessibility and interruption rules never relax.

## Gate 2 — Purpose and function

Name the purpose in one of these words before you continue:

- **Feedback** — confirms the interface heard the person.
- **Spatial consistency** — shows where something came from or went.
- **State indication** — makes a state change legible.
- **Preventing a jarring change** — bridges content that would otherwise teleport.
- **Explanation** — shows how something works (marketing and onboarding only).
- **Delight** — allowed only at the rare / first-time tier.

No named purpose, no motion. "It looks cool" on a frequently seen element is a reason to stop.

**Function check.** Data that a person reads or acts on does not move for style. A decorative pointer-tracking effect belongs on a marketing page, not on a chart in a banking app.

## Motion thesis

Before you build, write four lines:
1. **Focal moment** — the one sequence that earns authorship, or none.
2. **Continuity** — the changes that need a bridge.
3. **Feedback** — the controls and outcomes that need acknowledgment.
4. **Budget** — each expensive effect, and how often it runs.

Take the focal moment from this product. A generic fade-and-rise is not a thesis.

## The opportunity sweep

When the job is to find where motion belongs, sweep the interface before you build. Expect to reject most candidates.

Hunt these six seams:
1. **Feedback gaps** — pressable elements with no press feedback; destructive actions that fire on a plain tap where a hold-to-confirm fill would prevent slips.
2. **Teleporting state** — content that appears, swaps or vanishes with no bridge; sections that snap open.
3. **Missing spatial story** — panels and menus with no link to their trigger; surfaces that exit on a different path than they entered.
4. **Group entrances** — a list or grid that pops in at once on a screen seen occasionally.
5. **Gesture seams** — draggable elements that snap with no physics.
6. **The delight budget** — rare, high-emotion moments rendered flat: first run, empty states, success.

Rules:
- Run every candidate through Gates 1 and 2, and check that it fits the duration budget below.
- Keep at most 5–7 opportunities for a whole app, fewer for one screen, ordered by leverage.
- List 2–5 **rejected candidates**, each with the gate that rejected it. The rejected list separates this sweep from a wishlist.
- "The motion here is already right" is a valid result.

## The tool ladder

Use the first that works:

1. A **retargetable animation** on a state change (hover, press, a toggled state).
2. An **entry without a mount flag** for an element that appears.
3. A **render-thread animation** for predetermined motion that must stay smooth while the app is busy.
4. The platform's **programmatic animation API** for code control without a library.
5. An **animation library** for springs, shared-element and layout animation, exit animations of removed elements, and gesture-driven values.

When the job needs a component rather than an animation — a toast, a drawer, a command menu — use the platform's or the design system's component. Do not hand-roll one for its motion.

## Properties

- **Cheap properties only**: offset, scale, rotation, opacity. Clip is the sanctioned extra: on most renderers it repaints, but it never re-lays out, and it enables reveals no cheap property can draw. A layout property is tolerated only for an accordion, where no cheap equivalent exists; keep it short.
- **A paint property may carry a focal moment** on a Persuade or Experience surface: blur, mask, clip or shadow. Bound it to one region. Confirm the frame budget on a real mid-range device. Cheap properties still govern Operate and Read surfaces.
- **Never scale from 0.** Nothing in the real world appears from nothing. Start from scale 0.9–0.97 with opacity 0.
- **Scale from the trigger origin** for popovers, menus, dropdowns and tooltips. **Modals are exempt**: they are not anchored to a trigger, so they stay centered.
- **Offsets relative to the element's own size** (100% of its height, not a fixed number) adapt to content.
- **Scale scales children too** — label and icons come along, which is what makes a press read as physical.

## Easing and duration

| Situation | Easing |
|---|---|
| Entering or exiting | ease-out |
| Moving or morphing on screen | ease-in-out |
| Hover or color change | ease |
| Constant motion (marquee, progress) | linear |
| Default | ease-out |

**Never ease-in on UI**, on an entrance or on an exit. It starts slow and delays the exact moment the person is watching. ease-out at 200 ms *feels* faster than ease-in at 200 ms.

The built-in curves are too weak for deliberate motion. Use these curve tokens (four cubic Bézier control points):

| Token | Control points | Use |
|---|---|---|
| `ease-out` | 0.23, 1, 0.32, 1 | UI interactions, entrances and exits |
| `ease-in-out` | 0.77, 0, 0.175, 1 | On-screen movement |
| `ease-drawer` | 0.32, 0.72, 0, 1 | Drawers and sheets (iOS-like, from Ionic) |

Need another curve? Take it from [easing.dev](https://easing.dev/) or [easings.co](https://easings.co/). Do not hand-roll one.

| Element | Duration |
|---|---|
| Press feedback | 100–160 ms |
| Tooltips, small popovers | 125–200 ms |
| Dropdowns, selects | 150–250 ms |
| Modals, drawers | 200–500 ms |
| Focal entrance on a Persuade or Experience surface (hero, scroll reveal) | 400–800 ms |
| Marketing / explanatory | Can be longer |

**Motion on an Operate or Read surface stays under 300 ms.** A 180 ms dropdown feels more responsive than a 400 ms one. A faster spinner makes a load feel faster at the same real time.

**Asymmetric timing.** Slow the phase where the person decides; snap the phase where the system responds. A hold-to-delete fills over 2 s linear; its release returns in 200 ms ease-out. Symmetric timing on a press-and-release or a hold feels wrong.

## Springs

Springs simulate physics. They settle on their parameters, have no fixed duration, and keep velocity when interrupted. Use them for drag with momentum, elements that should feel alive, gestures a person can reverse, and decorative pointer tracking.

Express a spring as a **duration and a bounce** (`duration 0.5 s, bounce 0.2`); the map converts it, for example to a damping ratio of 1 − bounce.

- **Operate and Read surfaces: bounce 0.** This is the spring form of the bounce and elastic refusal in [_craft-floor.md](_craft-floor.md).
- **Persuade and Experience surfaces: bounce 0.1–0.3**, when the direction calls for play, including drag-to-dismiss. Never in dashboards or data UI.

**Decorative pointer tracking.** Do not bind a transform directly to the pointer position; it has no momentum and feels artificial. Interpolate it through a spring so it lags and settles. Reserve this for decorative motion; on a functional control or a chart, no motion beats decorative motion.

## Interruption and exit

- **Retargetable animations for anything triggered fast** — toasts, toggles, anything a person can fire twice in a second. A restarting animation jumps back to its start value.
- **Springs for gestures**, because they carry velocity through an interruption.
- **Exit on the entry path.** A toast that enters from the bottom leaves through the bottom. Symmetric paths make swipe-to-dismiss obvious.
- **An exit is softer and faster than its enter.** Attention has moved on: travel less (a small fixed offset on the same path, not the full height) and take about half the time (≈150 ms against ≈300 ms), with ease-out. Do not drop the exit entirely; an element that just vanishes loses its spatial context.
- **Skip the enter on first paint.** Elements already in their default state at launch do not animate in; only later state changes do. The exception is a deliberate first-run entrance that relies on it.
- **Keep content visible in its default state.** An entrance starts from a state the person can already read. Content never waits on a script or an animation.

## Choreography

- **Stagger a group entrance 30–80 ms per item.** Longer feels slow. A stagger is decorative: never block interaction while it plays.
- **Never give every section the same entrance.** A fade-and-rise on each scrolled section is a template. Keep one authored moment.
- **Split a large entrance into semantic chunks** (title, description, actions) rather than moving one big container; combine opacity, a small offset (≈12 px) and, where cheap, a light blur (≈4 px) per chunk.
- **Contextual icon swaps** (play → pause, like → liked): opacity 0 → 1, scale 0.25 → 1, blur 4 px → 0, spring `duration 0.3 s, bounce 0`. Animate only contextual icons; leave navigation and decorative icons alone. When no library is present, keep both icons mounted and cross-fade them with a retargetable animation on the curve `0.2, 0, 0, 1`.
- **Mask a crossfade that will not settle** with a brief 2 px blur during the transition; it blends two states into one perceived change. Keep animated blur under 20 px.
- **Tooltips: delay the first, open the rest instantly** with no animation once one is open.

## Reduced motion and the hover pointer

Both ship with the motion, every time.

- **Reduced motion means fewer and gentler, not zero.** When the reduced-motion setting is on, keep opacity and color transitions that aid comprehension; remove movement, scale, parallax and position changes. Never set every duration to 0 globally.
- **Hover motion only for a hover pointer.** Touch fires a false hover on tap. Gate every hover animation behind the platform's hover-pointer check.
- **No content flashes more than 3 times a second.**
- **Stop a non-essential loop when it is off screen or hidden.** Respect the autoplay and sound settings.

## Gestures

Physics beats thresholds:

- **Velocity dismissal** — dismiss on a flick (speed above ≈0.11 px/ms) even when the distance is short; do not require a fixed distance.
- **Velocity handoff** — when the finger lifts, start the settling spring with the gesture's velocity, so there is no seam between drag and animation.
- **Momentum projection** — settle where the gesture is going, not where the finger stopped: project the release velocity forward and snap to the nearest valid resting point.
- **Rubber-banding** — past a natural edge, move less the further the drag goes; real things slow before they stop. Prefer rising resistance to a hard wall.
- **Pointer capture** once the drag starts, so it continues when the pointer leaves the element.
- **Multi-touch protection** — ignore extra touch points once a drag begins, or the element jumps to the new finger.
- **1:1 tracking** — during a drag the element follows the finger exactly; no easing, no lag.

## Performance

**The frame budget** is 16.7 ms at 60 Hz and 8.3 ms at 120 Hz. Design against 8.3 ms; most phones and many laptops now run at 120 Hz. A fast development machine hides almost every problem below, so never conclude "smooth" from it. Say which findings come from code and which need a recording on a real mid-range device.

**What you animate.** Three tiers, an order of magnitude apart:

| Tier | Properties | Cost |
|---|---|---|
| Cheap | offset, scale, rotation, opacity (and, on some renderers, filter) | Compositing only |
| Paint | color, background color, shadow, corner radius, clip | A redraw every frame |
| Layout | size, padding, margin, position in the layout | Re-measures, and moves the elements around it |

Swap down a tier: a size change becomes scale; a position change becomes an offset; a show/hide becomes opacity; an animated shadow becomes the opacity of a pre-rendered shadow. A layout animation that looks fine on one element can re-lay out a whole screen beside it.

**Where it runs.** Motion on the render thread stays smooth while the app works; motion on the app thread drops frames during navigation, loading, data fetching or start-up. Move predetermined motion that plays during heavy work to the render thread.

**Per-frame values never go through component state.** A handler that sets state on every frame rebuilds the view each frame, and the rebuild alone blows the budget. Write the moving element's own property, or a value the renderer reads in the layout or draw phase.

**One inherited value must not drive one child's motion.** When a parent value that every child inherits drives the moving child, every child recalculates each frame, and the drag slows as content grows. Set the moving element's property directly.

**Animated blur stays under 20 px**; 2–5 px is enough to soften a crossfade.

**A layer hint comes last.** Add it only after you see a one-pixel shift or measured dropped frames, only on the element that animates, never on a large container. Each layer costs GPU memory.

**Diagnose before you fix**, in this order: (1) which properties animate; (2) does the jank coincide with heavy work; (3) does the view rebuild per frame; (4) does it get worse as content grows; (5) is an inherited value animated; (6) is blur above 20 px; (7) only then a layer hint. Every fix names the cause it addresses. Confirm with a recording, not by feel.

## Never ship

| Never | Instead |
|---|---|
| Animating every property at once | Name the exact properties |
| Scale from 0 | Scale 0.95 with opacity 0 |
| ease-in on UI | ease-out or a strong curve token |
| A built-in curve on a deliberate animation | The `ease-out` token |
| Motion on a keyboard shortcut or a 100+/day action | No motion |
| Operate or Read motion over 300 ms with no reason | 150–250 ms |
| Center origin on a trigger-anchored popover | The trigger origin (modals exempt) |
| A restarting animation on a toast, toggle or other fast-fired element | A retargetable animation |
| Animating a layout property | A cheap property |
| App-thread motion that plays during heavy work | Render-thread motion |
| Hover motion with no hover-pointer gate | The platform's hover-pointer check |
| No reduced-motion form | Gentler, not zero |
| A group that enters all at once | A 30–80 ms stagger |
| The same entrance on every section | One authored moment |
| Bounce or elastic easing on an Operate or Read surface | Bounce 0 |

## Cohesion

Motion matches the personality of the thing it animates and of the rest of the product. A playful component on a Persuade surface can be bouncier; a professional dashboard stays crisp and fast. Sonner feels right partly because its easing, duration, visual design and name agree: slightly slower than typical UI, `ease` rather than ease-out, to read as elegant. Opacity and height in an entering list have no formula; adjust until it feels right. When you cannot tell whether a motion improves the experience, delete it.

## Feel check

Motion bugs hide at full speed. Before you call an animation done:
- **Slow it down** to 2–5 times its duration, or use the platform's slow-animation tool. Do two states overlap? Does the easing stop abruptly? Is the origin right? Do coordinated properties stay in sync?
- **Step it frame by frame** to catch drift between coordinated properties.
- **Test gestures on a real device**, not with a desktop pointer.
- **Look again the next day.**

## In the workflow

This file is a move, not a stage.
- **Design not confirmed:** `/wf design <slug> animate` focuses the design stage and its contract `02c-craft.md` on motion.
- **Design confirmed:** `/wf design <slug> animate` runs the gates and the opportunity sweep against the approved screens and the built UI, and draws nothing ([stage.md](stage.md) → Move pass).
- `plan` cites this file as a step pointer; `implement` applies it.
- Every run writes `design-notes/animate-<timestamp>.md` per [_output.md](_output.md) with: the motion thesis, the gate result for each animation (frequency tier and named purpose), the ingredients (tool, properties, curve token, duration or spring), the rejected candidates and the gate that rejected each, and the feel checks that code alone cannot settle.
- Before you draw or edit UI, load [_craft-floor.md](_craft-floor.md). Check the result against its Refuse and Verify lists.

---

> *Parts adapted from impeccable v4.7.0 (`pbakaus/impeccable`, `374a0e179`), Apache-2.0.*

> *The gates, the opportunity sweep, the tool ladder, the curve tokens and durations, springs, interruption, gesture physics, the performance diagnosis, the never-ship table, cohesion and the feel check are adapted from Emil Kowalski's skills `animate`, `find-animation-opportunities`, `animation-performance`, `review-animations` and `apple-design` ([github.com/emilkowalski/skills](https://github.com/emilkowalski/skills), commit `2d22863`, 2026-10-11). The icon micro-animation values, split-and-stagger entrances and skip-on-first-paint guidance are adapted from Jakub Krehel's "Details that make interfaces feel better" ([jakub.kr](https://jakub.kr/writing/details-that-make-interfaces-feel-better)). Both used under MIT license.*
