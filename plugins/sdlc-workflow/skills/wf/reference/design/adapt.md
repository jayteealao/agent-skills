Adapt an existing design to a new context: a window size, an input method, a platform or a medium. Rethink the experience for that context. Do not scale it.

---

## Design mode

| Mode | Keep |
|---|---|
| Persuade and Experience | The world, in every context. The constraints change; the character does not. Do not reduce it to a generic version. |
| Operate | Every task complete in every context. The structure changes; the type scale does not. Keep the standard navigation. |
| Read | The reading order, the wayfinding, the measure and the body size. |

---

## Assess the context

Before you change anything:
1. Name the source context and the assumptions that it makes: window size, input, connection and attention.
2. Name the target context: device class, input method, orientation, posture and connection.
3. List what will not fit, what will not work, and what will feel foreign in the target.

| | Rule |
|---|---|
| Must survive | The essential character: the choices that make it recognizable as this product. One information architecture in every context. Every core function. |
| Can change | Layout structure, interaction model, navigation pattern, information density. |
| Must change | Hit areas, navigation patterns and the order of content priority, for the new context. |

## Window size

**To a smaller window:**
- Start from content priority: what does the person need most?
- Collapse columns: main content first, secondary content second, navigation last or behind a control.
- Give each control the touch target of [_craft-floor.md](_craft-floor.md) rule 5.
- Replace complex navigation with the top-level navigation idiom of the platform ([_platforms.md](_platforms.md) → Idioms).
- Give a touch path to everything that only hover shows.

**To a larger window:**
- Restructure. Do not stretch one column to the full width.
- Add columns where they improve content relationships: a sidebar and the main area, a list and its detail.
- Show more of what the small window hid.
- Let the navigation shape follow the width: a bar, then a rail, then a sidebar.
- On a Persuade or Experience surface, display type may grow with the window. On an Operate surface, keep the type scale and change the structure.

**In both directions:**
- Take the structure from the window size class ([_platforms.md](_platforms.md) → window size class), not from the device model. Split screen is a window size.
- Break the layout where the content breaks, not at a device width.
- Restructure for landscape. Do not letterbox. Lock the orientation only when the task demands it.
- Set hit areas and hover from the pointer type ([_platforms.md](_platforms.md) → coarse pointer), not from the window width. A laptop can have touch.
- A large window is not a fast device.

## Platform to platform

- Translate idioms. Do not transplant them. Rebuild navigation and controls in the vocabulary of the target ([_platforms.md](_platforms.md) → Idioms).
- Carry the palette intent, the type accent and the motion personality through the theme of the target.
- Keep content inside the insets of the platform: the notch, the home indicator, the system bars, the keyboard and the window chrome. A background may extend under them.
- Use the font stack of the platform, unless the brand face is essential to the direction.

## Light to dark

- Build on the tokens. Give every color role a value in each theme. Do not write a separate dark stylesheet.
- Do not invert. Compose the dark theme on its own ([colorize.md](colorize.md)).
- Take the dark ground from the scene sentence and the palette. With nothing to go on, start from a very dark tint of the dominant color and not from pure black, then adjust it to the direction.
- Show elevation with a lighter surface for each higher layer ([polish.md](polish.md) → Depth).

## Other media

| Medium | Do |
|---|---|
| Print | Remove navigation and controls. Break pages at logical points. Show full link targets and hidden sections. Add the title and the date. |
| High-density display | Vector or 2× assets for icons and critical images. |
| Narrow embedding (a widget, an iframe) | Strip the chrome. Keep the essential content. |
| Email | One column about 600 px wide. Make each action a large button. Expect no hover. Link a complex task back to the app. |

## Feel native on the target platform

A surface can be correct and still feel like a foreign app. These principles hold on every platform. A screen page can show the first four; the others are build rules.

1. **The idioms are those of the platform:** its navigation, its controls, its sheets and its icons.
2. **Content respects the insets.**
3. **The system bars match the surface**, in the light and the dark theme.
4. **The largest system text size still works** ([_platforms.md](_platforms.md) → largest text size).
5. **System gestures and system back win.** The app does not capture the back gesture, an edge swipe or pull-to-refresh by accident.
6. **A focused text field does not zoom or jump the screen**, and the layout reacts to the on-screen keyboard.
7. **Touch gets press feedback, not hover motion.** Feedback starts on press, not on release, within one frame.
8. **Text selection stays on content, off controls.**
9. **A gesture surface claims only its own axis.** A horizontal carousel does not block vertical scrolling.

