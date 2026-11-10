Harden a UI against real people, real data and real failures. Make it work for people with visual, motor or cognitive differences. Make it hold the inputs, errors and languages that real use produces.

The numbers of this move are in [_craft-floor.md](_craft-floor.md) → Verify. This file says how to meet them. `wf.mjs design check` sends a failure of contrast in a state, focus, target size, worst-case content, display or page states to this file.

## Focus

- Every control shows a visible focus indicator, in the light and the dark theme (floor rule 2).
- Do not remove the focus ring without a replacement that the tokens define.
- A dialog, a dropdown or a custom widget returns focus to its trigger when it closes.

## Color and contrast

- Meet floor rules 1, 3, 15 and 16. Check every state, each overlay, text on an image, and both themes.
- Look at the surface with protanopia and deuteranopia simulated.
- Look at the surface with the high-contrast setting of the platform on ([_platforms.md](_platforms.md) → high-contrast setting). Every control, focus ring and state stays visible.

## Touch targets

`wf.mjs design check` fails a control whose hit area is under 24 by 24 CSS px. It measures the largest of three boxes: the control, a pseudo-element of the control, and a label that wraps the control.

| Case | Do |
|---|---|
| The control is at least the minimum | Nothing. |
| The visible mark is smaller, for example a 20 px checkbox or a small icon button | Keep the mark. Extend the hit area with a centered pseudo-element of the control, at the size of floor rule 4, or rule 5 on a touch surface. Do not pad the layout to reach the size. |
| A checkbox, a radio or a switch has a text label | Wrap the control in its label, so the label is the hit area. |
| Two extended hit areas would overlap | Shrink each to the largest size that does not collide. When that is under the minimum, move the controls apart. |

```css
/* Web: a 20 px mark with a 44 px hit area. */
.icon-button { position: relative; inline-size: 20px; block-size: 20px; }
.icon-button::after { content: ""; position: absolute; inset: 50% auto auto 50%; inline-size: 44px; block-size: 44px; translate: -50% -50%; }
```

On a touch surface, design to the touch target of floor rule 5, not to the 24 px minimum.

## Text

- Meet floor rules 17–22.
- Text reflows at 400% zoom with no horizontal scroll.
- Do not justify body copy.
- Do not fix the width of a text container.
- On a phone, a text field below 16 px can zoom the page on focus ([adapt.md](adapt.md)).

## Failures

Draw the `error` state of each screen from the failure that the surface can meet. Map each failure to a state:

| Failure | The state shows |
|---|---|
| Invalid input | The error at its field |
| Not signed in | A sign-in path that keeps the input |
| No permission | What is missing, and who grants it |
| Not found | A way back |
| Rate limited | When to try again |
| Server fault | A plain message, a retry and a support path |
| Offline, slow or timed out | The state and a retry |

- Keep the person's input after every error.
- When one component fails, the rest of the surface still works.
- Mark a required field before the submit, not only after a failure.
- The words of each message follow [clarify.md](clarify.md) → Errors and permissions.

## Worst-case content

The catalog and its steps are in [_worst-case.md](_worst-case.md). The `worst` state of each screen draws it.

## Language and locale

- Lay out by start and end edges, not by left and right ([_platforms.md](_platforms.md) → start and end edges). A right-to-left language then mirrors the layout.
- Mirror the icons that show direction (back, forward, a progress arrow) in a right-to-left language. Do not mirror a logo, a clock or a media control.
- Format dates, numbers, currency and plurals with the locale formatter of the platform. Do not build a plural from a count test such as "one, else add s". Many languages have more plural forms.
- Leave 30–40% spare space for translation.
- Test with CJK text, emoji and a right-to-left script.
- Keep the zero-width non-joiner (U+200C) in Persian and Kurdish text. It splits the joined letters of a compound word, and a filter that strips it changes the meaning.
- Store the Persian and the Arabic forms of Yeh (ی, ي) and Kaf (ک, ك) as typed. For search and validation, treat each pair as one letter, so input from either keyboard matches.
- Take the digits from the locale formatter. Do not assume them from the script. Persian uses its own digits (U+06F0–U+06F9). Some Arabic locales use Arabic-Indic digits (U+0660–U+0669), and others, such as those of the Maghreb, use Western digits.
- Take the calendar from the locale formatter. Persian uses the Solar Hijri calendar. Most Arabic locales use the Gregorian calendar for civil dates; a few default to a Hijri calendar.

