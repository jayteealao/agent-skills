---
name: review:ux-copy
description: Review user-facing text for clarity, consistency, actionability, and helpful error recovery
usage: /review:ux-copy [SCOPE] [TARGET] [PATHS] [CONTEXT]
arguments:
  - name: SCOPE
    description: 'Review scope: pr (default) | worktree | diff | repo | file'
    required: false
    default: pr
  - name: TARGET
    description: 'Target specifier: PR number, branch name, commit hash, or file path'
    required: false
  - name: PATHS
    description: 'Optional glob patterns to filter files (e.g., "src/components/**", "locales/**")'
    required: false
  - name: CONTEXT
    description: 'Additional context: product tone (professional/friendly/playful), target user (developers/consumers/business), error-handling philosophy'
    required: false
examples:
  - command: /review:ux-copy pr 123
    description: Review PR #123 for UX copy issues
  - command: /review:ux-copy worktree "src/components/**"
    description: Review component copy changes
  - command: /review:ux-copy diff main..feature "CONTEXT: Friendly tone, consumer audience, always provide next steps in errors"
    description: Review UX copy diff with tone and error philosophy
---

# UX Copy Review

You are a UX copy reviewer improving clarity and consistency of user-facing text (errors, empty states, labels, prompts) to help users recover from errors and accomplish their goals.

## Step 0: Infer SESSION_SLUG if Needed

If `SESSION_SLUG` is not provided:
1. Read `.claude/README.md`
2. Extract the **last session** from the table (most recent entry)
3. Use that session's slug as `SESSION_SLUG`

## Step 1: Determine Review Scope

Based on `SCOPE` parameter:

- **`pr`** (default): Review changed user-facing text in the specified PR
- **`worktree`**: Review uncommitted text changes
- **`diff`**: Review diff between two refs
- **`file`**: Review specific files with user-facing text
- **`repo`**: Review all user-facing text

If `PATHS` is provided, filter to matching files.

## Step 2: Extract User-Facing Text

For each file in scope:

1. **Identify user-facing text**:
   - Error messages (exceptions, validation, API errors)
   - Empty states ("No items found", "Nothing here yet")
   - Button labels ("Submit", "Cancel", "Delete")
   - Form labels and placeholders
   - Success/confirmation messages
   - Loading states and progress indicators
   - Onboarding prompts and tooltips
   - Help text and documentation links

2. **Read surrounding context** (not just the text)

3. **Check for UX copy patterns**:
   - Generic error messages ("Something went wrong")
   - Missing next steps
   - Inconsistent terminology
   - Blame language ("You did X wrong")
   - Technical jargon for non-technical users

**Critical**: Always read the **context** where text appears to understand user journey and state.

## Step 3: Parse CONTEXT (if provided)

Extract UX copy requirements from `CONTEXT` parameter:

- **Product tone**: Professional, friendly, playful, formal, casual
- **Target user**: Developers, consumers, business users, admins
- **Error philosophy**: Always show next steps, provide support links, blame-free
- **Terminology**: Product-specific terms, feature names
- **Localization**: i18n-ready (avoid concatenation, gendered language)

Example:
```
CONTEXT: Friendly but professional tone, consumer audience (non-technical), always provide actionable next steps in errors, i18n support required
```

## Step 4: UX Copy Checklist Review

For each piece of user-facing text, systematically check:

### 4.1 Clarity and Plain Language
- [ ] Avoids jargon and technical terms for non-technical users?
- [ ] Uses active voice ("Save changes" not "Changes will be saved")?
- [ ] Specific rather than vague ("3 errors" not "Some errors")?
- [ ] Short sentences (1-2 clauses)?
- [ ] Familiar words (not obscure vocabulary)?

**Red flags:**
- Technical jargon for consumer audience
- Passive voice ("Error was encountered")
- Vague descriptions ("Something happened")
- Long, complex sentences
- Obscure vocabulary

**Clarity examples:**
```typescript
// ❌ BAD: Technical jargon
throw new Error('HTTP 403: Insufficient OAuth2 scope for resource access');

// ✅ GOOD: Plain language
throw new Error("You don't have permission to access this file. Ask the owner to share it with you.");

// ❌ BAD: Vague
const error = 'An error occurred while processing your request';

// ✅ GOOD: Specific
const error = 'Unable to upload photo. File size exceeds 10MB limit.';

// ❌ BAD: Passive voice
<button>Changes will be saved</button>

// ✅ GOOD: Active voice
<button>Save changes</button>

// ❌ BAD: Complex sentence
const message = 'Due to the fact that the system was unable to verify your credentials, which may have been entered incorrectly or may have expired, access to the requested resource has been denied.';

// ✅ GOOD: Short, clear
const message = "We couldn't verify your credentials. They may be incorrect or expired. Please sign in again.";

// ❌ BAD: Obscure vocabulary
<p>Endeavor to authenticate prior to proceeding with utilization of this functionality.</p>

// ✅ GOOD: Familiar words
<p>Please sign in to use this feature.</p>
```

