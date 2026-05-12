> **Additional context needed**: brand direction, existing font choices.

Improve typography quality — font selection, scale, hierarchy, spacing, and readability.

---

## Register

Brand: expressive display typography is available and expected. Wide scale ratios (1.5×+), large size contrasts, display fonts with strong personality, mixed weights for editorial effect. Typography can be the dominant visual element.

Product: functional type scale for dense information. Tighter ratios (1.125–1.2×), one or two weights, system fonts are legitimate. The type scale serves the information architecture, not the brand voice.

---

## Font selection (brand register)

Write three concrete brand-voice words first (not "modern" — think physical objects, textures, contexts). Then find a font that is that object, not one that looks designed.

**Reflex-reject list** (training-data defaults — look further):
Fraunces · Newsreader · Lora · Crimson Pro · Playfair Display · Cormorant · Syne · IBM Plex · Space Mono · Space Grotesk · Inter · DM Sans · DM Serif · Outfit · Plus Jakarta Sans · Instrument Sans · Instrument Serif

Browse a real catalog (Google Fonts, Pangram Pangram, Future Fonts, Adobe Fonts, ABC Dinamo, Klim) with the brand-voice words in mind. Reject the first thing that "looks designy."

Font resources:
- `https://fonts.google.com/` — free, wide selection
- `https://fonts.adobe.com/` — requires Creative Cloud subscription
- `https://pangrampangram.com/` — distinctive contemporary fonts
- `https://klim.co.nz/` — editorial and book-quality Latin typefaces
- `https://abcdinamo.com/` — contemporary type with strong identity

**Font pairing rules**:
- Two families minimum only when the voice needs it. One well-chosen family with committed weight/size contrast is stronger than a timid display+body pair.
- Display serif + sans body: magazine shape, works for editorial/luxury brand.
- One committed sans: correct for tech, fintech, tools.
- Rule-breaking is available (mono-only, display-only) when it matches the brand voice.

## Type scale

**Brand**: modular scale with ≥1.25 ratio between steps. Fluid with `clamp()` for headings.

```css
--type-xs: clamp(0.75rem, 0.7rem + 0.25vw, 0.875rem);
--type-sm: clamp(0.875rem, 0.8rem + 0.375vw, 1rem);
--type-base: clamp(1rem, 0.9rem + 0.5vw, 1.125rem);
--type-lg: clamp(1.25rem, 1.1rem + 0.75vw, 1.5rem);
--type-xl: clamp(1.5rem, 1.3rem + 1vw, 2rem);
--type-2xl: clamp(2rem, 1.6rem + 2vw, 3rem);
--type-3xl: clamp(2.5rem, 2rem + 2.5vw, 4rem);
--type-display: clamp(3rem, 2rem + 5vw, 7rem);
```

**Product**: fixed rem scale. Tight ratio (1.125–1.2).

```css
--type-xs: 0.75rem;   /* 12px */
--type-sm: 0.875rem;  /* 14px */
--type-base: 1rem;    /* 16px */
--type-lg: 1.125rem;  /* 18px */
--type-xl: 1.25rem;   /* 20px */
--type-2xl: 1.5rem;   /* 24px */
--type-3xl: 1.875rem; /* 30px */
```

## Hierarchy

Heading levels must have visible contrast. If h1 and h2 look similar:
- Increase size difference (h1 should be at least 1.5× h2)
- Add weight contrast (h1 at 700–900, body at 400)
- Add color or tracking difference

Three visible tiers minimum: primary (heading), secondary (subheading/label), tertiary (body/caption).

## Spacing and readability

```css
/* Body text: comfortable reading */
font-size: 1rem; /* 16px minimum */
line-height: 1.65;
max-width: 65ch; /* ~65 characters per line */

/* Display headings */
line-height: 1.1–1.2;
letter-spacing: -0.02em to -0.04em; /* tighten at large sizes */

/* Small labels and captions */
line-height: 1.4;
letter-spacing: 0 to 0.02em; /* can open slightly */
```

**On dark backgrounds**: add 0.05–0.1 to line-height. Light type appears lighter weight and needs more breathing room.

## Common problems and fixes

**Flat hierarchy**: increase size ratio between heading and body. Add weight contrast.
**Too much font variety**: reduce to 2 sizes per context (heading + body), or 1 family.
**Poor readability**: increase body font-size to 16px minimum. Add line-height. Reduce line length.
**Display text too tight**: tighten tracking at display sizes (−0.03 em at 48px+).
**Generic font choice**: apply the reflex-reject list and replace.
**Inconsistent hierarchy**: establish fixed scale tokens and apply them uniformly.

## Absolute bans

- Font sizes below 12px (captions) or 16px (body text)
- Line height below 1.4 for body text
- Lines longer than 80 characters for prose
- Justified alignment in body text (uneven word spacing)
- `font-weight: 100` (Thin) at small sizes — unreadable at normal viewport resolutions
- Using Fraunces or Cormorant for a new brand's display face without a strong register reason
