> **Additional context needed**: target context, constraints, or platform requirements.

Adapt an existing design to a new context: a window size, an input method, a platform or a medium. Rethink the experience for that context. Do not scale it.

---

## Design mode

Persuade and Experience: keep the world in every context. Never reduce it to a generic version. The constraints change; the character does not.

Operate: keep every task complete in every context. The structure changes; the type size does not. Keep the standard navigation.

Read: keep the reading order, the wayfinding, a real measure and the body size.

---

## Assess the context

Before you change anything:
1. Name the source context and the assumptions it makes: window size, input, connection and attention.
2. Name the target context: device class, input method, orientation, posture and connection.
3. List what will not fit, what will not work, and what will feel foreign in the target.

## Types of adaptation

### Responsive adaptation (desktop → mobile / mobile → desktop)

**Desktop to mobile**:
- Start from content priority: what does the person need most on a small window?
- Collapse multi-column layouts: main content first, secondary content second, navigation last (or behind a menu).
- Give every touch target the platform's minimum hit area ([_platforms.md](_platforms.md) → minimum hit area).
- Simplify navigation: a bottom tab bar (4–5 items at most) or a drawer replaces complex navigation.
- Keep body text at the platform body size or larger. On the web, that is 16 px.
- Remove information that only hover shows (tooltips, hover reveals). Give it a touch path.

**Mobile to desktop**:
- Expand with purpose. Do not stretch a single column to the full width.
- Add columns where they improve content relationships (sidebar and main, list and detail).
- Show more of what the small window hid (secondary actions, metadata).
- Use hover for progressive disclosure only on a hover pointer. Never make hover the only path.
- On a Persuade or Experience surface, display type may grow with the window. On an Operate surface, keep a fixed type scale and change the structure.

### Large windows, orientation and foldables

- Restructure for a large window. Do not stretch.
- Show list and detail side by side when the width allows.
- Let the navigation shape follow the width: a bar, then a rail, then a sidebar.
- Treat split screen as a window size, not as a special case.
- Take the structure from the window size class ([_platforms.md](_platforms.md) → window size class). Never take it from the device model.
- Restructure for landscape. Never letterbox.
- Lock the orientation only when the task demands it.
- Test a foldable folded, unfolded and half-open.

### Platform to platform

- Translate idioms. Never transplant them.
- Rebuild navigation and controls in the vocabulary of the target platform ([_platforms.md](_platforms.md) → Idioms).
- Carry the palette intent, the type accent and the motion personality through the target theme.
- Respect the safe areas (notch, home indicator, camera cutout).
- Use the platform font stack unless the brand font is essential ([_platforms.md](_platforms.md) → Idioms).

**Light to dark mode**:
- Build on a token system. Do not create a separate dark-mode stylesheet.
- Give every neutral color token a dark counterpart.
- Never invert. A dark theme uses a dark surface, not a negative of the light palette.
- Dark backgrounds: use `oklch(10–20% 0.01 hue)`, dark and tinted, not pure black.
- Show elevation with a lighter surface for each higher layer. Keep a shadow only where it still reads. Give it an offset and a soft blur. Never use a zero-offset glow as depth.

### Viewport context adaptation
- Print: remove navigation and controls. Break pages at logical points. Show full link targets and hidden sections. Add the title and the date.
- High-DPI (Retina): SVG or 2× image assets for icons and critical images.
- Narrow embedding (widget, iframe): strip all chrome, keep only essential content.
- Email: one column about 600 px wide. Make each action a large button. Expect no hover. Link a complex task back to the app.

## Adaptation principles

**What must survive adaptation**: the design's essential character — the choices that make it recognizable as this product.

**What can change**: layout structure, interaction model, font scale, navigation pattern, information density.

**What must change**: touch targets, navigation patterns, content priority ordering for the new context.

**Input and structure**:
- Set hit areas and hover from the pointer type ([_platforms.md](_platforms.md) → coarse pointer), not from the window width. A laptop can have touch.
- Keep one information architecture in every context.
- Never hide a core function on a small window.
- A large window is not a fast device. Do not assume a fast connection or a fast processor.
- Break the layout where the content breaks, not at a device width.

## Feel native on the target platform

A surface can be correct and still feel like a foreign app. These principles hold on every platform; the checklists below give their form on each target in [_platforms.md](_platforms.md). Another platform gets the principles only.