### 4.2 Actionability and Next Steps
- [ ] Errors explain what happened AND what to do next?
- [ ] Buttons use verb + noun ("Delete account" not "Delete")?
- [ ] Includes retry guidance when applicable?
- [ ] Links to help/docs for complex errors?
- [ ] CTA (call-to-action) clear and specific?

**Red flags:**
- "Something went wrong" without explanation or recovery
- Generic "Error" or "Failed" messages
- Dead-end error states
- Buttons with only "OK" or "Cancel"
- No link to support or docs

**Actionability examples:**
```typescript
// ❌ BAD: No next steps
if (!user) {
  return <div>Error: Unauthorized</div>;
}

// ✅ GOOD: Explains what to do
if (!user) {
  return (
    <div>
      <h2>You're not signed in</h2>
      <p>Sign in to view this page.</p>
      <button onClick={signIn}>Sign in</button>
      <a href="/help/sign-in">Need help?</a>
    </div>
  );
}

// ❌ BAD: Generic error
catch (error) {
  showError('Something went wrong');
}

// ✅ GOOD: Specific error with recovery
catch (error) {
  if (error.code === 'NETWORK_ERROR') {
    showError(
      'Unable to connect to server. Check your internet connection and try again.',
      { action: 'Retry', onAction: retry }
    );
  } else if (error.code === 'RATE_LIMIT') {
    showError(
      'Too many requests. Wait a minute and try again.',
      { action: 'Try again in 60s', onAction: retryAfter(60) }
    );
  } else {
    showError(
      `Upload failed: ${error.message}`,
      {
        action: 'Contact support',
        onAction: () => window.open('/support')
      }
    );
  }
}

// ❌ BAD: Vague button
<button onClick={deleteAccount}>Delete</button>

// ✅ GOOD: Verb + noun
<button onClick={deleteAccount}>Delete account</button>

// ❌ BAD: No CTA
<EmptyState>
  <p>You don't have any projects yet.</p>
</EmptyState>

// ✅ GOOD: Clear CTA
<EmptyState>
  <p>You don't have any projects yet.</p>
  <button onClick={createProject}>Create your first project</button>
  <a href="/help/projects">Learn about projects</a>
</EmptyState>

// ❌ BAD: Dead-end error
function PaymentError() {
  return <div>Payment failed</div>;
}

// ✅ GOOD: Recovery path
function PaymentError({ error, onRetry }: Props) {
  return (
    <div>
      <h2>Payment failed</h2>
      <p>Your card was declined ({error.declineCode}).</p>
      <ul>
        <li>Check your card details are correct</li>
        <li>Ensure you have sufficient funds</li>
        <li>Contact your bank for more information</li>
      </ul>
      <button onClick={onRetry}>Try again</button>
      <button onClick={useDifferentCard}>Use different card</button>
      <a href="/support">Contact support</a>
    </div>
  );
}
```

### 4.3 Consistency and Terminology
- [ ] Same feature/concept called the same thing everywhere?
- [ ] Button/link text follows consistent pattern?
- [ ] Capitalization consistent (Title Case vs Sentence case)?
- [ ] Punctuation consistent (periods in sentences, not in buttons)?
- [ ] Dates/times formatted consistently?

**Red flags:**
- "Workspace" in one place, "Organization" in another
- Mixed capitalization (Save vs save)
- Inconsistent date formats (MM/DD/YYYY vs DD-MM-YYYY)
- Some buttons have periods, others don't

**Consistency examples:**
```typescript
// ❌ BAD: Inconsistent terminology
<nav>
  <a href="/workspace">My Workspace</a>  {/* ❌ "Workspace" */}
</nav>

<h1>Organization Settings</h1>  {/* ❌ "Organization" */}

<button>Leave team</button>  {/* ❌ "Team" */}

// ✅ GOOD: Consistent terminology
<nav>
  <a href="/workspace">My Workspace</a>  {/* ✅ "Workspace" everywhere */}
</nav>

<h1>Workspace Settings</h1>

<button>Leave workspace</button>

// ❌ BAD: Mixed capitalization
<button>Save Changes</button>  {/* Title Case */}
<button>Cancel changes</button>  {/* Sentence case */}

// ✅ GOOD: Consistent capitalization
<button>Save changes</button>  {/* Sentence case for buttons */}
<button>Cancel</button>

// ❌ BAD: Inconsistent date formats
<p>Created: 12/31/2023</p>  {/* MM/DD/YYYY */}
<p>Updated: 2024-01-15</p>  {/* YYYY-MM-DD */}

// ✅ GOOD: Consistent format
<p>Created: Jan 15, 2024</p>  {/* Month DD, YYYY */}
<p>Updated: Jan 20, 2024</p>

// Use Intl.DateTimeFormat for localization
const formatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric'
});

// ❌ BAD: Inconsistent punctuation
const errors = [
  'Email is required.',  // Period
  'Password must be at least 8 characters',  // No period
  'Username already taken!'  // Exclamation
];

// ✅ GOOD: Consistent punctuation
const errors = [
  'Email is required',  // No punctuation for short errors
  'Password must be at least 8 characters',
  'Username already taken'
];

// Use periods only for multi-sentence messages
const multiSentence = 'Your session has expired. Please sign in again.';
```

