Simplify a UI in one of two ways: fewer elements, or less intensity. Fewer elements removes what does not serve the task. Less intensity keeps the elements and calms them. Both keep the point of view of the design. The old move words `distill` and `quieter` mean the first and the second section.

This move is the design move `/wf design <slug> simplify`. The code review `/wf intake simplify` is a different command.

---

## Design mode

| Mode | Fewer elements | Less intensity |
|---|---|---|
| Persuade | One offer and one working action. Every element serves that offer or goes. | More restraint and more air. Drama is reduced, not removed. |
| Experience | Cut the interface until the work leads. | The palette calms and the type breathes. |
| Operate | Cut to the task. Density is a permission, not clutter. | Fewer background accents, flatter cards, less color, less motion. The data dominates. |
| Read | Cut the chrome around the column. Do not cut wayfinding. | The same as Operate. |

---

## Which section

| The person says | Section |
|---|---|
| "too much", "cluttered", "too many steps", "what can go?" | Fewer elements |
| "too loud", "noisy", "overwhelming", "calm it down" | Less intensity |
| both, or unclear | Fewer elements first, then less intensity on what remains |

Name the one primary goal of the surface before either section. When the brief and the code do not show it, ask per [_question-craft.md](../_question-craft.md). Do not guess.

## Fewer elements

Ask of every element: "If this was not here, what would break or get worse?" When the answer is "nothing", remove it. Simplicity does not remove features. It removes obstacles between the person and the goal.

1. **Inventory.** List the elements of the surface: text, controls, containers and decoration. List each competing action and each extra path forward.
2. **Classify each element.**

   | Class | Meaning | Do |
   |---|---|---|
   | Essential | Serves the primary task directly | Keep it |
   | Contextual | Needed sometimes | Disclose it on demand |
   | Decorative | Visual only, with no information | Remove it, unless it carries the world of the direction |
   | Redundant | Another element carries the same information | Remove one |

3. **Disclose a contextual element on demand.** Put it behind a control that works with touch and the keyboard: an expand control, a detail panel, or a popover that opens on a press. Show state text only in its state. Do not move help that a person needs to act into a hover tooltip: touch cannot reach it.
4. **Simplify the interaction.** Give each view one primary action, and make the common choice the default. Remove each step that the flow can lose. Ask only for the fields that the first action needs. Remove a confirmation for an action that can be undone. Replace a modal with inline editing where you can.
5. **Simplify the system.** Remove each color, size and weight that has no distinct role. Remove one-off gaps. Flatten nesting, and remove a container that carries no meaning.

For each removed item, record the item and the reason, the new path to it when people still need it, and the signal to watch after release.

## Less intensity

Find the sources of the noise first:

| Noise | Sign | Calm it |
|---|---|---|
| Visual | Borders, fills and shadows that encode nothing | Remove the border where space separates. Remove the fill where structure makes the boundary. Remove a shadow that no depth token names. |
| Color | Three or more accents; color on secondary information | One or two accents: the action and the current selection. Move secondary information to neutrals. Lower the chroma of a loud color with a token change. |
| Type | Many sizes and weights | Fewer steps of the scale in use, and two weights for most surfaces. Step a heavy weight down. |
| Scale and contrast | Every element is large; hard contrasts side by side | Smaller steps between sizes. One lead. |
| Motion | Motion with no purpose | The removal gate below |
| Copy | Text that repeats the control or the heading | Shorter labels. Say each idea once ([clarify.md](clarify.md)). |

- Keep the color strategy of the brief. On a Restrained surface, keep it neutral. On a Committed, Full palette or Drenched surface, lower the chroma; do not drain the color.
- Keep semantic color: error, success and warning are functional.
- Change a value through its token. Do not write a calmer raw value in the page.

Generic quiet is gray text on white, one sans at one weight, and a grid of identical cards. That result fails. Restraint keeps a point of view.

### The removal gate for motion

Put each animation on trial. "It is already there" and "it looks nice" are no defense. Record the deciding branch.

| The animation | Decision |
|---|---|
| Has a keyboard trigger (a shortcut, a command palette, a focus jump) | Delete |
| Runs 100 or more times a day (core navigation, tab switches, list rows) | Delete |
| Moves functional data (a chart, a table, a number), with no real change of value on the person's action | Delete |
| Has no named purpose ([animate.md](animate.md) → Gate 2), and is not a rare first-time moment | Delete |
| Runs tens of times a day (hover, a frequent toggle) | Reduce |
| Is over the limits of [animate.md](animate.md) → Easing and duration, or slides where a fade says the same | Reduce |

**Reduce** means a smaller version of the same motion, not a new one: a hover becomes a change of color or opacity; a frequent entrance becomes opacity only; a long stagger becomes one fade of the group; an infinite loop runs once, or keeps its end state. When the reduced motion no longer carries its purpose, delete it.

Where to look: motion on keyboard and high-frequency surfaces; reveals on every scrolled section; hover lift on cards that are not the main action; infinite pulses, glows and spins that are not progress; charts that redraw and numbers that count up on each load; a transition on every property.

## Validate

- Is the primary content or action easier to find?
- Is the essential information still present, with a clear path to what was disclosed?
- Is the hierarchy stronger than before?
- Is the result simpler and calmer, or only emptier?
- Does the point of view survive the cuts?

## Never

- Removing an element that is essential in a rare but critical case: an error state, an accessibility affordance.
- Removing redundancy that serves accessibility: a visual and a text label together.
- Hiding information that people need, with no clear path to it.
- Making everything the same weight, or everything small and light. A surface needs anchors.
- Removing all color. Quiet is not grayscale.
- Simplifying a complex domain below the real complexity of the task.

## In the workflow

This file is a move. [_lane.md](_lane.md) → Moves says when each use runs. A note follows [_output.md](_output.md).

### At the design stage

The move changes these things in the screens: the elements removed or disclosed, the steps of a flow removed or merged, and the tokens calmed (accents, chroma, weights, depth). The contract records the primary goal, each removed item with its reason and its new path, and what kept the point of view.

### As a pass on an approved design

The pass changes nothing. Write each answer as a finding with its screen key or `file:line`.
1. What is the one primary goal of each screen, and what competes with it?
2. Which elements are decorative or redundant, by the classification?
3. Which noise sources of the table are present?
4. Which animations does the removal gate delete or reduce? List 2–5 that it keeps, each with the purpose that saved it.
5. What would be lost by each removal? Name the rare case that still needs the element.

### In implement

Before you delete an animation, check what depends on it:
- A start state that hides the element (opacity 0 until the animation runs). Delete it with the animation, or the element stays invisible.
- Code that waits for the end of the animation, an exit that delays the removal of a view, and focus that moves after the motion. Move each to the moment of the change.
- A layout animation that hides a jump. When the jump shows, keep the animation and record the jump as a finding.
- Tests that wait for the motion.

After the removals, delete what they left unused: keyframes, wrappers, variants, imports, styles and components. Propose the removal of a motion library; do not remove it in the same change.

---

> *Parts adapted from impeccable v4.7.0 (`pbakaus/impeccable`, `374a0e179`), Apache-2.0.*

> *The removal gate, the reduce rules and the removal hazards are adapted from Emil Kowalski's skill `remove-animations` ([github.com/emilkowalski/skills](https://github.com/emilkowalski/skills), commit `a81dbca`, 2026-10-28). MIT license.*
