> **Additional context needed**: brand direction, performance constraints, willingness to commit to ambitious visual effects.

Push a design to its maximum visual potential — technically extraordinary effects, committed aesthetic moves, and visual ambition that goes beyond conventional "clean" design.

---

## Register

Brand: no ceiling. Scroll-jacking when it serves the narrative. Shader backgrounds when they serve the mood. Motion that would be gratuitous in a product tool is brand expression here. The only constraint is purposefulness — everything expensive must earn its cost.

Product: overdrive in product means one extraordinary moment — a signature data visualization, a compelling onboarding animation, a navigation transition that delights without costing time. The rest stays functional.

---

## Philosophy

Overdrive is not adding more elements. It is taking fewer elements further. The difference between a well-designed surface and a technically extraordinary one is usually the depth of commitment to 2–3 choices — not the number of choices.

Before adding anything, identify the ONE thing this surface is trying to be. Then push that thing as far as the performance budget allows.

## Effects toolkit

### WebGL and shader backgrounds
```glsl
// Fragment shader: animated noise field
// Use with THREE.js ShaderMaterial or raw WebGL
// Budget: 2–4ms/frame on modern hardware, ~8ms on mid-range mobile
```
Use `@media (prefers-reduced-motion: reduce)` to replace with static gradient. Test on target hardware.

### CSS advanced effects (no JS required)
```css
/* Mesh gradient with multiple radial gradients */
background:
  radial-gradient(ellipse at 20% 50%, oklch(60% 0.2 280 / 0.6), transparent 50%),
  radial-gradient(ellipse at 80% 20%, oklch(65% 0.15 50 / 0.4), transparent 60%),
  oklch(15% 0.02 280);

/* Text with gradient fill */
.headline {
  background: linear-gradient(135deg, oklch(80% 0.15 50), oklch(65% 0.2 300));
  background-clip: text;
  -webkit-background-clip: text;
  color: transparent;
}

/* Advanced backdrop effects */
.panel {
  backdrop-filter: blur(20px) saturate(180%);
  background: oklch(98% 0.005 250 / 0.7);
}
```

### Scroll-driven animation (CSS-native, no JS)
```css
@keyframes reveal {
  from { opacity: 0; transform: translateY(32px); }
  to { opacity: 1; transform: translateY(0); }
}
.section {
  animation: reveal linear both;
  animation-timeline: view();
  animation-range: entry 0% entry 40%;
}
```

### SVG animation and morphing
```javascript
// GSAP MorphSVG or CSS path animation for shape morphing
// Budget: < 2ms/frame, works on all modern browsers
```

### Variable font axes for typographic animation
```css
@keyframes weight-pulse {
  0%, 100% { font-variation-settings: 'wght' 400; }
  50% { font-variation-settings: 'wght' 800; }
}
```

## Performance rules for overdrive

Overdrive effects must maintain 60fps on the target device class. Budget per effect:
- Simple CSS transitions: essentially free
- CSS animations (opacity, transform): < 1ms/frame
- CSS blur/saturate filters: 2–4ms/frame (test carefully on mobile)
- CSS backdrop-filter: 3–6ms/frame (avoid on lists of repeated elements)
- WebGL simple shader: 2–5ms/frame depending on complexity
- WebGL complex scene: 5–16ms/frame — measure carefully, may need quality levels

Test on actual target hardware, not just a fast developer machine. Provide a fallback.

## The one extraordinary thing

Identify the signature move before building effects:
- What is the ONE visual moment this surface is remembered for?
- What effect serves that moment and no other (WebGL, shader, scroll-reveal, variable font)?
- What is the performance cost, and is it worth it?

Execute the signature move at full quality. Everything else should recede.

## Validate

After pushing to overdrive:
- Does it perform at 60fps on mid-range mobile (Moto G Power class)?
- Is there a `prefers-reduced-motion` fallback for every animation?
- Does the extraordinary effect serve the brand, or just demonstrate capability?
- Would a user remember the experience?

## Never
- Multiple simultaneous WebGL scenes competing for GPU time
- `backdrop-filter` on repeated elements in a list (one per list item = severe performance hit)
- Overdrive effects that block or delay user interaction
- Visual effects without a purpose beyond technical demonstration
