# Building loved components (`_component-craft.md`)

Shared guidance for when the thing being built is a **reusable component** — a design-system
primitive, a library, a widget other engineers will adopt — rather than a one-off screen.
Loaded by `implement` (at its build step, when the deliverable is a reusable component) and
offered by `extract` (when systematizing an existing UI into a component set). The question here
is not *"how should this look or move"* — that is the design transforms — but *"how do you ship a
component people love using."*

> Load with: `design/_component-craft.md`

Adapted from Emil Kowalski's "building loved components" principles — drawn from shipping Sonner
(13M+ weekly downloads) — used under MIT license.

## The principles

1. **Developer experience is the feature.** Adoption dies at friction. Prefer a drop-in surface
   over a setup ritual — no required provider, no context wiring, no mandatory hooks to make the
   happy path work: `<Toaster />` once, `toast()` from anywhere. Every prop you *require* is a
   reason someone bounces; make the common case a one-liner and the advanced case reachable.

2. **Good defaults beat many options.** Most people never customize — they take what ships. So the
   default easing, timing, spacing, and visual design must be *excellent*, not neutral. Options
   serve the few; defaults serve everyone. Spend the taste budget on what renders when the caller
   passes nothing.

3. **Naming creates identity.** A component's or library's name is the first design decision users
   meet. A memorable, characterful name ("Sonner", French for "to ring") earns trust and recall
   that "react-toast" never will. Trade a little discoverability for memorability when the thing
   deserves an identity.

4. **Build something people can touch.** A component is adopted after someone *plays* with it, not
   from an API table. Ship an interactive doc/example surface with live, copy-paste-ready snippets;
   letting people feel the defaults and the motion before they install is the highest-leverage
   adoption work there is.

## The two that live elsewhere (cross-reference, don't restate)

- **Handle edge cases invisibly** — pause timers when the tab is hidden, capture pointer events
  during a drag, fill the gaps between stacked elements so hover doesn't break. This is robustness;
  it belongs to `harden.md`. The bar: users never notice the edge case was handled, which is
  exactly right.
- **Transitions, not keyframes, for dynamic collections** — anything added or removed rapidly
  (toasts, list items) must retarget smoothly, never restart from zero. See the Interruptibility
  rules in `animate.md`.

## Cohesion

A loved component *feels* like one thing: its easing, timing, visual design — even its name — are
in harmony (see the Cohesion note in `animate.md`). Choose the component's personality first, then
make every default express it.
