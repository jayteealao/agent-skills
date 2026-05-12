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
- On desktop: 32×32 px is acceptable where space is constrained

### 8. Text and readability

- Minimum 16px base font size for body text
- Line height ≥ 1.5 for body text, ≥ 1.2 for headings
- Maximum line length 75ch for body text
- Text must reflow at 400% zoom without horizontal scroll (WCAG 1.4.10)
- Don't use justified text alignment for body copy (uneven word spacing creates rivers)

### 9. Motion and animation

- `@media (prefers-reduced-motion: reduce)` implemented for all animations
- No content that flashes more than 3 times per second (seizure risk)
- Parallax effects must be disabled under reduced motion

### 10. Error states

- Error messages are specific about what went wrong
- Error messages are associated with their field via `aria-describedby`
- Required fields are indicated before submission (not just after failure)
- Errors are announced to screen readers via `aria-live="polite"` or `role="alert"`

## Output Format

```
## Accessibility Hardening Report

### Critical (must fix — WCAG A violations)
[List with file:line and fix]

### Important (should fix — WCAG AA violations)
[List with file:line and fix]

### Improvements (WCAG AAA or best practice)
[List]

### Changes made
[Summary of changes applied]
```

## Never
- `outline: none` without replacement
- Color as the only indicator for any state
- Custom interactive elements without ARIA keyboard patterns
- Images with no alt attribute (must be `alt=""` for decorative, descriptive text for informative)