**Principles.**
1. **System gestures and system back win.** The app never captures the platform's back gesture, edge swipes, or pull-to-refresh by accident.
2. **Content respects the insets.** Nothing important sits under the notch, the home indicator, the system bars, the keyboard or the window chrome; backgrounds may extend under them.
3. **The system bars match the surface**, in light and dark themes.
4. **A focused text field never zooms or jumps the screen**, and the layout reacts to the on-screen keyboard.
5. **Touch gets press feedback, never hover motion.** Feedback starts on press, not on release.
6. **A press responds within one frame.** No artificial tap delay.
7. **Text selection stays on content, off controls.** A long press on a button never selects its label.
8. **A gesture surface claims only its own axis.** A horizontal carousel never blocks vertical scrolling.
9. **The largest system text size still works** ([_platforms.md](_platforms.md) → largest text size).
10. **Test on real hardware.** Emulation and a desktop pointer do not count.

**A web app on a phone.**
- Gate every hover style behind the hover-pointer check; a tap otherwise leaves a stuck hover state.
- Remove the tap highlight flash (`-webkit-tap-highlight-color: transparent`).
- Use `100dvh` for an app shell and bottom-pinned UI, `100svh` for a marketing hero; never `100vh`.
- Inputs use a font size of 16 px or more, or the page zooms on focus. Never disable zoom (`user-scalable=no`, `maximum-scale=1`) to hide it.
- Start press feedback on `:active` or `pointerdown`; set `touch-action: manipulation` on controls.
- Use `overscroll-behavior` (not `touchmove` with `preventDefault()`) where pull-to-refresh must not take the scroll.
- Use `viewport-fit=cover` with `env(safe-area-inset-*)`; without the meta value the insets are 0.
- Use `user-select: none` on controls only, never on `body`.
- Use `touch-action: pan-y` on a horizontal gesture surface.
- Give `theme-color` one value for each color scheme.
- Add `interactive-widget=resizes-content` to the viewport meta so the keyboard resizes the layout.

**iOS.**
- Lay content inside the safe area; let only backgrounds extend under it.
- Keep the interactive back swipe working on every pushed screen, including custom navigation bars.
- Support Dynamic Type up to the accessibility sizes; nothing clips or overlaps.
- Pair a committing press with a light haptic; never haptics on every tap.
- On iPad, give pointer hover effects only where a pointer exists.

**Android (Compose).**
- Draw edge-to-edge and pad content with the safe-drawing insets; pad input areas with the keyboard (IME) insets.
- Support predictive back with the current back handler, and keep the system back gesture free.
- Match the system bar appearance to the surface in both themes.
- Support font scale 200%; nothing clips.
- Use the haptic types for confirm, toggle and long press; never on every tap.
- Give hover feedback only for mouse and stylus input.

**Desktop.**
- Reach every action by keyboard, with visible focus and the platform's shortcuts (Escape closes; standard copy, undo and back keys work).
- Lay out for live window resizing, from the narrowest supported width to a very wide window.
- Use hover for progressive disclosure, but never as the only way to reach an action.
- Honor the system reduced-motion setting and the system text scaling.
- Respect the platform's title bar, window controls and full-screen behavior.

## Validate

After adaptation:
- Does it feel complete for the target context, not a reduced or broken version?
- Is the essential character of the product kept?
- Are all interactive elements reachable without hover?
- Does the information hierarchy work in the new layout?
- Is it tested at the actual target window size and device?
- Does every principle of "Feel native on the target platform" hold on real hardware?
- Tap each custom control. Then drag it to its end with the target input.
- Swipe across each custom control on the scroll axis. The page scrolls, and the control stays.
- Name the evidence source of each gesture check: emulation, synthetic touch or a real device. A screenshot proves layout, never a gesture.
- Report missing hardware as a gap.

## In the workflow

This file is a move, not a stage.
- **Design not confirmed:** `/wf design <slug> adapt` focuses the design stage and its contract `02c-craft.md` on the target context.
- **Design confirmed:** `/wf design <slug> adapt` runs the checks of this file against the approved screens and the built UI, and draws nothing ([stage.md](stage.md) → Move pass).
- `plan` cites this file as a step pointer; `implement` applies it.
- Every run writes `design-notes/adapt-<timestamp>.md` per [_output.md](_output.md) with: the source and target contexts, the structure and input changes, each gesture check with its evidence source, and the hardware gaps.
- Before you draw or edit UI, load [_craft-floor.md](_craft-floor.md). Check the result against its Refuse and Verify lists.

---

> *Parts adapted from impeccable v4.7.0 (`pbakaus/impeccable`, `374a0e179`), Apache-2.0.*

> *The web-on-a-phone checklist is adapted from Emil Kowalski's `mobile-native` skill ([github.com/emilkowalski/skills](https://github.com/emilkowalski/skills), commit `2d22863`, 2026-10-11). MIT license.*
