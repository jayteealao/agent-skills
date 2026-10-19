# Motion recipes (`design/_motion-recipes.md`)

Ready-to-build ingredients for the cases that come up most. Start from the recipe, then adapt; do not rebuild from a blank file. [animate.md](animate.md) loads this file when a request matches a recipe.

Each recipe is platform-neutral. The terms (cheap property, retargetable animation, trigger origin, and so on) and the curve tokens (`ease-out`, `ease-in-out`, `ease-drawer`) are defined in [animate.md](animate.md) and mapped to each platform in [_platforms.md](_platforms.md). The web snippets at the end show one form; build the other platforms from the map.

> Load with: `design/_motion-recipes.md`

## The ingredients

| Recipe | Trigger | Properties (start → end) | Curve and time | Origin | Reduced motion |
|---|---|---|---|---|---|
| Press feedback | Press state | scale 1 → 0.97 | `ease-out`, 160 ms | Center | Keep |
| Popover, dropdown, menu, select | Open / close | scale 0.95 → 1, opacity 0 → 1 | `ease-out`, 200 ms | Trigger origin | Opacity only |
| Tooltip | Open / close after a delay | scale 0.97 → 1, opacity 0 → 1 | `ease-out`, 125 ms; 0 ms once one is open | Trigger origin | Opacity only |
| Modal | Open / close | scale 0.96 → 1, opacity 0 → 1; backdrop opacity 0 → 1 | `ease-out`, 250 ms | Center (exempt) | Opacity only |
| Drawer, sheet | Open / close | offset 100% of own height → 0 | `ease-drawer`, 500 ms | — | Opacity only |
| Toast | Added / dismissed | offset 100% → 0, opacity 0 → 1; exit on the entry edge | `ease`, 400 ms | — | Opacity only |
| Accordion, collapse | Expand / collapse | height (measured) and opacity | `ease-out`, 200 ms | — | Instant height, opacity kept |
| Group entrance | First show of an occasional screen | opacity 0 → 1, offset 8 px → 0 | `ease-out`, 300 ms; 30–80 ms stagger | — | Opacity only, no stagger |
| Hold to confirm | Press and hold | clip of a fill overlay from one edge → full; scale 0.97 while held | Fill: linear, 2 s. Release: `ease-out`, 200 ms | — | Keep the fill (it is progress) |
| Tab indicator with color | Active tab change | clip of an "active" copy of the tab list | `ease-in-out`, 250 ms | — | Instant |
| Scroll reveal | Element enters the viewport, once | clip from the bottom edge → full | `ease-in-out`, 600 ms | — | No reveal |
| Drag to dismiss | Drag, then release | offset follows the finger 1:1; settle with a spring | spring `duration 0.5 s, bounce 0` (product), `bounce 0.2` (brand) | — | Settle with opacity |
| Crossfade that will not settle | State swap | blur 0 → 2 px → 0, opacity 1 → 0.7 → 1 | `ease`, 200 ms | — | Plain crossfade |
| Contextual icon swap | State change | opacity 0 → 1, scale 0.25 → 1, blur 4 px → 0 | spring `duration 0.3 s, bounce 0` | Center | Opacity only |

## Notes for each recipe

