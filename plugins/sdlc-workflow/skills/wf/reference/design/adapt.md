> **Additional context needed**: target context, constraints, or platform requirements.

Adapt an existing design to work in a new context — different viewport, different platform, different user context, or different constraints while preserving the design's essential character.

---

## Register

Brand: preserve the brand's essential aesthetic during adaptation. A mobile adaptation of a brand site should still feel like the same brand — not a stripped-down generic version. The constraints change; the character doesn't.

Product: preserve functional integrity during adaptation. A responsive product UI must work as well on mobile as on desktop — not just technically work, but feel purposeful and complete.

---

## Types of adaptation

### Responsive adaptation (desktop → mobile / mobile → desktop)

**Desktop to mobile**:
- Start from content priority: what does the user need most on a small screen?
- Collapse multi-column layouts: main content first, secondary content second, navigation last (or behind burger)
- Increase touch target sizes to 44×44px minimum
- Simplify navigation: bottom tab bar (4–5 items max), drawer, or tab bar replaces complex nav
- Increase body font size at small viewports: minimum 16px, often 17–18px for comfortable mobile reading
- Remove hover-state-only information (tooltips, hover reveals) — provide touch-accessible alternatives

**Mobile to desktop**:
- Expand with purpose — don't just stretch single-column to full width
- Introduce multi-column where it improves content relationships (sidebar + main, list + detail)
- Show more information that was hidden on mobile (secondary actions, metadata)
- Leverage hover states for progressive disclosure (tooltips, context menus)
- Increase typographic scale at larger viewports with `clamp()`

### Platform adaptation

**Web to native (React Native, Flutter, etc.)**:
- Replace web conventions (underlined links, box shadows) with native equivalents
- Follow platform navigation patterns (iOS: swipe-back, Android: back button or gesture)
- Respect safe areas (notch, home indicator, dynamic island)
- Native font stack unless brand fonts are critical: `-apple-system` on iOS, Roboto on Android

**Light to dark mode**:
- Build on a token system — don't create a separate dark-mode stylesheet
- Every neutral color token needs a dark counterpart
- Never just invert: dark mode uses a dark surface, not a negative of the light palette
- Dark mode backgrounds: use `oklch(10–20% 0.01 hue)` — dark tinted, not pure black
- Shadows in dark mode: use border + subtle glow instead of drop shadows

### Viewport context adaptation
- Print styles: `@media print` — remove navigation, sidebars, decorative elements; ensure content prints as a readable document
- High-DPI (Retina): SVG or 2× image assets for icons and critical images
- Narrow embedding (widget, iframe): strip all chrome, keep only essential content

## Adaptation principles

**What must survive adaptation**: the design's essential character — the choices that make it recognizable as this brand or product.

**What can change**: layout structure, interaction model, font scale, navigation pattern, information density.

**What must change**: touch targets, navigation patterns, content priority ordering for the new context.

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
- Does it feel complete for the target context (not a reduced/broken version)?
- Is the essential brand or product character preserved?
- Are all interactive elements reachable without hover?
- Does the information hierarchy work in the new layout?
- Is it tested at the actual target viewport/device?
- Does every principle of "Feel native on the target platform" hold on real hardware?

## In the workflow

This file is a move, not a stage. Before the design is confirmed, `/wf design <slug> adapt` focuses the visual contract `02c-craft.md` on it. After it is confirmed, the same command runs the checks above against the frozen boards and the built UI, and draws nothing ([stage.md](stage.md) → Move pass). `plan` cites it as a step pointer, and `implement` applies it and records `design-notes/<move>-<timestamp>.md` per [_output.md](_output.md). The absolute bans in [_design-context.md](_design-context.md) apply.

> *The web-on-a-phone checklist is adapted from Emil Kowalski's `mobile-native` skill ([github.com/emilkowalski/skills](https://github.com/emilkowalski/skills), commit `2d22863`, 2026-10-11). MIT license.*
