---
name: review:accessibility
description: Review UI changes for keyboard and assistive technology usability, avoid ARIA misuse
usage: /review:accessibility [SCOPE] [TARGET] [PATHS] [CONTEXT]
arguments:
  - name: SCOPE
    description: 'Review scope: pr (default) | worktree | diff | repo | file'
    required: false
    default: pr
  - name: TARGET
    description: 'Target specifier: PR number, branch name, commit hash, or file path'
    required: false
  - name: PATHS
    description: 'Optional glob patterns to filter files (e.g., "src/components/**")'
    required: false
  - name: CONTEXT
    description: 'Additional context: UI framework, target compliance level (WCAG 2.1 A/AA/AAA), supported browsers'
    required: false
examples:
  - command: /review:accessibility pr 123
    description: Review PR #123 for accessibility issues
  - command: /review:accessibility worktree "src/components/**"
    description: Review components for a11y violations
  - command: /review:accessibility diff main..feature "CONTEXT: React, WCAG 2.1 AA compliance required, Chrome/Firefox/Safari"
    description: Review branch diff with accessibility requirements
---

# Accessibility (A11Y) Review

You are an accessibility reviewer ensuring UI changes are usable with keyboard and assistive technologies, avoiding ARIA misuse.

## Step 0: Infer SESSION_SLUG if Needed

If `SESSION_SLUG` is not provided:
1. Read `.claude/README.md`
2. Extract the **last session** from the table (most recent entry)
3. Use that session's slug as `SESSION_SLUG`

## Step 1: Determine Review Scope

Based on `SCOPE` parameter:

- **`pr`** (default): Review changed UI files in the specified PR
- **`worktree`**: Review uncommitted UI changes
- **`diff`**: Review diff between two refs
- **`file`**: Review specific UI file(s)
- **`repo`**: Review all UI components

If `PATHS` is provided, filter to matching UI files.

## Step 2: Extract UI Components

For each file in scope:

1. **Identify UI elements**:
   - Interactive controls (buttons, inputs, links)
   - Navigation components
   - Forms and validation
   - Modals, dialogs, tooltips
   - Dynamic content updates

2. **Read full component** (not just diff)

3. **Check rendered HTML**:
   - What HTML elements are used?
   - What ARIA attributes are present?
   - How does focus behave?

**Critical**: Always read the **complete component** to understand full accessibility context.

## Step 3: Parse CONTEXT (if provided)

Extract accessibility requirements from `CONTEXT` parameter:

- **Framework**: React, Vue, Angular, Svelte (affects patterns)
- **Compliance level**: WCAG 2.1 A, AA, or AAA
- **Target browsers**: Chrome, Firefox, Safari, Edge
- **Screen readers**: NVDA, JAWS, VoiceOver

Example:
```
CONTEXT: React, WCAG 2.1 AA compliance required, support Chrome/Firefox/Safari, test with NVDA
```

## Step 4: Accessibility Checklist Review

For each UI component, systematically check:

### 4.1 Semantic HTML
- [ ] Correct HTML elements used (button vs div)?
- [ ] Heading hierarchy maintained (h1 → h2 → h3)?
- [ ] Landmark regions defined (nav, main, aside)?
- [ ] Lists use proper markup (ul/ol/li)?
- [ ] Tables use proper structure (thead, tbody, th)?

**Red flags:**
- `<div onclick>` instead of `<button>`
- Skipped heading levels (h1 → h3)
- No landmarks (everything in div soup)
- Fake lists (div with bullets)

**Semantic examples:**
```jsx
// ❌ BAD: Non-semantic div button
<div className="button" onClick={handleClick}>
  Click me
</div>

// Problems:
// - Not focusable (needs tabIndex={0})
// - No keyboard support (no Enter/Space handler)
// - Screen reader doesn't announce as button
// - Not included in form navigation

// ✅ GOOD: Semantic button
<button onClick={handleClick}>
  Click me
</button>

// ❌ BAD: Skipped heading levels
<h1>Page Title</h1>
<h3>Section Title</h3>  {/* ❌ Skipped h2 */}

// ✅ GOOD: Proper hierarchy
<h1>Page Title</h1>
<h2>Section Title</h2>
<h3>Subsection</h3>

// ❌ BAD: No landmarks
<div>
  <div>Logo and nav</div>
  <div>Main content</div>
  <div>Footer</div>
</div>

// ✅ GOOD: Landmarks for navigation
<header>
  <nav aria-label="Main navigation">
    {/* Navigation items */}
  </nav>
</header>
<main>
  {/* Main content */}
</main>
<footer>
  {/* Footer content */}
</footer>

// ❌ BAD: Fake list
<div className="list">
  <div className="item">Item 1</div>
  <div className="item">Item 2</div>
</div>

// ✅ GOOD: Semantic list
<ul>
  <li>Item 1</li>
  <li>Item 2</li>
</ul>
```

### 4.2 Labels & Accessible Names
- [ ] All inputs have labels?
- [ ] Buttons have descriptive text or aria-label?
- [ ] Icons have text alternatives or are hidden?
- [ ] Form controls use proper label association?
- [ ] Placeholder not used as label?

**Red flags:**
- Input without label
- Icon button without accessible name
- Placeholder as only label
- Generic button text ("Click here")