- **Press feedback.** Applies to any pressable element. Scale also scales the label and icons, which reads as a physical press. A press is not hover: it needs no hover-pointer gate. On iOS and Android, pair it with the platform's light haptic only where the press commits something. Give the component a way to turn the scale off for toolbars of fast-repeated controls.
- **Popover family.** The trigger origin is the whole point: the panel must look as if it came out of the control that opened it.
- **Tooltip.** The first tooltip waits before it opens, to prevent accidental triggers. Once one is open, neighbors open with no delay and no animation; the toolbar feels faster.
- **Modal.** The one popover that stays centered. Animate the backdrop with it so both read as one surface.
- **Drawer.** An offset relative to the element's own height works whatever the content. Add drag and it becomes the drag-to-dismiss recipe.
- **Toast.** `ease` and a slightly longer time than typical UI make it read as elegant; this matches Sonner's personality, not the generic budget. When stacked toasts reflow, tune opacity against height by eye, then check again the next day. Use a retargetable animation: toasts arrive faster than a restarting animation can finish.
- **Accordion.** One of the few tolerated layout animations; keep it short. Measure the content height; do not animate to an unknown size.
- **Group entrance.** Only for a screen seen occasionally, never for a list the person scrolls past all day. The stagger never blocks interaction.
- **Hold to confirm.** For destructive actions where a plain tap is too easy. The fill is linear because it is a progress indicator. The release snaps back fast: slow where the person decides, fast where the system responds.
- **Tab indicator with color.** Duplicate the tab list, style the copy as active, and clip the copy so only the active tab shows. Text and background change in sync, because one element is revealed instead of two colors interpolating.
- **Scroll reveal.** Marketing and brand surfaces only, and only once per element. Re-animating on every scroll-by fights the reader.
- **Drag to dismiss.** Dismiss on distance **or** on a flick (speed above ≈0.11 px/ms). Hand the release velocity to the settling spring. Capture the pointer, ignore extra touch points, rubber-band past the edge. Write the offset to the dragged element directly, never through a value that every child inherits.
- **Crossfade that will not settle.** Use only after easing and duration tuning failed. Blur blends two states into one perceived change. Keep blur under 20 px.
- **Contextual icon swap.** Only icons that appear on hover, change with state, or live in a toolbar. When no animation library is present, keep both icons mounted, one over the other, and cross-fade them with a retargetable animation on the curve `0.2, 0, 0, 1`.

## Web snippets

Curve tokens as CSS custom properties:

```css
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);
--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
```

Press feedback:

```css
.button { transition: transform 160ms var(--ease-out); }
.button:active { transform: scale(0.97); }
```

Popover (Base UI supplies `--transform-origin` and the starting/ending attributes):

```css
.popover {
  transform-origin: var(--transform-origin);
  transition: opacity 200ms var(--ease-out), transform 200ms var(--ease-out);
}
.popover[data-starting-style],
.popover[data-ending-style] { opacity: 0; transform: scale(0.95); }
.tooltip[data-instant] { transition-duration: 0ms; }
```

Toast, with entry and no mount flag:

```css
.toast {
  opacity: 1; transform: translateY(0);
  transition: opacity 400ms ease, transform 400ms ease;
  @starting-style { opacity: 0; transform: translateY(100%); }
}
```

Hold to confirm:

```css
.overlay { clip-path: inset(0 100% 0 0); transition: clip-path 200ms var(--ease-out); }
.button:active .overlay { clip-path: inset(0 0 0 0); transition: clip-path 2s linear; }
```

Drag to dismiss:

```js
const velocity = Math.abs(swipeAmount) / (Date.now() - dragStart);
if (Math.abs(swipeAmount) >= SWIPE_THRESHOLD || velocity > 0.11) dismiss();
element.style.transform = `translateY(${distance}px)`; // not a CSS variable on the parent
```

Reduced motion and the hover pointer:

```css
@media (prefers-reduced-motion: reduce) {
  .popover { transition: opacity 200ms var(--ease-out); transform: none; }
}
@media (hover: hover) and (pointer: fine) {
  .card:hover { transform: translateY(-2px); }
}
```

Programmatic, without a library (Web Animations API):

```js
element.animate(
  [{ clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0 0)' }],
  { duration: 600, fill: 'forwards', easing: 'cubic-bezier(0.77, 0, 0.175, 1)' }
);
```

---

> *Adapted from Emil Kowalski's `animate/RECIPES.md` ([github.com/emilkowalski/skills](https://github.com/emilkowalski/skills), commit `2d22863`, 2026-10-11) and Jakub Krehel's icon values. MIT license.*