## Never

- Removing the focus ring without a replacement.
- Color as the only indicator of a state.
- A custom interactive element without the standard keyboard pattern of its role.
- An image with no text alternative.
- A failure that loses the person's input.

## In the workflow

This file is a move. [_lane.md](_lane.md) → Moves says when each use runs. A note follows [_output.md](_output.md); this file defines no report of its own.

### At the design stage

The move changes these things in the screens:
- the `worst` state of each screen, from [_worst-case.md](_worst-case.md);
- the `error` state of each screen, from the Failures table;
- the focus indicator and the hit area of each component in `components.css`;
- start and end edges, and room for a longer translation.

### As a pass on an approved design

The pass changes nothing. Answer each question with a screen key or a `file:line`, and write each "no" as a finding.
1. Does `wf.mjs design check` pass for contrast, focus, target size, worst-case content, display and page states?
2. Does every control show its focus, and does each closing widget return it?
3. Does any state use color as its only signal?
4. Does the `worst` state hold at the narrowest viewport, and did the person decide each wrap, truncation and fallback?
5. Does the `error` state match the failure that the surface can meet?
6. Does the layout hold in a right-to-left language and at the largest text size?
7. When built code exists: do the rules of "In implement" hold in it?

### In implement

**Keyboard.** Every interactive element is reachable by Tab, in the visual order. No keyboard trap. A page with navigation has a skip link to the main content. A custom interactive element (accordion, tabs, combobox) follows the standard keyboard pattern of its role.

**Semantics.** Heading levels run in order. Mark the page regions as landmarks. Use the native control of the platform for each role: a button for an action, a link for navigation. Give every input a label that assistive technology reads. Mark a real list as a list. The platform forms are in [_platforms.md](_platforms.md) → accessibility semantics.

**Announcements.** Announce content that updates without a navigation. A dialog carries the dialog role, holds focus while it is open, and takes its name from its title. Tabs expose the tab list, each tab, its panel and the selected tab. Mark a required field for assistive technology. Link each error message to its field.

**Images and icons.** A decorative image has an empty text alternative, not a missing one. An informative image has a text alternative that says what the image communicates. An icon-only button has an accessible name that names its action.

```html
<!-- Web -->
<main> <nav> <header> <footer> <aside>
<button> for an action, <a> for navigation
<label for="…"> or aria-label / aria-labelledby
aria-live="polite" | role="alert"
role="dialog" aria-modal="true" aria-labelledby="…"
role="tablist" / "tab" / "tabpanel" with aria-controls and aria-selected
aria-required="true"; aria-describedby="<error id>"
alt="" (decorative); aria-hidden="true" on a decorative icon
```

**Concurrent operations.** Send one request per action. While the request runs, disable or ignore a repeat. An optimistic update shows the result at once; when the request fails, restore the previous state and say what failed. When responses arrive out of order, show the result of the latest request only. When two people edit one item, show the conflict. Test: press submit 10 times fast, and expect one request.

**Interrupted gestures.** A custom slider, drag surface or scrolling control strip survives an interrupted gesture ([_platforms.md](_platforms.md) → interrupted gesture). A gesture ends when the system cancels it, when pointer capture is lost, when the pointer is released outside the control, or when the window loses focus. On each end, clear the drag state and release capture. A second finger or pointer does not take over a drag. Test: add a second finger mid-drag, scroll across the control, release outside it, switch windows mid-drag, then drag again. Name the evidence source: emulation, synthetic touch or a real device.

**Edge cases that nobody sees.** Pause a timer while its tab is hidden. Fill the gaps between stacked elements, so that hover does not break between them.

**Resource cleanup.** When a view closes, stop its timers, cancel its subscriptions and pending requests, and remove its listeners. A late response does not update a closed view.

**Worst case.** Make the worst case loadable in development ([_worst-case.md](_worst-case.md) → In later stages).

---

> *Parts adapted from impeccable v4.7.0 (`pbakaus/impeccable`, `374a0e179`; the Arabic-script rules from `687bc381b`), Apache-2.0.*
