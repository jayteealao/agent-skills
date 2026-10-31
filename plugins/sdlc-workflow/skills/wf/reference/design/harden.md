Harden a UI against real people, real data and real failures. Make it work for people with visual, motor or cognitive differences. Make it handle the inputs, errors, languages and network conditions that real use produces.

## What to check and fix

### 1. Keyboard navigation

- Every interactive element is reachable by Tab.
- No keyboard trap: a dialog, a dropdown or a custom widget returns focus when it closes.
- The Tab order matches the visual order.
- A page with navigation has a skip-to-main-content link.
- A custom interactive element (accordion, tabs, combobox) follows the standard keyboard pattern for its role.

### 2. Focus indicators

- Every interactive element shows a visible focus ring.
- The focus ring has 3:1 contrast against the adjacent background.
- Never remove the focus ring without a custom replacement.
- The focus ring is visible in the light and the dark theme.

### 3. Color and contrast

- Body text: 4.5:1 contrast at minimum (WCAG AA).
- Large text (18 pt regular or 14 pt bold and larger): 3:1 at minimum.
- Controls and state indicators: 3:1 at minimum.
- Color is never the only signal. Pair it with a shape, an icon or text.
- Test with simulated protanopia and deuteranopia.
- Test with the system high-contrast setting on ([_platforms.md](_platforms.md)). Every control, focus ring and state stays visible.

### 4. Semantics and assistive technology

- Heading levels run in order, with no skipped level.
- Mark the page regions (main, navigation, header, footer, complementary) as landmarks.
- Use the platform's native control for each role: a button for an action, a link for navigation. Never a plain container with a click handler.
- Give every input a label that assistive technology reads.
- Mark a real list as a list. Never use list semantics for layout.
- The platform forms are in the accessibility semantics row of [_platforms.md](_platforms.md).

### 5. States and announcements

- Prefer native semantics to an added role.
- Announce content that updates without a navigation.
- A dialog carries the dialog role, holds focus while it is open, and takes its name from its title.
- Tabs expose the tab list, each tab, its panel and the selected tab.
- Mark a required field for assistive technology, not only with a visual asterisk.
- Link each error message to its field.

### 6. Images and icons

- A decorative image has an empty text alternative, not a missing one.
- An informative image has a text alternative that says what the image communicates, not what it shows.
- An icon-only button has an accessible name that names its action.
- Hide a decorative icon from assistive technology. Give an informative icon a title.

Web:
```html
<main> <nav> <header> <footer> <aside>      <!-- landmarks -->
<button> for an action, <a> for navigation  <!-- never role="button" on a div -->
<label for="…"> or aria-label / aria-labelledby
aria-live="polite" | role="alert"           <!-- announced updates and errors -->
role="dialog" aria-modal="true" aria-labelledby="…"
role="tablist" / "tab" / "tabpanel" with aria-controls and aria-selected
aria-required="true"; aria-describedby="<error id>"
alt="" (decorative); aria-hidden="true" on a decorative icon; <title> in an informative icon
```

### 7. Touch targets

- Every interactive element has the minimum hit area of [_platforms.md](_platforms.md) → minimum hit area. This is the one rule; `wf.mjs design check` enforces it on the web.
- Minimum 8 px between adjacent touch targets.
- When the visible control is smaller than the target (a 20 px checkbox, a small icon button), extend the hit area with a centered invisible layer, not with layout padding. Never let the hit areas of two interactive elements overlap. Shrink the layer to the largest size that does not collide.

### 8. Text and readability

- Body text is 16 px or larger.
- Line height is 1.5 or more for body text and 1.2 or more for headings.
- Body text lines are 75 characters at most.
- Text reflows at 400% zoom without horizontal scroll (WCAG 1.4.10).
- Do not justify body copy. Uneven word spacing makes rivers.
- On a phone, a text field below 16 px can zoom the page on focus. See [adapt.md](adapt.md).

### 9. Motion and animation