**Label examples:**
```jsx
// ❌ BAD: Input without label
<input
  type="text"
  placeholder="Enter email"  // ❌ Placeholder is not a label
  value={email}
/>

// ✅ GOOD: Explicit label
<label htmlFor="email">Email</label>
<input
  id="email"
  type="text"
  placeholder="e.g., user@example.com"
  value={email}
/>

// ✅ ALTERNATIVE: Implicit label
<label>
  Email
  <input
    type="text"
    placeholder="e.g., user@example.com"
    value={email}
  />
</label>

// ❌ BAD: Icon button without text
<button onClick={handleEdit}>
  <EditIcon />  {/* ❌ No text for screen reader */}
</button>

// ✅ GOOD: Icon with aria-label
<button onClick={handleEdit} aria-label="Edit profile">
  <EditIcon aria-hidden="true" />  {/* Hide icon from screen reader */}
</button>

// ✅ ALTERNATIVE: Visually hidden text
<button onClick={handleEdit}>
  <EditIcon aria-hidden="true" />
  <span className="sr-only">Edit profile</span>
</button>

// CSS for sr-only:
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}

// ❌ BAD: Generic link text
<a href="/learn-more">Click here</a>

// ✅ GOOD: Descriptive link text
<a href="/learn-more">Learn more about our pricing</a>

// ❌ BAD: Form without labels
<form>
  <input type="text" name="name" />
  <input type="email" name="email" />
  <button type="submit">Submit</button>
</form>

// ✅ GOOD: Properly labeled form
<form>
  <div>
    <label htmlFor="name">Full Name</label>
    <input
      id="name"
      type="text"
      name="name"
      required
      aria-required="true"
    />
  </div>

  <div>
    <label htmlFor="email">Email Address</label>
    <input
      id="email"
      type="email"
      name="email"
      required
      aria-required="true"
    />
  </div>

  <button type="submit">Create Account</button>
</form>
```

### 4.3 Keyboard Navigation
- [ ] All interactive elements focusable?
- [ ] Logical focus order (tab order matches visual order)?
- [ ] No keyboard traps (can always navigate away)?
- [ ] Keyboard shortcuts documented?
- [ ] Complex widgets support arrow key navigation?

**Red flags:**
- `tabIndex={-1}` on interactive element (removes from tab order)
- Focus order doesn't match visual order
- Modal can't be closed with Escape
- Dropdown requires mouse

**Keyboard examples:**
```jsx
// ❌ BAD: Non-focusable div button
<div onClick={handleClick}>Click me</div>

// ✅ GOOD: Use button (focusable by default)
<button onClick={handleClick}>Click me</button>

// ✅ ALTERNATIVE: Make div focusable (not recommended)
<div
  role="button"
  tabIndex={0}
  onClick={handleClick}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  }}
>
  Click me
</div>

// ❌ BAD: Modal without keyboard support
function Modal({ isOpen, onClose, children }) {
  if (!isOpen) return null;

  return (
    <div className="modal">
      <div className="modal-content">
        <button onClick={onClose}>×</button>  {/* ❌ No Escape support */}
        {children}
      </div>
    </div>
  );
}

// ✅ GOOD: Modal with keyboard support
function Modal({ isOpen, onClose, children }) {
  useEffect(() => {
    if (!isOpen) return;

    // Close on Escape key
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="modal"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();  // Close on backdrop click
      }}
    >
      <div className="modal-content">
        <button onClick={onClose} aria-label="Close dialog">
          ×
        </button>
        {children}
      </div>
    </div>
  );
}

// ❌ BAD: Wrong tab order
<div style={{ display: 'flex', flexDirection: 'row-reverse' }}>
  <button>First visually</button>  {/* Tab order: 2 */}
  <button>Second visually</button>  {/* Tab order: 1 */}
</div>

// ✅ GOOD: Match visual order
<div style={{ display: 'flex', flexDirection: 'row-reverse' }}>
  <button style={{ order: 2 }}>First visually</button>  {/* Tab order: 1 */}
  <button style={{ order: 1 }}>Second visually</button>  {/* Tab order: 2 */}
</div>

// ✅ BETTER: Don't rely on CSS for order
<div style={{ display: 'flex' }}>
  <button>First</button>
  <button>Second</button>
</div>
```

### 4.4 Focus Management
- [ ] Focus visible (not disabled with CSS)?
- [ ] Focus trapped in modals/dialogs?
- [ ] Focus restored when closing modal?
- [ ] Focus moved to new content when appropriate?
- [ ] Skip links provided for keyboard users?

**Red flags:**
- `outline: none` without alternative focus style
- Modal doesn't trap focus
- Focus not restored after modal close
- No skip link to main content

**Focus management examples:**
```jsx
// ❌ BAD: Focus indicator removed
button:focus {
  outline: none;  /* ❌ No visual focus indicator */
}

// ✅ GOOD: Custom focus style
button:focus {
  outline: 2px solid blue;
  outline-offset: 2px;
}

// ✅ BETTER: Use :focus-visible (shows only for keyboard)
button:focus {
  outline: none;  /* Remove default */
}

button:focus-visible {
  outline: 2px solid blue;  /* ✅ Only for keyboard focus */
  outline-offset: 2px;
}

// ❌ BAD: Modal doesn't trap focus
function Modal({ isOpen, children }) {
  if (!isOpen) return null;

  return (
    <div className="modal">
      {children}
    </div>
  );
}

// User can tab outside modal to background content!

// ✅ GOOD: Focus trap in modal
function Modal({ isOpen, onClose, children }) {
  const modalRef = useRef(null);
  const previousFocusRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    // Save current focus
    previousFocusRef.current = document.activeElement;

    // Focus first focusable element in modal
    const focusable = modalRef.current?.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    focusable?.[0]?.focus();

    // Trap focus
    const handleTab = (e) => {
      if (e.key !== 'Tab') return;

      const focusableElements = Array.from(focusable || []);
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault();
        lastElement?.focus();
      } else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault();
        firstElement?.focus();
      }
    };

    document.addEventListener('keydown', handleTab);

    return () => {
      document.removeEventListener('keydown', handleTab);

      // Restore focus
      previousFocusRef.current?.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div ref={modalRef} className="modal" role="dialog" aria-modal="true">
      {children}
    </div>
  );
}

// ✅ GOOD: Skip link
<body>
  <a href="#main-content" className="skip-link">
    Skip to main content
  </a>

  <header>
    {/* Navigation */}
  </header>

  <main id="main-content">
    {/* Main content */}
  </main>
</body>

// CSS for skip link (visible on focus)
.skip-link {
  position: absolute;
  top: -40px;
  left: 0;
  background: #000;
  color: #fff;
  padding: 8px;
  z-index: 100;
}

.skip-link:focus {
  top: 0;
}
```

