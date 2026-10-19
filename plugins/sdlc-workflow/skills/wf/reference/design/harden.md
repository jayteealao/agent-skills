Improve the accessibility and robustness of a UI — ensuring it works for users with visual, motor, or cognitive differences, and that it handles edge cases and error states gracefully.

## What to check and fix

### 1. Keyboard navigation

- Every interactive element reachable by Tab
- No keyboard traps (modal, dropdown, custom widget must return focus when closed)
- Logical Tab order matching visual order
- Skip-to-main-content link for pages with navigation
- Custom interactive elements (accordion, tabs, combobox) must implement ARIA keyboard patterns

### 2. Focus indicators

- Visible focus ring on all interactive elements
- Focus ring must meet 3:1 contrast ratio against adjacent background
- Never `outline: none` without a custom focus indicator replacement
- Focus indicators must be visible in both light and dark mode

### 3. Color and contrast

- Body text: 4.5:1 contrast ratio minimum (WCAG AA)
- Large text (≥18pt regular or ≥14pt bold): 3:1 minimum
- UI components and state indicators: 3:1 minimum
- Color must not be the only signal — pair color with shape, icon, or text
- Test with simulated protanopia and deuteranopia

### 4. Semantic HTML

- Heading hierarchy is sequential (h1 → h2 → h3, no skips)
- Landmark regions: `<main>`, `<nav>`, `<header>`, `<footer>`, `<aside>` used correctly
- Interactive elements: use `<button>` for actions, `<a>` for navigation — not divs
- Form elements: every input has an associated `<label>` (or `aria-label` / `aria-labelledby`)
- Lists: use `<ul>` / `<ol>` for actual lists, not for layout

### 5. ARIA

- Use native HTML semantics before ARIA (`<button>` over `role="button"`)
- Dynamic content: `aria-live` regions for content that updates without page reload
- Modal dialogs: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing to title
- Tabs: `role="tablist"`, `role="tab"`, `role="tabpanel"` with `aria-controls` and `aria-selected`
- Required fields: `aria-required="true"` (not just a visual asterisk)
- Error messages: `aria-describedby` linking error message to input

### 6. Images and icons

- Decorative images: `alt=""` (not missing alt, explicitly empty)
- Informative images: descriptive alt text — what the image communicates, not what it depicts
- Icon buttons: `aria-label` describing the action
- SVG icons: `aria-hidden="true"` when decorative, or `<title>` element for informative icons

### 7. Touch targets

- Minimum 44×44 px (CSS pixels) for all interactive elements
- Minimum 8px spacing between adjacent touch targets
- A pointer-only desktop control may be 32×32 px
- When the *visible* control is smaller than the target (a 20px checkbox, a small icon button), extend the hit area with a centered pseudo-element rather than padding the layout — and never let two interactive elements' hit areas overlap (shrink the pseudo-element to the largest size that doesn't collide)

### 8. Text and readability

- Minimum 16px base font size for body text
- Line height ≥ 1.5 for body text, ≥ 1.2 for headings
- Maximum line length 75ch for body text
- Text must reflow at 400% zoom without horizontal scroll (WCAG 1.4.10)
- Don't use justified text alignment for body copy (uneven word spacing creates rivers)

### 9. Motion and animation

- Every animation honors the reduced-motion setting ([_platforms.md](_platforms.md)) — reduced means *gentler*, not *zero*: keep opacity/color transitions that aid comprehension, drop movement and position/parallax animation
- No content that flashes more than 3 times per second (seizure risk)
- Parallax effects must be disabled under reduced motion
- Hover-triggered motion runs only for a hover pointer (the platform's hover-pointer check in [_platforms.md](_platforms.md)) — touch fires a hover on tap, so ungated hover animation triggers a false positive on every touch

### 10. Error states

- Error messages are specific about what went wrong
- Error messages are associated with their field via `aria-describedby`
- Required fields are indicated before submission (not just after failure)
- Errors are announced to screen readers via `aria-live="polite"` or `role="alert"`

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

**States** — loading (skeletons that do not match the final layout); an error from the API (no error state, or a raw error message); partial data in one list; every status value at once; no permission; the current person in the list ("You").

**Environment** — the narrowest supported width (320 px on the web, the smallest phone, a split-screen window); a narrow side column; a very wide window; the largest system text size or 200% zoom; dark theme; a right-to-left language; touch (hover-only actions are unreachable).

**Report.** One table, one row per break: the surface and field, the worst value, what broke (`file:line` when code exists), and the fix. Then list the decisions that belong to the person (for example, truncate or wrap a name), and what held up.

**In the design stage.** A worst-case board `<surface>--worst` draws the surface with these values. The stage draws one for every surface the person asks for, and otherwise for every new surface that shows data ([stage.md](stage.md) Step 4).

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

### Changes made
[Summary of changes applied]
```

## Never

Apply the ban list in [_design-context.md](_design-context.md).

- `outline: none` without replacement
- Color as the only indicator for any state
- Custom interactive elements without ARIA keyboard patterns
- Images with no alt attribute (must be `alt=""` for decorative, descriptive text for informative)

## In the workflow

This file is a move, not a stage. Before the design is confirmed, `/wf design <slug> harden` focuses the visual contract `02c-craft.md` on it. After the design is confirmed, the same command runs the checks above, including the worst-case pass, against the frozen boards and the built UI, and draws nothing ([stage.md](stage.md) Step 0). `plan` cites it as a step pointer, and `implement` applies it and records `design-notes/<move>-<timestamp>.md` per [_output.md](_output.md). The absolute bans in [_design-context.md](_design-context.md) apply.

> *The worst-case catalog is adapted from Emil Kowalski's `break-ui` skill ([github.com/emilkowalski/skills](https://github.com/emilkowalski/skills), commit `2d22863`, 2026-10-11). MIT license.*
