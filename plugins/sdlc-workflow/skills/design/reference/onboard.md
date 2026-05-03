Design the onboarding, empty states, and first-run experience for a feature or product — the moments when users encounter something new and decide whether to engage or abandon.

---

## Register

Brand: first impressions are product-defining. A brand site's first-run experience is the landing page itself. A portfolio's onboarding is the hero section. These are marketing moments; they should be designed with the same ambition as any other brand surface.

Product: onboarding is a teaching problem, not a decoration problem. The goal is for users to reach their "aha moment" — the point where they understand the product's value through their own use — as quickly as possible. Every element of onboarding should serve that path.

---

## Empty states

Empty states are the most overlooked UX opportunity. A "nothing here" screen is a missed chance to teach, guide, or delight.

### What a good empty state does:
1. **Explains what will appear here** — not "no data found" but "your saved items will appear here"
2. **Gives the user a path forward** — a specific action to take, not just a description
3. **Sets expectations** — shows a preview or example of what the filled state looks like
4. **Doesn't feel like an error** — visual design should feel intentional, not like a fallback

### Empty state anatomy:
- Illustration or icon (communicates what the space is for — avoid generic empty box icons)
- Heading (what this space is for)
- Description (1–2 sentences max: what it will look like when populated)
- Primary action (specific CTA that creates the first item)
- Optional: example or preview of the filled state

```html
<!-- Empty state pattern -->
<div class="empty-state">
  <div class="empty-state-icon"><!-- context-specific illustration or icon --></div>
  <h2>No projects yet</h2>
  <p>Create your first project to track its progress and collaborate with your team.</p>
  <button class="btn-primary">Create project</button>
</div>
```

### Different empty state types:
- **First-time empty** (user has never added content): welcoming, teaching, encouraging
- **Filtered empty** (search or filter returned nothing): explain the filter is active, offer to clear it
- **Error empty** (content failed to load): explain what went wrong, offer retry
- **Permissions empty** (user lacks access): explain why, offer a path to request access

## First-run experience

### Principles:
- **Show value first, ask for setup later**: let users see the product before they configure it
- **Progressive commitment**: don't require a full profile setup before the first useful action
- **Contextual tooltips over upfront tours**: trigger guidance when the user reaches a specific feature, not before
- **Skip everything**: every onboarding step must be skippable

### Patterns:

**Checklist onboarding** (for products with clear setup steps):
- 3–5 items maximum
- Show completion and progress
- Auto-advance when steps are done in the product
- Allow any order

**Empty state driven** (for creation-first products):
- Let the empty state be the onboarding
- The first-run experience is just seeing the empty state with a clear first-action CTA
- No separate onboarding flow needed

**Overlay/spotlight** (for features within an existing product):
- One spotlight at a time: highlight one element, dismiss, move to next
- User-triggered: "show me how this works" rather than auto-triggered on first load
- Skip and don't show again

### What not to do:
- Full-screen welcome modals with 5 pages before the user has seen the product
- Automatic coach mark tours that appear every session
- Mandatory profile setup before any useful action
- Generic "welcome to [product]" messaging without product-specific value proposition

## Validate

- Can a new user complete their first meaningful action without help?
- Does the empty state explain what will appear and how to get there?
- Are all onboarding steps skippable?
- Is the first-run experience showing value or demanding commitment?