### 4.4 Tone and Voice
- [ ] Matches product tone (friendly vs formal)?
- [ ] Avoids blame language ("You entered..." → "Email address...")?
- [ ] Empathetic in error states?
- [ ] Celebrates successes appropriately?
- [ ] Consistent personality across product?

**Red flags:**
- Blame language ("You failed to...")
- Overly technical/cold tone for consumer product
- Inconsistent tone (friendly in one place, formal in another)
- Apologizing excessively ("Sorry, sorry, sorry")

**Tone examples:**
```typescript
// ❌ BAD: Blame language
const error = "You entered an invalid email address";
const error = "You forgot to fill out the required fields";

// ✅ GOOD: Neutral, helpful
const error = "Email address format is invalid";
const error = "Please fill out all required fields";

// ❌ BAD: Cold, technical (for consumer app)
<div>Authentication failure. Credential verification unsuccessful.</div>

// ✅ GOOD: Friendly, clear
<div>
  <h2>We couldn't sign you in</h2>
  <p>Your email or password is incorrect. Try again?</p>
</div>

// ❌ BAD: Excessive apology
const error = "Sorry! We're so sorry, but something went wrong. We're really sorry about this.";

// ✅ GOOD: Brief, empathetic
const error = "Something went wrong on our end. We're working on it.";

// ❌ BAD: Overly casual for enterprise product
<button>Yeet this file</button>

// ✅ GOOD: Professional but friendly
<button>Delete file</button>

// ❌ BAD: Inconsistent tone
<SuccessMessage>
  Excellent! Your account has been successfully created! 🎉
</SuccessMessage>

<ErrorMessage>
  Error code 4523: Database connection failure. Contact system administrator.
</ErrorMessage>

// ✅ GOOD: Consistent tone
<SuccessMessage>
  Account created! Check your email to verify your address.
</SuccessMessage>

<ErrorMessage>
  We couldn't create your account. Please try again or contact support if this keeps happening.
</ErrorMessage>

// ✅ GOOD: Celebrate wins (consumer app)
function UploadSuccess() {
  return (
    <div>
      <CheckIcon />
      <h2>Photo uploaded!</h2>
      <p>Your photo is now live. Share it with friends.</p>
      <button>Share</button>
    </div>
  );
}

// ✅ GOOD: Understated success (enterprise app)
function RecordSaved() {
  return (
    <div>
      <CheckIcon />
      <span>Record saved</span>
    </div>
  );
}
```

### 4.5 Specificity and Context
- [ ] Specific counts instead of vague ("3 errors" not "errors")?
- [ ] Names things explicitly ("profile.jpg" not "file")?
- [ ] Provides context for actions (what will happen)?
- [ ] Shows progress with specific updates?

**Red flags:**
- "Some items" instead of "3 items"
- "File" instead of filename
- "Delete" without explaining what gets deleted
- "Loading..." without indicating what's loading

**Specificity examples:**
```typescript
// ❌ BAD: Vague
<p>You have errors in your form</p>

// ✅ GOOD: Specific count
<p>3 errors in your form</p>

// ❌ BAD: Generic reference
<ConfirmDialog>
  <p>Are you sure you want to delete this item?</p>
</ConfirmDialog>

// ✅ GOOD: Specific reference
<ConfirmDialog>
  <p>Delete "Q4 Sales Report.pdf"?</p>
  <p>This can't be undone.</p>
</ConfirmDialog>

// ❌ BAD: No context
<button onClick={archive}>Archive</button>

// ✅ GOOD: Context provided
<button onClick={archive}>
  Archive project (hides from list, doesn't delete)
</button>

// ❌ BAD: Generic loading
<div>Loading...</div>

// ✅ GOOD: Specific loading
<div>Loading your photos...</div>
<div>Uploading 3 of 10 files...</div>
<div>Processing payment...</div>

// ❌ BAD: Vague progress
<ProgressBar value={progress} />
<p>Processing...</p>

// ✅ GOOD: Specific progress
<ProgressBar value={progress} />
<p>Uploading photos: {uploaded} of {total} ({progress}%)</p>
<p>Estimated time: {estimatedSeconds}s remaining</p>

// ❌ BAD: Generic empty state
<EmptyState>
  <p>No items</p>
</EmptyState>

// ✅ GOOD: Specific empty state with context
<EmptyState>
  <p>No photos in "Vacation 2024"</p>
  <button>Add photos</button>
</EmptyState>
```

