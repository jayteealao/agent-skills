Decide where motion earns its place, reject the rest, and specify what remains so that it survives a strict review. This file also places the moments of personality of a product: the rare points where the design shows that someone cared.

The rules use the generic terms of [_platforms.md](_platforms.md). Values stay platform-neutral: durations in ms, curves as four control points, springs as a duration and a bounce. Recipes are in [_motion-recipes.md](_motion-recipes.md). The build rules (performance, gestures, tools) are in [_motion-build.md](_motion-build.md).

---

## Design mode

| Mode | Motion |
|---|---|
| Persuade and Experience | Motion may carry the voice. Prefer one rehearsed focal sequence to scattered micro-interactions. A focal entrance may take 400–800 ms. A spring may bounce 0.1–0.3. |
| Operate | Motion carries feedback, state and continuity. Routine transitions take 150–250 ms. No page-load sequence: people are in a task and do not wait for it. |
| Read | Motion serves wayfinding only. Nothing moves in the reading column. |

---

## Hard rules

1. **Run the gates in order.** Gates 1 and 2 decide whether anything animates. Do not choose a curve before they pass.
2. **Take the values from the motion tokens of `DESIGN.md`.** When the project has an ease or a duration scale, use it, and extend it when a role is missing. The values in this file and in the recipes are defaults for a project with no motion tokens. Write the ones you use into `DESIGN.md` as tokens. Do not approximate a value from memory.
3. **The motion fits the product.** Choose the personality first (crisp, calm, playful, heavy), then set the tokens to express it ([Cohesion](#cohesion)). Two products do not need the same curve.
4. **The reduced-motion form and the hover-pointer gate ship with the motion**, not as a follow-up.
5. **"This should not animate" is a valid result.** Say it plainly, and offer the alternative without motion: an instant state change or a static affordance.

## Gate 1 — Frequency

| Frequency | Decision |
|---|---|
| 100 or more times a day (keyboard shortcuts, a command-palette toggle, core navigation) | No animation. Stop here. |
| Tens a day (hover, list navigation, frequent toggles) | Fast and subtle, or nothing |
| Occasional (modals, drawers, toasts, settings) | Standard animation |
| Rare or first-time (onboarding, success, celebration) | The moments budget lives here |

A keyboard-initiated action does not animate. It repeats hundreds of times a day, and motion makes it feel slow and disconnected from the key press. On a Persuade or Experience surface where motion is the message, this gate relaxes. The accessibility and interruption rules do not relax.

## Gate 2 — Purpose and function

Name the purpose in one of these words before you continue:

- **Feedback** — confirms that the interface heard the person.
- **Spatial consistency** — shows where something came from or went.
- **State indication** — makes a state change legible.
- **Preventing a jarring change** — bridges content that would otherwise teleport.
- **Explanation** — shows how something works (marketing and onboarding only).
- **Delight** — allowed only at the rare or first-time tier.

No named purpose, no motion. "It looks cool" on a frequently seen element is a reason to stop.

**Function check.** Data that a person reads or acts on does not move for style. A decorative pointer-tracking effect belongs on a marketing page, not on a chart in a banking app.

## Motion thesis

Before you draw or build, write four lines:
1. **Focal moment** — the one sequence that earns authorship, or none.
2. **Continuity** — the changes that need a bridge.
3. **Feedback** — the controls and outcomes that need acknowledgment.
4. **Budget** — each expensive effect, and how often it runs.

Take the focal moment from this product. A generic fade-and-rise is not a thesis.

When two or more elements move on one event, add the **timeline** of [Choreography](#choreography): one row for each moving element, in start order, with its role, start, duration, motion and relationship. Then list 2–5 elements that you kept still, each with the reason.

## The opportunity sweep

When the job is to find where motion belongs, sweep the interface first. Expect to reject most candidates.

Hunt these six seams:
1. **Feedback gaps** — pressable elements with no press feedback; destructive actions that fire on a plain tap where a hold-to-confirm fill would prevent slips.
2. **Teleporting state** — content that appears, swaps or vanishes with no bridge; sections that snap open.
3. **Missing spatial story** — panels and menus with no link to their trigger; surfaces that exit on a different path than they entered.
4. **Group entrances** — a list or grid that pops in at once on a screen seen occasionally.
5. **Gesture seams** — draggable elements that snap with no physics.
6. **The moments budget** — rare, high-emotion moments rendered flat: first run, empty states, success.

Rules:
- Run every candidate through Gates 1 and 2, and check that it fits the duration limits below.
- Keep at most 5–7 opportunities for a whole app, fewer for one screen, ordered by leverage.
- List 2–5 **rejected candidates**, each with the gate that rejected it. The rejected list separates this sweep from a wishlist.
- "The motion here is already right" is a valid result.

## Moments

A moment is a rare point where the product shows personality: a first success, a completed task, an empty state, a recovery. The first source of delight is a product that works as expected, faster than the person thought it would. A moment comes after that, not in place of it.

**The thesis.** Write one sentence: what the person feels at this moment, and why that feeling belongs to this product. Then choose the smallest means that delivers it. Derive the means from the product: its subject, its words, its materials. When a neighboring product could use the moment unchanged, it is not yet a moment of this product.

| Where | A moment is |
|---|---|
| Completion and first success | A response matched to the effort and the consequence |
| Waiting | True progress, named in the product's words. Do not fake work. |
| Empty and first use | The next action made clear first, then personality ([onboard.md](onboard.md)) |
| Repeated use | Speed. A response that stays satisfying on the hundredth use is one with no flourish. |
| Discovery, on a Persuade or Experience surface | A reward for curiosity. Do not hide a required function behind it. |

On an Operate or Read surface, place moments at first use, completion, recovery and mastery only. The person feels them and does not notice them. The voice of a moment (an error, an empty state, a success) follows [clarify.md](clarify.md) → Voice and language.

Do not ship:
- a moment that delays the task, or that the person cannot skip;
- play or a joke on an error, a loss, money, privacy or blocked work;
- an animation that exists to show capability;
- sound without consent, or sound that ignores the mute setting;
- an asset cost out of proportion to the moment;
- a loop that runs while hidden.

## Properties

- **Never scale a surface from 0.** Start a surface (a popover, a modal, a card) at scale 0.9 or more, with opacity 0. A small contextual icon is the one exception: it may start at scale 0.25 with a blur (see Choreography).
- **Scale from the trigger origin** for popovers, menus, dropdowns and tooltips. A modal is exempt: it has no trigger anchor, so it stays centered.
- **Offsets relative to the element's own size** (100% of its height, not a fixed number) adapt to content.
- **Scale scales children too.** The label and the icons come along, which makes a press read as physical.
- **Move with cheap properties:** offset, scale, rotation, opacity. [_motion-build.md](_motion-build.md) → Performance gives the cost of the others.

## Easing and duration

| Situation | Easing |
|---|---|
| Entering or exiting | ease-out |
| Moving or morphing on screen | ease-in-out |
| A change in place of color, opacity or blur (hover, a crossfade) | the built-in `ease` |
| Constant motion (a marquee, a progress fill) | linear |
| Default | ease-out |

Do not use ease-in on UI, on an entrance or on an exit. It starts slow and delays the moment that the person is watching.

A built-in curve is too weak for an entrance, an exit or a movement. Use the curve tokens of `DESIGN.md`. With none, these are the defaults:

| Token | Control points | Use |
|---|---|---|
| `ease-out` | 0.23, 1, 0.32, 1 | UI interactions, entrances and exits |
| `ease-in-out` | 0.77, 0, 0.175, 1 | On-screen movement |
| `ease-drawer` | 0.32, 0.72, 0, 1 | Drawers and sheets |

When the personality of the product needs another curve, define it as a token and state why. Do not write a curve inline.

| Element | Duration |
|---|---|
| Press feedback | 100–160 ms |
| Tooltips, small popovers | 125–200 ms |
| Dropdowns, selects | 150–250 ms |
| Modals, drawers | 200–500 ms |
| Focal entrance on a Persuade or Experience surface (hero, scroll reveal) | 400–800 ms |

**Motion on an Operate or Read surface stays under 300 ms.** Three exceptions: a drawer or a sheet (its travel is the whole height: up to 500 ms on `ease-drawer`), a toast (up to 400 ms), and the settling spring of a gesture.

**Asymmetric timing.** Slow the phase where the person decides. Snap the phase where the system responds. A hold-to-delete fills over 2 s linear; its release returns in 200 ms ease-out.

**Perceived speed.** How fast something feels matters as much as how fast it is. A 180 ms dropdown feels more responsive than a 400 ms one. Once one tooltip in a toolbar is open, the next opens with no delay and no animation.

## Springs

A spring simulates physics. It settles on its parameters, and it keeps velocity when interrupted. Use it for a drag with momentum, a gesture that a person can reverse, and decorative pointer tracking.

Express a spring as a duration and a bounce (`duration 0.5 s, bounce 0.2`). [_platforms.md](_platforms.md) → Spring conversion converts it.

- **Operate and Read surfaces: bounce 0** ([_craft-floor.md](_craft-floor.md) rule 25).
- **Persuade and Experience surfaces: bounce 0.1–0.3**, when the direction calls for play. Use a real spring. Do not fake one with an overshoot curve.

## Interruption and exit

- **Retargetable animations for anything triggered fast:** toasts, toggles, anything a person can fire twice in a second. A restarting animation jumps back to its start value.
- **Exit on the entry path.** A toast that enters from the bottom leaves through the bottom.
- **An exit is softer and faster than its enter.** Travel less: a small fixed offset on the same path, not the full height. Take about half the time of the enter. Do not drop the exit: an element that vanishes loses its spatial context.
- **Skip the enter on first paint.** Elements in their default state at launch do not animate in. The exception is a deliberate first-run entrance.
- **Keep content visible in its default state.** An entrance starts from a state that the person can read. Content does not wait on a script or an animation.

## Choreography

Good choreography cuts moving parts and runs the rest together. Sequence only when the order carries meaning: the reading order, a cause and its effect, or one thing that must arrive before another. A good sequence reads as one wave. A bad one reads as a queue.

1. **Cast.** List each element that moves on the event. Give each one a role. The **lead** is the one thing that the person must notice: it moves first and travels the farthest. **Support** follows with less motion. **Decoration** only fades, or does not move. **Static** does not move: a container whose content animates is static. When two elements want to be the lead, the hierarchy has a problem that motion cannot fix: say so.
2. **Relate each pair.** **Together**: one object or one moment; the same start and the same timing family. **Overlap**: a stagger; the second starts while the first moves. **Sequence**: the second starts as the first ends, with a small overlap; only when both at once look broken. **Carry**: animate the parent, and the children move with it.
3. **Sync** each secondary motion to a moment of the lead (its start, its impact or its settle), not to a delay that looks about right. Accents land with the lead, in the last 20% of its time. A repeat action skips the build-up.
4. **Scale the time to the change.** Derive the duration from the distance and clamp it, for example 150–270 ms for a resize.

The rules:
- **One entrance per container.** When the panel moves in, its content is already there. Do not animate the entrance of a parent and stagger its children too.
- **No stagger on a high-frequency or keyboard surface:** menus, dropdowns, command palettes, tab content, list rows. The items appear together.
- **No uniform stagger.** Vary the delay and the travel by importance: the lead travels the farthest, and the gaps shrink along the group.
- **Product UI: 30–80 ms between items, with the whole group done in about 300 ms.** Stagger only the first few items of a long list; the rest arrive with the last of them. A Persuade or Experience first-run moment may use 100–150 ms steps on 0.5–0.6 s entrances.
- **Order follows importance, not the order of the code.** A title and its first line can be one beat.
- **Direction follows the reading direction or the cause:** top to bottom for content, outward from the point of a tap. Forward enters from the end edge, back from the start edge.
- **An element that leaves stops taking space at once,** so its siblings close the gap while it fades. A view swap in one container is a crossfade, not a wait.
- **Exits are simultaneous, shorter and simpler.** Do not stagger an exit.
- **Choreography does not block interaction.** An element is usable as soon as it shows.
- **A sequence survives interruption.** A re-trigger stops the motion in flight before it starts new motion.
- **An attention loop** (a hint that taps or wiggles) runs first after about 2.5 s, repeats about every 6 s, and stops while the person interacts.
- **Do not give every section the same entrance.** A fade-and-rise on each scrolled section is a template. Keep one authored moment.
- **Split a large entrance into semantic chunks** (title, description, actions). Do not move one big container. Each chunk combines opacity and a small offset (about 12 px). On a Persuade or Experience surface, a chunk may add a light blur (about 4 px).
- **Contextual icon swaps** (play to pause, like to liked): opacity 0 → 1, scale 0.25 → 1, blur 4 px → 0, spring `duration 0.3 s, bounce 0`. Animate only contextual icons. Leave navigation and decorative icons alone.
- **Tooltips:** delay the first, and open the rest at once while one is open.

## Reduced motion and the hover pointer

- **Reduced motion** follows [_craft-floor.md](_craft-floor.md) rule 24. Press feedback becomes a change of color or opacity. A choreography collapses: no delays, no movement, the opacity kept, the group shown together. A sequence that is the explanation jumps between its frames.
- **Hover motion only for a hover pointer.** Touch fires a false hover on tap. Gate every hover animation behind the hover-pointer check of the platform.
- **Stop a non-essential loop when it is off screen or hidden.** Respect the autoplay and sound settings.

## Never ship

| Never | Instead |
|---|---|
| Scale of a surface from 0 | Scale 0.9 or more with opacity 0 |
| ease-in on UI | ease-out |
| A built-in curve on an entrance, an exit or a movement | A curve token |
| A curve or a duration written inline | A motion token of `DESIGN.md` |
| Motion on a keyboard shortcut or a 100-a-day action | No motion |
| Operate or Read motion over 300 ms outside the three exceptions | 150–250 ms |
| Center origin on a trigger-anchored popover | The trigger origin |
| Hover motion with no hover-pointer gate | The hover-pointer check of the platform |
| No reduced-motion form | Gentler, not zero |
| A uniform stagger | Delays and travel that shrink by importance |
| A parent entrance with staggered children | One entrance per container |
| A stagger on a menu, a list row or a keyboard surface | The items appear together |
| A staggered exit | Everything leaves at once |
| The same entrance on every section | One authored moment |

## Cohesion

Motion matches the personality of the thing it animates and of the rest of the product. A playful component on a Persuade surface can be bouncier. A professional dashboard stays crisp and fast. A calm product can run a little slower than the defaults, on a softer curve, when every motion of the product does the same. State the personality in one line beside the motion tokens of `DESIGN.md`. When you cannot tell whether a motion improves the experience, delete it.

## In the workflow

This file is a move. [_lane.md](_lane.md) → Moves says when each use runs. A note follows [_output.md](_output.md).

### At the design stage

The move changes these things in the screens:
- the motion tokens of `DESIGN.md` (curves, durations, springs) and one line on the personality;
- the focal moment and each bridge of the motion thesis, drawn in the screen page with the tokens, with its reduced-motion form;
- the press, hover and focus transitions of each component in `components.css`;
- each moment, with its thesis, in the state where it lives (`empty`, a success, a first run).

The contract records the motion thesis, the gate result of each animation, and the rejected candidates.

### As a pass on an approved design

The pass changes nothing. Write each answer as a finding with its screen key or `file:line`.
1. Which gate does each existing animation pass, by frequency tier and named purpose? Which fail?
2. Does each animation use a motion token, and stay inside the duration limits of its design mode?
3. Does each one have a reduced-motion form and, for hover, a hover-pointer gate?
4. What does the opportunity sweep find? List the opportunities, and the rejected candidates with the gate that rejected each.
5. Does each moment have a thesis that only this product could write?
6. When built code exists: do the rules of [_motion-build.md](_motion-build.md) hold? Name the checks that code alone cannot settle.

### In implement

Load [_motion-build.md](_motion-build.md): the tool ladder, the property costs, performance, gestures and the feel check. Load [_motion-recipes.md](_motion-recipes.md) when the work matches a recipe. Build each animation from the motion tokens that the contract names.

---

> *Parts adapted from impeccable v4.7.0 (`pbakaus/impeccable`, `374a0e179`), Apache-2.0.*

> *The gates, the opportunity sweep, the curve tokens and durations, springs, interruption and cohesion are adapted from Emil Kowalski's skills `animate`, `find-animation-opportunities`, `review-animations` and `apple-design` ([github.com/emilkowalski/skills](https://github.com/emilkowalski/skills), commit `2d22863`, 2026-10-11). The choreography method is adapted from his skill `choreograph` (commit `c8a7962`, 2026-11-04). The perceived-speed principle is adapted from his design-engineering writing ([animations.dev](https://animations.dev/)). The icon micro-animation values, split-and-stagger entrances and skip-on-first-paint guidance are adapted from Jakub Krehel's "Details that make interfaces feel better" ([jakub.kr](https://jakub.kr/writing/details-that-make-interfaces-feel-better)). All used under MIT license.*