### 4.5 ARIA Usage
- [ ] ARIA only when native semantics insufficient?
- [ ] Correct ARIA roles for custom widgets?
- [ ] ARIA states updated dynamically (aria-expanded, aria-selected)?
- [ ] ARIA properties accurate (aria-labelledby, aria-describedby)?
- [ ] No redundant ARIA (role="button" on <button>)?

**Red flags:**
- ARIA on native elements (role="button" on <button>)
- ARIA roles without keyboard support
- ARIA states not updated
- Misused ARIA (aria-label on <div> without role)

**ARIA examples:**
```jsx
// ❌ BAD: Redundant ARIA
<button role="button" aria-label="Click">  {/* ❌ button already has role */}
  Click me
</button>

// ✅ GOOD: No ARIA needed
<button>Click me</button>

// ❌ BAD: ARIA without keyboard support
<div role="button" onClick={handleClick}>
  Click me
</div>

// ❌ No tabIndex, no keyboard handler

// ✅ GOOD: ARIA with full keyboard support
<div
  role="button"
  tabIndex={0}
  onClick={handleClick}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  }}
>
  Click me
</div>

// ✅ BETTER: Use button element
<button onClick={handleClick}>Click me</button>

// ❌ BAD: ARIA state not updated
function Accordion({ title, children }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div>
      <button onClick={() => setIsOpen(!isOpen)}>
        {/* ❌ aria-expanded not updated */}
        {title}
      </button>
      {isOpen && <div>{children}</div>}
    </div>
  );
}

// ✅ GOOD: ARIA state updated
function Accordion({ title, children }) {
  const [isOpen, setIsOpen] = useState(false);
  const contentId = useId();

  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}  // ✅ Updated dynamically
        aria-controls={contentId}
      >
        {title}
      </button>
      {isOpen && (
        <div id={contentId} role="region">
          {children}
        </div>
      )}
    </div>
  );
}

// ✅ GOOD: Complex widget with ARIA
function Tabs({ items }) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  return (
    <div>
      <div role="tablist" aria-label="Content tabs">
        {items.map((item, index) => (
          <button
            key={index}
            role="tab"
            aria-selected={index === selectedIndex}
            aria-controls={`panel-${index}`}
            id={`tab-${index}`}
            onClick={() => setSelectedIndex(index)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') {
                setSelectedIndex((i) => (i + 1) % items.length);
              } else if (e.key === 'ArrowLeft') {
                setSelectedIndex((i) => (i - 1 + items.length) % items.length);
              }
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {items.map((item, index) => (
        <div
          key={index}
          role="tabpanel"
          id={`panel-${index}`}
          aria-labelledby={`tab-${index}`}
          hidden={index !== selectedIndex}
        >
          {item.content}
        </div>
      ))}
    </div>
  );
}
```

### 4.6 Form Accessibility
- [ ] Error messages associated with fields?
- [ ] Required fields indicated?
- [ ] Help text associated with inputs?
- [ ] Validation feedback accessible?
- [ ] Error summary provided?

**Red flags:**
- Error message not associated with field
- Required not indicated
- Validation errors not announced

**Form examples:**
```jsx
// ❌ BAD: Error not associated
<div>
  <label htmlFor="email">Email</label>
  <input id="email" type="email" />
  {error && <div className="error">Invalid email</div>}  {/* ❌ Not associated */}
</div>

// ✅ GOOD: Error associated with aria-describedby
<div>
  <label htmlFor="email">Email</label>
  <input
    id="email"
    type="email"
    aria-invalid={!!error}
    aria-describedby={error ? 'email-error' : undefined}
  />
  {error && (
    <div id="email-error" className="error" role="alert">
      {error}
    </div>
  )}
</div>

// ❌ BAD: Required not indicated
<label htmlFor="name">Name</label>
<input id="name" type="text" required />

// ✅ GOOD: Required indicated visually and semantically
<label htmlFor="name">
  Name <span aria-label="required">*</span>
</label>
<input
  id="name"
  type="text"
  required
  aria-required="true"
/>

// ✅ GOOD: Help text associated
<div>
  <label htmlFor="password">Password</label>
  <input
    id="password"
    type="password"
    aria-describedby="password-help"
  />
  <div id="password-help" className="help-text">
    Must be at least 8 characters
  </div>
</div>

// ✅ GOOD: Error summary
<form onSubmit={handleSubmit}>
  {errors.length > 0 && (
    <div role="alert" className="error-summary">
      <h2>Please fix the following errors:</h2>
      <ul>
        {errors.map((error, i) => (
          <li key={i}>
            <a href={`#${error.field}`}>{error.message}</a>
          </li>
        ))}
      </ul>
    </div>
  )}

  {/* Form fields */}
</form>
```

### 4.7 Dynamic Content & Live Regions
- [ ] Dynamic updates announced to screen readers?
- [ ] Loading states accessible?
- [ ] Live regions used appropriately (aria-live)?
- [ ] Status messages announced?
- [ ] Content changes don't disrupt user?

**Dynamic content examples:**
```jsx
// ❌ BAD: Status not announced
function SaveButton() {
  const [status, setStatus] = useState('idle');

  return (
    <div>
      <button onClick={save}>Save</button>
      {status === 'saving' && <div>Saving...</div>}  {/* ❌ Not announced */}
      {status === 'saved' && <div>Saved!</div>}  {/* ❌ Not announced */}
    </div>
  );
}

// ✅ GOOD: Status announced with live region
function SaveButton() {
  const [status, setStatus] = useState('idle');

  return (
    <div>
      <button onClick={save}>Save</button>
      <div role="status" aria-live="polite" aria-atomic="true">
        {status === 'saving' && 'Saving...'}
        {status === 'saved' && 'Saved successfully!'}
      </div>
    </div>
  );
}

// ✅ GOOD: Loading state
<button disabled={isLoading} aria-busy={isLoading}>
  {isLoading ? 'Loading...' : 'Submit'}
</button>

// ✅ GOOD: Error announcement
{error && (
  <div role="alert" aria-live="assertive">
    {error.message}
  </div>
)}
```

## Step 5: Generate Findings

For each accessibility issue discovered:

**Finding format:**
```
## A11Y-{N}: {Short title}
**File**: {file_path}:{line_number}
**Severity**: BLOCKER | HIGH | MED | LOW | NIT
**Confidence**: 95% | 80% | 60%
**WCAG**: {Success Criterion} ({Level})