## Validate

- Does it feel complete for the target context, not a reduced version?
- Is the essential character of the product kept?
- Is every interactive element reachable without hover?
- Does the information hierarchy work in the new layout?

## In the workflow

This file is a move. [_lane.md](_lane.md) → Moves says when each use runs. A note follows [_output.md](_output.md).

### At the design stage

The move changes these things in the screens: the structure of each screen at each viewport of `screens.json`, the navigation idiom, the touch sizes of the components, and the theme roles. Set the viewports of the target with `wf.mjs design viewports`. For a native target, draw the idioms of its platform file. The contract records the source and the target contexts, and each change of structure and input.

### As a pass on an approved design

The pass changes nothing. Write each answer as a finding with its screen key and viewport, or `file:line`.
1. What does each screen assume about window, input, connection and attention? Which assumption fails in the target?
2. Does each viewport restructure, or only scale?
3. Is anything reachable by hover only?
4. Which idiom is transplanted from another platform?
5. Does each principle of "Feel native" hold? For principles 5–9, name the evidence source: emulation, synthetic touch or a real device. A screenshot proves layout, not a gesture. Report missing hardware as a gap.

### In implement

Test on real hardware. Tap each custom control, then drag it to its end with the target input. Swipe across each custom control on the scroll axis: the page scrolls, and the control stays.

**A web app on a phone.**
- Gate every hover style behind the hover-pointer check; a tap otherwise leaves a stuck hover state.
- Remove the tap highlight flash (`-webkit-tap-highlight-color: transparent`).
- Use `100dvh` for an app shell and bottom-pinned UI, and `100svh` for a marketing hero. Do not use `100vh`.
- Inputs use a font size of 16 px or more, or the page zooms on focus. Do not disable zoom (`user-scalable=no`, `maximum-scale=1`) to hide it.
- Start press feedback on `:active` or `pointerdown`. Set `touch-action: manipulation` on controls.
- Use `overscroll-behavior` (not `touchmove` with `preventDefault()`) where pull-to-refresh must not take the scroll.
- Use `viewport-fit=cover` with `env(safe-area-inset-*)`; without the meta value, the insets are 0.
- Use `user-select: none` on controls only, not on `body`.
- Use `touch-action: pan-y` on a horizontal gesture surface.
- Give `theme-color` one value for each color scheme.
- For the on-screen keyboard, see [_platforms-web.md](_platforms-web.md) → The keyboard on a phone.

**iOS.**
- Keep the interactive back swipe working on every pushed screen, including one with a custom navigation bar.
- Support Dynamic Type up to the accessibility sizes. Nothing clips or overlaps.
- Pair a committing press with a light haptic. Do not put a haptic on every tap.
- On iPad, give pointer hover effects only where a pointer exists.

**Android (Compose).**
- Draw edge-to-edge, and pad content with the safe-drawing insets. Pad input areas with the keyboard (IME) insets.
- Support predictive back with the back handler of the platform file, and keep the system back gesture free.
- Support font scale 200%. Nothing clips.
- Use the haptic types for confirm, toggle and long press. Do not put a haptic on every tap.
- Give hover feedback only for mouse and stylus input.

**Desktop.**
- Reach every action by keyboard, with visible focus and the shortcuts of the platform.
- Lay out for live window resizing, from the narrowest supported width to a very wide window.
- Honor the system reduced-motion setting and the system text scaling.
- Respect the title bar, the window controls and the full-screen behavior of the platform.

---

> *Parts adapted from impeccable v4.7.0 (`pbakaus/impeccable`, `374a0e179`), Apache-2.0.*

> *The web-on-a-phone checklist is adapted from Emil Kowalski's `mobile-native` skill ([github.com/emilkowalski/skills](https://github.com/emilkowalski/skills), commit `2d22863`, 2026-10-11). MIT license.*