- Every animation honors the reduced-motion setting ([_platforms.md](_platforms.md)). Reduced means gentler, not zero: keep the opacity and color transitions that help understanding; drop movement, position and parallax animation.
- No content flashes more than 3 times per second (seizure risk).
- Parallax is off under reduced motion.
- Hover-triggered motion runs only for a hover pointer ([_platforms.md](_platforms.md)). Touch fires a hover on tap, so hover animation without that check plays on every touch.

### 10. Error states and failures

- An error message says what went wrong, specifically.
- Each error message is linked to its field and announced to assistive technology.
- Required fields are marked before the submit, not only after a failure.
- Map each server failure to a state:
  - invalid input: field errors;
  - not signed in: a sign-in path that keeps the input;
  - no permission: say what is missing and who grants it;
  - not found: a way back;
  - rate limited: say when to try again;
  - server fault: a plain message, a retry and a support path;
  - offline, slow or timed out: the state and a retry.
- Keep the person's input after every error.
- When one component fails, the rest of the surface still works.

### 11. Worst-case content

Load each surface with the worst data a real person or system can produce, and record what breaks. The values are platform-neutral; the breaks are the same on the web, iOS, Android and desktop.

**Workflow.**
1. **Map the surface.** List every field the surface renders and where each value comes from.
2. **Build the worst case.** For each field, pick the rows below that apply. Keep the values realistic: each one is something a real person could produce. Use `example.com`, `example.org` or `.test` for emails and URLs.
3. **Make it switchable.** Load the worst case through the stack's own development means — a fixture, a story, a preview, a seed — beside the normal demo data. Never change production data or production code paths for it.
4. **Break it.** Render the worst case at the narrowest supported width and with the environment rows applied. Record every break.
5. **Report, then stop.** Fix only on request.

**People and names** — very long and hyphenated (`Aleksandra Wiśniewska-Kowalczyk`); long with a suffix (`Christopher Alexander Montgomery III`, naive initials give `CI`); two letters and one letter (`Jo`, `J`); a leading accented capital (`Ólafur Darri Ólafsson`); stacked diacritics clipped by a tight line height (`Đặng Thị Ngọc Hân`); CJK with no spaces (`王秀英`); right-to-left (`نور الهدى عبد الرحمن`); apostrophes and lowercase particles (`Seán O'Brien-Ó Súilleabháin`, `María José de la Cruz y Fernández`); all lowercase (`dana`); an emoji first or a joined emoji sequence (`🦊 Fox`, `👩🏽‍💻 Priya`), which naive character slicing splits; leading, trailing and repeated spaces; no name at all.

**Emails, URLs and identifiers** — unbreakable strings with nowhere to wrap: a 60-character email, the shortest realistic email (`a@b.co`), plus-addressing, many subdomains with a two-part TLD, a long URL whose differing part is at the end, a UUID, a long file name whose version and extension end-truncation hides, a camera file name, handle extremes (`@a`, a 35-character handle).

**Labels, titles and copy from data** — a three-line job title in a secondary slot; a long status badge; a 30-character compound word (`Benachrichtigungseinstellungen`); a translation about 30% longer than English; twelve tags on one item (needs a `+8` overflow); one tag wider than its container; a missing, empty or blank title; markup and entities that must render as literal text; a newline in a single-line field; a 2,000-character pasted description.

**Numbers and money** — `0` (zero states, division by zero); `1` (plurals); `1284` (thousands separator); `1000000` (badge width, compact form); a large currency total; a negative value; floating-point noise (`0.30000000000000004`); a percentage past its bounds (`142%`, `-3%`); `null`, `undefined` or `NaN` rendered literally; locale separators (`1.284` against `1,284`); a value that changes live (width jitter without tabular figures).

**Collections** — 0 items (does an empty state exist?); 1 item; exactly the page size and one more; 1,000+ items unpaginated; one item 10× the size of the others; items with identical names.

**Time** — now ("just now", not "0 seconds ago"); thresholds (12 days, 11 months, 3 years ago); a future date; a zero timestamp (`1970-01-01`); a time that falls on a different day in another time zone; a very long duration that never rolls up. Use the platform's locale-aware date and relative-time formatters, not hand-built strings.