### Evidence
{Code snippet showing the issue}

### Issue
{Description of accessibility problem and user impact}

### Remediation
{Before and after code with explanation}
```

**Severity guidelines:**
- **BLOCKER**: Makes content completely inaccessible (no keyboard access, unlabeled form)
- **HIGH**: Significant barrier (missing ARIA, poor focus management)
- **MED**: Degrades experience (generic link text, redundant ARIA)
- **LOW**: Minor issue (missing aria-describedby, help text)
- **NIT**: Best practice (use button instead of div, semantic HTML)

**Confidence guidelines:**
- **95%+**: Clear violation (div button, missing label, no keyboard support)
- **80%**: Likely violation (complex widget, unclear ARIA)
- **60%**: Context-dependent (may be intentional, need more info)

## Step 6: Cross-Reference with Patterns

Check if issues match known patterns:

1. **Non-semantic button pattern**: `<div onClick>` → use `<button>`
2. **Missing label pattern**: Input without `<label>` or `aria-label`
3. **Focus trap pattern**: Modal without focus management
4. **ARIA misuse pattern**: Redundant roles, incorrect states
5. **Keyboard trap pattern**: No Escape handler in modal
6. **Generic text pattern**: "Click here", "Read more" without context
7. **Form error pattern**: Error not associated with field

## Step 7: Write Report

Create report at `.claude/<SESSION_SLUG>/reviews/accessibility_<timestamp>.md`:

```markdown
# Accessibility Review Report

**Session**: <SESSION_SLUG>
**Scope**: <SCOPE>
**Target**: <TARGET>
**Date**: <YYYY-MM-DD>
**Reviewer**: Claude (Accessibility Specialist)

## 0) Scope & Compliance Requirements

- **Framework**: {React/Vue/Angular}
- **WCAG Level**: {A/AA/AAA}
- **Browsers**: {Chrome/Firefox/Safari/Edge}
- **Screen readers**: {NVDA/JAWS/VoiceOver}
- **Files reviewed**: {count}

## 1) Accessibility Issues (ranked by impact)

{List all findings with severity}

## 2) Critical Blockers

{BLOCKER severity findings that prevent accessibility}

## 3) Testing Recommendations

### Manual Testing
- [ ] Tab through all interactive elements
- [ ] Test with screen reader (NVDA/VoiceOver)
- [ ] Close modals with Escape key
- [ ] Verify focus indicators visible
- [ ] Check form error announcements

### Automated Testing
```bash
# axe DevTools (browser extension)
# https://www.deque.com/axe/devtools/

# Lighthouse CI
npx lighthouse https://localhost:3000 --only-categories=accessibility

# pa11y
npx pa11y http://localhost:3000
```

## 4) WCAG 2.1 Compliance Summary

| Success Criterion | Level | Status | Issues |
|-------------------|-------|--------|--------|
| 1.1.1 Non-text Content | A | ❌ FAIL | A11Y-3 (icon without label) |
| 1.3.1 Info and Relationships | A | ❌ FAIL | A11Y-1 (missing labels) |
| 2.1.1 Keyboard | A | ❌ FAIL | A11Y-2 (div button) |
| 2.4.3 Focus Order | A | ⚠️ WARN | A11Y-4 (CSS order) |
| 4.1.2 Name, Role, Value | A | ❌ FAIL | A11Y-5 (ARIA misuse) |

## 5) Non-Negotiables

1. **All interactive elements must be keyboard accessible** (WCAG 2.1.1 Level A)
2. **All inputs must have labels** (WCAG 1.3.1 Level A)
3. **All buttons must have accessible names** (WCAG 4.1.2 Level A)
4. **Modals must trap focus and close with Escape** (WCAG 2.1.2 Level A)
5. **Focus indicators must be visible** (WCAG 2.4.7 Level AA)

## 6) Summary Statistics

- **Total issues**: {count}
- **BLOCKER**: {count}
- **HIGH**: {count}
- **MED**: {count}
- **LOW**: {count}
- **NIT**: {count}

---

{Detailed findings follow below}
```

## Step 8: Output Summary

Output to user:
```
✅ Accessibility review complete

📊 Summary:
- Files reviewed: {count}
- Issues found: {count}
- BLOCKER: {count}
- HIGH: {count}
- MED: {count}

📝 Report: .claude/<SESSION_SLUG>/reviews/accessibility_<timestamp>.md

⚠️ Critical blockers:
{List BLOCKER findings}

💡 Next steps:
1. Fix BLOCKER issues (keyboard access, missing labels)
2. Test with screen reader (NVDA/VoiceOver)
3. Run automated tests (axe DevTools, Lighthouse)
4. Verify WCAG 2.1 AA compliance
```

## Step 9: Example Findings

Below are realistic examples following the finding format:

---

### Example Finding 1: Non-Semantic Button

```markdown
## A11Y-1: Custom button using div element

**File**: src/components/ProductCard.tsx:45
**Severity**: BLOCKER
**Confidence**: 95%
**WCAG**: 2.1.1 Keyboard (Level A), 4.1.2 Name, Role, Value (Level A)

### Evidence
```tsx
// src/components/ProductCard.tsx:45-48
<div className="add-to-cart-button" onClick={handleAddToCart}>
  <ShoppingCartIcon />
  Add to Cart
</div>
```

### Issue
The "Add to Cart" button is implemented as a `<div>` element with an onClick handler. This creates multiple accessibility problems:

1. **Not keyboard accessible**: Cannot be focused with Tab key
2. **No keyboard activation**: Enter/Space keys don't trigger the action
3. **Wrong semantic role**: Screen readers don't announce this as a button
4. **Not included in form navigation**: Won't be reached when navigating by button type

**User impact**: Keyboard users and screen reader users cannot add items to cart. This is a complete blocker for purchasing.

**Testing**: Press Tab repeatedly—this element will never receive focus.

### Remediation

**BEFORE**:
```tsx
<div className="add-to-cart-button" onClick={handleAddToCart}>
  <ShoppingCartIcon />
  Add to Cart
</div>
```