### 4.6 Localization Readiness
- [ ] No string concatenation (breaks in other languages)?
- [ ] No gendered language ("he/she" → "they")?
- [ ] Placeholders use ICU MessageFormat?
- [ ] No assumptions about word order?
- [ ] No embedded punctuation in strings?

**Red flags:**
- String concatenation: `"Hello " + name`
- Gendered: "he submitted his request"
- Hard-coded word order: "Delete" + filename
- Punctuation: `message + "."`

**Localization examples:**
```typescript
// ❌ BAD: String concatenation
const message = "Hello " + userName + "!";
// Problem: Word order varies by language

// ✅ GOOD: Use template with placeholder
const message = t('greeting', { name: userName });
// en: "Hello {name}!"
// es: "¡Hola {name}!"
// ja: "{name}さん、こんにちは"

// ❌ BAD: Gendered language
const message = `${user.name} submitted his request`;

// ✅ GOOD: Gender-neutral
const message = `${user.name} submitted a request`;
const message = `${user.name} submitted their request`;

// ❌ BAD: Hard-coded plurals
const message = items.length + " item(s)";

// ✅ GOOD: Use plural rules (ICU MessageFormat)
const message = t('itemCount', { count: items.length });
// en.json:
// "itemCount": "{count, plural, =0 {No items} one {1 item} other {# items}}"

// ❌ BAD: Embedded punctuation
const error = t('error.required') + ".";
// Breaks if language doesn't use periods

// ✅ GOOD: Punctuation in translation
const error = t('error.required');
// en: "This field is required."
// ja: "この項目は必須です。"

// ❌ BAD: Assumes word order
<p>Delete {fileName}?</p>

// ✅ GOOD: Use placeholder
<p>{t('confirmDelete', { fileName })}</p>
// en: "Delete {fileName}?"
// ja: "{fileName}を削除しますか？"

// ❌ BAD: Concatenated sentence
const message = t('uploaded') + " " + fileName;

// ✅ GOOD: Single template
const message = t('uploadComplete', { fileName });
// en: "Uploaded {fileName}"
// es: "Se subió {fileName}"
```

### 4.7 Accessibility Tie-in
- [ ] Error text associated with form fields (aria-describedby)?
- [ ] Status messages announced (aria-live)?
- [ ] Button text descriptive (not just "Click here")?
- [ ] Not relying only on color for meaning?
- [ ] Alt text for icon-based messages?

**Red flags:**
- Error shown but not associated with field
- Success toast not announced to screen readers
- Icon-only error without text
- Color-only indication (red text without icon/text)

**Accessibility examples:**
```tsx
// ❌ BAD: Error not associated
<div>
  <label>Email</label>
  <input type="email" />
  {error && <div className="error">{error}</div>}
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
    <div id="email-error" role="alert">
      {error}
    </div>
  )}
</div>

// ❌ BAD: Status not announced
<div className="success">✓ Saved</div>

// ✅ GOOD: Status announced to screen readers
<div role="status" aria-live="polite">
  ✓ Saved
</div>

// ❌ BAD: Icon-only error
<div className="error">
  <ErrorIcon />  {/* No text */}
</div>

// ✅ GOOD: Icon with text
<div className="error">
  <ErrorIcon aria-hidden="true" />
  <span>Upload failed</span>
</div>

// ❌ BAD: Color-only indication
<p style={{ color: 'red' }}>Invalid</p>

// ✅ GOOD: Text + icon + color
<p className="error">
  <ErrorIcon aria-hidden="true" />
  <span>Invalid email address</span>
</p>
```

## Step 5: Generate Findings

For each UX copy issue discovered:

**Finding format:**
```
## UX-{N}: {Short title}
**File**: {file_path}:{line_number}
**Severity**: HIGH | MED | LOW | NIT
**Confidence**: 95% | 80% | 60%
**Category**: Clarity | Actionability | Consistency | Tone | Specificity | Localization | Accessibility

### Evidence
{Code snippet showing the text}

### Issue
{Description of UX copy problem and user impact}

### Remediation
{Before and after copy with explanation}

### User Impact
{How this affects user understanding and recovery}
```

**Severity guidelines:**
- **HIGH**: Prevents user from recovering from error or understanding critical action
- **MED**: Confusing or inconsistent, degrades UX
- **LOW**: Minor clarity improvement
- **NIT**: Style/consistency (important for polish)

## Step 6: Write Report

Create report at `.claude/<SESSION_SLUG>/reviews/ux-copy_<timestamp>.md`

---

**Remember**: Every word is an interface. Clear, helpful copy turns frustrating errors into recoverable moments.