**Images and media** — an image URL that fails; no image at all (the fallback); a 4000×200 panorama and a 200×4000 tall image (distortion, blown-out height); a transparent or dark logo on a dark theme; a slow image (layout shift without fixed dimensions).

**States** — loading (skeletons that do not match the final layout); an error from the API (no error state, or a raw error message); partial data in one list; every status value at once; no permission; the current person in the list ("You"); offline; a slow network; a request that times out.

**Environment** — the narrowest supported width (320 px on the web, the smallest phone, a split-screen window); a narrow side column; a very wide window; the largest system text size or 200% zoom; dark theme; a right-to-left language; touch (hover-only actions are unreachable).

**Report.** One table, one row per break: the surface and field, the worst value, what broke (`file:line` when code exists), and the fix. Then list the decisions that belong to the person (for example, truncate or wrap a name), and what held up.

**In the design stage.** The `worst` state of each screen draws the surface with these values ([stage.md](stage.md) Step 4). The check of worst-case content runs in that state (`wf.mjs design check`).

### 12. Language and locale

- Lay out by start and end edges, not by left and right ([_platforms.md](_platforms.md)). A right-to-left language then mirrors the layout.
- Mirror the icons that show direction (back, forward, a progress arrow) in a right-to-left language. Do not mirror a logo, a clock or a media control.
- Format dates, numbers, currency and plurals with the platform locale formatter ([_platforms.md](_platforms.md)).
- Never build a plural from a count test such as "one, else add s". Many languages have more plural forms.
- Leave 30–40% spare space for translation.
- Never fix the width of a text container.
- Test with CJK text, emoji and a right-to-left script.

### 13. Concurrent operations

- Send one request per action. While the request runs, disable or ignore a repeat of the action.
- An optimistic update shows the result at once. When the request fails, restore the previous state and say what failed.
- When responses arrive out of order, show only the result of the latest request.
- When two people edit one item, show the conflict. Never let the later save overwrite the earlier one in silence.
- Test: press submit 10 times fast. Expect one request.

### 14. Interrupted gestures

A custom slider, drag surface or scrolling control strip survives an interrupted gesture ([_platforms.md](_platforms.md)).
- A gesture ends when the system cancels it, when pointer capture is lost, when the pointer is released outside the control, or when the window loses focus. On each end, clear the drag state and release capture.
- A second finger or pointer never takes over a drag. The first drag keeps its pointer or ends cleanly.
- After each interruption, the next tap or drag works without a reload.
- Test: add a second finger mid-drag, scroll across the control, release outside it, switch windows mid-drag. Then drag again.
- Name the evidence source: emulation, synthetic touch or a real device. Name what stayed untested.

### 15. Resource cleanup

- When a view closes, stop its timers, cancel its subscriptions and pending requests, and remove its listeners.
- A late response never updates a closed view.

## Output Format

```
## Accessibility Hardening Report

### Critical (must fix — WCAG A violations)
[List with file:line and fix]

### Important (should fix — WCAG AA violations)
[List with file:line and fix]

### Improvements (WCAG AAA or best practice)
[List]

### Worst-case content
[One row per break: surface and field, worst value, what broke, fix]

### Failures and concurrency
[One row per break: surface, case, what broke, fix]

### Changes made
[Summary of changes applied]
```

## Never

- Removing the focus ring without a replacement.
- Color as the only indicator of a state.
- A custom interactive element without the standard keyboard pattern of its role.
- An image with no text alternative. A decorative image gets an empty one; an informative image gets a description.
- A failure that loses the person's input.

## In the workflow

This file is a move. [_lane.md](_lane.md) → Moves says how each stage uses it.
Focus: accessibility and robustness. Checks: the checks above, including the worst-case pass. Notes record: the report above.

---

> *Parts adapted from impeccable v4.7.0 (`pbakaus/impeccable`, `374a0e179`), Apache-2.0.*

> *The worst-case catalog is adapted from Emil Kowalski's `break-ui` skill ([github.com/emilkowalski/skills](https://github.com/emilkowalski/skills), commit `2d22863`, 2026-10-11). MIT license.*