**AFTER**:
```tsx
<button
  className="add-to-cart-button"
  onClick={handleAddToCart}
  aria-label="Add to cart"
>
  <ShoppingCartIcon aria-hidden="true" />
  Add to Cart
</button>
```

**Changes**:
1. ✅ Changed `<div>` to `<button>` for proper semantics
2. ✅ Button is now keyboard accessible by default (Tab to focus)
3. ✅ Enter and Space keys activate button automatically
4. ✅ Screen readers announce "Add to cart, button"
5. ✅ Added `aria-hidden="true"` to icon to avoid double announcement

**If you must use div** (not recommended):
```tsx
<div
  className="add-to-cart-button"
  role="button"
  tabIndex={0}
  onClick={handleAddToCart}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleAddToCart(e);
    }
  }}
  aria-label="Add to cart"
>
  <ShoppingCartIcon aria-hidden="true" />
  Add to Cart
</div>
```

But using `<button>` is strongly preferred—it provides all this behavior by default.
```

---

### Example Finding 2: Input Without Label

```markdown
## A11Y-2: Email input missing accessible label

**File**: src/components/NewsletterSignup.tsx:67
**Severity**: BLOCKER
**Confidence**: 95%
**WCAG**: 1.3.1 Info and Relationships (Level A), 3.3.2 Labels or Instructions (Level A)

### Evidence
```tsx
// src/components/NewsletterSignup.tsx:67-72
<input
  type="email"
  name="email"
  placeholder="Enter your email"
  value={email}
  onChange={handleChange}
/>
```

### Issue
The email input field has no associated `<label>` element. Using `placeholder` as the only label creates several problems:

1. **Placeholder is not a label**: Screen readers may not announce placeholder text consistently
2. **Placeholder disappears**: Once user starts typing, they lose context
3. **Not programmatically associated**: No explicit relationship for assistive tech
4. **Low contrast**: Placeholder text is typically gray and hard to read

**User impact**: Screen reader users hear "Email edit text" or just "edit text" without knowing what to enter. Users with cognitive disabilities lose context when typing.

**Testing**: Use NVDA screen reader—focus on input and hear incomplete announcement.

### Remediation

**BEFORE**:
```tsx
<input
  type="email"
  name="email"
  placeholder="Enter your email"
  value={email}
  onChange={handleChange}
/>
```

**AFTER** (Explicit label):
```tsx
<label htmlFor="newsletter-email">Email Address</label>
<input
  id="newsletter-email"
  type="email"
  name="email"
  placeholder="e.g., you@example.com"
  value={email}
  onChange={handleChange}
  required
  aria-required="true"
/>
```

**ALTERNATIVE** (Implicit label):
```tsx
<label>
  Email Address
  <input
    type="email"
    name="email"
    placeholder="e.g., you@example.com"
    value={email}
    onChange={handleChange}
    required
    aria-required="true"
  />
</label>
```

**ALTERNATIVE** (Visually hidden label):
```tsx
<label htmlFor="newsletter-email" className="sr-only">
  Email Address
</label>
<input
  id="newsletter-email"
  type="email"
  name="email"
  placeholder="Enter your email"
  value={email}
  onChange={handleChange}
  aria-required="true"
/>
```

**Changes**:
1. ✅ Added explicit `<label>` with `htmlFor` attribute
2. ✅ Placeholder now provides example format (not the label)
3. ✅ Added `aria-required="true"` for screen readers
4. ✅ Screen readers now announce "Email Address, edit text, required"

**CSS for sr-only** (if using visually hidden label):
```css
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}
```
```

---

### Example Finding 3: Modal Without Focus Trap

```markdown
## A11Y-3: Modal dialog doesn't trap focus

**File**: src/components/DeleteConfirmModal.tsx:23
**Severity**: HIGH
**Confidence**: 95%
**WCAG**: 2.1.2 No Keyboard Trap (Level A), 2.4.3 Focus Order (Level A)

### Evidence
```tsx
// src/components/DeleteConfirmModal.tsx:23-38
function DeleteConfirmModal({ isOpen, onConfirm, onCancel }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>Delete Item?</h2>
        <p>This action cannot be undone.</p>
        <div className="modal-actions">
          <button onClick={onCancel}>Cancel</button>
          <button onClick={onConfirm} className="danger">Delete</button>
        </div>
      </div>
    </div>
  );
}
```

### Issue
The modal dialog has several focus management problems:

1. **No focus trap**: User can Tab out of modal to background content
2. **No focus restoration**: Focus not returned when modal closes
3. **No initial focus**: Focus not moved to modal when it opens
4. **No Escape key handler**: Can't close with Escape key
5. **Wrong ARIA**: Missing `role="dialog"` and `aria-modal="true"`

**User impact**: Keyboard users can accidentally interact with background content while modal is open. This creates confusion and can lead to unintended actions. Modal feels "broken" to keyboard users.

**Testing**: Open modal and press Tab repeatedly—focus moves to background elements instead of staying in modal.

### Remediation

**BEFORE**:
```tsx
function DeleteConfirmModal({ isOpen, onConfirm, onCancel }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>Delete Item?</h2>
        <p>This action cannot be undone.</p>
        <div className="modal-actions">
          <button onClick={onCancel}>Cancel</button>
          <button onClick={onConfirm} className="danger">Delete</button>
        </div>
      </div>
    </div>
  );
}
```

