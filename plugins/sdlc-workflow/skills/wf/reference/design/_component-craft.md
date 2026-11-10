# Building components that people adopt (`design/_component-craft.md`)

Guidance for when the thing being built is a reusable component: a design-system primitive, a library, a widget that other engineers will adopt. `implement` loads it at its build step when the deliverable is a reusable component, and `extract` offers it when it turns an existing UI into a component set. The question here is not how the component looks or moves; the moves answer that. The question is how to ship a component that people want to use.

> Load with: `design/_component-craft.md`

## The principles

1. **The developer experience is the feature.** Adoption dies at friction. Prefer a drop-in surface to a setup ritual: no required provider, no context wiring, no mandatory hook for the common path. Every prop that you require is a reason for someone to leave. Make the common case one line, and keep the advanced case reachable.
2. **Good defaults beat many options.** Most people do not customize; they take what ships. So the default easing, timing, spacing and look must be excellent, not neutral. Spend the effort on what renders when the caller passes nothing.
3. **The name is a design decision.** The name of a component or a library is the first thing that people meet. A name with character is remembered; a generic one is not. Trade a little discoverability for memorability when the thing deserves an identity.
4. **Ship something to touch.** People adopt a component after they play with it, not after they read an API table. Ship an interactive example with live snippets that copy and paste.

## Two rules that live elsewhere

- **Handle edge cases so that nobody sees them.** The rules are in [harden.md](harden.md) → In implement.
- **A dynamic collection uses a retargetable animation.** The rule is in [_motion-build.md](_motion-build.md) → Dynamic collections.

## Cohesion

A component that people love feels like one thing: its easing, its timing, its look and its name agree ([animate.md](animate.md) → Cohesion). Choose the personality of the component first, then make every default express it.

---

> *Adapted from Emil Kowalski's "building loved components" principles, used under MIT license.*