**AFTER**:
```tsx
import { useEffect, useRef } from 'react';

function DeleteConfirmModal({ isOpen, onConfirm, onCancel }) {
  const modalRef = useRef(null);
  const previousFocusRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    // 1. Save current focus
    previousFocusRef.current = document.activeElement;

    // 2. Get all focusable elements in modal
    const focusableElements = modalRef.current?.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const focusableArray = Array.from(focusableElements || []);
    const firstFocusable = focusableArray[0];
    const lastFocusable = focusableArray[focusableArray.length - 1];

    // 3. Focus first element
    firstFocusable?.focus();

    // 4. Trap focus within modal
    const handleTab = (e) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        // Shift+Tab on first element → focus last
        if (document.activeElement === firstFocusable) {
          e.preventDefault();
          lastFocusable?.focus();
        }
      } else {
        // Tab on last element → focus first
        if (document.activeElement === lastFocusable) {
          e.preventDefault();
          firstFocusable?.focus();
        }
      }
    };

    // 5. Close on Escape
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };

    document.addEventListener('keydown', handleTab);
    document.addEventListener('keydown', handleEscape);

    // 6. Cleanup: restore focus
    return () => {
      document.removeEventListener('keydown', handleTab);
      document.removeEventListener('keydown', handleEscape);
      previousFocusRef.current?.focus();
    };
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        ref={modalRef}
        className="modal-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="modal-title">Delete Item?</h2>
        <p>This action cannot be undone.</p>
        <div className="modal-actions">
          <button onClick={onCancel}>Cancel</button>
          <button onClick={onConfirm} className="danger">
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Changes**:
1. ✅ Added focus trap with Tab key handling (circular focus)
2. ✅ Saves and restores focus on modal close
3. ✅ Focuses first button when modal opens
4. ✅ Added Escape key handler to close modal
5. ✅ Added `role="dialog"` and `aria-modal="true"`
6. ✅ Added `aria-labelledby` pointing to heading

**Alternative**: Use a library like `react-focus-lock` or `@headlessui/react`:
```tsx
import { Dialog } from '@headlessui/react';

function DeleteConfirmModal({ isOpen, onConfirm, onCancel }) {
  return (
    <Dialog open={isOpen} onClose={onCancel}>
      <Dialog.Overlay className="modal-overlay" />
      <Dialog.Panel className="modal-content">
        <Dialog.Title>Delete Item?</Dialog.Title>
        <p>This action cannot be undone.</p>
        <button onClick={onCancel}>Cancel</button>
        <button onClick={onConfirm} className="danger">Delete</button>
      </Dialog.Panel>
    </Dialog>
  );
}
```
```

---

### Example Finding 4: Icon Button Without Accessible Name

```markdown
## A11Y-4: Icon-only button missing accessible name

**File**: src/components/UserProfile.tsx:89
**Severity**: HIGH
**Confidence**: 95%
**WCAG**: 4.1.2 Name, Role, Value (Level A), 1.1.1 Non-text Content (Level A)

### Evidence
```tsx
// src/components/UserProfile.tsx:89-91
<button onClick={handleEdit} className="icon-button">
  <EditIcon />
</button>
```

### Issue
The edit button contains only an icon with no text content. Screen readers announce this as "button" without describing what the button does.

**User impact**: Screen reader users hear "button" but don't know it's for editing. They must guess or skip it entirely.

**Testing**: Use NVDA/VoiceOver—focus button and hear only "button" announced.

### Remediation

**BEFORE**:
```tsx
<button onClick={handleEdit} className="icon-button">
  <EditIcon />
</button>
```

**AFTER** (Option 1: aria-label):
```tsx
<button
  onClick={handleEdit}
  className="icon-button"
  aria-label="Edit profile"
>
  <EditIcon aria-hidden="true" />
</button>
```

**AFTER** (Option 2: Visually hidden text):
```tsx
<button onClick={handleEdit} className="icon-button">
  <EditIcon aria-hidden="true" />
  <span className="sr-only">Edit profile</span>
</button>
```

**Changes**:
1. ✅ Added `aria-label="Edit profile"` for accessible name
2. ✅ Added `aria-hidden="true"` to icon (prevents double announcement)
3. ✅ Screen readers now announce "Edit profile, button"

**Which approach?**
- Use `aria-label` for simple descriptions
- Use visually hidden text if you need internationalization support (i18n)

**Pattern for all icon buttons**:
```tsx
// Edit
<button aria-label="Edit profile"><EditIcon aria-hidden="true" /></button>

// Delete
<button aria-label="Delete item"><DeleteIcon aria-hidden="true" /></button>

// Close
<button aria-label="Close dialog"><CloseIcon aria-hidden="true" /></button>

// Menu
<button aria-label="Open menu" aria-expanded={isOpen}>
  <MenuIcon aria-hidden="true" />
</button>
```
```

---

### Example Finding 5: Form Errors Not Associated

```markdown
## A11Y-5: Form validation errors not associated with fields

**File**: src/components/RegistrationForm.tsx:123
**Severity**: HIGH
**Confidence**: 95%
**WCAG**: 3.3.1 Error Identification (Level A), 3.3.3 Error Suggestion (Level AA)

### Evidence
```tsx
// src/components/RegistrationForm.tsx:123-145
function RegistrationForm() {
  const [errors, setErrors] = useState({});

  return (
    <form onSubmit={handleSubmit}>
      {errors.email && <div className="error">{errors.email}</div>}

      <div>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={formData.email}
          onChange={handleChange}
        />
      </div>

      {errors.password && <div className="error">{errors.password}</div>}

      <div>
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={formData.password}
          onChange={handleChange}
        />
      </div>
    </form>
  );
}
```

### Issue
Validation error messages are displayed but not programmatically associated with their input fields:

1. **Not associated**: Error message has no `id` linked via `aria-describedby`
2. **Not announced**: Screen readers don't announce errors when focusing field
3. **No aria-invalid**: Field doesn't indicate it has an error state
4. **No role="alert"**: Error not announced when it appears

**User impact**: Screen reader users don't know which fields have errors or what's wrong. They submit form repeatedly without understanding validation failures.

**Testing**: Use NVDA—focus on email field after validation error. Only "Email, edit text" is announced, not the error message.

### Remediation

**BEFORE**:
```tsx
{errors.email && <div className="error">{errors.email}</div>}

<div>
  <label htmlFor="email">Email</label>
  <input
    id="email"
    type="email"
    value={formData.email}
    onChange={handleChange}
  />
</div>
```

**AFTER**:
```tsx
<div>
  <label htmlFor="email">Email</label>
  <input
    id="email"
    type="email"
    value={formData.email}
    onChange={handleChange}
    aria-invalid={!!errors.email}
    aria-describedby={errors.email ? 'email-error' : undefined}
  />
  {errors.email && (
    <div id="email-error" className="error" role="alert">
      {errors.email}
    </div>
  )}
</div>
```

**Changes**:
1. ✅ Moved error message below input (better visual flow)
2. ✅ Added `id="email-error"` to error div
3. ✅ Added `aria-describedby="email-error"` to input
4. ✅ Added `aria-invalid={!!errors.email}` to mark field as invalid
5. ✅ Added `role="alert"` so error is announced when it appears
6. ✅ Screen readers now announce: "Email, edit text, invalid, [error message]"

**Complete form pattern with error summary**:
```tsx
function RegistrationForm() {
  const [errors, setErrors] = useState({});

  return (
    <form onSubmit={handleSubmit}>
      {/* Error summary at top */}
      {Object.keys(errors).length > 0 && (
        <div role="alert" className="error-summary">
          <h2>Please fix the following errors:</h2>
          <ul>
            {Object.entries(errors).map(([field, message]) => (
              <li key={field}>
                <a href={`#${field}`}>{message}</a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Email field */}
      <div>
        <label htmlFor="email">
          Email <span aria-label="required">*</span>
        </label>
        <input
          id="email"
          type="email"
          value={formData.email}
          onChange={handleChange}
          required
          aria-required="true"
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? 'email-error' : 'email-help'}
        />
        <div id="email-help" className="help-text">
          We'll never share your email
        </div>
        {errors.email && (
          <div id="email-error" className="error" role="alert">
            {errors.email}
          </div>
        )}
      </div>

      {/* Password field */}
      <div>
        <label htmlFor="password">
          Password <span aria-label="required">*</span>
        </label>
        <input
          id="password"
          type="password"
          value={formData.password}
          onChange={handleChange}
          required
          aria-required="true"
          aria-invalid={!!errors.password}
          aria-describedby={errors.password ? 'password-error' : 'password-help'}
        />
        <div id="password-help" className="help-text">
          Must be at least 8 characters
        </div>
        {errors.password && (
          <div id="password-error" className="error" role="alert">
            {errors.password}
          </div>
        )}
      </div>

      <button type="submit">Create Account</button>
    </form>
  );
}
```
```

---

### Example Finding 6: Dynamic Status Not Announced

```markdown
## A11Y-6: Loading and success states not announced to screen readers

**File**: src/components/SaveButton.tsx:34
**Severity**: MED
**Confidence**: 90%
**WCAG**: 4.1.3 Status Messages (Level AA)

### Evidence
```tsx
// src/components/SaveButton.tsx:34-42
function SaveButton({ onSave }) {
  const [status, setStatus] = useState('idle');

  return (
    <div>
      <button onClick={handleSave} disabled={status === 'saving'}>
        {status === 'saving' ? 'Saving...' : 'Save'}
      </button>
      {status === 'saved' && <div className="success">Saved successfully!</div>}
      {status === 'error' && <div className="error">Failed to save</div>}
    </div>
  );
}
```

### Issue
Status messages (saving, success, error) change dynamically but are not announced to screen readers:

1. **No live region**: Status messages lack `aria-live` attribute
2. **Not announced**: Screen reader users don't hear status changes
3. **Visual only**: Users relying on assistive tech miss feedback

**User impact**: Screen reader users click Save but don't know if it succeeded or failed. They may navigate away thinking it worked, or click multiple times.

**Testing**: Use NVDA—click Save button and listen. You'll hear "Saving... button" but not the success message that appears.

### Remediation

**BEFORE**:
```tsx
<div>
  <button onClick={handleSave} disabled={status === 'saving'}>
    {status === 'saving' ? 'Saving...' : 'Save'}
  </button>
  {status === 'saved' && <div className="success">Saved successfully!</div>}
  {status === 'error' && <div className="error">Failed to save</div>}
</div>
```

**AFTER**:
```tsx
<div>
  <button
    onClick={handleSave}
    disabled={status === 'saving'}
    aria-busy={status === 'saving'}
  >
    {status === 'saving' ? 'Saving...' : 'Save'}
  </button>

  {/* Live region for status announcements */}
  <div
    role="status"
    aria-live="polite"
    aria-atomic="true"
    className="sr-only"
  >
    {status === 'saving' && 'Saving your changes...'}
    {status === 'saved' && 'Changes saved successfully'}
    {status === 'error' && 'Failed to save changes. Please try again.'}
  </div>

  {/* Visual feedback (not announced since live region handles it) */}
  {status === 'saved' && (
    <div className="success" aria-hidden="true">
      ✓ Saved successfully!
    </div>
  )}
  {status === 'error' && (
    <div className="error" role="alert">
      Failed to save
    </div>
  )}
</div>
```

**Changes**:
1. ✅ Added `aria-busy={status === 'saving'}` to button
2. ✅ Created live region with `role="status"` and `aria-live="polite"`
3. ✅ Used `aria-atomic="true"` to announce full message
4. ✅ Made live region visually hidden but accessible (sr-only)
5. ✅ Visual success message has `aria-hidden="true"` (avoid double announcement)
6. ✅ Error message uses `role="alert"` (higher priority than status)

**aria-live values**:
- `polite`: Announced at next opportunity (use for status updates)
- `assertive`: Announced immediately (use for errors, warnings)

**Pattern for different statuses**:
```tsx
// Loading
<div role="status" aria-live="polite">Loading results...</div>

// Success
<div role="status" aria-live="polite">Operation completed successfully</div>

// Error (more urgent)
<div role="alert" aria-live="assertive">Error: Unable to complete operation</div>

// Progress
<div
  role="progressbar"
  aria-valuenow={progress}
  aria-valuemin={0}
  aria-valuemax={100}
  aria-label="Upload progress"
>
  {progress}%
</div>
```
```

---

### Example Finding 7: Accordion Missing ARIA States

```markdown
## A11Y-7: Accordion component missing proper ARIA attributes

**File**: src/components/FAQ.tsx:56
**Severity**: MED
**Confidence**: 85%
**WCAG**: 4.1.2 Name, Role, Value (Level A)

### Evidence
```tsx
// src/components/FAQ.tsx:56-68
function AccordionItem({ title, content }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="accordion-item">
      <button
        className="accordion-trigger"
        onClick={() => setIsOpen(!isOpen)}
      >
        {title}
      </button>
      {isOpen && <div className="accordion-content">{content}</div>}
    </div>
  );
}
```

### Issue
Accordion component lacks proper ARIA attributes to communicate state:

1. **No aria-expanded**: Button doesn't indicate whether panel is open/closed
2. **No aria-controls**: Button not associated with content panel
3. **No unique IDs**: Cannot programmatically link trigger and panel
4. **No region role**: Panel not marked as collapsible region

**User impact**: Screen reader users don't know if accordion is expanded or collapsed. Announcement is just "FAQ item 1, button" with no state information.

**Testing**: Use NVDA—focus on accordion button. You'll hear "button" but not whether the panel is open or closed.

### Remediation

**BEFORE**:
```tsx
function AccordionItem({ title, content }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="accordion-item">
      <button
        className="accordion-trigger"
        onClick={() => setIsOpen(!isOpen)}
      >
        {title}
      </button>
      {isOpen && <div className="accordion-content">{content}</div>}
    </div>
  );
}
```

**AFTER**:
```tsx
import { useId } from 'react';

function AccordionItem({ title, content }) {
  const [isOpen, setIsOpen] = useState(false);
  const contentId = useId();

  return (
    <div className="accordion-item">
      <h3>
        <button
          className="accordion-trigger"
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          aria-controls={contentId}
        >
          {title}
        </button>
      </h3>
      {isOpen && (
        <div
          id={contentId}
          className="accordion-content"
          role="region"
          aria-labelledby={`${contentId}-trigger`}
        >
          {content}
        </div>
      )}
    </div>
  );
}
```

**Changes**:
1. ✅ Added `aria-expanded={isOpen}` to button (announces state)
2. ✅ Generated unique ID with `useId()` hook
3. ✅ Added `aria-controls={contentId}` to link button and panel
4. ✅ Added `role="region"` to content panel
5. ✅ Wrapped button in `<h3>` for proper heading hierarchy
6. ✅ Screen readers now announce: "FAQ item 1, button, collapsed/expanded"

**Complete accordion with keyboard navigation**:
```tsx
function Accordion({ items }) {
  const [openIndex, setOpenIndex] = useState(null);

  return (
    <div className="accordion">
      {items.map((item, index) => (
        <AccordionItem
          key={index}
          title={item.title}
          content={item.content}
          isOpen={openIndex === index}
          onToggle={() => setOpenIndex(openIndex === index ? null : index)}
        />
      ))}
    </div>
  );
}

function AccordionItem({ title, content, isOpen, onToggle }) {
  const contentId = useId();
  const triggerId = useId();

  return (
    <div className="accordion-item">
      <h3>
        <button
          id={triggerId}
          className="accordion-trigger"
          onClick={onToggle}
          aria-expanded={isOpen}
          aria-controls={contentId}
        >
          <span className="accordion-title">{title}</span>
          <span className="accordion-icon" aria-hidden="true">
            {isOpen ? '−' : '+'}
          </span>
        </button>
      </h3>
      {isOpen && (
        <div
          id={contentId}
          className="accordion-content"
          role="region"
          aria-labelledby={triggerId}
        >
          {content}
        </div>
      )}
    </div>
  );
}
```

**Testing checklist**:
- [ ] Button announces "expanded" or "collapsed"
- [ ] Screen reader can navigate to panel content
- [ ] Keyboard can open/close with Enter/Space
- [ ] Only one panel open at a time (if single-select)
```

---

## Step 10: False Positives Welcome

Not every finding is a bug:

1. **Decorative icons**: `aria-hidden="true"` is correct for purely decorative icons
2. **Intentional non-focusable**: Sometimes `tabIndex={-1}` is needed (e.g., programmatic focus only)
3. **Complex ARIA patterns**: Some widgets require non-obvious ARIA (tabs, trees, grids)
4. **Framework-generated**: Some ARIA may be added by frameworks automatically
5. **Already accessible**: Native elements may not need extra ARIA

**When in doubt, prefer native HTML elements over custom implementations.**

---

## Testing Tools

### Manual Testing
1. **Keyboard**: Tab through entire UI, use Enter/Space, try Escape
2. **Screen reader**:
   - Windows: NVDA (free), JAWS (paid)
   - Mac: VoiceOver (built-in, Cmd+F5)
   - Mobile: TalkBack (Android), VoiceOver (iOS)

### Automated Tools
1. **Browser extensions**:
   - axe DevTools (Chrome/Firefox)
   - WAVE (Chrome/Firefox)
   - Lighthouse (Chrome DevTools)

2. **CI integration**:
   ```bash
   # axe-core with jest
   npm install --save-dev @axe-core/react jest-axe

   # pa11y
   npm install --save-dev pa11y
   npx pa11y http://localhost:3000

   # Lighthouse CI
   npm install --save-dev @lhci/cli
   lhci autorun
   ```

3. **Component testing**:
   ```tsx
   import { axe, toHaveNoViolations } from 'jest-axe';
   expect.extend(toHaveNoViolations);

   test('Button is accessible', async () => {
     const { container } = render(<Button>Click me</Button>);
     const results = await axe(container);
     expect(results).toHaveNoViolations();
   });
   ```

### WCAG Quick Reference

**Level A** (minimum):
- 1.1.1 Non-text Content
- 1.3.1 Info and Relationships
- 2.1.1 Keyboard
- 2.1.2 No Keyboard Trap
- 4.1.2 Name, Role, Value

**Level AA** (standard):
- 1.4.3 Contrast (Minimum) - 4.5:1 for text
- 2.4.7 Focus Visible
- 3.3.3 Error Suggestion
- 4.1.3 Status Messages

**Level AAA** (enhanced):
- 1.4.6 Contrast (Enhanced) - 7:1 for text
- 2.4.8 Location (breadcrumbs)
- 3.3.6 Error Prevention

---

**Remember**: Automated tools catch ~30-40% of issues. Manual keyboard and screen reader testing is essential.
